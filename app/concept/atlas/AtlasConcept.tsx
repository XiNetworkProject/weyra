"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import styles from "./atlas-concept.module.css";

type RadarFrame = { time: number; path: string };
type RainViewerPayload = {
  host: string;
  radar?: { past?: RadarFrame[]; nowcast?: RadarFrame[] };
};
type WeatherState = {
  temperature: number;
  apparent: number;
  humidity: number;
  wind: number;
  precipitation: number;
  code: number;
  hourly: Array<{ time: string; temperature: number; precipitation: number; code: number }>;
};
type Place = { name: string; country: string; latitude: number; longitude: number };
type IconName = "home" | "atlas" | "users" | "message" | "user" | "search" | "bell" | "layers" | "cloud" | "bolt" | "locate" | "plus" | "minus" | "play" | "pause" | "heart" | "comment" | "bookmark" | "chevron" | "radar";

const DEFAULT_PLACE: Place = { name: "Lille", country: "France", latitude: 50.6292, longitude: 3.0573 };
const NAV: Array<{ label: string; icon: IconName; active?: boolean }> = [
  { label: "Accueil", icon: "home" },
  { label: "Atlas", icon: "atlas", active: true },
  { label: "Communautés", icon: "users" },
  { label: "Messages", icon: "message" },
  { label: "Profil", icon: "user" },
];

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  const paths: Record<IconName, React.ReactNode> = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9" /><path d="M9 20v-6h6v6" /></>,
    atlas: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    message: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" /><path d="M8 9h8M8 13h5" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    layers: <><path d="m12 2 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 17l9 5 9-5" /></>,
    cloud: <><path d="M17.5 19H7a5 5 0 1 1 1.7-9.7A6.5 6.5 0 0 1 21 12.5 4.5 4.5 0 0 1 17.5 19Z" /></>,
    bolt: <><path d="m13 2-8 12h7l-1 8 8-12h-7l1-8Z" /></>,
    locate: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    minus: <><path d="M5 12h14" /></>,
    play: <path d="m8 5 11 7-11 7Z" />,
    pause: <><path d="M9 5v14M15 5v14" /></>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />,
    comment: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" /></>,
    bookmark: <path d="M6 3h12v18l-6-4-6 4V3Z" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    radar: <><circle cx="12" cy="12" r="9" /><path d="M12 12 18 6M12 7a5 5 0 0 1 5 5M12 4a8 8 0 0 1 8 8" /><circle cx="12" cy="12" r="1" fill="currentColor" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function weatherLabel(code: number) {
  if (code === 0) return "Ciel dégagé";
  if (code <= 3) return "Nuageux";
  if (code <= 48) return "Brouillard";
  if (code <= 67) return "Pluie";
  if (code <= 77) return "Neige";
  if (code <= 82) return "Averses";
  return "Orage";
}

function weatherGlyph(code: number) {
  if (code === 0) return "☀️";
  if (code <= 3) return "🌤️";
  if (code <= 48) return "🌫️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "🌨️";
  if (code <= 82) return "🌦️";
  return "⛈️";
}

function frameTime(frame?: RadarFrame) {
  if (!frame) return "--:--";
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(frame.time * 1000);
}

