"use client";

import { useEffect, useState } from "react";
import {
  IconCheck,
  IconChevronRight,
  IconClock,
  IconClose,
  IconCompass,
  IconMapPin,
  IconPlus,
  IconSettings,
  IconSliders,
  IconStar,
  IconTrash,
} from "@/components/atlas/icons";
import { localPlaceKey, type LocalRadarSpeed, type WeyraLocalCore, type WeyraLocalPreferences } from "@/lib/local-core";
import type { LocationSelection } from "@/lib/types";

export type ControlCenterTab = "places" | "settings";

type LocalControlCenterProps = {
  open: boolean;
  initialTab: ControlCenterTab;
  core: WeyraLocalCore;
  currentLocation: LocationSelection;
  onClose: () => void;
  onSelectPlace: (place: LocationSelection) => void;
  onToggleSavedPlace: (place: LocationSelection) => void;
  onClearRecentPlaces: () => void;
  onChangePreferences: (patch: Partial<WeyraLocalPreferences>) => void;
  onResetPreferences: () => void;
  onCreateObservation: () => void;
};

function SettingToggle({ checked, onChange, label, detail }: { checked: boolean; onChange: (value: boolean) => void; label: string; detail: string }) {
  return (
    <label className="atlas-control__setting">
      <span><strong>{label}</strong><small>{detail}</small></span>
      <span className="atlas-control__switch"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i><b /></i></span>
    </label>
  );
}

function PlaceButton({ place, saved, onSelect, onToggle }: { place: LocationSelection; saved: boolean; onSelect: () => void; onToggle?: () => void }) {
  return (
    <div className="atlas-control__place">
      <button type="button" onClick={onSelect}><span><IconMapPin /></span><span><strong>{place.name}</strong><small>{[place.admin, place.country].filter(Boolean).join(" · ") || `${place.lat.toFixed(2)}, ${place.lon.toFixed(2)}`}</small></span><IconChevronRight /></button>
      {onToggle && <button type="button" className={saved ? "is-saved" : ""} onClick={onToggle} title={saved ? "Retirer des favoris" : "Ajouter aux favoris"} aria-label={saved ? "Retirer des favoris" : "Ajouter aux favoris"}><IconStar /></button>}
    </div>
  );
}

