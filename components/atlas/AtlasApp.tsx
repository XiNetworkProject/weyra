"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import AtlasMap from "@/components/atlas/AtlasMap";
import LocalControlCenter, { type ControlCenterTab } from "@/components/atlas/LocalControlCenter";
import LocalAlerts from "@/components/atlas/LocalAlerts";
import NearbyObservations from "@/components/atlas/NearbyObservations";
import NowcastPanel from "@/components/atlas/NowcastPanel";
import ObservationDrawer from "@/components/atlas/ObservationDrawer";
import ObservationDetail from "@/components/atlas/ObservationDetail";
import WeyraOnboarding from "@/components/product/WeyraOnboarding";
import { useWeyraProduct } from "@/components/product/WeyraProductProvider";
import WeyraWorkspace from "@/components/product/WeyraWorkspace";
import { CATEGORY_META, OPERA_TILE_STYLE } from "@/components/atlas/constants";
import {
  IconArrowUp,
  IconBell,
  IconChevronDown,
  IconClock,
  IconCloud,
  IconCompass,
  IconDotsVertical,
  IconDroplet,
  IconDroplets,
  IconHome,
  IconMaximize,
  IconMenu,
  IconMinus,
  IconNavigation,
  IconPause,
  IconPlay,
  IconPlus,
  IconRadar,
  IconRepeat,
  IconSearch,
  IconSettings,
  IconSkipBack,
  IconSkipForward,
  IconSliders,
  IconThermometer,
  IconUser,
  IconUsers,
  IconWind,
} from "@/components/atlas/icons";
import { deriveActivityEntries } from "@/lib/activity";
import { deriveLocalAlerts } from "@/lib/alerts";
import {
  DEFAULT_LOCAL_CORE,
  DEFAULT_LOCAL_PREFERENCES,
  loadLocalCore,
  localPlaceKey,
  rememberPlace,
  saveLocalCore,
  toggleSavedPlace,
  type WeyraLocalCore,
  type WeyraLocalPreferences,
} from "@/lib/local-core";
import {
  confirmObservation,
  createObservation,
  loadConfirmedObservationIds,
  loadObservations,
  subscribeToObservations,
  uploadObservationPhoto,
} from "@/lib/observations";
import { deriveNowcast } from "@/lib/nowcast";
import { isObservationActive, observationExpiresAt, observationPhenomena } from "@/lib/observation-utils";
import { WEYRA_SPACE_VALUES, type WeyraSpace } from "@/lib/product-domain";
import {
  convertTemperature,
  convertWindSpeed,
  fetchWeather,
  searchLocations,
  temperatureUnitLabel,
  weatherCodeIcon,
  weatherCodeInfo,
  windUnitLabel,
} from "@/lib/weather";
import type {
  Coordinates,
  LocationSelection,
  MapLibreImageCoordinates,
  Observation,
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
const OPERA_FADE_MS = 280;
const OPERA_LOOP_FADE_MS = 150;
// Once the 12-scan window is full, a new OPERA scan is checked for this often — fast enough to
// feel instant, cheap enough (a static JSON read) to poll indefinitely.
const OPERA_LIVE_POLL_MS = 15_000;
const OPERA_CATCHUP_POLL_MS = 4_000;
const OPERA_DISPLAY_MS_BY_SPEED = {
  0.5: 760,
  1: 270,
  2: 80,
} as const;

type OperaPlaybackSpeed = keyof typeof OPERA_DISPLAY_MS_BY_SPEED;
type OperaHistoryState = "idle" | "preparing" | "preloading" | "ready" | "unavailable";
type AtlasOverlay = "control" | null;

const INITIAL_LOCATION: LocationSelection = {
  name: "Lille",
  country: "France",
  admin: "Hauts-de-France",
  lat: 50.6292,
  lon: 3.0573,
};

function productSpaceFromUrl(): WeyraSpace {
  if (typeof window === "undefined") return "atlas";
  const candidate = new URL(window.location.href).searchParams.get("space");
  return candidate && WEYRA_SPACE_VALUES.includes(candidate as WeyraSpace) ? candidate as WeyraSpace : "atlas";
}

function writeProductSpaceToUrl(space: WeyraSpace, replace = false) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (space === "atlas") url.searchParams.delete("space");
  else url.searchParams.set("space", space);
  const method = replace ? "replaceState" : "pushState";
  window.history[method]({ ...window.history.state, weyraSpace: space }, "", url);
}

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

