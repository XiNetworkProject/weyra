import type { LocationSelection, Observation, WeatherSnapshot } from "@/lib/types";
import { observationPhenomena } from "@/lib/observation-utils";

export type NowcastSource = "weather" | "observations" | "radar";

export type Nowcast = {
  text: string;
  updatedAt: string;
  sources: NowcastSource[];
};

const CARDINALS = ["nord", "nord-est", "est", "sud-est", "sud", "sud-ouest", "ouest", "nord-ouest"];

function bearingTo(from: { lat: number; lon: number }, to: { lat: number; lon: number }) {
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const dLon = ((to.lon - from.lon) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const degrees = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return CARDINALS[Math.round(degrees / 45) % 8];
}

function distanceKm(from: { lat: number; lon: number }, to: { lat: number; lon: number }) {
  const earthRadiusKm = 6371;
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLon = ((to.lon - from.lon) * Math.PI) / 180;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

const CATEGORY_SINGLE: Record<Observation["category"], string> = {
  pluie: "Pluie",
  orage: "Orage",
  rafales: "Rafales de vent",
  neige: "Chutes de neige",
  grêle: "Grêle",
  foudre: "Foudre",
  tornade: "Rotation",
  verglas: "Verglas",
  brouillard: "Brouillard",
  inondation: "Inondation",
  chaleur: "Chaleur",
  froid: "Froid",
  nuage: "Ciel nuageux",
  "arc-en-ciel": "Arc-en-ciel",
};

const CATEGORY_SCATTERED: Record<Observation["category"], string> = {
  pluie: "Averses dispersées",
  orage: "Orages dispersés",
  rafales: "Rafales dispersées",
  neige: "Averses de neige dispersées",
  grêle: "Averses de grêle dispersées",
  foudre: "Impacts de foudre dispersés",
  tornade: "Rotations signalées",
  verglas: "Plaques de verglas",
  brouillard: "Bancs de brouillard",
  inondation: "Inondations localisées",
  chaleur: "Chaleur marquée",
  froid: "Froid marqué",
  nuage: "Ciel nuageux variable",
  "arc-en-ciel": "Arcs-en-ciel signalés",
};

function intensityWord(intensity: number) {
  if (intensity >= 5) return "très forte";
  if (intensity >= 4) return "forte";
  if (intensity >= 3) return "modérée";
  return "faible";
}

function precipitationWord(precipitation: number) {
  if (precipitation >= 7.5) return "forte";
  if (precipitation >= 2.5) return "modérée";
  return "faible";
}

// Only these categories describe active weather; "nuage" (remarkable cloud) stays out of the
// nowcast sentence — it isn't precipitation/wind and would make "Temps calme" misleading.
const RELEVANT_CATEGORIES: Observation["category"][] = [
  "pluie", "orage", "foudre", "rafales", "tornade", "neige", "grêle",
  "verglas", "brouillard", "inondation", "chaleur", "froid",
];
const RECENT_WINDOW_MS = 60 * 60_000;
const NEARBY_KM = 3;

function weatherFallbackText(weather: WeatherSnapshot | null, placeName: string) {
  if (!weather) return `Analyse des conditions sur ${placeName}…`;
  if (weather.precipitation >= 0.5) {
    return `Pluie ${precipitationWord(weather.precipitation)} sur ${placeName}`;
  }
  if (weather.windGusts >= 35) {
    return `Vent soutenu sur ${placeName}`;
  }
  return "Temps calme sur la zone";
}

// Builds a short, human-readable "what's happening around here" sentence from data the app
// already has — the current weather snapshot, community observations within the visible map
// bounds, and whether the OPERA radar layer is currently on and has data. This is explicitly
// NOT an official forecast: no external alert/nowcast feed is consulted, only local heuristics
// over data the app already fetched. `radarActive` is a coarse "was radar considered" signal
// (layer toggled on + a frame loaded) — the OPERA mosaic's real footprint is an irregular shape,
// not the rectangular geographic bounds, so we don't claim pixel-accurate per-location coverage.
export function deriveNowcast(
  weather: WeatherSnapshot | null,
  location: LocationSelection,
  visibleObservations: Observation[],
  radarActive: boolean,
  now = Date.now(),
): Nowcast {
  const sources: NowcastSource[] = ["weather"];
  const center = { lat: location.lat, lon: location.lon };

  const signals = visibleObservations.filter((observation) => (
    observationPhenomena(observation).some((category) => RELEVANT_CATEGORIES.includes(category)) &&
    now - new Date(observation.createdAt).getTime() <= RECENT_WINDOW_MS
  ));

  let text: string;

  if (signals.length === 0) {
    text = weatherFallbackText(weather, location.name);
  } else {
    sources.push("observations");

    if (signals.length === 1) {
      const observation = signals[0];
      const category = observationPhenomena(observation).find((item) => RELEVANT_CATEGORIES.includes(item)) ?? observation.category;
      const isNearby = distanceKm(center, observation) <= NEARBY_KM;
      const where = isNearby ? location.name : `${bearingTo(center, observation)} de ${location.name}`;
      text = `${CATEGORY_SINGLE[category]} ${intensityWord(observation.intensity)} ${isNearby ? "sur" : "au"} ${where}`;
    } else {
      const counts = new Map<Observation["category"], number>();
      for (const observation of signals) {
        const category = observationPhenomena(observation).find((item) => RELEVANT_CATEGORIES.includes(item)) ?? observation.category;
        counts.set(category, (counts.get(category) ?? 0) + 1);
      }
      const [topCategory] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      const mostRecent = [...signals].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      const place = mostRecent.place && mostRecent.place !== location.name ? mostRecent.place : null;
      text = place ? `${CATEGORY_SCATTERED[topCategory]} vers ${place}` : `${CATEGORY_SCATTERED[topCategory]} sur la zone`;
    }
  }

  if (radarActive) sources.push("radar");

  return { text, updatedAt: new Date(now).toISOString(), sources };
}
