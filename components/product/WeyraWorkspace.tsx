"use client";

import { useMemo, useState, type ComponentType, type SVGProps } from "react";
import {
  IconActivity,
  IconBell,
  IconBook,
  IconChevronRight,
  IconClose,
  IconCloud,
  IconCompass,
  IconHome,
  IconMessage,
  IconPlus,
  IconRadar,
  IconSearch,
  IconSettings,
  IconUser,
  IconUsers,
} from "@/components/atlas/icons";
import CommunityExperience from "@/components/product/CommunityExperience";
import ExploreView from "@/components/product/ExploreView";
import FeedView from "@/components/product/FeedView";
import HomeView from "@/components/product/HomeView";
import LearnView from "@/components/product/LearnView";
import MessagesView from "@/components/product/MessagesView";
import NotificationsView from "@/components/product/NotificationsView";
import ProfileView from "@/components/product/ProfileView";
import RoomsView from "@/components/product/RoomsView";
import {
  ActivityView,
  AlertsView,
  AroundView,
  SettingsView,
} from "@/components/product/UtilityViews";
import { useWeyraProduct } from "@/components/product/WeyraProductProvider";
import {
  COMMUNITIES,
  COMMUNITY_NOTIFICATIONS,
  COMMUNITY_SPACES,
  DIRECT_CONVERSATIONS,
} from "@/lib/community-fixtures";
import type { WeyraActivityEntry } from "@/lib/activity";
import type { LocalAlert } from "@/lib/alerts";
import type { WeyraLocalPreferences } from "@/lib/local-core";
import type { Nowcast } from "@/lib/nowcast";
import type { WeyraSpace } from "@/lib/product-domain";
import type { LocationSelection, Observation, WeatherSnapshot } from "@/lib/types";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const GLOBAL_NAV: Array<{ id: WeyraSpace; label: string; icon: IconComponent }> = [
  { id: "home", label: "Accueil", icon: IconHome },
  { id: "atlas", label: "Atlas", icon: IconRadar },
  { id: "explore", label: "Explorer", icon: IconCompass },
  { id: "communities", label: "Communautés", icon: IconUsers },
  { id: "messages", label: "Messages", icon: IconMessage },
  { id: "notifications", label: "Notifications", icon: IconBell },
];

const MOBILE_NAV: Array<{ id: WeyraSpace; label: string; icon: IconComponent }> = [
  { id: "home", label: "Accueil", icon: IconHome },
  { id: "atlas", label: "Atlas", icon: IconRadar },
  { id: "communities", label: "Communautés", icon: IconUsers },
  { id: "messages", label: "Messages", icon: IconMessage },
  { id: "profile", label: "Profil", icon: IconUser },
];

type WeyraWorkspaceProps = {
  open: boolean;
  space: WeyraSpace;
  location: LocationSelection;
  weather: WeatherSnapshot | null;
  nowcast: Nowcast;
  alerts: LocalAlert[];
  activityEntries: WeyraActivityEntry[];
  observations: Observation[];
  radarTimestamp: string | null;
  atlasPreferences: WeyraLocalPreferences;
  onNavigate: (space: WeyraSpace) => void;
  onClose: () => void;
  onOpenMap: (lat: number, lon: number) => void;
  onOpenObservation: (observationId: string) => void;
  onCreateObservation: () => void;
  onLocate: () => void;
  onUpdateAtlasPreferences: (patch: Partial<WeyraLocalPreferences>) => void;
  onResetAtlasPreferences: () => void;
  onToast: (message: string) => void;
};

