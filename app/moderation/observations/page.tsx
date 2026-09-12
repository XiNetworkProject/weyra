"use client";
import "@/app/legacy.css";
import "@/app/product.css";
import "@/app/community.css";
import "@/app/weyra-theme.css";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { IconCheck, IconClock, IconClose, IconMapPin, IconRepeat, IconShield } from "@/components/atlas/icons";
import styles from "./page.module.css";

type ModerationObservation = {
  id: string;
  authorId: string;
  nickname: string;
  primaryCategory: string;
  phenomena: string[];
  intensity: number;
  details: string;
  latitude: number;
  longitude: number;
  locationPrecisionM: number;
  place: string;
  createdAt: string;
  expiresAt: string | null;
  media: {
    url: string | null;
    mimeType: string;
    rightsConfirmed: boolean;
    status: string;
  } | null;
};

type QueueState =
  { status: "loading"; message: string } | { status: "ready"; message: string } | { status: "error"; message: string };

const ERROR_MESSAGES: Record<string, string> = {
  authentication_required: "Connexion requise pour accéder à la modération.",
  moderation_forbidden: "Ce compte ne dispose pas du rôle de modération.",
  supabase_not_configured: "Le backend auto-hébergé de Weyra n’est pas encore configuré.",
};

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Heure inconnue";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(date);
}

function errorMessage(code: unknown) {
  return typeof code === "string" && ERROR_MESSAGES[code]
    ? ERROR_MESSAGES[code]
    : "La file de modération est momentanément indisponible.";
}

