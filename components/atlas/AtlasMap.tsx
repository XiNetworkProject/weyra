"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import type { LocationSelection, Observation, RadarFrame } from "@/lib/types";
import { CATEGORY_META } from "@/components/atlas/constants";

type AtlasMapProps = {
  location: LocationSelection;
  observations: Observation[];
  selectedObservationId: string | null;
  radarFrames: RadarFrame[];
  radarFrameIndex: number;
  radarHost: string;
  radarVisible: boolean;
  observationLayerVisible: boolean;
  onMapReady: (map: MapLibreMap) => void;
  onMapClick: (coords: { lat: number; lon: number }) => void;
  onObservationClick: (observation: Observation) => void;
};

type MutableRasterSource = { setTiles: (tiles: string[]) => void };
type MutableGeoJsonSource = { setData: (data: unknown) => void };
type ManagedMarker = { marker: Marker; element: HTMLButtonElement; observation: Observation };
type RadarSlot = "a" | "b";

const RADAR_SLOTS: RadarSlot[] = ["a", "b"];
const OBS_SOURCE = "weyra-observations";
const CLUSTER_HALO = "weyra-observation-cluster-halo";
const CLUSTER_CIRCLE = "weyra-observation-cluster";
const CLUSTER_LABEL = "weyra-observation-cluster-label";
const DOT_HALO = "weyra-observation-dot-halo";
const DOT_CIRCLE = "weyra-observation-dot";

const INITIAL_CAMERA = {
  // Stable North/Belgium framing: Calais / Dunkerque / Lille / Tournai / Arras.
  center: [2.78, 50.68] as [number, number],
  zoom: 8.55,
};

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
    features: observations.map((observation) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [observation.lon, observation.lat] },
      properties: {
        id: observation.id,
        category: observation.category,
        intensity: observation.intensity,
        // Seed entries deliberately use compact map dots. Only a real uploaded photo gets a photo marker.
        hasPhoto: Boolean(observation.imageUrl && !observation.isSeed),
      },
    })),
  };
}

