"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import styles from "./atlas-concept.module.css";

type RadarFrame = { time: number; path: string };
type RainViewerPayload = {
  host: string;
  radar?: { past?: RadarFrame[]; nowcast?: RadarFrame[] };
};
type Place = { name: string; country: string; latitude: number; longitude: number };
type WeatherState = {
  temperature: number;
  apparent: number;
  humidity: number;
  wind: number;
  precipitation: number;
  code: number;
  hourly: Array<{ time: string; temperature: number; precipitation: number; code: number }>;
};
type MutableRasterSource = { setTiles?: (tiles: string[]) => void };
type IconName =
  | "home" | "atlas" | "users" | "message" | "user" | "search" | "bell"
  | "layers" | "locate" | "plus" | "minus" | "play" | "pause" | "radar"
  | "close" | "chevron" | "report" | "wind" | "droplet";

const DEFAULT_PLACE: Place = {
  name: "Lille",
  country: "France",
  latitude: 50.6292,
  longitude: 3.0573,
};

const NAV: Array<{ label: string; icon: IconName; active?: boolean }> = [
  { label: "Accueil", icon: "home" },
  { label: "Atlas", icon: "atlas", active: true },
  { label: "Communautés", icon: "users" },
  { label: "Messages", icon: "message" },
  { label: "Profil", icon: "user" },
];

const BASE_MAP_STYLE = {
  version: 8 as const,
  sources: {
    "weyra-base": {
      type: "raster" as const,
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      maxzoom: 20,
      attribution: "© OpenStreetMap contributors © CARTO",
    },
  },
  layers: [
    {
      id: "weyra-base",
      type: "raster" as const,
      source: "weyra-base",
      minzoom: 0,
      maxzoom: 20,
      paint: {
        "raster-brightness-min": 0.05,
        "raster-brightness-max": 0.82,
        "raster-contrast": 0.16,
        "raster-saturation": -0.18,
      },
    },
  ],
};

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  const paths: Record<IconName, React.ReactNode> = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9" /><path d="M9 20v-6h6v6" /></>,
    atlas: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    message: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" /><path d="M8 9h8M8 13h5" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    layers: <><path d="m12 2 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 17l9 5 9-5" /></>,
    locate: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    minus: <path d="M5 12h14" />,
    play: <path d="m8 5 11 7-11 7Z" />,
    pause: <><path d="M9 5v14M15 5v14" /></>,
    radar: <><circle cx="12" cy="12" r="9" /><path d="M12 12 18 6M12 7a5 5 0 0 1 5 5M12 4a8 8 0 0 1 8 8" /><circle cx="12" cy="12" r="1" fill="currentColor" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    report: <><path d="M12 22s7-4 7-11V5l-7-3-7 3v6c0 7 7 11 7 11Z" /><path d="M12 8v4M12 16h.01" /></>,
    wind: <><path d="M3 8h10a3 3 0 1 0-3-3" /><path d="M3 12h15a3 3 0 1 1-3 3" /><path d="M3 16h7" /></>,
    droplet: <path d="M12 2s6 6.1 6 12a6 6 0 0 1-12 0c0-5.9 6-12 6-12Z" />,
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
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" })
    .format(new Date(frame.time * 1000));
}

