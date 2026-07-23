"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CATEGORY_GROUPS, CATEGORY_META, CATEGORY_ORDER } from "@/components/atlas/constants";
import { IconCamera, IconCheck, IconClose, IconMapPin, IconSend } from "@/components/atlas/icons";
import { MAX_OBSERVATION_PHENOMENA } from "@/lib/observation-utils";
import type { Coordinates, ObservationCategory } from "@/lib/types";

const INTENSITY_LABELS = ["", "Faible", "Modérée", "Marquée", "Forte", "Extrême"];
const DURATION_OPTIONS = [
  { value: 30, label: "30 min" },
  { value: 60, label: "1 h" },
  { value: 180, label: "3 h" },
  { value: 360, label: "6 h" },
] as const;
const STEPS = ["Phénomènes", "Témoignage", "Publication"] as const;

type ObservationDrawerProps = {
  open: boolean;
  position: Coordinates;
  place: string;
  defaultNickname: string;
  onClose: () => void;
  onUseMapCenter: () => void;
  onSubmit: (input: {
    phenomena: ObservationCategory[];
    intensity: number;
    durationMinutes: number;
    nickname: string;
    details: string;
    photo: File | null;
    preciseLocation: boolean;
  }) => Promise<void>;
};

export default function ObservationDrawer({ open, position, place, defaultNickname, onClose, onUseMapCenter, onSubmit }: ObservationDrawerProps) {
  const [step, setStep] = useState(0);
  const [phenomena, setPhenomena] = useState<ObservationCategory[]>(["pluie"]);
  const [intensity, setIntensity] = useState(2);
  const [durationMinutes, setDurationMinutes] = useState(180);
  const [nickname, setNickname] = useState("XimaM");
  const [details, setDetails] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preciseLocation, setPreciseLocation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [selectionNotice, setSelectionNotice] = useState("");

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setNickname(defaultNickname || "Membre Weyra");
    setDetails("");
    setPhoto(null);
    setSelectionNotice("");
  }, [defaultNickname, open]);

  useEffect(() => {
    if (!photo) {
      setPhotoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const primaryCategory = phenomena[0] ?? "nuage";
  const primaryMeta = CATEGORY_META[primaryCategory];
  const durationLabel = DURATION_OPTIONS.find((option) => option.value === durationMinutes)?.label ?? `${durationMinutes} min`;
  const shownLat = preciseLocation ? position.lat : Math.round(position.lat * 1000) / 1000;
  const shownLon = preciseLocation ? position.lon : Math.round(position.lon * 1000) / 1000;
  const groupedCategories = useMemo(() => CATEGORY_GROUPS.map((group) => ({
    ...group,
    categories: CATEGORY_ORDER.filter((category) => CATEGORY_META[category].group === group.id),
  })), []);

  function togglePhenomenon(category: ObservationCategory) {
    setSelectionNotice("");
    setPhenomena((current) => {
      if (current.includes(category)) {
        if (current.length === 1) {
          setSelectionNotice("Garde au moins un phénomène pour publier.");
          return current;
        }
        return current.filter((item) => item !== category);
      }
      if (current.length >= MAX_OBSERVATION_PHENOMENA) {
        setSelectionNotice(`Tu peux associer jusqu’à ${MAX_OBSERVATION_PHENOMENA} phénomènes.`);
        return current;
      }
      return [...current, category];
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < STEPS.length - 1) {
      setStep((current) => Math.min(STEPS.length - 1, current + 1));
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ phenomena, intensity, durationMinutes, nickname, details, photo, preciseLocation });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button className={`atlas-drawer-backdrop ${open ? "is-open" : ""}`} onClick={onClose} aria-label="Fermer l’ajout d’observation" />
      <aside className={`atlas-drawer atlas-observation-composer ${open ? "is-open" : ""}`} aria-label="Ajouter une observation météo">
        <div className="atlas-drawer__header">
          <div>
            <span className="atlas-composer__eyebrow"><i />Signalement terrain</span>
            <h2>Ce qui se passe maintenant</h2>
            <p>Combine plusieurs phénomènes dans une seule observation, au même endroit.</p>
          </div>
          <button className="atlas-drawer__close" onClick={onClose} type="button" title="Fermer" aria-label="Fermer"><IconClose /></button>
        </div>

        <div className="atlas-composer__steps" aria-label="Étapes de publication">
          {STEPS.map((label, index) => (
            <button
              key={label}
              type="button"
              className={index === step ? "is-current" : index < step ? "is-done" : ""}
              onClick={() => { if (index <= step) setStep(index); }}
              aria-current={index === step ? "step" : undefined}
            >
              <span>{index < step ? <IconCheck /> : index + 1}</span>
              <b>{label}</b>
            </button>
          ))}
        </div>

        <form onSubmit={submit}>
          <div className="atlas-composer__viewport">
            {step === 0 && (
              <section className="atlas-composer__pane" aria-label="Choisir les phénomènes">
                <div className="atlas-composer__section-heading">
                  <div><span>PHÉNOMÈNES OBSERVÉS</span><small>Sélection multiple</small></div>
                  <strong>{phenomena.length}/{MAX_OBSERVATION_PHENOMENA}</strong>
                </div>
                <div className="atlas-category-groups">
                  {groupedCategories.map((group) => (
                    <div className="atlas-category-group" key={group.id}>
                      <span>{group.label}</span>
                      <div className="atlas-category-grid">
                        {group.categories.map((category) => {
                          const meta = CATEGORY_META[category];
                          const Icon = meta.icon;
                          const selected = phenomena.includes(category);
                          return (
                            <button
                              key={category}
                              type="button"
                              onClick={() => togglePhenomenon(category)}
                              className={`atlas-category ${selected ? "is-selected" : ""}`}
                              style={{ "--cat-color": meta.color } as never}
                              aria-pressed={selected}
                            >
                              <span className="atlas-category__icon"><Icon /></span>
                              <b>{meta.shortLabel}</b>
                              {selected && <i><IconCheck /></i>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                {selectionNotice && <p className="atlas-composer__notice">{selectionNotice}</p>}

                <div className="atlas-composer__split-controls">
                  <div>
                    <span className="atlas-form-label">INTENSITÉ GLOBALE</span>
                    <div className="atlas-intensity atlas-intensity--v2" role="radiogroup" aria-label="Intensité de l’observation">
                      {[1, 2, 3, 4, 5].map((level) => (
                        <button
                          key={level}
                          type="button"
                          role="radio"
                          aria-checked={intensity === level}
                          className={intensity === level ? "is-active" : ""}
                          onClick={() => setIntensity(level)}
                        >
                          <i style={{ height: `${28 + level * 10}%` }} />
                          <span>{level}</span>
                        </button>
                      ))}
                    </div>
                    <b className="atlas-intensity__summary">{intensity} · {INTENSITY_LABELS[intensity]}</b>
                  </div>
                  <div>
                    <span className="atlas-form-label">VISIBLE PENDANT</span>
                    <div className="atlas-duration" role="radiogroup" aria-label="Durée de validité">
                      {DURATION_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          role="radio"
                          aria-checked={durationMinutes === option.value}
                          className={durationMinutes === option.value ? "is-active" : ""}
                          onClick={() => setDurationMinutes(option.value)}
                        >{option.label}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {step === 1 && (
              <section className="atlas-composer__pane" aria-label="Ajouter le témoignage">
                <div className="atlas-composer__selection-strip">
                  {phenomena.map((category) => {
                    const meta = CATEGORY_META[category];
                    const Icon = meta.icon;
                    return <span key={category} style={{ "--cat-color": meta.color } as never}><Icon />{meta.shortLabel}</span>;
                  })}
                </div>

                <label className="atlas-form-label" htmlFor="atlas-nickname">TON PSEUDO</label>
                <input id="atlas-nickname" className="atlas-input" maxLength={24} value={nickname} onChange={(event) => setNickname(event.target.value)} required />

                <div className="atlas-form-label-row">
                  <label className="atlas-form-label" htmlFor="atlas-details">CE QUE TU OBSERVES</label>
                  <span className="atlas-char-count">{details.length}/350</span>
                </div>
                <textarea
                  id="atlas-details"
                  className="atlas-textarea"
                  maxLength={350}
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  placeholder="Décris le déplacement, la visibilité, les impacts ou l’évolution…"
                />

                <span className="atlas-form-label">PHOTO (FACULTATIVE)</span>
                {photoPreviewUrl ? (
                  <div className="atlas-upload atlas-upload--preview">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoPreviewUrl} alt="Aperçu de la photo sélectionnée" className="atlas-upload__thumb" />
                    <button type="button" className="atlas-upload__remove" onClick={() => setPhoto(null)} title="Retirer la photo"><IconClose /></button>
                  </div>
                ) : (
                  <label className="atlas-upload" htmlFor="atlas-photo">
                    <span className="atlas-upload__icon"><IconCamera /></span>
                    <strong>Ajouter une photo du ciel</strong>
                    <span>JPG, PNG ou WebP · 2,5 Mo max.</span>
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
                )}
              </section>
            )}

            {step === 2 && (
              <section className="atlas-composer__pane" aria-label="Vérifier et publier">
                <span className="atlas-form-label">APERÇU PUBLIC</span>
                <div className="atlas-preview atlas-preview--v2" style={{ "--cat-color": primaryMeta.color } as never}>
                  {photoPreviewUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoPreviewUrl} alt="" className="atlas-preview__image" />
                  )}
                  <div className="atlas-preview__body">
                    <div className="atlas-preview__title">
                      <div className="atlas-preview__phenomena">
                        {phenomena.map((category) => {
                          const meta = CATEGORY_META[category];
                          const Icon = meta.icon;
                          return <span key={category} style={{ "--cat-color": meta.color } as never}><Icon /></span>;
                        })}
                      </div>
                      <div><strong>{phenomena.map((category) => CATEGORY_META[category].shortLabel).join(" · ")}</strong><span className="atlas-preview__meta">{nickname.trim() || "Membre Weyra"} · maintenant</span></div>
                    </div>
                    {details && <p className="atlas-preview__details">{details}</p>}
                    <div className="atlas-preview__footer">
                      <span className="atlas-preview__intensity">Niveau {intensity} · {INTENSITY_LABELS[intensity]}</span>
                      <span className="atlas-preview__place"><IconMapPin />{place}</span>
                    </div>
                  </div>
                </div>

                <div className="atlas-composer__publish-grid">
                  <div className="atlas-composer__validity"><span>Signal actif</span><strong>{durationLabel}</strong><small>Il disparaîtra automatiquement de la carte live.</small></div>
                  <div className="atlas-location" title="Clique sur la carte pour déplacer le point.">
                    <p className="atlas-location__text"><IconMapPin />{shownLat.toFixed(3)}, {shownLon.toFixed(3)} · {place}</p>
                    <button type="button" className="atlas-location__center" onClick={onUseMapCenter}>Centre carte</button>
                  </div>
                </div>

                <label className="atlas-privacy">
                  <span className="atlas-toggle">
                    <input type="checkbox" checked={preciseLocation} onChange={(event) => setPreciseLocation(event.target.checked)} />
                    <span className="atlas-toggle__track"><span className="atlas-toggle__thumb" /></span>
                  </span>
                  <span><strong>Position précise</strong>Sinon Weyra arrondit le point à environ 100 mètres pour protéger ta localisation.</span>
                </label>
              </section>
            )}
          </div>

          <footer className="atlas-composer__footer">
            <button type="button" className="atlas-composer__back" onClick={() => step > 0 ? setStep(step - 1) : onClose()}>
              {step > 0 ? "Retour" : "Annuler"}
            </button>
            <button className="atlas-submit" disabled={submitting} type="submit">
              {submitting ? "Publication…" : step < STEPS.length - 1 ? "Continuer" : (<><IconSend />Publier sur la carte</>)}
            </button>
          </footer>
        </form>
      </aside>
    </>
  );
}