function formatWeatherUpdatedAt(timestamp: string | undefined) {
  if (!timestamp) return "--:--";
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
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

const OPERA_PRELOAD_MAX_ZOOM = 6;
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

// Overview tiles covering the exact viewport. Camera moves schedule a new pass, so warming
// off-screen margins here would only delay the first fluid animation loop.
function overviewTilesForViewport(
  map: MapLibreMap,
  maxZoom = OPERA_PRELOAD_MAX_ZOOM,
  marginTiles = 0,
): Array<{ z: number; x: number; y: number }> {
  const zoom = clampNumber(Math.floor(map.getZoom()) + 1, OPERA_PRELOAD_MIN_ZOOM, maxZoom);
  const bounds = map.getBounds();
  const minX = lonToTileX(bounds.getWest(), zoom) - marginTiles;
  const maxX = lonToTileX(bounds.getEast(), zoom) + marginTiles;
  const minY = latToTileY(bounds.getNorth(), zoom) - marginTiles;
  const maxY = latToTileY(bounds.getSouth(), zoom) + marginTiles;
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
  const { state: productState } = useWeyraProduct();
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
  const [visibleObservations, setVisibleObservations] = useState<Observation[]>([]);
  const [confirmedObservationIds, setConfirmedObservationIds] = useState<Set<string>>(new Set());
  const [observationClock, setObservationClock] = useState(0);
  const [selectedObservation, setSelectedObservation] = useState<Observation | null>(null);
  const [reportPosition, setReportPosition] = useState<Coordinates>({ lat: INITIAL_LOCATION.lat, lon: INITIAL_LOCATION.lon });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<LocationSelection[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreLayersOpen, setMoreLayersOpen] = useState(false);
  const [mobileLayersOpen, setMobileLayersOpen] = useState(false);
  const [activeOverlay, setActiveOverlay] = useState<AtlasOverlay>(null);
  const [activeSpace, setActiveSpace] = useState<WeyraSpace>("atlas");
  const [controlCenterTab, setControlCenterTab] = useState<ControlCenterTab>("places");
  const [localCore, setLocalCore] = useState<WeyraLocalCore>(DEFAULT_LOCAL_CORE);
  const [localCoreReady, setLocalCoreReady] = useState(false);
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
  const [operaWarmedTimestamps, setOperaWarmedTimestamps] = useState<string[]>([]);
  const [operaTransition, setOperaTransition] = useState<OperaRadarMapTransition | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const operaHistoryFramesRef = useRef<OperaRadarHistoryFrame[]>([]);
  const operaFrameIndexRef = useRef(0);
  const operaTimerRef = useRef<number | null>(null);
  const operaDominanceTimerRef = useRef<number | null>(null);
  const operaFinishTimerRef = useRef<number | null>(null);
  const operaTransitionIdRef = useRef(0);
  const operaPlayingRef = useRef(false);
  const operaWarmCacheRef = useRef<Set<string>>(new Set());
  const localAutoplayStartedRef = useRef(false);

  const activeObservations = useMemo(
    () => observations.filter((observation) => (
      isObservationActive(observation, observationClock) &&
      !productState.hiddenObservationIds.includes(observation.id)
    )),
    [observationClock, observations, productState.hiddenObservationIds],
  );
  const reduceMotion = prefersReducedMotion || !localCore.preferences.motionEnabled || productState.settings.reduceMotion;

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout((showToast as typeof showToast & { timer?: number }).timer);
    (showToast as typeof showToast & { timer?: number }).timer = window.setTimeout(() => setToast(null), 3400);
  }, []);

  const commitLocalCore = useCallback((update: (current: WeyraLocalCore) => WeyraLocalCore) => {
    setLocalCore((current) => {
      const next = update(current);
      saveLocalCore(next);
      return next;
    });
  }, []);

  const updateLocalPreferences = useCallback((patch: Partial<WeyraLocalPreferences>) => {
    commitLocalCore((current) => ({
      ...current,
      preferences: { ...current.preferences, ...patch },
    }));
    if (typeof patch.radarVisible === "boolean") setRadarVisible(patch.radarVisible);
    if (typeof patch.radarLoop === "boolean") setOperaLoopEnabled(patch.radarLoop);
    if (patch.radarSpeed) setOperaPlaybackSpeed(patch.radarSpeed);
    if (typeof patch.observationsVisible === "boolean") setObservationsVisible(patch.observationsVisible);
  }, [commitLocalCore]);

  const navigateProductSpace = useCallback((space: WeyraSpace) => {
    if (space === "atlas") {
      setActiveSpace("atlas");
      writeProductSpaceToUrl("atlas");
      return;
    }
    setActiveOverlay(null);
    setMenuOpen(false);
    setMobileLayersOpen(false);
    setSearchOpen(false);
    setActiveSpace(space);
    writeProductSpaceToUrl(space);
  }, []);

  const closeProductWorkspace = useCallback(() => {
    setActiveSpace("atlas");
    writeProductSpaceToUrl("atlas");
  }, []);

  const openControlCenter = useCallback((tab: ControlCenterTab) => {
    setControlCenterTab(tab);
    setMenuOpen(false);
    setSearchOpen(false);
    setMobileLayersOpen(false);
    setActiveOverlay("control");
  }, []);

  const openObservationComposer = useCallback(() => {
    setActiveSpace("atlas");
    writeProductSpaceToUrl("atlas", true);
    setActiveOverlay(null);
    setMenuOpen(false);
    setMobileLayersOpen(false);
    setSelectedObservation(null);
    setDrawerOpen(true);
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

    if (boundedIndex === currentIndex || options.immediate || reduceMotion) {
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
  }, [clearOperaTimers, operaFrameIndex, operaHistoryFrames, reduceMotion, stopOperaPlayback]);

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
    const stored = loadLocalCore();
    setLocalCore(stored);
    setRadarVisible(stored.preferences.radarVisible);
    setObservationsVisible(stored.preferences.observationsVisible);
    setOperaLoopEnabled(stored.preferences.radarLoop);
    setOperaPlaybackSpeed(stored.preferences.radarSpeed);
    setLocalCoreReady(true);
  }, []);

  useEffect(() => {
    setConfirmedObservationIds(loadConfirmedObservationIds());
    setObservationClock(Date.now());
    const interval = window.setInterval(() => setObservationClock(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    operaPlayingRef.current = operaPlaying;
  }, [operaPlaying]);

  useEffect(() => {
    if (!localCoreReady || !localCore.preferences.radarAutoplay || localAutoplayStartedRef.current) return;
    if (operaHistoryState !== "ready" || operaHistoryFrames.length < 2) return;
    localAutoplayStartedRef.current = true;
    setOperaPlaying(true);
  }, [localCore.preferences.radarAutoplay, localCoreReady, operaHistoryFrames.length, operaHistoryState]);

  useEffect(() => {
    operaHistoryFramesRef.current = operaHistoryFrames;
  }, [operaHistoryFrames]);

  useEffect(() => {
    operaFrameIndexRef.current = operaFrameIndex;
  }, [operaFrameIndex]);

  useEffect(() => {
    if (!mapInstance || operaHistoryFrames.length < 2) return;
    let cancelled = false;
    let timer: number | null = null;
    let controller: AbortController | null = null;
    let generation = 0;

    const preload = async () => {
      if (cancelled) return;
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      const run = ++generation;
      const frameCount = operaHistoryFrames.length;
      const currentIndex = clampNumber(operaFrameIndexRef.current, 0, frameCount - 1);
      const warmed = new Set<string>();
      setOperaWarmedTimestamps([]);

      // Current, next and previous scans come first. This makes the first interaction fluid
      // without waiting for the full hour to enter the HTTP cache.
      const orderedFrames = operaHistoryFrames
        .map((frame, index) => {
          const forward = (index - currentIndex + frameCount) % frameCount;
          const backward = (currentIndex - index + frameCount) % frameCount;
          return { frame, index, distance: Math.min(forward, backward), forward };
        })
        .sort((a, b) => (a.distance - b.distance) || (a.forward - b.forward) || (b.index - a.index));

      const preloadFrame = async (frame: OperaRadarHistoryFrame) => {
        if (cancelled || signal.aborted || run !== generation) return;
        const packMaxZoom = clampNumber(
          frame.pack?.baseZoomMax ?? OPERA_PRELOAD_MAX_ZOOM,
          OPERA_PRELOAD_MIN_ZOOM,
          OPERA_PRELOAD_MAX_ZOOM,
        );
        const tiles = overviewTilesForViewport(mapInstance, packMaxZoom);
        if (!tiles.length) return;
        const viewportKey = `${tiles[0].z}:${tiles.map((tile) => `${tile.x}.${tile.y}`).join(",")}`;
        const cacheKey = `${OPERA_TILE_STYLE}|${frame.timestamp}|${viewportKey}`;

        if (operaWarmCacheRef.current.has(cacheKey)) {
          warmed.add(frame.timestamp);
          setOperaWarmedTimestamps([...warmed]);
          return;
        }

        const encoded = encodeURIComponent(frame.timestamp);
        const urls = tiles.map((tile) => `/api/radar/opera/packs/${encoded}/overview/${tile.z}/${tile.x}/${tile.y}?style=${OPERA_TILE_STYLE}`);
        let frameReady = true;
        for (let index = 0; index < urls.length; index += 10) {
          if (cancelled || signal.aborted || run !== generation) return;
          const results = await Promise.all(urls.slice(index, index + 10).map(async (url) => {
            try {
              const response = await fetch(url, { cache: "force-cache", signal });
              if (!response.ok) return false;
              await response.arrayBuffer();
              return true;
            } catch (error) {
              if (signal.aborted) return false;
              console.debug("OPERA overview warm-up skipped a tile", error);
              return false;
            }
          }));
          if (results.some((ready) => !ready)) frameReady = false;
        }

        if (frameReady && !signal.aborted && run === generation) {
          operaWarmCacheRef.current.add(cacheKey);
          warmed.add(frame.timestamp);
          setOperaWarmedTimestamps([...warmed]);
        }
      };

      // Keep the visible scan and the next playback scan first. Once those two are ready,
      // backfill the rest with a small worker pool instead of paying 12 serial round trips.
      for (const item of orderedFrames.slice(0, 2)) {
        await preloadFrame(item.frame);
      }
      let cursor = 2;
      const workers = Array.from({ length: Math.min(3, Math.max(0, orderedFrames.length - cursor)) }, async () => {
        while (!cancelled && !signal.aborted && run === generation) {
          const item = orderedFrames[cursor];
          cursor += 1;
          if (!item) return;
          await preloadFrame(item.frame);
        }
      });
      await Promise.all(workers);
    };

    const schedule = (delayMs: number) => {
      if (timer !== null) window.clearTimeout(timer);
      controller?.abort();
      generation += 1;
      timer = window.setTimeout(() => {
        timer = null;
        void preload();
      }, delayMs);
    };
    const scheduleAfterMove = () => schedule(320);

    schedule(220);
    mapInstance.on("moveend", scheduleAfterMove);
    return () => {
      cancelled = true;
      controller?.abort();
      if (timer !== null) window.clearTimeout(timer);
      mapInstance.off("moveend", scheduleAfterMove);
    };
  }, [mapInstance, operaHistoryFrames]);

  useEffect(() => {
    // The "nearby observations" panel only ever shows what is currently on screen: recomputed
    // whenever the camera settles or the observation set itself changes, never touching the
    // underlying data or the radar/timeline systems.
    if (!mapInstance) return;
    const recomputeVisible = () => {
      const bounds = mapInstance.getBounds();
      const within = activeObservations
        .filter((observation) => bounds.contains([observation.lon, observation.lat]))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setVisibleObservations(within);
    };
    recomputeVisible();
    mapInstance.on("moveend", recomputeVisible);
    mapInstance.on("zoomend", recomputeVisible);
    return () => {
      mapInstance.off("moveend", recomputeVisible);
      mapInstance.off("zoomend", recomputeVisible);
    };
  }, [activeObservations, mapInstance]);

  const focusObservation = useCallback((observation: Observation) => {
    mapRef.current?.flyTo({
      center: [observation.lon, observation.lat],
      zoom: Math.max(mapRef.current.getZoom(), 11),
      essential: true,
      duration: 620,
    });
    setSelectedObservation(observation);
  }, []);

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
      if (process.env.NODE_ENV === "production") return;
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

        // A brand-new scan landing while the user is already watching live gets the same
        // smooth crossfade as stepping forward manually — the very first load stays instant
        // (there is no previous frame to dissolve from, so animating it would only add delay).
        const newestTimestamp = frames[frames.length - 1]?.timestamp;
        const previousNewestTimestamp = previousFrames[previousFrames.length - 1]?.timestamp;
        const isLiveAdvance = previousFrames.length > 0 &&
          wasAtLatest &&
          nextIndex === frames.length - 1 &&
          newestTimestamp !== previousNewestTimestamp &&
          !operaPlayingRef.current;

        setOperaHistoryFrames(frames);

        if (isLiveAdvance) {
          const nextFrame = frames[nextIndex];
          clearOperaTimers();
          const transitionId = ++operaTransitionIdRef.current;
          setOperaTransition({ id: transitionId, toFrame: nextFrame, durationMs: OPERA_FADE_MS });

          operaDominanceTimerRef.current = window.setTimeout(() => {
            setOperaFrameIndex(nextIndex);
            setOperaRadarStatus((current) => ({
              ...current,
              available: true,
              timestamp: nextFrame.timestamp,
              historyStatus: "ready",
              historyReadyCount: frames.length,
              historyTotalCount: OPERA_FRAME_COUNT,
            }));
            operaDominanceTimerRef.current = null;
          }, Math.max(80, Math.floor(OPERA_FADE_MS * 0.56)));

          operaFinishTimerRef.current = window.setTimeout(() => {
            setOperaMapFrameIndex(nextIndex);
            setOperaTransition(null);
            operaFinishTimerRef.current = null;
          }, OPERA_FADE_MS + 70);
        } else {
          setOperaFrameIndex(nextIndex);
          setOperaMapFrameIndex(nextIndex);
        }
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
        await sleep(readyCount >= OPERA_FRAME_COUNT ? OPERA_LIVE_POLL_MS : OPERA_CATCHUP_POLL_MS);
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

    // Coming back to the tab should never wait out the poll interval: refresh immediately so
    // the radar is caught up the instant the user looks at it again.
    const onVisible = () => {
      if (cancelled || document.visibilityState !== "visible") return;
      void readPacks().then((payload) => applyPacks(payload.packs)).catch((error) => {
        console.debug("OPERA scan packs visibility refresh failed", error);
      });
      triggerMaintenance();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
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
      setSearchOpen(searchFocused);
      return;
    }
    const timeout = window.setTimeout(async () => {
      const results = await searchLocations(query);
      setSearchResults(results);
      setSearchOpen(true);
    }, 260);
    return () => window.clearTimeout(timeout);
  }, [query, searchFocused]);

  useEffect(() => {
    const syncSpace = () => setActiveSpace(productSpaceFromUrl());
    syncSpace();
    window.addEventListener("popstate", syncSpace);
    return () => window.removeEventListener("popstate", syncSpace);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
      if (event.key === "Escape") {
        setActiveSpace("atlas");
        writeProductSpaceToUrl("atlas", true);
        setActiveOverlay(null);
        setMenuOpen(false);
        setSearchOpen(false);
        setMobileLayersOpen(false);
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
  const WeatherIcon = weather ? weatherCodeIcon(weather.weatherCode) : IconCloud;
  const temperatureUnit = productState.settings.temperatureUnit;
  const windUnit = productState.settings.windUnit;
  const displayTemperature = weather ? Math.round(convertTemperature(weather.temperature, temperatureUnit)) : null;
  const displayApparentTemperature = weather
    ? Math.round(convertTemperature(weather.apparentTemperature, temperatureUnit))
    : null;
  const displayWindSpeed = weather
    ? Math.round(convertWindSpeed(weather.windSpeed, windUnit))
    : null;
  const currentRadarFrame = radarFrames[radarFrameIndex];
  const latestRadarFrame = radarFrames.at(-1);
  const latestAge = scanAgeMinutes(latestRadarFrame);
  const radarIsFresh = latestAge !== null && latestAge <= Math.max(7, radarCadenceMinutes + 2);
  const radarProgress = radarFrames.length < 2 ? 100 : (radarFrameIndex / (radarFrames.length - 1)) * 100;
  const usesMeteoFranceRadar = radarProvider.toLowerCase().includes("meteo");
  const radarSourceText = usesMeteoFranceRadar ? "Radar France · 5 min" : "Radar public · 10 min";
  const operaRadarTime = formatOperaRadarTime(operaRadarStatus.timestamp);
  const operaRadarAvailable = operaRadarStatus.available;
  const operaTimelineFrame = operaHistoryFrames[operaFrameIndex] ?? null;
  const operaMapFrame = operaHistoryFrames[operaMapFrameIndex] ?? null;
  const operaCanUseHistory = operaHistoryState === "ready" && operaHistoryFrames.length >= 2;
  const operaHasFullHistory = operaCanUseHistory && operaHistoryFrames.length >= OPERA_FRAME_COUNT;
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
  const operaWarmedSet = useMemo(() => new Set(operaWarmedTimestamps), [operaWarmedTimestamps]);
  const operaWarmReadyCount = operaHistoryFrames.filter((frame) => operaWarmedSet.has(frame.timestamp)).length;
  const operaBufferStatus = operaCanUseHistory
    ? `${operaWarmReadyCount}/${operaHistoryFrames.length} scans en mémoire`
    : operaLoadedCount > 0 ? `${operaLoadedCount}/${OPERA_FRAME_COUNT} scans disponibles` : operaTimelineStatus;
  const operaTimelineStart = formatOperaTimelineTime(operaHistoryFrames[0]?.timestamp ?? null);
  const operaTimelineEnd = formatOperaTimelineTime(operaHistoryFrames.at(-1)?.timestamp ?? null);

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
    setSearchFocused(false);
    setSelectedObservation(null);
    commitLocalCore((current) => rememberPlace(current, next));
    await refreshWeather(next);
  }, [commitLocalCore, refreshWeather]);

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
    phenomena: Observation["category"][];
    intensity: number;
    durationMinutes: number;
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
    const createdAt = new Date().toISOString();
    const primaryCategory = input.phenomena[0] ?? "nuage";
    const observation: Observation = {
      id: crypto.randomUUID(),
      nickname: input.nickname.trim().slice(0, 24) || "Membre Weyra",
      category: primaryCategory,
      phenomena: input.phenomena,
      intensity: input.intensity,
      details: input.details.trim().slice(0, 350) || null,
      imageUrl,
      lat: input.preciseLocation ? reportPosition.lat : Math.round(reportPosition.lat * 1000) / 1000,
      lon: input.preciseLocation ? reportPosition.lon : Math.round(reportPosition.lon * 1000) / 1000,
      createdAt,
      expiresAt: observationExpiresAt(createdAt, input.durationMinutes),
      likes: 0,
      place: location.name,
    };
    const persistence = await createObservation(observation);
    updateLocalPreferences({ nickname: observation.nickname });
    await refreshObservations();
    setDrawerOpen(false);
    setSelectedObservation(observation);
    mapRef.current?.flyTo({ center: [observation.lon, observation.lat], zoom: Math.max(mapRef.current.getZoom(), 10.5), essential: true });
    showToast(
      persistence.synced
        ? "Observation envoyée à la modération Weyra."
        : "Observation enregistrée sur cet appareil.",
    );
  }, [location.name, refreshObservations, reportPosition.lat, reportPosition.lon, showToast, updateLocalPreferences]);

  const handleConfirmObservation = useCallback(async (observation: Observation) => {
    const result = await confirmObservation(observation);
    if (!result.changed) {
      showToast("Tu as déjà confirmé ce signal.");
      return;
    }
    setConfirmedObservationIds(loadConfirmedObservationIds());
    setObservations((current) => current.map((item) => (
      item.id === observation.id ? { ...item, likes: result.likes } : item
    )));
    setSelectedObservation((current) => (
      current?.id === observation.id ? { ...current, likes: result.likes } : current
    ));
    showToast("Signal confirmé. Merci d’aider la communauté.");
  }, [showToast]);

  const shareObservation = useCallback(async (observation: Observation) => {
    const labels = observationPhenomena(observation)
      .map((category) => CATEGORY_META[category].shortLabel)
      .join(", ");
    const text = `${labels} signalé${labels.includes(",") ? "s" : ""} près de ${observation.place ?? "cette zone"} sur Weyra.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Observation Weyra", text, url: window.location.href });
      } else {
        await navigator.clipboard.writeText(`${text} ${window.location.href}`);
        showToast("Lien de l’observation copié.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      showToast("Le partage n’est pas disponible sur cet appareil.");
    }
  }, [showToast]);

  const localAlerts = useMemo(() => deriveLocalAlerts(weather, location), [weather, location]);
  const nowcast = useMemo(
    () => deriveNowcast(
      weather,
      location,
      visibleObservations,
      radarVisible && operaRadarAvailable,
      observationClock,
    ),
    [weather, location, visibleObservations, radarVisible, operaRadarAvailable, observationClock],
  );
  const activityEntries = useMemo(() => deriveActivityEntries({
    alerts: localAlerts,
    observations: activeObservations,
    location,
    radarTimestamp: operaRadarStatus.timestamp,
    radarAvailable: operaRadarAvailable,
  }), [activeObservations, localAlerts, location, operaRadarAvailable, operaRadarStatus.timestamp]);
  const unreadActivityCount = activityEntries.filter((entry) => !productState.readActivityIds.includes(entry.id)).length;
  const localSearchPlaces = useMemo(() => {
    const seen = new Set<string>();
    return [...localCore.savedPlaces, ...localCore.recentPlaces].filter((place) => {
      if (seen.has(place.key)) return false;
      seen.add(place.key);
      return true;
    }).slice(0, 7);
  }, [localCore.recentPlaces, localCore.savedPlaces]);

  const handleToggleSavedPlace = useCallback((place: LocationSelection) => {
    const wasSaved = localCore.savedPlaces.some((item) => item.key === localPlaceKey(place));
    commitLocalCore((current) => toggleSavedPlace(current, place));
    showToast(wasSaved ? `${place.name} retiré des favoris.` : `${place.name} ajouté aux favoris.`);
  }, [commitLocalCore, localCore.savedPlaces, showToast]);

  const handleSelectLocalPlace = useCallback((place: LocationSelection) => {
    setActiveOverlay(null);
    void chooseLocation(place);
  }, [chooseLocation]);

  const resetLocalPreferences = useCallback(() => {
    updateLocalPreferences({ ...DEFAULT_LOCAL_PREFERENCES });
    showToast("Préférences locales réinitialisées.");
  }, [showToast, updateLocalPreferences]);

  const openMapFromWorkspace = useCallback((lat: number, lon: number) => {
    closeProductWorkspace();
    window.setTimeout(() => {
      mapRef.current?.flyTo({
        center: [lon, lat],
        zoom: Math.max(mapRef.current.getZoom(), 10),
        essential: true,
        duration: 700,
      });
    }, 80);
  }, [closeProductWorkspace]);

  const openObservationFromWorkspace = useCallback((observationId: string) => {
    const observation = activeObservations.find((item) => item.id === observationId);
    if (!observation) {
      showToast("Cette observation n'est plus active sur la carte.");
      return;
    }
    closeProductWorkspace();
    window.setTimeout(() => focusObservation(observation), 80);
  }, [activeObservations, closeProductWorkspace, focusObservation, showToast]);

  const selectedWithLatestLike = useMemo(() => {
    if (!selectedObservation) return null;
    return observations.find((item) => item.id === selectedObservation.id) ?? selectedObservation;
  }, [observations, selectedObservation]);

  return (
    <main
      className="atlas-app"
      data-ui-shell="v2"
      data-mobile-layers={mobileLayersOpen ? "open" : "closed"}
      data-motion={reduceMotion ? "reduced" : "full"}
      data-overlay={activeOverlay ?? "none"}
      data-workspace={activeSpace === "atlas" ? "closed" : "open"}
      data-product-space={activeSpace}
      data-contrast={productState.settings.highContrast ? "high" : "normal"}
    >
      <AtlasMap
        location={location}
        observations={activeObservations}
        selectedObservationId={selectedObservation?.id ?? null}
        radarFrames={radarFrames}
        radarFrameIndex={radarFrameIndex}
        radarHost={radarHost}
        radarVisible={radarVisible}
        operaRadarFrame={operaMapFrame}
        operaRadarTransition={operaTransition}
        operaPlaybackActive={operaPlaying}
        operaWarmedTimestamps={operaWarmedTimestamps}
        observationLayerVisible={observationsVisible}
        pendingObservationPosition={drawerOpen ? reportPosition : null}
        onMapReady={onMapReady}
        onOperaRadarStatus={setOperaRadarStatus}
        onMapClick={onMapClick}
        onObservationClick={setSelectedObservation}
      />

      <header className="atlas-topbar">
        <div className="atlas-brand" aria-label="Weyra Atlas">
          <span>weyra</span>
          <i>atlas</i>
        </div>
        <div className="atlas-search">
          <IconSearch className="atlas-search__icon" />
          <input
            ref={searchInputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => { setSearchFocused(true); setSearchOpen(true); }}
            onBlur={() => window.setTimeout(() => { setSearchFocused(false); setSearchOpen(false); }, 140)}
            placeholder="Rechercher une ville"
            aria-label="Rechercher une ville"
            aria-expanded={searchOpen}
          />
          <kbd>⌘K</kbd>
          {searchOpen && (
            <div className="atlas-search__results">
              {query.trim().length >= 3 ? (
                searchResults.length ? searchResults.map((item) => (
                  <button key={`${item.name}-${item.lat}-${item.lon}`} onClick={() => void chooseLocation(item)}>
                    {item.name}<small>{[item.admin, item.country].filter(Boolean).join(" · ")}</small>
                  </button>
                )) : <div className="atlas-search__empty">Aucun lieu trouvé.</div>
              ) : (
                <>
                  <div className="atlas-search__section"><span>Lieux rapides</span><button type="button" onClick={() => openControlCenter("places")}>Gérer</button></div>
                  {localSearchPlaces.length ? localSearchPlaces.map((item) => (
                    <button key={item.key} onClick={() => void chooseLocation(item)}>
                      {item.name}<small>{[item.admin, item.country].filter(Boolean).join(" · ") || "Lieu récent"}</small>
                    </button>
                  )) : <div className="atlas-search__empty">Tes favoris et lieux récents apparaîtront ici.</div>}
                  <button className="atlas-search__locate" type="button" onClick={useCurrentPosition}><IconNavigation />Utiliser ma position</button>
                </>
              )}
            </div>
          )}
        </div>
        <div className="atlas-system-status" title={radarPanelStatus} aria-live="polite">
          <i />
          <span>OPERA</span>
          <b>{operaDisplayTime || "LIVE"}</b>
        </div>
        <div className="atlas-topbar__spacer" />
        <div className="atlas-topbar__actions">
          <button className={`atlas-round-button atlas-round-button--community${["home", "explore", "communities"].includes(activeSpace) ? " is-active" : ""}`} onClick={() => navigateProductSpace("home")} title="Accueil Weyra" aria-label="Ouvrir l’accueil Weyra"><IconUsers /></button>
          <button className={`atlas-round-button atlas-round-button--notifications${activeSpace === "notifications" ? " is-active" : ""}`} onClick={() => navigateProductSpace("notifications")} title="Notifications" aria-label={`${unreadActivityCount} activités non lues`}><IconBell />{unreadActivityCount > 0 && <i>{Math.min(99, unreadActivityCount)}</i>}</button>
          <div className="atlas-menu">
            <button className="atlas-round-button" onClick={() => { setActiveOverlay(null); setMenuOpen((value) => !value); }} title="Menu" aria-label="Menu principal" aria-expanded={menuOpen}><IconMenu /></button>
            {menuOpen && (
              <>
                <button className="atlas-menu__backdrop" onClick={() => setMenuOpen(false)} aria-label="Fermer le menu" />
                <div className="atlas-menu__panel">
                  <button onClick={openObservationComposer}><IconPlus />Ajouter une observation</button>
                  <button onClick={() => { setMenuOpen(false); setMobileLayersOpen(true); }}><IconSliders />Couches Atlas</button>
                  <button onClick={() => { setMenuOpen(false); useCurrentPosition(); }}><IconNavigation />Utiliser ma position</button>
                  <button onClick={() => navigateProductSpace("home")}><IconHome />Accueil Weyra</button>
                  <button onClick={() => navigateProductSpace("explore")}><IconCompass />Explorer</button>
                  <button onClick={() => navigateProductSpace("communities")}><IconUsers />Communautés</button>
                  <button onClick={() => navigateProductSpace("messages")}><IconCloud />Messages</button>
                  <button onClick={() => navigateProductSpace("learn")}><IconRadar />Apprendre</button>
                  <button onClick={() => navigateProductSpace("profile")}><IconUsers />Profil et carnet</button>
                  <button onClick={() => openControlCenter("places")}><IconCompass />Lieux enregistrés</button>
                  <button onClick={() => navigateProductSpace("settings")}><IconSettings />Préférences</button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {localCore.preferences.showNowcast && <NowcastPanel nowcast={nowcast} />}

      <section className="atlas-weather-card">
        <header className="atlas-weather-card__header">
          <h1>
            {location.country ? `${location.name}, ${location.country}` : location.name}
            <button onClick={useCurrentPosition} title="Utiliser ma position"><IconNavigation /></button>
          </h1>
          <button className="atlas-weather-card__options" onClick={() => openControlCenter("places")} title="Gérer ce lieu"><IconDotsVertical /></button>
        </header>
        <div className="atlas-weather-card__main">
          <span className="atlas-weather-card__icon"><WeatherIcon /></span>
          <div className="atlas-weather-card__hero">
            <strong key={weather?.observedAt ?? "loading"} className="atlas-weather-card__temp">
              {displayTemperature ?? "—"}<i>{temperatureUnitLabel(temperatureUnit)}</i>
            </strong>
            <span className="atlas-weather-card__condition">{currentWeatherInfo.label}</span>
          </div>
        </div>
        <div className="atlas-weather-card__sub">
          <span>Ressenti {displayApparentTemperature === null ? "—" : `${displayApparentTemperature}${temperatureUnitLabel(temperatureUnit)}`}</span>
          <span className="atlas-weather-card__dot" aria-hidden="true" />
          <span className="atlas-weather-card__updated"><IconClock />{formatWeatherUpdatedAt(weather?.observedAt)}</span>
        </div>
        <div className="atlas-weather-card__stats">
          <div>
            <IconWind className="atlas-weather-card__stat-icon" />
            <div>
              <span>Vent</span>
              <b>
                {displayWindSpeed ?? "—"}<i>{windUnitLabel(windUnit)}</i>
                {weather && <IconArrowUp className="atlas-weather-card__wind-arrow" style={{ transform: `rotate(${Math.round(weather.windDirection) + 180}deg)` }} />}
              </b>
            </div>
          </div>
          <div>
            <IconDroplet className="atlas-weather-card__stat-icon" />
            <div>
              <span>Pluie</span>
              <b>{weather ? weather.precipitation.toFixed(1) : "—"}<i>mm/h</i></b>
            </div>
          </div>
          <div>
            <IconDroplets className="atlas-weather-card__stat-icon" />
            <div>
              <span>Humidité</span>
              <b>{weather ? Math.round(weather.humidity) : "—"}<i>%</i></b>
            </div>
          </div>
        </div>
      </section>

      <section className="atlas-layers">
        <div className="atlas-layers__title"><span>Couches</span><small><i />Direct</small></div>
        <button className={radarVisible ? "is-active" : ""} onClick={() => updateLocalPreferences({ radarVisible: !radarVisible })} title={radarPanelStatus} aria-label="Afficher le radar OPERA" aria-pressed={radarVisible}>
          <span className="atlas-layers__icon atlas-layers__icon--radar"><IconRadar /></span>
          <span className="atlas-layers__copy"><b>Radar OPERA</b><small>{operaLayerDetail}</small></span>
        </button>
        <button onClick={() => showToast("La couche vent arrive bientôt.")} aria-label="Couche vent">
          <span className="atlas-layers__icon"><IconWind /></span><span className="atlas-layers__copy"><b>Vent</b></span>
        </button>
        <button onClick={() => showToast("La couche température arrive bientôt.")} aria-label="Couche température">
          <span className="atlas-layers__icon"><IconThermometer /></span><span className="atlas-layers__copy"><b>Température</b></span>
        </button>
        <button className={observationsVisible ? "is-active" : ""} onClick={() => updateLocalPreferences({ observationsVisible: !observationsVisible })} aria-label="Afficher les observations" aria-pressed={observationsVisible}>
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
        <button
          className={`atlas-layers__more${moreLayersOpen ? " is-open" : ""}`}
          onClick={() => setMoreLayersOpen((value) => !value)}
          aria-expanded={moreLayersOpen}
        >
          <b>Plus de couches</b><IconChevronDown className="atlas-layers__chevron" />
        </button>
      </section>

      {observationsVisible && (
        <NearbyObservations observations={visibleObservations} onSelect={focusObservation} onCreate={openObservationComposer} />
      )}

      {!moreLayersOpen && localCore.preferences.showLocalAlerts && <LocalAlerts alerts={localAlerts} />}

      <button className="atlas-report-fab" type="button" onClick={openObservationComposer}>
        <span><IconPlus /></span>
        <b>Signaler</b>
      </button>

      <section className="atlas-map-tools" aria-label="Contrôles de la carte">
        <button className="atlas-map-tools__locate" onClick={() => mapRef.current?.flyTo({ center: [location.lon, location.lat], zoom: Math.max(mapRef.current.getZoom(), 8.45), essential: true })} title="Recentrer la carte" aria-label="Recentrer la carte"><IconNavigation /></button>
        <div className="atlas-map-tools__zoom">
          <button onClick={() => mapRef.current?.zoomIn()} title="Zoomer" aria-label="Zoomer"><IconPlus /></button>
          <button onClick={() => mapRef.current?.zoomOut()} title="Dézoomer" aria-label="Dézoomer"><IconMinus /></button>
        </div>
      </section>

      <section className={`atlas-radar-legend${radarVisible ? "" : " is-hidden"}`} aria-label="Échelle d’intensité des précipitations">
        <b>Intensité radar (mm/h)</b><div /><small><span>0,1</span><span>1</span><span>3</span><span>10</span><span>30</span><span>100+</span></small>
      </section>

      <section className={`atlas-timeline atlas-timeline--v3${operaPlaying ? " is-playing" : ""}`} aria-label="Animation radar OPERA">
        <button
          className="atlas-timeline__play"
          onClick={() => setOperaPlaying((value) => !value)}
          disabled={!operaCanUseHistory}
          title={operaPlaying ? "Mettre en pause" : "Lire l'historique radar"}
          aria-label={operaPlaying ? "Mettre le radar en pause" : "Lire l'historique radar"}
          aria-pressed={operaPlaying}
        >{operaPlaying ? <IconPause /> : <IconPlay />}</button>
        <div className="atlas-timeline__bar">
          <div className="atlas-timeline__identity">
            <span className="atlas-timeline__radar-icon"><IconRadar /></span>
            <span><b>OPERA</b><small>{operaBufferStatus}</small></span>
          </div>
          <div className="atlas-timeline__steps" aria-label="Navigation des scans OPERA">
            <button className="atlas-timeline__step" onClick={() => goToOperaAdjacent(-1)} disabled={!operaCanStep} title="Scan précédent" aria-label="Scan précédent"><IconSkipBack /></button>
            <button className="atlas-timeline__step" onClick={() => goToOperaAdjacent(1)} disabled={!operaCanStep} title="Scan suivant" aria-label="Scan suivant"><IconSkipForward /></button>
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
                  const timestamp = operaHistoryFrames[mappedIndex]?.timestamp;
                  const className = [
                    operaCanUseHistory && mappedIndex === operaFrameIndex ? "is-active" : "",
                    timestamp && operaWarmedSet.has(timestamp) ? "is-ready" : "",
                    timestamp && !operaWarmedSet.has(timestamp) ? "is-buffering" : "",
                  ].filter(Boolean).join(" ");
                  return <span key={index} className={className} />;
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
                  <span>{operaTimelineStart}</span>
                  <span className="atlas-timeline__labels-status">{operaDisplayTime}</span>
                  <span>{operaTimelineEnd}</span>
                </>
              ) : (
                <span className="atlas-timeline__status">{operaTimelineStatus}</span>
              )}
            </div>
          </div>
          <div className="atlas-timeline__controls">
            <button className="atlas-timeline__latest" onClick={goToLatestOperaFrame} disabled={!operaCanStep} title="Revenir au dernier scan"><i />Live</button>
            <button
              className={`atlas-timeline__loop${operaLoopEnabled ? " is-active" : ""}`}
              onClick={() => updateLocalPreferences({ radarLoop: !operaLoopEnabled })}
              disabled={!operaCanStep}
              aria-pressed={operaLoopEnabled}
              title="Lecture en boucle"
              aria-label="Lecture en boucle"
            ><IconRepeat /></button>
            <div className="atlas-timeline__speed" aria-label="Vitesse de lecture OPERA">
              {([0.5, 1, 2] as const).map((speed) => (
                <button
                  key={speed}
                  className={operaPlaybackSpeed === speed ? "is-active" : ""}
                  onClick={() => updateLocalPreferences({ radarSpeed: speed })}
                  disabled={!operaCanStep}
                  aria-pressed={operaPlaybackSpeed === speed}
                >{speed}x</button>
              ))}
            </div>
            <button className="atlas-timeline__fullscreen" onClick={toggleFullscreen} title="Plein écran" aria-label="Plein écran"><IconMaximize /></button>
          </div>
        </div>
      </section>

      {mobileLayersOpen && (
        <button className="atlas-mobile-panel-backdrop" type="button" onClick={() => setMobileLayersOpen(false)} aria-label="Fermer les couches" />
      )}
      <nav className="atlas-mobile-nav" aria-label="Actions principales">
        <button type="button" onClick={() => navigateProductSpace("home")}>
          <IconHome /><span>Accueil</span>
        </button>
        <button type="button" className="is-active" onClick={closeProductWorkspace} aria-current="page">
          <IconRadar /><span>Atlas</span>
        </button>
        <button type="button" onClick={() => navigateProductSpace("communities")}>
          <IconUsers /><span>Communautés</span>
        </button>
        <button type="button" onClick={() => navigateProductSpace("messages")}>
          <span className="atlas-mobile-nav__icon-with-badge"><IconCloud />{unreadActivityCount > 0 && <i>{Math.min(99, unreadActivityCount)}</i>}</span><span>Messages</span>
        </button>
        <button type="button" onClick={() => navigateProductSpace("profile")}>
          <IconUser /><span>Profil</span>
        </button>
      </nav>

      <LocalControlCenter
        open={activeOverlay === "control"}
        initialTab={controlCenterTab}
        core={localCore}
        currentLocation={location}
        onClose={() => setActiveOverlay(null)}
        onSelectPlace={handleSelectLocalPlace}
        onToggleSavedPlace={handleToggleSavedPlace}
        onClearRecentPlaces={() => commitLocalCore((current) => ({ ...current, recentPlaces: [] }))}
        onChangePreferences={updateLocalPreferences}
        onResetPreferences={resetLocalPreferences}
        onCreateObservation={openObservationComposer}
      />

      <WeyraWorkspace
        open={activeSpace !== "atlas"}
        space={activeSpace}
        location={location}
        weather={weather}
        nowcast={nowcast}
        alerts={localAlerts}
        activityEntries={activityEntries}
        observations={activeObservations}
        radarTimestamp={operaRadarStatus.timestamp}
        atlasPreferences={localCore.preferences}
        onNavigate={navigateProductSpace}
        onClose={closeProductWorkspace}
        onOpenMap={openMapFromWorkspace}
        onOpenObservation={openObservationFromWorkspace}
        onCreateObservation={openObservationComposer}
        onLocate={() => { closeProductWorkspace(); window.setTimeout(useCurrentPosition, 80); }}
        onUpdateAtlasPreferences={updateLocalPreferences}
        onResetAtlasPreferences={resetLocalPreferences}
        onToast={showToast}
      />

      <ObservationDetail
        observation={selectedWithLatestLike}
        confirmed={selectedWithLatestLike ? confirmedObservationIds.has(selectedWithLatestLike.id) : false}
        onClose={() => setSelectedObservation(null)}
        onConfirm={(observation) => { void handleConfirmObservation(observation); }}
        onShare={(observation) => { void shareObservation(observation); }}
        onToast={showToast}
      />
      <ObservationDrawer
        open={drawerOpen}
        position={reportPosition}
        place={location.name}
        defaultNickname={localCore.preferences.nickname}
        onClose={() => setDrawerOpen(false)}
        onUseMapCenter={() => {
          const center = mapRef.current?.getCenter();
          if (center) setReportPosition({ lat: center.lat, lon: center.lng });
        }}
        onSubmit={publishObservation}
      />
      <WeyraOnboarding />
      {loading && <div className="atlas-loading">Connexion aux données météo…</div>}
      {toast && <div className="atlas-toast">{toast}</div>}
    </main>
  );
}
