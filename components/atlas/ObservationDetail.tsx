"use client";

import { FormEvent, useState } from "react";
import { CATEGORY_META } from "@/components/atlas/constants";
import {
  IconBook,
  IconCheck,
  IconClock,
  IconClose,
  IconEye,
  IconHeart,
  IconMapPin,
  IconMessage,
  IconMoreHorizontal,
  IconSend,
  IconShare,
  IconShield,
} from "@/components/atlas/icons";
import { formatRelativeTime } from "@/components/product/ProductShared";
import { useWeyraProduct } from "@/components/product/WeyraProductProvider";
import { observationPhenomena, observationRemainingMinutes } from "@/lib/observation-utils";
import type { Observation } from "@/lib/types";

type ObservationDetailProps = {
  observation: Observation | null;
  confirmed: boolean;
  onClose: () => void;
  onConfirm: (observation: Observation) => void;
  onShare: (observation: Observation) => void;
  onToast: (message: string) => void;
};

function validityLabel(observation: Observation) {
  const minutes = observationRemainingMinutes(observation);
  if (minutes === null) return "Signal terrain";
  if (minutes <= 0) return "Signal terminé";
  if (minutes < 60) return `Actif encore ${minutes} min`;
  return `Actif encore ${Math.ceil(minutes / 60)} h`;
}

function confidenceLabel(observation: Observation) {
  if (observation.likes >= 15) return { label: "Bien confirmé", level: "high", detail: "Plusieurs confirmations communautaires" };
  if (observation.likes >= 5) return { label: "En consolidation", level: "medium", detail: "Quelques confirmations indépendantes" };
  return { label: "Signal récent", level: "new", detail: "Encore peu de confirmations" };
}

