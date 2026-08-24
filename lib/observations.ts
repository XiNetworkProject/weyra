"use client";

import { seededObservations } from "@/lib/demo-media";
import { isObservationCategory, normalizePhenomena } from "@/lib/observation-utils";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Observation } from "@/lib/types";

const STORAGE_KEY = "weyra-atlas-local-observations-v1";
const REACTIONS_KEY = "weyra-atlas-local-observation-reactions-v1";
const CONFIRMED_KEY = "weyra-atlas-confirmed-observations-v1";
const OBSERVATION_EVENT = "weyra-local-observations-change";
const OBSERVATION_UPLOAD_BUCKET = "weyra-observation-uploads";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const pendingPhotoFiles = new Map<string, File>();

type RemoteMediaAsset = {
  bucket_id?: unknown;
  object_path?: unknown;
};

type RemoteObservationRow = {
  id?: unknown;
  nickname_snapshot?: unknown;
  primary_category?: unknown;
  phenomena?: unknown;
  intensity?: unknown;
  details?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  created_at?: unknown;
  confirmation_count?: unknown;
  like_count?: unknown;
  place?: unknown;
  expires_at?: unknown;
  media_assets?: RemoteMediaAsset | RemoteMediaAsset[] | null;
};

function toDatabaseCategory(category: Observation["category"]) {
  return category === "grêle" ? "grele" : category;
}

function fromDatabaseCategory(value: unknown) {
  return value === "grele" ? "grêle" : value;
}

function mediaAssetFromRow(row: RemoteObservationRow) {
  if (Array.isArray(row.media_assets)) return row.media_assets[0] ?? null;
  return row.media_assets ?? null;
}

async function remoteImageUrl(row: RemoteObservationRow) {
  const media = mediaAssetFromRow(row);
  if (!media || typeof media.bucket_id !== "string" || typeof media.object_path !== "string") {
    return null;
  }

  const supabase = createSupabaseBrowserClient();
  if (!supabase) return null;

  if (media.bucket_id === "weyra-public-media") {
    return supabase.storage.from(media.bucket_id).getPublicUrl(media.object_path).data.publicUrl;
  }

  const { data } = await supabase.storage.from(media.bucket_id).createSignedUrl(media.object_path, 900);
  return data?.signedUrl ?? null;
}

async function normalizeRemoteObservation(row: RemoteObservationRow): Promise<Observation | null> {
  const rawCategory = fromDatabaseCategory(row.primary_category);
  const category = isObservationCategory(rawCategory) ? rawCategory : "nuage";
  const lat = Number(row.latitude);
  const lon = Number(row.longitude);
  if (typeof row.id !== "string" || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const rawPhenomena = Array.isArray(row.phenomena)
    ? row.phenomena.map(fromDatabaseCategory)
    : [];

  return {
    id: row.id,
    nickname: typeof row.nickname_snapshot === "string" ? row.nickname_snapshot : "Membre Weyra",
    category,
    phenomena: normalizePhenomena(rawPhenomena, category),
    intensity: Math.max(1, Math.min(5, Number(row.intensity) || 1)),
    details: typeof row.details === "string" && row.details ? row.details : null,
    imageUrl: await remoteImageUrl(row),
    lat,
    lon,
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
    likes: Math.max(0, Number(row.confirmation_count) || Number(row.like_count) || 0),
    place: typeof row.place === "string" && row.place ? row.place : undefined,
    expiresAt: typeof row.expires_at === "string" ? row.expires_at : null,
  };
}

async function remoteObservations() {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("observations")
    .select(`
      id,
      nickname_snapshot,
      primary_category,
      phenomena,
      intensity,
      details,
      latitude,
      longitude,
      created_at,
      confirmation_count,
      like_count,
      place,
      expires_at,
      media_assets (
        bucket_id,
        object_path
      )
    `)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("created_at", { ascending: false })
    .limit(250);

  if (error || !data) return [];

  const normalized = await Promise.all(
    (data as RemoteObservationRow[]).map(normalizeRemoteObservation),
  );
  return normalized.filter((item): item is Observation => item !== null);
}

function normalizeStoredObservation(value: unknown): Observation | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const category = isObservationCategory(item.category) ? item.category : "nuage";
  const createdAt = typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString();
  const lat = Number(item.lat);
  const lon = Number(item.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    id: String(item.id ?? crypto.randomUUID()),
    nickname: String(item.nickname ?? "Membre Weyra"),
    category,
    phenomena: normalizePhenomena(item.phenomena, category),
    intensity: Math.max(1, Math.min(5, Number(item.intensity) || 1)),
    details: item.details ? String(item.details) : null,
    imageUrl: item.imageUrl ? String(item.imageUrl) : null,
    lat,
    lon,
    createdAt,
    likes: Math.max(0, Number(item.likes) || 0),
    place: item.place ? String(item.place) : undefined,
    expiresAt: typeof item.expiresAt === "string" ? item.expiresAt : null,
    isSeed: Boolean(item.isSeed),
  };
}

function localObservations(): Observation[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : [];
    return Array.isArray(parsed)
      ? parsed.map(normalizeStoredObservation).filter((item): item is Observation => item !== null)
      : [];
  } catch {
    return [];
  }
}

function notifyChanged() {
  window.dispatchEvent(new Event(OBSERVATION_EVENT));
}

