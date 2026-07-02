import type { ObservationCategory } from "@/lib/types";

export const CATEGORY_META: Record<ObservationCategory, { label: string; icon: string; color: string }> = {
  pluie: { label: "Forte pluie", icon: "☔", color: "#5aaaff" },
  orage: { label: "Orage", icon: "⚡", color: "#ffd66b" },
  grêle: { label: "Grêle", icon: "🧊", color: "#79e3ff" },
  rafales: { label: "Rafales", icon: "💨", color: "#ad85ff" },
  neige: { label: "Neige", icon: "❄️", color: "#dcf7ff" },
  nuage: { label: "Nuage remarquable", icon: "☁️", color: "#ff9d64" },
};

export const CATEGORY_ORDER: ObservationCategory[] = ["pluie", "orage", "grêle", "rafales", "neige", "nuage"];
