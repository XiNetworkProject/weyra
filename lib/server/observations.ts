import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isObservationId,
  MAX_OBSERVATION_PHOTO_BYTES,
  OBSERVATION_PHOTO_MIME_TYPES,
  parseObservationModeration,
  parseObservationReport,
  parseObservationSubmission,
} from "@/lib/observation-api";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const OBSERVATION_UPLOAD_BUCKET = "weyra-observation-uploads";
const PHOTO_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

export type ObservationServiceErrorCode =
  | "supabase_not_configured"
  | "authentication_required"
  | "moderation_forbidden"
  | "media_rights_confirmation_required"
  | "invalid_observation"
  | "invalid_photo"
  | "invalid_report"
  | "invalid_moderation"
  | "observation_not_found"
  | "storage_write_failed"
  | "database_write_failed"
  | "database_read_failed";

export class ObservationServiceError extends Error {
  constructor(
    readonly code: ObservationServiceErrorCode,
    readonly status: number,
    readonly issues: string[] = [],
    readonly providerCode: string | null = null,
  ) {
    super(code);
    this.name = "ObservationServiceError";
  }
}

type AuthenticatedSupabase = {
  supabase: SupabaseClient;
  userId: string;
};

type MediaCleanup = "completed" | "not_needed" | "deferred";

function providerCode(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code.slice(0, 80) : null;
}

async function authenticatedSupabase(): Promise<AuthenticatedSupabase> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new ObservationServiceError("supabase_not_configured", 503);

  const claimsResult = await supabase.auth.getClaims();
  const subject = claimsResult.data?.claims?.sub;
  if (claimsResult.error || typeof subject !== "string" || !isObservationId(subject)) {
    throw new ObservationServiceError("authentication_required", 401);
  }

  return { supabase, userId: subject };
}

function observationPhoto(formData: FormData) {
  const value = formData.get("photo");
  if (value === null || (typeof value === "string" && value.length === 0)) return null;
  if (!(value instanceof File)) {
    throw new ObservationServiceError("invalid_photo", 400, ["photo"]);
  }
  if (
    value.size < 1 ||
    value.size > MAX_OBSERVATION_PHOTO_BYTES ||
    !(OBSERVATION_PHOTO_MIME_TYPES as readonly string[]).includes(value.type)
  ) {
    throw new ObservationServiceError("invalid_photo", 400, ["photo"]);
  }
  return value;
}

async function removeUploadedObject(supabase: SupabaseClient, objectPath: string | null) {
  if (!objectPath) return;
  await supabase.storage.from(OBSERVATION_UPLOAD_BUCKET).remove([objectPath]);
}

export async function createObservationFromRequest(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    throw new ObservationServiceError("invalid_observation", 415, ["contentType"]);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    throw new ObservationServiceError("invalid_observation", 400, ["formData"]);
  }

  const validation = parseObservationSubmission(formData);
  if (!validation.ok) {
    throw new ObservationServiceError(validation.code, 400, validation.issues);
  }

  const photo = observationPhoto(formData);
  const { supabase, userId } = await authenticatedSupabase();
  const submission = validation.value;
  let mediaId: string | null = null;
  let objectPath: string | null = null;

  if (photo) {
    const extension = PHOTO_EXTENSIONS[photo.type];
    objectPath = `${userId}/${submission.id}/original.${extension}`;
    const uploadResult = await supabase.storage.from(OBSERVATION_UPLOAD_BUCKET).upload(objectPath, photo, {
      cacheControl: "3600",
      contentType: photo.type,
      upsert: false,
    });

    if (uploadResult.error) {
      throw new ObservationServiceError("storage_write_failed", 502, [], providerCode(uploadResult.error));
    }

    const mediaResult = await supabase
      .from("media_assets")
      .insert({
        owner_id: userId,
        bucket_id: OBSERVATION_UPLOAD_BUCKET,
        object_path: objectPath,
        kind: "image",
        visibility: "private",
        mime_type: photo.type,
        byte_size: photo.size,
        alt_text: `Observation meteo a ${submission.place || "proximite"}`,
        rights_confirmed: submission.rightsConfirmed,
        metadata: { source: "weyra-observation-api" },
      })
      .select("id")
      .single();

    if (mediaResult.error || typeof mediaResult.data?.id !== "string") {
      await removeUploadedObject(supabase, objectPath);
      throw new ObservationServiceError("database_write_failed", 502, ["media"], providerCode(mediaResult.error));
    }
    mediaId = mediaResult.data.id;
  }

  const observationResult = await supabase
    .from("observations")
    .insert({
      id: submission.id,
      author_id: userId,
      nickname_snapshot: submission.nickname,
      primary_category: submission.primaryCategory,
      phenomena: submission.phenomena,
      intensity: submission.intensity,
      details: submission.details,
      media_id: mediaId,
      latitude: submission.latitude,
      longitude: submission.longitude,
      location_precision_m: submission.locationPrecisionM,
      place: submission.place,
      visibility: "public",
      expires_at: submission.expiresAt,
      is_demo: false,
    })
    .select("id,status,created_at,latitude,longitude,media_id")
    .single();

  if (observationResult.error || !observationResult.data) {
    await removeUploadedObject(supabase, objectPath);
    if (mediaId) await supabase.from("media_assets").delete().eq("id", mediaId);
    throw new ObservationServiceError(
      "database_write_failed",
      502,
      ["observation"],
      providerCode(observationResult.error),
    );
  }

  return {
    id: String(observationResult.data.id),
    status: String(observationResult.data.status),
    createdAt: String(observationResult.data.created_at),
    latitude: Number(observationResult.data.latitude),
    longitude: Number(observationResult.data.longitude),
    hasMedia: Boolean(observationResult.data.media_id),
  };
}

