import type { LocalAlert } from "@/lib/alerts";
import { observationPhenomena } from "@/lib/observation-utils";
import type { LocationSelection, Observation, ObservationCategory } from "@/lib/types";

export type WeyraActivityKind = "alert" | "observation" | "radar";
export type WeyraActivityLevel = "calm" | "info" | "attention" | "strong";

export type WeyraActivityEntry = {
  id: string;
  kind: WeyraActivityKind;
  level: WeyraActivityLevel;
  title: string;
  description: string;
  timestamp: string;
  observationId?: string;
  category?: ObservationCategory;
};

const CATEGORY_LABEL: Record<ObservationCategory, string> = {
  pluie: "Pluie",
  orage: "Orage",
  foudre: "Foudre",
  "grêle": "Grêle",
  rafales: "Rafales",
  tornade: "Rotation",
  neige: "Neige",
  verglas: "Verglas",
  brouillard: "Brouillard",
  inondation: "Inondation",
  chaleur: "Chaleur",
  froid: "Froid",
  nuage: "Nuage remarquable",
  "arc-en-ciel": "Arc-en-ciel",
};

function alertActivityId(alert: LocalAlert, location: LocationSelection) {
  const hour = new Date(alert.time).toISOString().slice(0, 13);
  return `alert:${location.lat.toFixed(2)}:${location.lon.toFixed(2)}:${alert.id}:${alert.level}:${hour}`;
}

function observationTitle(observation: Observation) {
  return observationPhenomena(observation).map((category) => CATEGORY_LABEL[category]).join(" + ");
}

export function deriveActivityEntries({
  alerts,
  observations,
  location,
  radarTimestamp,
  radarAvailable,
}: {
  alerts: LocalAlert[];
  observations: Observation[];
  location: LocationSelection;
  radarTimestamp: string | null;
  radarAvailable: boolean;
}): WeyraActivityEntry[] {
  const alertEntries: WeyraActivityEntry[] = alerts.map((alert) => ({
    id: alertActivityId(alert, location),
    kind: "alert",
    level: alert.level === "fort" ? "strong" : alert.level === "attention" ? "attention" : "info",
    title: alert.title,
    description: `${alert.zone} · Signal local dérivé des conditions observées`,
    timestamp: alert.time,
  }));

  const observationEntries: WeyraActivityEntry[] = observations
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 18)
    .map((observation) => ({
      id: `observation:${observation.id}`,
      kind: "observation",
      level: observation.intensity >= 5 ? "strong" : observation.intensity >= 4 ? "attention" : "info",
      title: observationTitle(observation),
      description: `${observation.place ?? "Zone visible"} · intensité ${observation.intensity}/5`,
      timestamp: observation.createdAt,
      observationId: observation.id,
      category: observation.category,
    }));

  const radarEntry: WeyraActivityEntry[] = radarAvailable && radarTimestamp ? [{
    id: `radar:${radarTimestamp}`,
    kind: "radar",
    level: "calm",
    title: "Nouveau scan OPERA disponible",
    description: "Composite européen DBZH actualisé",
    timestamp: radarTimestamp,
  }] : [];

  return [...alertEntries, ...observationEntries, ...radarEntry]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 30);
}
