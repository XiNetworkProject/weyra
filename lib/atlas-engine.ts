"use client";
import type { Map as VectorMap } from "maplibre-gl";
import type { TileLayer } from "leaflet";
import { prepareRadarDetail, type HorizonRadarFrame } from "./horizon-radar";
export type RadarFrame = HorizonRadarFrame;
export type AtlasEngine = {
  kind: "vector" | "raster";
  fly: (lon: number, lat: number, zoom?: number) => void;
  zoom: (delta: number) => void;
  getZoom: () => number;
  project: (lon: number, lat: number) => { x: number; y: number };
  pin: (element: HTMLElement, lon: number, lat: number) => { remove: () => void };
  onMove: (handler: () => void) => () => void;
  radarFrames: (frames: RadarFrame[]) => void;
  radarFrame: (time: number | null, opacity: number, playing: boolean) => void;
  resize: () => void;
  destroy: () => void;
};
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export async function createAtlas(
  host: HTMLElement,
  signal: AbortSignal,
  onTileError: () => void,
  onRadarError: () => void,
): Promise<AtlasEngine> {
  let webgl = false;
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2");
    webgl = !!context;
    context?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {}
  if (webgl) {
    try {
      return await vectorEngine(host, signal, onTileError, onRadarError);
    } catch (error) {
      if (signal.aborted) throw error;
      host.replaceChildren();
    }
  }
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  return rasterEngine(host, signal, onTileError, onRadarError);
}

// Sharpen only the paused scan and the visible viewport. Abort on camera/frame
// changes; an incomplete optional detail layer never replaces the overview.
function detailController(update: (signal: AbortSignal) => Promise<void>, clear: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  const cancel = () => {
    clearTimeout(timer);
    controller?.abort();
    clear();
  };
  return {
    cancel,
    schedule: () => {
      cancel();
      controller = new AbortController();
      const signal = controller.signal;
      timer = setTimeout(() => {
        void update(signal).catch(() => {
          if (!signal.aborted) clear();
        });
      }, 350);
    },
  };
}

