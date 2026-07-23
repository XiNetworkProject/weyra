"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import type {
  Coordinates,
  LocationSelection,
  Observation,
  OperaRadarHistoryFrame,
  OperaRadarMapTransition,
  OperaRadarStatus,
  RadarFrame,
} from "@/lib/types";
import { CATEGORY_META, OPERA_TILE_STYLE } from "@/components/atlas/constants";
import { observationPhenomena } from "@/lib/observation-utils";

type AtlasMapProps = {
  location: LocationSelection;
  observations: Observation[];
  selectedObservationId: string | null;
  radarFrames: RadarFrame[];
  radarFrameIndex: number;
  radarHost: string;
  radarVisible: boolean;
  operaRadarFrame: OperaRadarHistoryFrame | null;
  operaRadarTransition: OperaRadarMapTransition | null;
  operaPlaybackActive: boolean;
  operaWarmedTimestamps: string[];
  observationLayerVisible: boolean;
  pendingObservationPosition: Coordinates | null;
  onMapReady: (map: MapLibreMap) => void;
  onOperaRadarStatus: (status: OperaRadarStatus) => void;
  onMapClick: (coords: { lat: number; lon: number }) => void;
  onObservationClick: (observation: Observation) => void;
};

type MutableRasterSource = { setTiles?: (tiles: string[]) => void };
type MutableGeoJsonSource = { setData: (data: unknown) => void };
type SourceDataEventLike = { sourceId?: string; isSourceLoaded?: boolean; sourceDataType?: string; coord?: unknown };
type MapErrorEventLike = { error?: Error & { status?: number; url?: string }; sourceId?: string };
type ManagedMarker = { marker: Marker; element: HTMLButtonElement; observation: Observation };
type RadarSlot = "a" | "b";
type OperaPrewarmResponse = {
  ok: boolean;
  style: string;
  timestamps: Array<{
    timestamp: string;
    requested: number;
    cacheHits: number;
    generated: number;
    failed: number;
    durationMs: number;
    tileUrls: string[];
  }>;
  error?: string;
};

const RADAR_SLOTS: RadarSlot[] = ["a", "b"];
const OBS_SOURCE = "weyra-observations";
const CLUSTER_HALO = "weyra-observation-cluster-halo";
const CLUSTER_CIRCLE = "weyra-observation-cluster";
const CLUSTER_LABEL = "weyra-observation-cluster-label";
const DOT_HALO = "weyra-observation-dot-halo";
const DOT_CIRCLE = "weyra-observation-dot";
const OPERA_RADAR_SLOTS: RadarSlot[] = ["a", "b"];
const OPERA_RADAR_OPACITY = 0.82;
// Overview tiles come from published scan packs: static WebP, always complete for a ready pack.
const OPERA_OVERVIEW_MIN_ZOOM = 3;
const OPERA_OVERVIEW_MAX_ZOOM = 6;
// Detail tiles are optional sharpening on top of the overview; they never gate the display.
const OPERA_DETAIL_MIN_ZOOM = 8;
const OPERA_DETAIL_MAX_ZOOM = 9;
// Below map zoom 8 the radar is overview-only; from 8 the detail takes over as soon as it is loaded.
const OPERA_DETAIL_MIN_MAP_ZOOM = 8;
const OPERA_DETAIL_HANDOFF_MS = 0;
const OPERA_DETAIL_SOURCE_ID = "opera-radar-detail-source";
const OPERA_DETAIL_LAYER_ID = "opera-radar-detail-layer";
const OPERA_TILE_LOAD_TIMEOUT_MS = 2200;
const WEYRA_BASE_MAP_STYLE = "/map-styles/weyra-atlas-v2.json";
const RADAR_INSERT_BEFORE_LAYER_ID = "boundary_country_outline";
// A freshly published observation gets a soft pulsing halo for this long, then settles down.
const OBSERVATION_FRESH_WINDOW_MS = 10 * 60_000;
const OBSERVATION_MARKER_REFRESH_MS = 20_000;

const INITIAL_CAMERA = {
  // Stable North/Belgium framing: Calais / Dunkerque / Lille / Tournai / Arras.
  center: [2.78, 50.68] as [number, number],
  zoom: 8.55,
};

function operaRadarOpacityForZoom(zoom: number) {
  if (zoom <= 9) return OPERA_RADAR_OPACITY;
  if (zoom >= 12) return 0.16;
  if (zoom <= 10) return OPERA_RADAR_OPACITY + (0.62 - OPERA_RADAR_OPACITY) * (zoom - 9);
  if (zoom <= 11) return 0.62 + (0.34 - 0.62) * (zoom - 10);
  return 0.34 + (0.16 - 0.34) * (zoom - 11);
}

