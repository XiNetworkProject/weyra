import "server-only";

import { copyFile, link, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "fs/promises";
import path from "path";
import {
  getCachedRenderedOperaFrame,
  normalizeOperaTimestamp,
  operaCacheKey,
  operaCachedTileImagePath,
  operaOverviewTileJobsForBounds,
  operaSourceGridPath,
  prepareOperaFrames,
  runOperaOverviewTileBatch,
  TILE_RENDER_VERSION,
  type OperaOverviewTileJob,
  type OperaTilePrewarmResult,
} from "@/lib/server/opera-render";

// Scan packs: pre-published, fully static radar tile sets. A pack becomes "ready" only once
// every required overview tile (z3..z7 over the OPERA Europe extent) exists on disk, so Atlas
// can always paint the radar instantly from static files — no Python, no MeteoGate on any GET.
//
// PRODUCTION NOTE: ensureRadarScanPacks() must run in a permanent worker/cron (every 1-2 min).
// Locally it runs at server startup (instrumentation.ts) and via POST /api/radar/opera/packs/maintenance.

const RADAR_CACHE_ROOT = path.join(process.cwd(), ".radar-cache");
const FRAMES_DIR = path.join(RADAR_CACHE_ROOT, "frames");
export const PACKS_VERSION = "v1";
const PACKS_ROOT = path.join(RADAR_CACHE_ROOT, "packs", PACKS_VERSION);
const BUILDING_DIR_NAME = ".building";
const BUILDING_ROOT = path.join(PACKS_ROOT, BUILDING_DIR_NAME);

export const PACK_STYLE = TILE_RENDER_VERSION;
export const PACK_OVERVIEW_ZOOM_MIN = 3;
export const PACK_OVERVIEW_ZOOM_MAX = 7;
export const PACK_DETAIL_ZOOM_MIN = 8;
export const PACK_DETAIL_ZOOM_MAX = 11;
export const PACK_TILE_SIZE = 256;

const TARGET_SCAN_COUNT = 12;
const MAX_KEPT_PACKS = readPositiveIntEnv("WEYRA_RADAR_MAX_PACKS", 16);
const MAX_CONCURRENT_PACK_BUILDS = 2;
const STALE_BUILD_DIR_MS = 60 * 60_000;

export type ScanPackCoverage = { west: number; south: number; east: number; north: number };

export type ScanPackManifest = {
  timestamp: string;
  status: "building" | "ready" | "failed";
  publishedAt: string | null;
  style: string;
  packVersion: string;
  tileSize: number;
  baseZoomMin: number;
  baseZoomMax: number;
  detailZoomMin: number;
  detailZoomMax: number;
  baseTileCount: number;
  detailTileCount: number;
  coverage: ScanPackCoverage | null;
  packBytes?: number;
  buildDurationMs?: number;
  error?: string;
};

export type ScanPackMaintenanceSnapshot = {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  scansDetected: number;
  packsReady: number;
  building: string[];
  errors: Array<{ timestamp: string; error: string }>;
  note: string;
};

const buildInFlight = new Map<string, Promise<ScanPackManifest | null>>();
let maintenanceTask: Promise<void> | null = null;
let maintenanceSnapshot: ScanPackMaintenanceSnapshot = {
  running: false,
  startedAt: null,
  finishedAt: null,
  scansDetected: 0,
  packsReady: 0,
  building: [],
  errors: [],
  note: "En production, ce mécanisme doit tourner dans un worker/cron permanent.",
};

function readPositiveIntEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function packDir(timestamp: string) {
  return path.join(PACKS_ROOT, operaCacheKey(timestamp));
}

function packManifestPath(timestamp: string) {
  return path.join(packDir(timestamp), "manifest.json");
}

export function packOverviewTilePath(timestamp: string, z: number, x: number, y: number) {
  return path.join(packDir(timestamp), "overview", String(z), String(x), `${y}.webp`);
}

export function packDetailTilePath(timestamp: string, z: number, x: number, y: number) {
  return path.join(packDir(timestamp), "detail", String(z), String(x), `${y}.webp`);
}

// Files prewarmed for a viewport are mirrored into their scan pack
// (packs/v1/<timestamp>/detail/<z>/<x>/<y>.webp), so the pack directory carries the full radar
// payload of its scan and detail GETs are plain static reads. Hardlink when the filesystem
// allows it, plain copy otherwise. Best-effort: a mirror failure never fails the prewarm.
export async function mirrorPrewarmedDetailTilesIntoPacks(result: OperaTilePrewarmResult): Promise<void> {
  for (const item of result.timestamps ?? []) {
    const normalized = normalizeOperaTimestamp(item.timestamp);
    if (!normalized) continue;

    const manifest = await readManifestFile(packManifestPath(normalized));
    if (manifest?.status !== "ready") continue;

    for (const tile of item.readyTiles ?? []) {
      if (tile.z < PACK_DETAIL_ZOOM_MIN || tile.z > PACK_DETAIL_ZOOM_MAX) continue;
      const target = packDetailTilePath(normalized, tile.z, tile.x, tile.y);
      const alreadyMirrored = await stat(target).then(() => true).catch(() => false);
      if (alreadyMirrored) continue;

      const source = operaCachedTileImagePath(normalized, tile.z, tile.x, tile.y, PACK_STYLE);
      try {
        await mkdir(path.dirname(target), { recursive: true });
        await link(source, target).catch(() => copyFile(source, target));
      } catch {
        // The shared tile cache keeps serving as fallback for this tile.
      }
    }
  }
}

function sanitizePackError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/s3:\/\/\S+/gi, "[redacted-url]")
    .replace(/[A-Za-z]:[\\/][^\s]+/g, "[redacted-path]")
    .slice(0, 600);
}

