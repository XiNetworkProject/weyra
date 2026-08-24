"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_PRODUCT_STATE,
  localProductRepository,
} from "@/lib/product-repository";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  completeSupabaseLesson,
  deleteSupabaseNotebookEntry,
  hydrateSupabaseProduct,
  insertSupabaseComment,
  insertSupabaseCommunityMessage,
  insertSupabaseDirectMessage,
  insertSupabaseNotebookEntry,
  insertSupabaseRoomMessage,
  loadSupabaseProductCatalog,
  LOCAL_PRODUCT_BACKEND,
  markSupabaseNotificationsRead,
  recordSupabasePostShare,
  reportSupabaseObservation,
  syncSupabaseAuthorFollow,
  syncSupabaseCommunityFavorite,
  syncSupabaseCommunityMembership,
  syncSupabaseCommunityNotification,
  syncSupabasePostBookmark,
  syncSupabasePostLike,
  syncSupabasePreferences,
  syncSupabaseProfile,
  syncSupabaseRoomMembership,
  syncSupabaseSpaceFollow,
  type ProductBackendState,
} from "@/lib/supabase/product-sync";
import type {
  AlertPreferences,
  Community,
  CommunityAccess,
  CommunityMessage,
  CommunityNotificationMode,
  CommunitySpace,
  CommunitySpaceType,
  CommunityTemplate,
  DirectMessage,
  LocalModerationDecision,
  NotebookEntry,
  ProductComment,
  ProductProfile,
  ProductSettings,
  RoomMessage,
  WeyraProductState,
} from "@/lib/product-domain";

type WeyraProductContextValue = {
  ready: boolean;
  backend: ProductBackendState;
  state: WeyraProductState;
  completeOnboarding(): void;
  togglePostLike(postId: string): void;
  recordPostShare(postId: string): void;
  togglePostBookmark(postId: string): void;
  toggleAuthorFollow(authorId: string): void;
  toggleRoom(roomId: string): void;
  toggleCommunityMembership(communityId: string): void;
  toggleCommunityFavorite(communityId: string): void;
  setCommunityNotificationMode(communityId: string, mode: CommunityNotificationMode): void;
  toggleSpaceFollow(spaceId: string): void;
  completeLesson(lessonId: string): void;
  markActivityRead(ids: string[]): void;
  reportObservation(observationId: string): void;
  hideObservation(observationId: string): void;
  addComment(targetId: string, body: string): ProductComment | null;
  addRoomMessage(roomId: string, body: string): RoomMessage | null;
  addCommunityMessage(spaceId: string, communityId: string, body: string, replyToId?: string): CommunityMessage | null;
  addDirectMessage(conversationId: string, body: string): DirectMessage | null;
  markNotificationsRead(ids: string[]): void;
  assignMemberRole(memberId: string, roleId: string): void;
  resolveModerationCase(caseId: string, action: LocalModerationDecision["action"]): void;
  createCommunity(input: {
    name: string;
    description: string;
    territory: string;
    access: CommunityAccess;
    template: CommunityTemplate;
  }): Community | null;
  createCommunitySpace(input: {
    communityId: string;
    sectionId: string;
    name: string;
    description: string;
    type: CommunitySpaceType;
    visibility: CommunitySpace["visibility"];
  }): CommunitySpace | null;
  addNotebookEntry(entry: Omit<NotebookEntry, "id" | "createdAt">): NotebookEntry;
  removeNotebookEntry(entryId: string): void;
  updateProfile(patch: Partial<ProductProfile>): void;
  updateAlertPreferences(patch: Partial<AlertPreferences>): void;
  updateSettings(patch: Partial<ProductSettings>): void;
  resetLocalProduct(): void;
};

const WeyraProductContext = createContext<WeyraProductContextValue | null>(null);

function toggleId(items: string[], id: string) {
  return items.includes(id) ? items.filter((item) => item !== id) : [...items, id];
}