export default function WeyraWorkspace({
  open,
  space,
  location,
  weather,
  nowcast,
  alerts,
  activityEntries,
  observations,
  radarTimestamp,
  atlasPreferences,
  onNavigate,
  onClose,
  onOpenMap,
  onOpenObservation,
  onCreateObservation,
  onLocate,
  onUpdateAtlasPreferences,
  onResetAtlasPreferences,
  onToast,
}: WeyraWorkspaceProps) {
  const { state } = useWeyraProduct();
  const [selectedCommunityId, setSelectedCommunityId] = useState("community-nord");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const unreadNotifications = COMMUNITY_NOTIFICATIONS.filter((item) => !state.readNotificationIds.includes(item.id)).length;
  const unreadMessages = DIRECT_CONVERSATIONS.reduce((total, conversation) => total + conversation.unreadCount, 0);
  const allCommunities = useMemo(() => [...state.createdCommunities, ...COMMUNITIES], [state.createdCommunities]);
  const allSpaces = useMemo(() => [...COMMUNITY_SPACES, ...state.createdCommunitySpaces], [state.createdCommunitySpaces]);
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("fr-FR");
    if (query.length < 2) return [];
    const communities = allCommunities
      .filter((community) => `${community.name} ${community.territory} ${community.themes.join(" ")}`.toLocaleLowerCase("fr-FR").includes(query))
      .slice(0, 4)
      .map((community) => ({ id: community.id, type: "community" as const, title: community.name, copy: community.territory }));
    const spaces = allSpaces
      .filter((item) => `${item.name} ${item.description}`.toLocaleLowerCase("fr-FR").includes(query))
      .slice(0, 4)
      .map((item) => ({ id: item.communityId, type: "space" as const, title: item.name, copy: item.description }));
    return [...communities, ...spaces];
  }, [allCommunities, allSpaces, searchQuery]);

  function openCommunity(communityId: string) {
    setSelectedCommunityId(communityId);
    setSearchOpen(false);
    setSearchQuery("");
    onNavigate("communities");
  }

  function navigate(spaceId: WeyraSpace) {
    setSearchOpen(false);
    setCreateOpen(false);
    if (spaceId === "atlas") onClose();
    else onNavigate(spaceId);
  }

  return (
    <section
      className={`weyra-shell${open ? " is-open" : ""}`}
      aria-hidden={!open}
      data-space={space}
      data-compact={state.settings.compactMode ? "true" : "false"}
      data-contrast={state.settings.highContrast ? "high" : "normal"}
    >
      <aside className="weyra-global-rail" aria-label="Navigation Weyra">
        <button className="weyra-global-rail__brand" type="button" onClick={() => navigate("home")} title="Weyra" aria-label="Accueil Weyra">
          <span>W</span>
        </button>
        <nav>
          {GLOBAL_NAV.map((item) => {
            const Icon = item.icon;
            const active = item.id === space;
            return (
              <button
                key={item.id}
                className={active ? "is-active" : ""}
                type="button"
                onClick={() => navigate(item.id)}
                title={item.label}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
              >
                <Icon />
                {item.id === "notifications" && unreadNotifications > 0 && <i>{Math.min(99, unreadNotifications)}</i>}
                {item.id === "messages" && unreadMessages > 0 && <i>{Math.min(99, unreadMessages)}</i>}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="weyra-global-rail__bottom">
          <button className={space === "settings" ? "is-active" : ""} type="button" onClick={() => navigate("settings")} title="Paramètres" aria-label="Paramètres"><IconSettings /></button>
          <button className={`weyra-global-profile${space === "profile" ? " is-active" : ""}`} type="button" onClick={() => navigate("profile")} title="Profil" aria-label="Profil">
            <span style={{ "--profile-accent": state.profile.accent } as never}>{state.profile.initials}</span>
          </button>
        </div>
      </aside>

      <header className="weyra-shell-topbar">
        <button className="weyra-shell-topbar__brand" type="button" onClick={() => navigate("home")}>
          <b>weyra</b><span>{space === "communities" ? "communautés" : space === "messages" ? "messages" : space === "explore" ? "explorer" : space === "home" ? "accueil" : space}</span>
        </button>
        <span className="weyra-demo-chip"><i />Démo sociale locale</span>
        <div className={`weyra-global-search${searchOpen ? " is-open" : ""}`}>
          <IconSearch />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onFocus={() => setSearchOpen(true)}
            placeholder="Rechercher dans Weyra"
            aria-label="Rechercher dans Weyra"
            aria-expanded={searchOpen}
          />
          <kbd>⌘K</kbd>
          {searchOpen && (
            <>
              <button className="weyra-global-search__backdrop" type="button" onClick={() => setSearchOpen(false)} aria-label="Fermer la recherche" />
              <div className="weyra-global-search__results">
                <header><span>Recherche globale</span><small>{location.name} prioritaire</small></header>
                {searchQuery.trim().length < 2 ? (
                  <div className="weyra-global-search__suggestions">
                    <button type="button" onClick={() => openCommunity("community-nord")}><IconUsers /><span><b>Observateurs du Nord</b><small>Communauté favorite</small></span></button>
                    <button type="button" onClick={() => navigate("explore")}><IconCompass /><span><b>Explorer autour de Lille</b><small>Communautés et événements</small></span></button>
                    <button type="button" onClick={onLocate}><IconRadar /><span><b>Revenir à ma zone</b><small>Ouvrir Atlas</small></span></button>
                  </div>
                ) : searchResults.length ? (
                  <div className="weyra-global-search__matches">
                    {searchResults.map((result) => (
                      <button key={`${result.type}-${result.id}-${result.title}`} type="button" onClick={() => openCommunity(result.id)}>
                        {result.type === "community" ? <IconUsers /> : <IconMessage />}
                        <span><b>{result.title}</b><small>{result.copy}</small></span>
                        <IconChevronRight />
                      </button>
                    ))}
                  </div>
                ) : <p>Aucun résultat avec cette recherche.</p>}
                <footer><span>Communautés, espaces et territoires</span><button type="button" onClick={() => navigate("explore")}>Explorer tout</button></footer>
              </div>
            </>
          )}
        </div>
        <div className="weyra-shell-topbar__context">
          <i />
          <span><b>{location.name}</b><small>{weather ? `${Math.round(weather.temperature)}° · situation locale` : "Situation locale"}</small></span>
        </div>
        <div className="weyra-shell-topbar__actions">
          <div className="weyra-create-menu">
            <button className="weyra-create-button" type="button" onClick={() => setCreateOpen((value) => !value)} aria-expanded={createOpen}><IconPlus /><span>Créer</span></button>
            {createOpen && (
              <>
                <button className="weyra-create-menu__backdrop" type="button" onClick={() => setCreateOpen(false)} aria-label="Fermer" />
                <div className="weyra-create-menu__panel">
                  <header><span>Créer dans ce contexte</span><button type="button" onClick={() => setCreateOpen(false)} title="Fermer" aria-label="Fermer"><IconClose /></button></header>
                  <button type="button" onClick={() => { setCreateOpen(false); onCreateObservation(); }}><IconCloud /><span><b>Observation</b><small>Phénomène, zone et média</small></span></button>
                  <button type="button" onClick={() => { setCreateOpen(false); openCommunity(selectedCommunityId); }}><IconMessage /><span><b>Publication</b><small>Dans la communauté actuelle</small></span></button>
                  <button type="button" onClick={() => { setCreateOpen(false); openCommunity(selectedCommunityId); onToast("Ouvre l’espace Événements pour préparer la page dédiée."); }}><IconActivity /><span><b>Événement</b><small>Date, carte et participants</small></span></button>
                  <button type="button" onClick={() => { setCreateOpen(false); navigate("explore"); }}><IconUsers /><span><b>Communauté</b><small>Assistant guidé en trois étapes</small></span></button>
                </div>
              </>
            )}
          </div>
          <button type="button" onClick={() => navigate("notifications")} title="Notifications" aria-label={`${unreadNotifications} notifications non lues`}><IconBell />{unreadNotifications > 0 && <i>{Math.min(99, unreadNotifications)}</i>}</button>
          <button className="weyra-shell-topbar__profile" type="button" onClick={() => navigate("profile")} title="Profil" aria-label="Profil"><span style={{ "--profile-accent": state.profile.accent } as never}>{state.profile.initials}</span></button>
        </div>
      </header>

      <main className={`weyra-shell-content${space === "communities" ? " is-community" : ""}`}>
        {space === "home" && (
          <HomeView
            location={location}
            weather={weather}
            observations={observations}
            onNavigate={navigate}
            onOpenCommunity={openCommunity}
            onOpenMap={onOpenMap}
            onOpenObservation={onOpenObservation}
            onCreateObservation={onCreateObservation}
          />
        )}
        {space === "explore" && <ExploreView onOpenCommunity={openCommunity} onToast={onToast} />}
        {space === "communities" && (
          <CommunityExperience
            selectedCommunityId={selectedCommunityId}
            location={location}
            weather={weather}
            observations={observations}
            onSelectCommunity={setSelectedCommunityId}
            onOpenMap={onOpenMap}
            onOpenObservation={onOpenObservation}
            onCreateObservation={onCreateObservation}
            onToast={onToast}
          />
        )}
        {space === "messages" && <MessagesView onToast={onToast} />}
        {space === "notifications" && (
          <NotificationsView
            onNavigate={navigate}
            onOpenCommunity={openCommunity}
            onOpenObservation={onOpenObservation}
          />
        )}
        {space === "profile" && (
          <ProfileView
            observations={observations}
            onOpenObservation={onOpenObservation}
            onCreateObservation={onCreateObservation}
            onOpenMap={onOpenMap}
            onToast={onToast}
          />
        )}
        {space === "settings" && (
          <SettingsView
            atlasPreferences={atlasPreferences}
            onUpdateAtlasPreferences={onUpdateAtlasPreferences}
            onResetAtlasPreferences={onResetAtlasPreferences}
            onToast={onToast}
          />
        )}
        {space === "learn" && <LearnView />}

        {/* Compatibility routes for local links created by earlier prototypes. */}
        {space === "around" && (
          <AroundView
            location={location}
            weather={weather}
            nowcast={nowcast}
            alerts={alerts}
            observations={observations}
            radarTimestamp={radarTimestamp}
            onOpenMap={onOpenMap}
            onOpenObservation={onOpenObservation}
            onCreateObservation={onCreateObservation}
            onLocate={onLocate}
          />
        )}
        {space === "feed" && <FeedView onNavigate={navigate} onOpenObservation={onOpenObservation} onOpenMap={onOpenMap} onToast={onToast} />}
        {space === "activity" && <ActivityView entries={activityEntries} onOpenObservation={onOpenObservation} />}
        {space === "rooms" && <RoomsView onOpenMap={onOpenMap} onToast={onToast} />}
        {space === "alerts" && <AlertsView location={location} alerts={alerts} />}
      </main>

      <button className="weyra-mobile-create" type="button" onClick={() => setCreateOpen((value) => !value)} title="Créer" aria-label="Créer"><IconPlus /></button>

      <nav className="weyra-mobile-nav" aria-label="Navigation mobile">
        {MOBILE_NAV.map((item) => {
          const Icon = item.icon;
          const active = item.id === space;
          return (
            <button key={item.id} className={active ? "is-active" : ""} type="button" onClick={() => navigate(item.id)} aria-current={active ? "page" : undefined}>
              <span><Icon />{item.id === "messages" && unreadMessages > 0 && <i>{Math.min(99, unreadMessages)}</i>}</span>
              <b>{item.label}</b>
            </button>
          );
        })}
      </nav>
    </section>
  );
}
