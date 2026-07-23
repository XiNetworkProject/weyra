"use client";

import { useMemo, useState } from "react";
import {
  IconActivity,
  IconAlertTriangle,
  IconArrowLeft,
  IconBell,
  IconBook,
  IconCheck,
  IconChevronRight,
  IconClose,
  IconClock,
  IconEdit,
  IconEye,
  IconPlus,
  IconSettings,
  IconShield,
  IconSliders,
  IconUsers,
} from "@/components/atlas/icons";
import {
  CommunitySpaceIcon,
  communitySpaceLabel,
  VisibilityBadge,
} from "@/components/product/CommunityShared";
import { formatRelativeTime, ProductToggle } from "@/components/product/ProductShared";
import { useWeyraProduct } from "@/components/product/WeyraProductProvider";
import {
  COMMUNITY_MEMBERS,
  COMMUNITY_ROLES,
  MODERATION_CASES,
} from "@/lib/community-fixtures";
import type {
  Community,
  CommunitySection,
  CommunitySpace,
  CommunitySpaceType,
  LocalModerationDecision,
} from "@/lib/product-domain";

type AdminTab =
  | "overview"
  | "appearance"
  | "structure"
  | "members"
  | "roles"
  | "moderation"
  | "security"
  | "notifications"
  | "stats";

const ADMIN_TABS: Array<{ id: AdminTab; label: string; icon: typeof IconSettings }> = [
  { id: "overview", label: "Vue d’ensemble", icon: IconActivity },
  { id: "appearance", label: "Apparence", icon: IconEdit },
  { id: "structure", label: "Structure", icon: IconSliders },
  { id: "members", label: "Membres", icon: IconUsers },
  { id: "roles", label: "Rôles & accès", icon: IconShield },
  { id: "moderation", label: "Modération", icon: IconAlertTriangle },
  { id: "security", label: "Sécurité", icon: IconShield },
  { id: "notifications", label: "Notifications", icon: IconBell },
  { id: "stats", label: "Statistiques", icon: IconActivity },
];

const SPACE_TYPES: CommunitySpaceType[] = [
  "discussion",
  "observations",
  "atlas",
  "media",
  "event",
  "announcement",
  "resource",
];

const MODERATION_ACTIONS: Array<{ id: LocalModerationDecision["action"]; label: string; copy: string }> = [
  { id: "educate", label: "Rappel pédagogique", copy: "Expliquer la règle sans restriction." },
  { id: "limit", label: "Limiter temporairement", copy: "Ralentissement ou validation préalable." },
  { id: "warn", label: "Avertissement formel", copy: "Motif, règle et durée clairement indiqués." },
  { id: "suspend", label: "Exclusion temporaire", copy: "Retirer l’accès pour une durée définie." },
  { id: "ban", label: "Bannir", copy: "Réserver aux atteintes graves ou récidives." },
  { id: "dismiss", label: "Classer sans suite", copy: "Aucune infraction après examen du contexte." },
];

