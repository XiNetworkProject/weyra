"use client";

import type {
  AlertPreferences,
  Community,
  CommunityNotificationMode,
  CommunitySpace,
  NotebookEntry,
  ProductAuthor,
  ProductPost,
  ProductProfile,
  ProductSettings,
  WeyraProductState,
} from "@/lib/product-domain";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { ObservationCategory } from "@/lib/types";

export type ProductBackendStatus =
  | "local"
  | "connecting"
  | "anonymous"
  | "authenticated"
  | "error";

export type ProductBackendState = {
  configured: boolean;
  status: ProductBackendStatus;
  userId: string | null;
  email: string | null;
};

export const LOCAL_PRODUCT_BACKEND: ProductBackendState = {
  configured: false,
  status: "local",
  userId: null,
  email: null,
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AnyRow = Record<string, unknown>;

export type SupabaseProductCatalog = {
  authors: ProductAuthor[];
  posts: ProductPost[];
  communities: Community[];
  spaces: CommunitySpace[];
};

function rows(value: unknown): AnyRow[] {
  return Array.isArray(value)
    ? value.filter((item): item is AnyRow => Boolean(item && typeof item === "object"))
    : [];
}

function remoteCategory(value: unknown): ObservationCategory | null {
  const normalized = value === "grele" ? "grêle" : value;
  return typeof normalized === "string" ? normalized as ObservationCategory : null;
}

function databaseCategory(value: ObservationCategory) {
  return value === "grêle" ? "grele" : value;
}

function remoteCategories(value: unknown) {
  return Array.isArray(value)
    ? value.map(remoteCategory).filter((item): item is ObservationCategory => item !== null)
    : [];
}

function stringIds(value: unknown, key: string) {
  return rows(value)
    .map((row) => row[key])
    .filter((item): item is string => typeof item === "string");
}

function profileRole(value: unknown): ProductProfile["role"] {
  return value === "reliable" || value === "creator" || value === "association"
    ? value
    : "member";
}

function firstRelation(value: unknown): AnyRow | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === "object" ? first as AnyRow : null;
  }
  return value && typeof value === "object" ? value as AnyRow : null;
}

async function catalogMediaUrl(value: unknown) {
  const media = firstRelation(value);
  const bucket = media?.bucket_id;
  const path = media?.object_path;
  if (typeof bucket !== "string" || typeof path !== "string") return null;

  const supabase = createSupabaseBrowserClient();
  if (!supabase) return null;
  if (bucket === "weyra-public-media") {
    return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }

  const signed = await supabase.storage.from(bucket).createSignedUrl(path, 900);
  return signed.data?.signedUrl ?? null;
}

function catalogAuthor(profile: AnyRow | null): ProductAuthor | null {
  if (!profile || typeof profile.id !== "string") return null;
  const displayName = String(profile.display_name ?? "Membre Weyra");
  return {
    id: profile.id,
    displayName,
    handle: `@${String(profile.handle ?? "membre")}`,
    initials: initials(displayName),
    region: String(profile.region ?? ""),
    role: profileRole(profile.role),
    accent: String(profile.accent ?? "#62f2dc"),
  };
}

