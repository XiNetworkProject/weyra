"use client";

import {
  IconBell,
  IconBook,
  IconChevronRight,
  IconClock,
  IconCloud,
  IconCompass,
  IconMessage,
  IconPlus,
  IconRadar,
  IconUsers,
  IconWind,
} from "@/components/atlas/icons";
import { CATEGORY_META } from "@/components/atlas/constants";
import { CommunityMark } from "@/components/product/CommunityShared";
import { formatRelativeTime } from "@/components/product/ProductShared";
import { useWeyraProduct } from "@/components/product/WeyraProductProvider";
import { COMMUNITIES, COMMUNITY_EVENTS } from "@/lib/community-fixtures";
import { PRODUCT_AUTHORS, PRODUCT_POSTS } from "@/lib/product-fixtures";
import { SOCIAL_DEMO_STATS } from "@/lib/social-demo-data";
import type { WeyraSpace } from "@/lib/product-domain";
import type { LocationSelection, Observation, WeatherSnapshot } from "@/lib/types";

type HomeViewProps = {
  location: LocationSelection;
  weather: WeatherSnapshot | null;
  observations: Observation[];
  onNavigate: (space: WeyraSpace) => void;
  onOpenCommunity: (communityId: string) => void;
  onOpenMap: (lat: number, lon: number) => void;
  onOpenObservation: (observationId: string) => void;
  onCreateObservation: () => void;
};

