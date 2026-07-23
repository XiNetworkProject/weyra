"use client";

import { useMemo, useState } from "react";
import { CATEGORY_META } from "@/components/atlas/constants";
import { IconChevronDown, IconClock, IconMapPin, IconPlus } from "@/components/atlas/icons";
import { observationPhenomena } from "@/lib/observation-utils";
import type { Observation } from "@/lib/types";

type NearbyObservationsProps = {
  observations: Observation[];
  onSelect: (observation: Observation) => void;
  onCreate: () => void;
};

type ObservationFilter = "all" | "recent" | "strong";

function timeAgo(timestamp: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
  if (seconds < 60) return "maintenant";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h`;
  return `${Math.floor(seconds / 86400)} j`;
}

export default function NearbyObservations({ observations, onSelect, onCreate }: NearbyObservationsProps) {
  const [collapsed, setCollapsed] = useState(true);
  const [filter, setFilter] = useState<ObservationFilter>("all");
  const filtered = useMemo(() => {
    const now = Date.now();
    return observations.filter((observation) => {
      if (filter === "recent") return now - new Date(observation.createdAt).getTime() <= 30 * 60_000;
      if (filter === "strong") return observation.intensity >= 4;
      return true;
    }).slice(0, 16);
  }, [filter, observations]);

  return (
    <section className={`atlas-nearby atlas-nearby--v2 ${collapsed ? "" : "is-open"}`} aria-label="Observations récentes visibles sur la carte">
      <button
        type="button"
        className="atlas-nearby__header"
        onClick={() => setCollapsed((value) => !value)}
        aria-expanded={!collapsed}
      >
        <span className="atlas-nearby__signal"><i /></span>
        <span className="atlas-nearby__title"><b>Terrain live</b><small>Dans la zone visible</small></span>
        <span className="atlas-nearby__count">{observations.length}</span>
        <IconChevronDown className="atlas-nearby__chevron" />
      </button>

      {!collapsed && (
        <div className="atlas-nearby__content">
          <div className="atlas-nearby__filters" aria-label="Filtrer les observations">
            {([
              ["all", "Toutes"],
              ["recent", "30 min"],
              ["strong", "Fortes"],
            ] as Array<[ObservationFilter, string]>).map(([id, label]) => (
              <button key={id} type="button" className={filter === id ? "is-active" : ""} onClick={() => setFilter(id)} aria-pressed={filter === id}>{label}</button>
            ))}
          </div>

          {filtered.length ? (
            <ul className="atlas-nearby__list">
              {filtered.map((observation) => {
                const phenomena = observationPhenomena(observation);
                const primary = CATEGORY_META[phenomena[0]];
                const PrimaryIcon = primary.icon;
                return (
                  <li key={observation.id}>
                    <button type="button" className="atlas-nearby__item" onClick={() => onSelect(observation)}>
                      {observation.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <span className="atlas-nearby__thumb-wrap" style={{ "--cat-color": primary.color } as never}>
                          <img src={observation.imageUrl} alt="" className="atlas-nearby__thumb" />
                          {phenomena.length > 1 && <i>+{phenomena.length - 1}</i>}
                        </span>
                      ) : (
                        <span className="atlas-nearby__badge" style={{ "--cat-color": primary.color } as never}><PrimaryIcon /></span>
                      )}
                      <span className="atlas-nearby__info">
                        <strong>{phenomena.map((category) => CATEGORY_META[category].shortLabel).join(" · ")}</strong>
                        <span className="atlas-nearby__meta">
                          {observation.place && <span className="atlas-nearby__meta-item"><IconMapPin />{observation.place}</span>}
                          <span className="atlas-nearby__dot" aria-hidden="true" />
                          <span className="atlas-nearby__meta-item"><IconClock />{timeAgo(observation.createdAt)}</span>
                        </span>
                      </span>
                      <span className="atlas-nearby__intensity" aria-label={`Intensité ${observation.intensity} sur 5`}>
                        {Array.from({ length: 5 }, (_, index) => <i key={index} className={index < observation.intensity ? "is-on" : ""} />)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : <p className="atlas-nearby__empty">Aucun signal ne correspond à ce filtre.</p>}

          <button className="atlas-nearby__create" type="button" onClick={onCreate}><IconPlus />Ajouter ce que tu vois</button>
        </div>
      )}
    </section>
  );
}