export async function loadSupabaseProductCatalog(): Promise<SupabaseProductCatalog> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return { authors: [], posts: [], communities: [], spaces: [] };

  const [postsResult, communitiesResult, spacesResult] = await Promise.all([
    supabase
      .from("posts")
      .select(`
        id,
        author_id,
        observation_id,
        kind,
        title,
        body,
        place,
        latitude,
        longitude,
        phenomena,
        useful,
        like_count,
        comment_count,
        share_count,
        published_at,
        created_at,
        profiles!posts_author_id_fkey (
          id,
          display_name,
          handle,
          region,
          role,
          accent
        ),
        post_media (
          position,
          media_assets (
            bucket_id,
            object_path
          )
        )
      `)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("communities")
      .select(`
        id,
        slug,
        name,
        initials,
        description,
        about,
        territory,
        themes,
        access,
        template,
        member_count,
        active_count,
        observation_count,
        verified,
        accent,
        center_latitude,
        center_longitude,
        rules,
        featured_space_ids,
        media_assets!communities_banner_media_id_fkey (
          bucket_id,
          object_path
        )
      `)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("community_spaces")
      .select("id,community_id,section_id,name,description,type,visibility,live,archived_at")
      .is("archived_at", null)
      .order("display_order", { ascending: true })
      .limit(500),
  ]);

  const authorsById = new Map<string, ProductAuthor>();
  const posts = (
    await Promise.all(rows(postsResult.data).map(async (row): Promise<ProductPost | null> => {
      const author = catalogAuthor(firstRelation(row.profiles));
      const lat = Number(row.latitude);
      const lon = Number(row.longitude);
      if (!author || typeof row.id !== "string" || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        return null;
      }
      authorsById.set(author.id, author);

      const mediaLink = firstRelation(row.post_media);
      const media = mediaLink ? await catalogMediaUrl(mediaLink.media_assets) : null;
      const phenomena = remoteCategories(row.phenomena);
      const kind = ["observation", "photo", "analysis", "question", "recap"].includes(String(row.kind))
        ? row.kind as ProductPost["kind"]
        : "observation";

      return {
        id: row.id,
        authorId: author.id,
        kind,
        title: String(row.title ?? ""),
        body: String(row.body ?? ""),
        imageUrl: media ?? undefined,
        place: String(row.place ?? ""),
        lat,
        lon,
        phenomena: phenomena.length ? phenomena : ["nuage"],
        publishedAt: String(row.published_at ?? row.created_at ?? new Date().toISOString()),
        likes: Math.max(0, Number(row.like_count) || 0),
        comments: Math.max(0, Number(row.comment_count) || 0),
        shares: Math.max(0, Number(row.share_count) || 0),
        observationId: typeof row.observation_id === "string" ? row.observation_id : undefined,
        useful: Boolean(row.useful),
      };
    }))
  ).filter((post): post is ProductPost => post !== null);

  const communities = (
    await Promise.all(rows(communitiesResult.data).map(async (row): Promise<Community | null> => {
      const lat = Number(row.center_latitude);
      const lon = Number(row.center_longitude);
      if (typeof row.id !== "string" || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      const bannerUrl = await catalogMediaUrl(row.media_assets);
      const access = ["public", "request", "private"].includes(String(row.access))
        ? row.access as Community["access"]
        : "public";
      const template = ["local", "weather", "association", "media", "field", "photography", "event"].includes(String(row.template))
        ? row.template as Community["template"]
        : "local";

      return {
        id: row.id,
        slug: String(row.slug ?? row.id),
        name: String(row.name ?? "Communaute Weyra"),
        initials: String(row.initials ?? "WY"),
        description: String(row.description ?? ""),
        about: String(row.about ?? ""),
        territory: String(row.territory ?? ""),
        themes: Array.isArray(row.themes) ? row.themes.map(String) : [],
        access,
        template,
        memberCount: Math.max(0, Number(row.member_count) || 0),
        activeCount: Math.max(0, Number(row.active_count) || 0),
        observationCount: Math.max(0, Number(row.observation_count) || 0),
        verified: Boolean(row.verified),
        bannerUrl: bannerUrl ?? "/media/observations/arcus-champs.webp",
        accent: String(row.accent ?? "#55c2ff"),
        center: { lat, lon },
        rules: Array.isArray(row.rules) ? row.rules.map(String) : [],
        featuredSpaceIds: Array.isArray(row.featured_space_ids) ? row.featured_space_ids.map(String) : [],
      };
    }))
  ).filter((community): community is Community => community !== null);

  const spaces = rows(spacesResult.data).flatMap((row): CommunitySpace[] => {
    if (typeof row.id !== "string" || typeof row.community_id !== "string" || typeof row.section_id !== "string") return [];
    const type = String(row.type) as CommunitySpace["type"];
    const visibility = String(row.visibility) as CommunitySpace["visibility"];
    return [{
      id: row.id,
      communityId: row.community_id,
      sectionId: row.section_id,
      name: String(row.name ?? ""),
      description: String(row.description ?? ""),
      type,
      visibility,
      unreadCount: 0,
      live: Boolean(row.live),
      archived: Boolean(row.archived_at),
    }];
  });

  return {
    authors: [...authorsById.values()],
    posts,
    communities,
    spaces,
  };
}

