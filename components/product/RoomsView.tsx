"use client";

import { useMemo, useState } from "react";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconBook,
  IconClock,
  IconCompass,
  IconMessage,
  IconSend,
  IconShield,
  IconUsers,
} from "@/components/atlas/icons";
import { CATEGORY_META } from "@/components/atlas/constants";
import {
  DemoNotice,
  formatRelativeTime,
  ProductEmpty,
  ProductSectionHeading,
} from "@/components/product/ProductShared";
import { useWeyraProduct } from "@/components/product/WeyraProductProvider";
import { PRODUCT_ROOM_MESSAGES, PRODUCT_ROOMS } from "@/lib/product-fixtures";

type RoomsViewProps = {
  onOpenMap: (lat: number, lon: number) => void;
  onToast: (message: string) => void;
};

const COMMUNITIES = [
  { id: "community-hdf", name: "Météo Hauts-de-France", type: "Régionale", members: 1240, copy: "Observations, archives et échanges à l'échelle régionale.", accent: "#62f2dc" },
  { id: "community-photo", name: "Photographes du ciel", type: "Thématique", members: 684, copy: "Techniques, récits et crédits autour de la photographie météo.", accent: "#ffd46a" },
  { id: "community-learn", name: "Comprendre les orages", type: "Éducation", members: 412, copy: "Questions et ressources pour progresser sans jargon inutile.", accent: "#a16fff" },
];