function escapeAttribute(value: string) {
  return value.replace(/[&<>'\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" })[char] ?? char);
}

function timeAgo(timestamp: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
  if (seconds < 60) return "à l’instant";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h`;
  return `${Math.floor(seconds / 86400)} j`;
}

function radarSourceId(slot: RadarSlot) { return `weyra-radar-${slot}`; }
function radarLayerId(slot: RadarSlot) { return `weyra-radar-layer-${slot}`; }

function radarUrl(host: string, path: string) {
  // RainViewer accepts tile zooms 0..7 only. The source maxzoom below is therefore 7;
  // MapLibre overzooms the last valid tile client-side instead of requesting a forbidden z=8+ tile.
  return `${host}${path}/512/{z}/{x}/{y}/2/1_1.png`;
}

function observationCollection(observations: Observation[]) {
  return {
    type: "FeatureCollection" as const,
    features: observations.map((observation) => {
      const phenomena = observationPhenomena(observation);
      return {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [observation.lon, observation.lat] },
        properties: {
          id: observation.id,
          category: phenomena[0],
          phenomenonCount: phenomena.length,
          intensity: observation.intensity,
          // Any observation with an image renders as a round photo marker; the rest stay compact dots.
          hasPhoto: Boolean(observation.imageUrl),
        },
      };
    }),
  };
}

function ensureObservationLayers(map: MapLibreMap) {
  if (map.getSource(OBS_SOURCE)) return;

  map.addSource(OBS_SOURCE, {
    type: "geojson",
    data: observationCollection([]),
    cluster: true,
    clusterRadius: 58,
    clusterMaxZoom: 7,
    clusterMinPoints: 2,
  });

  map.addLayer({
    id: CLUSTER_HALO,
    type: "circle",
    source: OBS_SOURCE,
    filter: ["has", "point_count"],
    paint: {
      "circle-radius": ["step", ["get", "point_count"], 12, 8, 14, 24, 17],
      "circle-color": "#071b2e",
      "circle-opacity": 0.92,
      "circle-stroke-width": 1.4,
      "circle-stroke-color": "#62f2dc",
      "circle-stroke-opacity": 0.9,
      "circle-blur": 0.05,
    },
  });
  map.addLayer({
    id: CLUSTER_CIRCLE,
    type: "circle",
    source: OBS_SOURCE,
    filter: ["has", "point_count"],
    paint: {
      "circle-radius": ["step", ["get", "point_count"], 8, 8, 10, 24, 12],
      "circle-color": "#123954",
      "circle-opacity": 0.98,
    },
  });
  map.addLayer({
    id: CLUSTER_LABEL,
    type: "symbol",
    source: OBS_SOURCE,
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-font": ["Open Sans Bold"],
      "text-size": 9.5,
      "text-allow-overlap": true,
    },
    paint: { "text-color": "#efffff" },
  });

  const noPhotoFilter = ["all", ["!", ["has", "point_count"]], ["!=", ["get", "hasPhoto"], true]] as never;
  map.addLayer({
    id: DOT_HALO,
    type: "circle",
    source: OBS_SOURCE,
    filter: noPhotoFilter,
    minzoom: 7.2,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 7.2, 4.5, 9.5, 7],
      "circle-color": "#04111f",
      "circle-stroke-color": "#d9f4ff",
      "circle-stroke-width": 1.4,
      "circle-opacity": 0.94,
    },
  });
  map.addLayer({
    id: DOT_CIRCLE,
    type: "circle",
    source: OBS_SOURCE,
    filter: noPhotoFilter,
    minzoom: 7.2,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 7.2, 2.8, 9.5, 4.7],
      "circle-color": ["match", ["get", "category"],
        "orage", "#ffd46a",
        "pluie", "#5aaaff",
        "grêle", "#79e3ff",
        "rafales", "#ad85ff",
        "neige", "#dcf7ff",
        "verglas", "#88d6ff",
        "foudre", "#ffb84d",
        "tornade", "#ff6f91",
        "brouillard", "#9bb6c9",
        "inondation", "#27c7d8",
        "chaleur", "#ff6b5e",
        "froid", "#65a8ff",
        "nuage", "#bd8cff",
        "arc-en-ciel", "#f46fe5",
        "#62f2dc"],
      "circle-opacity": 1,
    },
  });
}

function removeRainViewerRadarLayers(map: MapLibreMap) {
  RADAR_SLOTS.forEach((slot) => {
    const layerId = radarLayerId(slot);
    if (map.getLayer(layerId)) map.setPaintProperty(layerId, "raster-opacity", 0);
  });
}

function removeOperaRadarOverlay(map: MapLibreMap) {
  OPERA_RADAR_SLOTS.forEach((slot) => {
    const legacyLayerId = `opera-radar-layer-${slot}`;
    const legacySourceId = `opera-radar-source-${slot}`;
    if (map.getLayer(legacyLayerId)) map.removeLayer(legacyLayerId);
    if (map.getSource(legacySourceId)) map.removeSource(legacySourceId);
  });
}

function removeOperaRadarTiles(map: MapLibreMap) {
  if (map.getLayer(OPERA_DETAIL_LAYER_ID)) map.removeLayer(OPERA_DETAIL_LAYER_ID);
  if (map.getSource(OPERA_DETAIL_SOURCE_ID)) map.removeSource(OPERA_DETAIL_SOURCE_ID);
  OPERA_RADAR_SLOTS.forEach((slot) => {
    const layerId = operaRadarLayerId(slot);
    const sourceId = operaRadarSourceId(slot);
    if (map.getLayer(layerId)) map.removeLayer(layerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);
  });
}

function operaRadarSourceId(slot: RadarSlot) {
  return `opera-radar-tiles-source-${slot}`;
}

function operaRadarLayerId(slot: RadarSlot) {
  return `opera-radar-tiles-layer-${slot}`;
}

function operaOverviewTemplate(timestamp: string) {
  return `/api/radar/opera/packs/${encodeURIComponent(timestamp)}/overview/{z}/{x}/{y}?style=${OPERA_TILE_STYLE}`;
}

function operaDetailTemplate(timestamp: string) {
  return `/api/radar/opera/packs/${encodeURIComponent(timestamp)}/detail/{z}/{x}/{y}?style=${OPERA_TILE_STYLE}`;
}

function operaSourceBounds(frame: OperaRadarHistoryFrame): [number, number, number, number] | undefined {
  const bounds = frame.geographicBounds;
  if (!bounds) return undefined;
  return [bounds.west, bounds.south, bounds.east, bounds.north];
}

function setOperaTileSource(map: MapLibreMap, slot: RadarSlot, frame: OperaRadarHistoryFrame, opacity: number) {
  const sourceId = operaRadarSourceId(slot);
  const layerId = operaRadarLayerId(slot);
  const tiles = [operaOverviewTemplate(frame.timestamp)];
  const existingSource = map.getSource(sourceId) as unknown as MutableRasterSource | undefined;

  if (existingSource?.setTiles) {
    existingSource.setTiles(tiles);
  } else {
    if (map.getLayer(layerId)) map.removeLayer(layerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);
    map.addSource(sourceId, {
      type: "raster",
      tiles,
      tileSize: 256,
      // A complete z3..z6 pack is small enough to publish quickly. MapLibre overzooms z6 while
      // the optional z8..z9 detail is prepared only for the local viewport.
      minzoom: OPERA_OVERVIEW_MIN_ZOOM,
      maxzoom: OPERA_OVERVIEW_MAX_ZOOM,
      bounds: operaSourceBounds(frame),
    });
  }
  ensureOperaRadarLayer(map, slot, opacity);
}

function ensureOperaRadarLayer(map: MapLibreMap, slot: RadarSlot, opacity: number) {
  const layerId = operaRadarLayerId(slot);
  if (!map.getLayer(layerId)) {
    // Overview slots always sit below the detail layer, which itself sits below observations.
    const beforeId = map.getLayer(OPERA_DETAIL_LAYER_ID)
      ? OPERA_DETAIL_LAYER_ID
      : map.getLayer(RADAR_INSERT_BEFORE_LAYER_ID)
        ? RADAR_INSERT_BEFORE_LAYER_ID
        : map.getLayer(CLUSTER_HALO) ? CLUSTER_HALO : undefined;
    map.addLayer({
      id: layerId,
      type: "raster",
      source: operaRadarSourceId(slot),
      paint: {
        "raster-opacity": opacity,
        "raster-opacity-transition": { duration: 0, delay: 0 },
        "raster-fade-duration": 0,
        "raster-resampling": "linear",
      },
    }, beforeId);
  } else {
    map.setPaintProperty(layerId, "raster-opacity", opacity);
  }
}

function setOperaDetailOpacity(map: MapLibreMap, opacity: number, durationMs = 0) {
  if (!map.getLayer(OPERA_DETAIL_LAYER_ID)) return;
  map.setPaintProperty(OPERA_DETAIL_LAYER_ID, "raster-opacity-transition", { duration: durationMs, delay: 0 });
  map.setPaintProperty(OPERA_DETAIL_LAYER_ID, "raster-opacity", opacity);
}

function hideOperaDetail(map: MapLibreMap) {
  setOperaDetailOpacity(map, 0, 0);
}

function ensureOperaDetailSource(map: MapLibreMap, frame: OperaRadarHistoryFrame, options: { skipSetTiles?: boolean } = {}) {
  const tiles = [operaDetailTemplate(frame.timestamp)];
  const existingSource = map.getSource(OPERA_DETAIL_SOURCE_ID) as unknown as MutableRasterSource | undefined;

  if (existingSource?.setTiles) {
    if (!options.skipSetTiles) existingSource.setTiles(tiles);
  } else {
    if (map.getLayer(OPERA_DETAIL_LAYER_ID)) map.removeLayer(OPERA_DETAIL_LAYER_ID);
    if (map.getSource(OPERA_DETAIL_SOURCE_ID)) map.removeSource(OPERA_DETAIL_SOURCE_ID);
    map.addSource(OPERA_DETAIL_SOURCE_ID, {
      type: "raster",
      tiles,
      tileSize: 256,
      minzoom: OPERA_DETAIL_MIN_ZOOM,
      maxzoom: OPERA_DETAIL_MAX_ZOOM,
      bounds: operaSourceBounds(frame),
    });
  }

  if (!map.getLayer(OPERA_DETAIL_LAYER_ID)) {
    const beforeId = map.getLayer(RADAR_INSERT_BEFORE_LAYER_ID)
      ? RADAR_INSERT_BEFORE_LAYER_ID
      : map.getLayer(CLUSTER_HALO) ? CLUSTER_HALO : undefined;
    map.addLayer({
      id: OPERA_DETAIL_LAYER_ID,
      type: "raster",
      source: OPERA_DETAIL_SOURCE_ID,
      paint: {
        "raster-opacity": 0,
        "raster-opacity-transition": { duration: 0, delay: 0 },
        "raster-fade-duration": 0,
        "raster-resampling": "linear",
      },
    }, beforeId);
  }
}

function ensureOperaRadarSlot(map: MapLibreMap, slot: RadarSlot, frame: OperaRadarHistoryFrame, opacity: number) {
  removeOperaRadarOverlay(map);
  setOperaTileSource(map, slot, frame, opacity);
}

function setOperaLayerOpacity(map: MapLibreMap, slot: RadarSlot, opacity: number, durationMs = 0) {
  const layerId = operaRadarLayerId(slot);
  if (!map.getLayer(layerId)) return;
  map.setPaintProperty(layerId, "raster-opacity-transition", { duration: durationMs, delay: 0 });
  map.setPaintProperty(layerId, "raster-opacity", opacity);
}

function sourceLoaded(map: MapLibreMap, sourceId: string) {
  try {
    return map.isSourceLoaded(sourceId);
  } catch {
    return false;
  }
}

function waitForOperaTileSource(
  map: MapLibreMap,
  sourceId: string,
  urlMarker: string,
  timeoutMs = OPERA_TILE_LOAD_TIMEOUT_MS,
  acceptFirstTile = false,
) {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    let sawSourceData = false;

    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      map.off("sourcedata", onSourceData);
      map.off("error", onError);
      resolve(ready);
    };

    const onSourceData = (event: SourceDataEventLike) => {
      if (event.sourceId !== sourceId) return;
      sawSourceData = true;
      if (
        event.isSourceLoaded
        || sourceLoaded(map, sourceId)
        || (acceptFirstTile && (event.sourceDataType === "content" || Boolean(event.coord)))
      ) finish(true);
    };

    const onError = (event: MapErrorEventLike) => {
      const url = event.error?.url ?? "";
      if (event.sourceId === sourceId || (urlMarker && url.includes(urlMarker))) {
        console.warn("OPERA tiled radar source failed", event.error?.message ?? event.error);
        finish(false);
      }
    };

    const timeout = window.setTimeout(() => finish(sawSourceData || sourceLoaded(map, sourceId)), timeoutMs);
    map.on("sourcedata", onSourceData);
    map.on("error", onError);
    map.triggerRepaint();
  });
}

export default function AtlasMap({
  location,
  observations,
  selectedObservationId,
  radarFrames,
  radarFrameIndex,
  radarHost,
  radarVisible,
  operaRadarFrame,
  operaRadarTransition,
  operaPlaybackActive,
  operaWarmedTimestamps,
  observationLayerVisible,
  pendingObservationPosition,
  onMapReady,
  onOperaRadarStatus,
  onMapClick,
  onObservationClick,
}: AtlasMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRefs = useRef<Map<string, ManagedMarker>>(new Map());
  const pendingMarkerRef = useRef<Marker | null>(null);
  const observationRef = useRef<Map<string, Observation>>(new Map());
  const onMapReadyRef = useRef(onMapReady);
  const onOperaRadarStatusRef = useRef(onOperaRadarStatus);
  const onMapClickRef = useRef(onMapClick);
  const onObservationClickRef = useRef(onObservationClick);
  const initialLocationRef = useRef(location);
  const activeRadarSlotRef = useRef<RadarSlot>("a");
  const appliedRadarPathRef = useRef<string | null>(null);
  const radarRequestIdRef = useRef(0);
  const operaRadarActiveRef = useRef(false);
  const operaRadarTimestampRef = useRef<string | null>(null);
  const activeOperaSlotRef = useRef<RadarSlot>("a");
  const appliedOperaFrameRef = useRef<string | null>(null);
  const appliedOperaTransitionRef = useRef<number | null>(null);
  const operaTransitionTimerRef = useRef<number | null>(null);
  const operaTransitionRafRef = useRef<number | null>(null);
  const operaMoveendPrewarmTimerRef = useRef<number | null>(null);
  const operaDetailRequestIdRef = useRef(0);
  const operaDetailAbortRef = useRef<AbortController | null>(null);
  const operaDetailTimestampRef = useRef<string | null>(null);
  const operaDetailShownRef = useRef(false);
  const radarVisibleRef = useRef(radarVisible);
  const operaPlaybackActiveRef = useRef(operaPlaybackActive);
  const operaWarmedTimestampsRef = useRef(new Set(operaWarmedTimestamps));
  const renderMarkersRef = useRef<() => void>(() => undefined);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => { onMapReadyRef.current = onMapReady; }, [onMapReady]);
  useEffect(() => { onOperaRadarStatusRef.current = onOperaRadarStatus; }, [onOperaRadarStatus]);
  useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);
  useEffect(() => { onObservationClickRef.current = onObservationClick; }, [onObservationClick]);
  useEffect(() => { observationRef.current = new Map(observations.map((observation) => [observation.id, observation])); }, [observations]);
  useEffect(() => { radarVisibleRef.current = radarVisible; }, [radarVisible]);
  useEffect(() => { operaPlaybackActiveRef.current = operaPlaybackActive; }, [operaPlaybackActive]);
  useEffect(() => { operaWarmedTimestampsRef.current = new Set(operaWarmedTimestamps); }, [operaWarmedTimestamps]);

  // Puts the radar back into its base state: overview visible (if the radar is), detail hidden.
  // This is the only safe state whenever the detail tiles are not known to cover the viewport.
  const presentOperaOverview = useCallback((currentMap: MapLibreMap) => {
    operaDetailShownRef.current = false;
    hideOperaDetail(currentMap);
    const slot = activeOperaSlotRef.current;
    if (currentMap.getLayer(operaRadarLayerId(slot))) {
      setOperaLayerOpacity(
        currentMap,
        slot,
        radarVisibleRef.current && operaRadarActiveRef.current ? operaRadarOpacityForZoom(currentMap.getZoom()) : 0,
        0,
      );
    }
  }, []);

  const presentOperaDetail = useCallback((currentMap: MapLibreMap) => {
    operaDetailShownRef.current = true;
    setOperaLayerOpacity(currentMap, activeOperaSlotRef.current, 0, OPERA_DETAIL_HANDOFF_MS);
    setOperaDetailOpacity(currentMap, operaRadarOpacityForZoom(currentMap.getZoom()), OPERA_DETAIL_HANDOFF_MS);
  }, []);

  // Background-only sharpening: makes sure the detail tiles (z8..z9) covering the current
  // viewport (+1 tile of margin) exist server-side, then switches overview -> detail.
  // The two layers are never both fully visible, so the radar can never darken from stacked
  // opacities. It never blocks the map.
  const updateOperaDetailForMap = useCallback(async (
    currentMap: MapLibreMap,
    frame: OperaRadarHistoryFrame,
  ) => {
    const requestId = ++operaDetailRequestIdRef.current;
    operaDetailAbortRef.current?.abort();
    operaDetailAbortRef.current = null;

    // During timeline playback the detail layer stays hidden and NOTHING detail-related runs:
    // no prewarm POST, no Python, no z8+ tile burst competing with playback fetches.
    // The sharpening happens when playback pauses on a frame.
    if (operaPlaybackActiveRef.current) {
      presentOperaOverview(currentMap);
      return;
    }

    if (currentMap.getZoom() < OPERA_DETAIL_MIN_MAP_ZOOM || !radarVisibleRef.current) {
      presentOperaOverview(currentMap);
      return;
    }

    const bounds = currentMap.getBounds();
    const detailZoom = Math.max(
      OPERA_DETAIL_MIN_ZOOM,
      Math.min(OPERA_DETAIL_MAX_ZOOM, currentMap.getZoom()),
    );

    const controller = new AbortController();
    operaDetailAbortRef.current = controller;
    const response = await fetch("/api/radar/opera/tiles/prewarm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify({
        timestamps: [frame.timestamp],
        viewport: {
          west: bounds.getWest(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          north: bounds.getNorth(),
          zoom: detailZoom,
        },
        paddingTiles: 1,
        style: OPERA_TILE_STYLE,
      }),
    });
    if (controller.signal.aborted) return;
    const payload = await response.json() as OperaPrewarmResponse;
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error ?? `OPERA detail prewarm HTTP ${response.status}.`);
    }
    if (operaDetailAbortRef.current === controller) operaDetailAbortRef.current = null;
    const primary = payload.timestamps.find((item) => item.timestamp === frame.timestamp);
    if (!primary || primary.requested === 0 || primary.failed > 0) {
      throw new Error(`OPERA detail tiles are incomplete (${primary?.failed ?? "unknown"} failed).`);
    }

    // The visible detail tiles are fully available on disk. Only now may the detail layer
    // switch over — a stale request or an already-changed frame must never touch the map.
    if (requestId !== operaDetailRequestIdRef.current) return;
    if (appliedOperaFrameRef.current !== frame.timestamp) return;
    if (currentMap.getZoom() < OPERA_DETAIL_MIN_MAP_ZOOM || !radarVisibleRef.current) return;

    const sameFrame = operaDetailTimestampRef.current === frame.timestamp;
    // On a pan within the same scan, MapLibre may have cached 404s for tiles that the prewarm
    // has just generated; reloading the source (setTiles) makes it pick them up.
    const needsReload = !sameFrame || primary.generated > 0 || !operaDetailShownRef.current;
    if (needsReload && operaDetailShownRef.current) {
      // The detail source is about to reload: hand the display back to the overview first so
      // the reload can never leave a hole (and never stacks with the incoming detail).
      presentOperaOverview(currentMap);
    }
    ensureOperaDetailSource(currentMap, frame, { skipSetTiles: !needsReload });
    operaDetailTimestampRef.current = frame.timestamp;

    if (operaDetailShownRef.current) {
      presentOperaDetail(currentMap);
      return;
    }

    const ready = await waitForOperaTileSource(currentMap, OPERA_DETAIL_SOURCE_ID, "/detail/", 1800);
    if (requestId !== operaDetailRequestIdRef.current) return;
    if (appliedOperaFrameRef.current !== frame.timestamp) return;
    if (operaPlaybackActiveRef.current) return;
    if (!ready || !radarVisibleRef.current || currentMap.getZoom() < OPERA_DETAIL_MIN_MAP_ZOOM) return;

    // Once detail is loaded, it owns the zoomed radar: overview must be fully hidden.
    setOperaDetailOpacity(currentMap, 0, 0);
    window.requestAnimationFrame(() => {
      if (requestId !== operaDetailRequestIdRef.current) return;
      presentOperaDetail(currentMap);
    });
  }, [presentOperaDetail, presentOperaOverview]);

  useEffect(() => {
    let alive = true;
    async function createMap() {
      if (!containerRef.current || mapRef.current) return;
      const maplibregl = (await import("maplibre-gl")).default;
      if (!alive || !containerRef.current) return;
      const maplibreWithImageLimit = maplibregl as typeof maplibregl & { setMaxParallelImageRequests?: (count: number) => void };
      if (typeof maplibreWithImageLimit.setMaxParallelImageRequests === "function") {
        maplibreWithImageLimit.setMaxParallelImageRequests(24);
      }
      const initial = initialLocationRef.current;
      const isInitialLille = Math.abs(initial.lat - 50.6292) < 0.01 && Math.abs(initial.lon - 3.0573) < 0.01;
      const mapOptions = {
        container: containerRef.current,
        style: WEYRA_BASE_MAP_STYLE,
        center: isInitialLille ? INITIAL_CAMERA.center : [initial.lon, initial.lat],
        zoom: isInitialLille ? INITIAL_CAMERA.zoom : 8.5,
        bearing: 0,
        pitch: 0,
        maxPitch: 0,
        minZoom: 6.4,
        maxZoom: 15,
        dragRotate: false,
        renderWorldCopies: false,
        maxTileCacheSize: 512,
        maxTileCacheZoomLevels: 8,
      } as ConstructorParameters<typeof maplibregl.Map>[0] & {
        maxTileCacheSize: number;
        maxTileCacheZoomLevels: number;
      };
      const map = new maplibregl.Map(mapOptions);

      map.touchZoomRotate.disableRotation();
      map.on("load", () => {
        if (!alive) return;
        ensureObservationLayers(map);
        mapRef.current = map;
        if (process.env.NODE_ENV !== "production") {
          (window as typeof window & { __weyraAtlasMap?: MapLibreMap }).__weyraAtlasMap = map;
        }
        setMapReady(true);
        onMapReadyRef.current(map);
      });

      map.on("click", (event) => {
        const features = map.queryRenderedFeatures(event.point, { layers: [CLUSTER_CIRCLE, DOT_CIRCLE] });
        const feature = features[0];
        if (feature) {
          const props = feature.properties ?? {};
          if (props.cluster) {
            const coordinates = feature.geometry.type === "Point" ? feature.geometry.coordinates as [number, number] : undefined;
            if (coordinates) map.easeTo({ center: coordinates, zoom: Math.min(map.getZoom() + 1.7, 11), duration: 520 });
            return;
          }
          const id = String(props.id ?? "");
          const observation = observationRef.current.get(id);
          if (observation) onObservationClickRef.current(observation);
          return;
        }
        onMapClickRef.current({ lat: event.lngLat.lat, lon: event.lngLat.lng });
      });
      map.on("mouseenter", CLUSTER_CIRCLE, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", CLUSTER_CIRCLE, () => { map.getCanvas().style.cursor = ""; });
      map.on("mouseenter", DOT_CIRCLE, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", DOT_CIRCLE, () => { map.getCanvas().style.cursor = ""; });
    }
    void createMap();
    return () => {
      alive = false;
      if (operaTransitionTimerRef.current !== null) {
        window.clearTimeout(operaTransitionTimerRef.current);
        operaTransitionTimerRef.current = null;
      }
      if (operaTransitionRafRef.current !== null) {
        window.cancelAnimationFrame(operaTransitionRafRef.current);
        operaTransitionRafRef.current = null;
      }
      if (operaMoveendPrewarmTimerRef.current !== null) {
        window.clearTimeout(operaMoveendPrewarmTimerRef.current);
        operaMoveendPrewarmTimerRef.current = null;
      }
      operaDetailAbortRef.current?.abort();
      operaDetailAbortRef.current = null;
      markerRefs.current.forEach(({ marker }) => marker.remove());
      markerRefs.current.clear();
      pendingMarkerRef.current?.remove();
      pendingMarkerRef.current = null;
      if (mapRef.current) {
        removeOperaRadarTiles(mapRef.current);
        removeOperaRadarOverlay(mapRef.current);
      }
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.flyTo({ center: [location.lon, location.lat], zoom: Math.max(map.getZoom(), 8.45), essential: true, duration: 780 });
  }, [location.lat, location.lon, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (operaRadarActiveRef.current) {
      removeRainViewerRadarLayers(map);
      return;
    }
    const frame = radarFrames[radarFrameIndex];
    if (!frame || !radarHost) return;
    const url = radarUrl(radarHost, frame.path);
    const requestId = ++radarRequestIdRef.current;

    const ensureSlot = (slot: RadarSlot) => {
      const sourceId = radarSourceId(slot);
      const layerId = radarLayerId(slot);
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: "raster",
          tiles: [url],
          tileSize: 512,
          maxzoom: 7,
          attribution: 'Radar © <a href="https://www.rainviewer.com/" target="_blank" rel="noreferrer">RainViewer</a>',
        });
      }
      if (!map.getLayer(layerId)) {
        map.addLayer({
          id: layerId,
          type: "raster",
          source: sourceId,
          paint: {
            "raster-opacity": 0,
            "raster-opacity-transition": { duration: 420, delay: 0 },
            "raster-fade-duration": 500,
            "raster-resampling": "linear",
            "raster-contrast": 0.02,
            "raster-saturation": 0.04,
          },
        });
      }
    };
    ensureSlot("a"); ensureSlot("b");

    if (!radarVisible) {
      RADAR_SLOTS.forEach((slot) => map.setPaintProperty(radarLayerId(slot), "raster-opacity", 0));
      return;
    }

    const active = activeRadarSlotRef.current;
    if (!appliedRadarPathRef.current || appliedRadarPathRef.current === frame.path) {
      map.setPaintProperty(radarLayerId(active), "raster-opacity", 0.47);
      appliedRadarPathRef.current = frame.path;
      return;
    }

    const next: RadarSlot = active === "a" ? "b" : "a";
    const nextSource = map.getSource(radarSourceId(next)) as unknown as MutableRasterSource | undefined;
    if (!nextSource?.setTiles) return;
    nextSource.setTiles([url]);

    const promote = () => {
      if (requestId !== radarRequestIdRef.current) return;
      map.setPaintProperty(radarLayerId(next), "raster-opacity", 0.47);
      map.setPaintProperty(radarLayerId(active), "raster-opacity", 0);
      activeRadarSlotRef.current = next;
      appliedRadarPathRef.current = frame.path;
    };
    const ready = (event: { sourceId?: string; isSourceLoaded?: boolean }) => {
      if (event.sourceId === radarSourceId(next) && event.isSourceLoaded) {
        map.off("sourcedata", ready);
        promote();
      }
    };
    map.on("sourcedata", ready);
    const fallback = window.setTimeout(() => { map.off("sourcedata", ready); promote(); }, 1050);
    return () => { window.clearTimeout(fallback); map.off("sourcedata", ready); };
  }, [mapReady, radarFrames, radarFrameIndex, radarHost, radarVisible]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !operaRadarFrame) return;
    const currentMap = map;
    const frame = operaRadarFrame;
    let cancelled = false;

    if (appliedOperaFrameRef.current === frame.timestamp && operaRadarActiveRef.current) {
      // Same scan already on screen: only the optional detail sharpening may need a refresh.
      void updateOperaDetailForMap(currentMap, frame).catch((error) => {
        console.debug("OPERA detail refresh skipped", error);
      });
      return;
    }

    if (operaTransitionTimerRef.current !== null) {
      window.clearTimeout(operaTransitionTimerRef.current);
      operaTransitionTimerRef.current = null;
    }
    if (operaTransitionRafRef.current !== null) {
      window.cancelAnimationFrame(operaTransitionRafRef.current);
      operaTransitionRafRef.current = null;
    }

    // The scan pack is published: its overview tiles are plain static files. The radar is shown
    // immediately from those tiles — no POST, no generation, nothing to wait for but the GETs.
    async function applyOperaOverview() {
      // Back to the overview-first state: the old detail must never stay visible (or stack)
      // while another scan is being installed.
      presentOperaOverview(currentMap);
      operaDetailTimestampRef.current = null;

      // Load the new scan into the slot that is not currently visible, so switching scans
      // never blanks the radar while tiles arrive.
      const previousSlot = activeOperaSlotRef.current;
      const targetSlot: RadarSlot = operaRadarActiveRef.current ? (previousSlot === "a" ? "b" : "a") : "a";
      ensureOperaRadarSlot(currentMap, targetSlot, frame, 0);
      removeRainViewerRadarLayers(currentMap);

      const warmed = operaWarmedTimestampsRef.current.has(frame.timestamp);
      const ready = await waitForOperaTileSource(
        currentMap,
        operaRadarSourceId(targetSlot),
        "/overview/",
        warmed ? 1200 : OPERA_TILE_LOAD_TIMEOUT_MS,
        warmed,
      );
      if (cancelled) return;

      if (!ready) {
        console.warn("OPERA scan pack overview failed to load", frame.timestamp);
        operaRadarActiveRef.current = false;
        setOperaLayerOpacity(currentMap, targetSlot, 0, 0);
        onOperaRadarStatusRef.current({
          available: false,
          timestamp: null,
          historyStatus: "unavailable",
          error: "Radar scan pack failed to load.",
        });
        return;
      }

      setOperaLayerOpacity(currentMap, targetSlot, radarVisible ? operaRadarOpacityForZoom(currentMap.getZoom()) : 0, 0);
      if (targetSlot !== previousSlot && currentMap.getLayer(operaRadarLayerId(previousSlot))) {
        setOperaLayerOpacity(currentMap, previousSlot, 0, 0);
      }
      activeOperaSlotRef.current = targetSlot;
      appliedOperaFrameRef.current = frame.timestamp;
      operaRadarActiveRef.current = true;
      operaRadarTimestampRef.current = frame.timestamp;
      onOperaRadarStatusRef.current({ available: true, timestamp: frame.timestamp, historyStatus: "ready" });

      void updateOperaDetailForMap(currentMap, frame).catch((error) => {
        console.debug("OPERA detail preparation skipped", error);
      });
    }

    void applyOperaOverview();
    return () => { cancelled = true; };
    // operaPlaybackActive is a dependency so that pausing playback re-runs the cheap same-frame
    // branch, which un-freezes the detail sharpening for the frame the user stopped on.
  }, [mapReady, operaRadarFrame, operaPlaybackActive, presentOperaOverview, updateOperaDetailForMap, radarVisible]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !operaRadarTransition) return;
    if (appliedOperaTransitionRef.current === operaRadarTransition.id) return;
    const currentMap = map;
    const transition = operaRadarTransition;

    appliedOperaTransitionRef.current = transition.id;

    if (operaTransitionTimerRef.current !== null) {
      window.clearTimeout(operaTransitionTimerRef.current);
      operaTransitionTimerRef.current = null;
    }
    if (operaTransitionRafRef.current !== null) {
      window.cancelAnimationFrame(operaTransitionRafRef.current);
      operaTransitionRafRef.current = null;
    }

    const activeSlot = activeOperaSlotRef.current;
    const inactiveSlot: RadarSlot = activeSlot === "a" ? "b" : "a";
    const duration = operaRadarTransition.durationMs;
    const targetOpacity = radarVisible ? operaRadarOpacityForZoom(currentMap.getZoom()) : 0;
    let cancelled = false;

    async function runTransition() {
      // The main crossfade only involves the two already-published overview packs. The detail
      // of the outgoing scan is handed back to the overview instantly — it never delays the
      // animation, never stacks with it, and no partial tile block can appear mid-fade.
      presentOperaOverview(currentMap);
      operaDetailTimestampRef.current = null;

      ensureOperaRadarSlot(currentMap, inactiveSlot, transition.toFrame, 0);
      removeRainViewerRadarLayers(currentMap);
      operaRadarActiveRef.current = true;

      const warmed = operaWarmedTimestampsRef.current.has(transition.toFrame.timestamp);
      const ready = await waitForOperaTileSource(
        currentMap,
        operaRadarSourceId(inactiveSlot),
        "/overview/",
        warmed ? 1200 : OPERA_TILE_LOAD_TIMEOUT_MS,
        warmed,
      );
      if (cancelled) return;

      if (!ready) {
        console.warn("OPERA tiled radar transition skipped; next source failed to load", transition.toFrame.timestamp);
        setOperaLayerOpacity(currentMap, inactiveSlot, 0, 0);
        setOperaLayerOpacity(currentMap, activeSlot, targetOpacity, 0);
        onOperaRadarStatusRef.current({
          available: true,
          timestamp: operaRadarTimestampRef.current,
          historyStatus: "ready",
          error: "Next tiled radar frame failed to load.",
        });
        return;
      }

      if (duration <= 0 || !radarVisible) {
        setOperaLayerOpacity(currentMap, activeSlot, 0, 0);
        setOperaLayerOpacity(currentMap, inactiveSlot, targetOpacity, 0);
        activeOperaSlotRef.current = inactiveSlot;
        appliedOperaFrameRef.current = transition.toFrame.timestamp;
        operaRadarTimestampRef.current = transition.toFrame.timestamp;
        return;
      }

      setOperaLayerOpacity(currentMap, inactiveSlot, 0, 0);
      setOperaLayerOpacity(currentMap, activeSlot, targetOpacity, 0);

      operaTransitionRafRef.current = window.requestAnimationFrame(() => {
        setOperaLayerOpacity(currentMap, activeSlot, 0, duration);
        setOperaLayerOpacity(currentMap, inactiveSlot, targetOpacity, duration);
        operaTransitionRafRef.current = null;
      });

      operaTransitionTimerRef.current = window.setTimeout(() => {
        activeOperaSlotRef.current = inactiveSlot;
        appliedOperaFrameRef.current = transition.toFrame.timestamp;
        operaRadarTimestampRef.current = transition.toFrame.timestamp;
        setOperaLayerOpacity(currentMap, activeSlot, 0, 0);
        setOperaLayerOpacity(currentMap, inactiveSlot, targetOpacity, 0);
        operaTransitionTimerRef.current = null;
      }, duration + 40);
    }

    void runTransition();
    return () => { cancelled = true; };
  }, [mapReady, operaRadarTransition, presentOperaOverview, radarVisible]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const activeSlot = activeOperaSlotRef.current;
    const inactiveSlot: RadarSlot = activeSlot === "a" ? "b" : "a";
    if (map.getLayer(operaRadarLayerId(activeSlot))) {
      setOperaLayerOpacity(
        map,
        activeSlot,
        radarVisible && operaRadarActiveRef.current ? operaRadarOpacityForZoom(map.getZoom()) : 0,
        0,
      );
    }
    if (map.getLayer(operaRadarLayerId(inactiveSlot))) {
      setOperaLayerOpacity(map, inactiveSlot, 0, 0);
    }
    // Toggling the radar always resets to the overview-first state; the detail handoff
    // re-runs afterwards through the frame effect when the radar is visible again.
    operaDetailShownRef.current = false;
    hideOperaDetail(map);
    if (operaRadarActiveRef.current) removeRainViewerRadarLayers(map);
  }, [mapReady, radarVisible]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !operaRadarFrame) return;

    // After a pan/zoom the overview keeps covering the viewport by itself (static tiles plus
    // client-side overzoom). Only the optional detail sharpening is refreshed, debounced.
    const scheduleDetailUpdate = () => {
      const zoomOpacity = radarVisibleRef.current && operaRadarActiveRef.current
        ? operaRadarOpacityForZoom(map.getZoom())
        : 0;
      if (operaDetailShownRef.current) {
        setOperaLayerOpacity(map, activeOperaSlotRef.current, 0, 0);
        setOperaDetailOpacity(map, zoomOpacity, 0);
      } else {
        setOperaLayerOpacity(map, activeOperaSlotRef.current, zoomOpacity, 0);
        hideOperaDetail(map);
      }
      if (operaMoveendPrewarmTimerRef.current !== null) {
        window.clearTimeout(operaMoveendPrewarmTimerRef.current);
      }
      operaMoveendPrewarmTimerRef.current = window.setTimeout(() => {
        operaMoveendPrewarmTimerRef.current = null;
        void updateOperaDetailForMap(map, operaRadarFrame).catch((error) => {
          console.debug("OPERA moveend detail update skipped", error);
        });
      }, 160);
    };

    // A camera move can expose areas the detail tiles do not cover yet: the overview (always
    // complete) takes the display back instantly, and the detail handoff re-runs for the new
    // viewport once its tiles are confirmed ready.
    const onMoveStart = () => {
      operaDetailRequestIdRef.current += 1;
      operaDetailAbortRef.current?.abort();
      operaDetailAbortRef.current = null;
      if (operaDetailShownRef.current) presentOperaOverview(map);
    };

    map.on("movestart", onMoveStart);
    map.on("moveend", scheduleDetailUpdate);
    return () => {
      if (operaMoveendPrewarmTimerRef.current !== null) {
        window.clearTimeout(operaMoveendPrewarmTimerRef.current);
        operaMoveendPrewarmTimerRef.current = null;
      }
      map.off("movestart", onMoveStart);
      map.off("moveend", scheduleDetailUpdate);
    };
  }, [mapReady, operaRadarFrame, presentOperaOverview, updateOperaDetailForMap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getSource(OBS_SOURCE)) return;
    const source = map.getSource(OBS_SOURCE) as unknown as MutableGeoJsonSource;
    source.setData(observationCollection(observations));
    renderMarkersRef.current();
  }, [mapReady, observations]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (!observationLayerVisible) {
      [CLUSTER_HALO, CLUSTER_CIRCLE, CLUSTER_LABEL, DOT_HALO, DOT_CIRCLE].forEach((id) => {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
      });
      markerRefs.current.forEach(({ marker }) => marker.remove());
      markerRefs.current.clear();
      return;
    }
    [CLUSTER_HALO, CLUSTER_CIRCLE, CLUSTER_LABEL, DOT_HALO, DOT_CIRCLE].forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "visible");
    });
    renderMarkersRef.current();
  }, [mapReady, observationLayerVisible]);

  useEffect(() => {
    let cancelled = false;
    async function setupPhotoMarkers() {
      const map = mapRef.current;
      if (!map || !mapReady) return;
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled) return;

      const render = () => {
        if (!observationLayerVisible) return;
        const currentMap = mapRef.current;
        if (!currentMap) return;
        const zoom = currentMap.getZoom();
        const bounds = currentMap.getBounds();
        const acceptedPoints: Array<{ x: number; y: number }> = [];
        const maxPhotoMarkers = currentMap.getCanvas().clientWidth < 700
          ? 10
          : zoom < 9
            ? 20
            : 28;
        const markerSpacing = zoom < 9 ? 76 : 62;
        const candidates = observations
          .filter((observation) => Boolean(observation.imageUrl && bounds.contains([observation.lon, observation.lat]) && zoom >= 8.25))
          .sort((a, b) => {
            if (a.id === selectedObservationId) return -1;
            if (b.id === selectedObservationId) return 1;
            return (b.intensity - a.intensity) || (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          });
        const keep = new Set<string>();

        for (const observation of candidates) {
          const point = currentMap.project([observation.lon, observation.lat]);
          const markerLimitReached = acceptedPoints.length >= maxPhotoMarkers;
          const tooClose = acceptedPoints.some((accepted) => Math.hypot(accepted.x - point.x, accepted.y - point.y) < markerSpacing);
          if (markerLimitReached && observation.id !== selectedObservationId) continue;
          if (tooClose && observation.id !== selectedObservationId) continue;
          acceptedPoints.push({ x: point.x, y: point.y });
          keep.add(observation.id);
          const phenomena = observationPhenomena(observation);
          const category = CATEGORY_META[phenomena[0]];
          const isFresh = Date.now() - new Date(observation.createdAt).getTime() < OBSERVATION_FRESH_WINDOW_MS;
          const existing = markerRefs.current.get(observation.id);
          if (existing) {
            existing.marker.setLngLat([observation.lon, observation.lat]);
            existing.element.style.setProperty("--marker-color", category.color);
            existing.element.style.setProperty("--marker-intensity", String(observation.intensity));
            existing.element.classList.toggle("atlas-photo-marker--selected", selectedObservationId === observation.id);
            existing.element.classList.toggle("atlas-photo-marker--fresh", isFresh);
            const age = existing.element.querySelector<HTMLElement>(".atlas-photo-marker__age");
            if (age) age.textContent = timeAgo(observation.createdAt);
            const eventCount = existing.element.querySelector<HTMLElement>(".atlas-photo-marker__events");
            if (eventCount) eventCount.textContent = phenomena.length > 1 ? `+${phenomena.length - 1}` : "";
            continue;
          }
          const element = document.createElement("button");
          element.type = "button";
          element.className = `atlas-photo-marker atlas-photo-marker--enter${selectedObservationId === observation.id ? " atlas-photo-marker--selected" : ""}${isFresh ? " atlas-photo-marker--fresh" : ""}`;
          element.style.setProperty("--marker-color", category.color);
          element.style.setProperty("--marker-intensity", String(observation.intensity));
          element.setAttribute("aria-label", `${phenomena.map((item) => CATEGORY_META[item].shortLabel).join(", ")}, ${timeAgo(observation.createdAt)}`);
          element.innerHTML = `<span class="atlas-photo-marker__image" style="background-image:url('${escapeAttribute(observation.imageUrl ?? "")}')"></span><span class="atlas-photo-marker__events">${phenomena.length > 1 ? `+${phenomena.length - 1}` : ""}</span><span class="atlas-photo-marker__age">${escapeAttribute(timeAgo(observation.createdAt))}</span>`;
          element.addEventListener("click", (event) => {
            event.stopPropagation();
            const newest = observationRef.current.get(observation.id) ?? observation;
            onObservationClickRef.current(newest);
          });
          // The marker's own box is exactly the photo circle (see CSS): anchoring at its
          // center makes that center — not some arbitrary corner — carry the real lat/lon,
          // so the visual pin lines up pixel-for-pixel with the geographic point.
          const marker = new maplibregl.Marker({ element, anchor: "center", offset: [0, 0], rotationAlignment: "viewport", pitchAlignment: "viewport" })
            .setLngLat([observation.lon, observation.lat]).addTo(currentMap);
          markerRefs.current.set(observation.id, { marker, element, observation });
        }
        markerRefs.current.forEach((managed, id) => {
          if (!keep.has(id)) { managed.marker.remove(); markerRefs.current.delete(id); }
        });
      };

      renderMarkersRef.current = render;
      render();
      map.on("moveend", render);
      map.on("zoomend", render);
      map.on("resize", render);
      // Ages and the "fresh" pulse are time-based, not just map/data-driven: a periodic tick
      // keeps the "X min" labels honest and turns the pulse off on its own after the window.
      const ageTimer = window.setInterval(render, OBSERVATION_MARKER_REFRESH_MS);
      return () => {
        map.off("moveend", render); map.off("zoomend", render); map.off("resize", render);
        window.clearInterval(ageTimer);
      };
    }
    let cleanup: (() => void) | undefined;
    void setupPhotoMarkers().then((result) => { cleanup = result; });
    return () => { cancelled = true; cleanup?.(); };
  }, [mapReady, observations, selectedObservationId, observationLayerVisible]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    let cancelled = false;

    // Live crosshair at the exact point a new observation would be published — center-anchored,
    // same as the photo markers, so it proves the calibration visually before the user commits.
    async function syncPendingMarker() {
      if (!pendingObservationPosition) {
        pendingMarkerRef.current?.remove();
        pendingMarkerRef.current = null;
        return;
      }
      const lngLat: [number, number] = [pendingObservationPosition.lon, pendingObservationPosition.lat];
      if (pendingMarkerRef.current) {
        pendingMarkerRef.current.setLngLat(lngLat);
        return;
      }
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !mapRef.current) return;
      const element = document.createElement("div");
      element.className = "atlas-target-marker";
      element.innerHTML = '<span class="atlas-target-marker__ring"></span><span class="atlas-target-marker__dot"></span>';
      pendingMarkerRef.current = new maplibregl.Marker({ element, anchor: "center" })
        .setLngLat(lngLat)
        .addTo(mapRef.current);
    }

    void syncPendingMarker();
    return () => { cancelled = true; };
  }, [mapReady, pendingObservationPosition]);

  return <div ref={containerRef} className="atlas-map atlas-map--weyra-shell-v1" aria-label="Carte météo interactive Weyra" />;
}