function tuneAtlasBaseMap(map: MapLibreMap) {
  // The base vector style remains data-driven. This pass gives it Weyra’s navy ocean, blue roads and subtle labels
  // without relying on a CSS filter that would also distort the radar.
  const layers = map.getStyle().layers ?? [];
  for (const layer of layers) {
    const id = layer.id.toLowerCase();
    try {
      if (layer.type === "background") {
        map.setPaintProperty(layer.id, "background-color", "#061426");
      }
      if (layer.type === "fill") {
        if (/(water|ocean|sea|lake|river)/.test(id)) {
          map.setPaintProperty(layer.id, "fill-color", "#001d3b");
          map.setPaintProperty(layer.id, "fill-opacity", 1);
        } else if (/(land|park|landcover|wood|forest|building)/.test(id)) {
          map.setPaintProperty(layer.id, "fill-color", "#071526");
        }
      }
      if (layer.type === "line") {
        if (/(motorway|trunk|primary|road|street|highway)/.test(id)) {
          map.setPaintProperty(layer.id, "line-color", "#174267");
          map.setPaintProperty(layer.id, "line-opacity", 0.44);
        }
        if (/(boundary|admin)/.test(id)) {
          map.setPaintProperty(layer.id, "line-color", "#345e7b");
          map.setPaintProperty(layer.id, "line-opacity", 0.36);
        }
      }
      if (layer.type === "symbol") {
        if (/(state|region|province|country)/.test(id)) {
          // Atlas keeps only local context labels; big country / region text destroys the radar composition.
          map.setLayoutProperty(layer.id, "visibility", "none");
        } else if (/(place|city|town|village|settlement|road)/.test(id)) {
          map.setPaintProperty(layer.id, "text-color", "#c9dcef");
          map.setPaintProperty(layer.id, "text-halo-color", "#061426");
          map.setPaintProperty(layer.id, "text-halo-width", 1.1);
          map.setPaintProperty(layer.id, "text-opacity", 0.78);
          if (/(city|town|village|settlement)/.test(id)) {
            map.setLayoutProperty(layer.id, "text-size", ["interpolate", ["linear"], ["zoom"], 7, 10, 9.5, 12, 12, 14]);
          }
        }
      }
    } catch {
      // A style can omit a property for a given layer; skipping it is expected.
    }
  }
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
      "circle-radius": ["step", ["get", "point_count"], 19, 8, 23, 24, 28],
      "circle-color": "#071b2e",
      "circle-opacity": 0.92,
      "circle-stroke-width": 3,
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
      "circle-radius": ["step", ["get", "point_count"], 14, 8, 17, 24, 21],
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
      "text-size": 11,
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
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 7.2, 6, 9.5, 9],
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
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 7.2, 3.5, 9.5, 5.5],
      "circle-color": ["match", ["get", "category"],
        "orage", "#ffd46a",
        "pluie", "#5aaaff",
        "grêle", "#79e3ff",
        "rafales", "#ad85ff",
        "neige", "#dcf7ff",
        "nuage", "#ff9d64",
        "#62f2dc"],
      "circle-opacity": 1,
    },
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
  observationLayerVisible,
  onMapReady,
  onMapClick,
  onObservationClick,
}: AtlasMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRefs = useRef<Map<string, ManagedMarker>>(new Map());
  const observationRef = useRef<Map<string, Observation>>(new Map());
  const onMapReadyRef = useRef(onMapReady);
  const onMapClickRef = useRef(onMapClick);
  const onObservationClickRef = useRef(onObservationClick);
  const initialLocationRef = useRef(location);
  const activeRadarSlotRef = useRef<RadarSlot>("a");
  const appliedRadarPathRef = useRef<string | null>(null);
  const radarRequestIdRef = useRef(0);
  const renderMarkersRef = useRef<() => void>(() => undefined);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => { onMapReadyRef.current = onMapReady; }, [onMapReady]);
  useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);
  useEffect(() => { onObservationClickRef.current = onObservationClick; }, [onObservationClick]);
  useEffect(() => { observationRef.current = new Map(observations.map((observation) => [observation.id, observation])); }, [observations]);

  useEffect(() => {
    let alive = true;
    async function createMap() {
      if (!containerRef.current || mapRef.current) return;
      const maplibregl = (await import("maplibre-gl")).default;
      if (!alive || !containerRef.current) return;
      const initial = initialLocationRef.current;
      const isInitialLille = Math.abs(initial.lat - 50.6292) < 0.01 && Math.abs(initial.lon - 3.0573) < 0.01;
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
        center: isInitialLille ? INITIAL_CAMERA.center : [initial.lon, initial.lat],
        zoom: isInitialLille ? INITIAL_CAMERA.zoom : 8.5,
        bearing: 0,
        pitch: 0,
        maxPitch: 0,
        minZoom: 6.4,
        maxZoom: 15,
        dragRotate: false,
        renderWorldCopies: false,
      });

      map.touchZoomRotate.disableRotation();
      map.on("load", () => {
        if (!alive) return;
        tuneAtlasBaseMap(map);
        ensureObservationLayers(map);
        mapRef.current = map;
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
      markerRefs.current.forEach(({ marker }) => marker.remove());
      markerRefs.current.clear();
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
    if (!nextSource) return;
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
        const candidates = observations
          .filter((observation) => Boolean(observation.imageUrl && !observation.isSeed && bounds.contains([observation.lon, observation.lat]) && zoom >= 8.25))
          .sort((a, b) => {
            if (a.id === selectedObservationId) return -1;
            if (b.id === selectedObservationId) return 1;
            return (b.intensity - a.intensity) || (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          });
        const keep = new Set<string>();

        for (const observation of candidates) {
          const point = currentMap.project([observation.lon, observation.lat]);
          const tooClose = acceptedPoints.some((accepted) => Math.hypot(accepted.x - point.x, accepted.y - point.y) < 61);
          if (tooClose && observation.id !== selectedObservationId) continue;
          acceptedPoints.push({ x: point.x, y: point.y });
          keep.add(observation.id);
          const category = CATEGORY_META[observation.category];
          const existing = markerRefs.current.get(observation.id);
          if (existing) {
            existing.marker.setLngLat([observation.lon, observation.lat]);
            existing.element.classList.toggle("atlas-photo-marker--selected", selectedObservationId === observation.id);
            const age = existing.element.querySelector<HTMLElement>(".atlas-photo-marker__age");
            if (age) age.textContent = timeAgo(observation.createdAt);
            continue;
          }
          const element = document.createElement("button");
          element.type = "button";
          element.className = `atlas-photo-marker${selectedObservationId === observation.id ? " atlas-photo-marker--selected" : ""}`;
          element.style.setProperty("--marker-color", category.color);
          element.innerHTML = `<span class="atlas-photo-marker__image" style="background-image:url('${escapeAttribute(observation.imageUrl ?? "")}')"></span><span class="atlas-photo-marker__kind">${category.icon}</span><span class="atlas-photo-marker__age">${escapeAttribute(timeAgo(observation.createdAt))}</span>`;
          element.addEventListener("click", (event) => {
            event.stopPropagation();
            const newest = observationRef.current.get(observation.id) ?? observation;
            onObservationClickRef.current(newest);
          });
          const marker = new maplibregl.Marker({ element, anchor: "bottom", offset: [0, 0], rotationAlignment: "viewport", pitchAlignment: "viewport" })
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
      return () => {
        map.off("moveend", render); map.off("zoomend", render); map.off("resize", render);
      };
    }
    let cleanup: (() => void) | undefined;
    void setupPhotoMarkers().then((result) => { cleanup = result; });
    return () => { cancelled = true; cleanup?.(); };
  }, [mapReady, observations, selectedObservationId, observationLayerVisible]);

  return <div ref={containerRef} className="atlas-map" aria-label="Carte météo interactive Weyra" />;
}
