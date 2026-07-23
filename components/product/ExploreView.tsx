"use client";

import { useMemo, useState } from "react";
import {
  IconChevronRight,
  IconClose,
  IconCompass,
  IconFilter,
  IconGlobe,
  IconPlus,
  IconSearch,
  IconShield,
  IconUsers,
} from "@/components/atlas/icons";
import { CommunityCard } from "@/components/product/CommunityShared";
import { useWeyraProduct } from "@/components/product/WeyraProductProvider";
import { COMMUNITIES, COMMUNITY_EVENTS } from "@/lib/community-fixtures";
import type { CommunityAccess, CommunityTemplate } from "@/lib/product-domain";

type ExploreViewProps = {
  onOpenCommunity: (communityId: string) => void;
  onToast: (message: string) => void;
};

const FILTERS = ["Toutes", "Autour de Lille", "Orages", "Photo", "Pédagogie"] as const;

const TEMPLATES: Array<{ id: CommunityTemplate; label: string; copy: string }> = [
  { id: "local", label: "Locale", copy: "Un territoire, des habitants et une vie locale." },
  { id: "weather", label: "Observation", copy: "Atlas, phénomènes, analyses et confirmations." },
  { id: "association", label: "Association", copy: "Membres, projets, ressources et événements." },
  { id: "photography", label: "Photographie", copy: "Galeries, techniques et sorties." },
];

