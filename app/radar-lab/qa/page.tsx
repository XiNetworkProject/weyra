"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";

type Coordinate = [number, number];
type MapLibreCoordinates = [Coordinate, Coordinate, Coordinate, Coordinate];

type DbzhDiagnostic = {
  hdf5DataPath: string;
  datasetShape: number[];
  rawShape: number[];
  rawDtype: string;
  rawRange: { min: number | null; max: number | null };
  rawPercentiles: Record<string, number | null>;
  gain: number;
  offset: number;
  nodata: number | null;
  undetect: number | null;
  totalPixels: number;
  nodataPixelCount: number;
  undetectPixelCount: number;
  transparentPixelCount: number;
  visiblePrecipitationPixelCount: number;
  invalidColoredPixelCount: number;
  dbzhRange: { min: number | null; max: number | null };
  dbzhPercentiles: Record<string, number | null>;
  projection: string | null;
  projectionBounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
  geographicBounds: { west: number; south: number; east: number; north: number } | null;
  mapLibreCoordinates: MapLibreCoordinates | null;
  mapLibreCorners: Record<string, Coordinate> | null;
  checks: Record<string, boolean>;
  diagnostic: {
    dbzhDecodingLooksCorrect: boolean;
    transparencyLooksCorrect: boolean;
    paletteLikelyPrimaryIssue: boolean;
    smoothingLikelyIssue: boolean;
    fourCornerLaeaWarpLikelyIssue: boolean;
    mixedCauseLikely: boolean;
    summary: string;
  };
  warning: string | null;
  palette: string;
};

type QaReport = {
  ok: true;
  provider: "EUMETNET OPERA";
  product: "DBZH";
  timestamp: string;
  generatedAt: string;
  nativeGridImageUrl: string;
  currentMapOverlayImageUrl: string;
  atlasRuntimeImageUrl: string;
  metadataUrl: string;
  width: number;
  height: number;
  imageByteLength: number;
  diagnostic: DbzhDiagnostic;
  metadata: {
    projection: string | null;
    projectionBounds?: { minX: number; minY: number; maxX: number; maxY: number } | null;
    mapLibreCoordinates?: MapLibreCoordinates | null;
    geographicBounds?: { west: number; south: number; east: number; north: number } | null;
    warning: string | null;
  };
};

type QaError = {
  ok: false;
  error: string;
};

type FrameOption = {
  timestamp: string;
  status: string;
  imageUrl: string;
  metadataUrl: string;
};

type FrameManifest = {
  ok: boolean;
  frames?: FrameOption[];
};

type TileDisplayVersion = "v3c" | "v4a";

type TileStats = {
  loaded: number;
  pending: number;
  error: number;
};

type TileMeta = {
  ok: boolean;
  timestamp: string;
  z: number;
  x: number;
  y: number;
  tileBounds3857: Record<string, number>;
  tileBounds4326: Record<string, number>;
  targetProjection: "EPSG:3857";
  resampling: string;
  resamplingDBZH: string | null;
  resamplingAlpha: string | null;
  displayVersion: TileDisplayVersion;
  thresholdDbzh: number | null;
  gutterPixels: number | null;
  strongEchoPreservationUsed: boolean;
  sourceGridWidth: number | null;
  sourceGridHeight: number | null;
  sourceGridPixelSize: { x: number; y: number } | null;
  sourceValidPixels: number | null;
  validPixels: number;
  transparentPixels: number;
  cached: boolean;
  error?: string;
};

type LoadedTileMeta = TileMeta & {
  label: string;
};

function formatNumber(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }).format(value);
}

function formatInteger(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value);
}

