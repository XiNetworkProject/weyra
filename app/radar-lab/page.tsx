"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import type { MapLibreImageCoordinates, OperaFrameManifest, OperaFrameManifestItem, OperaRadarOverlayMeta } from "@/lib/types";

type DataLink = {
  href: string;
  rel?: string;
  title?: string;
  type?: string;
  format?: string;
  fileType: "ODIM HDF5" | "GeoTIFF" | "Unknown";
  timestamp?: string;
  isLatest?: boolean;
};

type OperaResult = {
  ok: boolean;
  provider: "EUMETNET OPERA";
  product: "DBZH";
  method: "comp";
  latestTimestamp: string | null;
  format: string | null;
  dataLinks: DataLink[];
  rateLimitRemaining: string | null;
  sourceStatus: {
    status: number | null;
    statusText: string | null;
    contentType: string | null;
    date: string | null;
    locationId: string;
    windowStart: string;
    windowEnd: string;
  };
  error: string | null;
};

type RenderError = {
  ok: false;
  provider?: "EUMETNET OPERA";
  product?: "DBZH";
  error?: string;
};

type RenderResult = OperaRadarOverlayMeta | RenderError;

type PreloadStatus = "loading" | "loaded" | "failed";
type PreloadState = Record<string, PreloadStatus>;
type PlaybackSpeed = 0.5 | 1 | 2;

const FADE_DURATION_MS = 650;
const FRAME_DISPLAY_MS_BY_SPEED: Record<PlaybackSpeed, number> = {
  0.5: 1800,
  1: 900,
  2: 450,
};

