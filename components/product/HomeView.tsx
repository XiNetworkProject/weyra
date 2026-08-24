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
  IconShare,
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
    .slice(0, 4);
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

      <section className="home-situation" aria-label={`Situation autour de ${location.name}`}>
        <div className="home-situation__copy">
          <span><i />Situation locale</span>
          <h2>Averses irrégulières, observations actives au sud-est</h2>
          <p>Le radar reste contrasté sur la zone. Les signalements humains sont affichés séparément et conservent leur heure.</p>
          <div>
            <button type="button" onClick={() => onOpenMap(location.lat, location.lon)}><IconRadar />Ouvrir Atlas</button>
            <button type="button" onClick={() => onNavigate("notifications")}><IconBell />Voir l’essentiel</button>
          </div>
        </div>
        <div className="home-situation__metrics">
          <span><IconCloud /><b>{weatherLabel}</b><small>{location.name}</small></span>
          <span><IconWind /><b>{weather ? Math.round(weather.windSpeed) : "--"}</b><small>km/h</small></span>
          <span><IconCompass /><b>{observations.length}</b><small>signaux actifs</small></span>
        </div>
      </section>

      <section className="home-social-pulse" aria-label="Activité sociale de démonstration">
        <header>
          <div>
            <span><i />{backend.status === "authenticated" ? "Réseau Weyra synchronisé" : "Mode démonstration sociale"}</span>
            <h2>Weyra est vivant autour de vous</h2>
          </div>
          <small>{state.remotePosts.length ? `${state.remotePosts.length} publication(s) Supabase · démonstration enrichie` : "Données fictives locales · aucune identité réelle"}</small>
        </header>
        <div className="home-social-pulse__metrics">
          <span><IconCloud /><b>{SOCIAL_DEMO_STATS.activeObservations.toLocaleString("fr-FR")}</b><small>observations actives</small></span>
          <span><IconMessage /><b>{SOCIAL_DEMO_STATS.posts.toLocaleString("fr-FR")}</b><small>publications récentes</small></span>
          <span><IconUsers /><b>{SOCIAL_DEMO_STATS.authors.toLocaleString("fr-FR")}</b><small>profils contributeurs</small></span>
          <span><IconShare /><b>{SOCIAL_DEMO_STATS.shares.toLocaleString("fr-FR")}</b><small>partages cumulés</small></span>
        </div>
        <aside>
          <div>{allAuthors.slice(0, 9).map((author) => <i key={author.id} style={{ "--pulse-accent": author.accent } as never}>{author.initials}</i>)}</div>
          <span><b>{SOCIAL_DEMO_STATS.communityMessages.toLocaleString("fr-FR")} messages</b><small>dans {SOCIAL_DEMO_STATS.communities} communautés de démonstration</small></span>
          <button type="button" onClick={() => onNavigate("feed")}>Ouvrir le flux<IconChevronRight /></button>
        </aside>
      </section>

      <div className="home-layout">
        <div className="home-layout__main">
          <section className="home-section">
            <header>
              <div><span>Vos lieux vivants</span><h2>Communautés suivies</h2></div>
              <button type="button" onClick={() => onNavigate("communities")}>Tout voir<IconChevronRight /></button>
            </header>
            <div className="home-community-strip">
              {joinedCommunities.map((community) => (
                <button key={community.id} type="button" onClick={() => onOpenCommunity(community.id)}>
                  <CommunityMark community={community} />
                  <span>
                    <b>{community.name}</b>
                    <small>{community.territory}</small>
                  </span>
                  <em><i />{community.activeCount}</em>
                  <IconChevronRight />
                </button>
              ))}
              <button className="is-discover" type="button" onClick={() => onNavigate("explore")}>
                <span><IconCompass /></span>
                <b>Découvrir autour de vous</b>
                <small>Communautés, événements et thèmes</small>
              </button>
            </div>
          </section>

          <section className="home-section">
            <header>
              <div><span>Activité utile</span><h2>Près de vous</h2></div>
              <button type="button" onClick={() => onNavigate("feed")}>Voir le flux<IconChevronRight /></button>
            </header>
            <div className="home-feed">
              {recentPosts.map((post) => {
                const author = authorById.get(post.authorId);
                const phenomenon = post.phenomena[0];
                const meta = CATEGORY_META[phenomenon];
                const PhenomenonIcon = meta.icon;
                return (
                  <article key={post.id}>
                    <button className="home-feed__media" type="button" onClick={() => onOpenMap(post.lat, post.lon)}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={post.imageUrl} alt="" />
                      <span><PhenomenonIcon />{meta.shortLabel}</span>
                    </button>
                    <div>
                      <header>
                        <span>{author?.displayName ?? "Communauté"} · {formatRelativeTime(post.publishedAt)}</span>
                        <button type="button" onClick={() => onOpenMap(post.lat, post.lon)}><IconCompass />{post.place}</button>
                      </header>
                      <h3>{post.title}</h3>
                      <p>{post.body}</p>
                      <footer>
                        <span><IconMessage />{post.comments}</span>
                        {post.observationId && (
                          <button type="button" onClick={() => onOpenObservation(post.observationId!)}>
                            Voir l’observation
                          </button>
                        )}
                      </footer>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="home-layout__aside">
          {event && (
            <section className="home-event">
              <div className="home-event__media">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={event.imageUrl} alt="" />
                <span><IconClock />À venir</span>
              </div>
              <div>
                <small>{new Intl.DateTimeFormat("fr-FR", { weekday: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(event.startsAt))}</small>
                <h2>{event.title}</h2>
                <p>{event.summary}</p>
                <button type="button" onClick={() => onOpenCommunity(event.communityId)}>Voir l’événement<IconChevronRight /></button>
              </div>
            </section>
          )}

          <section className="home-start">
            <header><span><IconBook /></span><div><small>Première semaine</small><h2>Prendre ses repères</h2></div></header>
            <div>
              <span className="is-done"><i>1</i><b>Découvrir Atlas</b></span>
              <span className="is-done"><i>2</i><b>Lire les règles locales</b></span>
              <span><i>3</i><b>Suivre un espace</b></span>
            </div>
            <button type="button" onClick={() => onOpenCommunity("community-nord")}>Continuer dans la communauté</button>
          </section>

          <section className="home-quick-actions">
            <h2>Raccourcis</h2>
            <button type="button" onClick={() => onNavigate("messages")}><IconMessage /><span><b>Messages</b><small>Conversations et demandes actives</small></span><IconChevronRight /></button>
            <button type="button" onClick={() => onNavigate("learn")}><IconBook /><span><b>Apprendre</b><small>Fiches météo courtes</small></span><IconChevronRight /></button>
            <button type="button" onClick={() => onNavigate("communities")}><IconUsers /><span><b>Communautés</b><small>{SOCIAL_DEMO_STATS.communities} territoires à explorer</small></span><IconChevronRight /></button>
          </section>
        </aside>
      </div>
    </div>
  );
}
