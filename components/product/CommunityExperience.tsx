"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  IconAlertTriangle,
  IconBell,
  IconBook,
  IconCamera,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconClock,
  IconCloud,
  IconCompass,
  IconDotsVertical,
  IconEye,
  IconHeart,
  IconMenu,
  IconMessage,
  IconPlus,
  IconRadar,
  IconSend,
  IconSettings,
  IconShare,
  IconShield,
  IconStar,
  IconUsers,
} from "@/components/atlas/icons";
import { CATEGORY_META } from "@/components/atlas/constants";
import CommunityAdminView from "@/components/product/CommunityAdminView";
import CommunityMapPreview from "@/components/product/CommunityMapPreview";
import {
  CommunityMark,
  CommunitySpaceIcon,
  communitySpaceLabel,
  VisibilityBadge,
  communityAccessLabel,
} from "@/components/product/CommunityShared";
import { formatRelativeTime } from "@/components/product/ProductShared";
import { useWeyraProduct } from "@/components/product/WeyraProductProvider";
import {
  COMMUNITIES,
  COMMUNITY_EVENTS,
  COMMUNITY_MEMBERS,
  COMMUNITY_MESSAGES,
  COMMUNITY_ROLES,
  COMMUNITY_SECTIONS,
  COMMUNITY_SPACES,
} from "@/lib/community-fixtures";
import { PRODUCT_POSTS } from "@/lib/product-fixtures";
import type {
  Community,
  CommunityEvent,
  CommunityMember,
  CommunityMessage,
  CommunitySection,
  CommunitySpace,
  CommunityNotificationMode,
} from "@/lib/product-domain";
import type { LocationSelection, Observation, WeatherSnapshot } from "@/lib/types";

type CommunityView = "home" | "space" | "atlas" | "observations" | "events" | "members" | "manage";

type CommunityExperienceProps = {
  selectedCommunityId: string;
  location: LocationSelection;
  weather: WeatherSnapshot | null;
  observations: Observation[];
  onSelectCommunity: (communityId: string) => void;
  onOpenMap: (lat: number, lon: number) => void;
  onOpenObservation: (observationId: string) => void;
  onCreateObservation: () => void;
  onToast: (message: string) => void;
};

function eventDate(event: CommunityEvent) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(event.startsAt));
}

