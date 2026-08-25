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
import { weatherCodeInfo } from "@/lib/weather";

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
  const { state } = useWeyraProduct();
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
  const weatherCondition = weather ? weatherCodeInfo(weather.weatherCode).label : "Mesure en cours";
  const leadPost = recentPosts[0];

  function openPost(post: (typeof recentPosts)[number]) {
    if (post.observationId) onOpenObservation(post.observationId);
    else onOpenMap(post.lat, post.lon);
  }

  return (
    <div className="weyra-page home-view field-home">
      <header className="field-home__heading">
        <div>
          <span><i />Maintenant · {location.name}</span>
          <h1>Le terrain raconte<br />ce que le ciel prépare.</h1>
          <p>Radar, mesures et regards humains réunis dans une même lecture locale.</p>
        </div>
        <div>
          <button type="button" onClick={() => onOpenMap(location.lat, location.lon)}><IconRadar />Voir la carte</button>
          <button className="is-primary" type="button" onClick={onCreateObservation}><IconPlus />Observer</button>
        </div>
      </header>

      <section className="field-home__live" aria-label={`Situation autour de ${location.name}`}>
        <button
          className="field-home__scene"
          type="button"
          onClick={() => onOpenMap(location.lat, location.lon)}
          style={{ "--field-scene": `url(${leadPost?.imageUrl ?? "/media/observations/arcus-champs.webp"})` } as never}
        >
          <span className="field-home__scene-shade" />
          <header>
            <span><i />Observation terrain · {leadPost?.place ?? location.name}</span>
            <small>{leadPost ? formatRelativeTime(leadPost.publishedAt) : "À l’instant"}</small>
          </header>
          <div className="field-home__scene-copy">
            <strong>{weatherLabel}</strong>
            <span>
              <b>{weatherCondition}</b>
              <small>Mesure locale · {location.name}</small>
            </span>
          </div>
          <footer>
            <span><IconWind /><b>{weather ? Math.round(weather.windSpeed) : "--"} km/h</b><small>Vent</small></span>
            <span><IconCloud /><b>{weather ? weather.humidity : "--"}%</b><small>Humidité</small></span>
            <span><IconCompass /><b>{observations.length}</b><small>Signaux proches</small></span>
            <em>Explorer sur la carte <IconChevronRight /></em>
          </footer>
        </button>

        <aside className="field-home__signals">
          <header>
            <div><span><i />En direct</span><h2>Signaux du terrain</h2></div>
            <button type="button" onClick={onCreateObservation} title="Ajouter une observation" aria-label="Ajouter une observation"><IconPlus /></button>
          </header>
          <div>
            {recentPosts.map((post) => {
              const author = authorById.get(post.authorId);
              const phenomenon = post.phenomena[0];
              const meta = CATEGORY_META[phenomenon];
              const PhenomenonIcon = meta.icon;
              return (
                <button key={post.id} type="button" onClick={() => openPost(post)}>
                  <span className="field-home__signal-media">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={post.imageUrl} alt="" />
                    <i><PhenomenonIcon /></i>
                  </span>
                  <span>
                    <small>{formatRelativeTime(post.publishedAt)} · {post.place}</small>
                    <b>{post.title}</b>
                    <em>{author?.displayName ?? "Communauté"} · observation terrain</em>
                  </span>
                  <IconChevronRight />
                </button>
              );
            })}
          </div>
          <footer>
            <button type="button" onClick={() => onNavigate("feed")}>Ouvrir le journal en direct<IconChevronRight /></button>
          </footer>
        </aside>
      </section>

      <section className="field-home__network" aria-label="État du réseau Weyra">
        <span><i />Réseau actif</span>
        <div className="field-home__network-avatars">
          {allAuthors.slice(0, 6).map((author) => (
            <i key={author.id} style={{ "--pulse-accent": author.accent } as never}>{author.initials}</i>
          ))}
        </div>
        <p><b>{SOCIAL_DEMO_STATS.activeObservations.toLocaleString("fr-FR")} observations</b> partagées aujourd’hui dans {SOCIAL_DEMO_STATS.communities} territoires.</p>
        <button type="button" onClick={() => onNavigate("explore")}>Voir où le réseau est actif<IconChevronRight /></button>
      </section>

      <div className="field-home__below">
        <section className="field-home__territories">
          <header><div><span>À portée de regard</span><h2>Territoires suivis</h2></div><button type="button" onClick={() => onNavigate("explore")}>Découvrir<IconChevronRight /></button></header>
          <div>
            {joinedCommunities.map((community) => (
              <button key={community.id} type="button" onClick={() => onOpenCommunity(community.id)}>
                <CommunityMark community={community} compact />
                <span><b>{community.name}</b><small>{community.territory}</small></span>
                <em><i />{community.activeCount} actifs</em>
              </button>
            ))}
          </div>
        </section>

        {event && (
          <section className="field-home__event">
            <button type="button" onClick={() => onOpenCommunity(event.communityId)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={event.imageUrl} alt="" />
              <span><IconClock />Prochain rendez-vous</span>
              <div>
                <small>{new Intl.DateTimeFormat("fr-FR", { weekday: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(event.startsAt))}</small>
                <h2>{event.title}</h2>
                <p>{event.summary}</p>
                <em>Voir l’événement<IconChevronRight /></em>
              </div>
            </button>
          </section>
        )}

        <section className="field-home__tools">
          <header><span>Aller plus loin</span><h2>Comprendre, suivre, échanger</h2></header>
          <div>
            <button type="button" onClick={() => onNavigate("learn")}><IconBook /><span><b>Comprendre</b><small>Décoder les phénomènes</small></span><IconChevronRight /></button>
            <button type="button" onClick={() => onNavigate("messages")}><IconMessage /><span><b>Échanger</b><small>Conversations en cours</small></span><IconChevronRight /></button>
            <button type="button" onClick={() => onNavigate("notifications")}><IconBell /><span><b>Ma veille</b><small>Uniquement les signaux utiles</small></span><IconChevronRight /></button>
          </div>
        </section>
      </div>
    </div>
  );
}