function mergeRecordsById<T extends { id: string }>(...collections: T[][]) {
  const merged = new Map<string, T>();
  collections.flat().forEach((item) => merged.set(item.id, item));
  return [...merged.values()];
}

export default function WeyraProductProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<WeyraProductState>(DEFAULT_PRODUCT_STATE);
  const [backend, setBackend] = useState<ProductBackendState>(() => (
    isSupabaseConfigured()
      ? { configured: true, status: "connecting", userId: null, email: null }
      : LOCAL_PRODUCT_BACKEND
  ));
  const stateRef = useRef<WeyraProductState>(DEFAULT_PRODUCT_STATE);
  const demoStateRef = useRef<WeyraProductState>(DEFAULT_PRODUCT_STATE);
  const backendRef = useRef<ProductBackendState>(backend);

  useEffect(() => {
    const stored = localProductRepository.load();
    demoStateRef.current = stored;
    stateRef.current = stored;
    setState(stored);
    setReady(true);

    const updateBackend = (next: ProductBackendState) => {
      backendRef.current = next;
      setBackend(next);
    };
    const unsubscribeLocal = localProductRepository.subscribe((next) => {
      if (backendRef.current.status === "authenticated") return;
      demoStateRef.current = next;
      stateRef.current = next;
      setState(next);
    });

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      updateBackend(LOCAL_PRODUCT_BACKEND);
      return unsubscribeLocal;
    }

    let cancelled = false;
    let hydrationRun = 0;

    const hydrate = async (showConnecting = true) => {
      const run = ++hydrationRun;
      if (showConnecting) {
        updateBackend({ configured: true, status: "connecting", userId: null, email: null });
      }
      const [result, catalog] = await Promise.all([
        hydrateSupabaseProduct(demoStateRef.current),
        loadSupabaseProductCatalog(),
      ]);
      if (cancelled || run !== hydrationRun) return;
      const hydratedState: WeyraProductState = {
        ...result.state,
        remoteAuthors: catalog.authors,
        remotePosts: catalog.posts,
        createdCommunities: mergeRecordsById(
          catalog.communities,
          result.state.createdCommunities,
        ),
        createdCommunitySpaces: mergeRecordsById(
          catalog.spaces,
          result.state.createdCommunitySpaces,
        ),
      };
      updateBackend(result.backend);
      stateRef.current = hydratedState;
      setState(hydratedState);
    };

    void hydrate();
    const authSubscription = supabase.auth.onAuthStateChange((event) => {
      if (event === "INITIAL_SESSION") return;
      if (event === "SIGNED_OUT") {
        hydrationRun += 1;
        const local = demoStateRef.current;
        stateRef.current = local;
        setState(local);
        updateBackend({ configured: true, status: "anonymous", userId: null, email: null });
        return;
      }
      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        window.setTimeout(() => void hydrate(), 0);
      }
    });
    let realtimeRefresh: number | undefined;
    const scheduleCatalogRefresh = () => {
      window.clearTimeout(realtimeRefresh);
      realtimeRefresh = window.setTimeout(() => void hydrate(false), 300);
    };
    const catalogChannel = supabase
      .channel("weyra-product-catalog-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, scheduleCatalogRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "communities" }, scheduleCatalogRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "community_spaces" }, scheduleCatalogRefresh)
      .subscribe();

    return () => {
      cancelled = true;
      window.clearTimeout(realtimeRefresh);
      unsubscribeLocal();
      authSubscription.data.subscription.unsubscribe();
      void supabase.removeChannel(catalogChannel);
    };
  }, []);

  const commit = useCallback((update: (current: WeyraProductState) => WeyraProductState) => {
    const next = update(stateRef.current);
    stateRef.current = next;
    setState(next);
    if (backendRef.current.status !== "authenticated") {
      demoStateRef.current = next;
      localProductRepository.save(next);
    }
  }, []);

  const completeOnboarding = useCallback(() => {
    commit((current) => ({ ...current, onboardingComplete: true }));
    void syncSupabaseProfile(stateRef.current.profile, true);
  }, [commit]);

  const togglePostLike = useCallback((postId: string) => {
    const active = !stateRef.current.likedPostIds.includes(postId);
    commit((current) => ({ ...current, likedPostIds: toggleId(current.likedPostIds, postId) }));
    const userId = backendRef.current.userId;
    if (userId) void syncSupabasePostLike(userId, postId, active);
  }, [commit]);

  const recordPostShare = useCallback((postId: string) => {
    const firstShare = !stateRef.current.sharedPostIds.includes(postId);
    commit((current) => ({
      ...current,
      sharedPostIds: current.sharedPostIds.includes(postId)
        ? current.sharedPostIds
        : [...current.sharedPostIds, postId].slice(-500),
    }));
    const userId = backendRef.current.userId;
    if (userId && firstShare) void recordSupabasePostShare(userId, postId);
  }, [commit]);

  const togglePostBookmark = useCallback((postId: string) => {
    const active = !stateRef.current.bookmarkedPostIds.includes(postId);
    commit((current) => ({ ...current, bookmarkedPostIds: toggleId(current.bookmarkedPostIds, postId) }));
    const userId = backendRef.current.userId;
    if (userId) void syncSupabasePostBookmark(userId, postId, active);
  }, [commit]);

  const toggleAuthorFollow = useCallback((authorId: string) => {
    const active = !stateRef.current.followedAuthorIds.includes(authorId);
    commit((current) => ({ ...current, followedAuthorIds: toggleId(current.followedAuthorIds, authorId) }));
    const userId = backendRef.current.userId;
    if (userId) void syncSupabaseAuthorFollow(userId, authorId, active);
  }, [commit]);

  const toggleRoom = useCallback((roomId: string) => {
    const active = !stateRef.current.joinedRoomIds.includes(roomId);
    commit((current) => ({ ...current, joinedRoomIds: toggleId(current.joinedRoomIds, roomId) }));
    const userId = backendRef.current.userId;
    if (userId) void syncSupabaseRoomMembership(userId, roomId, active);
  }, [commit]);

  const toggleCommunityMembership = useCallback((communityId: string) => {
    const active = !stateRef.current.joinedCommunityIds.includes(communityId);
    commit((current) => ({
      ...current,
      joinedCommunityIds: toggleId(current.joinedCommunityIds, communityId),
    }));
    const userId = backendRef.current.userId;
    if (userId) void syncSupabaseCommunityMembership(userId, communityId, active);
  }, [commit]);

  const toggleCommunityFavorite = useCallback((communityId: string) => {
    const active = !stateRef.current.favoriteCommunityIds.includes(communityId);
    commit((current) => ({
      ...current,
      favoriteCommunityIds: toggleId(current.favoriteCommunityIds, communityId),
    }));
    const userId = backendRef.current.userId;
    if (userId) void syncSupabaseCommunityFavorite(userId, communityId, active);
  }, [commit]);

  const setCommunityNotificationMode = useCallback((communityId: string, mode: CommunityNotificationMode) => {
    commit((current) => ({
      ...current,
      communityNotificationModes: {
        ...current.communityNotificationModes,
        [communityId]: mode,
      },
    }));
    const userId = backendRef.current.userId;
    if (userId) void syncSupabaseCommunityNotification(userId, communityId, mode);
  }, [commit]);

  const toggleSpaceFollow = useCallback((spaceId: string) => {
    const active = !stateRef.current.followedSpaceIds.includes(spaceId);
    commit((current) => ({
      ...current,
      followedSpaceIds: toggleId(current.followedSpaceIds, spaceId),
    }));
    const userId = backendRef.current.userId;
    if (userId) void syncSupabaseSpaceFollow(userId, spaceId, active);
  }, [commit]);

  const completeLesson = useCallback((lessonId: string) => {
    commit((current) => ({
      ...current,
      completedLessonIds: current.completedLessonIds.includes(lessonId)
        ? current.completedLessonIds
        : [...current.completedLessonIds, lessonId],
    }));
    const userId = backendRef.current.userId;
    if (userId) void completeSupabaseLesson(userId, lessonId);
  }, [commit]);

  const markActivityRead = useCallback((ids: string[]) => {
    commit((current) => ({
      ...current,
      readActivityIds: [...new Set([...current.readActivityIds, ...ids])].slice(-500),
    }));
  }, [commit]);

  const reportObservation = useCallback((observationId: string) => {
    commit((current) => ({
      ...current,
      reportedObservationIds: current.reportedObservationIds.includes(observationId)
        ? current.reportedObservationIds
        : [...current.reportedObservationIds, observationId],
    }));
    const userId = backendRef.current.userId;
    if (userId) void reportSupabaseObservation(userId, observationId);
  }, [commit]);

  const hideObservation = useCallback((observationId: string) => {
    commit((current) => ({
      ...current,
      hiddenObservationIds: current.hiddenObservationIds.includes(observationId)
        ? current.hiddenObservationIds
        : [...current.hiddenObservationIds, observationId],
    }));
  }, [commit]);

  const addComment = useCallback((targetId: string, body: string) => {
    const cleanBody = body.trim().slice(0, 500);
    if (!cleanBody) return null;
    const comment: ProductComment = {
      id: crypto.randomUUID(),
      authorId: state.profile.id,
      authorName: state.profile.displayName,
      body: cleanBody,
      createdAt: new Date().toISOString(),
    };
    commit((current) => ({
      ...current,
      commentsByTarget: {
        ...current.commentsByTarget,
        [targetId]: [...(current.commentsByTarget[targetId] ?? []), comment],
      },
    }));
    const userId = backendRef.current.userId;
    if (userId) {
      const observationPrefix = "observation:";
      if (targetId.startsWith(observationPrefix)) {
        void insertSupabaseComment(userId, targetId.slice(observationPrefix.length), "observation", cleanBody);
      } else {
        void insertSupabaseComment(userId, targetId, "post", cleanBody);
      }
    }
    return comment;
  }, [commit, state.profile.displayName, state.profile.id]);

  const addRoomMessage = useCallback((roomId: string, body: string) => {
    const cleanBody = body.trim().slice(0, 500);
    if (!cleanBody) return null;
    const message: RoomMessage = {
      id: crypto.randomUUID(),
      roomId,
      authorId: state.profile.id,
      authorName: state.profile.displayName,
      body: cleanBody,
      createdAt: new Date().toISOString(),
      kind: "message",
    };
    commit((current) => ({ ...current, roomMessages: [...current.roomMessages, message].slice(-300) }));
    const userId = backendRef.current.userId;
    if (userId) void insertSupabaseRoomMessage(userId, roomId, message.id, cleanBody);
    return message;
  }, [commit, state.profile.displayName, state.profile.id]);

  const addCommunityMessage = useCallback((spaceId: string, communityId: string, body: string, replyToId?: string) => {
    const cleanBody = body.trim().slice(0, 1_500);
    if (!cleanBody) return null;
    const message: CommunityMessage = {
      id: crypto.randomUUID(),
      communityId,
      spaceId,
      authorId: state.profile.id,
      authorName: state.profile.displayName,
      authorInitials: state.profile.initials,
      body: cleanBody,
      createdAt: new Date().toISOString(),
      kind: "message",
      replyToId,
      local: true,
    };
    commit((current) => ({
      ...current,
      communityMessages: [...current.communityMessages, message].slice(-600),
    }));
    const userId = backendRef.current.userId;
    if (userId) {
      void insertSupabaseCommunityMessage(
        userId,
        communityId,
        spaceId,
        message.id,
        cleanBody,
        replyToId,
      );
    }
    return message;
  }, [commit, state.profile.displayName, state.profile.id, state.profile.initials]);

  const addDirectMessage = useCallback((conversationId: string, body: string) => {
    const cleanBody = body.trim().slice(0, 1_500);
    if (!cleanBody) return null;
    const message: DirectMessage = {
      id: crypto.randomUUID(),
      conversationId,
      authorId: state.profile.id,
      authorName: state.profile.displayName,
      body: cleanBody,
      createdAt: new Date().toISOString(),
      local: true,
    };
    commit((current) => ({
      ...current,
      directMessages: [...current.directMessages, message].slice(-600),
    }));
    const userId = backendRef.current.userId;
    if (userId) void insertSupabaseDirectMessage(userId, conversationId, message.id, cleanBody);
    return message;
  }, [commit, state.profile.displayName, state.profile.id]);

  const markNotificationsRead = useCallback((ids: string[]) => {
    commit((current) => ({
      ...current,
      readNotificationIds: [...new Set([...current.readNotificationIds, ...ids])].slice(-1_000),
    }));
    const userId = backendRef.current.userId;
    if (userId) void markSupabaseNotificationsRead(userId, ids);
  }, [commit]);

  const assignMemberRole = useCallback((memberId: string, roleId: string) => {
    commit((current) => ({
      ...current,
      memberRoleOverrides: {
        ...current.memberRoleOverrides,
        [memberId]: roleId,
      },
    }));
  }, [commit]);

  const resolveModerationCase = useCallback((caseId: string, action: LocalModerationDecision["action"]) => {
    commit((current) => ({
      ...current,
      moderationDecisions: {
        ...current.moderationDecisions,
        [caseId]: { action, decidedAt: new Date().toISOString() },
      },
    }));
  }, [commit]);

  const createCommunity = useCallback((input: {
    name: string;
    description: string;
    territory: string;
    access: CommunityAccess;
    template: CommunityTemplate;
  }) => {
    const name = input.name.trim().slice(0, 60);
    const description = input.description.trim().slice(0, 180);
    const territory = input.territory.trim().slice(0, 80);
    if (!name || !description || !territory) return null;
    const id = `community-local-${crypto.randomUUID()}`;
    const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
    const community: Community = {
      id,
      slug: name.toLocaleLowerCase("fr-FR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      name,
      initials,
      description,
      about: description,
      territory,
      themes: ["Local"],
      access: input.access,
      template: input.template,
      memberCount: 1,
      activeCount: 1,
      observationCount: 0,
      verified: false,
      bannerUrl: "/media/observations/arcus-champs.webp",
      accent: "#65d8f3",
      center: { lat: 50.6292, lon: 3.0573 },
      rules: [
        "Respecter les personnes et les informations sensibles.",
        "Distinguer les observations des informations officielles.",
      ],
      featuredSpaceIds: [],
      createdLocally: true,
    };
    commit((current) => ({
      ...current,
      createdCommunities: [community, ...current.createdCommunities].slice(0, 20),
      joinedCommunityIds: [...new Set([...current.joinedCommunityIds, community.id])],
    }));
    return community;
  }, [commit]);

  const createCommunitySpace = useCallback((input: {
    communityId: string;
    sectionId: string;
    name: string;
    description: string;
    type: CommunitySpaceType;
    visibility: CommunitySpace["visibility"];
  }) => {
    const name = input.name.trim().slice(0, 48);
    const description = input.description.trim().slice(0, 120);
    if (!name || !description) return null;
    const space: CommunitySpace = {
      id: `space-local-${crypto.randomUUID()}`,
      communityId: input.communityId,
      sectionId: input.sectionId,
      name,
      description,
      type: input.type,
      visibility: input.visibility,
      unreadCount: 0,
      createdLocally: true,
    };
    commit((current) => ({
      ...current,
      createdCommunitySpaces: [...current.createdCommunitySpaces, space].slice(-120),
    }));
    return space;
  }, [commit]);

  const addNotebookEntry = useCallback((input: Omit<NotebookEntry, "id" | "createdAt">) => {
    const entry: NotebookEntry = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    commit((current) => ({ ...current, notebookEntries: [entry, ...current.notebookEntries].slice(0, 100) }));
    const userId = backendRef.current.userId;
    if (userId) void insertSupabaseNotebookEntry(userId, entry);
    return entry;
  }, [commit]);

  const removeNotebookEntry = useCallback((entryId: string) => {
    commit((current) => ({
      ...current,
      notebookEntries: current.notebookEntries.filter((entry) => entry.id !== entryId),
    }));
    const userId = backendRef.current.userId;
    if (userId) void deleteSupabaseNotebookEntry(userId, entryId);
  }, [commit]);

  const updateProfile = useCallback((patch: Partial<ProductProfile>) => {
    commit((current) => ({ ...current, profile: { ...current.profile, ...patch } }));
    void syncSupabaseProfile(stateRef.current.profile, stateRef.current.onboardingComplete);
  }, [commit]);

  const updateAlertPreferences = useCallback((patch: Partial<AlertPreferences>) => {
    commit((current) => ({
      ...current,
      alertPreferences: { ...current.alertPreferences, ...patch },
    }));
    const userId = backendRef.current.userId;
    if (userId) {
      void syncSupabasePreferences(userId, stateRef.current.alertPreferences, stateRef.current.settings);
    }
  }, [commit]);

  const updateSettings = useCallback((patch: Partial<ProductSettings>) => {
    commit((current) => ({ ...current, settings: { ...current.settings, ...patch } }));
    const userId = backendRef.current.userId;
    if (userId) {
      void syncSupabasePreferences(userId, stateRef.current.alertPreferences, stateRef.current.settings);
    }
  }, [commit]);

  const resetLocalProduct = useCallback(() => {
    const reset = localProductRepository.reset();
    stateRef.current = reset;
    setState(reset);
  }, []);

  const value = useMemo<WeyraProductContextValue>(() => ({
    ready,
    backend,
    state,
    completeOnboarding,
    togglePostLike,
    recordPostShare,
    togglePostBookmark,
    toggleAuthorFollow,
    toggleRoom,
    toggleCommunityMembership,
    toggleCommunityFavorite,
    setCommunityNotificationMode,
    toggleSpaceFollow,
    completeLesson,
    markActivityRead,
    reportObservation,
    hideObservation,
    addComment,
    addRoomMessage,
    addCommunityMessage,
    addDirectMessage,
    markNotificationsRead,
    assignMemberRole,
    resolveModerationCase,
    createCommunity,
    createCommunitySpace,
    addNotebookEntry,
    removeNotebookEntry,
    updateProfile,
    updateAlertPreferences,
    updateSettings,
    resetLocalProduct,
  }), [
    addComment,
    addCommunityMessage,
    addDirectMessage,
    addNotebookEntry,
    addRoomMessage,
    backend,
    completeLesson,
    completeOnboarding,
    createCommunity,
    createCommunitySpace,
    hideObservation,
    markActivityRead,
    markNotificationsRead,
    ready,
    recordPostShare,
    removeNotebookEntry,
    reportObservation,
    resolveModerationCase,
    resetLocalProduct,
    state,
    toggleAuthorFollow,
    toggleCommunityFavorite,
    toggleCommunityMembership,
    togglePostBookmark,
    togglePostLike,
    toggleRoom,
    toggleSpaceFollow,
    setCommunityNotificationMode,
    assignMemberRole,
    updateAlertPreferences,
    updateProfile,
    updateSettings,
  ]);

  return <WeyraProductContext.Provider value={value}>{children}</WeyraProductContext.Provider>;
}

export function useWeyraProduct() {
  const value = useContext(WeyraProductContext);
  if (!value) throw new Error("useWeyraProduct must be used inside WeyraProductProvider");
  return value;
}