export default function AtlasConcept() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<import("maplibre-gl").Marker | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [place, setPlace] = useState(DEFAULT_PLACE);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [frames, setFrames] = useState<RadarFrame[]>([]);
  const [radarHost, setRadarHost] = useState("");
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [radarVisible, setRadarVisible] = useState(true);
  const [layersOpen, setLayersOpen] = useState(false);
  const [weather, setWeather] = useState<WeatherState | null>(null);
  const activeFrame = frames[frameIndex];

  const loadWeather = useCallback(async (nextPlace: Place) => {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(nextPlace.latitude));
    url.searchParams.set("longitude", String(nextPlace.longitude));
    url.searchParams.set("current", "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,precipitation,weather_code");
    url.searchParams.set("hourly", "temperature_2m,precipitation_probability,weather_code");
    url.searchParams.set("forecast_days", "2");
    url.searchParams.set("timezone", "auto");
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("Météo indisponible");
    const data = await response.json();
    const now = Date.now();
    const hourly = (data.hourly?.time ?? []).map((time: string, index: number) => ({
      time,
      temperature: data.hourly.temperature_2m[index],
      precipitation: data.hourly.precipitation_probability[index],
      code: data.hourly.weather_code[index],
    })).filter((item: { time: string }) => new Date(item.time).getTime() >= now - 30 * 60_000).slice(0, 6);
    setWeather({
      temperature: data.current.temperature_2m,
      apparent: data.current.apparent_temperature,
      humidity: data.current.relative_humidity_2m,
      wind: data.current.wind_speed_10m,
      precipitation: data.current.precipitation,
      code: data.current.weather_code,
      hourly,
    });
  }, []);

  useEffect(() => {
    let alive = true;
    async function initMap() {
      if (!mapContainerRef.current || mapRef.current) return;
      const maplibregl = (await import("maplibre-gl")).default;
      if (!alive || !mapContainerRef.current) return;
      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: "/map-styles/weyra-atlas-v2.json",
        center: [2.8, 49.5],
        zoom: 5.7,
        minZoom: 3.5,
        maxZoom: 14,
        pitch: 0,
        bearing: 0,
        dragRotate: false,
        renderWorldCopies: false,
        attributionControl: false,
      });
      map.touchZoomRotate.disableRotation();
      map.on("load", () => {
        if (!alive) return;
        mapRef.current = map;
        setMapReady(true);
      });
    }
    void initMap();
    return () => {
      alive = false;
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    void loadWeather(place).catch(console.error);
  }, [loadWeather, place]);

  useEffect(() => {
    let cancelled = false;
    async function loadRadar() {
      const response = await fetch("https://api.rainviewer.com/public/weather-maps.json", { cache: "no-store" });
      if (!response.ok) throw new Error("Radar indisponible");
      const payload = await response.json() as RainViewerPayload;
      if (cancelled) return;
      const nextFrames = [...(payload.radar?.past ?? []), ...(payload.radar?.nowcast ?? [])].slice(-12);
      setRadarHost(payload.host);
      setFrames(nextFrames);
      setFrameIndex(Math.max(0, nextFrames.length - 1));
    }
    void loadRadar().catch(console.error);
    const refresh = window.setInterval(() => void loadRadar().catch(console.error), 5 * 60_000);
    return () => { cancelled = true; window.clearInterval(refresh); };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !radarHost || !activeFrame) return;
    const sourceId = "weyra-concept-radar";
    const layerId = "weyra-concept-radar-layer";
    const tileUrl = `${radarHost}${activeFrame.path}/512/{z}/{x}/{y}/2/1_1.png`;
    const source = map.getSource(sourceId) as (import("maplibre-gl").RasterTileSource & { setTiles?: (tiles: string[]) => void }) | undefined;
    if (!source) {
      map.addSource(sourceId, { type: "raster", tiles: [tileUrl], tileSize: 512, maxzoom: 7, attribution: "Radar © RainViewer" });
      const firstLabel = map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;
      map.addLayer({
        id: layerId,
        type: "raster",
        source: sourceId,
        paint: {
          "raster-opacity": radarVisible ? 0.68 : 0,
          "raster-opacity-transition": { duration: 240, delay: 0 },
          "raster-fade-duration": 180,
          "raster-resampling": "linear",
          "raster-contrast": 0.08,
          "raster-saturation": 0.16,
        },
      }, firstLabel);
    } else {
      source.setTiles?.([tileUrl]);
      if (map.getLayer(layerId)) map.setPaintProperty(layerId, "raster-opacity", radarVisible ? 0.68 : 0);
    }
  }, [activeFrame, mapReady, radarHost, radarVisible]);

  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const timer = window.setInterval(() => setFrameIndex((current) => (current + 1) % frames.length), 650);
    return () => window.clearInterval(timer);
  }, [frames.length, playing]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.flyTo({ center: [place.longitude, place.latitude], zoom: Math.max(7.4, map.getZoom()), duration: 900, essential: true });
  }, [mapReady, place]);

  const forecast = useMemo(() => weather?.hourly ?? [], [weather]);

  async function searchPlace(event: FormEvent) {
    event.preventDefault();
    const term = query.trim();
    if (!term) return;
    setSearching(true);
    try {
      const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(term)}&count=1&language=fr&format=json`, { cache: "no-store" });
      const data = await response.json();
      const result = data.results?.[0];
      if (result) {
        setPlace({ name: result.name, country: result.country, latitude: result.latitude, longitude: result.longitude });
        setQuery("");
      }
    } finally {
      setSearching(false);
    }
  }

  async function locateMe() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      setPlace({ name: "Autour de moi", country: "", latitude: coords.latitude, longitude: coords.longitude });
      const maplibregl = (await import("maplibre-gl")).default;
      markerRef.current?.remove();
      if (mapRef.current) markerRef.current = new maplibregl.Marker({ color: "#7768ff" }).setLngLat([coords.longitude, coords.latitude]).addTo(mapRef.current);
    });
  }

  return (
    <main className={styles.app}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}><span>weyra</span><i /></div>
        <nav className={styles.navigation} aria-label="Navigation principale">
          {NAV.map((item) => <button key={item.label} className={item.active ? styles.navActive : styles.navItem}><Icon name={item.icon} /><span>{item.label}</span></button>)}
        </nav>
        <div className={styles.sidebarFooter}>
          <div className={styles.nightBadge}><span>◐</span><div><strong>21:42</strong><small>{place.name}</small></div></div>
          <div className={styles.userMini}><div className={styles.avatar}>M</div><div><strong>Maxime</strong><small>En ligne</small></div><button aria-label="Ouvrir le profil"><Icon name="chevron" size={17} /></button></div>
        </div>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div><p>Atlas météo en direct</p><h1>{place.name}</h1></div>
          <form className={styles.search} onSubmit={searchPlace}>
            <Icon name="search" size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une ville…" aria-label="Rechercher une ville" /><button type="submit">{searching ? "…" : "Aller"}</button>
          </form>
          <div className={styles.topActions}><button aria-label="Notifications"><Icon name="bell" /></button><button className={styles.profileButton} aria-label="Profil">M<span /></button></div>
        </header>

        <div className={styles.mapStage}>
          <div ref={mapContainerRef} className={styles.map} />
          <div className={styles.mapShade} aria-hidden="true" />

          <div className={styles.liveCard}>
            <div className={styles.liveIcon}>{weather ? weatherGlyph(weather.code) : "…"}</div>
            <div><span className={styles.liveDot}>EN DIRECT</span><strong>{weather ? weatherLabel(weather.code) : "Chargement météo"}</strong><small>{weather ? `${Math.round(weather.temperature)}° · ressenti ${Math.round(weather.apparent)}°` : "Données Open-Meteo"}</small></div>
            <Icon name="chevron" size={18} />
          </div>

          <div className={styles.mapTools}>
            <button className={radarVisible ? styles.toolActive : ""} onClick={() => setRadarVisible((value) => !value)} aria-label="Afficher ou masquer le radar"><Icon name="radar" /></button>
            <button className={layersOpen ? styles.toolActive : ""} onClick={() => setLayersOpen((value) => !value)} aria-label="Ouvrir les couches"><Icon name="layers" /></button>
            <button onClick={locateMe} aria-label="Me localiser"><Icon name="locate" /></button>
            <span />
            <button onClick={() => mapRef.current?.zoomIn({ duration: 260 })} aria-label="Zoomer"><Icon name="plus" /></button>
            <button onClick={() => mapRef.current?.zoomOut({ duration: 260 })} aria-label="Dézoomer"><Icon name="minus" /></button>
          </div>

          {layersOpen && <div className={styles.layersPanel}><div><strong>Couches de la carte</strong><button onClick={() => setLayersOpen(false)}>×</button></div><label><input type="checkbox" checked={radarVisible} onChange={() => setRadarVisible((value) => !value)} /><span className={styles.layerSwatchRadar} />Radar de précipitations</label><label><input type="checkbox" defaultChecked /><span className={styles.layerSwatchPlaces} />Villes et frontières</label><label><input type="checkbox" defaultChecked /><span className={styles.layerSwatchReports} />Observations locales</label><small>Les données radar proviennent réellement de RainViewer.</small></div>}

          <div className={styles.timeline}>
            <button className={styles.playButton} onClick={() => setPlaying((value) => !value)} aria-label={playing ? "Mettre en pause" : "Lire l’animation"}><Icon name={playing ? "pause" : "play"} size={18} /></button>
            <div className={styles.timelineBody}><div className={styles.timelineLabels}><strong>{frameTime(activeFrame)}</strong><span>{frames.length ? `${frameIndex + 1}/${frames.length}` : "Radar en chargement"}</span></div><input type="range" min={0} max={Math.max(0, frames.length - 1)} value={Math.min(frameIndex, Math.max(0, frames.length - 1))} onChange={(event) => { setPlaying(false); setFrameIndex(Number(event.target.value)); }} disabled={!frames.length} /></div>
            <span className={styles.nowPill}>Maintenant</span>
          </div>
        </div>

        <div className={styles.weatherGrid}>
          <article className={styles.weatherNow}>
            <div className={styles.cardHeader}><span>Météo actuelle</span><small>mise à jour live</small></div>
            <div className={styles.currentMain}><span>{weather ? weatherGlyph(weather.code) : "…"}</span><strong>{weather ? Math.round(weather.temperature) : "--"}°</strong><div><b>{weather ? weatherLabel(weather.code) : "Chargement"}</b><small>Ressenti {weather ? Math.round(weather.apparent) : "--"}°</small></div></div>
            <div className={styles.metrics}><span>Vent <b>{weather ? Math.round(weather.wind) : "--"} km/h</b></span><span>Humidité <b>{weather ? weather.humidity : "--"}%</b></span><span>Pluie <b>{weather ? weather.precipitation : "--"} mm</b></span></div>
          </article>

          <article className={styles.forecastCard}>
            <div className={styles.cardHeader}><span>Prochaines heures</span><small>Open-Meteo</small></div>
            <div className={styles.forecastRow}>{forecast.map((item) => <div key={item.time}><small>{new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.time))}</small><span>{weatherGlyph(item.code)}</span><strong>{Math.round(item.temperature)}°</strong><em>{item.precipitation}%</em></div>)}</div>
          </article>

          <article className={styles.observationCard}>
            <div className={styles.cardHeader}><span>Autour de toi</span><small>communauté</small></div>
            <div className={styles.observationList}><div><i className={styles.rainEvent}>💧</i><span><b>Pluie modérée</b><small>à 5 km · il y a 10 min</small></span></div><div><i className={styles.windEvent}>≋</i><span><b>Vent fort</b><small>à 12 km · il y a 25 min</small></span></div><div><i className={styles.stormEvent}>⚡</i><span><b>Orage signalé</b><small>à 18 km · il y a 40 min</small></span></div></div>
          </article>
        </div>
      </section>

      <aside className={styles.socialPanel}>
        <section className={styles.communityStrip}><div className={styles.panelTitle}><div><small>COMMUNAUTÉS</small><strong>Près de toi</strong></div><button><Icon name="plus" size={18} /></button></div><div className={styles.communityAvatars}><button><i className={styles.addCommunity}>+</i><span>Ajouter</span></button><button><i className={styles.parisCommunity}>P</i><span>Météo Paris</span></button><button><i className={styles.stormCommunity}>⚡</i><span>Orages FR</span></button><button><i className={styles.skyCommunity}>☁</i><span>Passion ciel</span></button></div></section>

        <section className={styles.feed}>
          <div className={styles.feedHeader}><div><small>FIL LOCAL</small><strong>Ce qui se passe maintenant</strong></div><button>•••</button></div>
          <article className={styles.post}><header><div className={`${styles.postAvatar} ${styles.emma}`}>E</div><div><strong>Emma</strong><small>Orages FR · il y a 15 min</small></div><button>•••</button></header><p>Une cellule orageuse arrive par l’ouest. Le ciel devient vraiment électrique.</p><div className={styles.postVisualStorm}><span>⚡</span><small>Observation à Tourcoing</small></div><footer><button><Icon name="heart" size={18} />24</button><button><Icon name="comment" size={18} />8</button><button aria-label="Enregistrer"><Icon name="bookmark" size={18} /></button></footer></article>
          <article className={styles.post}><header><div className={`${styles.postAvatar} ${styles.lucas}`}>L</div><div><strong>Lucas</strong><small>Passion ciel · il y a 1 h</small></div><button>•••</button></header><p>Magnifique trouée lumineuse après l’averse.</p><div className={styles.postVisualSunset}><span>Le calme après la pluie</span></div><footer><button><Icon name="heart" size={18} />32</button><button><Icon name="comment" size={18} />6</button><button aria-label="Enregistrer"><Icon name="bookmark" size={18} /></button></footer></article>
        </section>

        <section className={styles.shareCard}><div><small>PARTAGER</small><strong>Qu’est-ce que tu vois ?</strong><p>Aide les personnes autour de toi avec une observation rapide.</p></div><button><Icon name="plus" size={18} />Nouvelle observation</button></section>
      </aside>

      <nav className={styles.mobileNav}>{NAV.slice(0, 5).map((item) => <button key={item.label} className={item.active ? styles.mobileActive : ""}><Icon name={item.icon} size={20} /><span>{item.label}</span></button>)}</nav>
    </main>
  );
}