async function readManifestFile(manifestPath: string): Promise<ScanPackManifest | null> {
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf-8")) as ScanPackManifest;
    if (!manifest.timestamp || !manifest.status) return null;
    return manifest;
  } catch {
    return null;
  }
}

export async function getScanPackManifest(timestamp: string): Promise<ScanPackManifest | null> {
  const normalized = normalizeOperaTimestamp(timestamp);
  if (!normalized) return null;
  return readManifestFile(packManifestPath(normalized));
}

export async function listScanPacks(): Promise<ScanPackManifest[]> {
  try {
    const entries = await readdir(PACKS_ROOT, { withFileTypes: true });
    const manifests: ScanPackManifest[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === BUILDING_DIR_NAME) continue;
      const manifest = await readManifestFile(path.join(PACKS_ROOT, entry.name, "manifest.json"));
      if (manifest) manifests.push(manifest);
    }

    return manifests.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  } catch {
    return [];
  }
}

export async function listReadyScanPacks(): Promise<ScanPackManifest[]> {
  const packs = await listScanPacks();
  return packs.filter((pack) => pack.status === "ready" && pack.baseTileCount > 0 && pack.coverage);
}

// Scans already rendered on disk (frame + source grid), without touching MeteoGate. This is what
// makes cold starts work offline: packs can be rebuilt from the local frame cache alone.
async function listCachedFrameTimestamps(): Promise<string[]> {
  try {
    const entries = await readdir(FRAMES_DIR, { withFileTypes: true });
    const timestamps: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const metadata = JSON.parse(await readFile(path.join(FRAMES_DIR, entry.name, "metadata.json"), "utf-8")) as {
          timestamp?: string | null;
          status?: string;
          tileReady?: boolean;
        };
        if (!metadata.timestamp || metadata.status !== "ready" || metadata.tileReady === false) continue;
        timestamps.push(metadata.timestamp);
      } catch {
        // Ignore corrupt frame entries.
      }
    }

    return timestamps.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  } catch {
    return [];
  }
}

async function countExistingTiles(root: string, jobs: OperaOverviewTileJob[], style: string, key: string) {
  let count = 0;
  let bytes = 0;
  const missing: OperaOverviewTileJob[] = [];

  for (const job of jobs) {
    const tilePath = path.join(root, "tiles", style, key, String(job.z), String(job.x), `${job.y}.webp`);
    try {
      const stats = await stat(tilePath);
      count += 1;
      bytes += stats.size;
    } catch {
      missing.push(job);
    }
  }

  return { count, bytes, missing };
}

async function buildScanPack(timestamp: string): Promise<ScanPackManifest | null> {
  const normalized = normalizeOperaTimestamp(timestamp);
  if (!normalized) return null;

  const existing = buildInFlight.get(normalized);
  if (existing) return existing;

  const pending = buildScanPackInternal(normalized).finally(() => {
    buildInFlight.delete(normalized);
  });
  buildInFlight.set(normalized, pending);
  return pending;
}