function distanceKm(
  first: { lat: number; lon: number },
  second: { lat: number; lon: number },
) {
  const radians = (value: number) => value * Math.PI / 180;
  const deltaLat = radians(second.lat - first.lat);
  const deltaLon = radians(second.lon - first.lon);
  const lat1 = radians(first.lat);
  const lat2 = radians(second.lat);
  const value = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function communitySections(community: Community, createdSpaces: CommunitySpace[]) {
  const staticSections = COMMUNITY_SECTIONS.filter((section) => section.communityId === community.id);
  if (staticSections.length) return staticSections;
  const localSectionId = createdSpaces.find((space) => space.communityId === community.id)?.sectionId
    ?? `section-local-${community.id}`;
  return [{ id: localSectionId, communityId: community.id, name: "Essentiel", order: 1 }];
}

function CommunityContextPanel({
  community,
  event,
  members,
  weather,
  onOpenMap,
}: {
  community: Community;
  event: CommunityEvent | null;
  members: CommunityMember[];
  weather: WeatherSnapshot | null;
  onOpenMap: (lat: number, lon: number) => void;
}) {
  return (
    <aside className="community-context-panel">
      <section className="community-context-weather">
        <header><span><IconCloud /></span><div><small>Sur le territoire</small><h3>{community.territory}</h3></div></header>
        <div><b>{weather ? `${Math.round(weather.temperature)}°` : "--°"}</b><span><small>Vent</small><strong>{weather ? `${Math.round(weather.windSpeed)} km/h` : "--"}</strong></span></div>
        <button type="button" onClick={() => onOpenMap(community.center.lat, community.center.lon)}><IconRadar />Voir dans Atlas</button>
      </section>
      {event && (
        <section className="community-context-event">
          <small>Prochain événement</small>
          <h3>{event.title}</h3>
          <p><IconClock />{eventDate(event)}</p>
          <span>{event.participantCount} participants</span>
        </section>
      )}
      <section className="community-context-members">
        <header><div><small>Présence respectueuse</small><h3>Membres actifs</h3></div><span>{community.activeCount}</span></header>
        <div>
          {members.filter((member) => member.presence !== "offline").slice(0, 5).map((member) => (
            <span key={member.id} style={{ "--member-accent": member.accent } as never}>
              <i>{member.initials}<em className={`is-${member.presence}`} /></i>
              <b>{member.displayName}</b>
            </span>
          ))}
        </div>
        <p>Aucune position en temps réel n’est affichée.</p>
      </section>
      <section className="community-context-rules">
        <header><IconShield /><h3>Repères essentiels</h3></header>
        {community.rules.slice(0, 3).map((rule) => <span key={rule}><IconCheck />{rule}</span>)}
      </section>
    </aside>
  );
}

function CommunityHome({
  community,
  joined,
  notificationMode,
  observations,
  event,
  onJoin,
  onNotificationMode,
  onShare,
  onOpenMap,
  onOpenObservation,
  onOpenSpace,
  onOpenEvents,
}: {
  community: Community;
  joined: boolean;
  notificationMode: CommunityNotificationMode;
  observations: Observation[];
  event: CommunityEvent | null;
  onJoin: () => void;
  onNotificationMode: (mode: CommunityNotificationMode) => void;
  onShare: () => void;
  onOpenMap: () => void;
  onOpenObservation: (observationId: string) => void;
  onOpenSpace: (spaceId: string) => void;
  onOpenEvents: () => void;
}) {
  const recentObservation = observations[0] ?? null;
  const featuredPost = PRODUCT_POSTS.find((post) => distanceKm(community.center, post) <= 220) ?? PRODUCT_POSTS[0];
  return (
    <div className="community-home">
      <header className="community-hero" style={{ "--community-accent": community.accent } as never}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={community.bannerUrl} alt="" />
        <div className="community-hero__scrim" />
        <div className="community-hero__identity">
          <CommunityMark community={community} />
          <div>
            <span>{communityAccessLabel(community.access)} · {community.territory}</span>
            <h1>{community.name}{community.verified && <IconCheck aria-label="Identité vérifiée" />}</h1>
            <p>{community.description}</p>
          </div>
        </div>
        <div className="community-hero__actions">
          <button className={joined ? "is-joined" : ""} type="button" onClick={onJoin}>
            {joined ? <><IconCheck />Membre</> : community.access === "request" ? "Demander à rejoindre" : community.access === "private" ? "Sur invitation" : "Rejoindre"}
          </button>
          <label title="Notifications">
            <IconBell />
            <select value={notificationMode} onChange={(eventValue) => onNotificationMode(eventValue.target.value as CommunityNotificationMode)} aria-label="Notifications de la communauté">
              <option value="all">Tout suivre</option>
              <option value="essential">Essentiel uniquement</option>
              <option value="custom">Personnalisé</option>
              <option value="silent">Silencieux</option>
            </select>
            <IconChevronDown />
          </label>
          <button type="button" onClick={onShare} title="Partager" aria-label="Partager"><IconShare /></button>
        </div>
      </header>

      <div className="community-home__body">
        <section className="community-summary-band">
          <span><small>Membres</small><b>{community.memberCount.toLocaleString("fr-FR")}</b><em><i />{community.activeCount} actifs</em></span>
          <span><small>Observations récentes</small><b>{observations.length}</b><em>sur le territoire</em></span>
          <span><small>Prochain rendez-vous</small><b>{event ? eventDate(event).split(" à ")[0] : "Aucun"}</b><em>{event?.title ?? "Calendrier calme"}</em></span>
          <button type="button" onClick={onOpenMap}><IconRadar /><span><b>Atlas communautaire</b><small>Ouvrir la zone et les observations</small></span><IconChevronRight /></button>
        </section>

        {!joined && (
          <section className="community-before-join">
            <div><span><IconEye /></span><h2>Explorez avant de rejoindre</h2><p>La page, les règles et les contenus publics restent visibles. Les espaces membres sont clairement identifiés.</p></div>
            <button type="button" onClick={onJoin}>{community.access === "request" ? "Demander l’accès" : "Rejoindre la communauté"}</button>
          </section>
        )}

        <section className="community-block">
          <header><div><span>À la une</span><h2>Ce qui compte maintenant</h2></div><small>3 éléments maximum</small></header>
          <div className="community-featured">
            {recentObservation && (
              <button type="button" onClick={() => onOpenObservation(recentObservation.id)}>
                <span className="community-featured__icon is-observation"><IconCloud /></span>
                <small>Observation · {formatRelativeTime(recentObservation.createdAt)}</small>
                <h3>{CATEGORY_META[recentObservation.category].label} près de {recentObservation.place ?? community.territory}</h3>
                <p>{recentObservation.details ?? "Signal terrain récent relié à Atlas."}</p>
                <em>Voir le détail<IconChevronRight /></em>
              </button>
            )}
            {event && (
              <button type="button" onClick={onOpenEvents}>
                <span className="community-featured__icon is-event"><IconClock /></span>
                <small>Événement · {eventDate(event)}</small>
                <h3>{event.title}</h3>
                <p>{event.summary}</p>
                <em>{event.participantCount} participants<IconChevronRight /></em>
              </button>
            )}
            <button type="button" onClick={() => onOpenSpace("space-nord-resources")}>
              <span className="community-featured__icon is-resource"><IconShield /></span>
              <small>Ressource maintenue</small>
              <h3>Observer un orage sans s’exposer</h3>
              <p>Repères de sécurité et distinction entre signal communautaire et information officielle.</p>
              <em>Lire la ressource<IconChevronRight /></em>
            </button>
          </div>
        </section>

        <section className="community-start-here">
          <div>
            <span>Commencer ici</span>
            <h2>Trois portes d’entrée, pas une liste infinie</h2>
            <p>Découvrez le territoire, lisez les repères essentiels puis choisissez votre premier espace.</p>
          </div>
          <div>
            <button type="button" onClick={onOpenMap}><span><IconRadar /></span><b>Voir Atlas</b><small>Comprendre la zone</small><IconChevronRight /></button>
            <button type="button" onClick={() => onOpenSpace("space-nord-start")}><span><IconBook /></span><b>Lire l’essentiel</b><small>Règles et repères</small><IconChevronRight /></button>
            <button type="button" onClick={() => onOpenSpace("space-nord-general")}><span><IconMessage /></span><b>Se présenter</b><small>Discussion locale</small><IconChevronRight /></button>
          </div>
        </section>

        <section className="community-block">
          <header><div><span>Activité récente</span><h2>Plus que les messages les plus bavards</h2></div></header>
          <div className="community-activity">
            <article>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={featuredPost.imageUrl} alt="" />
              <div><small>Analyse locale · {formatRelativeTime(featuredPost.publishedAt)}</small><h3>{featuredPost.title}</h3><p>{featuredPost.body}</p><button type="button" onClick={onOpenMap}><IconCompass />{featuredPost.place}</button></div>
            </article>
            <article className="is-text">
              <span><IconMessage /></span>
              <div><small>Discussion · il y a 18 min</small><h3>Pourquoi les averses sont-elles si localisées ?</h3><p>Une explication courte a été ajoutée au fil Comprendre la situation.</p><button type="button" onClick={() => onOpenSpace("space-nord-forecast")}>Ouvrir le fil</button></div>
            </article>
            <article className="is-text">
              <span><IconBook /></span>
              <div><small>Ressource · révisée hier</small><h3>Guide de confirmation locale</h3><p>La différence entre « je confirme », « je ne vois rien » et « impossible à vérifier ».</p><button type="button" onClick={() => onOpenSpace("space-nord-resources")}>Consulter</button></div>
            </article>
          </div>
        </section>
      </div>
    </div>
  );
}

function CommunitySpaceView({
  community,
  space,
  joined,
  observations,
  onOpenMap,
  onOpenObservation,
  onCreateObservation,
  onToast,
}: {
  community: Community;
  space: CommunitySpace;
  joined: boolean;
  observations: Observation[];
  onOpenMap: () => void;
  onOpenObservation: (observationId: string) => void;
  onCreateObservation: () => void;
  onToast: (message: string) => void;
}) {
  const { state, addCommunityMessage, toggleSpaceFollow } = useWeyraProduct();
  const [draft, setDraft] = useState("");
  const [replyToId, setReplyToId] = useState<string | undefined>();
  const [messageLimit, setMessageLimit] = useState(30);
  const [contentLimit, setContentLimit] = useState(12);
  const followed = state.followedSpaceIds.includes(space.id);
  const messages = useMemo(
    () => [...COMMUNITY_MESSAGES, ...state.communityMessages]
      .filter((message) => message.communityId === community.id && message.spaceId === space.id)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [community.id, space.id, state.communityMessages],
  );
  const visibleMessages = messages.slice(-messageLimit);
  const publicationMessages = messages.slice(-contentLimit).reverse();
  const allMediaPosts = useMemo(
    () => PRODUCT_POSTS.filter((post) => post.imageUrl && distanceKm(community.center, post) <= 220),
    [community.center],
  );
  const mediaPosts = allMediaPosts.slice(0, contentLimit);

  useEffect(() => {
    setMessageLimit(30);
    setContentLimit(12);
    setReplyToId(undefined);
  }, [space.id]);

  function submitMessage(event: FormEvent) {
    event.preventDefault();
    if (!joined) {
      onToast("Rejoins la communauté pour contribuer dans cet espace.");
      return;
    }
    if (!addCommunityMessage(space.id, community.id, draft, replyToId)) return;
    setDraft("");
    setReplyToId(undefined);
  }

  const header = (
    <header className="community-space-header">
      <span><CommunitySpaceIcon type={space.type} /></span>
      <div><small>{communitySpaceLabel(space.type)} · {community.name}</small><h1>{space.name}</h1><p>{space.description}</p></div>
      <VisibilityBadge visibility={space.visibility} />
      <button className={followed ? "is-active" : ""} type="button" onClick={() => toggleSpaceFollow(space.id)}><IconBell />{followed ? "Suivi" : "Suivre"}</button>
      <button type="button" title="Options" aria-label="Options"><IconDotsVertical /></button>
    </header>
  );

  if (space.type === "atlas") {
    return (
      <div className="community-space community-space--atlas">
        {header}
        <div className="community-atlas">
          <CommunityMapPreview community={community} observations={observations} onOpenAtlas={onOpenMap} />
          <div className="community-atlas__overlay">
            <span><i />Atlas communautaire</span>
            <h2>{community.territory}</h2>
            <p>{observations.length} observations publiques actives autour de la zone. Les données officielles et communautaires restent séparées.</p>
            <button type="button" onClick={onOpenMap}><IconRadar />Ouvrir dans Atlas</button>
          </div>
          <aside>
            <small>Couches de cette vue</small>
            <span className="is-active"><IconCloud /><b>Observations</b><em>{observations.length}</em></span>
            <span><IconUsers /><b>Territoire communautaire</b></span>
            <span><IconClock /><b>Événements</b></span>
          </aside>
        </div>
      </div>
    );
  }

  if (space.type === "observations") {
    return (
      <div className="community-space">
        {header}
        <div className="community-observation-toolbar">
          <div><button className="is-active" type="button">Récentes</button><button type="button">Confirmées</button><button type="button">Archives</button></div>
          <button type="button" onClick={onCreateObservation}><IconPlus />Publier une observation</button>
        </div>
        <div className="community-observation-grid">
          {observations.slice(0, contentLimit).map((observation) => {
            const meta = CATEGORY_META[observation.category];
            const PhenomenonIcon = meta.icon;
            return (
              <article key={observation.id}>
                {observation.imageUrl ? (
                  <button type="button" onClick={() => onOpenObservation(observation.id)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={observation.imageUrl} alt="" />
                    <span><PhenomenonIcon />{meta.shortLabel}</span>
                  </button>
                ) : <span className="community-observation-grid__placeholder"><PhenomenonIcon /></span>}
                <div>
                  <small>{formatRelativeTime(observation.createdAt)} · {observation.place ?? community.territory}</small>
                  <h2>{meta.label}</h2>
                  <p>{observation.details ?? "Observation terrain récente."}</p>
                  <footer><span><IconHeart />{observation.likes}</span><button type="button" onClick={() => onOpenObservation(observation.id)}>Ouvrir</button></footer>
                </div>
              </article>
            );
          })}
        </div>
        {contentLimit < observations.length && (
          <button className="social-load-more" type="button" onClick={() => setContentLimit((count) => count + 12)}>
            Afficher 12 observations de plus
            <small>{(observations.length - contentLimit).toLocaleString("fr-FR")} restantes sur ce territoire</small>
          </button>
        )}
      </div>
    );
  }

  if (space.type === "media") {
    return (
      <div className="community-space">
        {header}
        <div className="community-media-toolbar"><span>Les crédits et lieux approximatifs restent visibles.</span><button type="button" onClick={() => onToast("L’import média local sera relié à Cloudinary dans une phase ultérieure.")}><IconPlus />Ajouter un média</button></div>
        <div className="community-media-grid">
          {mediaPosts.map((post, index) => (
            <button key={post.id} className={index === 0 ? "is-featured" : ""} type="button" onClick={() => onOpenMap()}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={post.imageUrl} alt="" />
              <span><small>{post.place}</small><b>{post.title}</b><em>{post.phenomena.join(" · ")}</em></span>
            </button>
          ))}
        </div>
        {contentLimit < allMediaPosts.length && (
          <button className="social-load-more" type="button" onClick={() => setContentLimit((count) => count + 12)}>
            Afficher davantage de médias
            <small>{(allMediaPosts.length - contentLimit).toLocaleString("fr-FR")} disponibles</small>
          </button>
        )}
      </div>
    );
  }

  if (space.type === "event") {
    const events = COMMUNITY_EVENTS.filter((event) => event.communityId === community.id);
    return (
      <div className="community-space">
        {header}
        <div className="community-events">
          {events.map((event) => (
            <article key={event.id}>
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={event.imageUrl} alt="" />
                <span>{event.format === "online" ? "En ligne" : event.format === "hybrid" ? "Hybride" : "Sur place"}</span>
              </div>
              <section><small>{eventDate(event)}</small><h2>{event.title}</h2><p>{event.summary}</p><span><IconCompass />{event.place}</span><footer><em><IconUsers />{event.participantCount} participent</em><button type="button" onClick={() => onToast("Participation enregistrée pour cette session.")}>Participer</button></footer></section>
            </article>
          ))}
          {!events.length && <div className="community-space-empty"><IconClock /><h2>Aucun événement programmé</h2><p>Les responsables peuvent préparer une première rencontre depuis la gestion.</p></div>}
        </div>
      </div>
    );
  }

  if (space.type === "announcement" || space.type === "resource") {
    return (
      <div className="community-space">
        {header}
        <div className="community-publications">
          {publicationMessages.map((message) => (
            <article key={message.id}>
              <header><span>{message.authorInitials}</span><div><b>{message.authorName}</b><small>{formatRelativeTime(message.createdAt)} · édition tracée</small></div></header>
              <h2>{space.type === "announcement" ? "Information de la communauté" : "Ressource maintenue"}</h2>
              <p>{message.body}</p>
              <footer><button type="button" onClick={() => onToast("Contenu marqué comme utile.")}><IconCheck />Utile</button><button type="button"><IconShare />Partager</button><small>{space.type === "resource" ? "Révisée récemment" : "Diffusion contrôlée"}</small></footer>
            </article>
          ))}
          {contentLimit < messages.length && (
            <button className="social-load-more" type="button" onClick={() => setContentLimit((count) => count + 12)}>
              Afficher les publications précédentes
              <small>{(messages.length - contentLimit).toLocaleString("fr-FR")} restantes</small>
            </button>
          )}
          {!messages.length && (
            <article>
              <header><span>{community.initials}</span><div><b>{community.name}</b><small>Contenu de démonstration</small></div></header>
              <h2>{space.type === "resource" ? "Repères essentiels" : "Bienvenue dans cet espace"}</h2>
              <p>{community.rules.join(" ")}</p>
            </article>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="community-space community-space--discussion">
      {header}
      <div className="community-thread">
        <main>
          <div className="community-thread__intro"><span><IconMessage /></span><h2>{space.name}</h2><p>{space.description}</p></div>
          {messageLimit < messages.length && (
            <button className="community-thread__older" type="button" onClick={() => setMessageLimit((count) => count + 30)}>
              Afficher 30 messages précédents
              <small>{(messages.length - messageLimit).toLocaleString("fr-FR")} plus anciens</small>
            </button>
          )}
          {visibleMessages.map((message) => (
            <article key={message.id}>
              <span className="community-message-avatar">{message.authorInitials}</span>
              <div>
                <header><b>{message.authorName}</b><small>{formatRelativeTime(message.createdAt)}</small></header>
                {message.replyToId && <em>Réponse à un message précédent</em>}
                <p>{message.body}</p>
                <footer>
                  {Object.entries(message.reactions ?? {}).map(([reaction, count]) => <button key={reaction} type="button" onClick={() => onToast(`${reaction} ajouté.`)}>{reaction} <span>{count}</span></button>)}
                  <button type="button" onClick={() => setReplyToId(message.id)}>Répondre</button>
                </footer>
              </div>
            </article>
          ))}
        </main>
        <aside>
          <header><small>Fil lié</small><h3>Précisions sur les averses locales</h3></header>
          <p>Un fil approfondit un sujet sans saturer l’espace principal. Il peut être marqué comme résolu.</p>
          <span><IconUsers />12 participants</span>
          <button type="button" onClick={() => onToast("Le fil est marqué comme suivi.")}>Suivre le fil</button>
        </aside>
      </div>
      <form className="community-composer" onSubmit={submitMessage}>
        {replyToId && <div><span>Réponse à un message</span><button type="button" onClick={() => setReplyToId(undefined)}>Annuler</button></div>}
        <span>{state.profile.initials}</span>
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={1500} rows={1} placeholder={joined ? `Écrire dans ${space.name}` : "Rejoins la communauté pour contribuer"} />
        <button type="button" onClick={() => onToast("Ajoute un média, une mention ou une localisation approximative.")} title="Plus d’options" aria-label="Plus d’options"><IconPlus /></button>
        <button type="submit" title="Envoyer" aria-label="Envoyer"><IconSend /></button>
        <small>Visible par : {space.visibility === "public" ? "tout le monde" : space.visibility === "members" ? "les membres" : "un rôle autorisé"}</small>
      </form>
    </div>
  );
}

function CommunityMembersView({
  community,
  members,
}: {
  community: Community;
  members: CommunityMember[];
}) {
  const roleById = new Map(COMMUNITY_ROLES.filter((role) => role.communityId === community.id).map((role) => [role.id, role]));
  return (
    <div className="community-members-view">
      <header className="community-space-header"><span><IconUsers /></span><div><small>{community.name}</small><h1>Membres</h1><p>Responsabilités visibles lorsqu’elles sont utiles, sans classement social global.</p></div></header>
      <div className="community-member-directory">
        {members.map((member) => {
          const role = roleById.get(member.roleId);
          return (
            <article key={member.id}>
              <span style={{ "--member-accent": member.accent } as never}>{member.initials}<i className={`is-${member.presence}`} /></span>
              <div><h2>{member.displayName}</h2><p>{member.handle}</p></div>
              {role && <em style={{ "--role-color": role.color } as never}><IconShield />{role.name}</em>}
              <small>{member.contributionCount} contributions</small>
              <button type="button" title="Voir le profil" aria-label={`Voir le profil de ${member.displayName}`}><IconChevronRight /></button>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export default function CommunityExperience({
  selectedCommunityId,
  location,
  weather,
  observations,
  onSelectCommunity,
  onOpenMap,
  onOpenObservation,
  onCreateObservation,
  onToast,
}: CommunityExperienceProps) {
  const {
    state,
    toggleCommunityMembership,
    toggleCommunityFavorite,
    setCommunityNotificationMode,
  } = useWeyraProduct();
  const [view, setView] = useState<CommunityView>("home");
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const allCommunities = useMemo(() => [...state.createdCommunities, ...COMMUNITIES], [state.createdCommunities]);
  const community = allCommunities.find((item) => item.id === selectedCommunityId) ?? allCommunities[0];
  const sections = useMemo(
    () => communitySections(community, state.createdCommunitySpaces),
    [community, state.createdCommunitySpaces],
  );
  const spaces = useMemo(
    () => [...COMMUNITY_SPACES, ...state.createdCommunitySpaces].filter((space) => space.communityId === community.id),
    [community.id, state.createdCommunitySpaces],
  );
  const activeSpace = spaces.find((space) => space.id === activeSpaceId) ?? null;
  const events = COMMUNITY_EVENTS.filter((event) => event.communityId === community.id);
  const event = events[0] ?? null;
  const members = COMMUNITY_MEMBERS.filter((member) => member.communityId === community.id);
  const communityObservations = useMemo(
    () => observations
      .filter((observation) => distanceKm(community.center, observation) <= 220)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [community.center, observations],
  );
  const joined = state.joinedCommunityIds.includes(community.id);
  const favorite = state.favoriteCommunityIds.includes(community.id);
  const notificationMode = state.communityNotificationModes[community.id] ?? "essential";

  useEffect(() => {
    setView("home");
    setActiveSpaceId(null);
    setMobileNavOpen(false);
  }, [community.id]);

  function openSpace(spaceId: string) {
    const nextSpace = spaces.find((space) => space.id === spaceId);
    if (!nextSpace) {
      onToast("Cet espace n’est pas disponible dans cette communauté.");
      return;
    }
    setActiveSpaceId(spaceId);
    setView("space");
    setMobileNavOpen(false);
  }

  function openAtlas() {
    const atlasSpace = spaces.find((space) => space.type === "atlas");
    if (atlasSpace) {
      setActiveSpaceId(atlasSpace.id);
      setView("space");
      return;
    }
    setView("atlas");
  }

  function openObservations() {
    const observationSpace = spaces.find((space) => space.type === "observations");
    if (observationSpace) openSpace(observationSpace.id);
    else setView("observations");
  }

  async function shareCommunity() {
    const text = `${community.name} · ${community.territory} sur Weyra`;
    try {
      if (navigator.share) await navigator.share({ title: community.name, text, url: window.location.href });
      else {
        await navigator.clipboard.writeText(`${text} ${window.location.href}`);
        onToast("Lien de la communauté copié.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      onToast("Le partage n’est pas disponible.");
    }
  }

  if (view === "manage") {
    return (
      <CommunityAdminView
        community={community}
        sections={sections}
        spaces={spaces}
        onBack={() => setView("home")}
        onToast={onToast}
      />
    );
  }

  return (
    <div className="community-experience">
      <aside className={`community-context-nav${mobileNavOpen ? " is-open" : ""}`}>
        <header>
          <CommunityMark community={community} compact />
          <label>
            <span><b>{community.name}</b><small>{community.territory}</small></span>
            <select value={community.id} onChange={(eventValue) => onSelectCommunity(eventValue.target.value)} aria-label="Changer de communauté">
              {allCommunities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <IconChevronDown />
          </label>
          <button type="button" onClick={() => setMobileNavOpen(false)} title="Fermer" aria-label="Fermer"><IconMenu /></button>
        </header>
        <nav className="community-context-nav__essential">
          <button className={view === "home" ? "is-active" : ""} type="button" onClick={() => { setView("home"); setMobileNavOpen(false); }}><IconStar /><span><b>Accueil</b><small>À la une et raccourcis</small></span></button>
          <button className={view === "atlas" || activeSpace?.type === "atlas" ? "is-active" : ""} type="button" onClick={openAtlas}><IconRadar /><span><b>Atlas</b><small>Territoire et signaux</small></span></button>
          <button className={view === "observations" || activeSpace?.type === "observations" ? "is-active" : ""} type="button" onClick={openObservations}><IconCloud /><span><b>Observations</b><small>{communityObservations.length} récentes</small></span></button>
          <button className={view === "events" || activeSpace?.type === "event" ? "is-active" : ""} type="button" onClick={() => setView("events")}><IconClock /><span><b>Événements</b><small>{events.length || "Aucun"} à venir</small></span></button>
        </nav>
        <div className="community-context-nav__sections">
          {sections.sort((a, b) => a.order - b.order).map((section) => (
            <section key={section.id}>
              <header><b>{section.name}</b><button type="button" title="Réduire" aria-label={`Réduire ${section.name}`}><IconChevronDown /></button></header>
              {spaces.filter((space) => space.sectionId === section.id).map((space) => (
                <button key={space.id} className={activeSpace?.id === space.id ? "is-active" : ""} type="button" onClick={() => openSpace(space.id)}>
                  <CommunitySpaceIcon type={space.type} />
                  <span><b>{space.name}</b><small>{space.description}</small></span>
                  {space.live && <em />}
                  {space.unreadCount > 0 && <i>{space.unreadCount}</i>}
                </button>
              ))}
            </section>
          ))}
          {!spaces.length && <p><IconBook />Cette communauté locale est prête à recevoir son premier espace.</p>}
        </div>
        <footer>
          <button className={view === "members" ? "is-active" : ""} type="button" onClick={() => setView("members")}><IconUsers />Membres <span>{community.memberCount.toLocaleString("fr-FR")}</span></button>
          <button type="button" onClick={() => setView("manage")}><IconSettings />Gérer la communauté</button>
        </footer>
      </aside>

      <main className="community-main">
        <header className="community-mobile-header">
          <button type="button" onClick={() => setMobileNavOpen(true)} title="Espaces" aria-label="Ouvrir les espaces"><IconMenu /></button>
          <CommunityMark community={community} compact />
          <span><b>{community.name}</b><small>{activeSpace?.name ?? "Accueil"}</small></span>
          <button type="button" title="Options" aria-label="Options"><IconDotsVertical /></button>
        </header>
        <nav className="community-mobile-tabs">
          <button className={view === "home" ? "is-active" : ""} type="button" onClick={() => setView("home")}>Accueil</button>
          <button className={view === "space" ? "is-active" : ""} type="button" onClick={() => activeSpaceId ? setView("space") : openSpace(spaces[0]?.id ?? "")}>Espaces</button>
          <button className={activeSpace?.type === "atlas" || view === "atlas" ? "is-active" : ""} type="button" onClick={openAtlas}>Atlas</button>
          <button className={view === "members" || view === "events" ? "is-active" : ""} type="button" onClick={() => setView("members")}>Plus</button>
        </nav>

        {view === "home" && (
          <CommunityHome
            community={community}
            joined={joined}
            notificationMode={notificationMode}
            observations={communityObservations}
            event={event}
            onJoin={() => {
              if (community.access === "private" && !joined) {
                onToast("Cette communauté fonctionne sur invitation.");
                return;
              }
              toggleCommunityMembership(community.id);
              onToast(community.access === "request" && !joined ? "Demande d’adhésion enregistrée localement." : "Adhésion mise à jour.");
            }}
            onNotificationMode={(mode) => {
              setCommunityNotificationMode(community.id, mode);
              onToast("Préférence de notification enregistrée.");
            }}
            onShare={() => void shareCommunity()}
            onOpenMap={openAtlas}
            onOpenObservation={onOpenObservation}
            onOpenSpace={openSpace}
            onOpenEvents={() => setView("events")}
          />
        )}
        {view === "space" && activeSpace && (
          <CommunitySpaceView
            community={community}
            space={activeSpace}
            joined={joined}
            observations={communityObservations}
            onOpenMap={() => onOpenMap(community.center.lat, community.center.lon)}
            onOpenObservation={onOpenObservation}
            onCreateObservation={onCreateObservation}
            onToast={onToast}
          />
        )}
        {view === "atlas" && (
          <div className="community-space community-space--atlas">
            <header className="community-space-header"><span><IconRadar /></span><div><small>{community.name}</small><h1>Atlas communautaire</h1><p>Une vue territoriale reliée aux espaces et observations.</p></div></header>
            <div className="community-atlas">
              <CommunityMapPreview community={community} observations={communityObservations} onOpenAtlas={() => onOpenMap(community.center.lat, community.center.lon)} />
              <div className="community-atlas__overlay"><span><i />Zone communautaire</span><h2>{community.territory}</h2><p>{communityObservations.length} observations actives affichées dans cet aperçu.</p><button type="button" onClick={() => onOpenMap(community.center.lat, community.center.lon)}><IconRadar />Ouvrir Atlas</button></div>
            </div>
          </div>
        )}
        {view === "observations" && (
          <div className="community-space">
            <header className="community-space-header"><span><IconCloud /></span><div><small>{community.name}</small><h1>Observations</h1><p>Signaux humains liés à un lieu, un moment et un phénomène.</p></div><button type="button" onClick={onCreateObservation}><IconPlus />Publier</button></header>
            <div className="community-space-empty"><IconCloud /><h2>Aucun espace d’observations configuré</h2><p>La création d’un espace typé active la présentation adaptée.</p></div>
          </div>
        )}
        {view === "events" && (
          <div className="community-space">
            <header className="community-space-header"><span><IconClock /></span><div><small>{community.name}</small><h1>Événements</h1><p>Préparer, vivre puis conserver une mémoire utile.</p></div></header>
            <div className="community-events">
              {events.map((item) => (
                <article key={item.id}><div>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={item.imageUrl} alt="" /><span>{item.format}</span></div><section><small>{eventDate(item)}</small><h2>{item.title}</h2><p>{item.summary}</p><span><IconCompass />{item.place}</span><footer><em><IconUsers />{item.participantCount} participent</em><button type="button" onClick={() => onToast("Participation enregistrée pour cette session.")}>Participer</button></footer></section></article>
              ))}
              {!events.length && <div className="community-space-empty"><IconClock /><h2>Aucun événement à venir</h2><p>Les événements apparaîtront ici avec leur programme, leur carte et leur fil.</p></div>}
            </div>
          </div>
        )}
        {view === "members" && <CommunityMembersView community={community} members={members} />}
      </main>

      {(view === "home" || view === "space") && (
        <CommunityContextPanel
          community={community}
          event={event}
          members={members}
          weather={weather}
          onOpenMap={onOpenMap}
        />
      )}

      {mobileNavOpen && <button className="community-nav-backdrop" type="button" onClick={() => setMobileNavOpen(false)} aria-label="Fermer les espaces" />}
      <button className="community-favorite-fab" type="button" onClick={() => toggleCommunityFavorite(community.id)} title={favorite ? "Retirer des favoris" : "Ajouter aux favoris"} aria-label={favorite ? "Retirer des favoris" : "Ajouter aux favoris"}><IconStar /></button>
    </div>
  );
}
