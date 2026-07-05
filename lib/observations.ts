"use client";

import { createClient } from "@supabase/supabase-js";
import { seededObservations } from "@/lib/demo-media";
import type { Observation } from "@/lib/types";

const STORAGE_KEY = "weyra-atlas-local-observations-v1";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

function localObservations(): Observation[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Observation[]) : [];
  } catch {
    return [];
  }
}

function setLocalObservations(items: Observation[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function fromDatabase(row: Record<string, unknown>): Observation {
  return {
    id: String(row.id),
    nickname: String(row.nickname),
    category: row.category as Observation["category"],
    intensity: Number(row.intensity),
    details: row.details ? String(row.details) : null,
    imageUrl: row.image_url ? String(row.image_url) : null,
    lat: Number(row.lat),
    lon: Number(row.lng),
    createdAt: String(row.created_at),
    likes: Number(row.likes ?? 0),
    place: row.place ? String(row.place) : undefined,
  };
}

export async function loadObservations(): Promise<Observation[]> {
  const supabase = getSupabase();
  const local = localObservations();

  if (!supabase) return [...local, ...seededObservations()];

  // A slow or unreachable Supabase project must not leave the map empty (or the app stuck loading):
  // fall back to local + seeded observations after a bounded wait.
  try {
    const { data, error } = await supabase
      .from("observations")
      .select("id,nickname,category,intensity,details,image_url,lat,lng,likes,place,created_at")
      .order("created_at", { ascending: false })
      .limit(200)
      .abortSignal(AbortSignal.timeout(8_000));

    if (error) throw error;
    return [...(data ?? []).map(fromDatabase), ...seededObservations()];
  } catch (error) {
    console.warn("Supabase observations unavailable, using local data.", error);
    return [...local, ...seededObservations()];
  }
}

export async function createObservation(observation: Observation) {
  const supabase = getSupabase();
  if (!supabase) {
    const current = localObservations();
    setLocalObservations([observation, ...current]);
    return;
  }

  const { error } = await supabase.from("observations").insert({
    id: observation.id,
    nickname: observation.nickname,
    category: observation.category,
    intensity: observation.intensity,
    details: observation.details ?? null,
    image_url: observation.imageUrl ?? null,
    lat: observation.lat,
    lng: observation.lon,
    likes: observation.likes,
    place: observation.place ?? null,
    created_at: observation.createdAt,
  });

  if (error) throw error;
}

export async function uploadObservationPhoto(file: File): Promise<string> {
  const supabase = getSupabase();

  if (!supabase) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  const extension = (file.name.split(".").pop() || "jpg").replace(/[^a-z0-9]/gi, "");
  const path = `public/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("observation-media").upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabase.storage.from("observation-media").getPublicUrl(path);
  return data.publicUrl;
}

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseKey);
}

export function subscribeToObservations(onChanged: () => void) {
  const supabase = getSupabase();
  if (!supabase) return () => undefined;

  const channel = supabase
    .channel("weyra-atlas-observations")
    .on("postgres_changes", { event: "*", schema: "public", table: "observations" }, onChanged)
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
