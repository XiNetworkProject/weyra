import type { LocationSelection } from "@/lib/types";

export type LocalRadarSpeed = 0.5 | 1 | 2;

export type WeyraLocalPreferences = {
  nickname: string;
  radarVisible: boolean;
  radarAutoplay: boolean;
  radarLoop: boolean;
  radarSpeed: LocalRadarSpeed;
  observationsVisible: boolean;
  showNowcast: boolean;
  showLocalAlerts: boolean;
  motionEnabled: boolean;
};

export type WeyraSavedPlace = LocationSelection & {
  key: string;
  savedAt: string;
};

export type WeyraRecentPlace = LocationSelection & {
  key: string;
  visitedAt: string;
};

export type WeyraLocalCore = {
  version: 1;
  preferences: WeyraLocalPreferences;
  savedPlaces: WeyraSavedPlace[];
  recentPlaces: WeyraRecentPlace[];
  readActivityIds: string[];
};

const STORAGE_KEY = "weyra-atlas-local-core-v1";
const MAX_SAVED_PLACES = 10;
const MAX_RECENT_PLACES = 8;
const MAX_READ_ACTIVITY_IDS = 180;

export const DEFAULT_LOCAL_PREFERENCES: WeyraLocalPreferences = {
  nickname: "XimaM",
  radarVisible: true,
  radarAutoplay: false,
  radarLoop: true,
  radarSpeed: 1,
  observationsVisible: true,
  showNowcast: true,
  showLocalAlerts: true,
  motionEnabled: true,
};

export const DEFAULT_LOCAL_CORE: WeyraLocalCore = {
  version: 1,
  preferences: DEFAULT_LOCAL_PREFERENCES,
  savedPlaces: [],
  recentPlaces: [],
  readActivityIds: [],
};

export function localPlaceKey(place: Pick<LocationSelection, "lat" | "lon">) {
  return `${place.lat.toFixed(4)}:${place.lon.toFixed(4)}`;
}

function isRadarSpeed(value: unknown): value is LocalRadarSpeed {
  return value === 0.5 || value === 1 || value === 2;
}

function normalizeLocation(value: unknown): LocationSelection | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const lat = Number(item.lat);
  const lon = Number(item.lon);
  const name = typeof item.name === "string" ? item.name.trim() : "";
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    name,
    lat,
    lon,
    country: typeof item.country === "string" ? item.country : undefined,
    admin: typeof item.admin === "string" ? item.admin : undefined,
  };
}

function normalizeCore(value: unknown): WeyraLocalCore {
  if (!value || typeof value !== "object") return DEFAULT_LOCAL_CORE;
  const item = value as Record<string, unknown>;
  const preferences = item.preferences && typeof item.preferences === "object"
    ? item.preferences as Record<string, unknown>
    : {};
  const savedPlaces = Array.isArray(item.savedPlaces)
    ? item.savedPlaces.flatMap((place): WeyraSavedPlace[] => {
      const normalized = normalizeLocation(place);
      if (!normalized) return [];
      const source = place as Record<string, unknown>;
      return [{
        ...normalized,
        key: localPlaceKey(normalized),
        savedAt: typeof source.savedAt === "string" ? source.savedAt : new Date().toISOString(),
      }];
    }).slice(0, MAX_SAVED_PLACES)
    : [];
  const recentPlaces = Array.isArray(item.recentPlaces)
    ? item.recentPlaces.flatMap((place): WeyraRecentPlace[] => {
      const normalized = normalizeLocation(place);
      if (!normalized) return [];
      const source = place as Record<string, unknown>;
      return [{
        ...normalized,
        key: localPlaceKey(normalized),
        visitedAt: typeof source.visitedAt === "string" ? source.visitedAt : new Date().toISOString(),
      }];
    }).slice(0, MAX_RECENT_PLACES)
    : [];

  return {
    version: 1,
    preferences: {
      nickname: typeof preferences.nickname === "string"
        ? preferences.nickname.trim().slice(0, 24) || DEFAULT_LOCAL_PREFERENCES.nickname
        : DEFAULT_LOCAL_PREFERENCES.nickname,
      radarVisible: typeof preferences.radarVisible === "boolean" ? preferences.radarVisible : true,
      radarAutoplay: typeof preferences.radarAutoplay === "boolean" ? preferences.radarAutoplay : false,
      radarLoop: typeof preferences.radarLoop === "boolean" ? preferences.radarLoop : true,
      radarSpeed: isRadarSpeed(preferences.radarSpeed) ? preferences.radarSpeed : 1,
      observationsVisible: typeof preferences.observationsVisible === "boolean" ? preferences.observationsVisible : true,
      showNowcast: typeof preferences.showNowcast === "boolean" ? preferences.showNowcast : true,
      showLocalAlerts: typeof preferences.showLocalAlerts === "boolean" ? preferences.showLocalAlerts : true,
      motionEnabled: typeof preferences.motionEnabled === "boolean" ? preferences.motionEnabled : true,
    },
    savedPlaces,
    recentPlaces,
    readActivityIds: Array.isArray(item.readActivityIds)
      ? item.readActivityIds.map(String).slice(-MAX_READ_ACTIVITY_IDS)
      : [],
  };
}

export function loadLocalCore(): WeyraLocalCore {
  if (typeof window === "undefined") return DEFAULT_LOCAL_CORE;
  try {
    return normalizeCore(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null"));
  } catch {
    return DEFAULT_LOCAL_CORE;
  }
}

export function saveLocalCore(core: WeyraLocalCore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeCore(core)));
}

export function rememberPlace(core: WeyraLocalCore, place: LocationSelection): WeyraLocalCore {
  const key = localPlaceKey(place);
  const recent: WeyraRecentPlace = { ...place, key, visitedAt: new Date().toISOString() };
  return {
    ...core,
    recentPlaces: [recent, ...core.recentPlaces.filter((item) => item.key !== key)].slice(0, MAX_RECENT_PLACES),
  };
}

export function toggleSavedPlace(core: WeyraLocalCore, place: LocationSelection): WeyraLocalCore {
  const key = localPlaceKey(place);
  if (core.savedPlaces.some((item) => item.key === key)) {
    return { ...core, savedPlaces: core.savedPlaces.filter((item) => item.key !== key) };
  }
  const saved: WeyraSavedPlace = { ...place, key, savedAt: new Date().toISOString() };
  return {
    ...core,
    savedPlaces: [saved, ...core.savedPlaces].slice(0, MAX_SAVED_PLACES),
  };
}

export function withReadActivity(core: WeyraLocalCore, ids: string[]): WeyraLocalCore {
  const readActivityIds = [...new Set([...core.readActivityIds, ...ids])].slice(-MAX_READ_ACTIVITY_IDS);
  return { ...core, readActivityIds };
}