export default function LocalControlCenter({
  open,
  initialTab,
  core,
  currentLocation,
  onClose,
  onSelectPlace,
  onToggleSavedPlace,
  onClearRecentPlaces,
  onChangePreferences,
  onResetPreferences,
  onCreateObservation,
}: LocalControlCenterProps) {
  const [tab, setTab] = useState<ControlCenterTab>(initialTab);
  useEffect(() => { if (open) setTab(initialTab); }, [initialTab, open]);
  if (!open) return null;

  const currentSaved = core.savedPlaces.some((place) => place.key === localPlaceKey(currentLocation));

  return (
    <>
      <button className="atlas-center-backdrop" type="button" onClick={onClose} aria-label="Fermer les options Weyra" />
      <aside className="atlas-center atlas-control-center" role="dialog" aria-modal="true" aria-label="Options locales Weyra">
        <header className="atlas-center__header">
          <span className="atlas-center__header-icon atlas-center__header-icon--control"><IconSliders /></span>
          <div><small>TON ATLAS</small><h2>Centre de contrôle</h2></div>
          <button className="atlas-center__close" type="button" onClick={onClose} title="Fermer" aria-label="Fermer"><IconClose /></button>
        </header>

        <div className="atlas-control__tabs" role="tablist">
          <button type="button" className={tab === "places" ? "is-active" : ""} onClick={() => setTab("places")}><IconCompass />Lieux</button>
          <button type="button" className={tab === "settings" ? "is-active" : ""} onClick={() => setTab("settings")}><IconSettings />Préférences</button>
        </div>

        {tab === "places" ? (
          <div className="atlas-control__body">
            <section className="atlas-control__current">
              <span><IconCompass /></span>
              <div><small>POSITION SUIVIE</small><strong>{currentLocation.name}</strong><p>{[currentLocation.admin, currentLocation.country].filter(Boolean).join(" · ")}</p></div>
              <button type="button" className={currentSaved ? "is-saved" : ""} onClick={() => onToggleSavedPlace(currentLocation)}><IconStar />{currentSaved ? "Enregistré" : "Enregistrer"}</button>
            </section>

            <section className="atlas-control__section">
              <div className="atlas-control__section-title"><span><IconStar />Favoris</span><small>{core.savedPlaces.length}/10</small></div>
              <div className="atlas-control__place-list">
                {core.savedPlaces.length ? core.savedPlaces.map((place) => <PlaceButton key={place.key} place={place} saved onSelect={() => onSelectPlace(place)} onToggle={() => onToggleSavedPlace(place)} />) : <p className="atlas-control__hint">Enregistre tes villes pour les retrouver ici en un geste.</p>}
              </div>
            </section>

            <section className="atlas-control__section">
              <div className="atlas-control__section-title"><span><IconClock />Récents</span>{core.recentPlaces.length > 0 && <button type="button" onClick={onClearRecentPlaces}><IconTrash />Effacer</button>}</div>
              <div className="atlas-control__place-list">
                {core.recentPlaces.length ? core.recentPlaces.map((place) => <PlaceButton key={place.key} place={place} saved={core.savedPlaces.some((saved) => saved.key === place.key)} onSelect={() => onSelectPlace(place)} />) : <p className="atlas-control__hint">Les lieux consultés apparaîtront ici.</p>}
              </div>
            </section>

            <button className="atlas-center__primary" type="button" onClick={onCreateObservation}><IconPlus />Signaler à {currentLocation.name}</button>
          </div>
        ) : (
          <div className="atlas-control__body atlas-control__body--settings">
            <section className="atlas-control__profile">
              <span>{core.preferences.nickname.slice(0, 1).toUpperCase()}</span>
              <label><small>NOM DE CONTRIBUTEUR</small><input value={core.preferences.nickname} maxLength={24} onChange={(event) => onChangePreferences({ nickname: event.target.value })} /></label>
              <i><IconCheck /></i>
            </section>

            <section className="atlas-control__settings-group">
              <div className="atlas-control__section-title"><span>RADAR</span></div>
              <SettingToggle checked={core.preferences.radarAutoplay} onChange={(radarAutoplay) => onChangePreferences({ radarAutoplay })} label="Lecture automatique" detail="Lancer l'animation lorsque les scans sont prêts" />
              <SettingToggle checked={core.preferences.radarLoop} onChange={(radarLoop) => onChangePreferences({ radarLoop })} label="Lecture en boucle" detail="Repartir du premier scan après le direct" />
              <div className="atlas-control__setting atlas-control__setting--speed"><span><strong>Vitesse par défaut</strong><small>Cadence de la timeline OPERA</small></span><div>{([0.5, 1, 2] as LocalRadarSpeed[]).map((speed) => <button type="button" key={speed} className={core.preferences.radarSpeed === speed ? "is-active" : ""} onClick={() => onChangePreferences({ radarSpeed: speed })}>{speed}x</button>)}</div></div>
            </section>

            <section className="atlas-control__settings-group">
              <div className="atlas-control__section-title"><span>INTERFACE</span></div>
              <SettingToggle checked={core.preferences.observationsVisible} onChange={(observationsVisible) => onChangePreferences({ observationsVisible })} label="Observations sur la carte" detail="Afficher les signaux terrain actifs" />
              <SettingToggle checked={core.preferences.showNowcast} onChange={(showNowcast) => onChangePreferences({ showNowcast })} label="Résumé NowCast" detail="Afficher la synthèse locale en haut de la carte" />
              <SettingToggle checked={core.preferences.showLocalAlerts} onChange={(showLocalAlerts) => onChangePreferences({ showLocalAlerts })} label="Alertes locales" detail="Garder le panneau de vigilance visible" />
              <SettingToggle checked={core.preferences.motionEnabled} onChange={(motionEnabled) => onChangePreferences({ motionEnabled })} label="Animations d'interface" detail="Transitions, pulsations et mouvements d'ambiance" />
            </section>

            <button className="atlas-control__reset" type="button" onClick={onResetPreferences}>Rétablir les préférences par défaut</button>
            <p className="atlas-control__privacy"><IconCheck />Ces réglages sont stockés uniquement dans ce navigateur.</p>
          </div>
        )}
      </aside>
    </>
  );
}
