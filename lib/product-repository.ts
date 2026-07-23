"use client";

import type {
  Community,
  CommunityMessage,
  CommunityNotificationMode,
  CommunitySpace,
  DirectMessage,
  LocalModerationDecision,
  NotebookEntry,
  ProductComment,
  ProductProfile,
  ProductRepository,
  RoomMessage,
  WeyraProductState,
} from "@/lib/product-domain";

const STORAGE_KEY = "weyra-product-local-v3";
const LEGACY_STORAGE_KEY = "weyra-product-local-v2";
const STORAGE_EVENT = "weyra-product-local-change";

const DEFAULT_PROFILE: ProductProfile = {
  id: "local-user",
  displayName: "XimaM",
  handle: "@ximam",
  initials: "XM",
  region: "Lille · Hauts-de-France",
  role: "member",
  accent: "#62f2dc",
  bio: "J'observe le ciel du Nord et je documente les épisodes qui comptent.",
  interests: ["orage", "pluie", "foudre", "nuage"],
  joinedAt: "2026-07-01T12:00:00.000Z",
  observationCount: 7,
  confirmedCount: 19,
};

export const DEFAULT_PRODUCT_STATE: WeyraProductState = {
  version: 3,
  demoMode: true,
  onboardingComplete: false,
  profile: DEFAULT_PROFILE,
  likedPostIds: [],
  sharedPostIds: [],
  bookmarkedPostIds: [],
  followedAuthorIds: ["author-lena", "author-opale"],
  joinedRoomIds: [],
  completedLessonIds: [],
  readActivityIds: [],
  hiddenObservationIds: [],
  reportedObservationIds: [],
  commentsByTarget: {},
  roomMessages: [],
  notebookEntries: [],
  joinedCommunityIds: ["community-nord", "community-opale"],
  favoriteCommunityIds: ["community-nord"],
  followedSpaceIds: ["space-nord-observations", "space-nord-general"],
  communityNotificationModes: {
    "community-nord": "essential",
    "community-opale": "custom",
  },
  communityMessages: [],
  directMessages: [],
  readNotificationIds: [],
  memberRoleOverrides: {},
  moderationDecisions: {},
  createdCommunities: [],
  createdCommunitySpaces: [],
  alertPreferences: {
    enabled: true,
    radiusKm: 20,
    quietHours: true,
    quietFrom: "23:00",
    quietTo: "07:00",
    phenomena: ["orage", "pluie", "grêle", "rafales"],
    communityActivity: true,
    officialInformation: true,
    dailyRecap: false,
  },
  settings: {
    compactMode: false,
    reduceMotion: false,
    highContrast: false,
    temperatureUnit: "celsius",
    windUnit: "kmh",
    locale: "fr-FR",
  },
};

function stringArray(value: unknown, limit = 500) {
  return Array.isArray(value) ? [...new Set(value.map(String))].slice(0, limit) : [];
}

function recordsByUniqueId<T extends { id: string }>(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [] as T[];
  const seen = new Set<string>();
  const result: T[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const id = String((entry as { id?: unknown }).id ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push({ ...(entry as T), id });
  }
  return result.slice(-limit);
}

function normalizeComments(value: unknown): Record<string, ProductComment[]> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, ProductComment[]> = {};
  for (const [target, comments] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(comments)) continue;
    result[target] = recordsByUniqueId<ProductComment>(comments.flatMap((entry): ProductComment[] => {
      if (!entry || typeof entry !== "object") return [];
      const comment = entry as Record<string, unknown>;
      const body = typeof comment.body === "string" ? comment.body.trim().slice(0, 500) : "";
      if (!body) return [];
      return [{
        id: String(comment.id ?? crypto.randomUUID()),
        authorId: String(comment.authorId ?? "local-user"),
        authorName: String(comment.authorName ?? DEFAULT_PROFILE.displayName),
        body,
        createdAt: typeof comment.createdAt === "string" ? comment.createdAt : new Date().toISOString(),
      }];
    }), 100);
  }
  return result;
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key, item]) => key && typeof item === "string")
      .map(([key, item]) => [key.slice(0, 120), String(item).slice(0, 120)]),
  );
}

function normalizeNotificationModes(value: unknown): Record<string, CommunityNotificationMode> {
  const allowed = new Set<CommunityNotificationMode>(["all", "essential", "custom", "silent"]);
  return Object.fromEntries(
    Object.entries(normalizeStringRecord(value))
      .filter(([, mode]) => allowed.has(mode as CommunityNotificationMode)),
  ) as Record<string, CommunityNotificationMode>;
}

function normalizeModerationDecisions(value: unknown): Record<string, LocalModerationDecision> {
  if (!value || typeof value !== "object") return {};
  const allowed = new Set<LocalModerationDecision["action"]>(["educate", "limit", "warn", "suspend", "ban", "dismiss"]);
  const result: Record<string, LocalModerationDecision> = {};
  for (const [caseId, rawDecision] of Object.entries(value as Record<string, unknown>)) {
    if (!rawDecision || typeof rawDecision !== "object") continue;
    const decision = rawDecision as Partial<LocalModerationDecision>;
    if (!decision.action || !allowed.has(decision.action)) continue;
    result[caseId.slice(0, 120)] = {
      action: decision.action,
      decidedAt: typeof decision.decidedAt === "string" ? decision.decidedAt : new Date().toISOString(),
    };
  }
  return result;
}

