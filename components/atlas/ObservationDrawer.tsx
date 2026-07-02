"use client";

import { FormEvent, useEffect, useState } from "react";
import { CATEGORY_META, CATEGORY_ORDER } from "@/components/atlas/constants";
import type { Coordinates, ObservationCategory } from "@/lib/types";

type ObservationDrawerProps = {
  open: boolean;
  position: Coordinates;
  place: string;
  onClose: () => void;
  onUseMapCenter: () => void;
  onSubmit: (input: {
    category: ObservationCategory;
    intensity: number;
    nickname: string;
    details: string;
    photo: File | null;
    preciseLocation: boolean;
  }) => Promise<void>;
};

export default function ObservationDrawer({ open, position, place, onClose, onUseMapCenter, onSubmit }: ObservationDrawerProps) {
  const [category, setCategory] = useState<ObservationCategory>("pluie");
  const [intensity, setIntensity] = useState(2);
  const [nickname, setNickname] = useState("XimaM");
  const [details, setDetails] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preciseLocation, setPreciseLocation] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDetails("");
    setPhoto(null);
  }, [open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({ category, intensity, nickname, details, photo, preciseLocation });
    } finally {
      setSubmitting(false);
    }
  }

  const shownLat = preciseLocation ? position.lat : Math.round(position.lat * 1000) / 1000;
  const shownLon = preciseLocation ? position.lon : Math.round(position.lon * 1000) / 1000;
  const intensityLabels = ["", "1 · Faible", "2 · Modérée", "3 · Marquée", "4 · Forte", "5 · Exceptionnelle"];

  return (
    <>
      <button className={`atlas-drawer-backdrop ${open ? "is-open" : ""}`} onClick={onClose} aria-label="Fermer l’ajout d’observation" />
      <aside className={`atlas-drawer ${open ? "is-open" : ""}`} aria-label="Ajouter une observation météo">
        <div className="atlas-drawer__header">
          <div>
            <h2>Nouvelle observation</h2>
            <p>Publie ce que tu vois réellement. Le point apparaît avec photo, phénomène et âge sur la carte.</p>
          </div>
          <button className="atlas-drawer__close" onClick={onClose} type="button">×</button>
        </div>

        <form onSubmit={submit}>
          <span className="atlas-form-label">PHÉNOMÈNE</span>
          <div className="atlas-category-grid">
            {CATEGORY_ORDER.map((item) => {
              const meta = CATEGORY_META[item];
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCategory(item)}
                  className={`atlas-category ${category === item ? "is-selected" : ""}`}
                >
                  <span>{meta.icon}</span><br />{meta.label.replace(" remarquable", "")}
                </button>
              );
            })}
          </div>

          <span className="atlas-form-label">INTENSITÉ</span>
          <div className="atlas-intensity-row">
            <input type="range" min="1" max="5" value={intensity} onChange={(event) => setIntensity(Number(event.target.value))} />
            <span>{intensityLabels[intensity]}</span>
          </div>

          <label className="atlas-form-label" htmlFor="atlas-nickname">PSEUDO</label>
          <input id="atlas-nickname" className="atlas-input" maxLength={24} value={nickname} onChange={(event) => setNickname(event.target.value)} required />

          <label className="atlas-form-label" htmlFor="atlas-details">DÉTAILS (FACULTATIF)</label>
          <textarea
            id="atlas-details"
            className="atlas-textarea"
            maxLength={350}
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            placeholder="Ex. forte pluie avec rafales, ciel très sombre vers l’ouest…"
          />

          <label className="atlas-form-label" htmlFor="atlas-photo">PHOTO (FACULTATIVE)</label>
          <label className="atlas-upload" htmlFor="atlas-photo">
            <span>📷</span>
            <span>{photo ? photo.name : "Ajouter une photo de l’observation"}</span>
            <input
              id="atlas-photo"
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                if (file && file.size > 2_500_000) {
                  event.target.value = "";
                  setPhoto(null);
                  return;
                }
                setPhoto(file);
              }}
            />
          </label>

          <label className="atlas-privacy">
            <input type="checkbox" checked={preciseLocation} onChange={(event) => setPreciseLocation(event.target.checked)} />
            <span>Partager ma position exacte. Sinon Weyra arrondit le point à environ 100 mètres.</span>
          </label>
          <p className="atlas-pin-status">Point choisi : {shownLat.toFixed(3)}, {shownLon.toFixed(3)} · {place}. Clique sur la carte pour le déplacer.</p>

          <button className="atlas-submit" disabled={submitting} type="submit">
            {submitting ? "Publication…" : "Publier sur la carte"}
          </button>
          <button className="atlas-secondary" onClick={onUseMapCenter} type="button">Utiliser le centre de la carte</button>
        </form>
      </aside>
    </>
  );
}
