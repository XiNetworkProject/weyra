import type {
  Community,
  CommunityEvent,
  CommunityMember,
  CommunityMessage,
  CommunityNotification,
  CommunityRole,
  CommunitySection,
  CommunitySpace,
  DirectConversation,
  DirectMessage,
  ModerationCase,
  ProductAuthor,
  ProductComment,
  ProductPost,
  RoomMessage,
  StormRoom,
} from "@/lib/product-domain";
import type { Observation, ObservationCategory } from "@/lib/types";

const DEMO_SEED = 0x57e9a;
const DEMO_NOW = Date.now();

function mulberry32(seed: number) {
  return () => {
    let value = seed += 0x6d2b79f5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

const random = mulberry32(DEMO_SEED);

function pick<T>(items: readonly T[]) {
  return items[Math.floor(random() * items.length)];
}

function agoMinutes(minutes: number) {
  return new Date(DEMO_NOW - minutes * 60_000).toISOString();
}

function fromNowHours(hours: number) {
  return new Date(DEMO_NOW + hours * 3_600_000).toISOString();
}

function initials(name: string) {
  return name.split(/[\s-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function slug(value: string) {
  return value
    .toLocaleLowerCase("fr-FR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

type DemoPlace = {
  name: string;
  region: string;
  lat: number;
  lon: number;
};

const PLACES: DemoPlace[] = [
  { name: "Lille", region: "Métropole lilloise", lat: 50.6292, lon: 3.0573 },
  { name: "Roubaix", region: "Métropole lilloise", lat: 50.6927, lon: 3.1778 },
  { name: "Tourcoing", region: "Métropole lilloise", lat: 50.7239, lon: 3.1612 },
  { name: "Villeneuve-d'Ascq", region: "Métropole lilloise", lat: 50.6233, lon: 3.1443 },
  { name: "Armentières", region: "Flandres", lat: 50.687, lon: 2.881 },
  { name: "Bailleul", region: "Flandres", lat: 50.735, lon: 2.735 },
  { name: "Hazebrouck", region: "Flandres", lat: 50.724, lon: 2.54 },
  { name: "Dunkerque", region: "Flandre maritime", lat: 51.034, lon: 2.377 },
  { name: "Gravelines", region: "Flandre maritime", lat: 50.987, lon: 2.126 },
  { name: "Calais", region: "Côte d'Opale", lat: 50.951, lon: 1.858 },
  { name: "Boulogne-sur-Mer", region: "Côte d'Opale", lat: 50.725, lon: 1.613 },
  { name: "Le Touquet", region: "Côte d'Opale", lat: 50.524, lon: 1.585 },
  { name: "Saint-Omer", region: "Audomarois", lat: 50.748, lon: 2.261 },
  { name: "Béthune", region: "Artois", lat: 50.53, lon: 2.64 },
  { name: "Lens", region: "Artois", lat: 50.433, lon: 2.827 },
  { name: "Arras", region: "Artois", lat: 50.291, lon: 2.777 },
  { name: "Douai", region: "Douaisis", lat: 50.367, lon: 3.08 },
  { name: "Cambrai", region: "Cambrésis", lat: 50.176, lon: 3.235 },
  { name: "Valenciennes", region: "Hainaut", lat: 50.358, lon: 3.523 },
  { name: "Saint-Amand-les-Eaux", region: "Hainaut", lat: 50.447, lon: 3.43 },
  { name: "Tournai", region: "Hainaut belge", lat: 50.605, lon: 3.389 },
  { name: "Mouscron", region: "Hainaut belge", lat: 50.744, lon: 3.214 },
  { name: "Courtrai", region: "Flandre occidentale", lat: 50.828, lon: 3.264 },
  { name: "Ypres", region: "Flandre occidentale", lat: 50.851, lon: 2.885 },
  { name: "Bruges", region: "Flandre occidentale", lat: 51.209, lon: 3.224 },
  { name: "Gand", region: "Flandre orientale", lat: 51.054, lon: 3.717 },
  { name: "Mons", region: "Hainaut belge", lat: 50.454, lon: 3.952 },
  { name: "Bruxelles", region: "Bruxelles-Capitale", lat: 50.847, lon: 4.357 },
  { name: "Namur", region: "Wallonie", lat: 50.467, lon: 4.872 },
  { name: "Liège", region: "Wallonie", lat: 50.633, lon: 5.579 },
  { name: "Charleroi", region: "Wallonie", lat: 50.411, lon: 4.444 },
  { name: "Anvers", region: "Flandre", lat: 51.219, lon: 4.402 },
  { name: "Rotterdam", region: "Hollande-Méridionale", lat: 51.924, lon: 4.478 },
  { name: "La Haye", region: "Hollande-Méridionale", lat: 52.07, lon: 4.3 },
  { name: "Amsterdam", region: "Hollande-Septentrionale", lat: 52.367, lon: 4.904 },
  { name: "Utrecht", region: "Pays-Bas", lat: 52.09, lon: 5.122 },
  { name: "Eindhoven", region: "Brabant-Septentrional", lat: 51.441, lon: 5.469 },
  { name: "Düsseldorf", region: "Rhénanie-du-Nord-Westphalie", lat: 51.227, lon: 6.773 },
  { name: "Cologne", region: "Rhénanie-du-Nord-Westphalie", lat: 50.938, lon: 6.96 },
  { name: "Münster", region: "Westphalie", lat: 51.961, lon: 7.626 },
  { name: "Dortmund", region: "Ruhr", lat: 51.514, lon: 7.466 },
  { name: "Hanovre", region: "Basse-Saxe", lat: 52.375, lon: 9.732 },
  { name: "Wolfsburg", region: "Basse-Saxe", lat: 52.423, lon: 10.787 },
  { name: "Luxembourg", region: "Grand-Duché", lat: 49.611, lon: 6.131 },
  { name: "Amiens", region: "Somme", lat: 49.895, lon: 2.302 },
  { name: "Abbeville", region: "Baie de Somme", lat: 50.105, lon: 1.835 },
  { name: "Rouen", region: "Normandie", lat: 49.443, lon: 1.1 },
  { name: "Le Havre", region: "Normandie", lat: 49.494, lon: 0.108 },
];

const FIRST_NAMES = [
  "Adèle", "Amine", "Anaïs", "Antoine", "Apolline", "Baptiste", "Camille", "Chloé",
  "Clara", "Élias", "Élise", "Emma", "Farah", "Gabriel", "Hugo", "Inès", "Jade",
  "Jules", "Léna", "Léo", "Louise", "Maël", "Manon", "Mathis", "Mélanie", "Nassim",
  "Nina", "Noah", "Océane", "Paul", "Rayan", "Romane", "Salomé", "Sami", "Sarah",
  "Sofia", "Théo", "Yanis", "Zoé",
] as const;

const LAST_NAMES = [
  "Bernard", "Blanc", "Bourgeois", "Caron", "Chevalier", "Colin", "De Smet", "Declercq",
  "Delattre", "Dubois", "Dupont", "Fontaine", "François", "Garcia", "Gérard", "Jacobs",
  "Lambert", "Leclercq", "Lemaire", "Leroy", "Maes", "Marchand", "Martin", "Masson",
  "Meunier", "Moreau", "Petit", "Renard", "Robert", "Rousseau", "Simon", "Thomas",
  "Van den Berg", "Vermeulen", "Willems",
] as const;

const ACCENTS = ["#65d8f3", "#4f8cff", "#9b8cff", "#58d5a5", "#f2c96d", "#ff7388", "#55c2ff", "#ff9b71"] as const;
const PHENOMENA: ObservationCategory[] = [
  "pluie", "orage", "foudre", "grêle", "rafales", "brouillard", "nuage",
  "arc-en-ciel", "inondation", "neige", "verglas", "chaleur", "froid",
];

const RELATED: Record<ObservationCategory, ObservationCategory[]> = {
  pluie: ["rafales", "orage", "inondation"],
  orage: ["foudre", "pluie", "rafales", "grêle"],
  foudre: ["orage", "pluie"],
  "grêle": ["orage", "pluie"],
  rafales: ["pluie", "orage", "nuage"],
  tornade: ["orage", "rafales"],
  neige: ["froid", "verglas"],
  verglas: ["froid", "brouillard"],
  brouillard: ["froid", "nuage"],
  inondation: ["pluie", "orage"],
  chaleur: ["nuage"],
  froid: ["brouillard", "verglas"],
  nuage: ["pluie", "rafales"],
  "arc-en-ciel": ["pluie", "nuage"],
};

const IMAGE_BY_PHENOMENON: Record<ObservationCategory, string> = {
  pluie: "/media/observations/averse-route.webp",
  orage: "/media/observations/arcus-champs.webp",
  foudre: "/media/observations/foudre-lointaine.webp",
  "grêle": "/media/observations/grele-terrasse.webp",
  rafales: "/media/observations/arcus-champs.webp",
  tornade: "/media/observations/arcus-champs.webp",
  neige: "/media/observations/grele-terrasse.webp",
  verglas: "/media/observations/brouillard-canal.webp",
  brouillard: "/media/observations/brouillard-canal.webp",
  inondation: "/media/observations/averse-route.webp",
  chaleur: "/media/observations/arc-en-ciel-dunes.webp",
  froid: "/media/observations/brouillard-canal.webp",
  nuage: "/media/observations/arcus-champs.webp",
  "arc-en-ciel": "/media/observations/arc-en-ciel-dunes.webp",
};

const OBSERVATION_DETAILS: Record<ObservationCategory, string[]> = {
  pluie: [
    "Averse soutenue, visibilité temporairement réduite.",
    "Pluie régulière depuis quelques minutes, sans ruissellement notable.",
    "Rideau de pluie bien visible vers l'ouest.",
  ],
  orage: [
    "Base très sombre et tonnerre audible à distance.",
    "Cellule active observée depuis un lieu fermé.",
    "Passage bref avec pluie forte et activité électrique espacée.",
  ],
  foudre: [
    "Deux impacts lointains visibles depuis un point abrité.",
    "Éclairs intranuageux réguliers vers l'horizon.",
    "Activité électrique distante, aucun déplacement vers la cellule.",
  ],
  "grêle": [
    "Grêlons petits et épisode inférieur à cinq minutes.",
    "Quelques impacts de grêle mêlés à une forte averse.",
    "Sol brièvement blanchi, taille difficile à estimer.",
  ],
  rafales: [
    "Rafale nette visible dans les arbres, sans mesure instrumentale.",
    "Vent soudain avant le rideau de pluie.",
    "Branches fortement agitées pendant moins de deux minutes.",
  ],
  tornade: ["Rotation suspecte à distance, information non confirmée."],
  neige: ["Averses de neige fondante, tenue très temporaire."],
  verglas: ["Chaussée brillante et glissante signalée localement."],
  brouillard: [
    "Nappe locale près des zones humides, visibilité variable.",
    "Visibilité nettement réduite sur quelques centaines de mètres.",
    "Brouillard en plaques, amélioration rapide hors vallée.",
  ],
  inondation: [
    "Accumulation d'eau sur un point bas, route encore praticable.",
    "Ruissellement marqué après une forte averse.",
    "Flaques profondes signalées, niveau stable pour le moment.",
  ],
  chaleur: ["Chaleur lourde et peu de vent dans la zone urbaine."],
  froid: ["Gel local encore visible dans les zones ombragées."],
  nuage: [
    "Structure nuageuse bien dessinée vers le nord-ouest.",
    "Base sombre mais aucun phénomène au sol observé.",
    "Éclaircie rapide entre deux bancs nuageux.",
  ],
  "arc-en-ciel": [
    "Arc lumineux visible quelques minutes derrière l'averse.",
    "Double arc très bref vers l'est.",
    "Couleurs nettes au-dessus de l'horizon après le passage pluvieux.",
  ],
};

export const SOCIAL_DEMO_AUTHORS: ProductAuthor[] = Array.from({ length: 96 }, (_, index) => {
  const firstName = FIRST_NAMES[index % FIRST_NAMES.length];
  const lastName = LAST_NAMES[(index * 7 + Math.floor(index / FIRST_NAMES.length)) % LAST_NAMES.length];
  const displayName = `${firstName} ${lastName}`;
  const place = PLACES[(index * 5) % PLACES.length];
  const role: ProductAuthor["role"] = index % 19 === 0
    ? "association"
    : index % 7 === 0
      ? "creator"
      : index % 5 === 0
        ? "reliable"
        : "member";
  return {
    id: `demo-author-${String(index + 1).padStart(3, "0")}`,
    displayName,
    handle: `@${slug(firstName)}_${slug(lastName).slice(0, 8)}${index + 1}`,
    initials: initials(displayName),
    region: place.region,
    role,
    accent: ACCENTS[index % ACCENTS.length],
  };
});

export const SOCIAL_DEMO_OBSERVATIONS: Observation[] = Array.from({ length: 320 }, (_, index) => {
  const author = SOCIAL_DEMO_AUTHORS[(index * 11) % SOCIAL_DEMO_AUTHORS.length];
  const place = PLACES[(index * 7 + Math.floor(random() * PLACES.length)) % PLACES.length];
  const category = PHENOMENA[(index * 5 + Math.floor(random() * PHENOMENA.length)) % PHENOMENA.length];
  const extras = RELATED[category].filter(() => random() > 0.62).slice(0, index % 5 === 0 ? 2 : 1);
  const phenomena = [category, ...extras.filter((item) => item !== category)];
  const ageMinutes = index < 80
    ? 1 + Math.floor(random() * 45)
    : index < 240
      ? 25 + Math.floor(random() * 220)
      : 260 + Math.floor(random() * 2_400);
  const active = index < 240;
  return {
    id: `demo-observation-${String(index + 1).padStart(3, "0")}`,
    nickname: author.displayName,
    category,
    phenomena,
    intensity: 1 + Math.floor(random() * 5),
    details: pick(OBSERVATION_DETAILS[category]),
    imageUrl: random() > 0.34 ? IMAGE_BY_PHENOMENON[category] : null,
    lat: place.lat + (random() - 0.5) * 0.16,
    lon: place.lon + (random() - 0.5) * 0.2,
    createdAt: agoMinutes(ageMinutes),
    likes: Math.floor(random() * 120),
    place: place.name,
    expiresAt: active
      ? new Date(DEMO_NOW + (35 + Math.floor(random() * 420)) * 60_000).toISOString()
      : new Date(DEMO_NOW - (10 + Math.floor(random() * 600)) * 60_000).toISOString(),
    isSeed: true,
  };
});

const POST_TITLES: Record<ObservationCategory, string[]> = {
  pluie: ["Le rideau de pluie gagne {place}", "Averse très localisée à {place}", "Quelques minutes de pluie soutenue"],
  orage: ["La cellule se structure près de {place}", "Tonnerre lointain au-dessus de {place}", "Retour sur le passage orageux"],
  foudre: ["Éclairs espacés vers {place}", "Deux impacts visibles à l'horizon", "La foudre reste au loin"],
  "grêle": ["Une courte averse de grêle", "Petits grêlons observés à {place}", "Retour sur un épisode très bref"],
  rafales: ["La rafale précède la pluie", "Vent soudain autour de {place}", "Ce que montrent les arbres avant l'averse"],
  tornade: ["Rotation à vérifier près de {place}"],
  neige: ["Neige fondante à {place}", "Une averse blanche très temporaire"],
  verglas: ["Point glissant signalé près de {place}", "Gel local dans les zones ombragées"],
  brouillard: ["Brouillard en plaques à {place}", "La visibilité change en quelques rues", "Une nappe tenace le long du canal"],
  inondation: ["Ruissellement sur un point bas", "Accumulation d'eau près de {place}", "Après l'averse, les sols saturent"],
  chaleur: ["Chaleur lourde dans le centre de {place}", "Peu de vent et une soirée très douce"],
  froid: ["Le gel résiste encore à {place}", "Froid local dans les zones abritées"],
  nuage: ["Une structure remarquable vers {place}", "Le ciel change rapidement", "Base sombre, mais peu de pluie au sol"],
  "arc-en-ciel": ["Un arc bref au-dessus de {place}", "L'éclaircie révèle un double arc", "Trois minutes de lumière après l'averse"],
};

const POST_BODIES = [
  "La publication conserve une position approximative et l'heure de prise de vue. Plusieurs membres ont ajouté des précisions depuis.",
  "Le phénomène est très local : quelques kilomètres plus loin, les conditions sont déjà différentes.",
  "Observation partagée depuis un lieu sûr. Les valeurs ressenties ne sont pas présentées comme des mesures officielles.",
  "La comparaison avec Atlas aide à replacer ce témoignage dans la situation, sans transformer le signal en alerte.",
  "Merci aux personnes du secteur qui ont décrit ce qu'elles voyaient réellement, y compris lorsqu'aucun phénomène n'était visible.",
] as const;

export const SOCIAL_DEMO_POSTS: ProductPost[] = Array.from({ length: 240 }, (_, index) => {
  const author = SOCIAL_DEMO_AUTHORS[(index * 13) % SOCIAL_DEMO_AUTHORS.length];
  const observation = SOCIAL_DEMO_OBSERVATIONS[(index * 7) % SOCIAL_DEMO_OBSERVATIONS.length];
  const place = PLACES[(index * 9) % PLACES.length];
  const category = observation.category;
  const roll = random();
  const kind: ProductPost["kind"] = roll < 0.3
    ? "observation"
    : roll < 0.55
      ? "photo"
      : roll < 0.75
        ? "analysis"
        : roll < 0.9
          ? "question"
          : "recap";
  const likes = 3 + Math.floor(random() * (kind === "photo" ? 420 : 210));
  return {
    id: `demo-post-${String(index + 1).padStart(3, "0")}`,
    authorId: author.id,
    kind,
    title: pick(POST_TITLES[category]).replace("{place}", place.name),
    body: pick(POST_BODIES),
    imageUrl: random() > 0.08 ? IMAGE_BY_PHENOMENON[category] : undefined,
    place: place.name,
    lat: place.lat + (random() - 0.5) * 0.08,
    lon: place.lon + (random() - 0.5) * 0.1,
    phenomena: observation.phenomena ?? [category],
    publishedAt: agoMinutes(2 + Math.floor(Math.pow(random(), 2.2) * 7_200)),
    likes,
    comments: 2 + Math.floor(random() * 42),
    shares: Math.floor(likes * (0.04 + random() * 0.18)),
    observationId: kind === "observation" ? observation.id : undefined,
    useful: random() > 0.36,
  };
}).sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

const COMMENT_BODIES = [
  "Même évolution observée quelques kilomètres plus au nord.",
  "Merci pour l'heure précise, cela aide beaucoup à comparer avec Atlas.",
  "Ici le vent est passé avant la pluie, mais sans phénomène fort.",
  "Je confirme la baisse de visibilité dans la même zone.",
  "Très utile d'avoir indiqué ce qui n'a pas été observé.",
  "La structure était visible aussi depuis mon quartier.",
  "Est-ce que l'intensité a diminué depuis la publication ?",
  "Photo très claire, merci d'avoir gardé la localisation approximative.",
  "Le passage a été bref chez nous, moins de cinq minutes.",
  "Je garde ce retour pour le récapitulatif de ce soir.",
] as const;

export const SOCIAL_DEMO_COMMENTS_BY_TARGET: Record<string, ProductComment[]> = Object.fromEntries(
  SOCIAL_DEMO_POSTS.map((post, postIndex) => {
    const count = Math.min(9, post.comments);
    const comments = Array.from({ length: count }, (_, commentIndex) => {
      const author = SOCIAL_DEMO_AUTHORS[(postIndex * 3 + commentIndex * 17) % SOCIAL_DEMO_AUTHORS.length];
      return {
        id: `demo-comment-${postIndex + 1}-${commentIndex + 1}`,
        authorId: author.id,
        authorName: author.displayName,
        body: COMMENT_BODIES[(postIndex + commentIndex) % COMMENT_BODIES.length],
        createdAt: new Date(new Date(post.publishedAt).getTime() + (commentIndex + 1) * 4 * 60_000).toISOString(),
      };
    });
    return [post.id, comments];
  }),
);

export const SOCIAL_DEMO_COMMUNITIES: Community[] = [
  ["weppes", "Veille Météo Weppes", "VM", "Weppes · Lys", "Suivre les averses, le vent et les contrastes locaux à l'ouest de Lille.", "weather", "#55c2ff", 1876, 132, 68, 50.64, 2.82, "averse-route.webp"],
  ["scarpe", "Scarpe & Sensée Observations", "SS", "Douaisis · Scarpe", "Observations de terrain, crues locales et mémoire des épisodes.", "local", "#58d5a5", 1142, 87, 51, 50.37, 3.08, "brouillard-canal.webp"],
  ["flandres", "Flandres Ciel Ouvert", "FC", "Flandres françaises et belges", "Nuages, phénomènes convectifs et photographie transfrontalière.", "photography", "#65d8f3", 2264, 174, 76, 50.86, 2.92, "arcus-champs.webp"],
  ["bruxelles", "Bruxelles Ciel Partagé", "BC", "Bruxelles et Brabant", "Comprendre les effets urbains et partager des observations de quartier.", "local", "#9b8cff", 3157, 241, 93, 50.85, 4.36, "foudre-lointaine.webp"],
  ["ardennes", "Ardennes Météo Terrain", "AM", "Ardennes franco-belges", "Relief, neige, brouillard et retours de terrain prudents.", "field", "#4f8cff", 892, 61, 37, 49.92, 4.88, "brouillard-canal.webp"],
  ["zeelande", "Littoral Zélande", "LZ", "Zélande · Escaut", "Vent côtier, grains marins et visibilité sur l'estuaire.", "weather", "#65d8f3", 1733, 118, 62, 51.5, 3.65, "arc-en-ciel-dunes.webp"],
  ["ruhr", "Orages Ruhr & Westphalie", "RW", "Ruhr · Westphalie", "Veille collaborative des cellules et partage pédagogique multilingue.", "weather", "#ff7388", 4210, 306, 127, 51.48, 7.22, "foudre-lointaine.webp"],
  ["somme", "Vallée de la Somme", "VS", "Amiens · Abbeville", "Brouillards, crues, vent et vie météo de la vallée.", "local", "#58d5a5", 1294, 83, 44, 49.98, 2.02, "brouillard-canal.webp"],
  ["normandie", "Normandie Ciel & Mer", "NM", "Rouen · Le Havre", "Ciel maritime, grains, falaises et récits photographiques.", "media", "#4f8cff", 2865, 199, 88, 49.48, 0.74, "arc-en-ciel-dunes.webp"],
  ["luxembourg", "Luxembourg Weather Commons", "LW", "Luxembourg et Grande Région", "Un espace local ouvert pour les observations et ressources météo.", "association", "#f2c96d", 742, 49, 26, 49.61, 6.13, "averse-route.webp"],
  ["picardie", "Picardie Gel & Brouillard", "PG", "Picardie intérieure", "Suivi saisonnier des phénomènes de basse couche et routes sensibles.", "weather", "#89a2b8", 986, 56, 31, 49.82, 2.65, "grele-terrasse.webp"],
  ["benelux-photo", "Benelux Cloud Photography", "BP", "France · Belgique · Pays-Bas", "Séries photo, techniques et récits autour des structures nuageuses.", "photography", "#f2c96d", 3544, 215, 104, 51.27, 4.35, "arcus-champs.webp"],
].map(([key, name, mark, territory, description, template, accent, members, active, observations, lat, lon, banner]) => ({
  id: `community-demo-${key}`,
  slug: String(key),
  name: String(name),
  initials: String(mark),
  description: String(description),
  about: `${description} Cette communauté de démonstration illustre une activité locale dense sans prétendre représenter des utilisateurs réels.`,
  territory: String(territory),
  themes: ["Observation", "Local", "Pédagogie"],
  access: random() > 0.78 ? "request" : "public",
  template: template as Community["template"],
  memberCount: Number(members),
  activeCount: Number(active),
  observationCount: Number(observations),
  verified: random() > 0.45,
  bannerUrl: `/media/observations/${banner}`,
  accent: String(accent),
  center: { lat: Number(lat), lon: Number(lon) },
  rules: [
    "Décrire ce qui est réellement observé et conserver l'heure.",
    "Utiliser une position approximative pour les publications publiques.",
    "Distinguer les contributions communautaires des informations officielles.",
  ],
  featuredSpaceIds: [`space-demo-${key}-observations`, `space-demo-${key}-atlas`, `space-demo-${key}-general`],
}));

export const SOCIAL_DEMO_SECTIONS: CommunitySection[] = SOCIAL_DEMO_COMMUNITIES.flatMap((community) => [
  { id: `section-${community.id}-essential`, communityId: community.id, name: "Essentiel", order: 1 },
  { id: `section-${community.id}-field`, communityId: community.id, name: "Terrain", order: 2 },
  { id: `section-${community.id}-life`, communityId: community.id, name: "Vie locale", order: 3 },
]);

export const SOCIAL_DEMO_SPACES: CommunitySpace[] = SOCIAL_DEMO_COMMUNITIES.flatMap((community) => {
  const key = community.id.replace("community-demo-", "");
  return [
    { id: `space-demo-${key}-announcements`, communityId: community.id, sectionId: `section-${community.id}-essential`, name: "Informations", description: "Annonces et repères importants", type: "announcement", visibility: "public", unreadCount: Math.floor(random() * 4) },
    { id: `space-demo-${key}-resources`, communityId: community.id, sectionId: `section-${community.id}-essential`, name: "Ressources locales", description: "Guides, bilans et fiches maintenues", type: "resource", visibility: "public", unreadCount: Math.floor(random() * 3) },
    { id: `space-demo-${key}-observations`, communityId: community.id, sectionId: `section-${community.id}-field`, name: "Observations", description: "Signaux récents et confirmations", type: "observations", visibility: "public", unreadCount: 4 + Math.floor(random() * 18), live: true },
    { id: `space-demo-${key}-atlas`, communityId: community.id, sectionId: `section-${community.id}-field`, name: "Atlas local", description: "Carte du territoire communautaire", type: "atlas", visibility: "public", unreadCount: 0, live: true },
    { id: `space-demo-${key}-general`, communityId: community.id, sectionId: `section-${community.id}-life`, name: "Discussion locale", description: "Questions, échanges et entraide", type: "discussion", visibility: "members", unreadCount: 3 + Math.floor(random() * 24) },
    { id: `space-demo-${key}-media`, communityId: community.id, sectionId: `section-${community.id}-life`, name: "Galerie du ciel", description: "Photos, séries et récits visuels", type: "media", visibility: "public", unreadCount: Math.floor(random() * 12) },
    { id: `space-demo-${key}-events`, communityId: community.id, sectionId: `section-${community.id}-life`, name: "Événements", description: "Ateliers, rencontres et sorties", type: "event", visibility: "public", unreadCount: Math.floor(random() * 4) },
  ] satisfies CommunitySpace[];
});

const ALL_COMMUNITY_IDS = [
  "community-nord",
  "community-opale",
  "community-belgique",
  "community-photo",
  "community-field",
  ...SOCIAL_DEMO_COMMUNITIES.map((community) => community.id),
];

const EVENT_TITLES = [
  "Atelier de lecture du radar",
  "Balade nuages et lumière",
  "Briefing de veille locale",
  "Rencontre des nouveaux membres",
  "Retour collectif sur l'épisode de la semaine",
  "Photographier le ciel en sécurité",
  "Comprendre les brouillards locaux",
  "Soirée questions météo",
] as const;

export const SOCIAL_DEMO_EVENTS: CommunityEvent[] = Array.from({ length: 36 }, (_, index) => {
  const communityId = ALL_COMMUNITY_IDS[index % ALL_COMMUNITY_IDS.length];
  const place = PLACES[(index * 7) % PLACES.length];
  const startsIn = 4 + index * 7 + Math.floor(random() * 18);
  return {
    id: `demo-event-${String(index + 1).padStart(2, "0")}`,
    communityId,
    title: EVENT_TITLES[index % EVENT_TITLES.length],
    summary: "Un rendez-vous local avec programme clair, consignes de sécurité et compte rendu conservé dans la communauté.",
    startsAt: fromNowHours(startsIn),
    endsAt: fromNowHours(startsIn + 2),
    place: index % 4 === 0 ? "En ligne" : `${place.name} · lieu communiqué aux participants`,
    access: index % 5 === 0 ? "members" : "public",
    format: index % 4 === 0 ? "online" : index % 3 === 0 ? "hybrid" : "onsite",
    participantCount: 8 + Math.floor(random() * 95),
    interestedCount: 24 + Math.floor(random() * 240),
    imageUrl: pick(Object.values(IMAGE_BY_PHENOMENON)),
    lat: place.lat,
    lon: place.lon,
  };
});

const ROLE_NAMES = [
  ["owner", "Propriétaire", "#ff7388", 100, true],
  ["admin", "Administrateur", "#9b8cff", 80, true],
  ["moderator", "Modérateur", "#65d8f3", 60, false],
  ["observer", "Observateur vérifié", "#58d5a5", 40, false],
  ["member", "Membre", "#4f8cff", 20, false],
] as const;

export const SOCIAL_DEMO_ROLES: CommunityRole[] = ALL_COMMUNITY_IDS
  .filter((communityId) => communityId !== "community-nord")
  .flatMap((communityId) => ROLE_NAMES.map(([key, name, color, priority, critical]) => ({
    id: `role-${communityId}-${key}`,
    communityId,
    name,
    summary: name === "Membre" ? "Participation normale aux espaces autorisés." : "Responsabilité locale visible dans cette communauté.",
    color,
    priority,
    critical,
    permissions: name === "Membre"
      ? ["Lire", "Commenter", "Réagir"]
      : ["Gérer les contenus autorisés", "Accompagner les membres"],
  })));

export const SOCIAL_DEMO_MEMBERS: CommunityMember[] = ALL_COMMUNITY_IDS.flatMap((communityId, communityIndex) => {
  const count = communityId === "community-nord" ? 72 : 18;
  return Array.from({ length: count }, (_, memberIndex) => {
    const author = SOCIAL_DEMO_AUTHORS[(communityIndex * 13 + memberIndex * 5) % SOCIAL_DEMO_AUTHORS.length];
    const roleKey = memberIndex === 0 ? "owner" : memberIndex < 3 ? "moderator" : memberIndex < 7 ? "observer" : "member";
    const roleId = communityId === "community-nord"
      ? roleKey === "owner"
        ? "role-owner"
        : roleKey === "moderator"
          ? "role-moderator"
          : roleKey === "observer"
            ? "role-observer"
            : "role-member"
      : `role-${communityId}-${roleKey}`;
    return {
      id: `demo-member-${communityIndex + 1}-${memberIndex + 1}`,
      communityId,
      displayName: author.displayName,
      handle: author.handle,
      initials: author.initials,
      roleId,
      joinedAt: agoMinutes(1_440 * (12 + Math.floor(random() * 850))),
      contributionCount: 2 + Math.floor(random() * 560),
      presence: memberIndex < 4 ? "active" : memberIndex < 8 ? "available" : memberIndex % 5 === 0 ? "busy" : "offline",
      accent: author.accent,
    };
  });
});

type MessageTarget = {
  communityId: string;
  spaceId: string;
  type: CommunitySpace["type"];
};

const CORE_MESSAGE_TARGETS: MessageTarget[] = [
  { communityId: "community-nord", spaceId: "space-nord-announcements", type: "announcement" },
  { communityId: "community-nord", spaceId: "space-nord-general", type: "discussion" },
  { communityId: "community-nord", spaceId: "space-nord-forecast", type: "discussion" },
  { communityId: "community-nord", spaceId: "space-nord-observations", type: "observations" },
  { communityId: "community-nord", spaceId: "space-nord-resources", type: "resource" },
  { communityId: "community-opale", spaceId: "space-opale-general", type: "discussion" },
  { communityId: "community-belgique", spaceId: "space-belgique-general", type: "discussion" },
];

const MESSAGE_TARGETS: MessageTarget[] = [
  ...CORE_MESSAGE_TARGETS,
  ...SOCIAL_DEMO_SPACES
    .filter((space) => !["atlas", "media", "event"].includes(space.type))
    .map((space) => ({ communityId: space.communityId, spaceId: space.id, type: space.type })),
];

const MESSAGE_BODIES = [
  "Ici le ciel s'éclaircit rapidement. Je ne vois plus de pluie depuis environ dix minutes.",
  "Même constat dans la commune voisine, avec une rafale juste avant l'averse.",
  "Merci pour le retour. La zone approximative suffit largement pour cette observation.",
  "Le contraste est très local aujourd'hui : restons prudents dans les comparaisons.",
  "J'ajoute une photo prise depuis l'intérieur, l'heure est indiquée dans la publication.",
  "Aucun phénomène fort chez moi pour le moment, seulement une base nuageuse sombre.",
  "Le fil de synthèse a été mis à jour avec les confirmations et les absences de signal.",
  "Pensez à séparer ce qui est observé de ce qui est interprété sur la carte.",
  "La visibilité revient progressivement sur l'axe principal.",
  "Question : le passage a-t-il aussi été bref plus à l'est ?",
  "Je confirme, moins de cinq minutes ici et pas de grêle observée.",
  "Merci à tous, les contributions restent précises et faciles à relire.",
] as const;

export const SOCIAL_DEMO_COMMUNITY_MESSAGES: CommunityMessage[] = Array.from({ length: 960 }, (_, index) => {
  const target = MESSAGE_TARGETS[index % MESSAGE_TARGETS.length];
  const author = SOCIAL_DEMO_AUTHORS[(index * 19) % SOCIAL_DEMO_AUTHORS.length];
  const kind: CommunityMessage["kind"] = target.type === "announcement"
    ? "announcement"
    : target.type === "resource"
      ? "resource"
      : target.type === "observations"
        ? "observation"
        : "message";
  return {
    id: `demo-community-message-${String(index + 1).padStart(4, "0")}`,
    communityId: target.communityId,
    spaceId: target.spaceId,
    authorId: author.id,
    authorName: author.displayName,
    authorInitials: author.initials,
    body: MESSAGE_BODIES[(index * 5) % MESSAGE_BODIES.length],
    createdAt: agoMinutes(3 + index * 4 + Math.floor(random() * 18)),
    kind,
    replyToId: index >= MESSAGE_TARGETS.length && index % 4 === 0
      ? `demo-community-message-${String(index + 1 - MESSAGE_TARGETS.length).padStart(4, "0")}`
      : undefined,
    reactions: random() > 0.38
      ? {
          Utile: 1 + Math.floor(random() * 34),
          Merci: 1 + Math.floor(random() * 19),
          Confirmé: Math.floor(random() * 12),
        }
      : undefined,
  };
}).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

const DIRECT_MESSAGE_BODIES = [
  "Merci pour ton retour sur la publication.",
  "Je t'envoie le lien vers la ressource dont on parlait.",
  "La zone approximative est parfaite, pas besoin d'être plus précis.",
  "Je regarde Atlas et je te réponds dans quelques minutes.",
  "Oui, j'ai observé le même changement depuis mon quartier.",
  "On peut déplacer cette discussion dans l'espace local pour que le suivi reste collectif.",
  "La photo est très claire. D'accord pour l'utiliser avec ton crédit ?",
  "Le rendez-vous est confirmé, toutes les informations sont dans l'événement.",
  "Merci, je note aussi l'absence de grêle chez toi.",
  "Bonne idée. Je prépare une synthèse courte pour ce soir.",
] as const;

export const SOCIAL_DEMO_DIRECT_CONVERSATIONS: DirectConversation[] = Array.from({ length: 34 }, (_, index) => {
  const participantCount = index % 7 === 0 ? 3 : index % 4 === 0 ? 2 : 1;
  const participants = Array.from({ length: participantCount }, (_, participantIndex) => (
    SOCIAL_DEMO_AUTHORS[(index * 7 + participantIndex * 23) % SOCIAL_DEMO_AUTHORS.length]
  ));
  return {
    id: `demo-conversation-${String(index + 1).padStart(2, "0")}`,
    participantIds: participants.map((author) => author.id),
    participantNames: participants.map((author) => author.displayName),
    participantInitials: participants.map((author) => author.initials),
    title: participantCount > 1 ? `Groupe · ${participants.map((author) => author.displayName.split(" ")[0]).join(", ")}` : participants[0].displayName,
    preview: DIRECT_MESSAGE_BODIES[index % DIRECT_MESSAGE_BODIES.length],
    updatedAt: agoMinutes(4 + index * 19),
    unreadCount: index % 3 === 0 ? 1 + index % 5 : 0,
    request: index > 29,
    accent: ACCENTS[index % ACCENTS.length],
  };
});

export const SOCIAL_DEMO_DIRECT_MESSAGES: DirectMessage[] = SOCIAL_DEMO_DIRECT_CONVERSATIONS.flatMap((conversation, conversationIndex) => {
  const count = 10 + conversationIndex % 12;
  return Array.from({ length: count }, (_, messageIndex) => {
    const remoteIndex = messageIndex % conversation.participantIds.length;
    const mine = messageIndex % 4 === 1;
    return {
      id: `demo-direct-${conversationIndex + 1}-${messageIndex + 1}`,
      conversationId: conversation.id,
      authorId: mine ? "local-user" : conversation.participantIds[remoteIndex],
      authorName: mine ? "XimaM" : conversation.participantNames[remoteIndex],
      body: DIRECT_MESSAGE_BODIES[(conversationIndex + messageIndex) % DIRECT_MESSAGE_BODIES.length],
      createdAt: agoMinutes((count - messageIndex) * 8 + conversationIndex * 22),
    };
  });
});

const NOTIFICATION_TITLES = [
  ["reply", "Une réponse dans votre fil", "Une personne a ajouté une précision utile à votre message."],
  ["mention", "Vous avez été mentionné", "Votre avis est demandé dans une discussion locale."],
  ["event", "Un événement approche", "Le programme et le lieu ont été confirmés."],
  ["observation", "Nouvelle observation suivie", "Un signal récent correspond à vos thèmes favoris."],
  ["membership", "Activité dans une communauté", "Une demande ou une invitation a changé de statut."],
  ["moderation", "Décision de modération", "Un contenu signalé a été traité par l'équipe locale."],
] as const;

export const SOCIAL_DEMO_NOTIFICATIONS: CommunityNotification[] = Array.from({ length: 180 }, (_, index) => {
  const [type, title, body] = NOTIFICATION_TITLES[index % NOTIFICATION_TITLES.length];
  return {
    id: `demo-notification-${String(index + 1).padStart(3, "0")}`,
    communityId: ALL_COMMUNITY_IDS[index % ALL_COMMUNITY_IDS.length],
    type,
    priority: index % 23 === 0 ? "critical" : index % 5 === 0 ? "high" : index % 3 === 0 ? "low" : "normal",
    title,
    body,
    createdAt: agoMinutes(5 + index * 16),
    targetSpaceId: type === "reply" || type === "mention" ? "space-nord-general" : undefined,
    targetObservationId: type === "observation"
      ? SOCIAL_DEMO_OBSERVATIONS[index % SOCIAL_DEMO_OBSERVATIONS.length].id
      : undefined,
  };
});

export const SOCIAL_DEMO_MODERATION_CASES: ModerationCase[] = Array.from({ length: 40 }, (_, index) => {
  const categories: ModerationCase["category"][] = ["quality", "spam", "misinformation", "safety", "harassment"];
  const category = categories[index % categories.length];
  return {
    id: `demo-moderation-${String(index + 1).padStart(2, "0")}`,
    communityId: index < 24 ? "community-nord" : ALL_COMMUNITY_IDS[index % ALL_COMMUNITY_IDS.length],
    priority: index % 17 === 0 ? "urgent" : index % 5 === 0 ? "high" : index % 3 === 0 ? "low" : "normal",
    category,
    title: category === "safety"
      ? "Information de localisation trop précise"
      : category === "misinformation"
        ? "Contribution présentée comme une alerte"
        : category === "spam"
          ? "Publication répétée dans plusieurs espaces"
          : category === "harassment"
            ? "Échange devenu personnel"
            : "Contenu publié dans le mauvais espace",
    summary: "Cas fictif de démonstration pour visualiser une file de modération active.",
    reportedContent: "Extrait masqué dans cette démonstration afin de ne pas reproduire de contenu sensible.",
    reportedMemberId: SOCIAL_DEMO_MEMBERS[index % SOCIAL_DEMO_MEMBERS.length].id,
    createdAt: agoMinutes(12 + index * 43),
    status: index % 4 === 0 ? "reviewing" : "open",
    previousActions: index % 4,
  };
});

export const SOCIAL_DEMO_ROOMS: StormRoom[] = Array.from({ length: 12 }, (_, index) => {
  const place = PLACES[(index * 4) % PLACES.length];
  const phenomenon = PHENOMENA[(index * 3) % PHENOMENA.length];
  return {
    id: `demo-room-${String(index + 1).padStart(2, "0")}`,
    title: `Suivi ${phenomenon} · ${place.name}`,
    shortTitle: `${place.name} · ${phenomenon}`,
    summary: "Salon temporaire pour rassembler observations, questions et sources pendant la situation.",
    area: place.region,
    phenomenon,
    status: index < 4 ? "active" : index < 9 ? "watching" : "archived",
    startedAt: agoMinutes(80 + index * 95),
    updatedAt: agoMinutes(3 + index * 11),
    lat: place.lat,
    lon: place.lon,
    participantCount: 24 + Math.floor(random() * 310),
    observationCount: 8 + Math.floor(random() * 76),
    messageCount: 32 + Math.floor(random() * 280),
    sourceCount: 1 + Math.floor(random() * 8),
    imageUrl: IMAGE_BY_PHENOMENON[phenomenon],
  };
});

export const SOCIAL_DEMO_ROOM_MESSAGES: RoomMessage[] = SOCIAL_DEMO_ROOMS.flatMap((room, roomIndex) => (
  Array.from({ length: 22 }, (_, messageIndex) => {
    const author = SOCIAL_DEMO_AUTHORS[(roomIndex * 9 + messageIndex * 7) % SOCIAL_DEMO_AUTHORS.length];
    return {
      id: `demo-room-message-${roomIndex + 1}-${messageIndex + 1}`,
      roomId: room.id,
      authorId: author.id,
      authorName: author.displayName,
      body: MESSAGE_BODIES[(roomIndex + messageIndex) % MESSAGE_BODIES.length],
      createdAt: agoMinutes((22 - messageIndex) * 5 + roomIndex * 13),
      kind: messageIndex % 8 === 0 ? "source" : messageIndex % 3 === 0 ? "confirmation" : "message",
    };
  })
));

export const SOCIAL_DEMO_STATS = {
  authors: SOCIAL_DEMO_AUTHORS.length + 5,
  posts: SOCIAL_DEMO_POSTS.length + 6,
  observations: SOCIAL_DEMO_OBSERVATIONS.length + 9,
  activeObservations: SOCIAL_DEMO_OBSERVATIONS.filter((observation) => (
    !observation.expiresAt || new Date(observation.expiresAt).getTime() > DEMO_NOW
  )).length + 9,
  communities: SOCIAL_DEMO_COMMUNITIES.length + 5,
  communityMessages: SOCIAL_DEMO_COMMUNITY_MESSAGES.length + 8,
  directMessages: SOCIAL_DEMO_DIRECT_MESSAGES.length + 6,
  comments: Object.values(SOCIAL_DEMO_COMMENTS_BY_TARGET).reduce((total, comments) => total + comments.length, 0),
  shares: SOCIAL_DEMO_POSTS.reduce((total, post) => total + post.shares, 0),
  mediaPosts: SOCIAL_DEMO_POSTS.filter((post) => post.imageUrl).length + 6,
} as const;
