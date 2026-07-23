"use client";

import { useMemo, useState } from "react";
import { CATEGORY_META } from "@/components/atlas/constants";
import {
  IconAlertTriangle,
  IconBell,
  IconCheck,
  IconClock,
  IconClose,
  IconRadar,
} from "@/components/atlas/icons";
import type { WeyraActivityEntry, WeyraActivityKind } from "@/lib/activity";

type ActivityCenterProps = {
  open: boolean;
  entries: WeyraActivityEntry[];
  readIds: Set<string>;
  onClose: () => void;
  onMarkRead: (ids: string[]) => void;
  onSelectObservation: (observationId: string) => void;
};

type ActivityFilter = "all" | WeyraActivityKind;

const FILTERS: Array<{ id: ActivityFilter; label: string }> = [
  { id: "all", label: "Tout" },
  { id: "alert", label: "Alertes" },
  { id: "observation", label: "Terrain" },
  { id: "radar", label: "Radar" },
];

function relativeTime(timestamp: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 60_000));
  if (minutes < 1) return "maintenant";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} h`;
  return `${Math.floor(minutes / 1440)} j`;
}

export default function ActivityCenter({
  open,
  entries,
  readIds,
  onClose,
  onMarkRead,
  onSelectObservation,
}: ActivityCenterProps) {
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const filtered = useMemo(
    () => entries.filter((entry) => filter === "all" || entry.kind === filter),
    [entries, filter],
  );
  const unread = entries.filter((entry) => !readIds.has(entry.id));
  const strongCount = entries.filter((entry) => entry.level === "strong" || entry.level === "attention").length;

  if (!open) return null;

  function activate(entry: WeyraActivityEntry) {
    onMarkRead([entry.id]);
    if (entry.observationId) onSelectObservation(entry.observationId);
  }

  return (
    <>
      <button className="atlas-center-backdrop" type="button" onClick={onClose} aria-label="Fermer le centre d'activité" />
      <aside className="atlas-center atlas-activity-center" role="dialog" aria-modal="true" aria-label="Centre d'activité Weyra">
        <header className="atlas-center__header">
          <span className="atlas-center__header-icon"><IconBell /></span>
          <div><small>WEYRA LIVE</small><h2>Activité locale</h2></div>
          <button className="atlas-center__close" type="button" onClick={onClose} title="Fermer" aria-label="Fermer"><IconClose /></button>
        </header>

        <div className="atlas-activity__pulse">
          <div><span className="atlas-activity__live-dot" /><strong>{unread.length}</strong><small>nouveaux signaux</small></div>
          <div><IconAlertTriangle /><strong>{strongCount}</strong><small>à surveiller</small></div>
          <div><IconRadar /><strong>{entries.filter((entry) => entry.kind === "radar").length}</strong><small>radar actualisé</small></div>
        </div>

        <div className="atlas-center__toolbar">
          <div className="atlas-center__tabs" aria-label="Filtrer l'activité">
            {FILTERS.map((item) => (
              <button key={item.id} type="button" className={filter === item.id ? "is-active" : ""} onClick={() => setFilter(item.id)} aria-pressed={filter === item.id}>{item.label}</button>
            ))}
          </div>
          {unread.length > 0 && <button className="atlas-activity__read-all" type="button" onClick={() => onMarkRead(unread.map((entry) => entry.id))}><IconCheck />Tout lire</button>}
        </div>

        <div className="atlas-activity__feed">
          {filtered.length ? filtered.map((entry) => {
            const meta = entry.category ? CATEGORY_META[entry.category] : null;
            const EntryIcon = entry.kind === "radar" ? IconRadar : entry.kind === "alert" ? IconAlertTriangle : meta?.icon ?? IconBell;
            const isUnread = !readIds.has(entry.id);
            return (
              <button
                key={entry.id}
                type="button"
                className={`atlas-activity__item atlas-activity__item--${entry.level}${isUnread ? " is-unread" : ""}`}
                style={{ "--activity-color": meta?.color ?? (entry.kind === "radar" ? "#69dff8" : "#ffbd63") } as never}
                onClick={() => activate(entry)}
              >
                <span className="atlas-activity__item-icon"><EntryIcon /></span>
                <span className="atlas-activity__item-copy"><strong>{entry.title}</strong><small>{entry.description}</small></span>
                <span className="atlas-activity__item-time"><IconClock />{relativeTime(entry.timestamp)}</span>
                {isUnread && <i aria-label="Non lu" />}
              </button>
            );
          }) : (
            <div className="atlas-center__empty"><IconCheck /><strong>Tout est calme</strong><span>Aucun signal dans cette catégorie.</span></div>
          )}
        </div>

        <footer className="atlas-center__footer">Signaux locaux et communautaires. Les alertes officielles restent prioritaires.</footer>
      </aside>
    </>
  );
}
