"use client";

import { useMemo, useState } from "react";
import {
  IconActivity,
  IconAlertTriangle,
  IconBell,
  IconBook,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconCloud,
  IconCompass,
  IconDroplet,
  IconEye,
  IconMapPin,
  IconNavigation,
  IconPlus,
  IconRadar,
  IconSettings,
  IconShield,
  IconTrash,
  IconWind,
} from "@/components/atlas/icons";
import { CATEGORY_META } from "@/components/atlas/constants";
import {
  DemoNotice,
  formatRelativeTime,
  ProductEmpty,
  ProductSectionHeading,
  ProductToggle,
} from "@/components/product/ProductShared";
import { useWeyraProduct } from "@/components/product/WeyraProductProvider";
import { observationPhenomena } from "@/lib/observation-utils";
import {
  convertTemperature,
  convertWindSpeed,
  temperatureUnitLabel,
  weatherCodeInfo,
  windUnitLabel,
} from "@/lib/weather";
import type { WeyraActivityEntry } from "@/lib/activity";
import type { LocalAlert } from "@/lib/alerts";
import type { WeyraLocalPreferences } from "@/lib/local-core";
import type { Nowcast } from "@/lib/nowcast";
import type { LocationSelection, Observation, WeatherSnapshot } from "@/lib/types";