async function vectorEngine(
  host: HTMLElement,
  signal: AbortSignal,
  onTileError: () => void,
  onRadarError: () => void,
): Promise<AtlasEngine> {
  const M = await import("maplibre-gl");
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  const map = new M.Map({
    container: host,
    style: "https://tiles.openfreemap.org/styles/dark",
    center: [2.7, 50.68],
    zoom: 8,
    minZoom: 3,
    maxZoom: 17,
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
  });
  map.touchZoomRotate.disableRotation();
  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        map.off("load", ready);
        map.off("error", fail);
        signal.removeEventListener("abort", abort);
      };
      const ready = () => {
        cleanup();
        resolve();
      };
      const fail = () => {
        cleanup();
        reject(new Error("Cartographie indisponible"));
      };
      const abort = () => {
        cleanup();
        reject(new DOMException("Aborted", "AbortError"));
      };
      const timeout = setTimeout(fail, 8000);
      map.once("load", ready);
      map.once("error", fail);
      signal.addEventListener("abort", abort, { once: true });
    });
  } catch (error) {
    map.remove();
    throw error;
  }
  const ids = new Set<string>();
  let frames: RadarFrame[] = [],
    current: number | null = null,
    opacity = 0,
    playing = false;
  const showOverview = () => {
    for (const id of ids) map.setPaintProperty(id, "raster-opacity", id === "radar-" + current ? opacity : 0);
  };
  const clearDetail = () => {
    if (map.getLayer("radar-detail")) map.removeLayer("radar-detail");
    if (map.getSource("radar-detail")) map.removeSource("radar-detail");
    showOverview();
  };
  const addSource = (id: string, frame: RadarFrame, detail = false) => {
    map.addSource(id, {
      type: "raster",
      tiles: [detail ? frame.detailTiles : frame.tiles],
      tileSize: frame.tileSize,
      minzoom: detail ? frame.detailMinZoom : frame.minZoom,
      maxzoom: detail ? frame.detailMaxZoom : frame.maxZoom,
      bounds: frame.bounds,
      attribution: frame.attribution,
    });
    const before = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
    map.addLayer(
      {
        id,
        type: "raster",
        source: id,
        paint: {
          "raster-opacity": 0,
          "raster-opacity-transition": { duration: detail ? 0 : 280 },
          "raster-fade-duration": 0,
        },
      },
      before,
    );
  };
  const detail = detailController(async (abort) => {
    const frame = frames.find((f) => f.time === current);
    if (!frame || playing || opacity === 0 || map.getZoom() < frame.detailMinZoom) return;
    const b = map.getBounds();
    await prepareRadarDetail(
      frame,
      { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth(), zoom: map.getZoom() },
      abort,
    );
    if (abort.aborted) return;
    addSource("radar-detail", frame, true);
    await sourceLoaded(map, "radar-detail", abort);
    if (abort.aborted) return;
    // Immediate handoff prevents two copies of the reflectivity being stacked.
    for (const id of ids) {
      map.setPaintProperty(id, "raster-opacity-transition", { duration: 0 });
      map.setPaintProperty(id, "raster-opacity", 0);
      map.setPaintProperty(id, "raster-opacity-transition", { duration: 280 });
    }
    map.setPaintProperty("radar-detail", "raster-opacity", opacity);
  }, clearDetail);
  map.on("movestart", detail.cancel);
  map.on("moveend", detail.schedule);
  map.on("error", (event) => {
    const sourceId = "sourceId" in event ? String(event.sourceId) : "";
    if (sourceId === "radar-detail") detail.cancel();
    else if (String(sourceId || "").startsWith("radar-")) onRadarError();
    else onTileError();
  });
  return {
    kind: "vector",
    fly: (lon, lat, zoom = map.getZoom()) => map.flyTo({ center: [lon, lat], zoom, duration: reduced() ? 0 : 1600 }),
    zoom: (delta) => map.easeTo({ zoom: map.getZoom() + delta, duration: reduced() ? 0 : 400 }),
    getZoom: () => map.getZoom(),
    project: (lon, lat) => map.project([lon, lat]),
    pin: (element, lon, lat) => new M.Marker({ element }).setLngLat([lon, lat]).addTo(map),
    onMove: (fn) => {
      map.on("moveend", fn);
      return () => map.off("moveend", fn);
    },
    radarFrames: (next) => {
      const previous = new Map(frames.map((f) => [f.time, f.tiles]));
      detail.cancel();
      frames = next;
      const keep = new Set(next.map((f) => "radar-" + f.time));
      for (const f of next) {
        const id = "radar-" + f.time;
        if (ids.has(id) && previous.get(f.time) !== f.tiles) {
          map.removeLayer(id);
          map.removeSource(id);
          ids.delete(id);
        }
        if (!ids.has(id)) {
          addSource(id, f);
          ids.add(id);
        }
      }
      for (const id of ids)
        if (!keep.has(id)) {
          map.removeLayer(id);
          map.removeSource(id);
          ids.delete(id);
        }
    },
    radarFrame: (time, alpha, animate) => {
      current = time;
      opacity = alpha;
      playing = animate;
      detail.schedule();
    },
    resize: () => map.resize(),
    destroy: () => {
      detail.cancel();
      map.remove();
    },
  };
}

function sourceLoaded(map: VectorMap, id: string, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      map.off("sourcedata", check);
      signal.removeEventListener("abort", abort);
    };
    const check = () => {
      if (map.getSource(id) && map.isSourceLoaded(id)) {
        cleanup();
        resolve();
      }
    };
    const abort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Détail incomplet"));
    }, 5000);
    map.on("sourcedata", check);
    signal.addEventListener("abort", abort, { once: true });
    check();
  });
}

