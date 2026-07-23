import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Weyra - le ciel près de toi",
    short_name: "Weyra",
    description: "Atlas météo, observations locales et communautés du ciel.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#06111d",
    theme_color: "#06111d",
    lang: "fr",
    categories: ["weather", "social", "education"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: "Ouvrir Atlas",
        short_name: "Atlas",
        url: "/",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
      },
      {
        name: "Flux local",
        short_name: "Flux",
        url: "/?space=feed",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
      },
      {
        name: "Activité",
        short_name: "Activité",
        url: "/?space=activity",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
      },
    ],
  };
}