function distanceKm(from: { lat: number; lon: number }, to: { lat: number; lon: number }) {
  const earthRadiusKm = 6371;
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLon = ((to.lon - from.lon) * Math.PI) / 180;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

export function AroundView({
  location,
  weather,
  nowcast,
  alerts,
  observations,
  radarTimestamp,
  onOpenMap,
  onOpenObservation,
  onCreateObservation,
  onLocate,
}: {
  location: LocationSelection;
  weather: WeatherSnapshot | null;
  nowcast: Nowcast;
  alerts: LocalAlert[];
  observations: Observation[];
  radarTimestamp: string | null;
  onOpenMap: (lat: number, lon: number) => void;
  onOpenObservation: (observationId: string) => void;
  onCreateObservation: () => void;
  onLocate: () => void;
}) {
  const { state } = useWeyraProduct();
  const [radius, setRadius] = useState(20);
  const nearby = useMemo(() => observations
    .map((observation) => ({ observation, distance: distanceKm(location, observation) }))
    .filter((item) => item.distance <= radius)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 12), [location, observations, radius]);
  const weatherInfo = weather ? weatherCodeInfo(weather.weatherCode) : null;
  const temperatureUnit = state.settings.temperatureUnit;
  const windUnit = state.settings.windUnit;
  const displayTemperature = weather ? Math.round(convertTemperature(weather.temperature, temperatureUnit)) : null;
  const displayApparentTemperature = weather
    ? Math.round(convertTemperature(weather.apparentTemperature, temperatureUnit))
    : null;
  const displayWindSpeed = weather ? Math.round(convertWindSpeed(weather.windSpeed, windUnit)) : null;

  return (
    <div className="product-view product-around">
      <ProductSectionHeading
        eyebrow="Synthèse locale"
        title={`Autour de ${location.name}`}
        copy="Une lecture rapide des conditions, du radar et des observations proches."
        action={<button className="product-secondary-button" onClick={onLocate}><IconNavigation />Ma position</button>}
      />

      <section className="product-around-hero">
        <div className="product-around-hero__weather">
          <span>Maintenant</span>
          <strong>{displayTemperature === null ? "—" : `${displayTemperature}${temperatureUnitLabel(temperatureUnit)}`}</strong>
          <h3>{weatherInfo?.label ?? "Conditions indisponibles"}</h3>
          <p>Ressenti {displayApparentTemperature === null ? "—" : `${displayApparentTemperature}${temperatureUnitLabel(temperatureUnit)}`} · mis à jour {weather ? formatRelativeTime(weather.observedAt) : "—"}</p>
        </div>
        <div className="product-around-hero__nowcast">
          <span><IconActivity />Nowcast Weyra</span>
          <h2>{nowcast.text}</h2>
          <p>Lecture locale calculée à partir des sources actuellement disponibles.</p>
          <div>{nowcast.sources.map((source) => <span key={source}>{source === "radar" ? <IconRadar /> : source === "observations" ? <IconCloud /> : <IconWind />}{source}</span>)}</div>
        </div>
        <div className="product-around-hero__metrics">
          <span><IconWind /><b>{displayWindSpeed ?? "—"} {windUnitLabel(windUnit)}</b>Vent moyen</span>
          <span><IconDroplet /><b>{weather ? weather.precipitation.toFixed(1) : "—"} mm/h</b>Pluie observée</span>
          <span><IconRadar /><b>{radarTimestamp ? formatRelativeTime(radarTimestamp) : "Indisponible"}</b>Dernier scan</span>
        </div>
      </section>

      <div className="product-around__grid">
        <section className="product-around-signals">
          <header><div><span>Terrain</span><h3>Observations proches</h3></div><div className="product-radius">{[5, 20, 50].map((value) => <button key={value} className={radius === value ? "is-active" : ""} onClick={() => setRadius(value)}>{value} km</button>)}</div></header>
          {nearby.length ? (
            <div>
              {nearby.map(({ observation, distance }) => {
                const phenomena = observationPhenomena(observation);
                const primary = CATEGORY_META[phenomena[0]];
                const PrimaryIcon = primary.icon;
                return (
                  <article key={observation.id}>
                    <button className="product-around-signal__media" onClick={() => onOpenObservation(observation.id)}>
                      {observation.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={observation.imageUrl} alt="" />
                      ) : <span style={{ "--signal-color": primary.color } as never}><PrimaryIcon /></span>}
                    </button>
                    <div>
                      <small>{distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`} · {formatRelativeTime(observation.createdAt)}</small>
                      <h3>{phenomena.map((item) => CATEGORY_META[item].shortLabel).join(" · ")}</h3>
                      <p>{observation.place ?? "Zone locale"} · intensité {observation.intensity}/5</p>
                    </div>
                    <button onClick={() => onOpenMap(observation.lat, observation.lon)} title="Voir sur Atlas"><IconCompass /></button>
                  </article>
                );
              })}
            </div>
          ) : (
            <ProductEmpty icon={<IconCloud />} title="Aucun signal dans ce rayon" action={<button className="product-primary-button" onClick={onCreateObservation}><IconPlus />Observer maintenant</button>}>
              Élargis la zone ou partage ce que tu vois.
            </ProductEmpty>
          )}
        </section>

        <aside className="product-around-context">
          <section className={alerts.length ? "has-alerts" : ""}>
            <header><IconAlertTriangle /><div><span>Contexte local</span><h3>{alerts.length ? `${alerts.length} signal${alerts.length > 1 ? "aux" : ""}` : "Situation calme"}</h3></div></header>
            {alerts.length ? alerts.map((alert) => <p key={alert.id}><i className={`is-${alert.level}`} /><span><b>{alert.title}</b>{alert.zone} · {formatRelativeTime(alert.time)}</span></p>) : <p>Aucun seuil local n'est franchi dans les conditions actuelles.</p>}
            <small>Ces signaux sont dérivés localement et ne remplacent aucune vigilance officielle.</small>
          </section>
          <section>
            <header><IconMapPin /><div><span>Lieu actif</span><h3>{location.name}</h3></div></header>
            <p>{[location.admin, location.country].filter(Boolean).join(" · ")}</p>
            <button onClick={() => onOpenMap(location.lat, location.lon)}>Revenir sur Atlas <IconChevronRight /></button>
          </section>
        </aside>
      </div>
    </div>
  );
}

type ActivityFilter = "all" | "alert" | "observation" | "radar";

export function ActivityView({
  entries,
  onOpenObservation,
}: {
  entries: WeyraActivityEntry[];
  onOpenObservation: (observationId: string) => void;
}) {
  const { state, markActivityRead } = useWeyraProduct();
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const filtered = filter === "all" ? entries : entries.filter((entry) => entry.kind === filter);
  const unread = entries.filter((entry) => !state.readActivityIds.includes(entry.id)).length;

  return (
    <div className="product-view product-activity-view">
      <ProductSectionHeading
        eyebrow="Événements utiles"
        title="Activité"
        copy="Les changements importants autour de tes lieux, sans transformer chaque mouvement en notification."
        action={<button className="product-secondary-button" disabled={!unread} onClick={() => markActivityRead(entries.map((entry) => entry.id))}><IconCheck />Tout lire</button>}
      />
      <div className="product-segmented">
        <button className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}>Tout {unread > 0 && <i>{unread}</i>}</button>
        <button className={filter === "alert" ? "is-active" : ""} onClick={() => setFilter("alert")}>Signaux</button>
        <button className={filter === "observation" ? "is-active" : ""} onClick={() => setFilter("observation")}>Communauté</button>
        <button className={filter === "radar" ? "is-active" : ""} onClick={() => setFilter("radar")}>Radar</button>
      </div>
      {filtered.length ? (
        <div className="product-activity-timeline">
          {filtered.map((entry) => {
            const read = state.readActivityIds.includes(entry.id);
            return (
              <button
                key={entry.id}
                className={`is-${entry.level}${read ? " is-read" : ""}`}
                onClick={() => {
                  markActivityRead([entry.id]);
                  if (entry.observationId) onOpenObservation(entry.observationId);
                }}
              >
                <span>{entry.kind === "radar" ? <IconRadar /> : entry.kind === "alert" ? <IconAlertTriangle /> : <IconCloud />}</span>
                <div><header><b>{entry.title}</b><small>{formatRelativeTime(entry.timestamp)}</small></header><p>{entry.description}</p><em>{entry.kind === "radar" ? "Donnée météo" : entry.kind === "alert" ? "Signal local" : "Observation communautaire"}</em></div>
                {!read && <i />}
                {entry.observationId && <IconChevronRight />}
              </button>
            );
          })}
        </div>
      ) : <ProductEmpty icon={<IconActivity />} title="Rien dans ce filtre">Les nouveaux événements apparaîtront ici.</ProductEmpty>}
    </div>
  );
}

export function AlertsView({
  location,
  alerts,
}: {
  location: LocationSelection;
  alerts: LocalAlert[];
}) {
  const { state, updateAlertPreferences } = useWeyraProduct();
  const preferences = state.alertPreferences;
  const alertCategories = ["orage", "pluie", "grêle", "rafales", "neige", "brouillard"] as const;

  return (
    <div className="product-view product-alerts-view">
      <ProductSectionHeading
        eyebrow="Prévenir sans dramatiser"
        title="Alertes"
        copy={`Contrôle ce que Weyra peut te signaler autour de ${location.name}.`}
        action={<DemoNotice compact />}
      />
      <section className={`product-alert-status${preferences.enabled ? " is-enabled" : ""}`}>
        <span><IconBell /></span>
        <div><small>État des alertes</small><h2>{preferences.enabled ? "Alertes locales actives" : "Alertes en pause"}</h2><p>Rayon actuel : {preferences.radiusKm} km autour des lieux suivis.</p></div>
        <ProductToggle checked={preferences.enabled} onChange={(enabled) => updateAlertPreferences({ enabled })} label={preferences.enabled ? "Actives" : "En pause"} />
      </section>
      <div className="product-alerts-view__layout">
        <section className="product-alert-settings">
          <header><span>Préférences</span><h3>Ce qui mérite ton attention</h3></header>
          <div className="product-radius product-radius--large">
            {[5, 10, 20, 50, 100].map((value) => <button key={value} className={preferences.radiusKm === value ? "is-active" : ""} onClick={() => updateAlertPreferences({ radiusKm: value })}>{value} km</button>)}
          </div>
          <div className="product-alert-phenomena">
            {alertCategories.map((phenomenon) => {
              const meta = CATEGORY_META[phenomenon];
              const PhenomenonIcon = meta.icon;
              const selected = preferences.phenomena.includes(phenomenon);
              return (
                <button
                  key={phenomenon}
                  className={selected ? "is-active" : ""}
                  onClick={() => updateAlertPreferences({
                    phenomena: selected ? preferences.phenomena.filter((item) => item !== phenomenon) : [...preferences.phenomena, phenomenon],
                  })}
                  style={{ "--alert-color": meta.color } as never}
                >
                  <PhenomenonIcon /><span>{meta.shortLabel}</span>{selected && <IconCheck />}
                </button>
              );
            })}
          </div>
          <div className="product-setting-list">
            <ProductToggle checked={preferences.communityActivity} onChange={(communityActivity) => updateAlertPreferences({ communityActivity })} label="Activité communautaire utile" detail="Observations fortes ou confirmations proches." />
            <ProductToggle checked={preferences.officialInformation} onChange={(officialInformation) => updateAlertPreferences({ officialInformation })} label="Informations officielles" detail="Emplacement réservé : aucune source officielle n'est simulée." />
            <ProductToggle checked={preferences.dailyRecap} onChange={(dailyRecap) => updateAlertPreferences({ dailyRecap })} label="Récapitulatif quotidien" detail="Résumé local en fin de journée." />
            <ProductToggle checked={preferences.quietHours} onChange={(quietHours) => updateAlertPreferences({ quietHours })} label="Heures calmes" detail={`${preferences.quietFrom} à ${preferences.quietTo}`} />
          </div>
        </section>
        <aside className="product-alert-preview">
          <header><IconEye /><div><span>Aperçu</span><h3>Ce que tu recevrais</h3></div></header>
          {alerts.length ? alerts.map((alert) => (
            <article key={alert.id} className={`is-${alert.level}`}><i /><div><span>Weyra · {alert.zone}</span><h3>{alert.title}</h3><p>Signal local détecté dans les conditions observées. Ouvre Atlas pour le contexte.</p><small>{formatRelativeTime(alert.time)}</small></div></article>
          )) : (
            <article className="is-calm"><i /><div><span>Weyra · {location.name}</span><h3>Aucun signal local important</h3><p>Weyra restera silencieuse tant qu'un seuil utile n'est pas franchi.</p></div></article>
          )}
          <p><IconShield />Les observations communautaires, analyses et informations officielles auront toujours un rendu distinct.</p>
        </aside>
      </div>
    </div>
  );
}

export function SettingsView({
  atlasPreferences,
  onUpdateAtlasPreferences,
  onResetAtlasPreferences,
  onToast,
}: {
  atlasPreferences: WeyraLocalPreferences;
  onUpdateAtlasPreferences: (patch: Partial<WeyraLocalPreferences>) => void;
  onResetAtlasPreferences: () => void;
  onToast: (message: string) => void;
}) {
  const { state, updateSettings, resetLocalProduct } = useWeyraProduct();
  const [resetArmed, setResetArmed] = useState(false);

  return (
    <div className="product-view product-settings-view">
      <ProductSectionHeading
        eyebrow="Contrôle local"
        title="Préférences"
        copy="Ces réglages et contenus restent sur cet appareil tant qu'aucun compte n'est connecté."
        action={<DemoNotice compact />}
      />
      <div className="product-settings-grid">
        <section>
          <header><span><IconRadar /></span><div><small>Atlas</small><h3>Carte et radar</h3></div></header>
          <div className="product-setting-list">
            <ProductToggle checked={atlasPreferences.radarVisible} onChange={(radarVisible) => onUpdateAtlasPreferences({ radarVisible })} label="Radar visible" detail="Affiche le composite OPERA réel." />
            <ProductToggle checked={atlasPreferences.radarAutoplay} onChange={(radarAutoplay) => onUpdateAtlasPreferences({ radarAutoplay })} label="Lecture automatique" detail="Démarre l'animation lorsque les scans sont prêts." />
            <ProductToggle checked={atlasPreferences.radarLoop} onChange={(radarLoop) => onUpdateAtlasPreferences({ radarLoop })} label="Lecture en boucle" detail="Revient au début de l'historique." />
            <ProductToggle checked={atlasPreferences.observationsVisible} onChange={(observationsVisible) => onUpdateAtlasPreferences({ observationsVisible })} label="Observations sur Atlas" />
            <ProductToggle checked={atlasPreferences.showNowcast} onChange={(showNowcast) => onUpdateAtlasPreferences({ showNowcast })} label="Résumé Nowcast" />
          </div>
          <label className="product-select-row"><span><b>Vitesse du radar</b><small>Animation OPERA</small></span><select value={atlasPreferences.radarSpeed} onChange={(event) => onUpdateAtlasPreferences({ radarSpeed: Number(event.target.value) as 0.5 | 1 | 2 })}><option value="0.5">0,5×</option><option value="1">1×</option><option value="2">2×</option></select></label>
        </section>

        <section>
          <header><span><IconEye /></span><div><small>Interface</small><h3>Confort visuel</h3></div></header>
          <div className="product-setting-list">
            <ProductToggle checked={!state.settings.reduceMotion && atlasPreferences.motionEnabled} onChange={(enabled) => { updateSettings({ reduceMotion: !enabled }); onUpdateAtlasPreferences({ motionEnabled: enabled }); }} label="Animations de l'interface" detail="Respecte aussi la préférence système." />
            <ProductToggle checked={state.settings.compactMode} onChange={(compactMode) => updateSettings({ compactMode })} label="Mode compact" detail="Réduit les espaces dans les vues de contenu." />
            <ProductToggle checked={state.settings.highContrast} onChange={(highContrast) => updateSettings({ highContrast })} label="Contraste renforcé" detail="Accentue textes et séparations." />
          </div>
          <label className="product-select-row"><span><b>Température</b><small>Unité d'affichage</small></span><select value={state.settings.temperatureUnit} onChange={(event) => updateSettings({ temperatureUnit: event.target.value as "celsius" | "fahrenheit" })}><option value="celsius">Celsius</option><option value="fahrenheit">Fahrenheit</option></select></label>
          <label className="product-select-row"><span><b>Vent</b><small>Unité d'affichage</small></span><select value={state.settings.windUnit} onChange={(event) => updateSettings({ windUnit: event.target.value as "kmh" | "ms" })}><option value="kmh">km/h</option><option value="ms">m/s</option></select></label>
        </section>

        <section>
          <header><span><IconShield /></span><div><small>Vie privée</small><h3>Données locales</h3></div></header>
          <div className="product-data-summary">
            <p><b>Aucune base connectée</b>Les profils, réactions, commentaires et préférences de cette version restent dans le navigateur.</p>
            <p><b>Position protégée</b>Une observation utilise une position arrondie par défaut avant son enregistrement local.</p>
            <p><b>Médias locaux</b>Les photos ajoutées au prototype restent dans le stockage du navigateur.</p>
          </div>
        </section>

        <section className="product-settings-danger">
          <header><span><IconTrash /></span><div><small>Réinitialisation</small><h3>Effacer le prototype local</h3></div></header>
          <p>Réinitialise le profil, les réactions, les rooms, les fiches terminées et les réglages produit. Les caches radar ne sont pas touchés.</p>
          <div>
            <button onClick={() => { onResetAtlasPreferences(); onToast("Préférences Atlas réinitialisées."); }}>Réinitialiser Atlas</button>
            <button
              className={resetArmed ? "is-armed" : ""}
              onClick={() => {
                if (!resetArmed) {
                  setResetArmed(true);
                  window.setTimeout(() => setResetArmed(false), 5000);
                  return;
                }
                resetLocalProduct();
                setResetArmed(false);
                onToast("Données produit locales réinitialisées.");
              }}
            >
              {resetArmed ? "Confirmer l'effacement" : "Effacer les données produit"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