export async function deleteObservationById(observationId: string) {
  if (!isObservationId(observationId)) {
    throw new ObservationServiceError("observation_not_found", 404);
  }

  const { supabase, userId } = await authenticatedSupabase();
  const observationResult = await supabase
    .from("observations")
    .select("id,media_id,deleted_at")
    .eq("id", observationId)
    .eq("author_id", userId)
    .maybeSingle();

  if (observationResult.error) {
    throw new ObservationServiceError("database_read_failed", 502, [], providerCode(observationResult.error));
  }
  if (!observationResult.data) {
    throw new ObservationServiceError("observation_not_found", 404);
  }

  if (!observationResult.data.deleted_at) {
    const hidden = await supabase
      .from("observations")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", observationId)
      .eq("author_id", userId);
    if (hidden.error) {
      throw new ObservationServiceError("database_write_failed", 502, ["observation"], providerCode(hidden.error));
    }
  }

  const mediaId = observationResult.data.media_id;
  let mediaCleanup: MediaCleanup = "not_needed";
  if (typeof mediaId === "string") {
    const mediaResult = await supabase
      .from("media_assets")
      .select("id,bucket_id,object_path")
      .eq("id", mediaId)
      .eq("owner_id", userId)
      .maybeSingle();

    if (mediaResult.data) {
      const removeResult = await supabase.storage
        .from(String(mediaResult.data.bucket_id))
        .remove([String(mediaResult.data.object_path)]);
      if (removeResult.error) {
        mediaCleanup = "deferred";
      } else {
        const deletedMedia = await supabase.from("media_assets").delete().eq("id", mediaId).eq("owner_id", userId);
        mediaCleanup = deletedMedia.error ? "deferred" : "completed";
      }
    }
  }

  return { id: observationId, deleted: true, mediaCleanup };
}

export async function reportObservationById(observationId: string, request: Request) {
  if (!isObservationId(observationId)) {
    throw new ObservationServiceError("observation_not_found", 404);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ObservationServiceError("invalid_report", 400, ["body"]);
  }

  const validation = parseObservationReport(body);
  if (!validation.ok) {
    throw new ObservationServiceError(validation.code, 400, validation.issues);
  }

  const { supabase, userId } = await authenticatedSupabase();
  const visibleObservation = await supabase.from("observations").select("id").eq("id", observationId).maybeSingle();
  if (visibleObservation.error) {
    throw new ObservationServiceError("database_read_failed", 502, [], providerCode(visibleObservation.error));
  }
  if (!visibleObservation.data) {
    throw new ObservationServiceError("observation_not_found", 404);
  }

  const reportResult = await supabase
    .from("content_reports")
    .insert({
      reporter_id: userId,
      observation_id: observationId,
      category: validation.value.category,
      details: validation.value.details,
    })
    .select("id,status,created_at")
    .single();

  if (reportResult.error || !reportResult.data) {
    throw new ObservationServiceError("database_write_failed", 502, ["report"], providerCode(reportResult.error));
  }

  return {
    id: String(reportResult.data.id),
    status: String(reportResult.data.status),
    createdAt: String(reportResult.data.created_at),
  };
}