async function buildScanPackInternal(timestamp: string): Promise<ScanPackManifest | null> {
  const startedAt = Date.now();
  const key = operaCacheKey(timestamp);

  const published = await readManifestFile(packManifestPath(timestamp));
  if (published?.status === "ready" && published.style === PACK_STYLE && published.baseTileCount > 0) {
    return published;
  }

  const frame = await getCachedRenderedOperaFrame(timestamp);
  if (!frame) return null;

  const coverage = frame.metadata.geographicBounds ?? frame.metadata.bbox ?? null;
  if (!coverage) return null;

  const sourceGridPath = frame.metadata.sourceGridPath ?? operaSourceGridPath(timestamp);
  const sourceGridExists = await stat(sourceGridPath).then(() => true).catch(() => false);
  if (!sourceGridExists || frame.metadata.tileReady === false) return null;

  const jobs = operaOverviewTileJobsForBounds(coverage, PACK_OVERVIEW_ZOOM_MIN, PACK_OVERVIEW_ZOOM_MAX);
  if (!jobs.length) return null;

  const buildRoot = path.join(BUILDING_ROOT, `${key}-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  try {
    await mkdir(buildRoot, { recursive: true });
    await runOperaOverviewTileBatch({
      sourceGridPath,
      jobs,
      timestamp,
      outputRoot: buildRoot,
      style: PACK_STYLE,
    });

    // A pack may only be published once every required overview tile really exists.
    const { count, bytes, missing } = await countExistingTiles(buildRoot, jobs, PACK_STYLE, key);
    if (missing.length > 0) {
      throw new Error(`Overview batch left ${missing.length}/${jobs.length} tiles missing.`);
    }

    const stagedPackDir = path.join(buildRoot, "pack");
    await mkdir(path.join(stagedPackDir, "detail"), { recursive: true });
    await rename(path.join(buildRoot, "tiles", PACK_STYLE, key), path.join(stagedPackDir, "overview"));

    const manifest: ScanPackManifest = {
      timestamp,
      status: "ready",
      publishedAt: nowIso(),
      style: PACK_STYLE,
      packVersion: PACKS_VERSION,
      tileSize: PACK_TILE_SIZE,
      baseZoomMin: PACK_OVERVIEW_ZOOM_MIN,
      baseZoomMax: PACK_OVERVIEW_ZOOM_MAX,
      detailZoomMin: PACK_DETAIL_ZOOM_MIN,
      detailZoomMax: PACK_DETAIL_ZOOM_MAX,
      baseTileCount: count,
      detailTileCount: 0,
      coverage,
      packBytes: bytes,
      buildDurationMs: Date.now() - startedAt,
    };
    await writeFile(path.join(stagedPackDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");

    // Atomic publish: the fully validated pack directory is renamed into place, so Atlas can
    // never observe a partially generated pack behind a "ready" manifest.
    const finalDir = packDir(timestamp);
    await rm(finalDir, { recursive: true, force: true }).catch(() => undefined);
    await rename(stagedPackDir, finalDir);

    console.info(`[radar pack] published timestamp=${timestamp} tiles=${count} bytes=${bytes} dur=${Date.now() - startedAt}ms`);
    return manifest;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Self-heal: a truncated/corrupt source-grid.tif (e.g. a frame interrupted mid-write) can
    // never produce a pack. Quarantining the frame lets the next maintenance pass re-download
    // and re-render it through the normal frame pipeline.
    if (/read failed|not recognized as a supported file format|corrupt/i.test(message)) {
      await rm(path.join(FRAMES_DIR, key), { recursive: true, force: true }).catch(() => undefined);
      console.warn(`[radar pack] quarantined corrupt frame timestamp=${timestamp}`);
    }
    console.warn(`[radar pack] build failed timestamp=${timestamp}: ${sanitizePackError(error)}`);
    throw error;
  } finally {
    await rm(buildRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function pruneScanPacks() {
  try {
    const packs = await listScanPacks();
    const stale = packs
      .slice()
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(MAX_KEPT_PACKS);

    for (const pack of stale) {
      await rm(packDir(pack.timestamp), { recursive: true, force: true }).catch(() => undefined);
    }

    const buildEntries = await readdir(BUILDING_ROOT, { withFileTypes: true }).catch(() => []);
    for (const entry of buildEntries) {
      if (!entry.isDirectory()) continue;
      const entryPath = path.join(BUILDING_ROOT, entry.name);
      try {
        const stats = await stat(entryPath);
        if (Date.now() - stats.mtimeMs > STALE_BUILD_DIR_MS) {
          await rm(entryPath, { recursive: true, force: true });
        }
      } catch {
        // Ignore racing cleanups.
      }
    }
  } catch {
    // Pruning must never block pack availability.
  }
}

async function buildPacksForTimestamps(timestamps: string[], errors: Array<{ timestamp: string; error: string }>) {
  // Newest scans first: the frame Atlas shows immediately is always the first one repaired.
  const queue = [...timestamps].sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  let cursor = 0;

  async function worker() {
    while (cursor < queue.length) {
      const timestamp = queue[cursor];
      cursor += 1;
      if (!timestamp) continue;

      maintenanceSnapshot.building = [...new Set([...maintenanceSnapshot.building, timestamp])];
      try {
        await buildScanPack(timestamp);
      } catch (error) {
        errors.push({ timestamp, error: sanitizePackError(error) });
      } finally {
        maintenanceSnapshot.building = maintenanceSnapshot.building.filter((item) => item !== timestamp);
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(MAX_CONCURRENT_PACK_BUILDS, queue.length) },
    () => worker(),
  );
  await Promise.all(workers);
}

async function runScanPackMaintenance() {
  const errors: Array<{ timestamp: string; error: string }> = [];

  // Phase 1 — no network: publish packs for every scan already rendered on disk. This is what
  // guarantees a ready pack exists as fast as possible after a cold start.
  const cachedTimestamps = (await listCachedFrameTimestamps()).slice(-MAX_KEPT_PACKS);
  maintenanceSnapshot.scansDetected = cachedTimestamps.length;
  await buildPacksForTimestamps(cachedTimestamps, errors);
  maintenanceSnapshot.packsReady = (await listReadyScanPacks()).length;

  // Phase 2 — network: discover/render the latest 12 OPERA scans (MeteoGate + HDF5 + frame
  // renderer, all existing code), then publish packs for any new scan.
  try {
    const manifest = await prepareOperaFrames(TARGET_SCAN_COUNT);
    const readyTimestamps = manifest.frames
      .filter((item) => item.status === "ready")
      .map((item) => item.timestamp);
    maintenanceSnapshot.scansDetected = Math.max(maintenanceSnapshot.scansDetected, manifest.availableCount);
    await buildPacksForTimestamps(readyTimestamps, errors);
  } catch (error) {
    errors.push({ timestamp: "discovery", error: sanitizePackError(error) });
  }

  await pruneScanPacks();
  maintenanceSnapshot.packsReady = (await listReadyScanPacks()).length;
  maintenanceSnapshot.errors = errors.slice(0, 12);
}

export function getScanPackMaintenanceStatus(): ScanPackMaintenanceSnapshot {
  return { ...maintenanceSnapshot, building: [...maintenanceSnapshot.building], errors: [...maintenanceSnapshot.errors] };
}

// Server-only entry point. Detects available scans, builds missing packs (max 2 Python processes),
// keeps the freshest MAX_KEPT_PACKS packs, and never depends on any browser request to make
// progress once triggered. Returns immediately with a status snapshot; the work continues in
// the background. In production this must be driven by a permanent worker/cron.
export function ensureRadarScanPacks(): ScanPackMaintenanceSnapshot {
  if (!maintenanceTask) {
    maintenanceSnapshot = {
      ...maintenanceSnapshot,
      running: true,
      startedAt: nowIso(),
      finishedAt: null,
      errors: [],
    };
    maintenanceTask = runScanPackMaintenance()
      .catch((error) => {
        maintenanceSnapshot.errors = [
          ...maintenanceSnapshot.errors,
          { timestamp: "maintenance", error: sanitizePackError(error) },
        ];
      })
      .finally(() => {
        maintenanceSnapshot.running = false;
        maintenanceSnapshot.finishedAt = nowIso();
        maintenanceTask = null;
      });
  }

  return getScanPackMaintenanceStatus();
}
