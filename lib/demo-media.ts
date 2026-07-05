import type { Observation, ObservationCategory } from "@/lib/types";

function svgData(background: string, foreground: string, symbol: string) {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 160">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop stop-color="${background}" offset="0"/>
        <stop stop-color="#091524" offset="1"/>
      </linearGradient>
      <filter id="blur"><feGaussianBlur stdDeviation="15"/></filter>
    </defs>
    <rect width="240" height="160" fill="url(#g)"/>
    <circle cx="180" cy="35" r="70" fill="${foreground}" opacity=".38" filter="url(#blur)"/>
    <path d="M0 126 Q42 91 80 122 T160 115 T240 130 V160 H0Z" fill="#06111d" opacity=".72"/>
    <text x="120" y="100" text-anchor="middle" font-size="64">${symbol}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export const DEMO_IMAGES = {
  orage: svgData("#60426e", "#f7bd58", "⚡"),
  pluie: svgData("#1b668e", "#5ed5ff", "☔"),
  grêle: svgData("#406f83", "#d3f8ff", "🧊"),
  rafales: svgData("#3c5d7b", "#aa8eff", "💨"),
  neige: svgData("#638a9a", "#e8fcff", "❄️"),
  nuage: svgData("#87516d", "#ffad71", "☁️"),
} satisfies Record<ObservationCategory, string>;

export function seededObservations(): Observation[] {
  const now = Date.now();
  return [
    {
      id: "seed-storm",
      nickname: "Storm_chaser",
      category: "pluie",
      intensity: 4,
      details: "Averse intense et fortes rafales de vent.",
      lat: 50.523,
      lon: 3.177,
      createdAt: new Date(now - 5 * 60_000).toISOString(),
      imageUrl: DEMO_IMAGES.pluie,
      likes: 24,
      place: "Templeuve-en-Pévèle",
      isSeed: true,
    },
    {
      id: "seed-rain",
      nickname: "Léna Météo",
      category: "pluie",
      intensity: 3,
      details: "Averse soutenue, visibilité réduite par moments.",
      lat: 50.685,
      lon: 2.883,
      createdAt: new Date(now - 8 * 60_000).toISOString(),
      imageUrl: DEMO_IMAGES.pluie,
      likes: 8,
      place: "Armentières",
      isSeed: true,
    },
    {
      id: "seed-cloud",
      nickname: "Nord Ciel",
      category: "nuage",
      intensity: 2,
      details: "Base nuageuse très sombre vers le nord-ouest.",
      lat: 50.598,
      lon: 2.629,
      createdAt: new Date(now - 15 * 60_000).toISOString(),
      imageUrl: DEMO_IMAGES.nuage,
      likes: 11,
      place: "Béthune",
      isSeed: true,
    },
    {
      id: "seed-wind",
      nickname: "Chloé Photo",
      category: "rafales",
      intensity: 3,
      details: "Rafales visibles dans les arbres, pluie faible.",
      lat: 50.371,
      lon: 3.080,
      createdAt: new Date(now - 20 * 60_000).toISOString(),
      imageUrl: DEMO_IMAGES.rafales,
      likes: 5,
      place: "Douai",
      isSeed: true,
    },
    {
      id: "seed-coast",
      nickname: "Côte Opale",
      category: "pluie",
      intensity: 2,
      details: "Averse côtière qui remonte vers l'intérieur des terres.",
      lat: 50.868,
      lon: 1.871,
      createdAt: new Date(now - 62 * 60_000).toISOString(),
      imageUrl: DEMO_IMAGES.pluie,
      likes: 16,
      place: "Guines",
      isSeed: true,
    },
    {
      id: "seed-dunkerque",
      nickname: "Dunes du Nord",
      category: "pluie",
      intensity: 2,
      details: "Rideau de pluie visible sur la mer.",
      lat: 51.017,
      lon: 2.312,
      createdAt: new Date(now - 12 * 60_000).toISOString(),
      imageUrl: DEMO_IMAGES.pluie,
      likes: 6,
      place: "Gravelines",
      isSeed: true,
    },
    {
      id: "seed-tournai",
      nickname: "Ciel Wallon",
      category: "orage",
      intensity: 4,
      details: "Front orageux très actif au-dessus de Tournai.",
      lat: 50.624,
      lon: 3.328,
      createdAt: new Date(now - 5 * 60_000).toISOString(),
      imageUrl: DEMO_IMAGES.orage,
      likes: 19,
      place: "Froyennes",
      isSeed: true,
    },
    {
      id: "seed-stamand",
      nickname: "Parc Scarpe",
      category: "pluie",
      intensity: 3,
      details: "Pluie battante sur la forêt de Raismes.",
      lat: 50.443,
      lon: 3.422,
      createdAt: new Date(now - 7 * 60_000).toISOString(),
      imageUrl: DEMO_IMAGES.pluie,
      likes: 9,
      place: "Saint-Amand-les-Eaux",
      isSeed: true,
    },
    {
      id: "seed-lille",
      nickname: "Léo Weppes",
      category: "nuage",
      intensity: 2,
      details: "Base sombre en approche sur la métropole.",
      lat: 50.641,
      lon: 2.942,
      createdAt: new Date(now - 3 * 60_000).toISOString(),
      imageUrl: DEMO_IMAGES.nuage,
      likes: 4,
      place: "Lille",
      isSeed: true,
    },
  ];
}