async function moderatorSupabase() {
  const authenticated = await authenticatedSupabase();
  const profile = await authenticated.supabase.from("profiles").select("role").eq("id", authenticated.userId).single();

  if (profile.error) {
    throw new ObservationServiceError("database_read_failed", 502, [], providerCode(profile.error));
  }
  if (!profile.data || !["moderator", "admin"].includes(String(profile.data.role))) {
    throw new ObservationServiceError("moderation_forbidden", 403);
  }
  return authenticated;
}

type ModerationMediaRow = {
  bucket_id?: unknown;
  object_path?: unknown;
  mime_type?: unknown;
  rights_confirmed?: unknown;
  moderation_status?: unknown;
};

export async function listPendingObservations(rawLimit: string | null) {
  const { supabase } = await moderatorSupabase();
  const parsedLimit = Number(rawLimit);
  const limit = Number.isInteger(parsedLimit) ? Math.max(1, Math.min(100, parsedLimit)) : 30;
  const result = await supabase
    .from("observations")
    .select(
      `
      id,
      author_id,
      nickname_snapshot,
      primary_category,
      phenomena,
      intensity,
      details,
      latitude,
      longitude,
      location_precision_m,
      place,
      created_at,
      expires_at,
      media_id,
      media_assets (
        bucket_id,
        object_path,
        mime_type,
        rights_confirmed,
        moderation_status
      )
    `,
    )
    .eq("status", "pending")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (result.error) {
    throw new ObservationServiceError("database_read_failed", 502, [], providerCode(result.error));
  }

  return await Promise.all(
    (result.data ?? []).map(async (row) => {
      const rawMedia = row.media_assets;
      const media = (Array.isArray(rawMedia) ? rawMedia[0] : rawMedia) as ModerationMediaRow | null;
      let mediaUrl: string | null = null;
      if (media && typeof media.bucket_id === "string" && typeof media.object_path === "string") {
        const signed = await supabase.storage.from(media.bucket_id).createSignedUrl(media.object_path, 600);
        mediaUrl = signed.data?.signedUrl ?? null;
      }

      return {
        id: String(row.id),
        authorId: String(row.author_id),
        nickname: String(row.nickname_snapshot),
        primaryCategory: String(row.primary_category),
        phenomena: Array.isArray(row.phenomena) ? row.phenomena.map(String) : [],
        intensity: Number(row.intensity),
        details: String(row.details ?? ""),
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        locationPrecisionM: Number(row.location_precision_m),
        place: String(row.place ?? ""),
        createdAt: String(row.created_at),
        expiresAt: row.expires_at ? String(row.expires_at) : null,
        media: media
          ? {
              url: mediaUrl,
              mimeType: String(media.mime_type ?? ""),
              rightsConfirmed: Boolean(media.rights_confirmed),
              status: String(media.moderation_status ?? ""),
            }
          : null,
      };
    }),
  );
}

export async function moderateObservationById(observationId: string, request: Request) {
  if (!isObservationId(observationId)) {
    throw new ObservationServiceError("observation_not_found", 404);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ObservationServiceError("invalid_moderation", 400, ["body"]);
  }
  const validation = parseObservationModeration(body);
  if (!validation.ok) {
    throw new ObservationServiceError(validation.code, 400, validation.issues);
  }

  const { supabase } = await moderatorSupabase();
  const result = await supabase.rpc("moderate_observation", {
    target_observation_id: observationId,
    review_decision: validation.value.decision,
    review_reason: validation.value.reason,
  });
  if (result.error || !result.data) {
    const code = providerCode(result.error);
    if (code === "P0002") throw new ObservationServiceError("observation_not_found", 404);
    if (code === "42501") throw new ObservationServiceError("moderation_forbidden", 403);
    if (code === "23514") {
      throw new ObservationServiceError("media_rights_confirmation_required", 409);
    }
    throw new ObservationServiceError("database_write_failed", 502, ["moderation"], code);
  }

  return result.data as Record<string, unknown>;
}

export function logObservationServiceError(event: string, error: unknown) {
  const serviceError = error instanceof ObservationServiceError ? error : null;
  console.error(
    JSON.stringify({
      level: "error",
      event,
      at: new Date().toISOString(),
      code: serviceError?.code ?? "internal_error",
      providerCode: serviceError?.providerCode ?? null,
    }),
  );
}