function normalizeState(value: unknown): WeyraProductState {
  if (!value || typeof value !== "object") return DEFAULT_PRODUCT_STATE;
  const source = value as Partial<WeyraProductState>;
  const profileSource = source.profile && typeof source.profile === "object" ? source.profile : DEFAULT_PROFILE;
  const alertSource = source.alertPreferences && typeof source.alertPreferences === "object"
    ? source.alertPreferences
    : DEFAULT_PRODUCT_STATE.alertPreferences;
  const settingsSource = source.settings && typeof source.settings === "object"
    ? source.settings
    : DEFAULT_PRODUCT_STATE.settings;

  return {
    ...DEFAULT_PRODUCT_STATE,
    onboardingComplete: Boolean(source.onboardingComplete),
    profile: {
      ...DEFAULT_PROFILE,
      ...profileSource,
      displayName: String(profileSource.displayName ?? DEFAULT_PROFILE.displayName).trim().slice(0, 32) || DEFAULT_PROFILE.displayName,
      handle: String(profileSource.handle ?? DEFAULT_PROFILE.handle).trim().slice(0, 32) || DEFAULT_PROFILE.handle,
      bio: String(profileSource.bio ?? DEFAULT_PROFILE.bio).trim().slice(0, 240),
      region: String(profileSource.region ?? DEFAULT_PROFILE.region).trim().slice(0, 60),
      interests: Array.isArray(profileSource.interests) ? profileSource.interests.slice(0, 8) : DEFAULT_PROFILE.interests,
    },
    likedPostIds: stringArray(source.likedPostIds),
    sharedPostIds: stringArray(source.sharedPostIds),
    bookmarkedPostIds: stringArray(source.bookmarkedPostIds),
    followedAuthorIds: stringArray(source.followedAuthorIds),
    joinedRoomIds: stringArray(source.joinedRoomIds),
    completedLessonIds: stringArray(source.completedLessonIds),
    readActivityIds: stringArray(source.readActivityIds),
    hiddenObservationIds: stringArray(source.hiddenObservationIds),
    reportedObservationIds: stringArray(source.reportedObservationIds),
    commentsByTarget: normalizeComments(source.commentsByTarget),
    roomMessages: recordsByUniqueId<RoomMessage>(source.roomMessages, 300),
    notebookEntries: recordsByUniqueId<NotebookEntry>(
      Array.isArray(source.notebookEntries) ? [...source.notebookEntries].reverse() : [],
      100,
    ).reverse(),
    joinedCommunityIds: Array.isArray(source.joinedCommunityIds)
      ? stringArray(source.joinedCommunityIds, 100)
      : DEFAULT_PRODUCT_STATE.joinedCommunityIds,
    favoriteCommunityIds: Array.isArray(source.favoriteCommunityIds)
      ? stringArray(source.favoriteCommunityIds, 100)
      : DEFAULT_PRODUCT_STATE.favoriteCommunityIds,
    followedSpaceIds: Array.isArray(source.followedSpaceIds)
      ? stringArray(source.followedSpaceIds, 300)
      : DEFAULT_PRODUCT_STATE.followedSpaceIds,
    communityNotificationModes: {
      ...DEFAULT_PRODUCT_STATE.communityNotificationModes,
      ...normalizeNotificationModes(source.communityNotificationModes),
    },
    communityMessages: recordsByUniqueId<CommunityMessage>(source.communityMessages, 600),
    directMessages: recordsByUniqueId<DirectMessage>(source.directMessages, 600),
    readNotificationIds: stringArray(source.readNotificationIds, 1000),
    memberRoleOverrides: normalizeStringRecord(source.memberRoleOverrides),
    moderationDecisions: normalizeModerationDecisions(source.moderationDecisions),
    createdCommunities: recordsByUniqueId<Community>(source.createdCommunities, 20),
    createdCommunitySpaces: recordsByUniqueId<CommunitySpace>(source.createdCommunitySpaces, 120),
    alertPreferences: {
      ...DEFAULT_PRODUCT_STATE.alertPreferences,
      ...alertSource,
      radiusKm: Math.max(2, Math.min(100, Number(alertSource.radiusKm) || 20)),
      phenomena: Array.isArray(alertSource.phenomena)
        ? alertSource.phenomena.slice(0, 12)
        : DEFAULT_PRODUCT_STATE.alertPreferences.phenomena,
    },
    settings: {
      ...DEFAULT_PRODUCT_STATE.settings,
      ...settingsSource,
    },
  };
}

function loadLocalState() {
  if (typeof window === "undefined") return DEFAULT_PRODUCT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
    return normalizeState(JSON.parse(raw ?? "null"));
  } catch {
    return DEFAULT_PRODUCT_STATE;
  }
}

export const localProductRepository: ProductRepository = {
  load: loadLocalState,
  save(state) {
    if (typeof window === "undefined") return;
    const normalized = normalizeState(state);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent<WeyraProductState>(STORAGE_EVENT, { detail: normalized }));
  },
  reset() {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      window.dispatchEvent(new CustomEvent<WeyraProductState>(STORAGE_EVENT, { detail: DEFAULT_PRODUCT_STATE }));
    }
    return DEFAULT_PRODUCT_STATE;
  },
  subscribe(listener) {
    if (typeof window === "undefined") return () => undefined;
    const onLocal = (event: Event) => {
      const detail = (event as CustomEvent<WeyraProductState>).detail;
      listener(detail ? normalizeState(detail) : loadLocalState());
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) listener(loadLocalState());
    };
    window.addEventListener(STORAGE_EVENT, onLocal);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(STORAGE_EVENT, onLocal);
      window.removeEventListener("storage", onStorage);
    };
  },
};
