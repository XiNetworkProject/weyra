"use client";
import { useEffect, useRef, useState, useReducer } from "react";
import {
  CloudRain,
  MapPin,
  Layers,
  Minus,
  Plus,
  LocateFixed,
  Play,
  Pause,
  RotateCcw,
  Info,
  Eye,
  ChevronDown,
  Cloud,
  Sun,
  Wind,
  Navigation,
  ArrowUpRight,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  X,
  CloudLightning,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { createAtlasPresentation } from "@/lib/atlas-presentation";
import { createAtlas, type AtlasEngine } from "@/lib/atlas-engine";
import { radarFramesFromPacks, radarTimelineReducer } from "@/lib/horizon-radar";
import {
  radarFramesFromLayer,
  radarProductInfo,
  type RadarProduct,
  type RadarLayerCatalog,
  type RadarLayerState,
} from "@/lib/radar-layers";
import { weatherCodeInfo } from "@/lib/weather";
import type { OperaScanPackListResponse } from "@/lib/types";
import type { Observation } from "@/lib/content";
export type Place = {
  name: string;
  latitude: number;
  longitude: number;
  id?: number;
  country?: string;
  admin1?: string;
};
const clock = (t: number) =>
  new Date(t * 1000).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
export const weatherLabel = (code: number) => weatherCodeInfo(code).label;
type Forecast = {
  current: {
    temperature_2m: number;
    precipitation: number;
    weather_code: number;
    wind_speed_10m: number;
    time: string;
  };
  hourly?: { time: string[]; temperature_2m: number[]; weather_code: number[] };
};
async function publicData(local: string, upstream: string, signal?: AbortSignal): Promise<Forecast> {
  for (const url of [upstream, local]) {
    try {
      const r = await fetch(url, {
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),
      });
      if (r.ok) return await r.json();
    } catch (e) {
      if (signal?.aborted) throw e;
    }
  }
  throw new Error("Données indisponibles");
}
export default function Atlas({
  place,
  items,
  onSelect,
  onPlace,
  onSources,
  onImmersion,
  active,
}: {
  place: Place;
  items: Observation[];
  onSelect: (o: Observation) => void;
  onPlace: (p: Place) => void;
  onPublish: () => void;
  onSources: () => void;
  onImmersion: (index?: number) => void;
  active: boolean;
}) {
  const host = useRef<HTMLDivElement>(null),
    engine = useRef<AtlasEngine | null>(null),
    choose = useRef(onSelect);
  useEffect(() => {
    choose.current = onSelect;
  }, [onSelect]);
  const [renderer, setRenderer] = useState<"vector" | "raster">("raster");
  const [loaded, setLoaded] = useState(false),
    [mapError, setMapError] = useState(false),
    [tileError, setTileError] = useState(false),
    [retry, setRetry] = useState(0);
  const [weather, setWeather] = useState<Forecast | null>(null),
    [weatherError, setWeatherError] = useState(false),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1),
    [loop, setLoop] = useState(true),
    [radar, setRadar] = useState(true),
    [showObservations, setShowObservations] = useState(true),
    [showDemo, setShowDemo] = useState(true),
    [layers, setLayers] = useState(false),
    [radarError, setRadarError] = useState(false),
    [opacity, setOpacity] = useState(65),
    [weatherExpanded, setWeatherExpanded] = useState(false),
    [filter, setFilter] = useState("Tout"),
    [spotlight, setSpotlight] = useState(0);
  const [compact, setCompact] = useState(false);
  const [product, setProduct] = useState<RadarProduct>("precipitation");
  const productRef = useRef<RadarProduct>("precipitation");
  const [layerState, setLayerState] = useState<RadarLayerState | null>(null);
  const productInfo = radarProductInfo(product);
  const accumulation = product.startsWith("accumulation");
  const [presentation] = useState(() => createAtlasPresentation(setCompact));
  useEffect(() => {
    presentation.activate(active);
    if (!active) setPlaying(false);
  }, [active, presentation]);
  useEffect(() => {
    presentation.playback(playing);
  }, [playing, presentation]);
  useEffect(() => {
    const release = (event: PointerEvent) => presentation.pointerUp(event.pointerId);
    const blur = () => presentation.releasePointers();
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", blur);
      presentation.destroy();
    };
  }, [presentation, active]);
  const isExploration = (target: EventTarget) =>
    target instanceof Element &&
    !!target.closest(".map-canvas, .radar-timeline, .map-tools-bottom, .atlas-right-controls");
  const [timeline, dispatchTimeline] = useReducer(radarTimelineReducer, { frames: [], index: 0 });
  const { frames, index: frame } = timeline;
  const setFrame = (index: number) => dispatchTimeline({ type: "select", index });
  const [radarPending, setRadarPending] = useState(true),
    [checkedAt, setCheckedAt] = useState(0);
  const shownFrame = frames[frame];
  const provider = shownFrame?.provider || (accumulation ? "Météo-France" : "Météo-France / OPERA");
  const accumulationMinutes = product === "accumulation-1h" ? 60 : 180;
  const incomplete = accumulation && layerState && layerState.receivedSamples < (layerState.expectedSamples ?? 1);
  const layerNotice = accumulation
    ? incomplete
      ? `Historique incomplet : ${layerState.receivedSamples * 5} min reçues sur ${accumulationMinutes / 60} h.${frames.length ? " Dernier cumul complet affiché." : ""}`
      : "France métropolitaine · zones sans mesure complète transparentes."
    : product === "reflectivity"
      ? "Échos radar bruts : les échos faibles ne correspondent pas tous à de la pluie au sol."
      : "";
  function selectProduct(next: RadarProduct) {
    if (next === productRef.current) return;
    productRef.current = next;
    engine.current?.radarFrame(null, 0, false);
    engine.current?.radarFrames([]);
    dispatchTimeline({ type: "load", frames: [] });
    setPlaying(false);
    setLayerState(null);
    setRadarError(false);
    setRadarPending(true);
    setRadar(true);
    setProduct(next);
    presentation.interact();
  }
  const age = frames.length ? Math.max(0, Math.round((checkedAt / 1000 - frames[frames.length - 1].time) / 60)) : 0;
  const visibleItems = items.filter((o) => (showDemo || !o.demo) && (filter === "Tout" || o.phenomenon === filter));
  const featured = items[spotlight % Math.max(items.length, 1)];
  useEffect(() => {
    if (!host.current) return;
    const controller = new AbortController();
    let observer: ResizeObserver | undefined;
    setLoaded(false);
    setMapError(false);
    setTileError(false);
    createAtlas(
      host.current,
      controller.signal,
      () => setTileError(true),
      () => setRadarError(true),
    )
      .then((map) => {
        if (controller.signal.aborted) {
          map.destroy();
          return;
        }
        engine.current = map;
        setRenderer(map.kind);
        setLoaded(true);
        observer = new ResizeObserver(() => map.resize());
        observer.observe(host.current!);
        map.resize();
      })
      .catch(() => {
        if (!controller.signal.aborted) setMapError(true);
      });
    return () => {
      controller.abort();
      observer?.disconnect();
      engine.current?.destroy();
      engine.current = null;
    };
  }, [retry]);
  useEffect(() => {
    const abort = new AbortController();
    setWeather(null);
    setWeatherError(false);
    const params = `latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,weather_code&forecast_days=2&timezone=Europe%2FParis`;
    publicData(
      `/api/weather?lat=${place.latitude}&lon=${place.longitude}`,
      "https://api.open-meteo.com/v1/forecast?" + params,
      abort.signal,
    )
      .then(setWeather)
      .catch(() => {
        if (!abort.signal.aborted) setWeatherError(true);
      });
    return () => abort.abort();
  }, [place]);
  const lastPlace = useRef("");
  useEffect(() => {
    if (!loaded || !engine.current) return;
    const key = place.latitude + "," + place.longitude;
    if (lastPlace.current && lastPlace.current !== key) engine.current.fly(place.longitude, place.latitude, 9);
    lastPlace.current = key;
  }, [place, loaded]);
  useEffect(() => {
    if (active && loaded) {
      const timer = setTimeout(() => engine.current?.resize(), 80);
      return () => clearTimeout(timer);
    }
  }, [active, loaded]);
  useEffect(() => {
    const m = engine.current;
    if (!loaded || !m) return;
    let pins: { remove: () => void }[] = [];
    const draw = () => {
      pins.forEach((p) => p.remove());
      pins = [];
      if (!showObservations) return;
      const groups: { point: { x: number; y: number }; items: Observation[] }[] = [];
      items
        .filter((o) => (showDemo || !o.demo) && (filter === "Tout" || o.phenomenon === filter))
        .forEach((o) => {
          const point = m.project(o.lon, o.lat);
          const group = groups.find((g) => Math.hypot(g.point.x - point.x, g.point.y - point.y) < 72);
          if (group) group.items.push(o);
          else groups.push({ point, items: [o] });
        });
      for (const group of groups) {
        const o = group.items[0];
        const outer = document.createElement("div");
        outer.className = "pin-anchor";
        const el = document.createElement("button");
        el.type = "button";
        el.className = "observation-pin " + (o.phenomenon === "Orage" ? "storm-pin" : "");
        el.setAttribute(
          "aria-label",
          group.items.length > 1
            ? `${group.items.length} observations près de ${o.place}`
            : `${o.title} · ${o.place}${o.demo ? " · démonstration" : ""}`,
        );
        const img = document.createElement("img");
        img.src = o.image || "/images/clouds.jpg";
        img.alt = "";
        el.appendChild(img);
        const name = document.createElement("span");
        name.className = "pin-place";
        name.textContent = o.place;
        el.appendChild(name);
        const label = document.createElement("span");
        label.className = "pin-label";
        label.textContent = group.items.length > 1 ? "+" + group.items.length : o.demo ? "EXEMPLE" : "OBSERVER";
        el.appendChild(label);
        el.onclick = () => {
          if (group.items.length > 1 && m.getZoom() < 13) m.fly(o.lon, o.lat, m.getZoom() + 1.5);
          else choose.current(o);
        };
        outer.appendChild(el);
        pins.push(m.pin(outer, o.lon, o.lat));
      }
    };
    draw();
    const off = m.onMove(draw);
    return () => {
      off();
      pins.forEach((p) => p.remove());
    };
  }, [items, loaded, showObservations, showDemo, filter]);
  useEffect(() => {
    if (!loaded) return;
    const abort = new AbortController();
    const update = async () => {
      try {
        const response = await fetch(product === "precipitation" ? "/api/radar/opera/packs" : "/api/radar/layers", {
          cache: "no-store",
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(10000)]),
        });
        if (!response.ok) throw Error();
        const data: OperaScanPackListResponse | RadarLayerCatalog = await response.json();
        if (abort.signal.aborted || productRef.current !== product || !engine.current) return;
        const next =
          product === "precipitation"
            ? radarFramesFromPacks(data as OperaScanPackListResponse)
            : radarFramesFromLayer(data as RadarLayerCatalog, product);
        const pending =
          product === "precipitation"
            ? !!(data as OperaScanPackListResponse).maintenance?.running
            : !(data as RadarLayerCatalog).errors.length;
        setLayerState(product === "precipitation" ? null : ((data as RadarLayerCatalog).layers[product] ?? null));
        engine.current.radarFrames(next);
        dispatchTimeline({ type: "load", frames: next });
        setCheckedAt(Date.now());
        setRadarPending(!next.length && pending);
        setRadarError(!next.length && !pending);
      } catch {
        if (!abort.signal.aborted && productRef.current === product) {
          setRadarError(true);
          setRadarPending(false);
        }
      }
    };
    // Same development-only maintenance trigger as the original Atlas. Production
    // ingestion remains owned by the existing permanent radar worker.
    if (process.env.NODE_ENV !== "production")
      void fetch("/api/radar/opera/packs/maintenance", { method: "POST", signal: abort.signal }).catch(() => {});
    void update();
    const timer = setInterval(update, 15000);
    return () => {
      abort.abort();
      clearInterval(timer);
    };
  }, [loaded, product]);
  useEffect(() => {
    engine.current?.radarFrame(radar ? (frames[frame]?.time ?? null) : null, opacity / 100, playing);
  }, [frames, frame, radar, opacity, playing]);
  useEffect(() => {
    if (!playing || !frames.length || !active) return;
    const timer = setTimeout(() => {
      if (frame >= frames.length - 1) {
        if (loop) dispatchTimeline({ type: "select", index: 0 });
        else setPlaying(false);
      } else dispatchTimeline({ type: "select", index: frame + 1 });
    }, 900 / speed);
    return () => clearTimeout(timer);
  }, [playing, frames.length, frame, speed, loop, active]);
  const current = weather?.current;
  const nextHours =
    weather?.hourly?.time
      ?.map((t: string, i: number) => ({
        time: t,
        temp: weather.hourly!.temperature_2m[i],
        code: weather.hourly!.weather_code?.[i],
      }))
      .filter((h) => h.time >= (current?.time || ""))
      .slice(0, 5) || [];
  function locate() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) =>
        onPlace({
          name: "Ma position",
          latitude: Math.round(p.coords.latitude * 100) / 100,
          longitude: Math.round(p.coords.longitude * 100) / 100,
        }),
      () => {
        import("sonner").then(({ toast }) => toast.error("Position indisponible. Recherchez une ville."));
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }
  return (
    <section
      className={"atlas-scene" + (compact ? " atlas-is-compact" : "")}
      aria-label="Atlas, carte météo interactive"
      onPointerDownCapture={(event) => {
        if (isExploration(event.target)) presentation.pointerDown(event.pointerId);
      }}
      onWheelCapture={(event) => {
        if (isExploration(event.target)) presentation.interact();
      }}
      onKeyDownCapture={(event) => {
        if (
          isExploration(event.target) &&
          ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "+", "-", "=", " ", "Enter", "Home", "End"].includes(
            event.key,
          )
        )
          presentation.interact();
      }}
    >
      <button
        className="atlas-mini glass"
        aria-label="Agrandir les informations météo"
        aria-expanded={!compact}
        aria-hidden={!compact}
        inert={!compact}
        onClick={() => {
          presentation.expand();
          requestAnimationFrame(() =>
            host.current?.parentElement
              ?.querySelector<HTMLButtonElement>(".weather-heading")
              ?.focus({ preventScroll: true }),
          );
        }}
      >
        <Cloud size={23} strokeWidth={1.4} />
        <span>
          <strong>{place.name}</strong>
          <small>{weather?.current ? weatherLabel(weather.current.weather_code) : "Votre horizon"}</small>
        </span>
        <b>{weather?.current ? Math.round(weather.current.temperature_2m) + "°" : "—"}</b>
        <Maximize2 size={15} />
      </button>
      <div className="map-canvas" ref={host} />
      <div className="atlas-vignette" aria-hidden="true" />
      {!loaded && (
        <div className="map-loading">
          <Navigation className={!mapError ? "spin" : ""} />
          <strong>{mapError ? "Ouvrons un autre horizon." : "Votre horizon se dessine."}</strong>
          <span>
            {mapError
              ? "Le fond de carte est indisponible. Vous pouvez réessayer."
              : "Chargement de la carte interactive"}
          </span>
          {mapError && <button onClick={() => setRetry((r) => r + 1)}>Réessayer</button>}
        </div>
      )}
      <div className="atlas-context" inert={compact} aria-hidden={compact}>
        <div className="atlas-kicker">
          <span className="signal-dot" />
          L’ATLAS DES REGARDS
        </div>
        <h1>
          Le ciel.
          <br />
          <em>À portée de vue.</em>
        </h1>
        <div className="atlas-filter">
          {["Tout", "Nuages", "Orage"].map((f) => (
            <button
              aria-pressed={filter === f}
              className={filter === f ? "chosen" : ""}
              key={f}
              onClick={() => setFilter(f)}
            >
              {f === "Tout" ? <Eye size={13} /> : f === "Orage" ? <CloudLightning size={13} /> : <Cloud size={13} />}{" "}
              {f === "Tout" ? "Tous les regards" : f === "Orage" ? "Orages" : f}
            </button>
          ))}
        </div>
      </div>
      <div className={"weather-float " + (weatherExpanded ? "expanded" : "")} inert={compact} aria-hidden={compact}>
        <button
          className="weather-heading"
          aria-expanded={weatherExpanded}
          onClick={() => setWeatherExpanded(!weatherExpanded)}
        >
          <span>
            <MapPin size={14} />
            {place.name}
          </span>
          <ChevronDown size={16} />
        </button>
        <div className="weather-now">
          <div>
            <strong>{current ? Math.round(current.temperature_2m) + "°" : "—"}</strong>
            <span>
              {current ? weatherLabel(current.weather_code) : weatherError ? "Météo indisponible" : "Lecture du ciel…"}
            </span>
          </div>
          {current?.weather_code === 0 ? (
            <Sun className="weather-cloud" size={46} strokeWidth={1} />
          ) : (
            <Cloud className="weather-cloud" size={46} strokeWidth={1} />
          )}
        </div>
        <div className="weather-meta">
          <span>
            <Wind size={13} />
            {current ? Math.round(current.wind_speed_10m) : "—"} km/h
          </span>
          <span>
            <CloudRain size={13} />
            {current ? current.precipitation : "—"} mm
          </span>
        </div>
        {weatherExpanded && (
          <div className="weather-hours">
            {nextHours.map((h) => (
              <div key={h.time}>
                <span>{h.time.slice(11, 16)}</span>
                {h.code === 0 ? <Sun size={18} /> : <Cloud size={18} />}
                <strong>{Math.round(h.temp)}°</strong>
              </div>
            ))}
          </div>
        )}
        <p className="data-source">Open-Meteo · {current ? current.time.slice(11, 16) : "prévisions modélisées"}</p>
      </div>
      <div className="atlas-right-controls">
        <button
          className={"map-tool glass " + (layers ? "selected" : "")}
          onClick={() => setLayers(!layers)}
          aria-label="Afficher les couches"
          aria-expanded={layers}
        >
          <Layers size={18} />
          <span>Couches</span>
        </button>
        <button className="map-tool glass immersion-shortcut" onClick={() => onImmersion(0)}>
          <Maximize2 size={17} />
          <span>Immersion</span>
        </button>
        {layers && (
          <div className="layers-panel glass">
            <div className="layers-title">
              <h3>Composez votre carte</h3>
              <button onClick={() => setLayers(false)} aria-label="Fermer les couches">
                <X size={15} />
              </button>
            </div>
            <div className="radar-product-picker" role="group" aria-label="Type de radar">
              {(["precipitation", "reflectivity", "accumulation-1h"] as const).map((choice) => {
                const info = radarProductInfo(choice);
                const selected = choice === "accumulation-1h" ? accumulation : product === choice;
                return (
                  <button
                    key={choice}
                    className={"radar-product-option " + (selected ? "selected" : "")}
                    aria-pressed={selected}
                    onClick={() => selectProduct(choice)}
                  >
                    <span className={"product-swatch " + choice} aria-hidden="true" />
                    <span>
                      <b>{info.title}</b>
                      <small>{info.description}</small>
                    </span>
                    <span className="product-unit">{choice === "precipitation" ? "LIVE" : info.unit}</span>
                  </button>
                );
              })}
            </div>
            {accumulation && (
              <div className="accumulation-period" role="group" aria-label="Durée du cumul">
                <span>Sur les dernières</span>
                <button aria-pressed={product === "accumulation-1h"} onClick={() => selectProduct("accumulation-1h")}>
                  1 h
                </button>
                <button aria-pressed={product === "accumulation-3h"} onClick={() => selectProduct("accumulation-3h")}>
                  3 h
                </button>
              </div>
            )}
            <label>
              <span>
                <CloudRain size={16} />
                Afficher la couche
              </span>
              <Switch aria-label="Afficher la couche radar" checked={radar} onCheckedChange={setRadar} />
            </label>
            <label>
              <span>
                <Eye size={16} />
                Observations
              </span>
              <Switch checked={showObservations} onCheckedChange={setShowObservations} />
            </label>
            <label>
              <span>Exemples photo</span>
              <Switch checked={showDemo} onCheckedChange={setShowDemo} />
            </label>
            <div className="opacity">
              <span>
                Opacité radar <b>{opacity} %</b>
              </span>
              <Slider
                value={[opacity]}
                min={15}
                max={85}
                onValueChange={(v) => setOpacity(v[0])}
                aria-label="Opacité radar"
              />
            </div>
            <p>{layerNotice || `Scans réels · ${provider}.`}</p>
          </div>
        )}
      </div>
      {featured && (
        <aside className="atlas-moment" inert={compact} aria-hidden={compact}>
          <button className="moment-image" onClick={() => onImmersion(spotlight)}>
            <img src={featured.image || "/images/clouds.jpg"} alt={featured.title} key={featured.id} />
            <span>
              <Maximize2 size={15} /> Entrer dans l’instant
            </span>
          </button>
          <div className="moment-caption">
            <span className="eyebrow">UN REGARD, UN HORIZON</span>
            <button onClick={() => onSelect(featured)}>
              <h2>{featured.title}</h2>
              <ArrowUpRight size={20} />
            </button>
            <div className="moment-footer">
              <span>{featured.demo ? "Photo illustrative" : featured.place}</span>
              <div>
                <button
                  aria-label="Photo précédente"
                  onClick={() => setSpotlight((s) => (s - 1 + items.length) % items.length)}
                >
                  <ChevronLeft size={16} />
                </button>
                <small>
                  {String(spotlight + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
                </small>
                <button aria-label="Photo suivante" onClick={() => setSpotlight((s) => (s + 1) % items.length)}>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </aside>
      )}
      <div className="map-tools-bottom glass">
        <button aria-label="Zoomer" disabled={!loaded} onClick={() => engine.current?.zoom(1)}>
          <Plus size={19} />
        </button>
        <button aria-label="Dézoomer" disabled={!loaded} onClick={() => engine.current?.zoom(-1)}>
          <Minus size={19} />
        </button>
        <span />
        <button aria-label="Centrer sur ma position" onClick={locate}>
          <LocateFixed size={19} />
        </button>
      </div>
      <div className="map-caption">
        <span className="signal-dot" />
        {showObservations ? visibleItems.length : 0} regards à explorer{" "}
        <button onClick={onSources}>
          Photos d’exemple <Info size={11} />
        </button>
        {tileError && <button onClick={() => setRetry((r) => r + 1)}>Actualiser la carte</button>}
      </div>
      <div className="radar-timeline glass">
        <div className="radar-heading">
          <span>
            <RadioGlyph />
            {productInfo.heading}
          </span>
          <button onClick={onSources} aria-live="polite">
            <span className={"radar-status " + (radarError ? "unavailable" : "")} />
            {radarError
              ? "Indisponible"
              : radarPending
                ? accumulation
                  ? "Historique en cours…"
                  : "Préparation…"
                : age > 20
                  ? "Dernier scan : " + age + " min"
                  : "Images passées"}
            <Info size={12} />
          </button>
        </div>
        <div className="timeline-main">
          <button
            className={"play-button " + (playing ? "is-playing" : "")}
            aria-label={playing ? "Mettre en pause" : "Lire les images radar"}
            disabled={frames.length < 2}
            onClick={() => {
              setRadar(true);
              setPlaying(!playing);
            }}
          >
            {playing ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <div className="timeline-track">
            <div className="timeline-labels">
              <span>
                {frames.length
                  ? clock(accumulation ? frames[frame].time - accumulationMinutes * 60 : frames[0].time)
                  : "—"}
              </span>
              <strong>{frames[frame] ? clock(frames[frame].time) : "—"}</strong>
              <span>
                {accumulation
                  ? `${accumulationMinutes / 60} h`
                  : frames.length
                    ? clock(frames[frames.length - 1].time)
                    : "—"}
              </span>
            </div>
            <Slider
              min={0}
              max={Math.max(frames.length - 1, 1)}
              step={1}
              value={[frame]}
              disabled={frames.length < 2}
              onValueChange={(v) => {
                setFrame(v[0]);
                setPlaying(false);
              }}
              aria-label="Heure de la trame radar"
            />
          </div>
          <button
            className="speed-button"
            aria-label="Changer la vitesse du radar"
            onClick={() => setSpeed(speed === 0.5 ? 1 : speed === 1 ? 2 : 0.5)}
          >
            {speed}×
          </button>
          <button
            className={"loop-button " + (loop ? "selected" : "")}
            onClick={() => setLoop(!loop)}
            aria-label="Boucler la lecture"
            aria-pressed={loop}
          >
            <RotateCcw size={15} />
          </button>
        </div>
        <div className="timeline-foot">
          {product === "precipitation" ? (
            <span>
              Faibles <i className="rain-scale" /> Fortes
            </span>
          ) : (
            <div className="radar-product-legend" aria-label={`Échelle en ${productInfo.unit}`}>
              <i style={{ background: productInfo.gradient }} />
              <div>
                {productInfo.labels.map((label) => (
                  <span key={label}>{label}</span>
                ))}
                <b>{productInfo.unit}</b>
              </div>
            </div>
          )}
          <span>{provider} · heure de Paris</span>
        </div>
        {layerNotice && (
          <p className="radar-layer-notice" aria-live="polite">
            {layerNotice}
          </p>
        )}
      </div>
      <div className="map-attribution">
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          © OpenStreetMap
        </a>
        {renderer === "vector" && (
          <>
            <a href="https://openfreemap.org/" target="_blank" rel="noreferrer">
              OpenFreeMap
            </a>
            <a href="https://openmaptiles.org/" target="_blank" rel="noreferrer">
              © OpenMapTiles
            </a>
          </>
        )}
        <a href="/status/radar" target="_blank" rel="noreferrer">
          {shownFrame?.attribution || "Radar Météo-France / OPERA"}
        </a>
      </div>
    </section>
  );
}
function RadioGlyph() {
  return (
    <span className="radar-glyph" aria-hidden="true">
      <span />
    </span>
  );
}
