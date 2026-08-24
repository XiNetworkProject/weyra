import type { ComponentType, SVGProps } from "react";
import type { ObservationCategory } from "@/lib/types";
import {
  IconBolt,
  IconCloud,
  IconCloudFog,
  IconDroplet,
  IconHail,
  IconRainbow,
  IconSnowflake,
  IconSun,
  IconThermometer,
  IconTornado,
  IconWaves,
  IconWind,
} from "@/components/atlas/icons";

export const OPERA_TILE_STYLE = "v5";

export type ObservationCategoryGroup = "précipitations" | "orage" | "air" | "impacts" | "ambiance";

export const CATEGORY_META: Record<ObservationCategory, {
  label: string;
  shortLabel: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  color: string;
  group: ObservationCategoryGroup;
}> = {
  pluie: { label: "Pluie intense", shortLabel: "Pluie", icon: IconDroplet, color: "#4ea8ff", group: "précipitations" },
  grêle: { label: "Chute de grêle", shortLabel: "Grêle", icon: IconHail, color: "#7ee7ff", group: "précipitations" },
  neige: { label: "Chute de neige", shortLabel: "Neige", icon: IconSnowflake, color: "#eafcff", group: "précipitations" },
  verglas: { label: "Verglas", shortLabel: "Verglas", icon: IconSnowflake, color: "#88d6ff", group: "précipitations" },
  orage: { label: "Orage actif", shortLabel: "Orage", icon: IconBolt, color: "#ffd45e", group: "orage" },
  foudre: { label: "Foudre observée", shortLabel: "Foudre", icon: IconBolt, color: "#ffb84d", group: "orage" },
  tornade: { label: "Rotation / tornade", shortLabel: "Tornade", icon: IconTornado, color: "#ff6f91", group: "orage" },
  rafales: { label: "Fortes rafales", shortLabel: "Rafales", icon: IconWind, color: "#b084ff", group: "air" },
  brouillard: { label: "Brouillard dense", shortLabel: "Brouillard", icon: IconCloudFog, color: "#9bb6c9", group: "air" },
  inondation: { label: "Inondation locale", shortLabel: "Inondation", icon: IconWaves, color: "#27c7d8", group: "impacts" },
  chaleur: { label: "Chaleur remarquable", shortLabel: "Chaleur", icon: IconSun, color: "#ff6b5e", group: "impacts" },
  froid: { label: "Froid remarquable", shortLabel: "Froid", icon: IconThermometer, color: "#65a8ff", group: "impacts" },
  nuage: { label: "Nuage remarquable", shortLabel: "Nuage", icon: IconCloud, color: "#bd8cff", group: "ambiance" },
  "arc-en-ciel": { label: "Arc-en-ciel", shortLabel: "Arc-en-ciel", icon: IconRainbow, color: "#f46fe5", group: "ambiance" },
};

export const CATEGORY_ORDER: ObservationCategory[] = [
  "pluie", "grêle", "neige", "verglas",
  "orage", "foudre", "tornade",
  "rafales", "brouillard",
  "inondation", "chaleur", "froid",
  "nuage", "arc-en-ciel",
];

export const CATEGORY_GROUPS: Array<{ id: ObservationCategoryGroup; label: string }> = [
  { id: "précipitations", label: "Précipitations" },
  { id: "orage", label: "Orage" },
  { id: "air", label: "Vent & visibilité" },
  { id: "impacts", label: "Impacts" },
  { id: "ambiance", label: "Ciel" },
];