function formatUtc(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

function flag(value: boolean) {
  return value ? "Oui" : "Non";
}

function imageUrl(url: string, key: string) {
  return `${url}${url.includes("?") ? "&" : "?"}qa=${encodeURIComponent(key)}`;
}

function boundsPolygon(bounds: DbzhDiagnostic["geographicBounds"]) {
  if (!bounds) return null;
  return [
    [bounds.west, bounds.north],
    [bounds.east, bounds.north],
    [bounds.east, bounds.south],
    [bounds.west, bounds.south],
    [bounds.west, bounds.north],
  ];
}

function lonLatToTile(lon: number, lat: number, z: number) {
  const latRadians = lat * Math.PI / 180;
  const scale = 2 ** z;
  return {
    z,
    x: Math.floor((lon + 180) / 360 * scale),
    y: Math.floor((1 - Math.log(Math.tan(latRadians) + 1 / Math.cos(latRadians)) / Math.PI) / 2 * scale),
  };
}

function tileTemplate(timestamp: string, version: TileDisplayVersion) {
  return `/api/radar/opera/tiles/${encodeURIComponent(timestamp)}/{z}/{x}/{y}?style=${version}`;
}

function tileUrl(timestamp: string, tile: { z: number; x: number; y: number }, version: TileDisplayVersion) {
  return `/api/radar/opera/tiles/${encodeURIComponent(timestamp)}/${tile.z}/${tile.x}/${tile.y}?style=${version}`;
}

function tileMetaUrl(timestamp: string, tile: { z: number; x: number; y: number }, version: TileDisplayVersion) {
  return `/api/radar/opera/tiles/${encodeURIComponent(timestamp)}/${tile.z}/${tile.x}/${tile.y}/meta?style=${version}`;
}

export default function OperaQaPage() {
  const [report, setReport] = useState<QaReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const tileMapContainerRef = useRef<HTMLDivElement | null>(null);
  const tileMapRef = useRef<MapLibreMap | null>(null);
  const [frameOptions, setFrameOptions] = useState<FrameOption[]>([]);
  const [selectedTileTimestamp, setSelectedTileTimestamp] = useState("");
  const [tileDisplayVersion, setTileDisplayVersion] = useState<TileDisplayVersion>("v4a");
  const [tilePrepared, setTilePrepared] = useState(false);
  const [tileLoading, setTileLoading] = useState(false);
  const [tileError, setTileError] = useState<string | null>(null);
  const [tileStats, setTileStats] = useState<TileStats>({ loaded: 0, pending: 0, error: 0 });
  const [lastTileMeta, setLastTileMeta] = useState<TileMeta | null>(null);
  const [tileMetas, setTileMetas] = useState<LoadedTileMeta[]>([]);
  const [tileMapZoom, setTileMapZoom] = useState(8);

  useEffect(() => {
    let cancelled = false;

    async function loadQa() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/radar/opera/qa", { cache: "no-store" });
        const payload = await response.json() as QaReport | QaError;
        if (!response.ok || !payload.ok) {
          throw new Error("error" in payload ? payload.error : `QA HTTP ${response.status}`);
        }
        if (!cancelled) setReport(payload);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Diagnostic OPERA indisponible.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadQa();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const qaReport = report;
    if (!qaReport) return;
    const stableReport: QaReport = qaReport;
    setSelectedTileTimestamp((current) => current || stableReport.timestamp);
    let cancelled = false;

    async function loadFrames() {
      try {
        const response = await fetch("/api/radar/opera/frames?count=12", { cache: "no-store" });
        const payload = await response.json() as FrameManifest;
        const readyFrames = (payload.frames ?? []).filter((frame) => frame.status === "ready");
        const merged = new Map<string, FrameOption>();
        merged.set(stableReport.timestamp, {
          timestamp: stableReport.timestamp,
          status: "ready",
          imageUrl: stableReport.atlasRuntimeImageUrl,
          metadataUrl: stableReport.metadataUrl,
        });
        readyFrames.forEach((frame) => merged.set(frame.timestamp, frame));
        if (!cancelled) setFrameOptions([...merged.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
      } catch {
        if (!cancelled) {
          setFrameOptions([{
            timestamp: stableReport.timestamp,
            status: "ready",
            imageUrl: stableReport.atlasRuntimeImageUrl,
            metadataUrl: stableReport.metadataUrl,
          }]);
        }
      }
    }

    void loadFrames();
    return () => {
      cancelled = true;
    };
  }, [report]);

  useEffect(() => {
    const qaReport = report;
    const coordinatesCandidate = qaReport?.diagnostic.mapLibreCoordinates;
    const geographicBounds = qaReport?.diagnostic.geographicBounds ?? null;
    const overlayUrlCandidate = qaReport?.currentMapOverlayImageUrl;
    if (!coordinatesCandidate || !overlayUrlCandidate || !mapContainerRef.current || mapRef.current) return;
    const coordinates: MapLibreCoordinates = coordinatesCandidate;
    const currentMapOverlayImageUrl: string = overlayUrlCandidate;

    let alive = true;

    async function createMap() {
      const maplibregl = (await import("maplibre-gl")).default;
      if (!alive || !mapContainerRef.current) return;

      const footprint = [...coordinates, coordinates[0]];
      const bbox = boundsPolygon(geographicBounds);
      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: "/map-styles/weyra-atlas-v2.json",
        center: [3.7, 50.85],
        zoom: 6.6,
        pitch: 0,
        bearing: 0,
        maxPitch: 0,
        dragRotate: false,
        renderWorldCopies: false,
      });

      map.touchZoomRotate.disableRotation();
      mapRef.current = map;

      map.on("load", () => {
        if (!alive) return;

        map.addSource("qa-current-overlay", {
          type: "image",
          url: imageUrl(currentMapOverlayImageUrl, "map"),
          coordinates,
        });
        map.addLayer({
          id: "qa-current-overlay-layer",
          type: "raster",
          source: "qa-current-overlay",
          paint: {
            "raster-opacity": 0.72,
            "raster-resampling": "linear",
          },
        });

        map.addSource("qa-footprints", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: { kind: "four-corner" },
                geometry: { type: "LineString", coordinates: footprint },
              },
              ...(bbox ? [{
                type: "Feature" as const,
                properties: { kind: "bbox" },
                geometry: { type: "LineString" as const, coordinates: bbox },
              }] : []),
            ],
          },
        });
        map.addLayer({
          id: "qa-footprint-line",
          type: "line",
          source: "qa-footprints",
          filter: ["==", ["get", "kind"], "four-corner"],
          paint: {
            "line-color": "#c084fc",
            "line-width": 2,
            "line-opacity": 0.95,
          },
        });
        map.addLayer({
          id: "qa-bbox-line",
          type: "line",
          source: "qa-footprints",
          filter: ["==", ["get", "kind"], "bbox"],
          paint: {
            "line-color": "#67e8f9",
            "line-width": 1.4,
            "line-dasharray": [2, 2],
            "line-opacity": 0.9,
          },
        });

        map.addSource("qa-corners", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: coordinates.map((coordinate, index) => ({
              type: "Feature" as const,
              properties: { index: index + 1 },
              geometry: { type: "Point" as const, coordinates: coordinate },
            })),
          },
        });
        map.addLayer({
          id: "qa-corners-circle",
          type: "circle",
          source: "qa-corners",
          paint: {
            "circle-radius": 5,
            "circle-color": "#f8fafc",
            "circle-stroke-color": "#a855f7",
            "circle-stroke-width": 2,
          },
        });
      });
    }

    void createMap();

    return () => {
      alive = false;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [report]);

  function selectTileDisplayVersion(version: TileDisplayVersion) {
    setTileDisplayVersion(version);
    const selectedMeta = tileMetas.find((meta) => meta.displayVersion === version && meta.z === 10)
      ?? tileMetas.find((meta) => meta.displayVersion === version)
      ?? null;
    setLastTileMeta(selectedMeta);
    setTilePrepared(tileMetas.length > 0);
  }

  async function prepareTestTiles() {
    const timestamp = selectedTileTimestamp || report?.timestamp;
    if (!timestamp) return;

    const versions: TileDisplayVersion[] = ["v3c", "v4a"];
    const testTiles = [
      { ...lonLatToTile(10.25, 52.38, 8), label: "Hanovre / Wolfsburg · régional z8" },
      { ...lonLatToTile(10.25, 52.38, 10), label: "Hanovre / Wolfsburg · rapproché z10" },
    ];

    const prewarmViewport = { west: 8.8, south: 51.65, east: 11.85, north: 53.05, zoom: 10 };

    setTileLoading(true);
    setTileError(null);
    setTilePrepared(false);
    setTileStats({ loaded: 0, pending: testTiles.length * versions.length, error: 0 });
    setTileMetas([]);

    try {
      const loadedMetas: LoadedTileMeta[] = [];

      for (const version of versions) {
        const prewarmResponse = await fetch("/api/radar/opera/tiles/prewarm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            timestamps: [timestamp],
            viewport: prewarmViewport,
            paddingTiles: 1,
            style: version,
          }),
        });
        const prewarmPayload = await prewarmResponse.json() as { ok?: boolean; error?: string };
        if (!prewarmResponse.ok || !prewarmPayload.ok) {
          throw new Error(prewarmPayload.error ?? `PrÃ©chauffage ${version} indisponible (${prewarmResponse.status}).`);
        }

        for (const tile of testTiles) {
          const tileResponse = await fetch(tileUrl(timestamp, tile, version), { cache: "no-store" });
          const contentType = tileResponse.headers.get("content-type") ?? "";
          if (!tileResponse.ok || !contentType.toLowerCase().includes("image/webp")) {
            throw new Error(`Tuile ${tile.z}/${tile.x}/${tile.y} ${version} invalide (${tileResponse.status}, ${contentType || "type inconnu"}).`);
          }

          const metaResponse = await fetch(tileMetaUrl(timestamp, tile, version), { cache: "no-store" });
          const meta = await metaResponse.json() as TileMeta;
          if (!metaResponse.ok || !meta.ok) {
            throw new Error(meta.error ?? `Diagnostic tuile ${tile.z}/${tile.x}/${tile.y} ${version} indisponible.`);
          }

          loadedMetas.push({ ...meta, label: tile.label });
          setTileStats((current) => ({
            loaded: current.loaded + 1,
            pending: Math.max(0, current.pending - 1),
            error: current.error,
          }));
        }
      }

      const selectedMeta = loadedMetas.find((meta) => meta.displayVersion === tileDisplayVersion && meta.z === 10)
        ?? loadedMetas.find((meta) => meta.displayVersion === tileDisplayVersion)
        ?? loadedMetas.at(-1)
        ?? null;
      setLastTileMeta(selectedMeta);
      setTileMetas(loadedMetas);
      setTilePrepared(true);
    } catch (prepareError) {
      setTileStats((current) => ({ ...current, pending: 0, error: current.error + 1 }));
      setTileError(prepareError instanceof Error ? prepareError.message : "Préparation des tuiles impossible.");
    } finally {
      setTileLoading(false);
    }
  }

  useEffect(() => {
    const qaReport = report;
    if (!qaReport || !tilePrepared || !selectedTileTimestamp || !tileMapContainerRef.current) return;

    let alive = true;

    async function createTileMap() {
      const maplibregl = (await import("maplibre-gl")).default;
      if (!alive || !tileMapContainerRef.current) return;

      if (tileMapRef.current) {
        tileMapRef.current.remove();
        tileMapRef.current = null;
      }

      const map = new maplibregl.Map({
        container: tileMapContainerRef.current,
        style: "/map-styles/weyra-atlas-v2.json",
        center: [10.25, 52.38],
        zoom: 8,
        minZoom: 3,
        maxZoom: 11,
        pitch: 0,
        bearing: 0,
        maxPitch: 0,
        dragRotate: false,
        renderWorldCopies: false,
      });

      tileMapRef.current = map;
      map.touchZoomRotate.disableRotation();
      map.on("moveend", () => setTileMapZoom(Number(map.getZoom().toFixed(2))));
      map.on("load", () => {
        if (!alive) return;
        setTileMapZoom(Number(map.getZoom().toFixed(2)));

        map.addSource("qa-mercator-tiles", {
          type: "raster",
          tiles: [tileTemplate(selectedTileTimestamp, tileDisplayVersion)],
          tileSize: 256,
          minzoom: 3,
          maxzoom: 11,
        });
        map.addLayer({
          id: "qa-mercator-tiles-layer",
          type: "raster",
          source: "qa-mercator-tiles",
          paint: {
            "raster-opacity": 0.62,
            "raster-resampling": "linear",
          },
        });
      });
      map.on("error", (event) => {
        const sourceId = (event as { sourceId?: string }).sourceId;
        if (sourceId === "qa-mercator-tiles") {
          setTileStats((current) => ({ ...current, error: current.error + 1 }));
        }
      });
    }

    void createTileMap();

    return () => {
      alive = false;
      tileMapRef.current?.remove();
      tileMapRef.current = null;
    };
  }, [report, selectedTileTimestamp, tileDisplayVersion, tilePrepared]);

  const statsRows = useMemo(() => {
    if (!report) return [];
    const diagnostic = report.diagnostic;
    return [
      ["Dataset DBZH utilisé", diagnostic.hdf5DataPath],
      ["dtype réel", diagnostic.rawDtype],
      ["shape réelle", diagnostic.rawShape.join(" x ")],
      ["min/max bruts", `${formatNumber(diagnostic.rawRange.min)} / ${formatNumber(diagnostic.rawRange.max)}`],
      ["gain / offset", `${formatNumber(diagnostic.gain, 4)} / ${formatNumber(diagnostic.offset, 4)}`],
      ["nodata / undetect", `${formatNumber(diagnostic.nodata)} / ${formatNumber(diagnostic.undetect)}`],
      ["pixels nodata", formatInteger(diagnostic.nodataPixelCount)],
      ["pixels undetect", formatInteger(diagnostic.undetectPixelCount)],
      ["pixels transparents", formatInteger(diagnostic.transparentPixelCount)],
      ["pixels pluie visibles", formatInteger(diagnostic.visiblePrecipitationPixelCount)],
      ["pixels invalides colorés", formatInteger(diagnostic.invalidColoredPixelCount)],
      ["min/max DBZH convertis", `${formatNumber(diagnostic.dbzhRange.min)} / ${formatNumber(diagnostic.dbzhRange.max)} dBZ`],
    ];
  }, [report]);

  return (
    <main className="qa-page">
      <style>{`
        .qa-page { height: 100vh; overflow: auto; padding: 28px; color: #edf4ff; background: radial-gradient(circle at 24% 8%, rgba(99,102,241,.20), transparent 28%), #04101d; }
        .qa-shell { max-width: 1320px; margin: 0 auto; }
        .qa-top { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; margin-bottom: 20px; }
        .qa-top h1 { margin: 0; font-size: 30px; letter-spacing: 0; }
        .qa-top p { margin: 8px 0 0; color: #9fb0c8; }
        .qa-pill { padding: 8px 11px; border: 1px solid rgba(255,255,255,.12); border-radius: 999px; background: rgba(255,255,255,.06); color: #dce8fb; font-size: 12px; font-weight: 750; white-space: nowrap; }
        .qa-grid { display: grid; grid-template-columns: minmax(0, 1fr) 410px; gap: 18px; }
        .qa-card { border: 1px solid rgba(255,255,255,.10); border-radius: 8px; background: rgba(8,15,28,.78); box-shadow: 0 22px 64px rgba(0,0,0,.32); backdrop-filter: blur(18px); }
        .qa-card header { padding: 15px 16px 0; }
        .qa-card h2 { margin: 0; font-size: 15px; letter-spacing: 0; }
        .qa-card p { margin: 7px 0 0; color: #9fb0c8; font-size: 12px; line-height: 1.5; }
        .qa-card__body { padding: 15px 16px 16px; }
        .qa-images { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .qa-image { overflow: hidden; border: 1px solid rgba(255,255,255,.10); border-radius: 8px; background: #020812; }
        .qa-image img { display: block; width: 100%; height: auto; image-rendering: auto; }
        .qa-image b { display: block; padding: 10px 12px; color: #dfeaff; font-size: 12px; }
        .qa-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .qa-table th, .qa-table td { padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,.08); text-align: left; vertical-align: top; }
        .qa-table th { width: 46%; color: #9fb0c8; font-weight: 650; }
        .qa-table td { color: #edf4ff; font-weight: 650; overflow-wrap: anywhere; }
        .qa-pre { max-height: 300px; overflow: auto; margin: 0; padding: 12px; border: 1px solid rgba(255,255,255,.10); border-radius: 8px; background: rgba(1,7,15,.72); color: #c9d8ed; font-size: 11px; line-height: 1.5; }
        .qa-map { height: 430px; overflow: hidden; border: 1px solid rgba(255,255,255,.10); border-radius: 8px; background: #020812; }
        .qa-map-buttons { display: flex; flex-wrap: wrap; gap: 9px; margin-top: 12px; }
        .qa-map-buttons button { padding: 9px 11px; color: #edf4ff; background: rgba(139,92,246,.18); border: 1px solid rgba(167,139,250,.30); border-radius: 8px; font-size: 12px; font-weight: 800; }
        .qa-controls { display: grid; grid-template-columns: minmax(180px, 1fr) auto; gap: 10px; align-items: end; margin-bottom: 12px; }
        .qa-controls label { display: grid; gap: 6px; color: #9fb0c8; font-size: 11px; font-weight: 750; }
        .qa-controls select { height: 38px; color: #edf4ff; background: rgba(1,7,15,.78); border: 1px solid rgba(255,255,255,.14); border-radius: 8px; padding: 0 10px; }
        .qa-primary { height: 38px; padding: 0 12px; color: #fff; background: rgba(139,92,246,.34); border: 1px solid rgba(167,139,250,.46); border-radius: 8px; font-size: 12px; font-weight: 850; }
        .qa-primary:disabled { opacity: .55; cursor: wait; }
        .qa-segment { display: flex; gap: 6px; margin: 10px 0 12px; }
        .qa-segment button { flex: 1; padding: 9px 10px; color: #c9d8ed; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.10); border-radius: 8px; font-size: 12px; font-weight: 800; }
        .qa-segment button.is-active { color: white; background: rgba(139,92,246,.28); border-color: rgba(167,139,250,.44); }
        .qa-tile-stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-top: 12px; }
        .qa-tile-stats div { padding: 9px; border: 1px solid rgba(255,255,255,.10); border-radius: 8px; background: rgba(255,255,255,.04); }
        .qa-tile-stats span { display: block; color: #9fb0c8; font-size: 10px; }
        .qa-tile-stats b { display: block; margin-top: 4px; font-size: 13px; }
        .qa-note { margin-top: 10px; color: #aebdd3; font-size: 12px; line-height: 1.5; }
        .qa-details { margin-top: 12px; }
        .qa-details summary { cursor: pointer; color: #edf4ff; font-size: 12px; font-weight: 800; }
        .qa-diagnostic { display: grid; gap: 9px; }
        .qa-diagnostic div { display: flex; justify-content: space-between; gap: 12px; padding-bottom: 9px; border-bottom: 1px solid rgba(255,255,255,.08); color: #9fb0c8; font-size: 12px; }
        .qa-diagnostic b { color: #edf4ff; }
        .qa-ok { color: #86efac !important; }
        .qa-warn { color: #fde68a !important; }
        .qa-error { color: #fecaca !important; }
        @media (max-width: 980px) {
          .qa-page { padding: 16px; }
          .qa-top { display: grid; }
          .qa-grid, .qa-images { grid-template-columns: 1fr; }
          .qa-controls, .qa-tile-stats { grid-template-columns: 1fr; }
          .qa-map { height: 340px; }
        }
      `}</style>
      <div className="qa-shell">
        <section className="qa-top">
          <div>
            <h1>Weyra Radar QA</h1>
            <p>Diagnostic réel du composite OPERA DBZH : décodage ODIM, transparence, rendu natif et overlay Atlas actuel.</p>
          </div>
          {report && <div className="qa-pill">{formatUtc(report.timestamp)} UTC</div>}
        </section>

        {loading && <section className="qa-card"><div className="qa-card__body">Génération du diagnostic OPERA réel...</div></section>}
        {error && <section className="qa-card"><div className="qa-card__body qa-error">{error}</div></section>}

        {report && (
          <div className="qa-grid">
            <div>
              <section className="qa-card">
                <header>
                  <h2>Rendus QA réels</h2>
                  <p>Les deux images viennent du même HDF5 DBZH. Le rendu Atlas correspond au WebP envoyé aujourd’hui à MapLibre.</p>
                </header>
                <div className="qa-card__body qa-images">
                  <div className="qa-image">
                    <b>Native-grid · {report.width} x {report.height}</b>
                    <img src={imageUrl(report.nativeGridImageUrl, report.timestamp)} alt="Rendu OPERA DBZH en grille native" />
                  </div>
                  <div className="qa-image">
                    <b>Current-map-overlay · WebP Atlas</b>
                    <img src={imageUrl(report.currentMapOverlayImageUrl, report.timestamp)} alt="Rendu OPERA DBZH actuellement envoyé à Atlas" />
                  </div>
                </div>
              </section>

              <section className="qa-card" style={{ marginTop: 18 }}>
                <header>
                  <h2>Carte de cohérence géographique</h2>
                  <p>Image actuelle posée aux quatre coins, coins en blanc, contour quatre coins en violet, bbox géographique en cyan pointillé.</p>
                </header>
                <div className="qa-card__body">
                  <div ref={mapContainerRef} className="qa-map" />
                  <div className="qa-map-buttons">
                    <button onClick={() => mapRef.current?.flyTo({ center: [3.3, 50.86], zoom: 7.1, duration: 650 })}>Lille / Dunkerque / Belgique</button>
                    <button onClick={() => mapRef.current?.flyTo({ center: [7.2, 51.6], zoom: 6.2, duration: 650 })}>Allemagne / Pays-Bas</button>
                  </div>
                </div>
              </section>

              <section className="qa-card" style={{ marginTop: 18 }}>
                <header>
                  <h2>Validation tuiles Web Mercator</h2>
                  <p>Comparaison QA entre les tuiles Weyra V3c et V4a, depuis la même frame OPERA locale, sans superposition des rendus.</p>
                </header>
                <div className="qa-card__body">
                  <div className="qa-controls">
                    <label>
                      Frame réelle prête
                      <select value={selectedTileTimestamp} onChange={(event) => { setSelectedTileTimestamp(event.target.value); setTilePrepared(false); setLastTileMeta(null); setTileMetas([]); }}>
                        {(frameOptions.length ? frameOptions : [{ timestamp: report.timestamp, status: "ready", imageUrl: report.atlasRuntimeImageUrl, metadataUrl: report.metadataUrl }]).map((frame) => (
                          <option key={frame.timestamp} value={frame.timestamp}>{formatUtc(frame.timestamp)}</option>
                        ))}
                      </select>
                    </label>
                    <button className="qa-primary" onClick={() => void prepareTestTiles()} disabled={tileLoading || !selectedTileTimestamp}>
                      {tileLoading ? "Préparation..." : "Préparer les tuiles de test"}
                    </button>
                  </div>

                  {tileError && <p className="qa-error">{tileError}</p>}

                  <div className="qa-segment" aria-label="Mode de validation radar">
                    <button className={tileDisplayVersion === "v3c" ? "is-active" : ""} onClick={() => selectTileDisplayVersion("v3c")}>Avant · V3c</button>
                    <button className={tileDisplayVersion === "v4a" ? "is-active" : ""} onClick={() => selectTileDisplayVersion("v4a")}>Nouveau · V4a</button>
                  </div>

                  <div ref={tileMapContainerRef} className="qa-map" />
                  <div className="qa-map-buttons">
                    <button onClick={() => tileMapRef.current?.flyTo({ center: [10.25, 52.38], zoom: 8, duration: 650 })}>Hanovre régional z8</button>
                    <button onClick={() => tileMapRef.current?.flyTo({ center: [10.25, 52.38], zoom: 10, duration: 650 })}>Hanovre rapproché z10</button>
                  </div>

                  <div className="qa-tile-stats">
                    <div><span>Zoom carte</span><b>{formatNumber(tileMapZoom, 2)}</b></div>
                    <div><span>Version</span><b>{lastTileMeta?.displayVersion ?? tileDisplayVersion}</b></div>
                    <div><span>Resampling DBZH</span><b>{lastTileMeta?.resamplingDBZH ?? "n/a"}</b></div>
                    <div><span>Resampling alpha</span><b>{lastTileMeta?.resamplingAlpha ?? "n/a"}</b></div>
                    <div><span>Seuil</span><b>{lastTileMeta?.thresholdDbzh !== null && lastTileMeta?.thresholdDbzh !== undefined ? `${lastTileMeta.thresholdDbzh} dBZ` : "n/a"}</b></div>
                    <div><span>Gutter</span><b>{lastTileMeta?.gutterPixels ?? "n/a"} px</b></div>
                    <div><span>Résolution native</span><b>{lastTileMeta?.sourceGridWidth && lastTileMeta?.sourceGridHeight ? `${lastTileMeta.sourceGridWidth} x ${lastTileMeta.sourceGridHeight}` : "n/a"}</b></div>
                    <div><span>Pixel source</span><b>{lastTileMeta?.sourceGridPixelSize ? `${formatNumber(lastTileMeta.sourceGridPixelSize.x / 1000, 2)} km` : "n/a"}</b></div>
                    <div><span>Préservation &gt;35 dBZ</span><b>{lastTileMeta ? flag(lastTileMeta.strongEchoPreservationUsed) : "n/a"}</b></div>
                    <div><span>Tuiles chargées</span><b>{tileStats.loaded}</b></div>
                    <div><span>En attente</span><b>{tileStats.pending}</b></div>
                    <div><span>Erreurs</span><b>{tileStats.error}</b></div>
                    <div><span>Pixels visibles</span><b>{lastTileMeta ? formatInteger(lastTileMeta.validPixels) : "n/a"}</b></div>
                    <div><span>Pixels transparents</span><b>{lastTileMeta ? formatInteger(lastTileMeta.transparentPixels) : "n/a"}</b></div>
                  </div>
                  {tileMetas.length > 0 && (
                    <table className="qa-table" style={{ marginTop: 12 }}>
                      <tbody>
                        <tr>
                          <th>Tuile testée</th>
                          <td>
                            {tileMetas.map((meta) => (
                              <div key={`${meta.label}-${meta.displayVersion}-${meta.z}-${meta.x}-${meta.y}`} style={{ marginBottom: 8 }}>
                                <b>{meta.label}</b>
                                {" · "}
                                {meta.displayVersion}
                                {" · "}
                                {meta.resamplingDBZH ?? "n/a"}
                                {" · native "}
                                {meta.sourceGridWidth && meta.sourceGridHeight ? `${meta.sourceGridWidth} x ${meta.sourceGridHeight}` : "n/a"}
                                {" · forts >35 dBZ "}
                                {flag(meta.strongEchoPreservationUsed)}
                                {" · visibles "}
                                {formatInteger(meta.validPixels)}
                                {" · transparents "}
                                {formatInteger(meta.transparentPixels)}
                              </div>
                            ))}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                  <p className="qa-note">
                    Tuiles Web Mercator EPSG:3857 générées depuis une vraie trame OPERA DBZH. La comparaison prépare exactement Hanovre / Wolfsburg en z=8 régional et z=10 rapproché, pour V3c et V4a sur le même timestamp. URL template interne : {selectedTileTimestamp ? tileTemplate(selectedTileTimestamp, tileDisplayVersion) : "n/a"}
                  </p>

                  <details className="qa-details">
                    <summary>Diagnostic de la dernière tuile chargée</summary>
                    <pre className="qa-pre">{lastTileMeta ? JSON.stringify(lastTileMeta, null, 2) : "Aucune tuile test chargée."}</pre>
                  </details>
                </div>
              </section>

              <section className="qa-card" style={{ marginTop: 18 }}>
                <header>
                  <h2>Projection et emprise</h2>
                </header>
                <div className="qa-card__body">
                  <table className="qa-table">
                    <tbody>
                      <tr><th>Projection source</th><td>{report.diagnostic.projection ?? "n/a"}</td></tr>
                      <tr><th>Bbox projetée</th><td><pre className="qa-pre">{JSON.stringify(report.diagnostic.projectionBounds, null, 2)}</pre></td></tr>
                      <tr><th>Quatre coins MapLibre EPSG:4326</th><td><pre className="qa-pre">{JSON.stringify(report.diagnostic.mapLibreCorners, null, 2)}</pre></td></tr>
                      <tr><th>Bbox géographique</th><td><pre className="qa-pre">{JSON.stringify(report.diagnostic.geographicBounds, null, 2)}</pre></td></tr>
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            <aside>
              <section className="qa-card">
                <header>
                  <h2>Statistiques DBZH</h2>
                </header>
                <div className="qa-card__body">
                  <table className="qa-table">
                    <tbody>
                      {statsRows.map(([label, value]) => (
                        <tr key={label}><th>{label}</th><td>{value}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="qa-card" style={{ marginTop: 18 }}>
                <header>
                  <h2>Percentiles bruts</h2>
                </header>
                <div className="qa-card__body">
                  <pre className="qa-pre">{JSON.stringify(report.diagnostic.rawPercentiles, null, 2)}</pre>
                </div>
              </section>

              <section className="qa-card" style={{ marginTop: 18 }}>
                <header>
                  <h2>Percentiles DBZH convertis</h2>
                </header>
                <div className="qa-card__body">
                  <pre className="qa-pre">{JSON.stringify(report.diagnostic.dbzhPercentiles, null, 2)}</pre>
                </div>
              </section>

              <section className="qa-card" style={{ marginTop: 18 }}>
                <header>
                  <h2>Diagnostic attendu</h2>
                  <p>{report.diagnostic.diagnostic.summary}</p>
                </header>
                <div className="qa-card__body qa-diagnostic">
                  <div>Décodage DBZH correct <b className={report.diagnostic.diagnostic.dbzhDecodingLooksCorrect ? "qa-ok" : "qa-error"}>{flag(report.diagnostic.diagnostic.dbzhDecodingLooksCorrect)}</b></div>
                  <div>Nodata / undetect transparents <b className={report.diagnostic.diagnostic.transparencyLooksCorrect ? "qa-ok" : "qa-error"}>{flag(report.diagnostic.diagnostic.transparencyLooksCorrect)}</b></div>
                  <div>Palette cause principale <b>{flag(report.diagnostic.diagnostic.paletteLikelyPrimaryIssue)}</b></div>
                  <div>Lissage / rééchantillonnage en cause <b className="qa-warn">{flag(report.diagnostic.diagnostic.smoothingLikelyIssue)}</b></div>
                  <div>LAEA étirée par quatre coins en cause <b className="qa-warn">{flag(report.diagnostic.diagnostic.fourCornerLaeaWarpLikelyIssue)}</b></div>
                  <div>Mélange de causes probable <b className="qa-warn">{flag(report.diagnostic.diagnostic.mixedCauseLikely)}</b></div>
                </div>
              </section>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
