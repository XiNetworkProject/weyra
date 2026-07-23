"use client";

import { useEffect, useMemo, useState } from "react";
import {
  IconAlertTriangle,
  IconBell,
  IconCheck,
  IconClock,
  IconCloud,
  IconMessage,
  IconSettings,
  IconShield,
  IconUsers,
} from "@/components/atlas/icons";
import { formatRelativeTime } from "@/components/product/ProductShared";
import { useWeyraProduct } from "@/components/product/WeyraProductProvider";
import { COMMUNITIES, COMMUNITY_NOTIFICATIONS } from "@/lib/community-fixtures";
import type { CommunityNotification, WeyraSpace } from "@/lib/product-domain";

type NotificationFilter = "all" | "unread" | "important";

function NotificationIcon({ item }: { item: CommunityNotification }) {
  if (item.type === "security" || item.type === "moderation") return <IconShield />;
  if (item.type === "event") return <IconClock />;
  if (item.type === "observation") return <IconCloud />;
  if (item.type === "membership") return <IconUsers />;
  if (item.type === "reply" || item.type === "mention") return <IconMessage />;
  return <IconBell />;
}

export default function NotificationsView({
  onNavigate,
  onOpenCommunity,
  onOpenObservation,
}: {
  onNavigate: (space: WeyraSpace) => void;
  onOpenCommunity: (communityId: string) => void;
  onOpenObservation: (observationId: string) => void;
}) {
  const { state, markNotificationsRead } = useWeyraProduct();
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [visibleCount, setVisibleCount] = useState(30);
  const communityById = useMemo(
    () => new Map([...state.createdCommunities, ...COMMUNITIES].map((community) => [community.id, community])),
    [state.createdCommunities],
  );
  const unreadIds = COMMUNITY_NOTIFICATIONS
    .filter((item) => !state.readNotificationIds.includes(item.id))
    .map((item) => item.id);
  const visible = COMMUNITY_NOTIFICATIONS.filter((item) => {
    if (filter === "unread") return !state.readNotificationIds.includes(item.id);
    if (filter === "important") return item.priority === "critical" || item.priority === "high";
    return true;
  });
  const rendered = visible.slice(0, visibleCount);

  useEffect(() => {
    setVisibleCount(30);
  }, [filter]);

  function openNotification(item: CommunityNotification) {
    markNotificationsRead([item.id]);
    if (item.targetObservationId) {
      onOpenObservation(item.targetObservationId);
      return;
    }
    if (item.communityId) onOpenCommunity(item.communityId);
  }

  return (
    <div className="weyra-page notifications-view">
      <header className="weyra-page-heading">
        <div>
          <span>Notifications</span>
          <h1>L’essentiel, sans bruit</h1>
          <p>Les réponses directes, événements proches et informations importantes passent en premier.</p>
        </div>
        <button type="button" className="weyra-secondary-action" onClick={() => markNotificationsRead(unreadIds)}>
          <IconCheck />Tout marquer comme lu
        </button>
      </header>

      <div className="notifications-layout">
        <main>
          <div className="notifications-filters">
            <button className={filter === "all" ? "is-active" : ""} type="button" onClick={() => setFilter("all")}>Toutes</button>
            <button className={filter === "unread" ? "is-active" : ""} type="button" onClick={() => setFilter("unread")}>Non lues <span>{unreadIds.length}</span></button>
            <button className={filter === "important" ? "is-active" : ""} type="button" onClick={() => setFilter("important")}>Importantes</button>
          </div>
          <div className="notifications-list">
            {rendered.map((item) => {
              const read = state.readNotificationIds.includes(item.id);
              const community = item.communityId ? communityById.get(item.communityId) : null;
              return (
                <button
                  key={item.id}
                  className={`notification-row is-${item.priority}${read ? " is-read" : ""}`}
                  type="button"
                  onClick={() => openNotification(item)}
                >
                  <span className="notification-row__icon"><NotificationIcon item={item} /></span>
                  <span className="notification-row__copy">
                    <small>{community?.name ?? "Weyra"} · {formatRelativeTime(item.createdAt)}</small>
                    <b>{item.title}</b>
                    <span>{item.body}</span>
                  </span>
                  {!read && <i />}
                </button>
              );
            })}
            {visibleCount < visible.length && (
              <button className="social-load-more" type="button" onClick={() => setVisibleCount((count) => count + 30)}>
                Afficher 30 notifications de plus
                <small>{(visible.length - visibleCount).toLocaleString("fr-FR")} restantes</small>
              </button>
            )}
          </div>
        </main>

        <aside>
          <section className="notification-priority">
            <header><IconBell /><div><small>Réglage actuel</small><h2>Essentiel uniquement</h2></div></header>
            <p>Réponses, mentions, événements imminents et observations importantes suivies.</p>
            <button type="button" onClick={() => onNavigate("settings")}><IconSettings />Modifier les préférences</button>
          </section>
          <section className="notification-levels">
            <h2>Niveaux de priorité</h2>
            <span className="is-critical"><IconShield /><b>Critique</b><small>Compte, modération, sécurité</small></span>
            <span className="is-high"><IconAlertTriangle /><b>Haute</b><small>Réponse, mention, événement</small></span>
            <span className="is-normal"><IconBell /><b>Normale</b><small>Publication et invitation</small></span>
            <span className="is-low"><IconMessage /><b>Faible</b><small>Réactions regroupées</small></span>
          </section>
        </aside>
      </div>
    </div>
  );
}