export default function CommunityAdminView({
  community,
  sections,
  spaces,
  onBack,
  onToast,
}: {
  community: Community;
  sections: CommunitySection[];
  spaces: CommunitySpace[];
  onBack: () => void;
  onToast: (message: string) => void;
}) {
  const {
    state,
    assignMemberRole,
    resolveModerationCase,
    createCommunitySpace,
  } = useWeyraProduct();
  const [tab, setTab] = useState<AdminTab>("overview");
  const [selectedCaseId, setSelectedCaseId] = useState(MODERATION_CASES[0]?.id ?? "");
  const [createSpaceOpen, setCreateSpaceOpen] = useState(false);
  const [spaceName, setSpaceName] = useState("");
  const [spaceDescription, setSpaceDescription] = useState("");
  const [spaceType, setSpaceType] = useState<CommunitySpaceType>("discussion");
  const [spaceVisibility, setSpaceVisibility] = useState<CommunitySpace["visibility"]>("members");
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? `section-local-${community.id}`);
  const [twoFactor, setTwoFactor] = useState(true);
  const [linkFilter, setLinkFilter] = useState(true);
  const [mediaProtection, setMediaProtection] = useState(true);
  const [slowMode, setSlowMode] = useState(false);
  const cases = MODERATION_CASES.filter((item) => item.communityId === community.id);
  const unresolvedCases = cases.filter((item) => !state.moderationDecisions[item.id]);
  const selectedCase = cases.find((item) => item.id === selectedCaseId) ?? cases[0] ?? null;
  const members = COMMUNITY_MEMBERS.filter((member) => member.communityId === community.id);
  const roles = COMMUNITY_ROLES.filter((role) => role.communityId === community.id).sort((a, b) => b.priority - a.priority);
  const roleById = useMemo(() => new Map(roles.map((role) => [role.id, role])), [roles]);

  function submitSpace() {
    const result = createCommunitySpace({
      communityId: community.id,
      sectionId,
      name: spaceName,
      description: spaceDescription,
      type: spaceType,
      visibility: spaceVisibility,
    });
    if (!result) {
      onToast("Ajoute un nom et une description.");
      return;
    }
    setCreateSpaceOpen(false);
    setSpaceName("");
    setSpaceDescription("");
    onToast("Espace créé localement.");
  }

  return (
    <div className="community-admin">
      <aside className="community-admin__nav">
        <button type="button" onClick={onBack}><IconArrowLeft />Retour à la communauté</button>
        <header><small>Gestion</small><h2>{community.name}</h2></header>
        <nav>
          {ADMIN_TABS.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={tab === item.id ? "is-active" : ""} type="button" onClick={() => setTab(item.id)}>
                <Icon /><span>{item.label}</span>
                {item.id === "moderation" && unresolvedCases.length > 0 && <i>{unresolvedCases.length}</i>}
              </button>
            );
          })}
        </nav>
        <footer><IconShield /><span><b>Mode simple</b><small>Les permissions critiques demandent toujours une confirmation.</small></span></footer>
      </aside>

      <main className="community-admin__main">
        {tab === "overview" && (
          <section className="admin-panel admin-overview">
            <header className="admin-heading"><div><span>Vue d’ensemble</span><h1>Ce qui demande votre attention</h1><p>Les actions prioritaires passent avant les statistiques descriptives.</p></div><small>Actualisé maintenant</small></header>
            <div className="admin-priorities">
              <button type="button" onClick={() => setTab("moderation")} className="is-danger"><IconAlertTriangle /><span><b>{unresolvedCases.length} signalements ouverts</b><small>Un cas concerne une localisation sensible.</small></span><IconChevronRight /></button>
              <button type="button" onClick={() => setTab("members")}><IconUsers /><span><b>6 demandes d’accès</b><small>Délai habituel : moins de 24 heures.</small></span><IconChevronRight /></button>
              <button type="button" onClick={() => setTab("security")}><IconShield /><span><b>Sécurité des responsables</b><small>La double authentification est recommandée à deux personnes.</small></span><IconChevronRight /></button>
            </div>
            <div className="admin-metrics">
              <span><small>Membres</small><b>{community.memberCount.toLocaleString("fr-FR")}</b><em>+42 ce mois</em></span>
              <span><small>Actifs / semaine</small><b>{community.activeCount}</b><em>7,5 % des membres</em></span>
              <span><small>Observations</small><b>{community.observationCount}</b><em>12 confirmées</em></span>
              <span><small>Espaces actifs</small><b>{spaces.filter((space) => !space.archived).length}</b><em>Dans la limite recommandée</em></span>
            </div>
            <section className="admin-health">
              <header><div><small>Santé communautaire</small><h2>Une base saine, deux points à surveiller</h2></div><span>82 / 100</span></header>
              <div>
                <span className="is-good"><IconCheck /><b>Accueil clair</b><small>Les nouveaux trouvent Atlas et les règles.</small></span>
                <span className="is-good"><IconCheck /><b>Modération active</b><small>Temps médian de réponse : 2 h 14.</small></span>
                <span className="is-warn"><IconClock /><b>Espace peu actif</b><small>Comprendre la situation n’a reçu qu’un message cette semaine.</small></span>
              </div>
            </section>
          </section>
        )}

        {tab === "appearance" && (
          <section className="admin-panel">
            <header className="admin-heading"><div><span>Apparence</span><h1>Une identité située, sans casser Weyra</h1><p>La bannière, la couleur et l’ordre des blocs restent dans le système visuel commun.</p></div><button type="button" onClick={() => onToast("Aperçu local enregistré.")}>Enregistrer</button></header>
            <div className="admin-appearance">
              <div className="admin-appearance__preview" style={{ "--community-accent": community.accent } as never}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={community.bannerUrl} alt="" />
                <span />
                <div><b>{community.initials}</b><h2>{community.name}</h2><p>{community.description}</p></div>
              </div>
              <div className="admin-form">
                <label><span>Nom</span><input defaultValue={community.name} maxLength={60} /></label>
                <label><span>Description courte</span><textarea defaultValue={community.description} maxLength={180} /></label>
                <label><span>Territoire</span><input defaultValue={community.territory} maxLength={80} /></label>
                <fieldset><legend>Couleur secondaire</legend><div className="admin-color-row">{["#65d8f3", "#4f8cff", "#9b8cff", "#58d5a5", "#f2c96d"].map((color) => <button key={color} type="button" style={{ backgroundColor: color }} title={color} aria-label={color} />)}</div></fieldset>
                <p><IconEye />Prévisualisation membre et visiteur disponible avant publication.</p>
              </div>
            </div>
          </section>
        )}

        {tab === "structure" && (
          <section className="admin-panel">
            <header className="admin-heading"><div><span>Structure</span><h1>Sections et espaces</h1><p>Huit à douze espaces actifs suffisent généralement à rendre une communauté lisible.</p></div><button type="button" onClick={() => setCreateSpaceOpen(true)}><IconPlus />Créer un espace</button></header>
            <div className="admin-structure">
              {sections.map((section) => (
                <section key={section.id}>
                  <header><h2>{section.name}</h2><button type="button" title="Modifier la section" aria-label="Modifier la section"><IconEdit /></button></header>
                  <div>
                    {spaces.filter((space) => space.sectionId === section.id).map((space) => (
                      <article key={space.id}>
                        <span><CommunitySpaceIcon type={space.type} /></span>
                        <div><b>{space.name}</b><small>{space.description}</small></div>
                        <em>{communitySpaceLabel(space.type)}</em>
                        <VisibilityBadge visibility={space.visibility} />
                        <button type="button" title="Modifier" aria-label={`Modifier ${space.name}`}><IconEdit /></button>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </section>
        )}

        {tab === "members" && (
          <section className="admin-panel">
            <header className="admin-heading"><div><span>Membres</span><h1>Responsabilités et accès</h1><p>Les rôles sont affichés pour expliquer une responsabilité, pas comme un classement social.</p></div><button type="button" onClick={() => onToast("Invitation locale créée.")}><IconPlus />Inviter</button></header>
            <div className="admin-member-tools"><label><input placeholder="Rechercher un membre" /></label><select aria-label="Filtrer par rôle"><option>Tous les rôles</option>{roles.map((role) => <option key={role.id}>{role.name}</option>)}</select></div>
            <div className="admin-members">
              {members.map((member) => {
                const roleId = state.memberRoleOverrides[member.id] ?? member.roleId;
                const role = roleById.get(roleId);
                return (
                  <article key={member.id}>
                    <span style={{ "--member-accent": member.accent } as never}>{member.initials}<i className={`is-${member.presence}`} /></span>
                    <div><b>{member.displayName}</b><small>{member.handle} · rejoint {formatRelativeTime(member.joinedAt)}</small></div>
                    <em>{member.contributionCount} contributions</em>
                    <select value={roleId} onChange={(event) => assignMemberRole(member.id, event.target.value)} aria-label={`Rôle de ${member.displayName}`}>
                      {roles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                    <button type="button" title="Options" aria-label={`Options pour ${member.displayName}`}><IconSettings /></button>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {tab === "roles" && (
          <section className="admin-panel">
            <header className="admin-heading"><div><span>Rôles & accès</span><h1>Comprendre avant d’autoriser</h1><p>Chaque rôle résume ses capacités en phrases humaines. Les détails restent disponibles à la demande.</p></div><button type="button" onClick={() => onToast("La création de rôle est préparée pour la future couche de données.")}><IconPlus />Nouveau rôle</button></header>
            <div className="admin-roles">
              {roles.map((role) => (
                <article key={role.id} style={{ "--role-color": role.color } as never}>
                  <header><span><IconShield /></span><div><h2>{role.name}</h2><p>{role.summary}</p></div>{role.critical && <em>Critique</em>}</header>
                  <div>{role.permissions.map((permission) => <span key={permission}><IconCheck />{permission}</span>)}</div>
                  <footer><small>{members.filter((member) => (state.memberRoleOverrides[member.id] ?? member.roleId) === role.id).length} membres</small><button type="button"><IconEye />Voir comme</button><button type="button"><IconEdit />Modifier</button></footer>
                </article>
              ))}
            </div>
          </section>
        )}

        {tab === "moderation" && (
          <section className="admin-panel moderation-panel">
            <header className="admin-heading"><div><span>Modération</span><h1>Décider avec le contexte</h1><p>L’automatisation peut signaler un risque ; une décision lourde reste humaine et expliquée.</p></div></header>
            <div className="moderation-layout">
              <aside>
                <div className="moderation-filters"><button className="is-active" type="button">Ouverts <span>{unresolvedCases.length}</span></button><button type="button">Résolus</button></div>
                {cases.map((item) => {
                  const resolved = Boolean(state.moderationDecisions[item.id]);
                  return (
                    <button key={item.id} className={`${selectedCase?.id === item.id ? "is-active" : ""}${resolved ? " is-resolved" : ""}`} type="button" onClick={() => setSelectedCaseId(item.id)}>
                      <span className={`is-${item.priority}`}><IconAlertTriangle /></span>
                      <div><small>{item.priority} · {formatRelativeTime(item.createdAt)}</small><b>{item.title}</b><em>{resolved ? "Résolu localement" : item.status === "reviewing" ? "En cours" : "À traiter"}</em></div>
                    </button>
                  );
                })}
              </aside>
              {selectedCase && (
                <div className="moderation-case">
                  <header><span className={`is-${selectedCase.priority}`}>{selectedCase.priority}</span><small>Dossier {selectedCase.id}</small><h2>{selectedCase.title}</h2><p>{selectedCase.summary}</p></header>
                  <section><small>Contenu signalé</small><blockquote>{selectedCase.reportedContent}</blockquote></section>
                  <div className="moderation-case__context">
                    <span><b>{selectedCase.previousActions}</b><small>action antérieure</small></span>
                    <span><b>{selectedCase.category}</b><small>catégorie</small></span>
                    <span><b>Public</b><small>visibilité</small></span>
                  </div>
                  {state.moderationDecisions[selectedCase.id] ? (
                    <div className="moderation-decision"><IconCheck /><span><b>Décision enregistrée localement</b><small>{state.moderationDecisions[selectedCase.id].action} · {formatRelativeTime(state.moderationDecisions[selectedCase.id].decidedAt)}</small></span></div>
                  ) : (
                    <div className="moderation-actions">
                      <h3>Choisir la mesure minimale qui protège réellement</h3>
                      {MODERATION_ACTIONS.map((action) => (
                        <button key={action.id} type="button" onClick={() => {
                          resolveModerationCase(selectedCase.id, action.id);
                          onToast(`Décision “${action.label}” enregistrée localement.`);
                        }}>
                          <span><b>{action.label}</b><small>{action.copy}</small></span><IconChevronRight />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {tab === "security" && (
          <section className="admin-panel">
            <header className="admin-heading"><div><span>Sécurité</span><h1>Protéger sans surveiller</h1><p>Les positions sensibles, responsables et actions critiques reçoivent des garde-fous explicites.</p></div><button type="button" onClick={() => onToast("Réglages de sécurité conservés pour cette session.")}>Enregistrer</button></header>
            <div className="admin-settings-groups">
              <section><header><IconShield /><div><h2>Responsables</h2><p>Renforcer les comptes qui peuvent modifier la communauté.</p></div></header><ProductToggle checked={twoFactor} onChange={setTwoFactor} label="Double authentification requise" detail="Pour les propriétaires et administrateurs." /><ProductToggle checked onChange={() => onToast("La réauthentification reste obligatoire.")} label="Réauthentification critique" detail="Transfert, export et suppression." /></section>
              <section><header><IconEye /><div><h2>Confidentialité</h2><p>Réduire l’exposition des membres et de leurs médias.</p></div></header><ProductToggle checked={mediaProtection} onChange={setMediaProtection} label="Neutraliser les métadonnées sensibles" detail="Avant publication des médias." /><ProductToggle checked onChange={() => onToast("La position exacte reste protégée.")} label="Position approximative par défaut" detail="Les coordonnées privées utilisent des règles séparées." /></section>
              <section><header><IconAlertTriangle /><div><h2>Filtres préventifs</h2><p>Assister les modérateurs sans automatiser les sanctions lourdes.</p></div></header><ProductToggle checked={linkFilter} onChange={setLinkFilter} label="Détecter les liens suspects" /><ProductToggle checked={slowMode} onChange={setSlowMode} label="Ralentissement en cas d’afflux" detail="Activation guidée et temporaire." /></section>
            </div>
          </section>
        )}

        {tab === "notifications" && (
          <section className="admin-panel">
            <header className="admin-heading"><div><span>Notifications</span><h1>Informer sans saturer</h1><p>Les mentions de masse et annonces importantes sont prévisualisées avant envoi.</p></div></header>
            <div className="admin-settings-groups">
              <section><header><IconBell /><div><h2>Recommandations par défaut</h2><p>Ce que reçoit un nouveau membre.</p></div></header><ProductToggle checked onChange={() => onToast("Les informations essentielles restent activées.")} label="Informations essentielles" /><ProductToggle checked={false} onChange={() => onToast("Les résumés peuvent être activés individuellement.")} label="Résumé quotidien" /><ProductToggle checked={false} onChange={() => onToast("Les réactions faibles restent regroupées.")} label="Réactions individuelles" /></section>
              <section className="admin-notification-preview"><small>Aperçu concret</small><h2>Avec ce réglage, un membre aurait reçu</h2><b>3 notifications</b><p>au cours des sept derniers jours : une réponse, un événement et une observation importante suivie.</p></section>
            </div>
          </section>
        )}

        {tab === "stats" && (
          <section className="admin-panel">
            <header className="admin-heading"><div><span>Statistiques</span><h1>Mesurer l’utilité, pas la dépendance</h1><p>Les indicateurs restent agrégés et n’établissent aucun classement public des membres.</p></div><select aria-label="Période"><option>30 derniers jours</option><option>7 derniers jours</option></select></header>
            <div className="admin-chart-grid">
              <section><small>Membres actifs</small><h2>186</h2><div className="admin-bars">{[34, 46, 42, 58, 62, 54, 71, 68, 76, 82, 79, 88].map((value, index) => <i key={index} style={{ height: `${value}%` }} />)}</div><p>Activité stable, principalement liée aux observations et événements.</p></section>
              <section><small>Qualité des observations</small><h2>78 %</h2><div className="admin-ring"><span>78</span></div><p>Part des observations complètes ou confirmées localement.</p></section>
              <section><small>Temps de modération médian</small><h2>2 h 14</h2><div className="admin-stat-lines"><span><i style={{ width: "86%" }} /><b>Urgente</b><small>18 min</small></span><span><i style={{ width: "64%" }} /><b>Élevée</b><small>1 h 06</small></span><span><i style={{ width: "38%" }} /><b>Normale</b><small>5 h 20</small></span></div></section>
              <section><small>Parcours d’accueil</small><h2>64 %</h2><div className="admin-funnel"><span>Page publique<em>100 %</em></span><span>Adhésion<em>82 %</em></span><span>Premier espace<em>71 %</em></span><span>Première action<em>64 %</em></span></div></section>
            </div>
          </section>
        )}
      </main>

      {createSpaceOpen && (
        <>
          <button className="weyra-sheet-backdrop" type="button" onClick={() => setCreateSpaceOpen(false)} aria-label="Fermer" />
          <aside className="weyra-sheet create-space-sheet" role="dialog" aria-modal="true" aria-label="Créer un espace">
            <header><div><span>Structure</span><h2>Créer un espace</h2></div><button type="button" onClick={() => setCreateSpaceOpen(false)} title="Fermer" aria-label="Fermer"><IconClose /></button></header>
            <div className="admin-form">
              <label><span>Type d’espace</span><select value={spaceType} onChange={(event) => setSpaceType(event.target.value as CommunitySpaceType)}>{SPACE_TYPES.map((type) => <option key={type} value={type}>{communitySpaceLabel(type)}</option>)}</select></label>
              <label><span>Nom</span><input value={spaceName} onChange={(event) => setSpaceName(event.target.value)} maxLength={48} placeholder="Ex. Entraide locale" /></label>
              <label><span>Description en une phrase</span><textarea value={spaceDescription} onChange={(event) => setSpaceDescription(event.target.value)} maxLength={120} /></label>
              <label><span>Section</span><select value={sectionId} onChange={(event) => setSectionId(event.target.value)}>{sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select></label>
              <label><span>Visibilité</span><select value={spaceVisibility} onChange={(event) => setSpaceVisibility(event.target.value as CommunitySpace["visibility"])}><option value="public">Public</option><option value="members">Membres</option><option value="role">Rôle</option><option value="private">Privé</option></select></label>
            </div>
            <footer><button type="button" onClick={() => setCreateSpaceOpen(false)}>Annuler</button><button type="button" onClick={submitSpace}>Créer avec les permissions recommandées</button></footer>
          </aside>
        </>
      )}
    </div>
  );
}
