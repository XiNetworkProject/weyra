"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import AtlasMap from "@/components/atlas/AtlasMap";
import ObservationDrawer from "@/components/atlas/ObservationDrawer";
import ObservationDetail from "@/components/atlas/ObservationDetail";
import {
  IconArrowUp,
  IconBell,
  IconChevronDown,
  IconCloud,
  IconDotsVertical,
  IconDroplet,
  IconMaximize,
  IconMenu,
  IconMinus,
  IconNavigation,
  IconPause,
  IconPlay,
  IconPlus,
  IconRadar,
  IconSearch,
  IconThermometer,
  IconUsers,
  IconWind,
} from "@/components/atlas/icons";
import { createObservation, isSupabaseConfigured, loadObservations, subscribeToObservations, uploadObservationPhoto } from "@/lib/observations";
import { fetchWeather, searchLocations, weatherCodeInfo } from "@/lib/weather";
import type {
  Coordinates,
  LocationSelection,
  MapLibreImageCoordinates,
  Observation,
  ObservationCategory,
  OperaRadarHistoryFrame,
  OperaRadarMapTransition,
  OperaRadarStatus,
  OperaScanPackListResponse,
  OperaScanPackSummary,
  RadarFrame,
  WeatherSnapshot,
} from "@/lib/types";

const RAINVIEWER_FALLBACK_ENABLED = false;
const OPERA_FRAME_COUNT = 12;
const OPERA_FADE_MS = 650;
const OPERA_LOOP_FADE_MS = 250;
const OPERA_DISPLAY_MS_BY_SPEED = {
  0.5: 1800,
  1: 900,
  2: 450,
} as const;

type OperaPlaybackSpeed = keyof typeof OPERA_DISPLAY_MS_BY_SPEED;
type OperaHistoryState = "idle" | "preparing" | "preloading" | "ready" | "unavailable";

const INITIAL_LOCATION: LocationSelection = {
  name: "Lille",
  country: "France",
  admin: "Hauts-de-France",
  lat: 50.6292,
  lon: 3.0573,
};

function formatRadarTime(frame: RadarFrame | undefined) {
  if (!frame) return "—";
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(frame.time * 1000));
}

function scanAgeMinutes(frame: RadarFrame | undefined) {
  if (!frame) return null;
  return Math.max(0, Math.floor((Date.now() - frame.time * 1000) / 60_000));
}

function formatOperaRadarTime(timestamp: string | null) {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
    timeZoneName: "short",
  }).format(new Date(timestamp));
}

function formatOperaTimelineTime(timestamp: string | null) {
  if (!timestamp) return "--:--";
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(new Date(timestamp));
}

function coordinatesCoverAtlasArea(coordinates: MapLibreImageCoordinates) {
  const longitudes = coordinates.map(([lon]) => lon);
  const latitudes = coordinates.map(([, lat]) => lat);
  return Math.min(...longitudes) <= 2 &&
    Math.max(...longitudes) >= 5 &&
    Math.min(...latitudes) <= 50 &&
    Math.max(...latitudes) >= 52;
}

function packManifestUrl(timestamp: string) {
  return `/api/radar/opera/packs/${encodeURIComponent(timestamp)}/manifest`;
}

const OPERA_PRELOAD_MAX_ZOOM = 7;
const OPERA_PRELOAD_MIN_ZOOM = 3;
const OPERA_PRELOAD_MAX_TILES_PER_FRAME = 48;

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function lonToTileX(lon: number, z: number) {
  const tileCount = 2 ** z;
  return clampNumber(Math.floor(((lon + 180) / 360) * tileCount), 0, tileCount - 1);
}