export default function ObservationDetail({
  observation,
  confirmed,
  onClose,
  onConfirm,
  onShare,
  onToast,
}: ObservationDetailProps) {
  const {
    state,
    addComment,
    addNotebookEntry,
    reportObservation,
    hideObservation,
  } = useWeyraProduct();
  const [tab, setTab] = useState<"signal" | "discussion">("signal");
  const [commentDraft, setCommentDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  if (!observation) return null;

  const phenomena = observationPhenomena(observation);
  const primary = CATEGORY_META[phenomena[0]];
  const PrimaryIcon = primary.icon;
  const confidence = confidenceLabel(observation);
  const comments = state.commentsByTarget[`observation:${observation.id}`] ?? [];
  const reported = state.reportedObservationIds.includes(observation.id);

  function submitComment(event: FormEvent) {
    event.preventDefault();
    if (!addComment(`observation:${observation!.id}`, commentDraft)) return;
    setCommentDraft("");
  }

  return (
    <article
      key={observation.id}
      className="atlas-observation-detail atlas-observation-detail--v3 is-open"
      style={{ "--cat-color": primary.color } as never}
      aria-live="polite"
    >
      <div
        className="atlas-observation-detail__image"
        style={observation.imageUrl ? { backgroundImage: `url(${observation.imageUrl})` } : undefined}
      >
        {!observation.imageUrl && <span className="atlas-observation-detail__image-icon"><PrimaryIcon /></span>}
        <span className="atlas-observation-detail__live"><i />{validityLabel(observation)}</span>
        <div className="atlas-observation-detail__image-actions">
          <button onClick={() => setMenuOpen((value) => !value)} type="button" title="Plus d'actions" aria-label="Plus d'actions"><IconMoreHorizontal /></button>
          <button className="atlas-observation-detail__close" onClick={onClose} type="button" title="Fermer" aria-label="Fermer"><IconClose /></button>
        </div>
        {menuOpen && (
          <div className="atlas-observation-detail__menu">
            <button
              onClick={() => {
                addNotebookEntry({
                  title: phenomena.map((category) => CATEGORY_META[category].shortLabel).join(" · "),
                  note: observation.details ?? "Observation enregistrée depuis Atlas.",
                  place: observation.place ?? "Zone locale",
                  imageUrl: observation.imageUrl ?? undefined,
                  observationId: observation.id,
                });
                setMenuOpen(false);
                onToast("Observation ajoutée au carnet.");
              }}
            ><IconBook />Ajouter au carnet</button>
            <button
              className={reported ? "is-done" : ""}
              onClick={() => {
                reportObservation(observation.id);
                setMenuOpen(false);
                onToast(reported ? "Ce signalement est déjà enregistré." : "Signalement enregistré localement.");
              }}
            ><IconShield />{reported ? "Déjà signalée" : "Signaler un problème"}</button>
            <button
              onClick={() => {
                hideObservation(observation.id);
                onClose();
                onToast("Observation masquée sur cet appareil.");
              }}
            ><IconEye />Masquer cette observation</button>
          </div>
        )}
      </div>

      <div className="atlas-observation-detail__body">
        <div className="atlas-observation-detail__source">
          <span><i />Observation communautaire</span>
          {observation.isSeed && <em>Démonstration locale</em>}
        </div>
        <div className="atlas-observation-detail__phenomena">
          {phenomena.map((category) => {
            const meta = CATEGORY_META[category];
            const Icon = meta.icon;
            return <span key={category} style={{ "--cat-color": meta.color } as never}><Icon />{meta.shortLabel}</span>;
          })}
        </div>

        <div className="atlas-observation-detail__headline">
          <div>
            <strong>{primary.label}</strong>
            <span>Intensité {observation.intensity}/5 · par {observation.nickname}</span>
          </div>
          <b>{observation.intensity}</b>
        </div>

        <div className="atlas-observation-detail__tabs">
          <button className={tab === "signal" ? "is-active" : ""} onClick={() => setTab("signal")}>Signal</button>
          <button className={tab === "discussion" ? "is-active" : ""} onClick={() => setTab("discussion")}>Discussion <i>{comments.length}</i></button>
        </div>

        {tab === "signal" ? (
          <>
            {observation.details && <p className="atlas-observation-detail__description">{observation.details}</p>}
            <div className="atlas-observation-detail__confidence">
              <span className={`is-${confidence.level}`}><IconShield /></span>
              <div><small>Confiance communautaire</small><b>{confidence.label}</b><p>{confidence.detail}. Ce niveau n'est pas une validation officielle.</p></div>
            </div>
            <div className="atlas-observation-detail__meta">
              {observation.place && <span className="atlas-observation-detail__meta-item"><IconMapPin />{observation.place}</span>}
              <span className="atlas-observation-detail__meta-item"><IconClock />{formatRelativeTime(observation.createdAt)}</span>
            </div>
          </>
        ) : (
          <section className="atlas-observation-detail__discussion">
            <div>
              {comments.length ? comments.map((comment) => (
                <article key={comment.id}>
                  <span>{comment.authorName.slice(0, 2).toUpperCase()}</span>
                  <p><b>{comment.authorName}</b>{comment.body}<small>{formatRelativeTime(comment.createdAt)}</small></p>
                </article>
              )) : <p className="atlas-observation-detail__discussion-empty"><IconMessage />Aucune discussion locale pour ce signal.</p>}
            </div>
            <form onSubmit={submitComment}>
              <input value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} maxLength={500} placeholder="Ajouter un contexte utile…" />
              <button type="submit" title="Envoyer" aria-label="Envoyer"><IconSend /></button>
            </form>
          </section>
        )}

        <div className="atlas-observation-detail__actions">
          <button
            type="button"
            className={confirmed ? "is-confirmed" : ""}
            onClick={() => onConfirm(observation)}
            aria-pressed={confirmed}
            title="Confirmer que ce phénomène est toujours visible"
          >
            {confirmed ? <IconCheck /> : <IconHeart />}
            <span>{confirmed ? "Confirmé" : "Je confirme"}</span>
            <b>{observation.likes}</b>
          </button>
          <button type="button" onClick={() => onShare(observation)} title="Partager cette observation" aria-label="Partager"><IconShare /></button>
        </div>
      </div>
    </article>
  );
}
