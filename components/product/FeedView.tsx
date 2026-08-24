"use client";

import { useEffect, useMemo, useState } from "react";
import {
  IconBookmark,
  IconCompass,
  IconHeart,
  IconMessage,
  IconSend,
  IconShare,
} from "@/components/atlas/icons";
import { CATEGORY_META } from "@/components/atlas/constants";
import { useWeyraProduct } from "@/components/product/WeyraProductProvider";
import {
  DemoNotice,
  formatRelativeTime,
  ProductAuthorMark,
  ProductEmpty,
  ProductRole,
  ProductSectionHeading,
} from "@/components/product/ProductShared";
import {
  PRODUCT_AUTHORS,
  PRODUCT_COMMENTS_BY_TARGET,
  PRODUCT_POSTS,
} from "@/lib/product-fixtures";
import type { ProductPost, WeyraSpace } from "@/lib/product-domain";

type FeedFilter = "local" | "following" | "trending";

type FeedViewProps = {
  onNavigate: (space: WeyraSpace) => void;
  onOpenObservation: (observationId: string) => void;
  onOpenMap: (lat: number, lon: number) => void;
  onToast: (message: string) => void;
};

function postTypeLabel(post: ProductPost) {
  if (post.kind === "analysis") return "Analyse locale";
  if (post.kind === "recap") return "Récapitulatif";
  if (post.kind === "question") return "Question";
  if (post.kind === "photo") return "Photo du ciel";
  return "Observation";
}

