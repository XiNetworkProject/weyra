import { describe, expect, it } from "vitest";
import {
  radarFramesFromLayer,
  radarProductInfo,
  type RadarLayerCatalog,
  type RadarLayerPack,
} from "@/lib/radar-layers";

const pack: RadarLayerPack = {
  timestamp: "2026-09-13T12:00:00Z",
  key: "2026-09-13T120000Z-mf",
  status: "ready",
  product: "accumulation-1h",
  version: "layers-v1",
  provider: "Météo-France",
  attribution: "Source : Météo-France",
  coverage: { west: -5, south: 42, east: 10, north: 52 },
  tileSize: 256,
  minZoom: 3,
  maxZoom: 8,
  tileCount: 20,
  unit: "mm",
  publishedAt: "2026-09-13T12:01:00Z",
  durationMinutes: 60,
  intervalStart: "2026-09-13T11:00:00Z",
};
const catalog = (packs: RadarLayerPack[]): RadarLayerCatalog => ({
  ok: true,
  version: "layers-v1",
  updatedAt: null,
  errors: [],
  layers: {
    "accumulation-1h": { packs, expectedSamples: 12, receivedSamples: 12, latestSourceTimestamp: pack.timestamp },
  },
});
describe("radar product contracts", () => {
  it("uses isolated URLs and never routes amounts through the DBZH detail renderer", () => {
    const frame = radarFramesFromLayer(catalog([pack]), "accumulation-1h")[0];
    expect(frame.tiles).toContain(`/layers/accumulation-1h/${pack.key}/`);
    expect(frame.detailTiles).toBe("");
    expect(frame.maxZoom).toBe(8);
    expect(frame.provider).toBe("Météo-France");
  });
  it("rejects wrong products, units, durations, empty sets and invalid bounds", () => {
    for (const invalid of [
      { product: "reflectivity" },
      { unit: "dBZ" },
      { durationMinutes: 180 },
      { intervalStart: "2026-09-13T11:05:00Z" },
      { tileCount: 0 },
      { key: "../../file" },
      { coverage: { west: 10, east: -5, south: 42, north: 52 } },
    ]) {
      expect(radarFramesFromLayer(catalog([{ ...pack, ...invalid } as RadarLayerPack]), "accumulation-1h")).toEqual([]);
    }
    expect(radarFramesFromLayer(catalog([]), "reflectivity")).toEqual([]);
  });
  it("keeps accumulation and reflectivity legends in their physical units", () => {
    expect(radarProductInfo("reflectivity").unit).toBe("dBZ");
    expect(radarProductInfo("accumulation-1h").unit).toBe("mm");
    expect(radarProductInfo("accumulation-1h").heading).toContain("1 H");
    expect(radarProductInfo("accumulation-3h").heading).toContain("3 H");
    expect(radarProductInfo("reflectivity").gradient).not.toBe(radarProductInfo("accumulation-1h").gradient);
  });
});
