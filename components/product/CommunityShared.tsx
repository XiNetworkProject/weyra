"use client";

import type { ComponentType, SVGProps } from "react";
import {
  IconBell,
  IconBook,
  IconCamera,
  IconCheck,
  IconClock,
  IconCloud,
  IconCompass,
  IconMessage,
  IconRadar,
  IconShield,
  IconStar,
  IconUsers,
} from "@/components/atlas/icons";
import type {
  Community,
  CommunityAccess,
  CommunitySpaceType,
} from "@/lib/product-domain";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const SPACE_ICONS: Record<CommunitySpaceType, IconComponent> = {
  discussion: IconMessage,
  observations: IconCloud,
  atlas: IconRadar,
  media: IconCamera,
  event: IconClock,
  announcement: IconBell,
  resource: IconBook,
};

const SPACE_LABELS: Record<CommunitySpaceType, string> = {
  discussion: "Discussion",
  observations: "Observations",
  atlas: "Atlas",
  media: "Médias",
  event: "Événement",
  announcement: "Annonce",
  resource: "Ressource",
};

export function CommunitySpaceIcon({
  type,
  className,
}: {
  type: CommunitySpaceType;
  className?: string;
}) {
  const Icon = SPACE_ICONS[type];
  return <Icon className={className} />;
}

export function communitySpaceLabel(type: CommunitySpaceType) {
  return SPACE_LABELS[type];
}

export function communityAccessLabel(access: CommunityAccess) {
  if (access === "request") return "Sur demande";
  if (access === "private") return "Privée";
  return "Publique";
}

export function CommunityMark({
  community,
  compact = false,
}: {
  community: Community;
  compact?: boolean;
}) {
  return (
    <span
      className={`community-mark${compact ? " is-compact" : ""}`}
      style={{ "--community-accent": community.accent } as never}
      aria-hidden="true"
    >
      {community.initials}
    </span>
  );
}

export function CommunityCard({
  community,
  joined,
  favorite,
  onOpen,
  onJoin,
  onFavorite,
}: {
  community: Community;
  joined: boolean;
  favorite: boolean;
  onOpen: () => void;
  onJoin: () => void;
  onFavorite: () => void;
}) {
  return (
    <article className="community-card" style={{ "--community-accent": community.accent } as never}>
      <button className="community-card__visual" type="button" onClick={onOpen}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={community.bannerUrl} alt="" />
        <span />
        <CommunityMark community={community} />
        <small>{communityAccessLabel(community.access)}</small>
      </button>
      <div className="community-card__content">
        <header>
          <div>
            <h3>{community.name}{community.verified && <IconCheck aria-label="Identité vérifiée" />}</h3>
            <p><IconCompass />{community.territory}</p>
          </div>
          <button
            className={favorite ? "is-active" : ""}
            type="button"
            onClick={onFavorite}
            title={favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
            aria-label={favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
            aria-pressed={favorite}
          >
            <IconStar />
          </button>
        </header>
        <p>{community.description}</p>
        <div className="community-card__themes">
          {community.themes.slice(0, 3).map((theme) => <span key={theme}>{theme}</span>)}
        </div>
        <footer>
          <span><IconUsers />{community.memberCount.toLocaleString("fr-FR")} membres</span>
          <span><i />{community.activeCount} actifs</span>
          <button className={joined ? "is-joined" : ""} type="button" onClick={onJoin}>
            {joined ? "Membre" : community.access === "request" ? "Demander" : community.access === "private" ? "Sur invitation" : "Rejoindre"}
          </button>
          <button type="button" onClick={onOpen}>Ouvrir</button>
        </footer>
      </div>
    </article>
  );
}

export function VisibilityBadge({
  visibility,
}: {
  visibility: "public" | "members" | "role" | "private";
}) {
  const label = visibility === "public"
    ? "Public"
    : visibility === "members"
      ? "Membres"
      : visibility === "role"
        ? "Rôle"
        : "Privé";
  return <span className={`community-visibility is-${visibility}`}><IconShield />{label}</span>;
}
