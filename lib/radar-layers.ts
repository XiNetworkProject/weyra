import palettes from "@/radar-worker/layer-palettes.json";
import type { HorizonRadarFrame } from "@/lib/horizon-radar";
import type { RadarDataProvider, OperaScanPackCoverage } from "@/lib/types";

export const RADAR_PRODUCTS = ["precipitation", "reflectivity", "accumulation-1h", "accumulation-3h"] as const;
export type RadarProduct = (typeof RADAR_PRODUCTS)[number];
export type ExtraRadarProduct = Exclude<RadarProduct, "precipitation">;
export const isExtraRadarProduct = (value: string): value is ExtraRadarProduct =>
  value !== "precipitation" && RADAR_PRODUCTS.includes(value as RadarProduct);

export type RadarLayerPack = {
  timestamp: string;
  key: string;
  status: "ready";
  product: ExtraRadarProduct;
  version: string;
  provider: RadarDataProvider;
  attribution: string;
  coverage: OperaScanPackCoverage;
  tileSize: number;
  minZoom: number;
  maxZoom: number;
  tileCount: number;
  unit: "dBZ" | "mm";
  publishedAt: string;
  durationMinutes: number | null;
  intervalStart: string | null;
};
export type RadarLayerState = {
  packs: RadarLayerPack[];
  expectedSamples: number | null;
  receivedSamples: number;
  latestSourceTimestamp: string | null;
};
export type RadarLayerCatalog = {
  ok: boolean;
  version: string;
  updatedAt: string | null;
  layers: Partial<Record<ExtraRadarProduct, RadarLayerState>>;
  errors: string[];
};

export const radarProductInfo = (product: RadarProduct) => {
  if (product === "precipitation")
    return {
      title: "Précipitations",
      heading: "RADAR DES PRÉCIPITATIONS",
      description: "La pluie en mouvement",
      unit: "",
      labels: ["Faibles", "Fortes"],
      gradient: undefined,
    };
  const reflectivity = product === "reflectivity";
  const palette = reflectivity ? palettes.reflectivity : palettes.accumulation;
  const low = palette.stops[0][0],
    high = palette.stops.at(-1)![0];
  return {
    title: reflectivity ? "Réflectivité" : "Cumuls de pluie",
    heading: reflectivity
      ? "RÉFLECTIVITÉ RADAR · dBZ"
      : `CUMUL DE PLUIE · ${product === "accumulation-1h" ? "1 H" : "3 H"}`,
    description: reflectivity ? "Les échos, même les plus faibles" : "La quantité de pluie tombée",
    unit: palette.unit,
    labels: reflectivity ? ["−10", "10", "30", "50", "70+"] : ["0,1", "25", "50", "75", "100+"],
    // The legend and renderer interpolate the same stops in physical units.
    gradient: `linear-gradient(90deg, ${palette.stops.map(([value, r, g, b]) => `rgb(${r} ${g} ${b}) ${(100 * (value - low)) / (high - low)}%`).join(", ")})`,
  };
};

export function radarFramesFromLayer(catalog: RadarLayerCatalog, product: ExtraRadarProduct): HorizonRadarFrame[] {
  if (!catalog.ok) throw new Error("Couche radar indisponible");
  const frames = new Map<number, HorizonRadarFrame>();
  for (const pack of catalog.layers[product]?.packs ?? []) {
    const c = pack.coverage;
    const time = Date.parse(pack.timestamp) / 1000;
    if (pack.product !== product || pack.status !== "ready" || pack.tileCount < 1 || !Number.isFinite(time) || !c)
      continue;
    if (
      !/^[A-Za-z0-9-]+$/.test(pack.key) ||
      ![c.west, c.south, c.east, c.north].every(Number.isFinite) ||
      c.west >= c.east ||
      c.south >= c.north
    )
      continue;
    if (!Number.isInteger(pack.minZoom) || !Number.isInteger(pack.maxZoom) || pack.maxZoom < pack.minZoom) continue;
    const amount = product.startsWith("accumulation");
    const duration = product === "accumulation-1h" ? 60 : 180;
    if (
      amount &&
      (pack.unit !== "mm" ||
        pack.durationMinutes !== duration ||
        Date.parse(pack.timestamp) - Date.parse(pack.intervalStart ?? "") !== duration * 60_000)
    )
      continue;
    if (!amount && pack.unit !== "dBZ") continue;
    frames.set(time, {
      time,
      timestamp: pack.timestamp,
      tiles: `/api/radar/layers/${product}/${pack.key}/{z}/{x}/{y}`,
      detailTiles: "",
      minZoom: pack.minZoom,
      maxZoom: pack.maxZoom,
      detailMinZoom: 18,
      detailMaxZoom: 18,
      tileSize: pack.tileSize,
      bounds: [c.west, c.south, c.east, c.north],
      provider: pack.provider,
      attribution: pack.attribution,
      style: pack.version,
    });
  }
  return [...frames.values()].sort((a, b) => a.time - b.time).slice(-12);
}