function formatDate(value: string | null | undefined, timeZone: "UTC" | "Europe/Paris") {
  if (!value) return "Non trouve";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("fr-FR", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(date);
}

function preferredDataLink(links: DataLink[]) {
  return (
    links.find((link) => link.isLatest && link.fileType === "ODIM HDF5") ??
    links.find((link) => link.isLatest && link.fileType === "GeoTIFF") ??
    links.find((link) => link.fileType === "ODIM HDF5") ??
    links.find((link) => link.fileType === "GeoTIFF") ??
    links[0] ??
    null
  );
}

function formatShortTime(value: string | null | undefined, timeZone: "UTC" | "Europe/Paris") {
  if (!value) return "--:--";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("fr-FR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(date);
}

function formatBytes(value: number | null | undefined) {
  if (!value || value <= 0) return "Non disponible";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} ko`;
  return `${(value / 1024 / 1024).toFixed(2)} Mo`;
}

function formatDuration(value: number | null | undefined) {
  if (!value) return "Non mesuree";
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}

function historyCounter(manifest: OperaFrameManifest | null) {
  if (!manifest) return "Aucun historique prepare";
  if (manifest.availableCount === 12) return "12 scans - 55 minutes d'historique";
  return `${manifest.availableCount} scans disponibles`;
}

function readyFrames(manifest: OperaFrameManifest | null) {
  return manifest?.frames.filter((frame) => frame.status === "ready") ?? [];
}

function timestampGaps(frames: OperaFrameManifestItem[]) {
  const gaps: number[] = [];

  for (let index = 1; index < frames.length; index += 1) {
    const previous = new Date(frames[index - 1].timestamp).getTime();
    const current = new Date(frames[index].timestamp).getTime();
    if (Number.isFinite(previous) && Number.isFinite(current)) {
      gaps.push(Math.round((current - previous) / 60_000));
    }
  }

  return gaps;
}

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function frameImageSrc(frame: OperaFrameManifestItem, mode: "thumb" | "player" | "large" | "preload") {
  return `${frame.imageUrl}?${mode}=${encodeURIComponent(frame.timestamp)}`;
}

function addPlaceMarker(map: MapLibreMap, label: string, coords: [number, number], markers: Marker[]) {
  const element = document.createElement("div");
  element.className = "radar-lab-map-marker";
  element.textContent = label;

  void import("maplibre-gl").then((module) => {
    const marker = new module.default.Marker({ element, anchor: "bottom" }).setLngLat(coords).addTo(map);
    markers.push(marker);
  });
}

function RadarValidationMap({ result }: { result: OperaRadarOverlayMeta | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  useEffect(() => {
    if (!containerRef.current || !result?.hasGeoreferencing || !result.mapLibreCoordinates) return;

    let cancelled = false;
    const markers: Marker[] = [];
    const imageUrl = result.imageUrl;
    const coordinates = result.mapLibreCoordinates;

    async function createMap() {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !containerRef.current) return;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
        center: [3.1, 50.86],
        zoom: 7.25,
        minZoom: 5.5,
        maxZoom: 12,
        pitch: 0,
        bearing: 0,
        dragRotate: false,
        renderWorldCopies: false,
      });

      map.touchZoomRotate.disableRotation();
      mapRef.current = map;

      map.on("load", () => {
        if (cancelled) return;

        map.addSource("radar-lab-opera-source", {
          type: "image",
          url: `${imageUrl}&lab=${Date.now()}`,
          coordinates,
        });
        map.addLayer({
          id: "radar-lab-opera-layer",
          type: "raster",
          source: "radar-lab-opera-source",
          paint: {
            "raster-opacity": 0.72,
            "raster-fade-duration": 0,
            "raster-resampling": "nearest",
          },
        });

        map.fitBounds([[1.35, 50.28], [5.65, 51.55]], { padding: 42, duration: 0 });
        addPlaceMarker(map, "Lille", [3.0573, 50.6292], markers);
        addPlaceMarker(map, "Dunkerque", [2.3768, 51.0344], markers);
        addPlaceMarker(map, "Calais", [1.8587, 50.9513], markers);
        addPlaceMarker(map, "Belgique", [4.35, 50.85], markers);
      });
    }

    void createMap();

    return () => {
      cancelled = true;
      markers.forEach((marker) => marker.remove());
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [result]);

  if (!result) return null;

  if (!result.hasGeoreferencing || !result.mapLibreCoordinates) {
    return <p className="radar-lab__error">Georeferencement OPERA invalide : {result.warning ?? "coordonnees MapLibre absentes."}</p>;
  }

  return (
    <section className="radar-lab__card">
      <div className="radar-lab__status-row">
        <span className="radar-lab__dot is-ok" />
        <b>Validation MapLibre</b>
      </div>
      <div ref={containerRef} className="radar-lab__map" />
      <p className="radar-lab__caption">
        Carte de validation locale : l'image OPERA est ajoutee comme source MapLibre georeferencee, sans timeline ni tuilage.
      </p>
      <details className="radar-lab__inline-details">
        <summary>Coordonnees MapLibre utilisees</summary>
        <pre>{JSON.stringify({
          mapLibreCoordinates: result.mapLibreCoordinates,
          geographicBounds: result.geographicBounds,
          projectionBounds: result.projectionBounds,
        }, null, 2)}</pre>
      </details>
    </section>
  );
}

export default function RadarLabPage() {
  const [result, setResult] = useState<OperaResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [renderResult, setRenderResult] = useState<RenderResult | null>(null);
  const [renderLoading, setRenderLoading] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [historyManifest, setHistoryManifest] = useState<OperaFrameManifest | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyProgress, setHistoryProgress] = useState("Historique non prepare");
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedFrame, setSelectedFrame] = useState<OperaFrameManifestItem | null>(null);
  const [selectedFrameMeta, setSelectedFrameMeta] = useState<OperaRadarOverlayMeta | null>(null);
  const [selectedFrameError, setSelectedFrameError] = useState<string | null>(null);
  const [preloadState, setPreloadState] = useState<PreloadState>({});
  const [playerIndex, setPlayerIndex] = useState(0);
  const [baseFrame, setBaseFrame] = useState<OperaFrameManifestItem | null>(null);
  const [fadeFrame, setFadeFrame] = useState<OperaFrameManifestItem | null>(null);
  const [fadeActive, setFadeActive] = useState(false);
  const [isFading, setIsFading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const playbackTimerRef = useRef<number | null>(null);
  const dominanceTimerRef = useRef<number | null>(null);
  const fadeTimerRef = useRef<number | null>(null);
  const fadeRafRef = useRef<number | null>(null);
  const transitionInProgressRef = useRef(false);
  const isPlayingRef = useRef(false);

  const dataLink = useMemo(() => preferredDataLink(result?.dataLinks ?? []), [result]);
  const renderedMeta = renderResult?.ok ? renderResult : null;
  const metadata = renderedMeta?.metadata;
  const historyReadyFrames = useMemo(() => readyFrames(historyManifest), [historyManifest]);
  const historyGaps = useMemo(() => timestampGaps(historyManifest?.frames ?? []), [historyManifest]);
  const preloadLoadedCount = useMemo(
    () => historyReadyFrames.filter((frame) => preloadState[frame.timestamp] === "loaded").length,
    [historyReadyFrames, preloadState],
  );
  const preloadFailedCount = useMemo(
    () => historyReadyFrames.filter((frame) => preloadState[frame.timestamp] === "failed").length,
    [historyReadyFrames, preloadState],
  );
  const preloadFinishedCount = preloadLoadedCount + preloadFailedCount;
  const canPlayHistory = preloadLoadedCount >= 2;
  const fadeDuration = prefersReducedMotion ? 0 : FADE_DURATION_MS;

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateReducedMotion = () => { setPrefersReducedMotion(mediaQuery.matches); };

    updateReducedMotion();
    mediaQuery.addEventListener("change", updateReducedMotion);

    return () => {
      mediaQuery.removeEventListener("change", updateReducedMotion);
    };
  }, []);

  useEffect(() => {
    return () => {
      clearPlaybackTimer();
      clearTransitionTimers();
    };
  }, []);

  useEffect(() => {
    if (!historyReadyFrames.length) {
      setPreloadState({});
      return;
    }

    let cancelled = false;

    setPreloadState((current) => {
      const next: PreloadState = {};
      historyReadyFrames.forEach((frame) => {
        next[frame.timestamp] = current[frame.timestamp] === "loaded" ? "loaded" : "loading";
      });
      return next;
    });

    historyReadyFrames.forEach((frame) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        if (cancelled) return;
        setPreloadState((current) => ({ ...current, [frame.timestamp]: "loaded" }));
      };
      image.onerror = () => {
        if (cancelled) return;
        setPreloadState((current) => ({ ...current, [frame.timestamp]: "failed" }));
      };
      image.src = frameImageSrc(frame, "preload");
    });

    return () => {
      cancelled = true;
    };
  }, [historyReadyFrames]);

  useEffect(() => {
    if (!isPlaying || !canPlayHistory || isFading) return;

    clearPlaybackTimer();
    playbackTimerRef.current = window.setTimeout(() => {
      goToAdjacentFrame(1, { fromPlayback: true });
    }, FRAME_DISPLAY_MS_BY_SPEED[playbackSpeed]);

    return () => {
      clearPlaybackTimer();
    };
  }, [isPlaying, canPlayHistory, isFading, playerIndex, playbackSpeed, loopEnabled, preloadState, historyManifest]);

  function clearPlaybackTimer() {
    if (playbackTimerRef.current !== null) {
      window.clearTimeout(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
  }

  function clearTransitionTimers() {
    if (dominanceTimerRef.current !== null) {
      window.clearTimeout(dominanceTimerRef.current);
      dominanceTimerRef.current = null;
    }

    if (fadeTimerRef.current !== null) {
      window.clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }

    if (fadeRafRef.current !== null) {
      window.cancelAnimationFrame(fadeRafRef.current);
      fadeRafRef.current = null;
    }

    transitionInProgressRef.current = false;
  }

  function stopPlayback() {
    isPlayingRef.current = false;
    setIsPlaying(false);
    clearPlaybackTimer();
  }

  function playableIndexes(manifest = historyManifest) {
    if (!manifest) return [];

    return manifest.frames
      .map((frame, index) => ({ frame, index }))
      .filter(({ frame }) => frame.status === "ready" && preloadState[frame.timestamp] === "loaded")
      .map(({ index }) => index);
  }

  async function loadSelectedFrameMetadata(frame: OperaFrameManifestItem) {
    setSelectedFrameMeta(null);
    setSelectedFrameError(null);

    if (frame.status !== "ready") {
      setSelectedFrameError(frame.error ?? "Cette trame n'est pas prete dans le cache local.");
      return;
    }

    try {
      const response = await fetch(frame.metadataUrl, { cache: "no-store" });
      const payload = await response.json() as RenderResult;

      if (!response.ok || !payload.ok) {
        throw new Error(("error" in payload ? payload.error : undefined) ?? "Metadata de trame indisponible.");
      }

      setSelectedFrameMeta(payload);
    } catch (error) {
      setSelectedFrameError(error instanceof Error ? error.message : "Impossible de charger la metadata de la trame.");
    }
  }

  function showFrameImmediately(frame: OperaFrameManifestItem, options: { manifest?: OperaFrameManifest; stop?: boolean } = {}) {
    const manifest = options.manifest ?? historyManifest;
    const index = manifest?.frames.findIndex((candidate) => candidate.timestamp === frame.timestamp) ?? -1;

    if (options.stop !== false) stopPlayback();
    clearTransitionTimers();
    setIsFading(false);
    setFadeActive(false);
    setFadeFrame(null);
    setPlayerIndex(index >= 0 ? index : 0);
    setSelectedFrame(frame);
    setBaseFrame(frame.status === "ready" ? frame : null);
    void loadSelectedFrameMetadata(frame);
  }

  function transitionToIndex(nextIndex: number, options: { fromPlayback?: boolean } = {}) {
    const frame = historyManifest?.frames[nextIndex];
    if (!frame || frame.status !== "ready") return;

    if (nextIndex === playerIndex && baseFrame?.timestamp === frame.timestamp) {
      if (!options.fromPlayback) stopPlayback();
      clearPlaybackTimer();
      clearTransitionTimers();
      setBaseFrame(frame);
      setFadeFrame(null);
      setFadeActive(false);
      setIsFading(false);
      setSelectedFrame(frame);
      return;
    }

    if (!options.fromPlayback) stopPlayback();
    clearPlaybackTimer();
    clearTransitionTimers();

    if (!baseFrame || fadeDuration === 0) {
      showFrameImmediately(frame, { stop: !options.fromPlayback });
      return;
    }

    transitionInProgressRef.current = true;
    setFadeFrame(frame);
    setFadeActive(false);
    setIsFading(true);

    fadeRafRef.current = window.requestAnimationFrame(() => {
      setFadeActive(true);
      fadeRafRef.current = null;
    });

    dominanceTimerRef.current = window.setTimeout(() => {
      setPlayerIndex(nextIndex);
      setSelectedFrame(frame);
      void loadSelectedFrameMetadata(frame);
      dominanceTimerRef.current = null;
    }, Math.round(fadeDuration / 2));

    fadeTimerRef.current = window.setTimeout(() => {
      setBaseFrame(frame);
      setFadeFrame(null);
      setFadeActive(false);
      setIsFading(false);
      transitionInProgressRef.current = false;
      fadeTimerRef.current = null;
    }, fadeDuration);
  }

  function goToAdjacentFrame(direction: 1 | -1, options: { fromPlayback?: boolean } = {}) {
    if (transitionInProgressRef.current) return;

    const indexes = playableIndexes();
    if (!indexes.length) return;

    const currentPosition = indexes.includes(playerIndex)
      ? indexes.indexOf(playerIndex)
      : indexes.findIndex((index) => index > playerIndex);
    const safePosition = currentPosition >= 0 ? currentPosition : indexes.length - 1;
    const nextPosition = safePosition + direction;

    if (nextPosition >= indexes.length) {
      if (!loopEnabled) {
        stopPlayback();
        if (playerIndex !== indexes[indexes.length - 1]) {
          transitionToIndex(indexes[indexes.length - 1], options);
        }
        return;
      }

      transitionToIndex(indexes[0], options);
      return;
    }

    if (nextPosition < 0) {
      transitionToIndex(indexes[indexes.length - 1], options);
      return;
    }

    transitionToIndex(indexes[nextPosition], options);
  }

  function goToLatestFrame() {
    const indexes = playableIndexes();
    if (!indexes.length) return;
    transitionToIndex(indexes[indexes.length - 1]);
  }

  function togglePlayback() {
    if (!canPlayHistory || transitionInProgressRef.current) return;
    setIsPlaying((current) => !current);
  }

  async function testOperaRadar() {
    setLoading(true);
    setClientError(null);

    try {
      const response = await fetch("/api/radar/opera/latest", { cache: "no-store" });
      const payload = await response.json() as OperaResult;
      setResult(payload);
    } catch {
      setClientError("Impossible d'interroger la route locale /api/radar/opera/latest.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function renderLatestFrame() {
    setRenderLoading(true);
    setRenderError(null);
    setImageSrc(null);

    try {
      const response = await fetch("/api/radar/opera/render/latest/meta", { cache: "no-store" });
      const payload = await response.json() as RenderResult;

      if (!response.ok || !payload.ok) {
        throw new Error(("error" in payload ? payload.error : undefined) ?? "Le rendu OPERA a echoue.");
      }

      setRenderResult(payload);
      setImageSrc(`${payload.imageUrl}&weyra=${Date.now()}`);
    } catch (error) {
      setRenderError(error instanceof Error ? error.message : "Impossible de rendre la trame OPERA.");
      setRenderResult(null);
    } finally {
      setRenderLoading(false);
    }
  }

  async function fetchHistoryManifest(count = 12) {
    const response = await fetch(`/api/radar/opera/frames?count=${count}`, { cache: "no-store" });
    const payload = await response.json() as OperaFrameManifest;

    if (!response.ok && !payload.frames) {
      throw new Error(payload.error ?? "Impossible de decouvrir les scans OPERA.");
    }

    return payload;
  }

  async function selectHistoryFrame(frame: OperaFrameManifestItem, options: { manifest?: OperaFrameManifest } = {}) {
    showFrameImmediately(frame, { manifest: options.manifest });
  }

  async function prepareHistoryFrames() {
    stopPlayback();
    clearTransitionTimers();
    setHistoryLoading(true);
    setHistoryError(null);
    setSelectedFrame(null);
    setSelectedFrameMeta(null);
    setSelectedFrameError(null);
    setBaseFrame(null);
    setFadeFrame(null);
    setFadeActive(false);
    setIsFading(false);
    setPreloadState({});
    setHistoryProgress("Decouverte des scans OPERA...");

    let polling = true;

    try {
      const discovered = await fetchHistoryManifest(12);
      setHistoryManifest(discovered);

      const available = discovered.availableCount;
      setHistoryProgress(`Rendu ${discovered.readyCount + discovered.failedCount} / ${available || 12}`);

      const postPromise = fetch("/api/radar/opera/frames", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 12 }),
      });

      const pollPromise = (async () => {
        while (polling) {
          await wait(1400);
          if (!polling) return;

          try {
            const polled = await fetchHistoryManifest(12);
            setHistoryManifest(polled);
            setHistoryProgress(`Rendu ${polled.readyCount + polled.failedCount} / ${polled.availableCount || available || 12}`);
          } catch {
            // Keep the last known state while the POST is still rendering.
          }
        }
      })();

      const response = await postPromise;
      const finalManifest = await response.json() as OperaFrameManifest;
      polling = false;
      await pollPromise;

      if (!response.ok && !finalManifest.frames?.length) {
        throw new Error(finalManifest.error ?? "La preparation des scans OPERA a echoue.");
      }

      setHistoryManifest(finalManifest);
      setHistoryProgress(`Rendu ${finalManifest.readyCount + finalManifest.failedCount} / ${finalManifest.availableCount}`);

      const firstReady = finalManifest.frames.find((frame) => frame.status === "ready") ?? null;
      if (firstReady) {
        await selectHistoryFrame(firstReady, { manifest: finalManifest });
      }
    } catch (error) {
      polling = false;
      setHistoryError(error instanceof Error ? error.message : "Impossible de preparer l'historique OPERA.");
    } finally {
      polling = false;
      setHistoryLoading(false);
    }
  }

  const preloadStatusText = historyReadyFrames.length
    ? preloadFinishedCount < historyReadyFrames.length
      ? `Prechargement des trames ${preloadFinishedCount} / ${historyReadyFrames.length}`
      : `${preloadLoadedCount} trames prechargees${preloadFailedCount ? ` - ${preloadFailedCount} erreurs image` : ""}`
    : "Prechargement en attente";
  const displayFrame = selectedFrame ?? baseFrame;
  const playbackStatusText = canPlayHistory
    ? isPlaying ? "Lecture en cours" : "Lecture prete"
    : "Lecture disponible avec au moins 2 scans charges";
  const sliderMax = Math.max((historyManifest?.frames.length ?? 1) - 1, 0);

  return (
    <main className="radar-lab">
      <section className="radar-lab__shell">
        <div className="radar-lab__header">
          <p>Radar Lab</p>
          <h1>Weyra Radar Lab</h1>
          <span>Test du composite OPERA DBZH</span>
        </div>

        <div className="radar-lab__actions">
          <button className="radar-lab__button" type="button" onClick={testOperaRadar} disabled={loading}>
            {loading ? "Test en cours..." : "Tester le radar OPERA"}
          </button>
          <button className="radar-lab__button radar-lab__button--secondary" type="button" onClick={renderLatestFrame} disabled={renderLoading}>
            {renderLoading ? "Rendu en cours..." : "Rendre la derniere trame"}
          </button>
        </div>

        <p className="radar-lab__note">Donnee reelle OPERA DBZH — rendu Weyra experimental</p>

        <section className="radar-lab__card" aria-live="polite">
          <div className="radar-lab__status-row">
            <span className={`radar-lab__dot${result?.ok ? " is-ok" : ""}`} />
            <b>{loading ? "Chargement" : result ? (result.ok ? "Composite trouve" : "Verification echouee") : "Test OPERA en attente"}</b>
          </div>

          <dl className="radar-lab__grid">
            <div>
              <dt>Statut source</dt>
              <dd>{result?.sourceStatus.status ?? "Non teste"}</dd>
            </div>
            <div>
              <dt>Dernier scan UTC</dt>
              <dd>{formatDate(result?.latestTimestamp, "UTC")}</dd>
            </div>
            <div>
              <dt>Dernier scan Paris</dt>
              <dd>{formatDate(result?.latestTimestamp, "Europe/Paris")}</dd>
            </div>
            <div>
              <dt>Format</dt>
              <dd>{result?.format ?? "Non trouve"}</dd>
            </div>
            <div>
              <dt>Liens de donnees</dt>
              <dd>{result?.dataLinks.length ?? 0}</dd>
            </div>
            <div>
              <dt>Quota restant</dt>
              <dd>{result?.rateLimitRemaining ?? "Non fourni"}</dd>
            </div>
            <div>
              <dt>Fichier detecte</dt>
              <dd>{dataLink ? dataLink.fileType : "Aucun lien exploitable"}</dd>
            </div>
            <div>
              <dt>Fenetre UTC</dt>
              <dd>{result ? `${result.sourceStatus.windowStart} / ${result.sourceStatus.windowEnd}` : "Non testee"}</dd>
            </div>
          </dl>

          {(result?.error || clientError) && (
            <p className="radar-lab__error">{result?.error ?? clientError}</p>
          )}
        </section>

        <section className="radar-lab__card radar-lab__render" aria-live="polite">
          <div className="radar-lab__status-row">
            <span className={`radar-lab__dot${renderedMeta ? " is-ok" : ""}`} />
            <b>{renderLoading ? "Rendu local en cours" : renderedMeta ? "Trame rendue" : "Rendu local en attente"}</b>
          </div>

          {renderError && <p className="radar-lab__error">{renderError}</p>}

          {imageSrc && renderedMeta && (
            <div className="radar-lab__preview">
              <img src={imageSrc} alt="Rendu experimental du composite OPERA DBZH" />
            </div>
          )}

          <dl className="radar-lab__grid">
            <div>
              <dt>Heure UTC</dt>
              <dd>{formatDate(renderedMeta?.timestamp, "UTC")}</dd>
            </div>
            <div>
              <dt>Heure Paris</dt>
              <dd>{formatDate(renderedMeta?.timestamp, "Europe/Paris")}</dd>
            </div>
            <div>
              <dt>Dimensions</dt>
              <dd>{renderedMeta ? `${renderedMeta.width} x ${renderedMeta.height}` : "Non rendu"}</dd>
            </div>
            <div>
              <dt>Projection</dt>
              <dd>{metadata?.projection ?? "Non trouvee"}</dd>
            </div>
            <div>
              <dt>Georeferencement</dt>
              <dd>{renderedMeta ? (renderedMeta.hasGeoreferencing ? "Trouve" : "Incomplet") : "Non teste"}</dd>
            </div>
            <div>
              <dt>Chemin HDF5</dt>
              <dd>{metadata?.hdf5DataPath ?? "Non rendu"}</dd>
            </div>
          </dl>

          <p className="radar-lab__caption">
            Cette image est un rendu technique local. Elle n'est pas encore animee dans Atlas.
          </p>
        </section>

        <RadarValidationMap result={renderedMeta} />

        <section className="radar-lab__card radar-lab__history" aria-live="polite">
          <div className="radar-lab__history-head">
            <div>
              <p className="radar-lab__eyebrow">Historique OPERA - 12 scans</p>
              <h2>Trames reelles OPERA DBZH · rendu Weyra local</h2>
              <span>{historyCounter(historyManifest)}</span>
            </div>
            <button className="radar-lab__button" type="button" onClick={prepareHistoryFrames} disabled={historyLoading}>
              {historyLoading ? "Preparation en cours..." : "Preparer les 12 derniers scans"}
            </button>
          </div>

          <div className="radar-lab__progress">
            <span>{historyProgress}</span>
            {historyManifest && (
              <b>{historyManifest.readyCount} prets · {historyManifest.failedCount} erreurs · {historyManifest.missingCount} manquants</b>
            )}
          </div>

          {historyError && <p className="radar-lab__error">{historyError}</p>}
          {historyManifest?.error && <p className="radar-lab__error">{historyManifest.error}</p>}

          {historyManifest && historyManifest.frames.length > 0 && (
            <>
              <section className="radar-lab__player" aria-label="Lecture radar OPERA">
                <div className="radar-lab__player-head">
                  <div>
                    <p className="radar-lab__eyebrow">Lecture radar OPERA</p>
                    <h3>Radar OPERA · DBZH</h3>
                    <span>Scan reel · 5 min</span>
                  </div>
                  <div className="radar-lab__player-time">
                    <b>{formatDate(displayFrame?.timestamp, "UTC")}</b>
                    <span>{formatDate(displayFrame?.timestamp, "Europe/Paris")}</span>
                  </div>
                </div>

                <div className="radar-lab__preload-status">
                  <span>{preloadStatusText}</span>
                  <b>{playbackStatusText}</b>
                </div>

                <div className="radar-lab__player-stage">
                  {baseFrame ? (
                    <img
                      className="radar-lab__player-layer"
                      src={frameImageSrc(baseFrame, "player")}
                      alt={`Scan OPERA ${baseFrame.timestamp}`}
                      style={{
                        opacity: fadeFrame && fadeActive ? 0 : 1,
                        transitionDuration: `${fadeDuration}ms`,
                      }}
                    />
                  ) : (
                    <div className="radar-lab__player-empty">Prepare les scans pour lancer la lecture.</div>
                  )}

                  {fadeFrame && (
                    <img
                      className="radar-lab__player-layer"
                      src={frameImageSrc(fadeFrame, "player")}
                      alt={`Scan OPERA ${fadeFrame.timestamp}`}
                      style={{
                        opacity: fadeActive ? 1 : 0,
                        transitionDuration: `${fadeDuration}ms`,
                      }}
                    />
                  )}

                  <div className="radar-lab__player-badge">
                    <strong>Radar OPERA · DBZH</strong>
                    <span>Scan reel · 5 min</span>
                  </div>
                </div>

                <p className="radar-lab__caption">
                  Animation visuelle entre scans OPERA reels espaces de 5 minutes. Aucun nowcast ni donnee intermediaire n'est genere.
                </p>

                <div className="radar-lab__controls">
                  <button className="radar-lab__control" type="button" onClick={togglePlayback} disabled={!canPlayHistory}>
                    {isPlaying ? "Pause" : "Lecture"}
                  </button>
                  <button className="radar-lab__control" type="button" onClick={() => { goToAdjacentFrame(-1); }} disabled={!canPlayHistory}>
                    Precedent
                  </button>
                  <button className="radar-lab__control" type="button" onClick={() => { goToAdjacentFrame(1); }} disabled={!canPlayHistory}>
                    Suivant
                  </button>
                  <button className="radar-lab__control" type="button" onClick={goToLatestFrame} disabled={!canPlayHistory}>
                    Dernier scan
                  </button>
                  <button className={`radar-lab__control${loopEnabled ? " is-active" : ""}`} type="button" onClick={() => { setLoopEnabled((current) => !current); }}>
                    Boucle {loopEnabled ? "active" : "inactive"}
                  </button>

                  <div className="radar-lab__speed" role="group" aria-label="Vitesse de lecture">
                    {([0.5, 1, 2] as PlaybackSpeed[]).map((speed) => (
                      <button
                        key={speed}
                        className={`radar-lab__speed-button${playbackSpeed === speed ? " is-active" : ""}`}
                        type="button"
                        onClick={() => { setPlaybackSpeed(speed); }}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>
                </div>

                <div className="radar-lab__slider">
                  <input
                    type="range"
                    min="0"
                    max={sliderMax}
                    step="1"
                    value={Math.min(playerIndex, sliderMax)}
                    onChange={(event) => {
                      const frame = historyManifest.frames[Number(event.currentTarget.value)];
                      if (frame) showFrameImmediately(frame);
                    }}
                    aria-label="Choisir un scan OPERA"
                  />
                  <div className="radar-lab__slider-labels">
                    {historyManifest.frames.map((frame) => (
                      <span key={frame.timestamp}>{formatShortTime(frame.timestamp, "Europe/Paris").replace(" UTC+2", "")}</span>
                    ))}
                  </div>
                </div>
              </section>

              <div className="radar-lab__filmstrip" role="list" aria-label="Historique OPERA DBZH">
                {historyManifest.frames.map((frame, index) => {
                  const isSelected = playerIndex === index;
                  const isReady = frame.status === "ready";
                  const imageStatus = preloadState[frame.timestamp];
                  const isImageFailed = imageStatus === "failed";

                  return (
                    <button
                      key={frame.timestamp}
                      className={`radar-lab__thumb${isSelected ? " is-selected" : ""}${isReady ? " is-ready" : ""}${isPlaying && isSelected ? " is-playing" : ""}`}
                      type="button"
                      onClick={() => { void selectHistoryFrame(frame); }}
                      role="listitem"
                    >
                      <span>{formatShortTime(frame.timestamp, "Europe/Paris")}</span>
                      <div className="radar-lab__thumb-image">
                        {isReady && !isImageFailed ? (
                          <img src={frameImageSrc(frame, "thumb")} alt={`Trame OPERA ${frame.timestamp}`} />
                        ) : (
                          <em>{frame.status === "failed" || isImageFailed ? "Erreur" : "Manquant"}</em>
                        )}
                      </div>
                      <small>{isReady ? imageStatus === "loaded" ? "charge" : imageStatus === "failed" ? "erreur image" : "chargement" : frame.status}</small>
                      <span className="radar-lab__thumb-progress" aria-hidden="true" />
                    </button>
                  );
                })}
              </div>

              {selectedFrame && (
                <div className="radar-lab__selected-frame">
                  <dl className="radar-lab__grid">
                    <div>
                      <dt>Heure UTC</dt>
                      <dd>{formatDate(selectedFrame.timestamp, "UTC")}</dd>
                    </div>
                    <div>
                      <dt>Heure Paris</dt>
                      <dd>{formatDate(selectedFrame.timestamp, "Europe/Paris")}</dd>
                    </div>
                    <div>
                      <dt>Dimensions</dt>
                      <dd>{selectedFrame.width && selectedFrame.height ? `${selectedFrame.width} x ${selectedFrame.height}` : "Non disponible"}</dd>
                    </div>
                    <div>
                      <dt>Taille WebP</dt>
                      <dd>{formatBytes(selectedFrame.imageByteLength)}</dd>
                    </div>
                    <div>
                      <dt>Projection</dt>
                      <dd>{selectedFrameMeta?.projection ?? selectedFrameMeta?.metadata?.projection ?? "Non chargee"}</dd>
                    </div>
                    <div>
                      <dt>Georeferencement</dt>
                      <dd>{selectedFrame.hasGeoreferencing ? "Valide" : "Non valide"}</dd>
                    </div>
                  </dl>

                  {selectedFrameError && <p className="radar-lab__error">{selectedFrameError}</p>}
                </div>
              )}

              <dl className="radar-lab__grid radar-lab__history-grid">
                <div>
                  <dt>Chronologie</dt>
                  <dd>{historyManifest.frames.map((frame) => formatShortTime(frame.timestamp, "Europe/Paris")).join(" -> ")}</dd>
                </div>
                <div>
                  <dt>Ecarts constates</dt>
                  <dd>{historyGaps.length ? `${historyGaps.join(", ")} min` : "Non calcules"}</dd>
                </div>
                <div>
                  <dt>Rendu total</dt>
                  <dd>{formatDuration(historyManifest.durationMs)}</dd>
                </div>
                <div>
                  <dt>Images WebP pretes</dt>
                  <dd>{historyReadyFrames.length}</dd>
                </div>
              </dl>
            </>
          )}
        </section>

        <details className="radar-lab__json">
          <summary>Voir la reponse JSON OPERA</summary>
          <pre>{JSON.stringify(result ?? { ok: false, error: clientError ?? "Aucun test lance" }, null, 2)}</pre>
        </details>

        <details className="radar-lab__json">
          <summary>Voir le manifest historique</summary>
          <pre>{JSON.stringify(historyManifest ?? { ok: false, error: historyError ?? "Aucun historique prepare" }, null, 2)}</pre>
        </details>

        <details className="radar-lab__json">
          <summary>Voir la metadata du rendu</summary>
          <pre>{JSON.stringify(renderResult ?? { ok: false, error: renderError ?? "Aucun rendu lance" }, null, 2)}</pre>
        </details>
      </section>

      <style>{`
        .radar-lab {
          height: 100vh;
          min-height: 100vh;
          overflow: auto;
          padding: 48px 20px;
          color: #e8f0f8;
          background: linear-gradient(145deg, #06111e 0%, #081622 46%, #04101a 100%);
        }

        .radar-lab__shell {
          width: min(1080px, 100%);
          margin: 0 auto;
          padding-bottom: 54px;
        }

        .radar-lab__header {
          margin-bottom: 24px;
        }

        .radar-lab__header p {
          margin: 0 0 10px;
          color: #77d9ff;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0;
          text-transform: uppercase;
        }

        .radar-lab__header h1 {
          margin: 0;
          color: #ffffff;
          font-size: 42px;
          line-height: 1.05;
          letter-spacing: 0;
        }

        .radar-lab__header span {
          display: block;
          margin-top: 12px;
          color: #9fb2c7;
          font-size: 17px;
        }

        .radar-lab__actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 14px;
        }

        .radar-lab__button {
          min-height: 46px;
          padding: 0 18px;
          color: #06111e;
          background: #7ce3ff;
          border: 0;
          border-radius: 8px;
          box-shadow: 0 14px 28px rgba(30, 191, 255, 0.18);
          font-size: 14px;
          font-weight: 900;
          cursor: pointer;
        }

        .radar-lab__button--secondary {
          color: #e8f7ff;
          background: #214b68;
          box-shadow: none;
        }

        .radar-lab__button:disabled {
          cursor: progress;
          opacity: 0.68;
        }

        .radar-lab__note {
          margin: 0 0 22px;
          color: #b8cadb;
          font-size: 13px;
          font-weight: 800;
        }

        .radar-lab__card,
        .radar-lab__json {
          margin-top: 22px;
          border: 1px solid rgba(147, 176, 204, 0.22);
          border-radius: 8px;
          background: rgba(5, 15, 27, 0.82);
          box-shadow: 0 18px 46px rgba(0, 0, 0, 0.28);
          backdrop-filter: blur(16px);
        }

        .radar-lab__card {
          padding: 22px;
        }

        .radar-lab__status-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 18px;
        }

        .radar-lab__status-row b {
          font-size: 16px;
        }

        .radar-lab__dot {
          width: 11px;
          height: 11px;
          border-radius: 99px;
          background: #ff9e64;
          box-shadow: 0 0 0 5px rgba(255, 158, 100, 0.13);
        }

        .radar-lab__dot.is-ok {
          background: #6dffae;
          box-shadow: 0 0 0 5px rgba(109, 255, 174, 0.13);
        }

        .radar-lab__grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
          margin: 0;
        }

        .radar-lab__grid div {
          min-width: 0;
          padding: 14px;
          border: 1px solid rgba(147, 176, 204, 0.15);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.035);
        }

        .radar-lab__grid dt {
          margin-bottom: 7px;
          color: #8aa0b6;
          font-size: 12px;
          font-weight: 800;
        }

        .radar-lab__grid dd {
          margin: 0;
          overflow-wrap: anywhere;
          color: #f4f8fb;
          font-size: 14px;
          font-weight: 800;
        }

        .radar-lab__error {
          margin: 18px 0 0;
          padding: 13px 14px;
          color: #ffd8cf;
          border: 1px solid rgba(255, 127, 102, 0.28);
          border-radius: 8px;
          background: rgba(151, 48, 40, 0.18);
          font-size: 13px;
          font-weight: 700;
        }

        .radar-lab__preview {
          display: flex;
          justify-content: center;
          margin: 0 0 18px;
          padding: 16px;
          border: 1px solid rgba(147, 176, 204, 0.18);
          border-radius: 8px;
          background-color: #07101a;
          background-image:
            linear-gradient(45deg, rgba(255,255,255,0.045) 25%, transparent 25%),
            linear-gradient(-45deg, rgba(255,255,255,0.045) 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.045) 75%),
            linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.045) 75%);
          background-position: 0 0, 0 10px, 10px -10px, -10px 0;
          background-size: 20px 20px;
        }

        .radar-lab__preview img {
          display: block;
          width: min(100%, 760px);
          height: auto;
          image-rendering: pixelated;
        }

        .radar-lab__map {
          width: 100%;
          height: min(68vh, 620px);
          min-height: 420px;
          overflow: hidden;
          border: 1px solid rgba(147, 176, 204, 0.18);
          border-radius: 8px;
          background: #07101a;
        }

        .radar-lab-map-marker {
          padding: 4px 7px;
          color: #06111e;
          background: #7ce3ff;
          border: 2px solid #06111e;
          border-radius: 8px;
          box-shadow: 0 8px 18px rgba(0,0,0,.36);
          font-size: 11px;
          font-weight: 900;
          white-space: nowrap;
        }

        .radar-lab__caption {
          margin: 16px 0 0;
          color: #9fb2c7;
          font-size: 13px;
          font-weight: 700;
        }

        .radar-lab__json,
        .radar-lab__inline-details {
          overflow: hidden;
        }

        .radar-lab__json summary,
        .radar-lab__inline-details summary {
          padding: 15px 18px;
          color: #c8d6e5;
          cursor: pointer;
          font-weight: 800;
        }

        .radar-lab__json pre,
        .radar-lab__inline-details pre {
          max-height: 420px;
          margin: 0;
          padding: 18px;
          overflow: auto;
          border-top: 1px solid rgba(147, 176, 204, 0.15);
          color: #d7e8f8;
          background: rgba(0, 0, 0, 0.26);
          font-size: 12px;
          line-height: 1.6;
        }

        .radar-lab__inline-details {
          margin-top: 16px;
          border: 1px solid rgba(147, 176, 204, 0.14);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.035);
        }

        .radar-lab__history-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
          margin-bottom: 18px;
        }

        .radar-lab__history-head h2 {
          margin: 4px 0 6px;
          color: #ffffff;
          font-size: 20px;
          line-height: 1.2;
          letter-spacing: 0;
        }

        .radar-lab__history-head span,
        .radar-lab__progress span {
          color: #9fb2c7;
          font-size: 13px;
          font-weight: 800;
        }

        .radar-lab__eyebrow {
          margin: 0;
          color: #77d9ff;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0;
          text-transform: uppercase;
        }

        .radar-lab__progress {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 16px;
          padding: 12px 14px;
          border: 1px solid rgba(124, 227, 255, 0.16);
          border-radius: 8px;
          background: rgba(124, 227, 255, 0.055);
        }

        .radar-lab__progress b {
          color: #e8f7ff;
          font-size: 12px;
        }

        .radar-lab__player {
          display: grid;
          gap: 16px;
          margin: 18px 0;
          padding: 16px;
          border: 1px solid rgba(147, 176, 204, 0.16);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.026);
        }

        .radar-lab__player-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }

        .radar-lab__player-head h3 {
          margin: 4px 0 6px;
          color: #ffffff;
          font-size: 18px;
          line-height: 1.2;
          letter-spacing: 0;
        }

        .radar-lab__player-head span,
        .radar-lab__player-time span {
          color: #9fb2c7;
          font-size: 12px;
          font-weight: 800;
        }

        .radar-lab__player-time {
          display: grid;
          gap: 4px;
          min-width: 220px;
          padding: 10px 12px;
          border: 1px solid rgba(124, 227, 255, 0.14);
          border-radius: 8px;
          background: rgba(5, 15, 27, 0.72);
          text-align: right;
        }

        .radar-lab__player-time b {
          color: #f4f8fb;
          font-size: 13px;
        }

        .radar-lab__preload-status {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 12px;
          border: 1px solid rgba(147, 176, 204, 0.14);
          border-radius: 8px;
          background: rgba(0, 0, 0, 0.18);
        }

        .radar-lab__preload-status span,
        .radar-lab__preload-status b {
          color: #c8d6e5;
          font-size: 12px;
          font-weight: 900;
        }

        .radar-lab__player-stage {
          position: relative;
          display: grid;
          place-items: center;
          height: min(68vh, 650px);
          min-height: 360px;
          overflow: hidden;
          border: 1px solid rgba(147, 176, 204, 0.18);
          border-radius: 8px;
          background-color: #07101a;
          background-image:
            linear-gradient(45deg, rgba(255,255,255,0.045) 25%, transparent 25%),
            linear-gradient(-45deg, rgba(255,255,255,0.045) 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.045) 75%),
            linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.045) 75%);
          background-position: 0 0, 0 10px, 10px -10px, -10px 0;
          background-size: 20px 20px;
        }

        .radar-lab__player-layer {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: contain;
          image-rendering: pixelated;
          transition-property: opacity;
          transition-timing-function: linear;
          will-change: opacity;
        }

        .radar-lab__player-empty {
          color: #9fb2c7;
          font-size: 13px;
          font-weight: 900;
        }

        .radar-lab__player-badge {
          position: absolute;
          left: 14px;
          bottom: 14px;
          display: grid;
          gap: 3px;
          padding: 9px 11px;
          border: 1px solid rgba(124, 227, 255, 0.2);
          border-radius: 8px;
          background: rgba(5, 15, 27, 0.82);
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.24);
        }

        .radar-lab__player-badge strong {
          color: #f4f8fb;
          font-size: 12px;
        }

        .radar-lab__player-badge span {
          color: #9fb2c7;
          font-size: 11px;
          font-weight: 800;
        }

        .radar-lab__controls {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
        }

        .radar-lab__control,
        .radar-lab__speed-button {
          min-height: 38px;
          padding: 0 13px;
          color: #dcebf7;
          border: 1px solid rgba(147, 176, 204, 0.22);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.045);
          font-size: 12px;
          font-weight: 900;
          cursor: pointer;
        }

        .radar-lab__control.is-active,
        .radar-lab__speed-button.is-active {
          color: #06111e;
          border-color: #7ce3ff;
          background: #7ce3ff;
        }

        .radar-lab__control:disabled {
          cursor: not-allowed;
          opacity: 0.48;
        }

        .radar-lab__speed {
          display: flex;
          gap: 6px;
          padding: 4px;
          border: 1px solid rgba(147, 176, 204, 0.14);
          border-radius: 8px;
          background: rgba(0, 0, 0, 0.16);
        }

        .radar-lab__slider {
          display: grid;
          gap: 8px;
        }

        .radar-lab__slider input {
          width: 100%;
          accent-color: #7ce3ff;
        }

        .radar-lab__slider-labels {
          display: grid;
          grid-template-columns: repeat(12, minmax(0, 1fr));
          gap: 6px;
          color: #8aa0b6;
          font-size: 10px;
          font-weight: 800;
          text-align: center;
        }

        .radar-lab__filmstrip {
          display: grid;
          grid-auto-columns: minmax(138px, 162px);
          grid-auto-flow: column;
          gap: 12px;
          margin: 18px -4px 18px;
          padding: 4px 4px 12px;
          overflow-x: auto;
        }

        .radar-lab__thumb {
          display: grid;
          gap: 8px;
          padding: 10px;
          color: #dcebf7;
          border: 1px solid rgba(147, 176, 204, 0.18);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.035);
          cursor: pointer;
          text-align: left;
          position: relative;
        }

        .radar-lab__thumb.is-selected {
          border-color: rgba(124, 227, 255, 0.82);
          box-shadow: 0 0 0 2px rgba(124, 227, 255, 0.14);
        }

        .radar-lab__thumb span,
        .radar-lab__thumb small {
          font-size: 12px;
          font-weight: 900;
        }

        .radar-lab__thumb small {
          color: #8aa0b6;
          text-transform: uppercase;
        }

        .radar-lab__thumb.is-playing small {
          color: #7ce3ff;
        }

        .radar-lab__thumb-progress {
          display: block;
          height: 3px;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(147, 176, 204, 0.14);
        }

        .radar-lab__thumb-progress::after {
          content: "";
          display: block;
          width: 0;
          height: 100%;
          background: #7ce3ff;
        }

        .radar-lab__thumb.is-selected .radar-lab__thumb-progress::after {
          width: 100%;
        }

        .radar-lab__thumb-image {
          display: grid;
          place-items: center;
          width: 100%;
          aspect-ratio: 1.35;
          overflow: hidden;
          border: 1px solid rgba(147, 176, 204, 0.14);
          border-radius: 8px;
          background-color: #07101a;
          background-image:
            linear-gradient(45deg, rgba(255,255,255,0.045) 25%, transparent 25%),
            linear-gradient(-45deg, rgba(255,255,255,0.045) 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.045) 75%),
            linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.045) 75%);
          background-position: 0 0, 0 10px, 10px -10px, -10px 0;
          background-size: 20px 20px;
        }

        .radar-lab__thumb-image img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          image-rendering: pixelated;
        }

        .radar-lab__thumb-image em {
          color: #8aa0b6;
          font-size: 12px;
          font-style: normal;
          font-weight: 900;
        }

        .radar-lab__selected-frame {
          display: grid;
          gap: 18px;
          margin-top: 18px;
        }

        .radar-lab__selected-preview {
          display: grid;
          place-items: center;
          min-height: 320px;
          overflow: hidden;
          border: 1px solid rgba(147, 176, 204, 0.18);
          border-radius: 8px;
          background-color: #07101a;
          background-image:
            linear-gradient(45deg, rgba(255,255,255,0.045) 25%, transparent 25%),
            linear-gradient(-45deg, rgba(255,255,255,0.045) 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.045) 75%),
            linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.045) 75%);
          background-position: 0 0, 0 10px, 10px -10px, -10px 0;
          background-size: 20px 20px;
        }

        .radar-lab__selected-preview img {
          display: block;
          width: min(100%, 820px);
          height: auto;
          image-rendering: pixelated;
        }

        .radar-lab__selected-preview p {
          margin: 0;
          color: #9fb2c7;
          font-weight: 800;
        }

        .radar-lab__history-grid {
          margin-top: 18px;
        }

        @media (max-width: 680px) {
          .radar-lab {
            padding: 32px 14px;
          }

          .radar-lab__header h1 {
            font-size: 34px;
          }

          .radar-lab__grid {
            grid-template-columns: 1fr;
          }

          .radar-lab__button {
            width: 100%;
          }

          .radar-lab__map {
            min-height: 360px;
          }

          .radar-lab__history-head {
            display: grid;
          }

          .radar-lab__player-head,
          .radar-lab__preload-status {
            display: grid;
          }

          .radar-lab__player-time {
            min-width: 0;
            text-align: left;
          }

          .radar-lab__player-stage {
            min-height: 320px;
          }

          .radar-lab__control,
          .radar-lab__speed,
          .radar-lab__speed-button {
            width: 100%;
          }

          .radar-lab__speed {
            box-sizing: border-box;
          }

          .radar-lab__slider-labels {
            font-size: 9px;
          }
        }
      `}</style>
    </main>
  );
}
