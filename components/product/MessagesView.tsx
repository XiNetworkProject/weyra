"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  IconArrowLeft,
  IconClose,
  IconMessage,
  IconMoreHorizontal,
  IconSearch,
  IconSend,
  IconShield,
} from "@/components/atlas/icons";
import { formatRelativeTime } from "@/components/product/ProductShared";
import { useWeyraProduct } from "@/components/product/WeyraProductProvider";
import { DIRECT_CONVERSATIONS, DIRECT_MESSAGES } from "@/lib/community-fixtures";

type ConversationFilter = "recent" | "unread" | "requests";

export default function MessagesView({ onToast }: { onToast: (message: string) => void }) {
  const { state, addDirectMessage } = useWeyraProduct();
  const [query, setQuery] = useState("");
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState<ConversationFilter>("recent");
  const [acceptedRequests, setAcceptedRequests] = useState<string[]>([]);
  const [dismissedRequests, setDismissedRequests] = useState<string[]>([]);
  const conversations = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("fr-FR");
    return DIRECT_CONVERSATIONS
      .filter((conversation) => !dismissedRequests.includes(conversation.id))
      .filter((conversation) => (
        filter === "unread"
          ? conversation.unreadCount > 0
          : filter === "requests"
            ? conversation.request
            : true
      ))
      .filter((conversation) => !normalized || `${conversation.title} ${conversation.preview}`.toLocaleLowerCase("fr-FR").includes(normalized));
  }, [dismissedRequests, filter, query]);
  const selected = conversations.find((conversation) => conversation.id === selectedConversationId)
    ?? conversations[0]
    ?? null;
  const messages = useMemo(() => {
    if (!selected) return [];
    return [...DIRECT_MESSAGES, ...state.directMessages]
      .filter((message) => message.conversationId === selected.id)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [selected, state.directMessages]);
  const requestBlocked = Boolean(selected?.request && !acceptedRequests.includes(selected.id));

  function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!selected || requestBlocked) return;
    if (!addDirectMessage(selected.id, draft)) return;
    setDraft("");
  }

  return (
    <div className={`messages-view${selectedConversationId ? " has-selection" : ""}`}>
      <aside className="messages-list">
        <header>
          <div><span>Messages</span><h1>Conversations</h1><small>{DIRECT_CONVERSATIONS.length} fils de démonstration</small></div>
          <button type="button" title="Nouveau message" aria-label="Nouveau message" onClick={() => onToast("Choisis une personne depuis son profil pour démarrer une conversation.")}><IconMessage /></button>
        </header>
        <label><IconSearch /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher" /></label>
        <div className="messages-list__filters">
          <button className={filter === "recent" ? "is-active" : ""} type="button" onClick={() => setFilter("recent")}>Récentes</button>
          <button className={filter === "unread" ? "is-active" : ""} type="button" onClick={() => setFilter("unread")}>Non lues</button>
          <button className={filter === "requests" ? "is-active" : ""} type="button" onClick={() => setFilter("requests")}>Demandes</button>
        </div>
        <div className="messages-list__items">
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              className={selected?.id === conversation.id ? "is-active" : ""}
              type="button"
              onClick={() => setSelectedConversationId(conversation.id)}
            >
              <span className="messages-avatar" style={{ "--message-accent": conversation.accent } as never}>
                {conversation.participantInitials.slice(0, 2).map((initials) => <i key={initials}>{initials}</i>)}
              </span>
              <span>
                <b>{conversation.title}</b>
                <small>{conversation.preview}</small>
              </span>
              <em>{formatRelativeTime(conversation.updatedAt)}</em>
              {conversation.unreadCount > 0 && <i>{conversation.unreadCount}</i>}
            </button>
          ))}
          {!conversations.length && (
            <div className="messages-list__empty">
              <IconMessage />
              <b>Aucune conversation ici</b>
              <span>Essayez un autre filtre ou une autre recherche.</span>
            </div>
          )}
        </div>
        <footer><IconShield /><span>Les demandes d’inconnus restent séparées et peuvent être refusées sans réponse.</span></footer>
      </aside>

      <main className="message-thread">
        {selected ? (
          <>
            <header>
              <button className="message-thread__back" type="button" onClick={() => setSelectedConversationId("")} title="Retour" aria-label="Retour"><IconArrowLeft /></button>
              <span className="messages-avatar" style={{ "--message-accent": selected.accent } as never}>
                {selected.participantInitials.slice(0, 2).map((initials) => <i key={initials}>{initials}</i>)}
              </span>
              <div><h2>{selected.title}</h2><small>{selected.request ? "Demande de message" : "Conversation privée"}</small></div>
              <button type="button" onClick={() => onToast("Les options de confidentialité sont disponibles depuis le profil.")} title="Options" aria-label="Options"><IconMoreHorizontal /></button>
            </header>

            {requestBlocked ? (
              <section className="message-request">
                <span><IconShield /></span>
                <h2>Cette personne souhaite vous écrire</h2>
                <p>Vous pouvez lire ce message sans révéler que vous l’avez vu. Autoriser n’ajoute pas automatiquement cette personne à vos communautés.</p>
                <blockquote>{messages[0]?.body}</blockquote>
                <div>
                  <button type="button" onClick={() => {
                    setDismissedRequests((items) => [...items, selected.id]);
                    setSelectedConversationId("");
                    onToast("Demande refusée.");
                  }}><IconClose />Refuser</button>
                  <button type="button" onClick={() => setAcceptedRequests((items) => [...items, selected.id])}>Autoriser</button>
                </div>
              </section>
            ) : (
              <>
                <div className="message-thread__history">
                  <div className="message-thread__intro">
                    <span className="messages-avatar" style={{ "--message-accent": selected.accent } as never}>
                      <i>{selected.participantInitials[0]}</i>
                    </span>
                    <h3>{selected.title}</h3>
                    <p>Début de cette conversation. Les échanges communautaires sensibles doivent rester dans leurs espaces autorisés.</p>
                  </div>
                  {messages.map((message) => {
                    const mine = message.authorId === state.profile.id;
                    return (
                      <article key={message.id} className={mine ? "is-mine" : ""}>
                        <span>{mine ? state.profile.initials : message.authorName.slice(0, 2).toUpperCase()}</span>
                        <div><header><b>{mine ? "Vous" : message.authorName}</b><small>{formatRelativeTime(message.createdAt)}</small></header><p>{message.body}</p></div>
                      </article>
                    );
                  })}
                </div>
                <form className="message-composer" onSubmit={sendMessage}>
                  <button type="button" title="Ajouter un média" aria-label="Ajouter un média" onClick={() => onToast("Les médias seront stockés localement avant la connexion Cloudinary.")}>+</button>
                  <textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={1500} rows={1} placeholder={`Écrire à ${selected.title}`} />
                  <button type="submit" title="Envoyer" aria-label="Envoyer"><IconSend /></button>
                </form>
              </>
            )}
          </>
        ) : (
          <section className="message-thread__empty">
            <span><IconMessage /></span><h2>Choisissez une conversation</h2><p>Vos messages privés restent un outil, pas le centre de Weyra.</p>
          </section>
        )}
      </main>
    </div>
  );
}