export default function HomeView({
  location,
  weather,
  observations,
  onNavigate,
  onOpenCommunity,
  onOpenMap,
  onOpenObservation,
  onCreateObservation,
}: HomeViewProps) {
  const { backend, state } = useWeyraProduct();
  const joinedCommunities = [...state.createdCommunities, ...COMMUNITIES]
    .filter((community) => state.joinedCommunityIds.includes(community.id))
    .slice(0, 3);
  const event = COMMUNITY_EVENTS
    .filter((item) => state.joinedCommunityIds.includes(item.communityId))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0];
  const allAuthors = [...PRODUCT_AUTHORS, ...state.remoteAuthors];
  const authorById = new Map(allAuthors.map((author) => [author.id, author]));
  const recentPosts = [...state.remotePosts, ...PRODUCT_POSTS]
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, 3);
  const weatherLabel = weather ? `${Math.round(weather.temperature)}°` : "--°";

  return (
    <div className="weyra-page home-view">
      <header className="weyra-page-heading">
        <div>
          <span>Accueil personnel</span>
          <h1>Bonjour {state.profile.displayName}</h1>
          <p>Le ciel, les communautés et les informations utiles autour de {location.name}.</p>
        </div>
        <button className="weyra-primary-action" type="button" onClick={onCreateObservation}>
          <IconPlus />Publier une observation
        </button>
      </header>

      <div className="home-bento">
        {/* Météo locale — pièce maîtresse */}
        <section className="home-bento__tile home-bento__tile--weather" aria-label={`Situation autour de ${location.name}`}>
          <small><IconCloud />Situation locale · {location.name}</small>
          <div className="home-bento__weather-main">
            <strong>{weatherLabel}</strong>
            <div>
              <b>Averses irrégulières</b>
              <small>Radar contrasté sur la zone, signalements humains actifs au sud-est.</small>
            </div>
          </div>
          <div className="home-bento__weather-metrics">
            <span><IconWind /><b>{weather ? Math.round(weather.windSpeed) : "--"}</b><small>km/h de vent</small></span>
            <span><IconCompass /><b>{observations.length}</b><small>signaux actifs</small></span>
            <span><IconRadar /><b>{SOCIAL_DEMO_STATS.activeObservations.toLocaleString("fr-FR")}</b><small>observations réseau</small></span>
          </div>
          <div className="home-bento__actions">
            <button type="button" onClick={() => onOpenMap(location.lat, location.lon)}><IconRadar />Ouvrir Atlas</button>
            <button type="button" onClick={() => onNavigate("notifications")}><IconBell />Voir l’essentiel</button>
          </div>
        </section>

        {/* Pouls social */}
        <section className="home-bento__tile home-bento__tile--pulse" aria-label="Activité sociale">
          <small><IconUsers />{backend.status === "authenticated" ? "Réseau synchronisé" : "Mode démonstration sociale"}</small>
          <div className="home-bento__pulse-row">
            <div className="home-bento__pulse-avatars">
              {allAuthors.slice(0, 7).map((author) => (
                <i key={author.id} style={{ "--pulse-accent": author.accent } as never}>{author.initials}</i>
              ))}
            </div>
            <div>
              <b>{SOCIAL_DEMO_STATS.communityMessages.toLocaleString("fr-FR")} messages aujourd’hui</b>
              <small>{SOCIAL_DEMO_STATS.communities} communautés · {SOCIAL_DEMO_STATS.posts.toLocaleString("fr-FR")} publications</small>
            </div>
            <button type="button" onClick={() => onNavigate("feed")}>Ouvrir le flux<IconChevronRight /></button>
          </div>
        </section>

        {/* Événement à venir */}
        {event && (
          <section className="home-bento__tile home-bento__tile--event">
            <div className="home-bento__event-media">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={event.imageUrl} alt="" />
              <span><IconClock />À venir</span>
            </div>
            <div>
              <small>{new Intl.DateTimeFormat("fr-FR", { weekday: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(event.startsAt))}</small>
              <b>{event.title}</b>
              <p>{event.summary}</p>
              <button type="button" onClick={() => onOpenCommunity(event.communityId)}>Voir l’événement<IconChevronRight /></button>
            </div>
          </section>
        )}

        {/* Appel vers Atlas */}
        <button className="home-bento__tile home-bento__tile--atlas" type="button" onClick={() => onOpenMap(location.lat, location.lon)}>
          <IconRadar />
          <div>
            <b>Atlas en direct</b>
            <small>Radar OPERA réel et observations du terrain, centrés sur ta zone.</small>
          </div>
        </button>

        {/* Communautés suivies */}
        <section className="home-bento__tile home-bento__tile--communities">
          <small><IconUsers />Tes lieux vivants</small>
          <div className="home-bento__community-rows">
            {joinedCommunities.map((community) => (
              <button key={community.id} type="button" onClick={() => onOpenCommunity(community.id)}>
                <CommunityMark community={community} compact />
                <span><b>{community.name}</b><small>{community.territory}</small></span>
                <em><i />{community.activeCount} actifs</em>
              </button>
            ))}
            <button type="button" onClick={() => onNavigate("explore")}>
              <span className="home-bento__shortcut-icon"><IconCompass /></span>
              <span><b>Découvrir autour de toi</b><small>Communautés, événements et thèmes</small></span>
              <IconChevronRight />
            </button>
          </div>
        </section>

        {/* Dernières publications */}
        <section className="home-bento__tile home-bento__tile--feed">
          <small><IconMessage />Près de toi, récemment</small>
          <div className="home-bento__feed-list">
            {recentPosts.map((post) => {
              const author = authorById.get(post.authorId);
              const phenomenon = post.phenomena[0];
              const meta = CATEGORY_META[phenomenon];
              const PhenomenonIcon = meta.icon;
              return (
                <article key={post.id}>
                  <button className="home-bento__feed-media" type="button" onClick={() => onOpenMap(post.lat, post.lon)} aria-label={`Voir ${post.title} sur Atlas`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={post.imageUrl} alt="" />
                    <span><PhenomenonIcon /></span>
                  </button>
                  <div>
                    <small>{author?.displayName ?? "Communauté"} · {formatRelativeTime(post.publishedAt)} · {post.place}</small>
                    <h3>{post.title}</h3>
                    <p>{post.body}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* Raccourcis */}
        <section className="home-bento__tile home-bento__tile--shortcuts">
          <small><IconCompass />Raccourcis</small>
          <div className="home-bento__shortcut-rows">
            <button type="button" style={{ "--shortcut-color": "#f472b6" } as never} onClick={() => onNavigate("messages")}>
              <span><IconMessage /></span>
              <span><b>Messages</b><small>Conversations actives</small></span>
              <IconChevronRight />
            </button>
            <button type="button" style={{ "--shortcut-color": "#2dd4bf" } as never} onClick={() => onNavigate("learn")}>
              <span><IconBook /></span>
              <span><b>Apprendre</b><small>Fiches météo courtes</small></span>
              <IconChevronRight />
            </button>
            <button type="button" style={{ "--shortcut-color": "#fbbf24" } as never} onClick={() => onNavigate("communities")}>
              <span><IconUsers /></span>
              <span><b>Communautés</b><small>{SOCIAL_DEMO_STATS.communities} territoires</small></span>
              <IconChevronRight />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
