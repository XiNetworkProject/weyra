import type { ObservationCategory } from "./types";

export const OBSERVATION_API_CATEGORIES = [
  "pluie",
  "orage",
  "foudre",
  "grele",
  "rafales",
  "tornade",
  "neige",
  "verglas",
  "brouillard",
  "inondation",
  "chaleur",
  "froid",
  "nuage",
  "arc-en-ciel",
] as const;

export const OBSERVATION_REPORT_CATEGORIES = [
  "safety",
  "harassment",
  "misinformation",
  "spam",
  "quality",
  "privacy",
  "copyright",
] as const;

export const OBSERVATION_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"] as const;
export const OBSERVATION_MODERATION_DECISIONS = ["approve", "reject"] as const;

export const MAX_OBSERVATION_PHOTO_BYTES = 2_500_000;

export type ObservationApiCategory = (typeof OBSERVATION_API_CATEGORIES)[number];
export type ObservationReportCategory = (typeof OBSERVATION_REPORT_CATEGORIES)[number];
export type ObservationModerationDecision = (typeof OBSERVATION_MODERATION_DECISIONS)[number];

export type ObservationSubmission = {
  id: string;
  nickname: string;
  primaryCategory: ObservationApiCategory;
  phenomena: ObservationApiCategory[];
  intensity: number;
  details: string;
  latitude: number;
  longitude: number;
  locationPrecisionM: 150;
  place: string;
  expiresAt: string | null;
  rightsConfirmed: boolean;
};

export type ObservationReportSubmission = {
  category: ObservationReportCategory;
  details: string;
};

export type ObservationModerationSubmission = {
  decision: ObservationModerationDecision;
  reason: string;
};

export type ObservationValidationResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      code: "invalid_observation" | "invalid_report" | "invalid_moderation";
      issues: string[];
    };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_OBSERVATION_LIFETIME_MS = 24 * 60 * 60 * 1000;

function textField(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function databaseCategory(value: unknown): ObservationApiCategory | null {
  const normalized = value === "grêle" ? "grele" : value;
  return typeof normalized === "string" && (OBSERVATION_API_CATEGORIES as readonly string[]).includes(normalized)
    ? (normalized as ObservationApiCategory)
    : null;
}

function parsePhenomena(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return null;
    const normalized = parsed.map(databaseCategory);
    if (normalized.some((item) => item === null)) return null;
    return [...new Set(normalized as ObservationApiCategory[])];
  } catch {
    return null;
  }
}

export function roundObservationCoordinate(value: number) {
  return Math.round(value * 1_000) / 1_000;
}

export function toObservationApiCategory(category: ObservationCategory): ObservationApiCategory {
  return category === "grêle" ? "grele" : category;
}

export function parseObservationSubmission(
  formData: FormData,
  now = new Date(),
): ObservationValidationResult<ObservationSubmission> {
  const issues: string[] = [];
  const id = textField(formData, "id");
  const nickname = textField(formData, "nickname");
  const primaryCategory = databaseCategory(textField(formData, "primaryCategory"));
  const phenomena = parsePhenomena(textField(formData, "phenomena"));
  const intensity = Number(textField(formData, "intensity"));
  const details = textField(formData, "details");
  const latitude = Number(textField(formData, "latitude"));
  const longitude = Number(textField(formData, "longitude"));
  const place = textField(formData, "place");
  const expiresAtValue = textField(formData, "expiresAt");
  const rightsConfirmed = textField(formData, "rightsConfirmed") === "true";

  if (!UUID_PATTERN.test(id)) issues.push("id");
  if (nickname.length < 1 || nickname.length > 48) issues.push("nickname");
  if (!primaryCategory) issues.push("primaryCategory");
  if (!phenomena || phenomena.length < 1 || phenomena.length > 5) issues.push("phenomena");
  if (primaryCategory && phenomena && !phenomena.includes(primaryCategory)) {
    issues.push("primaryCategoryNotInPhenomena");
  }
  if (!Number.isInteger(intensity) || intensity < 1 || intensity > 5) issues.push("intensity");
  if (details.length > 1_000) issues.push("details");
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) issues.push("latitude");
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) issues.push("longitude");
  if (place.length > 160) issues.push("place");

  let expiresAt: string | null = null;
  if (expiresAtValue) {
    const expiresAtMs = Date.parse(expiresAtValue);
    if (
      !Number.isFinite(expiresAtMs) ||
      expiresAtMs < now.getTime() - 60_000 ||
      expiresAtMs > now.getTime() + MAX_OBSERVATION_LIFETIME_MS
    ) {
      issues.push("expiresAt");
    } else {
      expiresAt = new Date(expiresAtMs).toISOString();
    }
  }

  if (issues.length || !primaryCategory || !phenomena) {
    return { ok: false, code: "invalid_observation", issues: [...new Set(issues)] };
  }

  return {
    ok: true,
    value: {
      id,
      nickname,
      primaryCategory,
      phenomena,
      intensity,
      details,
      latitude: roundObservationCoordinate(latitude),
      longitude: roundObservationCoordinate(longitude),
      locationPrecisionM: 150,
      place,
      expiresAt,
      rightsConfirmed,
    },
  };
}

export function parseObservationReport(input: unknown): ObservationValidationResult<ObservationReportSubmission> {
  if (!input || typeof input !== "object") {
    return { ok: false, code: "invalid_report", issues: ["body"] };
  }

  const value = input as Record<string, unknown>;
  const category =
    typeof value.category === "string" && (OBSERVATION_REPORT_CATEGORIES as readonly string[]).includes(value.category)
      ? (value.category as ObservationReportCategory)
      : null;
  const details = typeof value.details === "string" ? value.details.trim() : "";
  const issues: string[] = [];

  if (!category) issues.push("category");
  if (details.length > 2_000) issues.push("details");
  if (issues.length || !category) return { ok: false, code: "invalid_report", issues };

  return { ok: true, value: { category, details } };
}

export function parseObservationModeration(
  input: unknown,
): ObservationValidationResult<ObservationModerationSubmission> {
  if (!input || typeof input !== "object") {
    return { ok: false, code: "invalid_moderation", issues: ["body"] };
  }

  const value = input as Record<string, unknown>;
  const decision =
    typeof value.decision === "string" &&
    (OBSERVATION_MODERATION_DECISIONS as readonly string[]).includes(value.decision)
      ? (value.decision as ObservationModerationDecision)
      : null;
  const reason = typeof value.reason === "string" ? value.reason.trim() : "";
  const issues: string[] = [];

  if (!decision) issues.push("decision");
  if (reason.length < 3 || reason.length > 2_000) issues.push("reason");
  if (issues.length || !decision) {
    return { ok: false, code: "invalid_moderation", issues };
  }

  return { ok: true, value: { decision, reason } };
}

export function isObservationId(value: string) {
  return UUID_PATTERN.test(value);
}