async function rasterEngine(
  host: HTMLElement,
  signal: AbortSignal,
  onTileError: () => void,
  onRadarError: () => void,
): Promise<AtlasEngine> {
  const L = await import("leaflet");
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  const map = L.map(host, {
    zoomControl: false,
    attributionControl: false,
    minZoom: 3,
    maxZoom: 17,
    zoomSnap: 0.5,
    zoomDelta: 0.5,
    scrollWheelZoom: true,
    worldCopyJump: true,
  }).setView([50.68, 2.7], 8);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    className: "atlas-base-tiles",
    attribution: "© OpenStreetMap",
  })
    .on("tileerror", onTileError)
    .addTo(map);
  const pane = map.createPane("radar");
  pane.style.zIndex = "350";
  pane.style.pointerEvents = "none";
  const layers = new Map<number, TileLayer>();
  let frames: RadarFrame[] = [],
    current: number | null = null,
    opacity = 0,
    playing = false,
    detailLayer: TileLayer | undefined;
  const showOverview = () => {
    for (const [id, layer] of layers) layer.setOpacity(id === current ? opacity : 0);
  };
  const clearDetail = () => {
    detailLayer?.remove();
    detailLayer = undefined;
    showOverview();
  };
  const options = (f: RadarFrame, detail = false) => ({
    pane: "radar",
    className: "atlas-radar-tiles",
    tileSize: f.tileSize,
    minNativeZoom: detail ? f.detailMinZoom : f.minZoom,
    maxNativeZoom: detail ? f.detailMaxZoom : f.maxZoom,
    minZoom: detail ? f.detailMinZoom : 3,
    maxZoom: 17,
    opacity: 0,
    keepBuffer: 1,
    bounds: L.latLngBounds([f.bounds[1], f.bounds[0]], [f.bounds[3], f.bounds[2]]),
    attribution: f.attribution,
  });
  const detail = detailController(async (abort) => {
    const frame = frames.find((f) => f.time === current);
    if (!frame || playing || opacity === 0 || map.getZoom() < frame.detailMinZoom) return;
    const b = map.getBounds();
    await prepareRadarDetail(
      frame,
      { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth(), zoom: map.getZoom() },
      abort,
    );
    if (abort.aborted) return;
    const layer = L.tileLayer(frame.detailTiles, options(frame, true));
    detailLayer = layer;
    let failed = false;
    layer.on("tileerror", () => {
      failed = true;
      clearDetail();
    });
    layer.once("load", () => {
      if (abort.aborted || failed || detailLayer !== layer) return;
      for (const base of layers.values()) base.setOpacity(0);
      layer.setOpacity(opacity);
    });
    layer.addTo(map);
  }, clearDetail);
  map.on("movestart", detail.cancel);
  map.on("moveend", detail.schedule);
  return {
    kind: "raster",
    fly: (lon, lat, zoom = map.getZoom()) => map.flyTo([lat, lon], zoom, { animate: !reduced(), duration: 1.6 }),
    zoom: (delta) => map.setZoom(map.getZoom() + delta, { animate: !reduced() }),
    getZoom: () => map.getZoom(),
    project: (lon, lat) => map.latLngToContainerPoint([lat, lon]),
    pin: (element, lon, lat) =>
      L.marker([lat, lon], {
        icon: L.divIcon({ html: element, className: "atlas-marker-host", iconSize: [58, 58], iconAnchor: [29, 29] }),
        keyboard: false,
      }).addTo(map),
    onMove: (fn) => {
      map.on("moveend", fn);
      return () => map.off("moveend", fn);
    },
    radarFrames: (next) => {
      const previous = new Map(frames.map((f) => [f.time, f.tiles]));
      detail.cancel();
      frames = next;
      for (const f of next) {
        if (layers.has(f.time) && previous.get(f.time) !== f.tiles) {
          layers.get(f.time)?.remove();
          layers.delete(f.time);
        }
        if (!layers.has(f.time)) {
          const layer = L.tileLayer(f.tiles, options(f)).on("tileerror", onRadarError).addTo(map);
          layers.set(f.time, layer);
        }
      }
      for (const [time, layer] of layers)
        if (!next.some((f) => f.time === time)) {
          layer.remove();
          layers.delete(time);
        }
    },
    radarFrame: (time, alpha, animate) => {
      current = time;
      opacity = alpha;
      playing = animate;
      detail.schedule();
    },
    resize: () => map.invalidateSize({ pan: false }),
    destroy: () => {
      detail.cancel();
      map.remove();
    },
  };
}