export default function RoomsView({ onOpenMap, onToast }: RoomsViewProps) {
  const { state, toggleRoom, addRoomMessage } = useWeyraProduct();
  const [tab, setTab] = useState<"rooms" | "communities">("rooms");
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const selectedRoom = PRODUCT_ROOMS.find((room) => room.id === selectedRoomId) ?? null;
  const messages = useMemo(() => {
    if (!selectedRoom) return [];
    return [...PRODUCT_ROOM_MESSAGES, ...state.roomMessages]
      .filter((message) => message.roomId === selectedRoom.id)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [selectedRoom, state.roomMessages]);

  if (selectedRoom) {
    const meta = CATEGORY_META[selectedRoom.phenomenon];
    const PhenomenonIcon = meta.icon;
    const joined = state.joinedRoomIds.includes(selectedRoom.id);
    return (
      <div className="product-view product-room-detail">
        <button className="product-back-button" onClick={() => setSelectedRoomId(null)}><IconArrowLeft />Toutes les rooms</button>
        <header className="product-room-hero">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={selectedRoom.imageUrl} alt="" />
          <div className="product-room-hero__scrim" />
          <div className="product-room-hero__content">
            <span className={`product-live-pill is-${selectedRoom.status}`}><i />{selectedRoom.status === "active" ? "En direct" : selectedRoom.status === "watching" ? "Sous surveillance" : "Archive"}</span>
            <div className="product-room-hero__title">
              <span style={{ "--room-color": meta.color } as never}><PhenomenonIcon /></span>
              <div><small>{selectedRoom.area}</small><h2>{selectedRoom.title}</h2></div>
            </div>
            <p>{selectedRoom.summary}</p>
            <div className="product-room-hero__actions">
              <button className="product-primary-button" onClick={() => toggleRoom(selectedRoom.id)}>
                <IconUsers />{joined ? "Quitter la room" : "Rejoindre la room"}
              </button>
              <button className="product-secondary-button" onClick={() => onOpenMap(selectedRoom.lat, selectedRoom.lon)}>
                <IconCompass />Voir la zone
              </button>
            </div>
          </div>
        </header>

        <div className="product-room-detail__stats">
          <span><IconUsers /><b>{selectedRoom.participantCount + (joined ? 1 : 0)}</b>participants</span>
          <span><IconCompass /><b>{selectedRoom.observationCount}</b>observations</span>
          <span><IconMessage /><b>{selectedRoom.messageCount + state.roomMessages.filter((message) => message.roomId === selectedRoom.id).length}</b>messages</span>
          <span><IconBook /><b>{selectedRoom.sourceCount}</b>sources</span>
        </div>

        <div className="product-room-detail__grid">
          <section className="product-room-thread">
            <header><div><span>Fil live</span><h3>Ce que la zone observe</h3></div><DemoNotice compact /></header>
            <div className="product-room-thread__messages">
              {messages.map((message) => (
                <article key={message.id} className={`is-${message.kind}`}>
                  <span>{message.authorName.slice(0, 2).toUpperCase()}</span>
                  <div><header><b>{message.authorName}</b><small>{formatRelativeTime(message.createdAt)}</small></header><p>{message.body}</p></div>
                </article>
              ))}
            </div>
            {selectedRoom.status !== "archived" ? (
              <form
                className="product-room-thread__composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!joined) {
                    onToast("Rejoins la room avant de participer.");
                    return;
                  }
                  if (!addRoomMessage(selectedRoom.id, messageDraft)) return;
                  setMessageDraft("");
                }}
              >
                <input value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} maxLength={500} placeholder={joined ? "Partager une observation ou une confirmation…" : "Rejoins la room pour participer"} />
                <button type="submit" title="Envoyer" aria-label="Envoyer"><IconSend /></button>
              </form>
            ) : <div className="product-room-thread__archived"><IconClock />Cette room est archivée en lecture seule.</div>}
          </section>

          <aside className="product-room-context">
            <section>
              <span><IconShield /></span>
              <h3>Sources séparées</h3>
              <p>Les messages communautaires ne sont jamais présentés comme des informations officielles.</p>
              <button onClick={() => onToast("Aucune source officielle n'est simulée dans ce prototype local.")}>Consulter les sources</button>
            </section>
            <section className="is-safety">
              <span><IconAlertTriangle /></span>
              <h3>Observer sans s'exposer</h3>
              <p>Ne te déplace jamais vers un phénomène dangereux pour publier ou confirmer une observation.</p>
            </section>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="product-view product-rooms">
      <ProductSectionHeading
        eyebrow="Épisodes & collectifs"
        title="Vivre le ciel ensemble"
        copy="Les Storm Rooms suivent un épisode précis. Les communautés rassemblent durablement une région ou un intérêt."
        action={<DemoNotice compact />}
      />
      <div className="product-segmented product-segmented--short">
        <button className={tab === "rooms" ? "is-active" : ""} onClick={() => setTab("rooms")}>Storm Rooms</button>
        <button className={tab === "communities" ? "is-active" : ""} onClick={() => setTab("communities")}>Communautés</button>
      </div>

      {tab === "rooms" ? (
        <div className="product-room-grid">
          {PRODUCT_ROOMS.map((room) => {
            const meta = CATEGORY_META[room.phenomenon];
            const RoomIcon = meta.icon;
            const joined = state.joinedRoomIds.includes(room.id);
            return (
              <article className="product-room-card" key={room.id}>
                <button className="product-room-card__media" onClick={() => setSelectedRoomId(room.id)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={room.imageUrl} alt="" />
                  <span className={`product-live-pill is-${room.status}`}><i />{room.status === "active" ? "En direct" : room.status === "watching" ? "Veille" : "Archive"}</span>
                  <i style={{ "--room-color": meta.color } as never}><RoomIcon /></i>
                </button>
                <div>
                  <span>{room.area} · {formatRelativeTime(room.updatedAt)}</span>
                  <h3>{room.title}</h3>
                  <p>{room.summary}</p>
                  <div className="product-room-card__stats"><span><IconUsers />{room.participantCount}</span><span><IconCompass />{room.observationCount}</span><span><IconMessage />{room.messageCount}</span></div>
                </div>
                <footer>
                  <button onClick={() => setSelectedRoomId(room.id)}>Ouvrir</button>
                  <button className={joined ? "is-active" : ""} onClick={() => toggleRoom(room.id)}>{joined ? "Rejointe" : "Rejoindre"}</button>
                </footer>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="product-community-list">
          {COMMUNITIES.map((community) => {
            const joined = state.joinedRoomIds.includes(community.id);
            return (
              <article key={community.id} style={{ "--community-accent": community.accent } as never}>
                <span className="product-community-list__mark"><IconUsers /></span>
                <div><small>{community.type}</small><h3>{community.name}</h3><p>{community.copy}</p><span>{(community.members + (joined ? 1 : 0)).toLocaleString("fr-FR")} membres</span></div>
                <button className={joined ? "is-active" : ""} onClick={() => toggleRoom(community.id)}>{joined ? "Membre" : "Rejoindre"}</button>
              </article>
            );
          })}
          {!COMMUNITIES.length && <ProductEmpty icon={<IconUsers />} title="Aucune communauté">Les communautés apparaîtront ici.</ProductEmpty>}
        </div>
      )}
    </div>
  );
}