export default function ExploreView({ onOpenCommunity, onToast }: ExploreViewProps) {
  const {
    state,
    toggleCommunityMembership,
    toggleCommunityFavorite,
    createCommunity,
  } = useWeyraProduct();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("Toutes");
  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState(0);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [territory, setTerritory] = useState("Lille et alentours");
  const [template, setTemplate] = useState<CommunityTemplate>("local");
  const [access, setAccess] = useState<CommunityAccess>("public");
  const allCommunities = useMemo(() => [...state.createdCommunities, ...COMMUNITIES], [state.createdCommunities]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("fr-FR");
    return allCommunities.filter((community) => {
      const matchesQuery = !normalized || [
        community.name,
        community.description,
        community.territory,
        ...community.themes,
      ].join(" ").toLocaleLowerCase("fr-FR").includes(normalized);
      const matchesFilter = filter === "Toutes"
        || (filter === "Autour de Lille" && /lille|flandres|hainaut/i.test(community.territory))
        || community.themes.some((theme) => theme.toLocaleLowerCase("fr-FR").includes(filter.toLocaleLowerCase("fr-FR")));
      return matchesQuery && matchesFilter;
    });
  }, [allCommunities, filter, query]);

  function closeCreate() {
    setCreateOpen(false);
    setCreateStep(0);
  }

  function submitCommunity() {
    const community = createCommunity({ name, description, territory, access, template });
    if (!community) {
      onToast("Complète le nom, la description et le territoire.");
      return;
    }
    closeCreate();
    setName("");
    setDescription("");
    onOpenCommunity(community.id);
    onToast("Communauté créée localement.");
  }

  return (
    <div className="weyra-page explore-view">
      <header className="weyra-page-heading">
        <div>
          <span>Explorer</span>
          <h1>Trouver un lieu qui vous ressemble</h1>
          <p>La proximité, l’activité utile et la qualité de l’accueil comptent davantage que la taille.</p>
        </div>
        <button className="weyra-primary-action" type="button" onClick={() => setCreateOpen(true)}>
          <IconPlus />Créer une communauté
        </button>
      </header>

      <section className="explore-tools">
        <label>
          <IconSearch />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Communauté, territoire ou thème" />
          <kbd>⌘K</kbd>
        </label>
        <div className="explore-filters" aria-label="Filtrer les communautés">
          <IconFilter />
          {FILTERS.map((item) => (
            <button key={item} className={filter === item ? "is-active" : ""} type="button" onClick={() => setFilter(item)}>
              {item}
            </button>
          ))}
        </div>
      </section>

      <section className="explore-featured">
        <div>
          <span><IconCompass />Près de votre zone</span>
          <h2>Une communauté locale active peut être plus utile qu’un immense groupe généraliste.</h2>
          <p>Chaque page publique montre son territoire, ses règles, ses thèmes et son niveau d’activité avant de vous demander de rejoindre.</p>
        </div>
        <div className="explore-featured__metrics">
          <span><b>{allCommunities.length}</b><small>communautés visibles</small></span>
          <span><b>{COMMUNITY_EVENTS.length}</b><small>événements à venir</small></span>
          <span><b>4</b><small>territoires proches</small></span>
        </div>
      </section>

      <section className="explore-results">
        <header>
          <div><span>Découverte</span><h2>{filtered.length} communautés</h2></div>
          <small>Triées par pertinence locale</small>
        </header>
        <div className="community-card-grid">
          {filtered.map((community) => (
            <CommunityCard
              key={community.id}
              community={community}
              joined={state.joinedCommunityIds.includes(community.id)}
              favorite={state.favoriteCommunityIds.includes(community.id)}
              onOpen={() => onOpenCommunity(community.id)}
              onJoin={() => {
                if (community.access === "private" && !state.joinedCommunityIds.includes(community.id)) {
                  onToast("Cette communauté fonctionne sur invitation.");
                  return;
                }
                toggleCommunityMembership(community.id);
                onToast(community.access === "request" ? "Demande enregistrée localement." : "Adhésion mise à jour.");
              }}
              onFavorite={() => toggleCommunityFavorite(community.id)}
            />
          ))}
        </div>
      </section>

      {createOpen && (
        <>
          <button className="weyra-sheet-backdrop" type="button" onClick={closeCreate} aria-label="Fermer" />
          <aside className="weyra-sheet community-create" role="dialog" aria-modal="true" aria-label="Créer une communauté">
            <header>
              <div><span>Nouvelle communauté</span><h2>{createStep === 0 ? "Choisir une base" : createStep === 1 ? "Définir son identité" : "Régler l’accès"}</h2></div>
              <button type="button" onClick={closeCreate} title="Fermer" aria-label="Fermer"><IconClose /></button>
            </header>
            <div className="community-create__progress" aria-hidden="true">
              {[0, 1, 2].map((step) => <i key={step} className={step <= createStep ? "is-active" : ""} />)}
            </div>

            {createStep === 0 && (
              <div className="community-create__templates">
                {TEMPLATES.map((item) => (
                  <button key={item.id} className={template === item.id ? "is-active" : ""} type="button" onClick={() => setTemplate(item.id)}>
                    <span>{item.id === "local" ? <IconCompass /> : item.id === "weather" ? <IconGlobe /> : item.id === "association" ? <IconUsers /> : <IconChevronRight />}</span>
                    <b>{item.label}</b>
                    <small>{item.copy}</small>
                  </button>
                ))}
              </div>
            )}

            {createStep === 1 && (
              <div className="community-create__form">
                <label><span>Nom</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="Ex. Observateurs de la Pévèle" /></label>
                <label><span>Description en une phrase</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={180} placeholder="Ce qui rassemble les membres et ce qu’ils peuvent y faire." /></label>
                <label><span>Territoire principal</span><input value={territory} onChange={(event) => setTerritory(event.target.value)} maxLength={80} /></label>
              </div>
            )}

            {createStep === 2 && (
              <div className="community-create__access">
                {([
                  ["public", "Publique", "La page et les espaces publics sont explorables avant adhésion."],
                  ["request", "Sur demande", "Une validation est nécessaire avant d’accéder aux espaces membres."],
                  ["private", "Privée", "L’accès se fait uniquement par invitation."],
                ] as const).map(([id, label, copy]) => (
                  <button key={id} className={access === id ? "is-active" : ""} type="button" onClick={() => setAccess(id)}>
                    <IconShield /><span><b>{label}</b><small>{copy}</small></span>
                  </button>
                ))}
                <p><IconShield />Les permissions avancées restent désactivées tant que les rôles simples ne sont pas configurés.</p>
              </div>
            )}

            <footer>
              <button type="button" onClick={() => createStep === 0 ? closeCreate() : setCreateStep((step) => step - 1)}>
                {createStep === 0 ? "Annuler" : "Retour"}
              </button>
              <button type="button" onClick={() => createStep < 2 ? setCreateStep((step) => step + 1) : submitCommunity()}>
                {createStep < 2 ? "Continuer" : "Créer localement"}<IconChevronRight />
              </button>
            </footer>
          </aside>
        </>
      )}
    </div>
  );
}
