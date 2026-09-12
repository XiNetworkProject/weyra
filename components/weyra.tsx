"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, useMemo } from "react";
import {
  Home,
  Compass,
  Map,
  Users,
  MessageCircle,
  Bell,
  Plus,
  Search,
  ArrowUpRight,
  ArrowLeft,
  MapPin,
  CloudRain,
  CloudSun,
  Cloud,
  Wind,
  Camera,
  Bookmark,
  Send,
  ShieldCheck,
  Settings,
  CalendarDays,
  BookOpen,
  Radio,
  ChevronRight,
  Check,
  Globe,
  Lock,
  ImagePlus,
  Trash2,
  Flag,
  LoaderCircle,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty, CommandGroup } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Toaster, toast } from "sonner";
import Atlas, { type Place } from "./atlas";
import SkyStory, { Horizon } from "./sky-story";
import {
  loadLocalWorkspace,
  saveLocalRecord,
  deleteLocalRecord,
  localPhoto,
  type LocalRecord,
} from "@/lib/local-workspace";
import { communities as initialCommunities, observations, articles, cities, type Observation } from "@/lib/content";
const navigation = [
  { id: "accueil", name: "Accueil", icon: Home },
  { id: "atlas", name: "Atlas", icon: Map },
  { id: "explorer", name: "Explorer", icon: Compass },
  { id: "communautes", name: "Communautés", icon: Users },
  { id: "messages", name: "Messages", icon: MessageCircle },
];
const phenomena = ["Nuages", "Pluie", "Orage", "Grêle", "Vent", "Neige", "Brouillard", "Ciel remarquable"];
const emptyObs = {
  title: "",
  description: "",
  phenomenon: "Nuages",
  intensity: 2,
  visibility: "private",
  place: "Lille",
  lat: 50.63,
  lon: 3.06,
  image: "",
  community: "nord",
};
export default function Weyra() {
  const [view, setView] = useState("atlas"),
    [place, setPlace] = useState<Place>(cities[0]),
    [records, setRecords] = useState<LocalRecord[]>([]),
    [user, setUser] = useState<{ name: string; id: string } | null>(null),
    [loading, setLoading] = useState(true),
    [stateError, setStateError] = useState(false),
    [searchOpen, setSearchOpen] = useState(false),
    [search, setSearch] = useState(""),
    [searchResults, setSearchResults] = useState<(Place & { country?: string; admin1?: string })[]>([]),
    [searching, setSearching] = useState(false),
    [searchError, setSearchError] = useState(false),
    [selected, setSelected] = useState<Observation | null>(null),
    [composer, setComposer] = useState(false),
    [draft, setDraft] = useState({ ...emptyObs }),
    [photoPreview, setPhotoPreview] = useState(""),
    [photo, setPhoto] = useState<File | null>(null),
    [saving, setSaving] = useState(false),
    [sourceOpen, setSourceOpen] = useState(false),
    [communityId, setCommunityId] = useState<string | null>(null),
    [communityTab, setCommunityTab] = useState("accueil"),
    [createCommunity, setCreateCommunity] = useState(false),
    [communityDraft, setCommunityDraft] = useState({ name: "", area: "", description: "" }),
    [createEvent, setCreateEvent] = useState(false),
    [eventDraft, setEventDraft] = useState({ title: "", date: "", place: "", description: "" }),
    [post, setPost] = useState(""),
    [comment, setComment] = useState(""),
    [exploreTab, setExploreTab] = useState("observations"),
    [profileTab, setProfileTab] = useState("carnet"),
    [filter, setFilter] = useState("Tous"),
    [article, setArticle] = useState<(typeof articles)[number] | null>(null),
    [profileDraft, setProfileDraft] = useState({ name: "", bio: "", zone: "Hauts-de-France" }),
    [report, setReport] = useState(false),
    [reportText, setReportText] = useState(""),
    [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const allObservations = useMemo(
    () => [...records.filter((r) => r.kind === "observation"), ...observations] as Observation[],
    [records],
  );
  const [immersive, setImmersive] = useState(false),
    [storyIndex, setStoryIndex] = useState(0);
  function openImmersion(index = 0) {
    setStoryIndex(index);
    setImmersive(true);
  }
  const allCommunities = [
    ...records
      .filter((r) => r.kind === "community")
      .map((c) => ({
        ...c,
        image: c.image || "/images/arcus.jpg",
        theme: "Ma communauté",
        initials: c.name?.slice(0, 2).toUpperCase(),
        owned: true,
      })),
    ...initialCommunities.map((c) => ({ ...c, owned: false })),
  ];
  const community = allCommunities.find((c) => c.id === communityId);
  const profile = records.find((r) => r.kind === "profile");
  const prefs: Partial<LocalRecord> = records.find((r) => r.kind === "preferences") || {};
  const savedIds = records.filter((r) => r.kind === "saved").map((r) => r.scope);
  const myObservations = records.filter((r) => r.kind === "observation");
  const displayName = profile?.name || user?.name || "Observateur";
  const initial = displayName
    .split(/\s/)
    .map((s: string) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const navigate = useCallback((next: string) => {
    setView(next);
    document.querySelector(".main-surface")?.scrollTo({ top: 0 });
    window.history.replaceState(null, "", "?vue=" + next);
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await loadLocalWorkspace();
      setRecords(d.records);
      setUser(d.user);
      const p = d.records.find((r: LocalRecord) => r.kind === "profile");
      setProfileDraft({ name: p?.name || d.user?.name || "", bio: p?.bio || "", zone: p?.zone || "Hauts-de-France" });
      setStateError(false);
    } catch {
      setStateError(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
    const v = new URLSearchParams(location.search).get("vue");
    if (v && [...navigation.map((n) => n.id), "profil", "notifications"].includes(v)) setView(v);
  }, [load]);
  useEffect(() => {
    if (search.length < 2) {
      setSearchResults([]);
      setSearching(false);
      setSearchError(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    setSearchError(false);
    const timer = setTimeout(async () => {
      try {
        let data: { results?: (Place & { country?: string; admin1?: string })[] } | undefined;
        for (const url of [
          "https://geocoding-api.open-meteo.com/v1/search?name=" +
            encodeURIComponent(search) +
            "&count=6&language=fr&format=json",
          "/api/search?q=" + encodeURIComponent(search),
        ]) {
          try {
            const r = await fetch(url, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(9000)]) });
            if (r.ok) {
              data = await r.json();
              break;
            }
          } catch {
            if (controller.signal.aborted) return;
          }
        }
        if (!data) throw Error();
        if (!controller.signal.aborted) setSearchResults(data.results || []);
      } catch {
        if (!controller.signal.aborted) {
          setSearchError(true);
          setSearchResults([]);
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  async function save(kind: string, data: Partial<LocalRecord>, scope = "", id?: string) {
    const record = await saveLocalRecord(kind, data, scope, id);
    setRecords((prev) => [record, ...prev.filter((r) => r.id !== record.id)]);
    return record;
  }
  async function remove(id: string) {
    await deleteLocalRecord(id);
    setRecords((prev) => prev.filter((r) => r.id !== id));
  }
  async function bookmark(o: Observation) {
    try {
      const previous = records.find((r) => r.kind === "saved" && r.scope === o.id);
      if (previous) await remove(previous.id);
      else await save("saved", { title: o.title }, o.id);
      toast.success(previous ? "Retiré des favoris" : "Ajouté à votre carnet");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function join(c: { id: string; name: string }) {
    try {
      const member = records.find((r) => r.kind === "membership" && r.scope === c.id);
      if (member) await remove(member.id);
      else await save("membership", { name: c.name }, c.id);
      toast.success(member ? "Communauté quittée" : "Communauté ajoutée à votre espace");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  function openCommunity(id: string) {
    setCommunityId(id);
    setCommunityTab("accueil");
    navigate("communautes");
  }
  async function preparePhoto(file: File) {
    if (!file.type.startsWith("image/") || file.size > 20000000) {
      toast.error("Choisissez une image de moins de 20 Mo.");
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(Error())), "image/jpeg", 0.86),
      );
      const cleaned = new File([blob], "observation.jpg", { type: "image/jpeg" });
      setPhoto(cleaned);
      if (photoPreview) URL.revokeObjectURL(photoPreview);
      setPhotoPreview(URL.createObjectURL(cleaned));
    } catch {
      toast.error("Cette image ne peut pas être ouverte. Essayez JPEG ou PNG.");
    }
  }
  async function publish() {
    if (!draft.title.trim()) {
      toast.error("Ajoutez un titre à votre observation.");
      return;
    }
    setSaving(true);
    try {
      let image = draft.image;
      if (photo) {
        image = await localPhoto(photo);
        setDraft((p) => ({ ...p, image }));
        setPhoto(null);
      }
      await save("observation", { ...draft, image, author: displayName });
      setComposer(false);
      setDraft({ ...emptyObs, place: place.name, lat: place.latitude, lon: place.longitude });
      setPhotoPreview("");
      toast.success("Votre observation est enregistrée dans Atlas et votre carnet.");
      navigate("atlas");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  function observationCard(o: Observation, wide = false) {
    return (
      <article className={"observation-card " + (wide ? "wide-photo" : "")} key={o.id}>
        <button className="photo-button" onClick={() => setSelected(o)}>
          <img src={o.image || "/images/clouds.jpg"} alt={o.title} loading="lazy" />
          <span className="photo-category">
            <Cloud size={13} />
            {o.phenomenon}
          </span>
          {o.demo && <span className="demo-photo">Démo</span>}
          <span className="photo-open">
            <ArrowUpRight size={18} />
          </span>
        </button>
        <div className="observation-copy">
          <div className="location-line">
            <MapPin size={13} />
            {o.place}
            <span>{o.demo ? "Photo illustrative" : new Date(o.time).toLocaleDateString("fr-FR")}</span>
          </div>
          <button className="observation-title" onClick={() => setSelected(o)}>
            {o.title}
          </button>
          <div className="card-footer">
            <span>
              <span className="mini-avatar">{o.author?.[0]}</span>
              {o.author}
            </span>
            <button
              aria-label="Enregistrer dans mon carnet"
              aria-pressed={savedIds.includes(o.id)}
              onClick={() => bookmark(o)}
            >
              <Bookmark size={17} fill={savedIds.includes(o.id) ? "currentColor" : "none"} />
            </button>
          </div>
        </div>
      </article>
    );
  }
  function discussion(scope: string) {
    const posts = records.filter((r) => r.kind === "post" && r.scope === scope);
    return (
      <div className="discussion">
        <div className="conversation-heading">
          <MessageCircle size={21} />
          <div>
            <h3>Au fil du ciel</h3>
            <p>Questions, observations et petits instants à partager.</p>
          </div>
        </div>
        {!posts.length && (
          <div className="empty-inline">
            <span className="avatar soft">W</span>
            <div>
              <strong>La conversation est ouverte.</strong>
              <p>Ajoutez le premier message de votre espace de préversion.</p>
            </div>
          </div>
        )}
        {posts.map((p) => (
          <article className="message-row" key={p.id}>
            <span className="avatar">{initial}</span>
            <div>
              <strong>{displayName}</strong>
              <small>{new Date(p.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</small>
              <p>{p.text}</p>
            </div>
          </article>
        ))}
        <form
          className="message-compose"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!post.trim()) return;
            try {
              await save("post", { text: post }, scope);
              setPost("");
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        >
          <Textarea
            value={post}
            onChange={(e) => setPost(e.target.value)}
            placeholder="Qu’observez-vous aujourd’hui ?"
            maxLength={3000}
            aria-label="Votre message"
          />
          <button className="primary" type="submit" disabled={!post.trim()}>
            <Send size={16} />
            Publier
          </button>
        </form>
      </div>
    );
  }
  function eventList(scope: string) {
    const list = records.filter((r) => r.kind === "event" && r.scope === scope);
    return (
      <div className="events-space">
        <div className="section-heading">
          <h3>Les prochains rendez-vous</h3>
          <button className="secondary" onClick={() => setCreateEvent(true)}>
            <Plus size={16} />
            Créer un événement
          </button>
        </div>
        {!list.length ? (
          <div className="empty-state compact">
            <CalendarDays size={35} />
            <h3>Un ciel à observer ensemble</h3>
            <p>Préparez un atelier photo, une rencontre ou un échange en ligne.</p>
          </div>
        ) : (
          list.map((e) => (
            <article className="event-row" key={e.id}>
              <div className="event-date">
                <strong>{new Date(e.date).getDate()}</strong>
                <span>{new Date(e.date).toLocaleDateString("fr-FR", { month: "short" })}</span>
              </div>
              <div>
                <h3>{e.title}</h3>
                <p>
                  {e.place} · {new Date(e.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </p>
                <p>{e.description}</p>
              </div>
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    const p = records.find((r) => r.kind === "participation" && r.scope === e.id);
                    if (p) await remove(p.id);
                    else await save("participation", { title: e.title }, e.id);
                    toast.success(p ? "Participation retirée" : "Participation enregistrée");
                  } catch (err) {
                    toast.error((err as Error).message);
                  }
                }}
              >
                {records.some((r) => r.kind === "participation" && r.scope === e.id) ? (
                  <>
                    <Check size={16} />
                    Je participe
                  </>
                ) : (
                  "Participer"
                )}
              </button>
            </article>
          ))
        )}
      </div>
    );
  }
  return (
    <div className={"weyra-shell mode-" + view}>
      <nav className="floating-nav" aria-label="Navigation principale">
        {navigation.map((n) => (
          <button
            key={n.id}
            onClick={() => navigate(n.id)}
            aria-current={view === n.id ? "page" : undefined}
            className={view === n.id ? "active" : ""}
          >
            <n.icon size={19} />
            <span>{n.name}</span>
          </button>
        ))}
        <span className="dock-divider" />
        <button
          className={view === "profil" ? "active profile-dock" : "profile-dock"}
          onClick={() => navigate("profil")}
          aria-label="Mon profil"
        >
          <span className="avatar">{initial}</span>
        </button>
      </nav>
      <div className="app-frame">
        <header className="app-header">
          <button className="wordmark" onClick={() => navigate("accueil")}>
            weyra<span className="brand-star">✳</span>
          </button>
          <span className="header-separator" />
          <div className="header-section">
            {navigation.find((n) => n.id === view)?.name || (view === "profil" ? "Mon carnet" : "Notifications")}
          </div>
          <button className="global-search" onClick={() => setSearchOpen(true)}>
            <Search size={17} />
            <span>Un lieu, une communauté…</span>
            <kbd>⌘ K</kbd>
          </button>
          <button className="beta-label" onClick={() => setSourceOpen(true)}>
            <span className="signal-dot" />
            PRÉVERSION
          </button>
          <button className="header-icon" onClick={() => navigate("notifications")} aria-label="Notifications">
            <Bell size={19} />
          </button>
          <button className="header-avatar mobile-profile" onClick={() => navigate("profil")} aria-label="Mon profil">
            <span className="avatar">{initial}</span>
          </button>
          <button
            className="primary publish-top"
            onClick={() => {
              setDraft((p) => ({ ...p, place: place.name, lat: place.latitude, lon: place.longitude }));
              setComposer(true);
            }}
          >
            <Plus size={18} />
            <span>Observer</span>
          </button>
        </header>
        <main className={"main-surface " + (view === "atlas" ? "on-atlas" : "")}>
          <div style={{ display: view === "atlas" ? "block" : "none" }}>
            <Atlas
              place={place}
              items={allObservations}
              onSelect={setSelected}
              onPlace={setPlace}
              onPublish={() => setComposer(true)}
              onSources={() => setSourceOpen(true)}
              onImmersion={openImmersion}
              active={view === "atlas"}
            />
          </div>
          {view === "accueil" && (
            <div className="home-view">
              <Horizon
                onAtlas={() => navigate("atlas")}
                onImmersion={() => openImmersion(0)}
                onObserve={() => setComposer(true)}
              />
              <div className="page-content home-below">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">LE CIEL SE RACONTE À PLUSIEURS</p>
                    <h2>
                      À hauteur de regard<span className="mint">.</span>
                    </h2>
                  </div>
                  <button className="text-button" onClick={() => navigate("explorer")}>
                    Tout explorer
                    <ArrowUpRight size={16} />
                  </button>
                </div>
                <div className="photo-grid">{allObservations.slice(0, 3).map((o) => observationCard(o))}</div>
                <div className="bottom-pair">
                  <button className="feature-link" onClick={() => navigate("communautes")}>
                    <Users />
                    <div>
                      <h3>Trouvez votre communauté</h3>
                      <p>Le même ciel, des regards différents.</p>
                    </div>
                    <ChevronRight />
                  </button>
                  <button
                    className="feature-link"
                    onClick={() => {
                      setExploreTab("apprendre");
                      navigate("explorer");
                    }}
                  >
                    <BookOpen />
                    <div>
                      <h3>Comprendre ce que l’on voit</h3>
                      <p>Quelques repères pour lever les yeux.</p>
                    </div>
                    <ChevronRight />
                  </button>
                </div>
              </div>
            </div>
          )}
          {view === "explorer" && (
            <div className="page-content">
              <div className="page-heading">
                <div>
                  <p className="eyebrow">REGARDS CROISÉS</p>
                  <h1>
                    Le ciel n’a pas de frontières<span className="mint">.</span>
                  </h1>
                  <p>Des instants à découvrir. Des phénomènes à comprendre.</p>
                </div>
              </div>
              <Tabs value={exploreTab} onValueChange={setExploreTab}>
                <TabsList className="section-tabs">
                  <TabsTrigger value="observations">Observations</TabsTrigger>
                  <TabsTrigger value="medias">Galerie</TabsTrigger>
                  <TabsTrigger value="apprendre">Apprendre</TabsTrigger>
                  <TabsTrigger value="archives">Archives</TabsTrigger>
                </TabsList>
                <TabsContent value="observations">
                  <div className="filter-row">
                    {["Tous", "Nuages", "Orage", "Ciel remarquable"].map((f) => (
                      <button
                        key={f}
                        className={"filter-chip " + (filter === f ? "chosen" : "")}
                        onClick={() => setFilter(f)}
                      >
                        {f}
                      </button>
                    ))}
                    <span className="subtle">Photos d’exemple identifiées « Démo »</span>
                  </div>
                  <div className="photo-grid">
                    {allObservations
                      .filter((o) => filter === "Tous" || o.phenomenon === filter)
                      .map((o) => observationCard(o))}
                  </div>
                </TabsContent>
                <TabsContent value="medias">
                  <div className="gallery-grid">
                    {allObservations.map((o) => (
                      <button key={o.id} onClick={() => setSelected(o)}>
                        <img src={o.image || "/images/clouds.jpg"} alt={o.title} />
                        <span>
                          {o.title}
                          <small>{o.demo ? "Photographie illustrative" : o.place}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                </TabsContent>
                <TabsContent value="apprendre">
                  <div className="learning-grid">
                    {articles.map((a) => (
                      <button className="learning-card" key={a.id} onClick={() => setArticle(a)}>
                        <img src={a.image} alt="" />
                        <div>
                          <span className="eyebrow">{a.category}</span>
                          <h2>{a.title}</h2>
                          <span className="text-button">
                            Ouvrir la fiche
                            <ArrowUpRight size={17} />
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </TabsContent>
                <TabsContent value="archives">
                  <div className="empty-state">
                    <Radio size={38} />
                    <h2>Les épisodes laissent une trace.</h2>
                    <p>
                      Les récapitulatifs et Storm Rooms archivées trouveront leur place ici. Votre carnet conserve déjà
                      vos observations.
                    </p>
                    <button className="secondary" onClick={() => navigate("profil")}>
                      Ouvrir mon carnet
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
          {view === "communautes" && (
            <div className="page-content">
              {!community ? (
                <>
                  <div className="page-heading">
                    <div>
                      <p className="eyebrow">LE CIEL NOUS RASSEMBLE</p>
                      <h1>
                        Votre coin d’univers<span className="mint">.</span>
                      </h1>
                      <p>Des territoires, des passions, et des gens qui lèvent les yeux.</p>
                    </div>
                    <button className="primary" onClick={() => setCreateCommunity(true)}>
                      <Plus size={17} />
                      Créer une communauté
                    </button>
                  </div>
                  <div className="community-grid">
                    {allCommunities.map((c) => (
                      <article className="community-card" key={c.id}>
                        <button className="community-picture" onClick={() => openCommunity(c.id)}>
                          <img src={c.image} alt="" />
                          <span>{c.theme}</span>
                        </button>
                        <div>
                          <span className="community-emblem">{c.initials}</span>
                          <small>{c.area}</small>
                          <button onClick={() => openCommunity(c.id)}>
                            <h2>{c.name}</h2>
                          </button>
                          <p>{c.description}</p>
                          <footer>
                            <span>{c.owned ? "Votre communauté" : "Communauté de démonstration"}</span>
                            <button
                              className="round-button"
                              onClick={() => openCommunity(c.id)}
                              aria-label={"Explorer " + c.name}
                            >
                              <ArrowUpRight size={19} />
                            </button>
                          </footer>
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="community-note">
                    <Globe size={22} />
                    <div>
                      <h3>Comprendre un lieu commence par ceux qui l’observent.</h3>
                      <p>Explorez chaque communauté avant de la rejoindre. Votre espace de préversion reste privé.</p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <button className="back-link" onClick={() => setCommunityId(null)}>
                    <ArrowLeft size={16} />
                    Toutes les communautés
                  </button>
                  <div className="community-banner">
                    <img src={community.image} alt="" />
                    <span className="eyebrow">
                      {community.owned ? "VOTRE COMMUNAUTÉ" : "COMMUNAUTÉ DE DÉMONSTRATION"}
                    </span>
                  </div>
                  <div className="community-identity">
                    <span className="community-emblem large">{community.initials}</span>
                    <div>
                      <small>
                        <MapPin size={13} />
                        {community.area}
                      </small>
                      <h1>{community.name}</h1>
                      <p>{community.description}</p>
                    </div>
                    <button className="primary" onClick={() => join(community)}>
                      {records.some((r) => r.kind === "membership" && r.scope === community.id) ? (
                        <>
                          <Check size={17} />
                          Rejoint
                        </>
                      ) : (
                        <>
                          <Plus size={17} />
                          Rejoindre
                        </>
                      )}
                    </button>
                  </div>
                  <Tabs value={communityTab} onValueChange={setCommunityTab}>
                    <TabsList className="section-tabs community-tabs">
                      {[
                        ["accueil", "À la une"],
                        ["observations", "Observations"],
                        ["discussions", "Discussions"],
                        ["medias", "Médias"],
                        ["evenements", "Événements"],
                        ["ressources", "Ressources"],
                        ...(community.owned ? [["gestion", "Gestion"]] : []),
                      ].map(([v, l]) => (
                        <TabsTrigger value={v} key={v}>
                          {l}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    <TabsContent value="accueil">
                      <div className="community-home">
                        <div>
                          <div className="section-heading">
                            <h2>Les regards du territoire</h2>
                            <button
                              className="text-button"
                              onClick={() => {
                                setPlace(community.id === "opale" ? cities[1] : cities[0]);
                                navigate("atlas");
                              }}
                            >
                              Voir sur Atlas
                              <ArrowUpRight size={16} />
                            </button>
                          </div>
                          <div className="photo-grid two">
                            {allObservations
                              .filter((o) => o.community === community.id)
                              .slice(0, 2)
                              .map((o) => observationCard(o))}
                          </div>
                          {!allObservations.some((o) => o.community === community.id) && (
                            <div className="empty-state compact">
                              <Camera />
                              <h3>Votre première observation commence ici.</h3>
                              <button
                                className="primary"
                                onClick={() => {
                                  setDraft((d) => ({ ...d, community: community.id }));
                                  setComposer(true);
                                }}
                              >
                                Observer
                              </button>
                            </div>
                          )}
                        </div>
                        <aside className="community-about">
                          <h3>Bienvenue sous le même ciel</h3>
                          <p>
                            Observez, partagez et échangez avec curiosité. Une photo, une question ou un simple retour
                            du terrain ont leur place ici.
                          </p>
                          <button onClick={() => setCommunityTab("discussions")}>
                            <MessageCircle size={18} />
                            Faire connaissance
                            <ChevronRight size={16} />
                          </button>
                          <button onClick={() => setCommunityTab("ressources")}>
                            <ShieldCheck size={18} />
                            Règles & ressources
                            <ChevronRight size={16} />
                          </button>
                          <button onClick={() => setCommunityTab("evenements")}>
                            <CalendarDays size={18} />
                            Les rendez-vous
                            <ChevronRight size={16} />
                          </button>
                        </aside>
                      </div>
                    </TabsContent>
                    <TabsContent value="observations">
                      <div className="section-heading">
                        <h3>Observations de la communauté</h3>
                        <button
                          className="secondary"
                          onClick={() => {
                            setDraft((d) => ({ ...d, community: community.id }));
                            setComposer(true);
                          }}
                        >
                          <Plus size={16} />
                          Observer
                        </button>
                      </div>
                      <div className="photo-grid">
                        {allObservations.filter((o) => o.community === community.id).map((o) => observationCard(o))}
                      </div>
                    </TabsContent>
                    <TabsContent value="discussions">{discussion(community.id)}</TabsContent>
                    <TabsContent value="medias">
                      <div className="gallery-grid">
                        {allObservations
                          .filter((o) => o.community === community.id && o.image)
                          .map((o) => (
                            <button key={o.id} onClick={() => setSelected(o)}>
                              <img src={o.image} alt={o.title} />
                              <span>{o.title}</span>
                            </button>
                          ))}
                      </div>
                    </TabsContent>
                    <TabsContent value="evenements">{eventList(community.id)}</TabsContent>
                    <TabsContent value="ressources">
                      <div className="resource-layout">
                        <article className="resource-card">
                          <ShieldCheck />
                          <h2>Un espace de confiance</h2>
                          <p>
                            Partagez des observations honnêtes et datées. Respectez les autres et leurs images. Gardez
                            votre position approximative et distinguez toujours une observation d’une alerte officielle.
                          </p>
                          <p>
                            Les contenus de cette préversion sont visibles dans votre espace privé. Les fonctions de
                            diffusion publique et de modération partagée seront raccordées lors de l’ouverture.
                          </p>
                        </article>
                        {articles.slice(0, 2).map((a) => (
                          <button className="resource-card" key={a.id} onClick={() => setArticle(a)}>
                            <BookOpen />
                            <h3>{a.title}</h3>
                            <span className="text-button">
                              Lire
                              <ArrowUpRight size={16} />
                            </span>
                          </button>
                        ))}
                      </div>
                    </TabsContent>
                    {community.owned && (
                      <TabsContent value="gestion">
                        <div className="settings-layout">
                          <article>
                            <h2>Identité de la communauté</h2>
                            <form
                              onSubmit={async (e) => {
                                e.preventDefault();
                                const f = new FormData(e.currentTarget);
                                try {
                                  await save(
                                    "community",
                                    {
                                      ...community,
                                      name: String(f.get("name") || ""),
                                      description: String(f.get("description") || ""),
                                      area: String(f.get("area") || ""),
                                    },
                                    "",
                                    community.id,
                                  );
                                  toast.success("Communauté mise à jour");
                                } catch (err) {
                                  toast.error((err as Error).message);
                                }
                              }}
                            >
                              <label>
                                Nom
                                <Input name="name" defaultValue={community.name} required maxLength={70} />
                              </label>
                              <label>
                                Territoire
                                <Input name="area" defaultValue={community.area} required />
                              </label>
                              <label>
                                Description
                                <Textarea name="description" defaultValue={community.description} maxLength={500} />
                              </label>
                              <button className="primary">Enregistrer</button>
                            </form>
                          </article>
                          <article>
                            <h2>Membres & permissions</h2>
                            <div className="member-row">
                              <span className="avatar">{initial}</span>
                              <span>{displayName}</span>
                              <span className="tag">Propriétaire</span>
                            </div>
                            <p className="subtle">
                              La gestion de rôles partagés sera disponible lorsque d’autres membres pourront accéder à
                              votre communauté.
                            </p>
                            <h3>Signalements</h3>
                            <p className="subtle">
                              {records.filter((r) => r.kind === "report").length} signalement(s) enregistré(s) dans
                              votre espace.
                            </p>
                          </article>
                        </div>
                      </TabsContent>
                    )}
                  </Tabs>
                </>
              )}
            </div>
          )}
          {view === "messages" && (
            <div className="page-content">
              <div className="page-heading">
                <div>
                  <p className="eyebrow">LES CONVERSATIONS QUI COMPTENT</p>
                  <h1>
                    Messages<span className="mint">.</span>
                  </h1>
                </div>
              </div>
              <div className="messages-empty">
                <div className="message-illustration">
                  <MessageCircle size={55} strokeWidth={1} />
                </div>
                <h2>Tout commence par un échange.</h2>
                <p>
                  Vous n’avez pas encore de conversation privée.
                  <br />
                  La messagerie entre membres sera ouverte avec l’accès communautaire.
                </p>
                <button className="primary" onClick={() => navigate("communautes")}>
                  Explorer les communautés
                  <ArrowUpRight size={16} />
                </button>
                <span className="subtle">
                  <Lock size={13} />
                  Votre préversion est privée.
                </span>
              </div>
            </div>
          )}
          {view === "profil" && (
            <div className="page-content">
              <div className="profile-top">
                <div className="profile-avatar">{initial}</div>
                <div>
                  <p className="eyebrow">VOTRE REGARD SUR LE MONDE</p>
                  <h1>{displayName}</h1>
                  <p>
                    <MapPin size={14} />
                    {profile?.zone || "Hauts-de-France"}
                  </p>
                  {profile?.bio && <p>{profile.bio}</p>}
                </div>
                <button className="secondary" onClick={() => setProfileTab("settings")}>
                  <Settings size={16} />
                  Modifier mon profil
                </button>
              </div>
              <Tabs value={profileTab} onValueChange={setProfileTab}>
                <TabsList className="section-tabs">
                  <TabsTrigger value="carnet">
                    Mon carnet <span className="count">{myObservations.length}</span>
                  </TabsTrigger>
                  <TabsTrigger value="saved">
                    Enregistrés <span className="count">{savedIds.length}</span>
                  </TabsTrigger>
                  <TabsTrigger value="settings">Profil & confidentialité</TabsTrigger>
                </TabsList>
                <TabsContent value="carnet">
                  {myObservations.length ? (
                    <div className="photo-grid">{myObservations.map((o) => observationCard(o))}</div>
                  ) : (
                    <div className="empty-state">
                      <BookOpen size={39} />
                      <h2>Chaque ciel mérite une page.</h2>
                      <p>Vos observations, vos photos et vos souvenirs se retrouveront ici.</p>
                      <button className="primary" onClick={() => setComposer(true)}>
                        <Plus size={17} />
                        Ma première observation
                      </button>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="saved">
                  {savedIds.length ? (
                    <div className="photo-grid">
                      {allObservations.filter((o) => savedIds.includes(o.id)).map((o) => observationCard(o))}
                    </div>
                  ) : (
                    <div className="empty-state">
                      <Bookmark size={35} />
                      <h2>Gardez les instants qui vous inspirent.</h2>
                      <p>Enregistrez une observation pour la retrouver ici.</p>
                      <button className="secondary" onClick={() => navigate("explorer")}>
                        Explorer
                      </button>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="settings">
                  <div className="settings-layout">
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        try {
                          await save("profile", profileDraft, "", profile?.id);
                          toast.success("Profil enregistré");
                        } catch (err) {
                          toast.error((err as Error).message);
                        }
                      }}
                    >
                      <h2>Votre identité Weyra</h2>
                      <label>
                        Nom affiché
                        <Input
                          value={profileDraft.name}
                          onChange={(e) => setProfileDraft((p) => ({ ...p, name: e.target.value }))}
                          required
                          maxLength={70}
                        />
                      </label>
                      <label>
                        Territoire
                        <Input
                          value={profileDraft.zone}
                          onChange={(e) => setProfileDraft((p) => ({ ...p, zone: e.target.value }))}
                          maxLength={100}
                        />
                      </label>
                      <label>
                        Quelques mots sur vous
                        <Textarea
                          value={profileDraft.bio}
                          onChange={(e) => setProfileDraft((p) => ({ ...p, bio: e.target.value }))}
                          maxLength={500}
                        />
                      </label>
                      <button className="primary">Enregistrer mon profil</button>
                    </form>
                    <article>
                      <ShieldCheck className="mint" size={28} />
                      <h2>Votre vie privée, par défaut.</h2>
                      <p>
                        La position d’une observation est arrondie avant son enregistrement. Vous voyez le lieu choisi
                        avant de publier.
                      </p>
                      <p>
                        Les photos ajoutées depuis cette interface sont redimensionnées et réencodées pour retirer leurs
                        métadonnées d’origine.
                      </p>
                      <p>Cette version de test conserve vos publications et vos photos dans ce navigateur.</p>
                      <Link className="text-button" href="/legal/confidentialite">
                        Confidentialité
                        <ArrowUpRight size={16} />
                      </Link>
                    </article>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
          {view === "notifications" && (
            <div className="page-content">
              <div className="page-heading">
                <div>
                  <p className="eyebrow">RESTER AU COURANT, SEREINEMENT</p>
                  <h1>
                    Votre activité<span className="mint">.</span>
                  </h1>
                  <p>Les informations utiles, au bon moment.</p>
                </div>
              </div>
              <div className="settings-layout">
                <article>
                  <h2>Dernières activités</h2>
                  {records
                    .filter((r) => ["observation", "membership", "event"].includes(r.kind))
                    .slice(0, 10)
                    .map((r) => (
                      <div className="activity-row" key={r.id}>
                        <span className="activity-icon">
                          {r.kind === "observation" ? (
                            <Camera size={19} />
                          ) : r.kind === "event" ? (
                            <CalendarDays size={19} />
                          ) : (
                            <Users size={19} />
                          )}
                        </span>
                        <div>
                          <strong>{r.title || r.name}</strong>
                          <p>
                            {r.kind === "membership"
                              ? "Communauté ajoutée"
                              : r.kind === "event"
                                ? "Événement créé"
                                : "Observation enregistrée"}
                          </p>
                          <small>{new Date(r.createdAt).toLocaleString("fr-FR")}</small>
                        </div>
                      </div>
                    ))}
                  {!records.some((r) => ["observation", "membership", "event"].includes(r.kind)) && (
                    <div className="empty-state compact">
                      <Bell size={30} />
                      <h3>Tout est calme pour le moment.</h3>
                      <p>Vos prochaines contributions apparaîtront ici.</p>
                    </div>
                  )}
                </article>
                <article>
                  <h2>À votre rythme</h2>
                  {(
                    [
                      ["notifyLocal", "Activité locale", "Autour des lieux que vous suivez"],
                      ["notifyCommunity", "Communautés", "Les nouveautés de vos espaces"],
                      ["quiet", "Heures calmes", "De 22 h à 8 h"],
                    ] as const
                  ).map(([k, t, d]) => (
                    <label className="preference-row" key={k}>
                      <span>
                        <strong>{t}</strong>
                        <small>{d}</small>
                      </span>
                      <Switch
                        checked={!!prefs[k]}
                        onCheckedChange={async (v) => {
                          try {
                            await save("preferences", { ...prefs, [k]: v }, "", prefs.id);
                          } catch (e) {
                            toast.error((e as Error).message);
                          }
                        }}
                      />
                    </label>
                  ))}
                  <p className="subtle">
                    Vos préférences sont enregistrées. Les notifications push et alertes automatiques ne sont pas encore
                    raccordées.
                  </p>
                  <a
                    className="official-link"
                    href="https://vigilance.meteofrance.fr/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ShieldCheck size={17} />
                    Consulter la vigilance Météo-France
                    <ArrowUpRight size={16} />
                  </a>
                </article>
              </div>
            </div>
          )}
        </main>
        <nav className="mobile-nav" aria-label="Navigation principale">
          {navigation.map((n) => (
            <button key={n.id} className={view === n.id ? "active" : ""} onClick={() => navigate(n.id)}>
              <n.icon size={21} />
              <span>{n.name}</span>
            </button>
          ))}
        </nav>
      </div>
      <SkyStory
        items={allObservations}
        index={storyIndex}
        open={immersive}
        onClose={() => setImmersive(false)}
        onMap={(o) => {
          setImmersive(false);
          setPlace({ name: o.place, latitude: o.lat, longitude: o.lon });
          navigate("atlas");
        }}
        onDetails={(o) => {
          setImmersive(false);
          setSelected(o);
        }}
      />
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="search-dialog">
          <DialogHeader>
            <DialogTitle>Un lieu, un horizon.</DialogTitle>
            <DialogDescription>Rechercher une ville ou retrouver une communauté.</DialogDescription>
          </DialogHeader>
          <Command shouldFilter={false}>
            <CommandInput value={search} onValueChange={setSearch} placeholder="Lille, Dunkerque, Bordeaux…" />
            <CommandList>
              <CommandGroup heading="Lieux">
                {(search.length < 2 ? cities : searchResults).map((p: Place) => (
                  <CommandItem
                    key={p.id || p.name}
                    value={String(p.id || p.name)}
                    onSelect={() => {
                      setPlace(p);
                      navigate("atlas");
                      setSearchOpen(false);
                    }}
                  >
                    <MapPin size={17} />
                    <span>
                      {p.name}
                      <small className="search-region">{p.admin1 || p.country || "France"}</small>
                    </span>
                    <ArrowUpRight size={15} />
                  </CommandItem>
                ))}
                {searching && <div className="search-status">Recherche…</div>}
              </CommandGroup>
              <CommandGroup heading="Communautés">
                {allCommunities
                  .filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()))
                  .map((c) => (
                    <CommandItem
                      key={c.id}
                      onSelect={() => {
                        openCommunity(c.id);
                        setSearchOpen(false);
                      }}
                    >
                      <Users size={17} />
                      {c.name}
                    </CommandItem>
                  ))}
              </CommandGroup>
              {!searching && (
                <CommandEmpty>
                  {searchError
                    ? "La recherche est indisponible. Réessayez dans un instant."
                    : "Aucun résultat. Essayez une autre ville."}
                </CommandEmpty>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
      <Dialog open={composer} onOpenChange={setComposer}>
        <DialogContent className="compose-dialog">
          <DialogHeader>
            <span className="eyebrow">VOTRE REGARD COMPTE</span>
            <DialogTitle>Qu’est-ce qui se passe là-haut ?</DialogTitle>
            <DialogDescription>Une observation, un instant. Ajoutez-le à votre ciel.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              publish();
            }}
          >
            <div className="phenomena-grid">
              {phenomena.map((p) => (
                <button
                  type="button"
                  key={p}
                  className={draft.phenomenon === p ? "chosen" : ""}
                  onClick={() => setDraft((d) => ({ ...d, phenomenon: p }))}
                >
                  {p === "Orage" ? (
                    <CloudRain size={18} />
                  ) : p === "Vent" ? (
                    <Wind size={18} />
                  ) : p === "Ciel remarquable" ? (
                    <CloudSun size={18} />
                  ) : (
                    <Cloud size={18} />
                  )}
                  <span>{p}</span>
                </button>
              ))}
            </div>
            <label>
              Titre
              <Input
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                placeholder="Ce qui vous a fait lever les yeux…"
                maxLength={120}
                required
              />
            </label>
            <div className="intensity-control">
              <span>
                Intensité <b>{["", "Légère", "Modérée", "Marquée", "Forte", "Très forte"][draft.intensity]}</b>
              </span>
              <Slider
                min={1}
                max={5}
                step={1}
                value={[draft.intensity]}
                onValueChange={(v) => setDraft((d) => ({ ...d, intensity: v[0] }))}
                aria-label="Intensité du phénomène"
              />
            </div>
            <label className="photo-drop">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  if (e.target.files?.[0]) preparePhoto(e.target.files[0]);
                }}
              />
              {photoPreview ? (
                <img src={photoPreview} alt="Votre photo avant publication" />
              ) : (
                <>
                  <ImagePlus size={26} />
                  <strong>Ajouter une photo</strong>
                  <span>Facultatif · JPEG, PNG ou WebP</span>
                </>
              )}
            </label>
            <label>
              Votre observation
              <Textarea
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                placeholder="Quelques mots sur ce que vous voyez…"
                maxLength={1000}
              />
            </label>
            <div className="form-pair">
              <label>
                Lieu approximatif
                <Select
                  value={cities.some((c) => c.name === draft.place) ? draft.place : "selected"}
                  onValueChange={(v) => {
                    const p = cities.find((c) => c.name === v);
                    if (p) setDraft((d) => ({ ...d, place: p.name, lat: p.latitude, lon: p.longitude }));
                  }}
                >
                  <SelectTrigger>
                    <MapPin size={15} />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {!cities.some((c) => c.name === draft.place) && (
                      <SelectItem value="selected">{draft.place}</SelectItem>
                    )}
                    {cities.map((c) => (
                      <SelectItem key={c.name} value={c.name}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label>
                Communauté
                <Select value={draft.community} onValueChange={(v) => setDraft((d) => ({ ...d, community: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allCommunities.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>
            <div className="privacy-note">
              <Lock size={16} />
              <span>
                Votre espace privé · Position arrondie : {draft.lat.toFixed(2)}, {draft.lon.toFixed(2)}. Aucune adresse
                publiée.
              </span>
            </div>
            <button className="primary full-width" type="submit" disabled={saving}>
              {saving ? (
                <>
                  <LoaderCircle className="spin" size={17} />
                  Enregistrement…
                </>
              ) : (
                <>
                  <Plus size={17} />
                  Enregistrer mon observation
                </>
              )}
            </button>
          </form>
        </DialogContent>
      </Dialog>
      <Sheet
        open={!!selected}
        onOpenChange={(v) => {
          if (!v) setSelected(null);
        }}
      >
        <SheetContent className="observation-sheet">
          {selected && (
            <>
              <img className="detail-photo" src={selected.image || "/images/clouds.jpg"} alt={selected.title} />
              <SheetHeader>
                <div className="detail-tags">
                  <span className="tag">{selected.phenomenon}</span>
                  {selected.demo && <span className="tag demo">Démonstration</span>}
                </div>
                <SheetTitle>{selected.title}</SheetTitle>
                <SheetDescription>
                  <MapPin size={14} />
                  {selected.place} ·{" "}
                  {selected.demo ? "Lieu illustratif" : new Date(selected.time).toLocaleString("fr-FR")}
                </SheetDescription>
              </SheetHeader>
              <div className="detail-body">
                <div className="author-line">
                  <span className="avatar">{selected.author?.[0]}</span>
                  <span>
                    {selected.author}
                    <small>Observation communautaire</small>
                  </span>
                </div>
                <p>{selected.description}</p>
                <div className="detail-actions">
                  <button
                    className="primary"
                    onClick={() => {
                      setPlace({ name: selected.place, latitude: selected.lat, longitude: selected.lon });
                      navigate("atlas");
                      setSelected(null);
                    }}
                  >
                    <Map size={16} />
                    Voir sur Atlas
                  </button>
                  <button className="secondary" onClick={() => bookmark(selected)}>
                    <Bookmark size={17} />
                    {savedIds.includes(selected.id) ? "Enregistré" : "Enregistrer"}
                  </button>
                </div>
                {selected.community && (
                  <button
                    className="detail-community"
                    onClick={() => {
                      openCommunity(selected.community!);
                      setSelected(null);
                    }}
                  >
                    <Users size={18} />
                    {allCommunities.find((c) => c.id === selected.community)?.name || "Communauté"}
                    <ChevronRight size={17} />
                  </button>
                )}
                <h3>Au sujet de cette observation</h3>
                {records
                  .filter((r) => r.kind === "comment" && r.scope === selected.id)
                  .map((c) => (
                    <div className="comment" key={c.id}>
                      <strong>{displayName}</strong>
                      <p>{c.text}</p>
                    </div>
                  ))}
                <form
                  className="comment-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!comment.trim()) return;
                    try {
                      await save("comment", { text: comment }, selected.id);
                      setComment("");
                    } catch (err) {
                      toast.error((err as Error).message);
                    }
                  }}
                >
                  <Textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Ajouter un commentaire…"
                    aria-label="Commentaire"
                    maxLength={2000}
                  />
                  <button className="secondary" disabled={!comment.trim()}>
                    <Send size={15} />
                    Ajouter
                  </button>
                </form>
                <div className="detail-foot">
                  <button onClick={() => setReport(true)}>
                    <Flag size={14} />
                    Signaler
                  </button>
                  {selected.owner && (
                    <button onClick={() => setConfirmDelete(selected.id)}>
                      <Trash2 size={14} />
                      Supprimer
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
      <Dialog open={sourceOpen} onOpenChange={setSourceOpen}>
        <DialogContent className="source-dialog">
          <DialogHeader>
            <DialogTitle>Un ciel lisible. Des sources claires.</DialogTitle>
            <DialogDescription>Weyra · test local</DialogDescription>
          </DialogHeader>
          <div className="source-row">
            <Map />
            <div>
              <h3>Le territoire</h3>
              <p>
                Carte vectorielle MapLibre avec OpenFreeMap. Un fond OpenStreetMap prend le relais lorsque WebGL n’est
                pas disponible.
              </p>
              <a href="https://openfreemap.org/" target="_blank" rel="noreferrer">
                OpenFreeMap ↗
              </a>
            </div>
          </div>
          <div className="source-row">
            <CloudRain />
            <div>
              <h3>Le radar</h3>
              <p>
                Les scans Météo-France et EUMETNET OPERA proviennent du moteur radar de Weyra. Seuls les packs prêts
                sont affichés, avec leur source et leur heure. Les images ne constituent pas une vigilance officielle.
              </p>
              <a href="/status/radar" target="_blank" rel="noreferrer">
                État du radar ↗
              </a>
            </div>
          </div>
          <div className="source-row">
            <CloudSun />
            <div>
              <h3>La météo locale</h3>
              <p>Conditions et prévisions modélisées Open-Meteo. Une donnée indisponible reste signalée comme telle.</p>
              <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
                Open-Meteo ↗
              </a>
            </div>
          </div>
          <div className="source-row">
            <Camera />
            <div>
              <h3>Les regards</h3>
              <p>
                Les six observations « Démo » et les communautés d’exemple illustrent l’interface. Leurs lieux ne
                décrivent pas la prise de vue. Photos : Greg Johnson, Ceco Petrov et FUTC / Unsplash.
              </p>
            </div>
          </div>
          <div className="privacy-note">
            <Lock size={18} />
            <span>
              Vos créations restent dans ce navigateur pour les tests. La messagerie entre membres, les Storm Rooms
              synchronisées et les notifications push ne sont pas encore activées.
            </span>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={createCommunity} onOpenChange={setCreateCommunity}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Un nouveau lieu pour se retrouver.</DialogTitle>
            <DialogDescription>Créez votre communauté dans votre espace privé.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              try {
                const c = await save("community", communityDraft);
                setCreateCommunity(false);
                setCommunityDraft({ name: "", area: "", description: "" });
                openCommunity(c.id);
                toast.success("Votre communauté est créée");
              } catch (err) {
                toast.error((err as Error).message);
              } finally {
                setSaving(false);
              }
            }}
          >
            <label>
              Nom
              <Input
                value={communityDraft.name}
                onChange={(e) => setCommunityDraft((c) => ({ ...c, name: e.target.value }))}
                required
                maxLength={70}
                placeholder="Les observateurs de…"
              />
            </label>
            <label>
              Territoire ou thème
              <Input
                value={communityDraft.area}
                onChange={(e) => setCommunityDraft((c) => ({ ...c, area: e.target.value }))}
                required
                maxLength={100}
              />
            </label>
            <label>
              Votre raison de vous retrouver
              <Textarea
                value={communityDraft.description}
                onChange={(e) => setCommunityDraft((c) => ({ ...c, description: e.target.value }))}
                required
                maxLength={500}
              />
            </label>
            <button className="primary full-width" disabled={saving}>
              {saving ? "Création…" : "Créer ma communauté"}
            </button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={createEvent} onOpenChange={setCreateEvent}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Un rendez-vous sous le même ciel.</DialogTitle>
            <DialogDescription>Organisez un événement dans votre communauté.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await save("event", eventDraft, communityId || "nord");
                setCreateEvent(false);
                setEventDraft({ title: "", date: "", place: "", description: "" });
                toast.success("Événement enregistré");
              } catch (err) {
                toast.error((err as Error).message);
              }
            }}
          >
            <label>
              Titre
              <Input
                value={eventDraft.title}
                onChange={(e) => setEventDraft((d) => ({ ...d, title: e.target.value }))}
                required
                maxLength={100}
              />
            </label>
            <label>
              Date et heure (heure locale)
              <Input
                type="datetime-local"
                value={eventDraft.date}
                onChange={(e) => setEventDraft((d) => ({ ...d, date: e.target.value }))}
                required
              />
            </label>
            <label>
              Lieu ou lien de rendez-vous
              <Input
                value={eventDraft.place}
                onChange={(e) => setEventDraft((d) => ({ ...d, place: e.target.value }))}
                required
                maxLength={200}
              />
            </label>
            <label>
              Programme
              <Textarea
                value={eventDraft.description}
                onChange={(e) => setEventDraft((d) => ({ ...d, description: e.target.value }))}
                maxLength={1500}
              />
            </label>
            <button className="primary full-width">Créer l’événement</button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!article}
        onOpenChange={(v) => {
          if (!v) setArticle(null);
        }}
      >
        <DialogContent className="article-dialog">
          {article && (
            <>
              <img src={article.image} alt="" />
              <DialogHeader>
                <p className="eyebrow">{article.category}</p>
                <DialogTitle>{article.title}</DialogTitle>
                <DialogDescription>Les repères Weyra</DialogDescription>
              </DialogHeader>
              <p>{article.body}</p>
              {article.source && (
                <a className="text-button" href={article.source} target="_blank" rel="noreferrer">
                  Consulter la source
                  <ArrowUpRight size={16} />
                </a>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={report} onOpenChange={setReport}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Signaler cette observation</DialogTitle>
            <DialogDescription>Le signalement sera conservé dans votre espace de préversion.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await save("report", { reason: reportText, title: selected?.title }, selected?.id);
                setReport(false);
                setReportText("");
                toast.success("Signalement enregistré");
              } catch (err) {
                toast.error((err as Error).message);
              }
            }}
          >
            <label>
              Que souhaitez-vous signaler ?
              <Textarea value={reportText} onChange={(e) => setReportText(e.target.value)} required maxLength={1500} />
            </label>
            <button className="primary full-width">Enregistrer le signalement</button>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(v) => {
          if (!v) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette observation ?</AlertDialogTitle>
            <AlertDialogDescription>Elle sera retirée d’Atlas et de votre carnet.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="dialog-actions">
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <button
              className="danger-button"
              onClick={async () => {
                try {
                  await remove(confirmDelete!);
                  setConfirmDelete(null);
                  setSelected(null);
                  toast.success("Observation supprimée");
                } catch (err) {
                  toast.error((err as Error).message);
                }
              }}
            >
              Supprimer
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
      {stateError && !loading && (
        <div className="connection-status">
          <span>Enregistrement indisponible</span>
          <button onClick={load}>Réessayer</button>
        </div>
      )}
      <Toaster theme="dark" richColors position="bottom-right" />
    </div>
  );
}