function setLocalObservations(items: Observation[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  notifyChanged();
}

function readReactionOverrides(): Record<string, number> {
  try {
    const value = JSON.parse(window.localStorage.getItem(REACTIONS_KEY) ?? "{}") as unknown;
    return value && typeof value === "object" ? value as Record<string, number> : {};
  } catch {
    return {};
  }
}

function withReactionOverrides(items: Observation[]) {
  const overrides = readReactionOverrides();
  return items.map((item) => ({ ...item, likes: Math.max(item.likes, Number(overrides[item.id]) || 0) }));
}

export async function loadObservations(): Promise<Observation[]> {
  const remote = await remoteObservations();
  const merged = new Map<string, Observation>();
  [...seededObservations(), ...remote, ...localObservations()].forEach((item) => {
    merged.set(item.id, item);
  });

  return withReactionOverrides([...merged.values()])
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function createObservation(observation: Observation) {
  setLocalObservations([observation, ...localObservations()]);

  const supabase = createSupabaseBrowserClient();
  if (!supabase) return { synced: false as const, reason: "local_mode" as const };

  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) return { synced: false as const, reason: "authentication_required" as const };

  let mediaId: string | null = null;
  let uploadedObjectPath: string | null = null;
  const photo = observation.imageUrl ? pendingPhotoFiles.get(observation.imageUrl) : null;

  if (photo) {
    const extension = photo.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    uploadedObjectPath = `${user.id}/${observation.id}/original.${extension}`;
    const upload = await supabase.storage
      .from(OBSERVATION_UPLOAD_BUCKET)
      .upload(uploadedObjectPath, photo, {
        cacheControl: "3600",
        contentType: photo.type || "image/jpeg",
        upsert: false,
      });

    if (!upload.error) {
      const media = await supabase
        .from("media_assets")
        .insert({
          owner_id: user.id,
          bucket_id: OBSERVATION_UPLOAD_BUCKET,
          object_path: uploadedObjectPath,
          kind: "image",
          visibility: "private",
          mime_type: photo.type || "image/jpeg",
          byte_size: photo.size,
          alt_text: `Observation meteo a ${observation.place ?? "proximite"}`,
          rights_confirmed: true,
          metadata: { source: "weyra-observation-composer" },
        })
        .select("id")
        .single();

      if (media.error) {
        await supabase.storage.from(OBSERVATION_UPLOAD_BUCKET).remove([uploadedObjectPath]);
        uploadedObjectPath = null;
      } else {
        mediaId = String(media.data.id);
      }
    }
  }

  const phenomena = normalizePhenomena(observation.phenomena, observation.category)
    .map(toDatabaseCategory);
  const result = await supabase.from("observations").insert({
    id: observation.id,
    author_id: user.id,
    nickname_snapshot: observation.nickname,
    primary_category: toDatabaseCategory(observation.category),
    phenomena,
    intensity: observation.intensity,
    details: observation.details ?? "",
    media_id: mediaId,
    latitude: observation.lat,
    longitude: observation.lon,
    location_precision_m: 150,
    place: observation.place ?? "",
    visibility: "public",
    expires_at: observation.expiresAt ?? null,
    is_demo: false,
  });

  if (result.error) {
    if (uploadedObjectPath) {
      await supabase.storage.from(OBSERVATION_UPLOAD_BUCKET).remove([uploadedObjectPath]);
    }
    if (mediaId) await supabase.from("media_assets").delete().eq("id", mediaId);
    return { synced: false as const, reason: "remote_write_failed" as const };
  }

  if (observation.imageUrl) pendingPhotoFiles.delete(observation.imageUrl);
  return { synced: true as const, status: "pending_moderation" as const };
}

export function loadConfirmedObservationIds() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CONFIRMED_KEY) ?? "[]") as unknown;
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set<string>();
  }
}

export async function confirmObservation(observation: Observation) {
  const confirmed = loadConfirmedObservationIds();
  if (confirmed.has(observation.id)) return { likes: observation.likes, changed: false };

  let likes = observation.likes + 1;
  const supabase = createSupabaseBrowserClient();

  if (supabase && UUID_PATTERN.test(observation.id)) {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (user) {
      const confirmation = await supabase.from("observation_confirmations").insert({
        observation_id: observation.id,
        user_id: user.id,
        outcome: "confirm",
      });
      if (confirmation.error?.code === "23505") {
        return { likes: observation.likes, changed: false };
      }
      if (!confirmation.error) {
        const refreshed = await supabase
          .from("observations")
          .select("confirmation_count")
          .eq("id", observation.id)
          .single();
        likes = Math.max(likes, Number(refreshed.data?.confirmation_count) || likes);
      }
    }
  }

  confirmed.add(observation.id);
  window.localStorage.setItem(CONFIRMED_KEY, JSON.stringify([...confirmed]));

  const overrides = readReactionOverrides();
  overrides[observation.id] = likes;
  window.localStorage.setItem(REACTIONS_KEY, JSON.stringify(overrides));

  const local = localObservations();
  if (local.some((item) => item.id === observation.id)) {
    setLocalObservations(local.map((item) => item.id === observation.id ? { ...item, likes } : item));
  } else {
    notifyChanged();
  }

  return { likes, changed: true };
}

export async function uploadObservationPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      pendingPhotoFiles.set(dataUrl, file);
      resolve(dataUrl);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function isLocalObservationMode() {
  return !isSupabaseConfigured();
}

export function subscribeToObservations(onChanged: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === REACTIONS_KEY) onChanged();
  };
  window.addEventListener(OBSERVATION_EVENT, onChanged);
  window.addEventListener("storage", onStorage);

  const supabase = createSupabaseBrowserClient();
  const channel = supabase
    ?.channel("weyra-observations-live")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "observations" },
      onChanged,
    )
    .subscribe();

  return () => {
    window.removeEventListener(OBSERVATION_EVENT, onChanged);
    window.removeEventListener("storage", onStorage);
    if (supabase && channel) void supabase.removeChannel(channel);
  };
}