export default function AtlasConcept() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<import("maplibre-gl").Marker | null>(null);

  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [place, setPlace] = useState(DEFAULT_PLACE);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [weather, setWeather] = useState<WeatherState | null>(null);
  const [frames, setFrames] = useState<RadarFrame[]>([]);
  const [radarHost, setRadarHost] = useState("");
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [radarVisible, setRadarVisible] = useState(true);
  const [layersOpen, setLayersOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const activeFrame = frames[frameIndex];
  const forecast = useMemo(() => weather?.hourly ?? [], [weather]);

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
    const hourly = (data.hourly?.time ?? [])
      .map((time: string, index: number) => ({
        time,
        temperature: data.hourly.temperature_2m[index],
        precipitation: data.hourly.precipitation_probability[index],
        code: data.hourly.weather_code[index],
      }))
      .filter((item: { time: string }) => new Date(item.time).getTime() >= now - 30 * 60_000)
      .slice(0, 6);

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
    async function createMap() {
      if (!mapContainerRef.current || mapRef.current) return;
      try {
        const maplibregl = (await import("maplibre-gl")).default;
        if (!alive || !mapContainerRef.current) return;
        const map = new maplibregl.Map({
          container: mapContainerRef.current,
          style: BASE_MAP_STYLE,
          center: [2.8, 49.4],
          zoom: 5.55,
          minZoom: 3,
          maxZoom: 15,
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
          window.setTimeout(() => map.resize(), 60);
        });
        map.on("error", (event) => {
          console.warn("Atlas map error", event.error);
          if (!map.loaded()) setMapFailed(true);
        });
      } catch (error) {
        console.error(error);
        setMapFailed(true);
      }
    }
    void createMap();
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
    return () => {
      cancelled = true;
      window.clearInterval(refresh);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !radarHost || !activeFrame) return;
    const sourceId = "weyra-concept-radar";
    const layerId = "weyra-concept-radar-layer";
    const tileUrl = `${radarHost}${activeFrame.path}/256/{z}/{x}/{y}/2/1_1.png`;
    const source = map.getSource(sourceId) as MutableRasterSource | undefined;

    if (!source) {
      map.addSource(sourceId, {
        type: "raster",
        tiles: [tileUrl],
        tileSize: 256,
        maxzoom: 7,
        attribution: "Radar © RainViewer",
      });
      map.addLayer({
        id: layerId,
        type: "raster",
        source: sourceId,
        paint: {
          "raster-opacity": radarVisible ? 0.72 : 0,
          "raster-opacity-transition": { duration: 220, delay: 0 },
          "raster-fade-duration": 160,
          "raster-resampling": "linear",
          "raster-contrast": 0.14,
          "raster-saturation": 0.2,
        },
      });
    } else {
      source.setTiles?.([tileUrl]);
      if (map.getLayer(layerId)) {
        map.setPaintProperty(layerId, "raster-opacity", radarVisible ? 0.72 : 0);
      }
    }
  }, [activeFrame, mapReady, radarHost, radarVisible]);

  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const timer = window.setInterval(
      () => setFrameIndex((current) => (current + 1) % frames.length),
      720,
    );
    return () => window.clearInterval(timer);
  }, [frames.length, playing]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.flyTo({
      center: [place.longitude, place.latitude],
      zoom: Math.max(7.2, map.getZoom()),
      duration: 900,
      essential: true,
    });
  }, [mapReady, place]);

  async function searchPlace(event: FormEvent) {
    event.preventDefault();
    const term = query.trim();
    if (!term) return;
    setSearching(true);
    try {
      const response = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(term)}&count=1&language=fr&format=json`,
        { cache: "no-store" },
      );
      const data = await response.json();
      const result = data.results?.[0];
      if (result) {
        setPlace({
          name: result.name,
          country: result.country,
          latitude: result.latitude,
          longitude: result.longitude,
        });
        setQuery("");
      }
    } finally {
      setSearching(false);
    }
  }

  async function locateMe() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      setPlace({
        name: "Autour de moi",
        country: "",
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
      const maplibregl = (await import("maplibre-gl")).default;
      markerRef.current?.remove();
      if (mapRef.current) {
        markerRef.current = new maplibregl.Marker({ color: "#75ddff" })
          .setLngLat([coords.longitude, coords.latitude])
          .addTo(mapRef.current);
      }
    });
  }

  return (
    <main className={styles.atlas}>
      <div ref={mapContainerRef} className={styles.map} />
      <div className={styles.mapTone} aria-hidden="true" />
      <div className={styles.mapVignette} aria-hidden="true" />

      {mapFailed && (
        <div className={styles.mapError}>
          <strong>La carte n’a pas pu charger.</strong>
          <span>Vérifie la connexion puis recharge cette page.</span>
        </div>
      )}

      <aside className={styles.rail}>
        <button className={styles.brand} aria-label="Weyra">
          <span>W</span>
          <i />
        </button>
        <nav aria-label="Navigation principale">
          {NAV.map((item) => (
            <button
              key={item.label}
              className={item.active ? styles.navActive : styles.navItem}
              aria-label={item.label}
              title={item.label}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <button className={styles.avatar} aria-label="Profil Maxime">M</button>
      </aside>

      <header className={styles.topbar}>
        <div className={styles.placeTitle}>
          <span><i /> RADAR EN DIRECT</span>
          <strong>{place.name}</strong>
          <small>{place.country || "Position actuelle"}</small>
        </div>

        <form className={styles.search} onSubmit={searchPlace}>
          <Icon name="search" size={19} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher une ville…"
            aria-label="Rechercher une ville"
          />
          <button type="submit">{searching ? "…" : "Aller"}</button>
        </form>

        <div className={styles.topActions}>
          <button aria-label="Notifications"><Icon name="bell" /></button>
          <button className={styles.weatherPill} onClick={() => setDetailsOpen(true)}>
            <span>{weather ? weatherGlyph(weather.code) : "…"}</span>
            <strong>{weather ? Math.round(weather.temperature) : "--"}°</strong>
            <small>{weather ? weatherLabel(weather.code) : "Météo"}</small>
            <Icon name="chevron" size={16} />
          </button>
        </div>
      </header>

      <section className={styles.nowCard}>
        <div className={styles.nowHeader}>
          <span>Maintenant</span>
          <i className={radarVisible ? styles.statusLive : styles.statusOff}>
            {radarVisible ? "Radar actif" : "Radar masqué"}
          </i>
        </div>
        <div className={styles.nowMain}>
          <span>{weather ? weatherGlyph(weather.code) : "…"}</span>
          <div>
            <strong>{weather ? Math.round(weather.temperature) : "--"}°</strong>
            <small>Ressenti {weather ? Math.round(weather.apparent) : "--"}°</small>
          </div>
        </div>
        <p>{weather ? weatherLabel(weather.code) : "Chargement des conditions locales"}</p>
        <div className={styles.nowMetrics}>
          <span><Icon name="wind" size={16} /><b>{weather ? Math.round(weather.wind) : "--"}</b> km/h</span>
          <span><Icon name="droplet" size={16} /><b>{weather ? weather.humidity : "--"}</b>%</span>
        </div>
        <button onClick={() => setDetailsOpen(true)}>
          Voir les prévisions <Icon name="chevron" size={16} />
        </button>
      </section>

      <div className={styles.mapTools}>
        <button
          className={radarVisible ? styles.toolActive : ""}
          onClick={() => setRadarVisible((value) => !value)}
          aria-label="Afficher ou masquer le radar"
          title="Radar"
        >
          <Icon name="radar" />
        </button>
        <button
          className={layersOpen ? styles.toolActive : ""}
          onClick={() => setLayersOpen((value) => !value)}
          aria-label="Couches"
          title="Couches"
        >
          <Icon name="layers" />
        </button>
        <button onClick={locateMe} aria-label="Me localiser" title="Me localiser">
          <Icon name="locate" />
        </button>
        <span />
        <button onClick={() => mapRef.current?.zoomIn({ duration: 220 })} aria-label="Zoomer">
          <Icon name="plus" />
        </button>
        <button onClick={() => mapRef.current?.zoomOut({ duration: 220 })} aria-label="Dézoomer">
          <Icon name="minus" />
        </button>
      </div>

      {layersOpen && (
        <section className={styles.layersPanel}>
          <header>
            <div><small>CARTE</small><strong>Couches visibles</strong></div>
            <button onClick={() => setLayersOpen(false)} aria-label="Fermer"><Icon name="close" /></button>
          </header>
          <label>
            <input type="checkbox" checked={radarVisible} onChange={() => setRadarVisible((value) => !value)} />
            <i className={styles.radarSwatch} />
            <span><b>Précipitations</b><small>Radar réel RainViewer</small></span>
          </label>
          <label>
            <input type="checkbox" defaultChecked />
            <i className={styles.mapSwatch} />
            <span><b>Fond de carte</b><small>Villes, routes et frontières</small></span>
          </label>
          <label>
            <input type="checkbox" defaultChecked />
            <i className={styles.reportSwatch} />
            <span><b>Observations</b><small>Signalements communautaires</small></span>
          </label>
        </section>
      )}

      <button className={styles.reportButton}>
        <Icon name="report" size={20} />
        <span>Signaler un phénomène</span>
      </button>

      <section className={styles.timeline}>
        <button
          className={styles.playButton}
          onClick={() => setPlaying((value) => !value)}
          aria-label={playing ? "Mettre en pause" : "Lire l’animation"}
        >
          <Icon name={playing ? "pause" : "play"} size={18} />
        </button>
        <div className={styles.timelineContent}>
          <div>
            <span>{frameTime(frames[0])}</span>
            <strong>{frameTime(activeFrame)}</strong>
            <span>{frameTime(frames[frames.length - 1])}</span>
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(0, frames.length - 1)}
            value={Math.min(frameIndex, Math.max(0, frames.length - 1))}
            onChange={(event) => {
              setPlaying(false);
              setFrameIndex(Number(event.target.value));
            }}
            disabled={!frames.length}
          />
        </div>
        <span className={styles.liveBadge}><i /> LIVE</span>
      </section>

      {detailsOpen && (
        <div className={styles.sheetBackdrop} onMouseDown={() => setDetailsOpen(false)}>
          <section className={styles.detailsSheet} onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div><small>MÉTÉO LOCALE</small><strong>{place.name}</strong></div>
              <button onClick={() => setDetailsOpen(false)} aria-label="Fermer"><Icon name="close" /></button>
            </header>
            <div className={styles.sheetCurrent}>
              <span>{weather ? weatherGlyph(weather.code) : "…"}</span>
              <div><strong>{weather ? Math.round(weather.temperature) : "--"}°</strong><small>{weather ? weatherLabel(weather.code) : "Chargement"}</small></div>
              <p>Ressenti {weather ? Math.round(weather.apparent) : "--"}°</p>
            </div>
            <div className={styles.sheetMetrics}>
              <span><Icon name="wind" /><small>Vent</small><strong>{weather ? Math.round(weather.wind) : "--"} km/h</strong></span>
              <span><Icon name="droplet" /><small>Humidité</small><strong>{weather ? weather.humidity : "--"}%</strong></span>
              <span><Icon name="radar" /><small>Pluie</small><strong>{weather ? weather.precipitation : "--"} mm</strong></span>
            </div>
            <div className={styles.forecast}>
              {forecast.map((item) => (
                <div key={item.time}>
                  <small>{new Intl.DateTimeFormat("fr-FR", { hour: "2-digit" }).format(new Date(item.time))}</small>
                  <span>{weatherGlyph(item.code)}</span>
                  <strong>{Math.round(item.temperature)}°</strong>
                  <em>{item.precipitation}%</em>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      <nav className={styles.mobileNav}>
        {NAV.map((item) => (
          <button key={item.label} className={item.active ? styles.mobileActive : ""}>
            <Icon name={item.icon} size={19} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}
