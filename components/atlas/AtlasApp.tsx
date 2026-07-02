"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import AtlasMap from "@/components/atlas/AtlasMap";
import ObservationDrawer from "@/components/atlas/ObservationDrawer";
import ObservationDetail from "@/components/atlas/ObservationDetail";
import { createObservation, isSupabaseConfigured, loadObservations, subscribeToObservations, uploadObservationPhoto } from "@/lib/observations";
import { fetchWeather, searchLocations, weatherCodeInfo } from "@/lib/weather";
import type { Coordinates, LocationSelection, Observation, ObservationCategory, RadarFrame, WeatherSnapshot } from "@/lib/types";

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

function scanStatus(frame: RadarFrame | undefined) {
  const age = scanAgeMinutes(frame);
  if (age === null) return "Connexion radar…";
  return `Scan ${formatRadarTime(frame)} · il y a ${age} min`;
}

export default function AtlasApp() {
  const mapRef = useRef<MapLibreMap | null>(null);
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
  const radarFramesRef = useRef<RadarFrame[]>([]);
  const radarFrameIndexRef = useRef(0);
  const radarFollowingLiveRef = useRef(true);

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

  useEffect(() => {
    void Promise.all([refreshWeather(INITIAL_LOCATION), refreshRadar(), refreshObservations()]).finally(() => setLoading(false));
  }, [refreshObservations, refreshRadar, refreshWeather]);

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
      void refreshRadar();
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

  const currentWeatherInfo = weather ? weatherCodeInfo(weather.weatherCode) : { label: "Chargement…", icon: "🌦️" };
  const currentRadarFrame = radarFrames[radarFrameIndex];
  const latestRadarFrame = radarFrames.at(-1);
  const latestAge = scanAgeMinutes(latestRadarFrame);
  const radarIsFresh = latestAge !== null && latestAge <= Math.max(7, radarCadenceMinutes + 2);
  const radarProgress = radarFrames.length < 2 ? 100 : (radarFrameIndex / (radarFrames.length - 1)) * 100;
  const liveCommunity = isSupabaseConfigured();
  const usesMeteoFranceRadar = radarProvider.toLowerCase().includes("meteo");
  const radarSourceText = usesMeteoFranceRadar ? "Radar France · 5 min" : "Radar public · 10 min";

  const onMapReady = useCallback((map: MapLibreMap) => { mapRef.current = map; }, []);
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

  const likeObservation = useCallback((id: string) => {
    setObservations((current) => current.map((item) => (item.id === id ? { ...item, likes: item.likes + 1 } : item)));
    setSelectedObservation((current) => (current?.id === id ? { ...current, likes: current.likes + 1 } : current));
    showToast("Observation appréciée.");
  }, [showToast]);

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
        observationLayerVisible={observationsVisible}
        onMapReady={onMapReady}
        onMapClick={onMapClick}
        onObservationClick={setSelectedObservation}
      />

      <header className="atlas-topbar">
        <div className="atlas-brand"><span className="atlas-brand__mark" /><span>weyra</span></div>
        <div className="atlas-search">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un lieu…" aria-label="Rechercher une ville" />
          <span>⌕</span>
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
        <div className="atlas-location-chip"><span>{currentWeatherInfo.icon}</span><div><b>{location.name}{location.country ? `, ${location.country === "France" ? "FR" : location.country}` : ""}</b><small>{weather ? `${Math.round(weather.temperature)}° · ${currentWeatherInfo.label}` : "Chargement…"}</small></div></div>
        <div className="atlas-topbar__spacer" />
        <button className="atlas-round-button" onClick={useCurrentPosition} title="Utiliser ma position">⌖</button>
        <button className="atlas-round-button" onClick={() => showToast("Les espaces communauté arrivent après Atlas Core.")} title="Communauté">◉</button>
        <button className="atlas-round-button" onClick={() => showToast("Aucune alerte Weyra active.")} title="Notifications">♧<i>3</i></button>
        <button className="atlas-round-button" onClick={() => setDrawerOpen(true)} title="Ajouter une observation">＋</button>
      </header>

      <section className="atlas-weather-card">
        <span className="atlas-weather-card__eyebrow">Maintenant à</span>
        <h1>{location.country ? `${location.name}, ${location.country}` : location.name}</h1>
        <div className="atlas-weather-card__main"><span>{currentWeatherInfo.icon}</span><div><strong>{weather ? `${Math.round(weather.temperature)}°` : "—"}</strong><p>{currentWeatherInfo.label}</p><small>Ressenti {weather ? `${Math.round(weather.apparentTemperature)}°` : "—"}</small></div></div>
        <div className="atlas-weather-card__divider" />
        <div className="atlas-weather-card__stats">
          <div><span>Vent</span><b>{weather ? `${Math.round(weather.windSpeed)} km/h` : "—"}</b></div>
          <div><span>Pluie</span><b>{weather ? `${weather.precipitation.toFixed(1)} mm/h` : "—"}</b></div>
          <div><span>Rafales</span><b>{weather ? `${Math.round(weather.windGusts)} km/h` : "—"}</b></div>
          <div><span>Pression</span><b>{weather ? `${Math.round(weather.pressure)} hPa` : "—"}</b></div>
        </div>
      </section>

      <section className="atlas-layers">
        <button className={radarVisible ? "is-active" : ""} onClick={() => setRadarVisible((value) => !value)}><span>☔</span><b>Radar</b></button>
        <button className="is-disabled" onClick={() => showToast("Flux local désactivé tant qu’une vraie grille vectorielle n’est pas branchée.")}><span>≋</span><b>Flux local</b><em>Bientôt</em></button>
        <button className={observationsVisible ? "is-active" : ""} onClick={() => setObservationsVisible((value) => !value)}><span>◉</span><b>Observations</b><i /></button>
        <button onClick={() => showToast("Température, nuages et qualité de l’air arrivent dans les couches suivantes.")}><span>◌</span><b>Autres couches</b></button>
        <small>{liveCommunity ? "Communauté connectée" : `${radarSourceText} · ${scanStatus(latestRadarFrame)}`}</small>
      </section>

      <section className="atlas-map-tools">
        <button onClick={() => mapRef.current?.flyTo({ center: [location.lon, location.lat], zoom: Math.max(mapRef.current.getZoom(), 8.45), essential: true })}>⌖</button>
        <button onClick={() => setDrawerOpen(true)}>⌁</button>
        <div><button onClick={() => mapRef.current?.zoomIn()}>＋</button><button onClick={() => mapRef.current?.zoomOut()}>−</button></div>
      </section>

      <section className="atlas-radar-legend">
        <b>Intensité radar (mm/h)</b><div /><small><span>0.1</span><span>1</span><span>3</span><span>10</span><span>30</span><span>100+</span></small>
      </section>

      <section className="atlas-timeline">
        <button className="atlas-timeline__play" onClick={() => setRadarPlaying((value) => !value)}>{radarPlaying ? "❚❚" : "▶"}</button>
        <b>{radarFollowingLive ? (radarIsFresh ? "Maintenant" : "Dernier scan") : "Historique"}</b>
        <button
          className={`atlas-live-pill${radarFollowingLive && radarIsFresh ? " is-live" : ""}`}
          onClick={() => {
            const latest = Math.max(0, radarFrames.length - 1);
            radarFrameIndexRef.current = latest;
            radarFollowingLiveRef.current = true;
            setRadarFollowingLive(true);
            setRadarFrameIndex(latest);
            setRadarPlaying(false);
          }}
          title="Revenir au dernier scan réellement disponible"
        >LIVE</button>
        <div className="atlas-timeline__slider">
          <i style={{ left: `${Math.max(2, Math.min(98, radarProgress))}%` }}>{formatRadarTime(currentRadarFrame)}</i>
          <input
            type="range"
            min="0"
            max={Math.max(0, radarFrames.length - 1)}
            value={radarFrameIndex}
            onChange={(event) => {
              const next = Number(event.target.value);
              radarFrameIndexRef.current = next;
              const follows = next >= radarFrames.length - 1;
              radarFollowingLiveRef.current = follows;
              setRadarFollowingLive(follows);
              setRadarFrameIndex(next);
            }}
          />
          <small><span>-2 h</span><span>-1 h</span><span>-30 min</span><span>Maintenant</span></small>
        </div>
        <div className="atlas-timeline__ranges"><button className="is-active">1 h</button><button>3 h</button><button>6 h</button></div>
      </section>

      <ObservationDetail observation={selectedWithLatestLike} onClose={() => setSelectedObservation(null)} onLike={likeObservation} />
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
