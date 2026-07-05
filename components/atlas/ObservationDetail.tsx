"use client";

import { CATEGORY_META } from "@/components/atlas/constants";
import { IconClock, IconClose, IconMapPin } from "@/components/atlas/icons";
import type { Observation } from "@/lib/types";

type ObservationDetailProps = {
  observation: Observation | null;
  onClose: () => void;
};

function timeAgo(timestamp: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
  if (seconds < 60) return "à l’instant";
  if (seconds < 3600) return `il y a ${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `il y a ${Math.floor(seconds / 3600)} h`;
  return `il y a ${Math.floor(seconds / 86400)} j`;
}

export default function ObservationDetail({ observation, onClose }: ObservationDetailProps) {
  if (!observation) return null;
  const category = CATEGORY_META[observation.category];

  return (
    <article className="atlas-observation-detail is-open" aria-live="polite">
      <div
        className="atlas-observation-detail__image"
        style={{ backgroundImage: observation.imageUrl ? `url(${observation.imageUrl})` : undefined }}
      >
        <button className="atlas-observation-detail__close" onClick={onClose} type="button" title="Fermer"><IconClose /></button>
      </div>
      <div className="atlas-observation-detail__body">
        <div className="atlas-observation-detail__title">
          <span style={{ background: category.color }}>{category.icon}</span>
          <strong>{category.label}</strong>
        </div>
        <p>{observation.details || "Aucun détail ajouté."}</p>
        {observation.place && (
          <div className="atlas-observation-detail__meta"><IconMapPin />{observation.place}</div>
        )}
        <div className="atlas-observation-detail__meta"><IconClock />{timeAgo(observation.createdAt)}</div>
      </div>
    </article>
  );
}