function timeValue(value: unknown, fallback: string) {
  return typeof value === "string" && value ? value.slice(0, 5) : fallback;
}

function initials(displayName: string) {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase() || "WY";
}

export async function hydrateSupabaseProduct(base: WeyraProductState): Promise<{
  backend: ProductBackendState;
  state: WeyraProductState;
}> {
  const configured = isSupabaseConfigured();
  const supabase = createSupabaseBrowserClient();
  if (!configured || !supabase) {
    return { backend: LOCAL_PRODUCT_BACKEND, state: { ...base, demoMode: true } };
  }

  const userResult = await supabase.auth.getUser();
  const user = userResult.data.user;
  if (!user) {
    return {
      backend: { configured: true, status: "anonymous", userId: null, email: null },
      state: { ...base, demoMode: true },
    };
  }

  const [
    profileResult,
    preferencesResult,
    notebookResult,
    membershipsResult,
    favoritesResult,
    followedSpacesResult,
    progressResult,
    postLikesResult,
    savedPostsResult,
    followedAuthorsResult,
    joinedRoomsResult,
    notificationModesResult,
    sharedPostsResult,
    observationCountResult,
    confirmationCountResult,
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("profile_preferences").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("notebook_entries").select("id,title,note,place,created_at,observation_id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
    supabase.from("community_members").select("community_id").eq("user_id", user.id).eq("status", "joined"),
    supabase.from("favorite_communities").select("community_id").eq("user_id", user.id),
    supabase.from("followed_spaces").select("space_id").eq("user_id", user.id),
    supabase.from("lesson_progress").select("lesson_id").eq("user_id", user.id).eq("progress", 100),
    supabase.from("post_likes").select("post_id").eq("user_id", user.id),
    supabase.from("saved_content").select("post_id").eq("user_id", user.id).not("post_id", "is", null),
    supabase.from("user_follows").select("followed_id").eq("follower_id", user.id),
    supabase.from("room_members").select("room_id").eq("user_id", user.id).is("left_at", null),
    supabase.from("community_notification_preferences").select("community_id,mode").eq("user_id", user.id),
    supabase.from("post_shares").select("post_id").eq("user_id", user.id),
    supabase.from("observations").select("id", { count: "exact", head: true }).eq("author_id", user.id),
    supabase.from("observation_confirmations").select("observation_id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);

  const profile = profileResult.data as AnyRow | null;
  if (!profile) {
    return {
      backend: { configured: true, status: "error", userId: user.id, email: user.email ?? null },
      state: { ...base, demoMode: true },
    };
  }

  const preferences = preferencesResult.data as AnyRow | null;
  const displayName = typeof profile.display_name === "string" ? profile.display_name : base.profile.displayName;
  const profileInterests = remoteCategories(profile.interests);
  const alertPhenomena = remoteCategories(preferences?.alert_phenomena);
  const remoteNotebook: NotebookEntry[] = rows(notebookResult.data).map((entry) => ({
    id: String(entry.id),
    title: String(entry.title ?? ""),
    note: String(entry.note ?? ""),
    place: String(entry.place ?? ""),
    createdAt: String(entry.created_at ?? new Date().toISOString()),
    observationId: typeof entry.observation_id === "string" ? entry.observation_id : undefined,
  }));
  const notificationModes = Object.fromEntries(
    rows(notificationModesResult.data)
      .filter((row) => (
        typeof row.community_id === "string"
        && ["all", "essential", "custom", "silent"].includes(String(row.mode))
      ))
      .map((row) => [String(row.community_id), String(row.mode)]),
  ) as Record<string, CommunityNotificationMode>;

  const next: WeyraProductState = {
    ...base,
    demoMode: false,
    onboardingComplete: Boolean(profile.onboarding_completed),
    profile: {
      ...base.profile,
      id: user.id,
      displayName,
      handle: `@${String(profile.handle ?? "membre")}`,
      initials: initials(displayName),
      region: String(profile.region ?? ""),
      role: profileRole(profile.role),
      accent: String(profile.accent ?? base.profile.accent),
      bio: String(profile.bio ?? ""),
      interests: profileInterests.length ? profileInterests : base.profile.interests,
      joinedAt: String(profile.created_at ?? base.profile.joinedAt),
      observationCount: observationCountResult.count ?? 0,
      confirmedCount: confirmationCountResult.count ?? 0,
    },
    notebookEntries: remoteNotebook,
    likedPostIds: [
      ...new Set([...base.likedPostIds, ...stringIds(postLikesResult.data, "post_id")]),
    ],
    sharedPostIds: [
      ...new Set([...base.sharedPostIds, ...stringIds(sharedPostsResult.data, "post_id")]),
    ],
    bookmarkedPostIds: [
      ...new Set([...base.bookmarkedPostIds, ...stringIds(savedPostsResult.data, "post_id")]),
    ],
    followedAuthorIds: [
      ...new Set([...base.followedAuthorIds, ...stringIds(followedAuthorsResult.data, "followed_id")]),
    ],
    joinedRoomIds: [
      ...new Set([...base.joinedRoomIds, ...stringIds(joinedRoomsResult.data, "room_id")]),
    ],
    joinedCommunityIds: [
      ...new Set([...base.joinedCommunityIds, ...stringIds(membershipsResult.data, "community_id")]),
    ],
    favoriteCommunityIds: [
      ...new Set([...base.favoriteCommunityIds, ...stringIds(favoritesResult.data, "community_id")]),
    ],
    followedSpaceIds: [
      ...new Set([...base.followedSpaceIds, ...stringIds(followedSpacesResult.data, "space_id")]),
    ],
    completedLessonIds: [
      ...new Set([...base.completedLessonIds, ...stringIds(progressResult.data, "lesson_id")]),
    ],
    communityNotificationModes: {
      ...base.communityNotificationModes,
      ...notificationModes,
    },
    alertPreferences: preferences ? {
      ...base.alertPreferences,
      enabled: Boolean(preferences.alert_enabled),
      radiusKm: Number(preferences.alert_radius_km) || base.alertPreferences.radiusKm,
      quietHours: Boolean(preferences.quiet_hours),
      quietFrom: timeValue(preferences.quiet_from, base.alertPreferences.quietFrom),
      quietTo: timeValue(preferences.quiet_to, base.alertPreferences.quietTo),
      phenomena: alertPhenomena.length ? alertPhenomena : base.alertPreferences.phenomena,
      communityActivity: Boolean(preferences.community_activity),
      officialInformation: Boolean(preferences.official_information),
      dailyRecap: Boolean(preferences.daily_recap),
    } : base.alertPreferences,
    settings: preferences ? {
      ...base.settings,
      compactMode: Boolean(preferences.compact_mode),
      reduceMotion: Boolean(preferences.reduce_motion),
      highContrast: Boolean(preferences.high_contrast),
      temperatureUnit: preferences.temperature_unit === "fahrenheit" ? "fahrenheit" : "celsius",
      windUnit: preferences.wind_unit === "ms" ? "ms" : "kmh",
      locale: profile.locale === "en-GB" ? "en-GB" : "fr-FR",
    } : base.settings,
  };

  return {
    backend: {
      configured: true,
      status: "authenticated",
      userId: user.id,
      email: user.email ?? null,
    },
    state: next,
  };
}

export async function syncSupabaseProfile(profile: ProductProfile, onboardingComplete: boolean) {
  const supabase = createSupabaseBrowserClient();
  if (!supabase || !UUID_PATTERN.test(profile.id)) return;

  const handle = profile.handle
    .replace(/^@/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);

  await supabase
    .from("profiles")
    .update({
      display_name: profile.displayName,
      handle: handle.length >= 3 ? handle : `weyra_${profile.id.slice(0, 8)}`,
      bio: profile.bio,
      region: profile.region,
      accent: profile.accent,
      interests: profile.interests.map(databaseCategory),
      onboarding_completed: onboardingComplete,
    })
    .eq("id", profile.id);
}

export async function syncSupabasePreferences(
  userId: string,
  alerts: AlertPreferences,
  settings: ProductSettings,
) {
  const supabase = createSupabaseBrowserClient();
  if (!supabase || !UUID_PATTERN.test(userId)) return;

  await supabase.from("profile_preferences").upsert({
    user_id: userId,
    compact_mode: settings.compactMode,
    reduce_motion: settings.reduceMotion,
    high_contrast: settings.highContrast,
    temperature_unit: settings.temperatureUnit,
    wind_unit: settings.windUnit,
    alert_enabled: alerts.enabled,
    alert_radius_km: alerts.radiusKm,
    quiet_hours: alerts.quietHours,
    quiet_from: alerts.quietFrom,
    quiet_to: alerts.quietTo,
    alert_phenomena: alerts.phenomena.map(databaseCategory),
    community_activity: alerts.communityActivity,
    official_information: alerts.officialInformation,
    daily_recap: alerts.dailyRecap,
  });
}

export async function insertSupabaseNotebookEntry(userId: string, entry: NotebookEntry) {
  const supabase = createSupabaseBrowserClient();
  if (!supabase || !UUID_PATTERN.test(userId) || !UUID_PATTERN.test(entry.id)) return;

  await supabase.from("notebook_entries").insert({
    id: entry.id,
    user_id: userId,
    observation_id: entry.observationId && UUID_PATTERN.test(entry.observationId)
      ? entry.observationId
      : null,
    title: entry.title,
    note: entry.note || " ",
    place: entry.place,
    visibility: "private",
  });
}

export async function deleteSupabaseNotebookEntry(userId: string, entryId: string) {
  const supabase = createSupabaseBrowserClient();
  if (!supabase || !UUID_PATTERN.test(userId) || !UUID_PATTERN.test(entryId)) return;
  await supabase.from("notebook_entries").delete().eq("id", entryId).eq("user_id", userId);
}

async function setSupabaseJunction(
  table: string,
  active: boolean,
  values: Record<string, string>,
) {
  const supabase = createSupabaseBrowserClient();
  if (!supabase || Object.values(values).some((value) => !UUID_PATTERN.test(value))) return;

  if (active) {
    await supabase.from(table).insert(values);
    return;
  }

  let query = supabase.from(table).delete();
  Object.entries(values).forEach(([column, value]) => {
    query = query.eq(column, value);
  });
  await query;
}

export function syncSupabasePostLike(userId: string, postId: string, active: boolean) {
  return setSupabaseJunction("post_likes", active, { post_id: postId, user_id: userId });
}

export function syncSupabasePostBookmark(userId: string, postId: string, active: boolean) {
  return setSupabaseJunction("saved_content", active, { user_id: userId, post_id: postId });
}

export function syncSupabaseAuthorFollow(userId: string, authorId: string, active: boolean) {
  if (userId === authorId) return Promise.resolve();
  return setSupabaseJunction("user_follows", active, { follower_id: userId, followed_id: authorId });
}

export async function recordSupabasePostShare(userId: string, postId: string) {
  const supabase = createSupabaseBrowserClient();
  if (!supabase || !UUID_PATTERN.test(userId) || !UUID_PATTERN.test(postId)) return;
  await supabase.from("post_shares").insert({
    post_id: postId,
    user_id: userId,
    channel: "share_sheet",
  });
}

export function syncSupabaseCommunityFavorite(userId: string, communityId: string, active: boolean) {
  return setSupabaseJunction("favorite_communities", active, {
    community_id: communityId,
    user_id: userId,
  });
}

export function syncSupabaseSpaceFollow(userId: string, spaceId: string, active: boolean) {
  return setSupabaseJunction("followed_spaces", active, { space_id: spaceId, user_id: userId });
}

export function syncSupabaseRoomMembership(userId: string, roomId: string, active: boolean) {
  return setSupabaseJunction("room_members", active, { room_id: roomId, user_id: userId });
}

export async function syncSupabaseCommunityMembership(
  userId: string,
  communityId: string,
  active: boolean,
) {
  const supabase = createSupabaseBrowserClient();
  if (!supabase || !UUID_PATTERN.test(userId) || !UUID_PATTERN.test(communityId)) return;
  if (active) {
    await supabase.from("community_members").insert({
      community_id: communityId,
      user_id: userId,
    });
    return;
  }
  await supabase
    .from("community_members")
    .delete()
    .eq("community_id", communityId)
    .eq("user_id", userId);
}

export async function syncSupabaseCommunityNotification(
  userId: string,
  communityId: string,
  mode: string,
) {
  const supabase = createSupabaseBrowserClient();
  if (!supabase || !UUID_PATTERN.test(userId) || !UUID_PATTERN.test(communityId)) return;
  await supabase.from("community_notification_preferences").upsert({
    user_id: userId,
    community_id: communityId,
    mode,
  });
}

export async function insertSupabaseComment(
  userId: string,
  targetId: string,
  target: "post" | "observation",
  body: string,
) {
  const supabase = createSupabaseBrowserClient();
  if (!supabase || !UUID_PATTERN.test(userId) || !UUID_PATTERN.test(targetId)) return;
  await supabase.from("comments").insert({
    author_id: userId,
    post_id: target === "post" ? targetId : null,
    observation_id: target === "observation" ? targetId : null,
    body,
  });
}

export async function insertSupabaseRoomMessage(
  userId: string,
  roomId: string,
  messageId: string,
  body: string,
) {
  const supabase = createSupabaseBrowserClient();
  if (![userId, roomId, messageId].every((value) => UUID_PATTERN.test(value)) || !supabase) return;
  await supabase.from("room_messages").insert({
    id: messageId,
    room_id: roomId,
    author_id: userId,
    kind: "message",
    body,
  });
}

export async function insertSupabaseCommunityMessage(
  userId: string,
  communityId: string,
  spaceId: string,
  messageId: string,
  body: string,
  replyToId?: string,
) {
  const supabase = createSupabaseBrowserClient();
  if (![userId, communityId, spaceId, messageId].every((value) => UUID_PATTERN.test(value)) || !supabase) return;
  await supabase.from("community_messages").insert({
    id: messageId,
    community_id: communityId,
    space_id: spaceId,
    author_id: userId,
    reply_to_id: replyToId && UUID_PATTERN.test(replyToId) ? replyToId : null,
    kind: "message",
    body,
  });
}

export async function insertSupabaseDirectMessage(
  userId: string,
  conversationId: string,
  messageId: string,
  body: string,
) {
  const supabase = createSupabaseBrowserClient();
  if (![userId, conversationId, messageId].every((value) => UUID_PATTERN.test(value)) || !supabase) return;
  await supabase.from("direct_messages").insert({
    id: messageId,
    conversation_id: conversationId,
    author_id: userId,
    body,
  });
}

export async function markSupabaseNotificationsRead(userId: string, ids: string[]) {
  const supabase = createSupabaseBrowserClient();
  const remoteIds = ids.filter((id) => UUID_PATTERN.test(id));
  if (!supabase || !UUID_PATTERN.test(userId) || !remoteIds.length) return;
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .in("id", remoteIds);
}

export async function reportSupabaseObservation(userId: string, observationId: string) {
  const supabase = createSupabaseBrowserClient();
  if (!supabase || !UUID_PATTERN.test(userId) || !UUID_PATTERN.test(observationId)) return;
  await supabase.from("content_reports").insert({
    reporter_id: userId,
    observation_id: observationId,
    category: "quality",
    details: "Signalement transmis depuis la fiche d'observation Weyra.",
  });
}

export async function completeSupabaseLesson(userId: string, lessonId: string) {
  const supabase = createSupabaseBrowserClient();
  if (!supabase || !UUID_PATTERN.test(userId) || !UUID_PATTERN.test(lessonId)) return;
  await supabase.from("lesson_progress").upsert({
    user_id: userId,
    lesson_id: lessonId,
    progress: 100,
    completed_at: new Date().toISOString(),
  });
}