function latToTileY(lat: number, z: number) {
  const tileCount = 2 ** z;
  const clamped = clampNumber(lat, -85.05112878, 85.05112878);
  const radians = clamped * Math.PI / 180;
  const y = (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2 * tileCount;
  return clampNumber(Math.floor(y), 0, tileCount - 1);
}

// Overview tiles (z<=7) covering the given viewport, with one tile of margin. These are the
// exact static URLs MapLibre will request during the timeline animation.
function overviewTilesForViewport(map: MapLibreMap): Array<{ z: number; x: number; y: number }> {
  const zoom = clampNumber(Math.floor(map.getZoom()) + 1, OPERA_PRELOAD_MIN_ZOOM, OPERA_PRELOAD_MAX_ZOOM);
  const bounds = map.getBounds();
  const minX = lonToTileX(bounds.getWest(), zoom) - 1;
  const maxX = lonToTileX(bounds.getEast(), zoom) + 1;
  const minY = latToTileY(bounds.getNorth(), zoom) - 1;
  const maxY = latToTileY(bounds.getSouth(), zoom) + 1;
  const tileCount = 2 ** zoom;
  const tiles: Array<{ z: number; x: number; y: number }> = [];

  for (let x = Math.max(0, minX); x <= Math.min(tileCount - 1, maxX); x += 1) {
    for (let y = Math.max(0, minY); y <= Math.min(tileCount - 1, maxY); y += 1) {
      tiles.push({ z: zoom, x, y });
      if (tiles.length >= OPERA_PRELOAD_MAX_TILES_PER_FRAME) return tiles;
    }
  }

  return tiles;
}

// A published scan pack becomes a timeline frame directly: its overview tiles are already on
// disk server-side, so no preparation of any kind is needed before showing it on the map.
function scanPackToHistoryFrame(pack: OperaScanPackSummary): OperaRadarHistoryFrame | null {
  const coverage = pack.coverage;
  if (!coverage) return null;

  const mapLibreCoordinates: MapLibreImageCoordinates = [
    [coverage.west, coverage.north],
    [coverage.east, coverage.north],
    [coverage.east, coverage.south],
    [coverage.west, coverage.south],
  ];
  if (!coordinatesCoverAtlasArea(mapLibreCoordinates)) return null;

  return {
    timestamp: pack.timestamp,
    status: "ready",
    imageUrl: packManifestUrl(pack.timestamp),
    metadataUrl: packManifestUrl(pack.timestamp),
    width: null,
    height: null,
    imageByteLength: pack.packBytes ?? null,
    hasGeoreferencing: true,
    mapLibreCoordinates,
    geographicBounds: coverage,
    projectionBounds: null,
    projection: "EPSG:3857",
    pack,
  };
}

function scanStatus(frame: RadarFrame | undefined) {
  const age = scanAgeMinutes(frame);
  if (age === null) return "Connexion radar…";
  return `Scan ${formatRadarTime(frame)} · il y a ${age} min`;
}

export default function AtlasApp() {
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null);
  const [location, setLocation] = useState<LocationSelection>(INITIAL_LOCATION);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [radarFrames, setRadarFrames] = useState<RadarFrame[]>([]);
  const [radarHost, setRadarHost] = useState("");
  const [radarProvider, setRadarProvider] = useState("rainviewer");
  const [radarCadenceMinutes, setRadarCadenceMinutes] = useState(10);
  const [radarFrameIndex, setRadarFrameIndex] = useState(0);
  const [radarPlaying, setRadarPlaying] = useState(false);
  const [radarFollowingLive, setRadarFollowingLive] = useState(true);
  const [radarVisible, setRadarVisible] = useState(true);
  const [operaRadarStatus, setOperaRadarStatus] = useState<OperaRadarStatus>({ available: false, timestamp: null });
  const [observationsVisible, setObservationsVisible] = useState(true);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [selectedObservation, setSelectedObservation] = useState<Observation | null>(null);
  const [reportPosition, setReportPosition] = useState<Coordinates>({ lat: INITIAL_LOCATION.lat, lon: INITIAL_LOCATION.lon });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<LocationSelection[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreLayersOpen, setMoreLayersOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const radarFramesRef = useRef<RadarFrame[]>([]);
  const radarFrameIndexRef = useRef(0);
  const radarFollowingLiveRef = useRef(true);
  const [operaHistoryState, setOperaHistoryState] = useState<OperaHistoryState>("idle");
  const [operaHistoryFrames, setOperaHistoryFrames] = useState<OperaRadarHistoryFrame[]>([]);
  const [operaFrameIndex, setOperaFrameIndex] = useState(0);
  const [operaMapFrameIndex, setOperaMapFrameIndex] = useState(0);
  const [operaPlaying, setOperaPlaying] = useState(false);
  const [operaLoopEnabled, setOperaLoopEnabled] = useState(true);
  const [operaPlaybackSpeed, setOperaPlaybackSpeed] = useState<OperaPlaybackSpeed>(1);
  const [operaProgressLabel, setOperaProgressLabel] = useState("Préparation du radar");
  const [operaLoadedCount, setOperaLoadedCount] = useState(0);
  const [operaTransition, setOperaTransition] = useState<OperaRadarMapTransition | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const operaHistoryFramesRef = useRef<OperaRadarHistoryFrame[]>([]);
  const operaFrameIndexRef = useRef(0);
  const operaTimerRef = useRef<number | null>(null);
  const operaDominanceTimerRef = useRef<number | null>(null);
  const operaFinishTimerRef = useRef<number | null>(null);
  const operaTransitionIdRef = useRef(0);
  const operaPlayingRef = useRef(false);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout((showToast as typeof showToast & { timer?: number }).timer);
    (showToast as typeof showToast & { timer?: number }).timer = window.setTimeout(() => setToast(null), 3400);
  }, []);

  const refreshObservations = useCallback(async () => {
    try {
      const items = await loadObservations();
      setObservations(items);
    } catch (error) {
      console.error(error);
      showToast("Impossible de charger les observations partagées.");
    }
  }, [showToast]);

  const refreshWeather = useCallback(async (target: LocationSelection) => {
    try {
      setWeather(await fetchWeather(target));
    } catch (error) {
      console.error(error);
      showToast("La météo est momentanément indisponible.");
    }
  }, [showToast]);

  const refreshRadar = useCallback(async () => {
    try {
      // The browser talks only to Weyra's server gateway. It can safely switch from
      // RainViewer fallback to a 5-minute Météo-France adapter without exposing credentials.
      const minuteKey = Math.floor(Date.now() / 60_000);
      const response = await fetch(`/api/radar/timeline?weyra=${minuteKey}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Radar provider unavailable");
      const data = await response.json() as { host?: string; radar?: { past?: RadarFrame[] }; past?: RadarFrame[]; provider?: string; cadenceMinutes?: number };
      const frames = (data.radar?.past ?? data.past ?? []) as RadarFrame[];
      if (!frames.length) throw new Error("Radar provider returned no frames");

      const previousFrames = radarFramesRef.current;
      const previousTime = previousFrames[radarFrameIndexRef.current]?.time;
      const shouldFollowLive = radarFollowingLiveRef.current || previousFrames.length === 0;
      let nextIndex = Math.max(0, frames.length - 1);
      if (!shouldFollowLive && previousTime) {
        nextIndex = frames.reduce((bestIndex, frame, index) => (
          Math.abs(frame.time - previousTime) < Math.abs(frames[bestIndex].time - previousTime) ? index : bestIndex
        ), 0);
      }

      radarFramesRef.current = frames;
      radarFrameIndexRef.current = nextIndex;
      setRadarFrames(frames);
      setRadarHost(String(data.host ?? ""));
      setRadarProvider(String(data.provider ?? "rainviewer"));
      setRadarCadenceMinutes(Number(data.cadenceMinutes ?? 10));
      setRadarFrameIndex(nextIndex);
    } catch (error) {
      console.error(error);
      showToast("Le radar est momentanément indisponible.");
    }
  }, [showToast]);

  const clearOperaTimers = useCallback(() => {
    if (operaTimerRef.current !== null) {
      window.clearTimeout(operaTimerRef.current);
      operaTimerRef.current = null;
    }
    if (operaDominanceTimerRef.current !== null) {
      window.clearTimeout(operaDominanceTimerRef.current);
      operaDominanceTimerRef.current = null;
    }
    if (operaFinishTimerRef.current !== null) {
      window.clearTimeout(operaFinishTimerRef.current);
      operaFinishTimerRef.current = null;
    }
  }, []);

  const stopOperaPlayback = useCallback(() => {
    operaPlayingRef.current = false;
    setOperaPlaying(false);
    if (operaTimerRef.current !== null) {
      window.clearTimeout(operaTimerRef.current);
      operaTimerRef.current = null;
    }
  }, []);

  const transitionToOperaIndex = useCallback((nextIndex: number, options: { immediate?: boolean; fromPlayback?: boolean } = {}) => {
    if (operaHistoryFrames.length < 1) return;
    const boundedIndex = Math.max(0, Math.min(operaHistoryFrames.length - 1, nextIndex));
    const currentIndex = Math.max(0, Math.min(operaHistoryFrames.length - 1, operaFrameIndex));
    const nextFrame = operaHistoryFrames[boundedIndex];
    if (!nextFrame) return;

    clearOperaTimers();

    if (boundedIndex === currentIndex || options.immediate || prefersReducedMotion) {
      setOperaTransition(null);
      setOperaFrameIndex(boundedIndex);
      setOperaMapFrameIndex(boundedIndex);
      setOperaRadarStatus((current) => ({
        ...current,
        available: true,
        timestamp: nextFrame.timestamp,
        historyStatus: "ready",
        historyReadyCount: operaHistoryFrames.length,
        historyTotalCount: OPERA_FRAME_COUNT,
      }));
      return;
    }

    const wrapsForward = currentIndex === operaHistoryFrames.length - 1 && boundedIndex === 0;
    const durationMs = wrapsForward ? OPERA_LOOP_FADE_MS : OPERA_FADE_MS;
    const transitionId = ++operaTransitionIdRef.current;
    setOperaTransition({ id: transitionId, toFrame: nextFrame, durationMs });

    operaDominanceTimerRef.current = window.setTimeout(() => {
      setOperaFrameIndex(boundedIndex);
      setOperaRadarStatus((current) => ({
        ...current,
        available: true,
        timestamp: nextFrame.timestamp,
        historyStatus: "ready",
        historyReadyCount: operaHistoryFrames.length,
        historyTotalCount: OPERA_FRAME_COUNT,
      }));
      operaDominanceTimerRef.current = null;
    }, Math.max(80, Math.floor(durationMs * 0.56)));

    operaFinishTimerRef.current = window.setTimeout(() => {
      setOperaMapFrameIndex(boundedIndex);
      setOperaTransition(null);
      operaFinishTimerRef.current = null;
    }, durationMs + 70);

    if (!options.fromPlayback) stopOperaPlayback();
  }, [clearOperaTimers, operaFrameIndex, operaHistoryFrames, prefersReducedMotion, stopOperaPlayback]);

  const goToOperaAdjacent = useCallback((direction: 1 | -1, options: { fromPlayback?: boolean } = {}) => {
    if (operaHistoryFrames.length < 2) return;
    const atStart = operaFrameIndex <= 0;
    const atEnd = operaFrameIndex >= operaHistoryFrames.length - 1;

    if (direction > 0 && atEnd) {
      if (!operaLoopEnabled) {
        stopOperaPlayback();
        return;
      }
      transitionToOperaIndex(0, options);
      return;
    }

    if (direction < 0 && atStart) {
      transitionToOperaIndex(operaHistoryFrames.length - 1, options);
      return;
    }

    transitionToOperaIndex(operaFrameIndex + direction, options);
  }, [operaFrameIndex, operaHistoryFrames.length, operaLoopEnabled, stopOperaPlayback, transitionToOperaIndex]);

  const selectOperaIndex = useCallback((nextIndex: number) => {
    stopOperaPlayback();
    transitionToOperaIndex(nextIndex, { immediate: true });
  }, [stopOperaPlayback, transitionToOperaIndex]);

  const goToLatestOperaFrame = useCallback(() => {
    if (!operaHistoryFrames.length) return;
    selectOperaIndex(operaHistoryFrames.length - 1);
  }, [operaHistoryFrames.length, selectOperaIndex]);

  useEffect(() => {
    // The overlay may never stay on screen forever: even if a request hangs, it clears after 8 s.
    const failsafe = window.setTimeout(() => setLoading(false), 8_000);
    const radarTask = RAINVIEWER_FALLBACK_ENABLED ? refreshRadar() : Promise.resolve();
    void Promise.all([refreshWeather(INITIAL_LOCATION), radarTask, refreshObservations()]).finally(() => {
      window.clearTimeout(failsafe);
      setLoading(false);
    });
    return () => window.clearTimeout(failsafe);
  }, [refreshObservations, refreshRadar, refreshWeather]);

  useEffect(() => {
    operaPlayingRef.current = operaPlaying;
  }, [operaPlaying]);

  useEffect(() => {
    operaHistoryFramesRef.current = operaHistoryFrames;
  }, [operaHistoryFrames]);

  useEffect(() => {
    operaFrameIndexRef.current = operaFrameIndex;
  }, [operaFrameIndex]);

  useEffect(() => {
    // Silent warm-up of the browser HTTP cache: the overview tiles of every timeline scan for
    // the current viewport are fetched once in the background (immutable, ~40 bytes to a few KB
    // each). The first animation loop then reads everything from cache and stays fluid.
    if (!mapInstance || operaHistoryFrames.length < 2) return;
    let cancelled = false;
    let timer: number | null = null;

    const preload = async () => {
      if (cancelled) return;
      const tiles = overviewTilesForViewport(mapInstance);
      const currentTimestamp = operaHistoryFramesRef.current[operaFrameIndexRef.current]?.timestamp ?? null;
      const urls: string[] = [];
      for (const frame of operaHistoryFrames) {
        // The frame on screen is loaded by the map itself — warming it here would only
        // compete with those requests on the browser's per-host connection limit.
        if (frame.timestamp === currentTimestamp) continue;
        const encoded = encodeURIComponent(frame.timestamp);
        for (const tile of tiles) {
          urls.push(`/api/radar/opera/packs/${encoded}/overview/${tile.z}/${tile.x}/${tile.y}`);
        }
      }
      // Small sequential batches: the warm-up trickles in and never starves the connections
      // MapLibre needs for the tiles that are actually visible right now.
      for (let index = 0; index < urls.length; index += 6) {
        if (cancelled) return;
        await Promise.all(urls.slice(index, index + 6).map((url) => (
          fetch(url, { cache: "force-cache" }).then((response) => response.blob()).catch(() => undefined)
        )));
      }
    };

    const schedule = (delayMs: number) => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        void preload();
      }, delayMs);
    };
    const scheduleAfterMove = () => schedule(900);

    // Let the visible frame finish loading before warming the other scans.
    schedule(1500);
    mapInstance.on("moveend", scheduleAfterMove);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      mapInstance.off("moveend", scheduleAfterMove);
    };
  }, [mapInstance, operaHistoryFrames]);

  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(motionQuery.matches);
    updatePreference();
    motionQuery.addEventListener("change", updatePreference);
    return () => motionQuery.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => () => clearOperaTimers(), [clearOperaTimers]);

  useEffect(() => {
    // Scan-pack driven history: the timeline is fed exclusively by packs whose overview tiles
    // are already published on disk. The first ready pack shows up immediately — no POST that
    // blocks the first paint, no per-frame metadata round trips, no client-side preparation.
    let cancelled = false;

    const sleep = (delayMs: number) => new Promise<void>((resolve) => {
      window.setTimeout(resolve, delayMs);
    });

    const readPacks = async () => {
      const response = await fetch("/api/radar/opera/packs", { cache: "no-store" });
      const payload = await response.json() as OperaScanPackListResponse;
      if (!response.ok || !payload.ok || !Array.isArray(payload.packs)) {
        throw new Error(`OPERA scan packs list HTTP ${response.status}.`);
      }
      return payload;
    };

    const triggerMaintenance = () => {
      // Fire-and-forget: the server builds missing packs in the background (202 immediately).
      void fetch("/api/radar/opera/packs/maintenance", { method: "POST", cache: "no-store" })
        .catch((error) => console.debug("OPERA pack maintenance trigger failed", error));
    };

    const showFirstRadarPreparation = () => {
      setOperaLoadedCount(0);
      setOperaHistoryState("preparing");
      setOperaProgressLabel("Préparation du premier radar…");
      setOperaRadarStatus((current) => ({
        ...current,
        historyStatus: "preparing",
        historyReadyCount: 0,
        historyTotalCount: OPERA_FRAME_COUNT,
      }));
    };

    const applyPacks = (packs: OperaScanPackSummary[]) => {
      const frames = packs
        .filter((pack) => pack.status === "ready" && pack.baseTileCount > 0)
        .map(scanPackToHistoryFrame)
        .filter((frame): frame is OperaRadarHistoryFrame => frame !== null)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        .slice(-OPERA_FRAME_COUNT);

      if (!frames.length) {
        showFirstRadarPreparation();
        return 0;
      }

      const previousFrames = operaHistoryFramesRef.current;
      const changed = previousFrames.length !== frames.length ||
        frames.some((frame, index) => previousFrames[index]?.timestamp !== frame.timestamp);

      if (changed) {
        const previousIndex = operaFrameIndexRef.current;
        const wasAtLatest = previousFrames.length === 0 || previousIndex >= previousFrames.length - 1;
        const previousTimestamp = previousFrames[previousIndex]?.timestamp ?? null;
        let nextIndex = frames.length - 1;
        if (!wasAtLatest && previousTimestamp) {
          const found = frames.findIndex((frame) => frame.timestamp === previousTimestamp);
          if (found >= 0) nextIndex = found;
        }
        setOperaHistoryFrames(frames);
        setOperaFrameIndex(nextIndex);
        setOperaMapFrameIndex(nextIndex);
      }

      setOperaLoadedCount(frames.length);
      if (frames.length >= 2) {
        setOperaHistoryState("ready");
        setOperaProgressLabel(frames.length >= OPERA_FRAME_COUNT
          ? "Historique 1 h prêt"
          : `Historique partiel ${frames.length} / ${OPERA_FRAME_COUNT}`);
      } else {
        setOperaHistoryState("preparing");
        setOperaProgressLabel("Préparation des scans suivants…");
      }
      setOperaRadarStatus((current) => ({
        ...current,
        available: true,
        timestamp: current.timestamp ?? frames[frames.length - 1]?.timestamp ?? null,
        historyStatus: frames.length >= 2 ? "ready" : "preparing",
        historyReadyCount: frames.length,
        historyTotalCount: OPERA_FRAME_COUNT,
      }));
      return frames.length;
    };

    async function watchScanPacks() {
      let readyCount = 0;

      try {
        readyCount = applyPacks((await readPacks()).packs);
      } catch (error) {
        console.warn("OPERA scan packs list unavailable", error);
        if (!operaHistoryFramesRef.current.length) showFirstRadarPreparation();
      }
      if (cancelled) return;

      // The first ready pack (if any) is already on screen at this point. Everything below is
      // silent background work: build the next scans, then keep the pack list fresh.
      triggerMaintenance();

      const startedAt = Date.now();
      let lastMaintenanceAt = Date.now();

      while (!cancelled) {
        await sleep(readyCount >= OPERA_FRAME_COUNT ? 60_000 : 4_000);
        if (cancelled) return;

        if (Date.now() - lastMaintenanceAt >= 5 * 60_000) {
          triggerMaintenance();
          lastMaintenanceAt = Date.now();
        }

        try {
          readyCount = applyPacks((await readPacks()).packs);
        } catch (error) {
          console.debug("OPERA scan packs poll failed", error);
        }

        if (!readyCount && Date.now() - startedAt > 8 * 60_000) {
          setOperaHistoryState("unavailable");
          setOperaProgressLabel("Historique radar indisponible");
          setOperaRadarStatus((current) => ({
            ...current,
            historyStatus: "unavailable",
            historyReadyCount: 0,
            historyTotalCount: OPERA_FRAME_COUNT,
          }));
          return;
        }
      }
    }

    void watchScanPacks();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToObservations(() => {
      void refreshObservations();
      showToast("La carte communautaire a été mise à jour.");
    });
    return unsubscribe;
  }, [refreshObservations, showToast]);

  useEffect(() => {
    // One-minute polling detects a new upstream scan quickly. The displayed scan time stays honest.
    const interval = window.setInterval(() => {
      void refreshWeather(location);
      if (RAINVIEWER_FALLBACK_ENABLED) void refreshRadar();
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [location, refreshRadar, refreshWeather]);

  useEffect(() => {
    if (!radarPlaying || radarFrames.length < 2) return;
    const interval = window.setInterval(() => {
      setRadarFrameIndex((previous) => {
        const next = previous >= radarFrames.length - 1 ? 0 : previous + 1;
        radarFrameIndexRef.current = next;
        radarFollowingLiveRef.current = false;
        setRadarFollowingLive(false);
        return next;
      });
    }, 620);
    return () => window.clearInterval(interval);
  }, [radarPlaying, radarFrames.length]);

  useEffect(() => {
    if (!operaPlaying || operaHistoryState !== "ready" || operaHistoryFrames.length < 2 || operaTransition) return;
    operaTimerRef.current = window.setTimeout(() => {
      operaTimerRef.current = null;
      goToOperaAdjacent(1, { fromPlayback: true });
    }, OPERA_DISPLAY_MS_BY_SPEED[operaPlaybackSpeed]);
    return () => {
      if (operaTimerRef.current !== null) {
        window.clearTimeout(operaTimerRef.current);
        operaTimerRef.current = null;
      }
    };
  }, [goToOperaAdjacent, operaHistoryFrames.length, operaHistoryState, operaPlaybackSpeed, operaPlaying, operaTransition]);

  useEffect(() => {
    if (query.trim().length < 3) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }
    const timeout = window.setTimeout(async () => {
      const results = await searchLocations(query);
      setSearchResults(results);
      setSearchOpen(true);
    }, 260);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    document.documentElement.requestFullscreen().catch(() => showToast("Le plein écran n’est pas disponible ici."));
  }, [showToast]);

  const currentWeatherInfo = weather ? weatherCodeInfo(weather.weatherCode) : { label: "Chargement…", icon: "🌦️" };
  const currentRadarFrame = radarFrames[radarFrameIndex];
  const latestRadarFrame = radarFrames.at(-1);
  const latestAge = scanAgeMinutes(latestRadarFrame);
  const radarIsFresh = latestAge !== null && latestAge <= Math.max(7, radarCadenceMinutes + 2);
  const radarProgress = radarFrames.length < 2 ? 100 : (radarFrameIndex / (radarFrames.length - 1)) * 100;
  const liveCommunity = isSupabaseConfigured();
  const usesMeteoFranceRadar = radarProvider.toLowerCase().includes("meteo");
  const radarSourceText = usesMeteoFranceRadar ? "Radar France · 5 min" : "Radar public · 10 min";
  const operaRadarTime = formatOperaRadarTime(operaRadarStatus.timestamp);
  const operaRadarAvailable = operaRadarStatus.available;
  const operaTimelineFrame = operaHistoryFrames[operaFrameIndex] ?? null;
  const operaMapFrame = operaHistoryFrames[operaMapFrameIndex] ?? null;
  const operaCanUseHistory = operaHistoryState === "ready" && operaHistoryFrames.length >= 2;
  const operaHasFullHistory = operaCanUseHistory && operaHistoryFrames.length >= OPERA_FRAME_COUNT;
  const operaMapFrameIndexSafe = operaHistoryFrames.length
    ? Math.max(0, Math.min(operaHistoryFrames.length - 1, operaMapFrameIndex))
    : 0;
  const operaNextMapFrame = operaCanUseHistory
    ? operaHistoryFrames[(operaMapFrameIndexSafe + 1) % operaHistoryFrames.length] ?? null
    : null;
  const operaCanStep = operaCanUseHistory;
  const operaTimelineMax = Math.max(0, operaHistoryFrames.length - 1);
  const operaTimelineProgress = operaTimelineMax < 1 ? 100 : (operaFrameIndex / operaTimelineMax) * 100;
  const operaDisplayTime = formatOperaTimelineTime(operaTimelineFrame?.timestamp ?? operaRadarStatus.timestamp);
  const operaTilesPreparing = operaRadarStatus.historyStatus === "preloading" && operaHistoryState === "ready";
  const operaTimelineStatus = operaTilesPreparing
    ? "Préparation radar…"
    : operaCanUseHistory
    ? operaHasFullHistory ? "Historique 1 h · 12 scans" : `Historique partiel ${operaHistoryFrames.length} / ${OPERA_FRAME_COUNT} scans`
    : operaHistoryState === "preparing" || operaHistoryState === "preloading"
      ? operaProgressLabel
    : operaHistoryState === "unavailable"
        ? "Radar tuilé indisponible"
        : operaRadarAvailable
          ? "Préparation du radar"
          : "OPERA indisponible";
  const operaLayerDetail = operaCanUseHistory
    ? "DBZH · tuiles Weyra"
    : operaRadarAvailable
      ? `DBZH · tuiles Weyra${operaRadarTime ? ` · ${operaRadarTime}` : ""}`
      : "Radar tuilé indisponible";
  const radarPanelStatus = operaRadarAvailable
    ? `Radar OPERA · DBZH · tuiles Weyra${operaRadarTime ? ` · ${operaRadarTime}` : ""}`
    : "Radar tuilé indisponible";
  const operaTimeLabels = useMemo(() => {
    if (operaHistoryFrames.length < 2) return [];
    const labelCount = 4;
    return Array.from({ length: labelCount }, (_, index) => {
      const frameIndex = Math.round((index / (labelCount - 1)) * (operaHistoryFrames.length - 1));
      return formatOperaTimelineTime(operaHistoryFrames[frameIndex]?.timestamp ?? null);
    });
  }, [operaHistoryFrames]);

  const onMapReady = useCallback((map: MapLibreMap) => {
    mapRef.current = map;
    setMapInstance(map);
  }, []);
  const onMapClick = useCallback((coords: Coordinates) => { setReportPosition(coords); }, []);

  const chooseLocation = useCallback(async (next: LocationSelection, writeQuery = true) => {
    setLocation(next);
    setReportPosition({ lat: next.lat, lon: next.lon });
    setQuery(writeQuery ? next.name : "");
    setSearchOpen(false);
    setSelectedObservation(null);
    await refreshWeather(next);
  }, [refreshWeather]);

  const useCurrentPosition = useCallback(() => {
    if (!navigator.geolocation) {
      showToast("La géolocalisation n’est pas disponible dans ce navigateur.");
      return;
    }
    showToast("Recherche de ta position…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void chooseLocation({ name: "Position actuelle", country: "", lat: position.coords.latitude, lon: position.coords.longitude }, false);
        showToast("Position utilisée. Elle n’est jamais publiée automatiquement.");
      },
      () => showToast("Position indisponible ou autorisation refusée."),
      { enableHighAccuracy: true, timeout: 9_000, maximumAge: 300_000 },
    );
  }, [chooseLocation, showToast]);

  const publishObservation = useCallback(async (input: {
    category: ObservationCategory;
    intensity: number;
    nickname: string;
    details: string;
    photo: File | null;
    preciseLocation: boolean;
  }) => {
    if (input.photo && input.photo.size > 2_500_000) {
      showToast("La photo est limitée à 2,5 Mo pour le prototype.");
      return;
    }
    const imageUrl = input.photo ? await uploadObservationPhoto(input.photo) : null;
    const observation: Observation = {
      id: crypto.randomUUID(),
      nickname: input.nickname.trim().slice(0, 24) || "Membre Weyra",
      category: input.category,
      intensity: input.intensity,
      details: input.details.trim().slice(0, 350) || null,
      imageUrl,
      lat: input.preciseLocation ? reportPosition.lat : Math.round(reportPosition.lat * 1000) / 1000,
      lon: input.preciseLocation ? reportPosition.lon : Math.round(reportPosition.lon * 1000) / 1000,
      createdAt: new Date().toISOString(),
      likes: 0,
      place: location.name,
    };
    await createObservation(observation);
    await refreshObservations();
    setDrawerOpen(false);
    setSelectedObservation(observation);
    mapRef.current?.flyTo({ center: [observation.lon, observation.lat], zoom: Math.max(mapRef.current.getZoom(), 10.5), essential: true });
    showToast(liveCommunity ? "Observation publiée pour la communauté Weyra." : "Observation enregistrée localement. Configure Supabase pour la partager.");
  }, [liveCommunity, location.name, refreshObservations, reportPosition.lat, reportPosition.lon, showToast]);

  const selectedWithLatestLike = useMemo(() => {
    if (!selectedObservation) return null;
    return observations.find((item) => item.id === selectedObservation.id) ?? selectedObservation;
  }, [observations, selectedObservation]);

  return (
    <main className="atlas-app">
      <AtlasMap
        location={location}
        observations={observations}
        selectedObservationId={selectedObservation?.id ?? null}
        radarFrames={radarFrames}
        radarFrameIndex={radarFrameIndex}
        radarHost={radarHost}
        radarVisible={radarVisible}
        operaRadarFrame={operaMapFrame}
        operaRadarNextFrame={operaNextMapFrame}
        operaRadarTransition={operaTransition}
        operaPlaybackActive={operaPlaying}
        observationLayerVisible={observationsVisible}
        onMapReady={onMapReady}
        onOperaRadarStatus={setOperaRadarStatus}
        onMapClick={onMapClick}
        onObservationClick={setSelectedObservation}
      />

      <header className="atlas-topbar">
        <div className="atlas-brand">weyra</div>
        <div className="atlas-search">
          <IconSearch className="atlas-search__icon" />
          <input ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une ville" aria-label="Rechercher une ville" />
          <kbd>⌘K</kbd>
          {searchOpen && (
            <div className="atlas-search__results">
              {searchResults.length ? searchResults.map((item) => (
                <button key={`${item.name}-${item.lat}-${item.lon}`} onClick={() => void chooseLocation(item)}>
                  {item.name}<small>{[item.admin, item.country].filter(Boolean).join(" · ")}</small>
                </button>
              )) : <div className="atlas-search__empty">Aucun lieu trouvé.</div>}
            </div>
          )}
        </div>
        <div className="atlas-topbar__spacer" />
        <button className="atlas-round-button" onClick={() => showToast("Les espaces communauté arrivent après Atlas Core.")} title="Communauté"><IconUsers /></button>
        <button className="atlas-round-button" onClick={() => showToast("Aucune alerte Weyra active.")} title="Notifications"><IconBell /><i>3</i></button>
        <div className="atlas-menu">
          <button className="atlas-round-button" onClick={() => setMenuOpen((value) => !value)} title="Menu" aria-expanded={menuOpen}><IconMenu /></button>
          {menuOpen && (
            <>
              <button className="atlas-menu__backdrop" onClick={() => setMenuOpen(false)} aria-label="Fermer le menu" />
              <div className="atlas-menu__panel">
                <button onClick={() => { setMenuOpen(false); setDrawerOpen(true); }}><IconPlus />Ajouter une observation</button>
                <button onClick={() => { setMenuOpen(false); useCurrentPosition(); }}><IconNavigation />Utiliser ma position</button>
                <button onClick={() => { setMenuOpen(false); showToast("Les espaces communauté arrivent après Atlas Core."); }}><IconUsers />Communauté</button>
              </div>
            </>
          )}
        </div>
      </header>

      <section className="atlas-weather-card">
        <header className="atlas-weather-card__header">
          <h1>
            {location.country ? `${location.name}, ${location.country}` : location.name}
            <button onClick={useCurrentPosition} title="Utiliser ma position"><IconNavigation /></button>
          </h1>
          <button className="atlas-weather-card__options" onClick={() => showToast("Les options du lieu arrivent bientôt.")} title="Options"><IconDotsVertical /></button>
        </header>
        <div className="atlas-weather-card__main">
          <span className="atlas-weather-card__glyph">{currentWeatherInfo.icon}</span>
          <strong>{weather ? `${Math.round(weather.temperature)}°` : "—"}</strong>
        </div>
        <p className="atlas-weather-card__label">{currentWeatherInfo.label}</p>
        <small className="atlas-weather-card__feels">Ressenti {weather ? `${Math.round(weather.apparentTemperature)}°` : "—"}</small>
        <div className="atlas-weather-card__stats">
          <div>
            <IconWind className="atlas-weather-card__stat-icon" />
            <div>
              <span>Vent</span>
              <b>
                {weather ? `${Math.round(weather.windSpeed)} km/h` : "—"}
                {weather && <IconArrowUp className="atlas-weather-card__wind-arrow" style={{ transform: `rotate(${Math.round(weather.windDirection) + 180}deg)` }} />}
              </b>
            </div>
          </div>
          <div>
            <IconDroplet className="atlas-weather-card__stat-icon" />
            <div>
              <span>Pluie</span>
              <b>{weather ? `${weather.precipitation.toFixed(1)} mm/h` : "—"}</b>
            </div>
          </div>
        </div>
      </section>

      <section className="atlas-layers">
        <div className="atlas-layers__title">Couches</div>
        <button className={radarVisible ? "is-active" : ""} onClick={() => setRadarVisible((value) => !value)} title={radarPanelStatus}>
          <span className="atlas-layers__icon atlas-layers__icon--radar"><IconRadar /></span>
          <span className="atlas-layers__copy"><b>Radar OPERA</b><small>{operaLayerDetail}</small></span>
        </button>
        <button onClick={() => showToast("La couche vent arrive bientôt.")}>
          <span className="atlas-layers__icon"><IconWind /></span><span className="atlas-layers__copy"><b>Vent</b></span>
        </button>
        <button onClick={() => showToast("La couche température arrive bientôt.")}>
          <span className="atlas-layers__icon"><IconThermometer /></span><span className="atlas-layers__copy"><b>Température</b></span>
        </button>
        <button className={observationsVisible ? "is-active" : ""} onClick={() => setObservationsVisible((value) => !value)}>
          <span className="atlas-layers__icon"><IconCloud /></span><span className="atlas-layers__copy"><b>Observations</b></span>{observationsVisible && <i />}
        </button>
        {moreLayersOpen && (
          <>
            <button className="is-disabled" onClick={() => showToast("Flux local désactivé tant qu’une vraie grille vectorielle n’est pas branchée.")}>
              <span className="atlas-layers__icon"><IconWind /></span><span className="atlas-layers__copy"><b>Flux local</b></span><em>Bientôt</em>
            </button>
            <button className="is-disabled" onClick={() => showToast("Température, nuages et qualité de l’air arrivent dans les couches suivantes.")}>
              <span className="atlas-layers__icon"><IconDroplet /></span><span className="atlas-layers__copy"><b>Qualité de l’air</b></span><em>Bientôt</em>
            </button>
          </>
        )}
        <button className={`atlas-layers__more${moreLayersOpen ? " is-open" : ""}`} onClick={() => setMoreLayersOpen((value) => !value)}>
          <b>Plus de couches</b><IconChevronDown className="atlas-layers__chevron" />
        </button>
      </section>

      <section className="atlas-map-tools">
        <button className="atlas-map-tools__locate" onClick={() => mapRef.current?.flyTo({ center: [location.lon, location.lat], zoom: Math.max(mapRef.current.getZoom(), 8.45), essential: true })} title="Recentrer la carte"><IconNavigation /></button>
        <div className="atlas-map-tools__zoom">
          <button onClick={() => mapRef.current?.zoomIn()} title="Zoomer"><IconPlus /></button>
          <button onClick={() => mapRef.current?.zoomOut()} title="Dézoomer"><IconMinus /></button>
        </div>
      </section>

      <section className="atlas-radar-legend">
        <b>Réflectivité radar (dBZ)</b><div /><small><span>4</span><span>10</span><span>20</span><span>30</span><span>40</span><span>50+</span></small>
      </section>

      <section className="atlas-timeline" aria-label="Timeline radar OPERA">
        <button
          className="atlas-timeline__play"
          onClick={() => setOperaPlaying((value) => !value)}
          disabled={!operaCanUseHistory}
          title={operaPlaying ? "Mettre en pause" : "Lire l'historique radar"}
        >{operaPlaying ? <IconPause /> : <IconPlay />}</button>
        <div className="atlas-timeline__bar">
          <div className="atlas-timeline__identity">
            <b>Radar OPERA</b>
            <span>DBZH · tuiles Weyra</span>
          </div>
          <div className="atlas-timeline__steps" aria-label="Navigation des scans OPERA">
            <button className="atlas-timeline__step" onClick={() => goToOperaAdjacent(-1)} disabled={!operaCanStep} title="Scan précédent">‹</button>
            <button className="atlas-timeline__step" onClick={() => goToOperaAdjacent(1)} disabled={!operaCanStep} title="Scan suivant">›</button>
          </div>
          <div className="atlas-timeline__track-zone">
            <div
              className="atlas-timeline__track"
              onPointerDown={(event) => {
                if (!operaCanStep) return;
                const rect = event.currentTarget.getBoundingClientRect();
                const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
                selectOperaIndex(Math.round(ratio * operaTimelineMax));
              }}
            >
              <i style={{ width: `${Math.max(0, Math.min(100, operaTimelineProgress))}%` }} />
              <div className="atlas-timeline__dots" aria-hidden="true">
                {Array.from({ length: OPERA_FRAME_COUNT }, (_, index) => {
                  const mappedIndex = OPERA_FRAME_COUNT > 1 && operaTimelineMax > 0
                    ? Math.round((index / (OPERA_FRAME_COUNT - 1)) * operaTimelineMax)
                    : 0;
                  return <span key={index} className={operaCanUseHistory && mappedIndex === operaFrameIndex ? "is-active" : ""} />;
                })}
              </div>
              <input
                type="range"
                min="0"
                max={operaTimelineMax}
                value={Math.min(operaFrameIndex, operaTimelineMax)}
                disabled={!operaCanStep}
                onPointerDown={stopOperaPlayback}
                onKeyDown={stopOperaPlayback}
                onChange={(event) => selectOperaIndex(Number(event.target.value))}
                aria-label="Choisir un scan OPERA"
              />
              <span
                className="atlas-timeline__bubble"
                style={{ left: `clamp(29px, ${Math.max(0, Math.min(100, operaTimelineProgress))}%, calc(100% - 29px))` }}
              >{operaDisplayTime}</span>
            </div>
            <div className="atlas-timeline__labels">
              {operaCanUseHistory ? (
                <>
                  {operaTimeLabels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}
                  <i className="atlas-timeline__cursor" style={{ left: `${Math.max(0, Math.min(100, operaTimelineProgress))}%` }} />
                </>
              ) : (
                <span className="atlas-timeline__status">{operaTimelineStatus}</span>
              )}
            </div>
          </div>
          <button className="atlas-timeline__latest" onClick={goToLatestOperaFrame} disabled={!operaCanStep}>Dernier</button>
          <button
            className={`atlas-timeline__loop${operaLoopEnabled ? " is-active" : ""}`}
            onClick={() => setOperaLoopEnabled((value) => !value)}
            disabled={!operaCanStep}
          >Loop</button>
          <div className="atlas-timeline__speed" aria-label="Vitesse de lecture OPERA">
            {([0.5, 1, 2] as const).map((speed) => (
              <button
                key={speed}
                className={operaPlaybackSpeed === speed ? "is-active" : ""}
                onClick={() => setOperaPlaybackSpeed(speed)}
                disabled={!operaCanStep}
              >{speed}x</button>
            ))}
          </div>
          <div className="atlas-timeline__status">
            <strong>{operaDisplayTime}</strong>
            <span>{operaTimelineStatus}</span>
          </div>
          <button className="atlas-timeline__fullscreen" onClick={toggleFullscreen} title="Plein écran"><IconMaximize /></button>
        </div>
      </section>

      <ObservationDetail observation={selectedWithLatestLike} onClose={() => setSelectedObservation(null)} />
      <ObservationDrawer
        open={drawerOpen}
        position={reportPosition}
        place={location.name}
        onClose={() => setDrawerOpen(false)}
        onUseMapCenter={() => {
          const center = mapRef.current?.getCenter();
          if (center) setReportPosition({ lat: center.lat, lon: center.lng });
        }}
        onSubmit={publishObservation}
      />
      {loading && <div className="atlas-loading">Connexion aux données météo…</div>}
      {toast && <div className="atlas-toast">{toast}</div>}
    </main>
  );
}
