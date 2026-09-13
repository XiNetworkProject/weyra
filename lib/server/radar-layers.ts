import "server-only";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { RadarLayerCatalog, RadarLayerPack, ExtraRadarProduct } from "@/lib/radar-layers";
import { RADAR_CACHE_ROOT } from "@/lib/server/radar-config";

export const RADAR_LAYERS_ROOT = path.join(RADAR_CACHE_ROOT, "layers", "layers-v1");
const run = promisify(execFile);

export async function readRadarLayerCatalog(): Promise<RadarLayerCatalog> {
  try {
    return JSON.parse(await readFile(path.join(RADAR_LAYERS_ROOT, "catalog.json"), "utf8"));
  } catch {
    return { ok: true, version: "layers-v1", updatedAt: null, layers: {}, errors: [] };
  }
}

export async function readRadarLayerPack(product: ExtraRadarProduct, key: string): Promise<RadarLayerPack | null> {
  if (!/^[A-Za-z0-9-]{10,70}$/.test(key)) return null;
  try {
    const manifest = JSON.parse(
      await readFile(path.join(RADAR_LAYERS_ROOT, product, key, "manifest.json"), "utf8"),
    ) as RadarLayerPack;
    return manifest.status === "ready" && manifest.product === product && manifest.key === key ? manifest : null;
  } catch {
    return null;
  }
}

// Worker only: optional products run sequentially after the default live radar.
export async function prepareRadarLayers() {
  const { stdout } = await run(
    process.env.PYTHON_BIN?.trim() || "python3",
    [
      path.join(process.cwd(), "radar-worker", "prepare_radar_layers.py"),
      "--cache-root",
      RADAR_CACHE_ROOT,
      "--budget-seconds",
      "90",
    ],
    { timeout: 180_000, maxBuffer: 64 * 1024, env: { ...process.env, GDAL_NUM_THREADS: "1" } },
  );
  return JSON.parse(stdout) as { ok: boolean; errors: string[]; packs: Record<string, number> };
}
