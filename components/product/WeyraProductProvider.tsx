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

export default function WeyraProductProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<WeyraProductState>(DEFAULT_PRODUCT_STATE);
  const stateRef = useRef<WeyraProductState>(DEFAULT_PRODUCT_STATE);

  useEffect(() => {
    const stored = localProductRepository.load();
    stateRef.current = stored;
    setState(stored);
    setReady(true);
    return localProductRepository.subscribe((next) => {
      stateRef.current = next;
      setState(next);
    });
  }, []);

  const commit = useCallback((update: (current: WeyraProductState) => WeyraProductState) => {
    const next = update(stateRef.current);
    stateRef.current = next;
    setState(next);
    localProductRepository.save(next);
  }, []);

  const completeOnboarding = useCallback(() => {
    commit((current) => ({ ...current, onboardingComplete: true }));
  }, [commit]);

  const togglePostLike = useCallback((postId: string) => {
    commit((current) => ({ ...current, likedPostIds: toggleId(current.likedPostIds, postId) }));
  }, [commit]);

  const recordPostShare = useCallback((postId: string) => {
    commit((current) => ({
      ...current,
      sharedPostIds: current.sharedPostIds.includes(postId)
        ? current.sharedPostIds
        : [...current.sharedPostIds, postId].slice(-500),
    }));
  }, [commit]);

  const togglePostBookmark = useCallback((postId: string) => {
    commit((current) => ({ ...current, bookmarkedPostIds: toggleId(current.bookmarkedPostIds, postId) }));
  }, [commit]);

  const toggleAuthorFollow = useCallback((authorId: string) => {
    commit((current) => ({ ...current, followedAuthorIds: toggleId(current.followedAuthorIds, authorId) }));
  }, [commit]);

  const toggleRoom = useCallback((roomId: string) => {
    commit((current) => ({ ...current, joinedRoomIds: toggleId(current.joinedRoomIds, roomId) }));
  }, [commit]);

  const toggleCommunityMembership = useCallback((communityId: string) => {
    commit((current) => ({
      ...current,
      joinedCommunityIds: toggleId(current.joinedCommunityIds, communityId),
    }));
  }, [commit]);

  const toggleCommunityFavorite = useCallback((communityId: string) => {
    commit((current) => ({
      ...current,
      favoriteCommunityIds: toggleId(current.favoriteCommunityIds, communityId),
    }));
  }, [commit]);

  const setCommunityNotificationMode = useCallback((communityId: string, mode: CommunityNotificationMode) => {
    commit((current) => ({
      ...current,
      communityNotificationModes: {
        ...current.communityNotificationModes,
        [communityId]: mode,
      },
    }));
  }, [commit]);

  const toggleSpaceFollow = useCallback((spaceId: string) => {
    commit((current) => ({
      ...current,
      followedSpaceIds: toggleId(current.followedSpaceIds, spaceId),
    }));
  }, [commit]);

  const completeLesson = useCallback((lessonId: string) => {
    commit((current) => ({
      ...current,
      completedLessonIds: current.completedLessonIds.includes(lessonId)
        ? current.completedLessonIds
        : [...current.completedLessonIds, lessonId],
    }));
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
    return message;
  }, [commit, state.profile.displayName, state.profile.id]);

  const markNotificationsRead = useCallback((ids: string[]) => {
    commit((current) => ({
      ...current,
      readNotificationIds: [...new Set([...current.readNotificationIds, ...ids])].slice(-1_000),
    }));
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
    return entry;
  }, [commit]);

  const removeNotebookEntry = useCallback((entryId: string) => {
    commit((current) => ({
      ...current,
      notebookEntries: current.notebookEntries.filter((entry) => entry.id !== entryId),
    }));
  }, [commit]);

  const updateProfile = useCallback((patch: Partial<ProductProfile>) => {
    commit((current) => ({ ...current, profile: { ...current.profile, ...patch } }));
  }, [commit]);

  const updateAlertPreferences = useCallback((patch: Partial<AlertPreferences>) => {
    commit((current) => ({
      ...current,
      alertPreferences: { ...current.alertPreferences, ...patch },
    }));
  }, [commit]);

  const updateSettings = useCallback((patch: Partial<ProductSettings>) => {
    commit((current) => ({ ...current, settings: { ...current.settings, ...patch } }));
  }, [commit]);

  const resetLocalProduct = useCallback(() => {
    const reset = localProductRepository.reset();
    stateRef.current = reset;
    setState(reset);
  }, []);

  const value = useMemo<WeyraProductContextValue>(() => ({
    ready,
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
