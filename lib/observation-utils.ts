import {
  OBSERVATION_CATEGORY_VALUES,
  type Observation,
  type ObservationCategory,
} from "@/lib/types";

const CATEGORY_SET = new Set<string>(OBSERVATION_CATEGORY_VALUES);
export const MAX_OBSERVATION_PHENOMENA = 5;
export const DEFAULT_OBSERVATION_DURATION_MINUTES = 180;

export function isObservationCategory(value: unknown): value is ObservationCategory {
  return typeof value === "string" && CATEGORY_SET.has(value);
}

export function normalizePhenomena(
  phenomena: unknown,
  fallback: ObservationCategory = "nuage",
): ObservationCategory[] {
  const input = Array.isArray(phenomena) ? phenomena : [];
  const unique = input.filter(isObservationCategory);
  if (!unique.includes(fallback)) unique.unshift(fallback);
  return [...new Set(unique)].slice(0, MAX_OBSERVATION_PHENOMENA);
}

export function observationPhenomena(observation: Observation): ObservationCategory[] {
  return normalizePhenomena(observation.phenomena, observation.category);
}

export function observationExpiresAt(
  createdAt: string,
  durationMinutes = DEFAULT_OBSERVATION_DURATION_MINUTES,
) {
  const created = new Date(createdAt).getTime();
  return new Date(created + durationMinutes * 60_000).toISOString();
}

export function isObservationActive(observation: Observation, now = Date.now()) {
  if (!observation.expiresAt) return true;
  const expires = new Date(observation.expiresAt).getTime();
  return Number.isFinite(expires) && expires > now;
}

export function observationRemainingMinutes(observation: Observation, now = Date.now()) {
  if (!observation.expiresAt) return null;
  const remaining = new Date(observation.expiresAt).getTime() - now;
  if (!Number.isFinite(remaining)) return null;
  return Math.max(0, Math.ceil(remaining / 60_000));
}
