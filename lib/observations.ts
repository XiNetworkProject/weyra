"use client";

import { seededObservations } from "@/lib/demo-media";
import { isObservationCategory, normalizePhenomena } from "@/lib/observation-utils";
import type { Observation } from "@/lib/types";

const STORAGE_KEY = "weyra-atlas-local-observations-v1";
const REACTIONS_KEY = "weyra-atlas-local-observation-reactions-v1";
const CONFIRMED_KEY = "weyra-atlas-confirmed-observations-v1";
const OBSERVATION_EVENT = "weyra-local-observations-change";

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
  return withReactionOverrides([...localObservations(), ...seededObservations()])
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function createObservation(observation: Observation) {
  setLocalObservations([observation, ...localObservations()]);
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

  const likes = observation.likes + 1;
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
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function isLocalObservationMode() {
  return true;
}

export function subscribeToObservations(onChanged: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === REACTIONS_KEY) onChanged();
  };
  window.addEventListener(OBSERVATION_EVENT, onChanged);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(OBSERVATION_EVENT, onChanged);
    window.removeEventListener("storage", onStorage);
  };
}