export default function ObservationModerationPage() {
  const [items, setItems] = useState<ModerationObservation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [queueState, setQueueState] = useState<QueueState>({ status: "loading", message: "Chargement…" });
  const [decisionPending, setDecisionPending] = useState(false);

  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);

  const loadQueue = useCallback(async () => {
    setQueueState({ status: "loading", message: "Actualisation de la file…" });
    try {
      const response = await fetch("/api/moderation/observations?limit=50", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        observations?: ModerationObservation[];
      };
      if (!response.ok || !payload.ok || !Array.isArray(payload.observations)) {
        setItems([]);
        setSelectedId(null);
        setQueueState({ status: "error", message: errorMessage(payload.error) });
        return;
      }

      setItems(payload.observations);
      setSelectedId((current) =>
        payload.observations?.some((item) => item.id === current) ? current : (payload.observations?.[0]?.id ?? null),
      );
      setQueueState({
        status: "ready",
        message: payload.observations.length ? `${payload.observations.length} en attente` : "File à jour",
      });
    } catch {
      setItems([]);
      setSelectedId(null);
      setQueueState({ status: "error", message: "Impossible de joindre le service de modération." });
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadQueue(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadQueue]);

  async function decide(decision: "approve" | "reject") {
    if (!selected || reason.trim().length < 3 || decisionPending) return;
    setDecisionPending(true);
    try {
      const response = await fetch(`/api/moderation/observations/${encodeURIComponent(selected.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ decision, reason: reason.trim() }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        setQueueState({ status: "error", message: errorMessage(payload.error) });
        return;
      }

      const remaining = items.filter((item) => item.id !== selected.id);
      setItems(remaining);
      setSelectedId(remaining[0]?.id ?? null);
      setReason("");
      setQueueState({
        status: "ready",
        message: decision === "approve" ? "Observation publiée" : "Observation rejetée",
      });
    } catch {
      setQueueState({ status: "error", message: "La décision n’a pas pu être enregistrée." });
    } finally {
      setDecisionPending(false);
    }
  }

  const approveBlocked = Boolean(selected?.media && !selected.media.rightsConfirmed);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="Retour à Weyra">
          weyra
        </Link>
        <span className={styles.productLabel}>
          <IconShield aria-hidden="true" /> Modération
        </span>
        <Link className={styles.backLink} href="/">
          Retour à Atlas
        </Link>
      </header>

      <section className={styles.workspace}>
        <div className={styles.headingRow}>
          <div>
            <p className={styles.eyebrow}>File communautaire</p>
            <h1>Observations à examiner</h1>
          </div>
          <div className={styles.queueTools}>
            <span className={styles.queueStatus} data-status={queueState.status} aria-live="polite">
              {queueState.message}
            </span>
            <button
              className={styles.iconButton}
              type="button"
              onClick={() => void loadQueue()}
              aria-label="Actualiser la file"
            >
              <IconRepeat aria-hidden="true" />
            </button>
          </div>
        </div>

        {queueState.status === "error" && items.length === 0 ? (
          <section className={styles.emptyState}>
            <IconShield aria-hidden="true" />
            <h2>Accès indisponible</h2>
            <p>{queueState.message}</p>
            <Link href="/login">Ouvrir la connexion</Link>
          </section>
        ) : items.length === 0 && queueState.status !== "loading" ? (
          <section className={styles.emptyState}>
            <IconCheck aria-hidden="true" />
            <h2>Aucune observation en attente</h2>
            <p>La file de modération est à jour.</p>
          </section>
        ) : (
          <div className={styles.reviewGrid}>
            <nav className={styles.queue} aria-label="Observations en attente">
              {items.map((item) => (
                <button
                  className={styles.queueItem}
                  data-selected={item.id === selectedId}
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(item.id);
                    setReason("");
                  }}
                >
                  <span className={styles.queueItemTop}>
                    <strong>{item.primaryCategory}</strong>
                    <span>Intensité {item.intensity}/5</span>
                  </span>
                  <span className={styles.queueItemMeta}>{item.place || "Position protégée"}</span>
                  <span className={styles.queueItemMeta}>{formatTimestamp(item.createdAt)}</span>
                </button>
              ))}
            </nav>

            {selected ? (
              <article className={styles.reviewPanel}>
                <div className={styles.reviewHeader}>
                  <div>
                    <span className={styles.category}>{selected.primaryCategory}</span>
                    <h2>{selected.nickname}</h2>
                  </div>
                  <span className={styles.intensity}>Niveau {selected.intensity}/5</span>
                </div>

                {selected.media?.url ? (
                  // Signed moderation URLs cannot use Next image optimization safely.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className={styles.media}
                    src={selected.media.url}
                    alt={`Observation envoyée par ${selected.nickname}`}
                  />
                ) : (
                  <div className={styles.mediaPlaceholder}>Aucun média joint</div>
                )}

                <div className={styles.metaStrip}>
                  <span>
                    <IconClock aria-hidden="true" /> {formatTimestamp(selected.createdAt)}
                  </span>
                  <span>
                    <IconMapPin aria-hidden="true" /> {selected.place || "Lieu non renseigné"} · précision ≥{" "}
                    {selected.locationPrecisionM} m
                  </span>
                </div>

                <div className={styles.phenomena}>
                  {selected.phenomena.map((phenomenon) => (
                    <span key={phenomenon}>{phenomenon}</span>
                  ))}
                </div>

                <p className={styles.details}>{selected.details || "Aucun détail ajouté."}</p>

                <dl className={styles.checks}>
                  <div>
                    <dt>Coordonnées publiées</dt>
                    <dd>
                      {selected.latitude.toFixed(3)}, {selected.longitude.toFixed(3)}
                    </dd>
                  </div>
                  <div>
                    <dt>Droits média</dt>
                    <dd data-valid={!approveBlocked}>{approveBlocked ? "Non confirmés" : "Conformes"}</dd>
                  </div>
                  <div>
                    <dt>État média</dt>
                    <dd>{selected.media?.status ?? "Sans média"}</dd>
                  </div>
                </dl>

                <label className={styles.reasonField}>
                  <span>Motif de décision</span>
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    maxLength={2000}
                    placeholder="Motif interne obligatoire"
                    rows={3}
                  />
                </label>

                {approveBlocked ? (
                  <p className={styles.warning}>
                    Publication bloquée tant que les droits du média ne sont pas confirmés.
                  </p>
                ) : null}

                <div className={styles.actions}>
                  <button
                    className={styles.rejectButton}
                    type="button"
                    disabled={decisionPending || reason.trim().length < 3}
                    onClick={() => void decide("reject")}
                  >
                    <IconClose aria-hidden="true" /> Rejeter
                  </button>
                  <button
                    className={styles.approveButton}
                    type="button"
                    disabled={decisionPending || reason.trim().length < 3 || approveBlocked}
                    onClick={() => void decide("approve")}
                  >
                    <IconCheck aria-hidden="true" /> Publier
                  </button>
                </div>
              </article>
            ) : null}
          </div>
        )}
      </section>
    </main>
  );
}
