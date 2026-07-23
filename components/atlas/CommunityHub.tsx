"use client";

import { useMemo, useState } from "react";
import { CATEGORY_META } from "@/components/atlas/constants";
import {
  IconCamera,
  IconClock,
  IconClose,
  IconHeart,
  IconMapPin,
  IconPlus,
  IconUsers,
} from "@/components/atlas/icons";
import { observationPhenomena } from "@/lib/observation-utils";
import type { Observation } from "@/lib/types";

type CommunityHubProps = {
  open: boolean;
  observations: Observation[];
  onClose: () => void;
  onSelect: (observation: Observation) => void;
  onCreate: () => void;
};

type CommunityFilter = "all" | "strong" | "photos" | "mine";
type CommunitySort = "recent" | "intensity" | "confirmed";

const FILTERS: Array<{ id: CommunityFilter; label: string }> = [
  { id: "all", label: "Tous" },
  { id: "strong", label: "Intenses" },
  { id: "photos", label: "Photos" },
  { id: "mine", label: "Mes signaux" },
];

function timeAgo(timestamp: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 60_000));
  if (minutes < 1) return "maintenant";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} h`;
  return `${Math.floor(minutes / 1440)} j`;
}

export default function CommunityHub({ open, observations, onClose, onSelect, onCreate }: CommunityHubProps) {
  const [filter, setFilter] = useState<CommunityFilter>("all");
  const [sort, setSort] = useState<CommunitySort>("recent");
  const filtered = useMemo(() => observations
    .filter((observation) => {
      if (filter === "strong") return observation.intensity >= 4;
      if (filter === "photos") return Boolean(observation.imageUrl);
      if (filter === "mine") return !observation.isSeed;
      return true;
    })
    .sort((a, b) => {
      if (sort === "intensity") return b.intensity - a.intensity || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sort === "confirmed") return b.likes - a.likes || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }), [filter, observations, sort]);
  const strongCount = observations.filter((observation) => observation.intensity >= 4).length;
  const photoCount = observations.filter((observation) => observation.imageUrl).length;

  if (!open) return null;

  return (
    <>
      <button className="atlas-center-backdrop" type="button" onClick={onClose} aria-label="Fermer le hub communautaire" />
      <aside className="atlas-center atlas-community-hub" role="dialog" aria-modal="true" aria-label="Communauté locale Weyra">
        <header className="atlas-center__header">
          <span className="atlas-center__header-icon atlas-center__header-icon--community"><IconUsers /></span>
          <div><small>TERRAIN LIVE</small><h2>Communauté locale</h2></div>
          <button className="atlas-center__close" type="button" onClick={onClose} title="Fermer" aria-label="Fermer"><IconClose /></button>
        </header>

        <div className="atlas-community__hero">
          <div className="atlas-community__radar"><i /><i /><i /><span><strong>{observations.length}</strong>signaux actifs</span></div>
          <div className="atlas-community__stats"><span><b>{strongCount}</b>intenses</span><span><b>{photoCount}</b>avec photo</span><span><b>{observations.reduce((sum, item) => sum + item.likes, 0)}</b>confirmations</span></div>
        </div>

        <div className="atlas-center__toolbar atlas-community__toolbar">
          <div className="atlas-center__tabs" aria-label="Filtrer les observations">
            {FILTERS.map((item) => <button key={item.id} type="button" className={filter === item.id ? "is-active" : ""} onClick={() => setFilter(item.id)}>{item.label}</button>)}
          </div>
          <select value={sort} onChange={(event) => setSort(event.target.value as CommunitySort)} aria-label="Trier les observations">
            <option value="recent">Récentes</option>
            <option value="intensity">Intensité</option>
            <option value="confirmed">Confirmées</option>
          </select>
        </div>

        <div className="atlas-community__feed">
          {filtered.length ? filtered.map((observation) => {
            const phenomena = observationPhenomena(observation);
            const primary = CATEGORY_META[phenomena[0]];
            const PrimaryIcon = primary.icon;
            return (
              <button
                key={observation.id}
                type="button"
                className="atlas-community__card"
                style={{ "--community-color": primary.color } as never}
                onClick={() => onSelect(observation)}
              >
                {observation.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <span className="atlas-community__media"><img src={observation.imageUrl} alt="" /><i><IconCamera /></i></span>
                ) : <span className="atlas-community__media atlas-community__media--icon"><PrimaryIcon /></span>}
                <span className="atlas-community__copy">
                  <span className="atlas-community__chips">{phenomena.map((category) => <i key={category}>{CATEGORY_META[category].shortLabel}</i>)}</span>
                  <strong>{observation.details || primary.label}</strong>
                  <small><span><IconMapPin />{observation.place ?? "Zone visible"}</span><span><IconClock />{timeAgo(observation.createdAt)}</span></small>
                </span>
                <span className="atlas-community__score"><b>{observation.intensity}</b><small>/5</small><i><IconHeart />{observation.likes}</i></span>
              </button>
            );
          }) : <div className="atlas-center__empty"><IconUsers /><strong>Aucun signal ici</strong><span>Publie la première observation de cette vue.</span></div>}
        </div>

        <button className="atlas-center__primary" type="button" onClick={onCreate}><IconPlus />Ajouter une observation</button>
        <footer className="atlas-center__footer"><span className="atlas-community__mode"><i />Mode local</span> Tes données restent sur cet appareil.</footer>
      </aside>
    </>
  );
}
