export type Observation = {
  id: string;
  title: string;
  phenomenon: string;
  description: string;
  place: string;
  lat: number;
  lon: number;
  image: string;
  author: string;
  time: string;
  demo?: boolean;
  intensity: number;
  visibility?: string;
  community?: string;
  owner?: boolean;
};
export const observations: Observation[] = [
  {
    id: "demo-1",
    title: "Le ciel prend une autre dimension",
    phenomenon: "Nuages",
    description:
      "Une lumière incroyable sous ce ciel chargé. Exemple de publication pour découvrir Weyra ; cette photographie ne représente pas une observation actuelle à cet endroit.",
    place: "Lille",
    lat: 50.64,
    lon: 3.07,
    image: "/images/arcus.jpg",
    author: "Camille · démo",
    time: "Exemple",
    demo: true,
    intensity: 3,
    community: "nord",
  },
  {
    id: "demo-2",
    title: "L’instant suspendu",
    phenomenon: "Orage",
    description: "Un éclair illumine le paysage. Contenu de démonstration, sans lien avec la météo actuelle.",
    place: "Dunkerque",
    lat: 51.03,
    lon: 2.37,
    image: "/images/lightning.jpg",
    author: "Thomas · démo",
    time: "Exemple",
    demo: true,
    intensity: 4,
    community: "opale",
  },
  {
    id: "demo-3",
    title: "Les dernières lumières du jour",
    phenomenon: "Ciel remarquable",
    description: "Une invitation à lever les yeux. Photo illustrative présentée dans la galerie de démonstration.",
    place: "Arras",
    lat: 50.29,
    lon: 2.78,
    image: "/images/clouds.jpg",
    author: "Lou · démo",
    time: "Exemple",
    demo: true,
    intensity: 1,
    community: "photo",
  },
  {
    id: "demo-4",
    title: "Un horizon plein de relief",
    phenomenon: "Nuages",
    description:
      "Exemple de contribution communautaire. Le lieu sert uniquement à présenter le fonctionnement de la carte.",
    place: "Calais",
    lat: 50.95,
    lon: 1.86,
    image: "/images/arcus.jpg",
    author: "Alex · démo",
    time: "Exemple",
    demo: true,
    intensity: 2,
    community: "opale",
  },
  {
    id: "demo-5",
    title: "Le ciel de Flandre",
    phenomenon: "Ciel remarquable",
    description: "Exemple photographique pour explorer les observations et leur fil de discussion.",
    place: "Hazebrouck",
    lat: 50.73,
    lon: 2.54,
    image: "/images/clouds.jpg",
    author: "Léa · démo",
    time: "Exemple",
    demo: true,
    intensity: 1,
    community: "nord",
  },
  {
    id: "demo-6",
    title: "À l’horizon",
    phenomenon: "Orage",
    description: "Contenu de démonstration. Aucune alerte ni observation météo en direct n’est déduite de cette image.",
    place: "Tournai",
    lat: 50.6,
    lon: 3.39,
    image: "/images/lightning.jpg",
    author: "Jules · démo",
    time: "Exemple",
    demo: true,
    intensity: 3,
    community: "nord",
  },
];
export const communities = [
  {
    id: "nord",
    name: "Observateurs du Nord",
    area: "Hauts-de-France",
    description:
      "Un même territoire, mille regards sur le ciel. Observations locales, échanges et découvertes, de Lille aux Flandres.",
    image: "/images/arcus.jpg",
    theme: "Territoire",
    initials: "ON",
  },
  {
    id: "opale",
    name: "Les ciels d’Opale",
    area: "Littoral des Hauts-de-France",
    description: "Entre terre et mer, partageons les lumières, les passages nuageux et la météo de notre côte.",
    image: "/images/lightning.jpg",
    theme: "Territoire",
    initials: "CO",
  },
  {
    id: "photo",
    name: "Chasseurs de lumière",
    area: "Photographie du ciel",
    description: "L’art de regarder en l’air. Compositions, lumière, retours photo et instants remarquables.",
    image: "/images/clouds.jpg",
    theme: "Photographie",
    initials: "CL",
  },
];
export const articles = [
  {
    id: "arcus",
    title: "Ce nuage qui dessine un horizon",
    category: "Observer",
    image: "/images/arcus.jpg",
    body: "Un arcus est un nuage bas en forme de rouleau ou d’arc, parfois visible à l’avant d’un orage. La photographie seule ne permet pas d’évaluer la dangerosité d’une situation. Pour identifier ce que vous voyez, notez l’heure, la direction et l’évolution du nuage ; comparez ensuite les observations et les données disponibles.",
    source: "https://cloudatlas.wmo.int/en/clouds-supplementary-features-arcus.html",
  },
  {
    id: "radar",
    title: "La carte radar, en quelques repères",
    category: "Comprendre",
    image: "/images/lightning.jpg",
    body: "Une image radar représente les échos détectés par les radars météo. Elle aide à suivre les zones de précipitations, mais ne décrit pas parfaitement ce qui atteint le sol. Comparez plusieurs images datées et les observations du terrain. Weyra affiche les scans Météo-France et EUMETNET OPERA prêts, avec leur source et leur heure, sans image future inventée.",
    source: "/status/radar",
  },
  {
    id: "photo",
    title: "Garder la trace d’un beau ciel",
    category: "Photographier",
    image: "/images/clouds.jpg",
    body: "Choisissez un premier plan simple pour donner une échelle au ciel. Notez le lieu approximatif et le moment de la photo. Dans votre carnet, racontez ce qui vous a frappé : lumière, couleur ou mouvement. Publiez uniquement des médias que vous avez le droit de partager et vérifiez les personnes ou informations visibles.",
    source: "",
  },
];
export const cities = [
  { name: "Lille", latitude: 50.6292, longitude: 3.0573 },
  { name: "Dunkerque", latitude: 51.0344, longitude: 2.3768 },
  { name: "Calais", latitude: 50.9513, longitude: 1.8587 },
  { name: "Hazebrouck", latitude: 50.723, longitude: 2.537 },
  { name: "Arras", latitude: 50.291, longitude: 2.777 },
  { name: "Tournai", latitude: 50.606, longitude: 3.389, country: "Belgique" },
];
