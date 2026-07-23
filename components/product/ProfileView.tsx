"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  IconBook,
  IconBookmark,
  IconCheck,
  IconCompass,
  IconEdit,
  IconPlus,
  IconStar,
  IconTrash,
} from "@/components/atlas/icons";
import { CATEGORY_META } from "@/components/atlas/constants";
import {
  DemoNotice,
  formatRelativeTime,
  ProductEmpty,
  ProductSectionHeading,
} from "@/components/product/ProductShared";
import { useWeyraProduct } from "@/components/product/WeyraProductProvider";
import { PRODUCT_POSTS } from "@/lib/product-fixtures";
import { observationPhenomena } from "@/lib/observation-utils";
import type { Observation } from "@/lib/types";

type ProfileTab = "observations" | "notebook" | "saved";

type ProfileViewProps = {
  observations: Observation[];
  onOpenObservation: (observationId: string) => void;
  onCreateObservation: () => void;
  onOpenMap: (lat: number, lon: number) => void;
  onToast: (message: string) => void;
};

export default function ProfileView({
  observations,
  onOpenObservation,
  onCreateObservation,
  onOpenMap,
  onToast,
}: ProfileViewProps) {
  const {
    state,
    updateProfile,
    addNotebookEntry,
    removeNotebookEntry,
    togglePostBookmark,
  } = useWeyraProduct();
  const [tab, setTab] = useState<ProfileTab>("observations");
  const [editing, setEditing] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [profileDraft, setProfileDraft] = useState(() => ({
    displayName: state.profile.displayName,
    handle: state.profile.handle,
    bio: state.profile.bio,
    region: state.profile.region,
  }));
  const ownObservations = useMemo(
    () => observations.filter((observation) => !observation.isSeed || observation.nickname === state.profile.displayName),
    [observations, state.profile.displayName],
  );
  const savedPosts = PRODUCT_POSTS.filter((post) => state.bookmarkedPostIds.includes(post.id));

  function submitProfile(event: FormEvent) {
    event.preventDefault();
    const displayName = profileDraft.displayName.trim().slice(0, 32);
    if (!displayName) return;
    updateProfile({
      displayName,
      handle: profileDraft.handle.trim().startsWith("@") ? profileDraft.handle.trim() : `@${profileDraft.handle.trim()}`,
      bio: profileDraft.bio.trim(),
      region: profileDraft.region.trim(),
      initials: displayName.split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase(),
    });
    setEditing(false);
    onToast("Profil local mis à jour.");
  }

  function submitNote(event: FormEvent) {
    event.preventDefault();
    if (!noteTitle.trim()) return;
    addNotebookEntry({
      title: noteTitle.trim(),
      note: noteBody.trim(),
      place: state.profile.region,
    });
    setNoteTitle("");
    setNoteBody("");
    setNoteOpen(false);
    onToast("Note ajoutée au carnet.");
  }

  return (
    <div className="product-view product-profile">
      <ProductSectionHeading
        eyebrow="Identité & mémoire"
        title="Mon espace Weyra"
        copy="Tes observations, lieux et apprentissages restent enregistrés sur cet appareil."
        action={<DemoNotice compact />}
      />

      <header className="product-profile-hero">
        <div className="product-profile-hero__avatar" style={{ "--profile-accent": state.profile.accent } as never}>{state.profile.initials}</div>
        <div className="product-profile-hero__identity">
          <span>Profil local</span>
          <h2>{state.profile.displayName}</h2>
          <small>{state.profile.handle} · {state.profile.region}</small>
          <p>{state.profile.bio}</p>
          <div>{state.profile.interests.map((interest) => <span key={interest}>{CATEGORY_META[interest].shortLabel}</span>)}</div>
        </div>
        <button className="product-secondary-button" onClick={() => setEditing(true)}><IconEdit />Modifier</button>
        <div className="product-profile-hero__stats">
          <span><b>{ownObservations.length}</b>observations locales</span>
          <span><b>{state.profile.confirmedCount}</b>confirmations</span>
          <span><b>{state.completedLessonIds.length}</b>fiches terminées</span>
        </div>
      </header>

      <section className="product-badges">
        <span>Reconnaissance</span>
        <div>
          <article><i><IconStar /></i><p><b>Éclaireur local</b><small>Premiers signalements utiles</small></p></article>
          <article><i><IconCheck /></i><p><b>Œil régulier</b><small>Observations réparties dans le temps</small></p></article>
          <article className={state.completedLessonIds.length >= 3 ? "" : "is-locked"}><i><IconBook /></i><p><b>Curieux du ciel</b><small>Terminer trois fiches</small></p></article>
        </div>
      </section>

      <div className="product-segmented">
        <button className={tab === "observations" ? "is-active" : ""} onClick={() => setTab("observations")}>Observations</button>
        <button className={tab === "notebook" ? "is-active" : ""} onClick={() => setTab("notebook")}>Carnet météo</button>
        <button className={tab === "saved" ? "is-active" : ""} onClick={() => setTab("saved")}>Enregistrés</button>
      </div>

      {tab === "observations" && (
        ownObservations.length ? (
          <div className="product-profile-grid">
            {ownObservations.map((observation) => (
              <article key={observation.id}>
                {observation.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={observation.imageUrl} alt="" />
                ) : <span className="product-profile-grid__placeholder">{CATEGORY_META[observation.category].shortLabel}</span>}
                <div>
                  <small>{formatRelativeTime(observation.createdAt)} · {observation.place ?? "Zone locale"}</small>
                  <h3>{observationPhenomena(observation).map((item) => CATEGORY_META[item].shortLabel).join(" · ")}</h3>
                  <p>{observation.details || "Observation sans description."}</p>
                  <button onClick={() => onOpenObservation(observation.id)}>Ouvrir</button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <ProductEmpty icon={<IconCompass />} title="Ton carnet de terrain commence ici" action={<button className="product-primary-button" onClick={onCreateObservation}><IconPlus />Créer une observation</button>}>
            Les observations publiées localement apparaîtront ici.
          </ProductEmpty>
        )
      )}

      {tab === "notebook" && (
        <section className="product-notebook">
          <header><div><span>Notes personnelles</span><h3>Mon carnet météo</h3></div><button className="product-primary-button" onClick={() => setNoteOpen(true)}><IconPlus />Nouvelle note</button></header>
          {state.notebookEntries.length ? (
            <div>
              {state.notebookEntries.map((entry) => (
                <article key={entry.id}>
                  <span><IconBook /></span>
                  <div><small>{formatRelativeTime(entry.createdAt)} · {entry.place}</small><h3>{entry.title}</h3><p>{entry.note || "Note sans description."}</p></div>
                  <button onClick={() => removeNotebookEntry(entry.id)} title="Supprimer la note" aria-label="Supprimer la note"><IconTrash /></button>
                </article>
              ))}
            </div>
          ) : (
            <ProductEmpty icon={<IconBook />} title="Aucune note personnelle" action={<button className="product-secondary-button" onClick={() => setNoteOpen(true)}>Écrire une note</button>}>
              Conserve ici une impression, un lieu ou un souvenir météo.
            </ProductEmpty>
          )}
        </section>
      )}

      {tab === "saved" && (
        savedPosts.length ? (
          <div className="product-saved-list">
            {savedPosts.map((post) => (
              <article key={post.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={post.imageUrl} alt="" />
                <div><small>{post.place} · {formatRelativeTime(post.publishedAt)}</small><h3>{post.title}</h3><p>{post.body}</p></div>
                <div><button onClick={() => onOpenMap(post.lat, post.lon)}><IconCompass /></button><button onClick={() => togglePostBookmark(post.id)}><IconBookmark /></button></div>
              </article>
            ))}
          </div>
        ) : (
          <ProductEmpty icon={<IconBookmark />} title="Rien d'enregistré">
            Utilise le marque-page dans le Flux pour retrouver un contenu ici.
          </ProductEmpty>
        )
      )}

      {editing && (
        <div className="product-modal-layer">
          <button className="product-modal-layer__backdrop" onClick={() => setEditing(false)} aria-label="Fermer" />
          <form className="product-modal" onSubmit={submitProfile}>
            <header><div><span>Profil local</span><h2>Modifier mon profil</h2></div><button type="button" onClick={() => setEditing(false)}>Fermer</button></header>
            <label>Nom affiché<input value={profileDraft.displayName} maxLength={32} onChange={(event) => setProfileDraft((current) => ({ ...current, displayName: event.target.value }))} /></label>
            <label>Identifiant<input value={profileDraft.handle} maxLength={32} onChange={(event) => setProfileDraft((current) => ({ ...current, handle: event.target.value }))} /></label>
            <label>Région<input value={profileDraft.region} maxLength={60} onChange={(event) => setProfileDraft((current) => ({ ...current, region: event.target.value }))} /></label>
            <label>Bio<textarea value={profileDraft.bio} maxLength={240} onChange={(event) => setProfileDraft((current) => ({ ...current, bio: event.target.value }))} /></label>
            <footer><button type="button" onClick={() => setEditing(false)}>Annuler</button><button className="product-primary-button" type="submit">Enregistrer</button></footer>
          </form>
        </div>
      )}

      {noteOpen && (
        <div className="product-modal-layer">
          <button className="product-modal-layer__backdrop" onClick={() => setNoteOpen(false)} aria-label="Fermer" />
          <form className="product-modal product-modal--note" onSubmit={submitNote}>
            <header><div><span>Carnet météo</span><h2>Nouvelle note</h2></div><button type="button" onClick={() => setNoteOpen(false)}>Fermer</button></header>
            <label>Titre<input value={noteTitle} maxLength={80} onChange={(event) => setNoteTitle(event.target.value)} placeholder="Ex. Le ciel avant l'averse" required /></label>
            <label>Note<textarea value={noteBody} maxLength={600} onChange={(event) => setNoteBody(event.target.value)} placeholder="Ce que tu souhaites conserver…" /></label>
            <footer><button type="button" onClick={() => setNoteOpen(false)}>Annuler</button><button className="product-primary-button" type="submit">Ajouter au carnet</button></footer>
          </form>
        </div>
      )}
    </div>
  );
}