export default function FeedView({ onNavigate, onOpenObservation, onOpenMap, onToast }: FeedViewProps) {
  const {
    backend,
    state,
    togglePostLike,
    recordPostShare,
    togglePostBookmark,
    toggleAuthorFollow,
    addComment,
  } = useWeyraProduct();
  const [filter, setFilter] = useState<FeedFilter>("local");
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [visibleCount, setVisibleCount] = useState(12);

  const allPosts = useMemo(() => {
    const merged = new Map(PRODUCT_POSTS.map((post) => [post.id, post]));
    state.remotePosts.forEach((post) => merged.set(post.id, post));
    return [...merged.values()].sort((a, b) => (
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    ));
  }, [state.remotePosts]);
  const authors = useMemo(() => new Map(
    [...PRODUCT_AUTHORS, ...state.remoteAuthors].map((author) => [author.id, author]),
  ), [state.remoteAuthors]);
  const posts = useMemo(() => {
    if (filter === "following") {
      return allPosts.filter((post) => state.followedAuthorIds.includes(post.authorId));
    }
    if (filter === "trending") return [...allPosts].sort((a, b) => b.likes - a.likes);
    return allPosts;
  }, [allPosts, filter, state.followedAuthorIds]);
  const visiblePosts = posts.slice(0, visibleCount);

  useEffect(() => {
    setVisibleCount(12);
  }, [filter]);

  async function sharePost(post: ProductPost) {
    const text = `${post.title} · ${post.place} sur Weyra`;
    try {
      if (navigator.share) {
        await navigator.share({ title: post.title, text, url: window.location.href });
      } else {
        await navigator.clipboard.writeText(`${text} ${window.location.href}`);
        onToast("Lien copié.");
      }
      recordPostShare(post.id);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      onToast("Le partage n'est pas disponible.");
    }
  }

  return (
    <div className="product-view product-feed">
      <ProductSectionHeading
        eyebrow="Le ciel près de toi"
        title="Flux local"
        copy="Des observations, photos et explications toujours reliées à un lieu et à un phénomène."
        action={<DemoNotice compact />}
      />

      <div className="product-segmented" aria-label="Filtrer le flux">
        <button className={filter === "local" ? "is-active" : ""} onClick={() => setFilter("local")}>Local</button>
        <button className={filter === "following" ? "is-active" : ""} onClick={() => setFilter("following")}>Suivis</button>
        <button className={filter === "trending" ? "is-active" : ""} onClick={() => setFilter("trending")}>Tendances</button>
        <button onClick={() => onNavigate("learn")}>Apprendre</button>
      </div>
      <div className="product-feed__density">
        <span><i />{backend.status === "authenticated" ? "Flux Weyra synchronisé" : "Simulation sociale locale"}</span>
        <b>{posts.length.toLocaleString("fr-FR")} publications dans ce flux</b>
        <small>{state.remotePosts.length
          ? `${state.remotePosts.length.toLocaleString("fr-FR")} publication(s) proviennent de Supabase ; le reste illustre une communauté active.`
          : "Les profils, réactions et contenus sont fictifs et servent à éprouver l’interface."}</small>
      </div>

      {!posts.length ? (
        <ProductEmpty
          icon={<IconCompass />}
          title="Ton flux suivi est encore calme"
          action={<button className="product-primary-button" onClick={() => setFilter("local")}>Découvrir le flux local</button>}
        >
          Suis quelques observateurs locaux pour composer ce fil.
        </ProductEmpty>
      ) : (
        <div className="product-feed__stream">
          {visiblePosts.map((post) => {
            const author = authors.get(post.authorId);
            if (!author) return null;
            const liked = state.likedPostIds.includes(post.id);
            const bookmarked = state.bookmarkedPostIds.includes(post.id);
            const following = state.followedAuthorIds.includes(author.id);
            const fixtureComments = PRODUCT_COMMENTS_BY_TARGET[post.id] ?? [];
            const localComments = state.commentsByTarget[post.id] ?? [];
            const comments = [...fixtureComments, ...localComments];
            const expanded = expandedPostId === post.id;
            const shared = state.sharedPostIds.includes(post.id);
            return (
              <article className="product-post" key={post.id}>
                <header className="product-post__header">
                  <ProductAuthorMark author={author} />
                  <div className="product-post__author">
                    <div><b>{author.displayName}</b><ProductRole role={author.role} /></div>
                    <span>{author.handle} · {formatRelativeTime(post.publishedAt)}</span>
                  </div>
                  <button
                    className={`product-follow${following ? " is-active" : ""}`}
                    onClick={() => toggleAuthorFollow(author.id)}
                  >
                    {following ? "Suivi" : "Suivre"}
                  </button>
                </header>

                <button className="product-post__media" onClick={() => onOpenMap(post.lat, post.lon)} aria-label={`Voir ${post.place} sur Atlas`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {post.imageUrl ? <img src={post.imageUrl} alt="" /> : <span className="product-post__media-placeholder"><IconCompass /></span>}
                  <span><IconCompass />Voir sur Atlas</span>
                  <i>{postTypeLabel(post)}</i>
                </button>

                <div className="product-post__body">
                  <div className="product-post__phenomena">
                    {post.phenomena.map((phenomenon) => {
                      const meta = CATEGORY_META[phenomenon];
                      const Icon = meta.icon;
                      return <span key={phenomenon} style={{ "--cat-color": meta.color } as never}><Icon />{meta.shortLabel}</span>;
                    })}
                    {post.useful && <em>Utile localement</em>}
                  </div>
                  <h3>{post.title}</h3>
                  <p>{post.body}</p>
                  <button className="product-post__place" onClick={() => onOpenMap(post.lat, post.lon)}>
                    <IconCompass />{post.place}
                  </button>
                </div>

                <footer className="product-post__actions">
                  <button className={liked ? "is-active is-liked" : ""} onClick={() => togglePostLike(post.id)} aria-pressed={liked}>
                    <IconHeart />{post.likes + (liked ? 1 : 0)}
                  </button>
                  <button className={expanded ? "is-active" : ""} onClick={() => setExpandedPostId(expanded ? null : post.id)}>
                    <IconMessage />{post.comments + localComments.length}
                  </button>
                  <button className={shared ? "is-active" : ""} onClick={() => void sharePost(post)} title="Partager">
                    <IconShare />{post.shares + (shared ? 1 : 0)}
                  </button>
                  <button className={bookmarked ? "is-active" : ""} onClick={() => togglePostBookmark(post.id)} aria-pressed={bookmarked} title="Enregistrer">
                    <IconBookmark />
                  </button>
                  {post.observationId && (
                    <button className="product-post__open" onClick={() => onOpenObservation(post.observationId!)}>
                      Ouvrir le signal
                    </button>
                  )}
                </footer>

                {expanded && (
                  <section className="product-comments" aria-label={`Commentaires de ${post.title}`}>
                    <div className="product-comments__list">
                      {comments.length ? comments.map((comment) => (
                        <div key={comment.id}>
                          <span>{comment.authorName.slice(0, 2).toUpperCase()}</span>
                          <p><b>{comment.authorName}</b>{comment.body}<small>{formatRelativeTime(comment.createdAt)}</small></p>
                        </div>
                      )) : <p className="product-comments__empty">Aucun commentaire local. Lance la conversation.</p>}
                      {post.comments > fixtureComments.length && (
                        <p className="product-comments__more">
                          + {(post.comments - fixtureComments.length).toLocaleString("fr-FR")} autres réactions regroupées dans cette simulation.
                        </p>
                      )}
                    </div>
                    <form
                      className="product-comments__composer"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (!addComment(post.id, commentDraft)) return;
                        setCommentDraft("");
                      }}
                    >
                      <input
                        value={commentDraft}
                        onChange={(event) => setCommentDraft(event.target.value)}
                        maxLength={500}
                        placeholder="Ajouter un commentaire utile…"
                        aria-label="Ajouter un commentaire"
                      />
                      <button type="submit" title="Envoyer" aria-label="Envoyer"><IconSend /></button>
                    </form>
                  </section>
                )}
              </article>
            );
          })}
          {visibleCount < posts.length && (
            <button className="social-load-more" type="button" onClick={() => setVisibleCount((count) => count + 12)}>
              Afficher 12 publications de plus
              <small>{(posts.length - visibleCount).toLocaleString("fr-FR")} restantes</small>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
