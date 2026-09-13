import "server-only";
import {
  mergeRadarSourceFrames as mergeSourceFrames,
  radarSourceStyle,
  type RadarPackSourceFrame,
} from "@/lib/radar-source-selection";
import { prepareRadarComposite, removeRadarComposite } from "@/lib/server/radar-composite";
import { prepareRadarLayers } from "@/lib/server/radar-layers";
import type { RadarDataProvider } from "@/lib/types";

import { copyFile, link, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "fs/promises";
import path from "path";
import type { RadarMaintenanceState, RadarMaintenancePhase } from "@/lib/radar-health";
import {
  listCachedMeteoFranceFrames,
  prepareMeteoFranceRadarFrames,
  type MeteoFrancePreparedFrame,
} from "@/lib/server/meteofrance-radar-ingest";
import { logRadarEvent } from "@/lib/server/radar-observability";
import { readRadarMaintenanceState, writeRadarMaintenanceState } from "@/lib/server/radar-health-store";
import {
  getCachedRenderedOperaFrame,
  normalizeOperaTimestamp,
  operaCacheKey,
  operaCachedTileImagePath,
  operaOverviewTileJobsForBounds,
  prepareOperaFrames,
  runOperaOverviewTileBatch,
  TILE_RENDER_VERSION,
  type OperaOverviewTileJob,
  type OperaRenderedFrame,
  type OperaTilePrewarmResult,
} from "@/lib/server/opera-render";
import { RADAR_CACHE_ROOT, readBoundedPositiveIntEnv } from "@/lib/server/radar-config";

// Scan packs: pre-published, fully static radar tile sets. A pack becomes "ready" only once
// every required overview tile (z3..z6 over the source extent) exists on disk, so Atlas
// can always paint the radar instantly from static files — no Python, no MeteoGate on any GET.
//
// PRODUCTION NOTE: ensureRadarScanPacks() must run in a permanent worker/cron (every 1-2 min).
// Locally it runs at server startup (instrumentation.ts) and via POST /api/radar/opera/packs/maintenance.

const FRAMES_DIR = path.join(RADAR_CACHE_ROOT, "frames");
export const PACKS_VERSION = "v5";
const PACKS_ROOT = path.join(RADAR_CACHE_ROOT, "packs", PACKS_VERSION);
const BUILDING_DIR_NAME = ".building";
const BUILDING_ROOT = path.join(PACKS_ROOT, BUILDING_DIR_NAME);

export const PACK_STYLE = TILE_RENDER_VERSION;
export const PACK_OVERVIEW_ZOOM_MIN = 3;
export const PACK_OVERVIEW_ZOOM_MAX = 6;
export const PACK_DETAIL_ZOOM_MIN = 8;
export const PACK_DETAIL_ZOOM_MAX = 11;
export const PACK_TILE_SIZE = 256;

const TARGET_SCAN_COUNT = 12;
const MAX_KEPT_PACKS = readBoundedPositiveIntEnv("WEYRA_RADAR_MAX_PACKS", 16, 96);
const MAX_CONCURRENT_PACK_BUILDS = readBoundedPositiveIntEnv("WEYRA_RADAR_MAX_CONCURRENT_PACK_BUILDS", 2, 4);
const STALE_BUILD_DIR_MS = 60 * 60_000;

export type ScanPackCoverage = { west: number; south: number; east: number; north: number };
export type RadarPackProvider = RadarDataProvider;

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
  provider: RadarPackProvider;
  attribution: string;
  sourceProduct: string;
  sourceFormat: string;
  nativeResolutionMeters: number | null;
  displayFilter: string | null;
  rainProbabilityThreshold: number | null;
  packBytes?: number;
  buildDurationMs?: number;
  error?: string;
};

export type ScanPackMaintenanceSnapshot = RadarMaintenanceState;

type OperaPackRuntimeState = {
  buildInFlight: Map<string, Promise<ScanPackManifest>>;
  maintenanceTask: Promise<void> | null;
  maintenanceSnapshot: ScanPackMaintenanceSnapshot;
};

const globalForOperaPacks = globalThis as typeof globalThis & {
  __weyraOperaPackRuntime?: OperaPackRuntimeState;
};
const runtimeState = (globalForOperaPacks.__weyraOperaPackRuntime ??= {
  buildInFlight: new Map<string, Promise<ScanPackManifest>>(),
  maintenanceTask: null,
  maintenanceSnapshot: {
    schemaVersion: 1,
    running: false,
    phase: "idle",
    startedAt: null,
    finishedAt: null,
    updatedAt: new Date().toISOString(),
    cycleDurationMs: null,
    scansDetected: 0,
    packsReady: 0,
    building: [],
    errors: [],
    note: "En production, ce mécanisme doit tourner dans un worker/cron permanent.",
    latestSourceTimestamp: null,
    newestPackTimestamp: null,
    latestPackPublishedAt: null,
    lastPackBuildDurationMs: null,
    lastSuccessfulPackAt: null,
  },
});
const buildInFlight = runtimeState.buildInFlight;

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

async function persistMaintenanceSnapshot(phase?: RadarMaintenancePhase) {
  if (phase) runtimeState.maintenanceSnapshot.phase = phase;
  runtimeState.maintenanceSnapshot.updatedAt = nowIso();
  try {
    await writeRadarMaintenanceState(getScanPackMaintenanceStatus());
  } catch (error) {
    logRadarEvent("warn", "maintenance_status_write_failed", {
      error: sanitizePackError(error),
    });
  }
}

async function hydrateMaintenanceHistory() {
  const persisted = await readRadarMaintenanceState();
  if (!persisted) return;

  const snapshot = runtimeState.maintenanceSnapshot;
  snapshot.scansDetected = Math.max(snapshot.scansDetected, persisted.scansDetected);
  snapshot.packsReady = Math.max(snapshot.packsReady, persisted.packsReady);
  snapshot.latestSourceTimestamp ??= persisted.latestSourceTimestamp;
  snapshot.newestPackTimestamp ??= persisted.newestPackTimestamp;
  snapshot.latestPackPublishedAt ??= persisted.latestPackPublishedAt;
  snapshot.lastPackBuildDurationMs ??= persisted.lastPackBuildDurationMs;
  snapshot.lastSuccessfulPackAt ??= persisted.lastSuccessfulPackAt;
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
// (packs/<version>/<timestamp>/detail/<z>/<x>/<y>.webp), so the pack directory carries the full radar
// payload of its scan and detail GETs are plain static reads. Hardlink when the filesystem
// allows it, plain copy otherwise. Best-effort: a mirror failure never fails the prewarm.
export async function mirrorPrewarmedDetailTilesIntoPacks(result: OperaTilePrewarmResult): Promise<void> {
  for (const item of result.timestamps ?? []) {
    const normalized = normalizeOperaTimestamp(item.timestamp);
    if (!normalized) continue;

    const manifest = await readManifestFile(packManifestPath(normalized));
    if (manifest?.status !== "ready" || manifest.style !== result.style) continue;

    for (const tile of item.readyTiles ?? []) {
      if (tile.z < PACK_DETAIL_ZOOM_MIN || tile.z > PACK_DETAIL_ZOOM_MAX) continue;
      const target = packDetailTilePath(normalized, tile.z, tile.x, tile.y);
      const alreadyMirrored = await stat(target)
        .then(() => true)
        .catch(() => false);
      if (alreadyMirrored) continue;

      const source = operaCachedTileImagePath(normalized, tile.z, tile.x, tile.y, manifest.style);
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
    const manifests = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && entry.name !== BUILDING_DIR_NAME)
        .map((entry) => readManifestFile(path.join(PACKS_ROOT, entry.name, "manifest.json"))),
    );

    return manifests
      .filter((manifest): manifest is ScanPackManifest => manifest !== null)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  } catch {
    return [];
  }
}

export async function listReadyScanPacks(): Promise<ScanPackManifest[]> {
  const packs = await listScanPacks();
  return packs.filter(
    (pack) =>
      pack.status === "ready" &&
      pack.style === radarSourceStyle(pack.provider) &&
      pack.packVersion === PACKS_VERSION &&
      pack.baseTileCount > 0 &&
      pack.coverage,
  );
}

function nativeOperaResolutionMeters(frame: OperaRenderedFrame) {
  const pixelSize = frame.metadata.sourceGridPixelSize;
  if (!pixelSize) return null;
  const candidates = [Math.abs(pixelSize.x), Math.abs(pixelSize.y)].filter(Number.isFinite);
  return candidates.length ? Math.max(...candidates) : null;
}

function operaFrameToPackSource(frame: OperaRenderedFrame): RadarPackSourceFrame | null {
  const coverage = frame.metadata.geographicBounds ?? frame.metadata.bbox;
  const sourceGridPath = frame.metadata.sourceGridPath;
  if (!coverage || !sourceGridPath || frame.metadata.tileReady === false) return null;
  return {
    timestamp: frame.timestamp,
    provider: "EUMETNET OPERA",
    attribution: "Source : EUMETNET OPERA",
    sourceProduct: "DBZH composite Europe",
    sourceFormat: "ODIM HDF5",
    nativeResolutionMeters: nativeOperaResolutionMeters(frame),
    displayFilter: null,
    rainProbabilityThreshold: null,
    sourceGridPath,
    coverage,
  };
}

function meteoFranceFrameToPackSource(frame: MeteoFrancePreparedFrame): RadarPackSourceFrame {
  return {
    timestamp: frame.timestamp,
    provider: "Météo-France",
    attribution: frame.attribution,
    sourceProduct: frame.metadata.product,
    sourceFormat: frame.metadata.format,
    nativeResolutionMeters: frame.metadata.nativeResolutionMeters,
    displayFilter: frame.metadata.displayFilter,
    rainProbabilityThreshold: frame.metadata.rainProbabilityDisplayThreshold,
    sourceGridPath: frame.sourceGridPath,
    coverage: frame.coverage,
  };
}

async function getCachedOperaSourceFrame(timestamp: string): Promise<RadarPackSourceFrame | null> {
  const frame = await getCachedRenderedOperaFrame(timestamp);
  return frame ? operaFrameToPackSource(frame) : null;
}

// Scans OPERA already rendered on disk, without touching MeteoGate. Météo-France uses its own
// frame root and is merged below with priority on identical timestamps.
async function listCachedOperaSourceFrames(): Promise<RadarPackSourceFrame[]> {
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

    const frames = await Promise.all(timestamps.map(getCachedOperaSourceFrame));
    return frames
      .filter((frame): frame is RadarPackSourceFrame => frame !== null)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  } catch {
    return [];
  }
}

async function countExistingTiles(root: string, jobs: OperaOverviewTileJob[], style: string, key: string) {
  let count = 0;
  let bytes = 0;
  const missing: OperaOverviewTileJob[] = [];

  for (let index = 0; index < jobs.length; index += 64) {
    const batch = jobs.slice(index, index + 64);
    const results = await Promise.all(
      batch.map(async (job) => {
        const tilePath = path.join(root, "tiles", style, key, String(job.z), String(job.x), `${job.y}.webp`);
        try {
          return { job, stats: await stat(tilePath) };
        } catch {
          return { job, stats: null };
        }
      }),
    );
    for (const result of results) {
      if (result.stats) {
        count += 1;
        bytes += result.stats.size;
      } else {
        missing.push(result.job);
      }
    }
  }

  return { count, bytes, missing };
}

async function buildScanPack(sourceFrame: RadarPackSourceFrame): Promise<ScanPackManifest> {
  const normalized = normalizeOperaTimestamp(sourceFrame.timestamp);
  if (!normalized) throw new Error(`Invalid radar timestamp: ${sourceFrame.timestamp}`);

  const lockKey = `${normalized}:${sourceFrame.provider}`;
  const existing = buildInFlight.get(lockKey);
  if (existing) return existing;

  const pending = buildScanPackInternal({ ...sourceFrame, timestamp: normalized }).finally(() => {
    buildInFlight.delete(lockKey);
  });
  buildInFlight.set(lockKey, pending);
  return pending;
}

async function buildScanPackInternal(sourceFrame: RadarPackSourceFrame): Promise<ScanPackManifest> {
  const startedAt = Date.now();
  const timestamp = sourceFrame.timestamp;
  const style = radarSourceStyle(sourceFrame.provider);
  const key = operaCacheKey(timestamp);

  const published = await readManifestFile(packManifestPath(timestamp));
  if (
    published?.status === "ready" &&
    published.style === style &&
    published.packVersion === PACKS_VERSION &&
    published.provider === sourceFrame.provider &&
    published.baseTileCount > 0
  ) {
    return published;
  }

  const composite = sourceFrame.fallback ? await prepareRadarComposite(sourceFrame) : null;
  const coverage = composite?.bounds ?? sourceFrame.coverage;
  const sourceGridPath = composite?.sourceGridPath ?? sourceFrame.sourceGridPath;
  const sourceGridExists = await stat(sourceGridPath)
    .then(() => true)
    .catch(() => false);
  if (!sourceGridExists) throw new Error(`Rendered radar source grid is missing: ${sourceGridPath}`);

  const jobs = operaOverviewTileJobsForBounds(coverage, PACK_OVERVIEW_ZOOM_MIN, PACK_OVERVIEW_ZOOM_MAX);
  if (!jobs.length) throw new Error("Rendered radar coverage produced no overview tile jobs.");

  const buildRoot = path.join(BUILDING_ROOT, `${key}-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  try {
    await mkdir(buildRoot, { recursive: true });
    await runOperaOverviewTileBatch({
      sourceGridPath,
      jobs,
      timestamp,
      outputRoot: buildRoot,
      style,
    });

    // A pack may only be published once every required overview tile really exists.
    const { count, bytes, missing } = await countExistingTiles(buildRoot, jobs, style, key);
    if (missing.length > 0) {
      throw new Error(`Overview batch left ${missing.length}/${jobs.length} tiles missing.`);
    }

    const stagedPackDir = path.join(buildRoot, "pack");
    await mkdir(path.join(stagedPackDir, "detail"), { recursive: true });
    await rename(path.join(buildRoot, "tiles", style, key), path.join(stagedPackDir, "overview"));

    const manifest: ScanPackManifest = {
      timestamp,
      status: "ready",
      publishedAt: nowIso(),
      style,
      packVersion: PACKS_VERSION,
      tileSize: PACK_TILE_SIZE,
      baseZoomMin: PACK_OVERVIEW_ZOOM_MIN,
      baseZoomMax: PACK_OVERVIEW_ZOOM_MAX,
      detailZoomMin: PACK_DETAIL_ZOOM_MIN,
      detailZoomMax: PACK_DETAIL_ZOOM_MAX,
      baseTileCount: count,
      detailTileCount: 0,
      coverage,
      provider: sourceFrame.provider,
      attribution: sourceFrame.attribution,
      sourceProduct: sourceFrame.sourceProduct,
      sourceFormat: sourceFrame.sourceFormat,
      nativeResolutionMeters: sourceFrame.nativeResolutionMeters,
      displayFilter: sourceFrame.displayFilter,
      rainProbabilityThreshold: sourceFrame.rainProbabilityThreshold,
      packBytes: bytes,
      buildDurationMs: Date.now() - startedAt,
    };
    await writeFile(path.join(stagedPackDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");

    // Atomic publish: the fully validated pack directory is renamed into place, so Atlas can
    // never observe a partially generated pack behind a "ready" manifest.
    const finalDir = packDir(timestamp);
    await rm(finalDir, { recursive: true, force: true }).catch(() => undefined);
    await rename(stagedPackDir, finalDir);

    const buildDurationMs = Date.now() - startedAt;
    runtimeState.maintenanceSnapshot.lastPackBuildDurationMs = buildDurationMs;
    runtimeState.maintenanceSnapshot.lastSuccessfulPackAt = nowIso();
    if (
      !runtimeState.maintenanceSnapshot.newestPackTimestamp ||
      new Date(timestamp).getTime() >= new Date(runtimeState.maintenanceSnapshot.newestPackTimestamp).getTime()
    ) {
      runtimeState.maintenanceSnapshot.newestPackTimestamp = timestamp;
      runtimeState.maintenanceSnapshot.latestPackPublishedAt = manifest.publishedAt;
    }
    await persistMaintenanceSnapshot();
    logRadarEvent("info", "pack_published", {
      timestamp,
      provider: sourceFrame.provider,
      tiles: count,
      bytes,
      durationMs: buildDurationMs,
    });
    return manifest;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Self-heal: a truncated/corrupt source-grid.tif (e.g. a frame interrupted mid-write) can
    // never produce a pack. Quarantining the frame lets the next maintenance pass re-download
    // and re-render it through the normal frame pipeline.
    if (
      sourceFrame.provider === "EUMETNET OPERA" &&
      /read failed|not recognized as a supported file format|corrupt/i.test(message)
    ) {
      await rm(path.join(FRAMES_DIR, key), { recursive: true, force: true }).catch(() => undefined);
      logRadarEvent("warn", "corrupt_frame_quarantined", { timestamp });
    }
    logRadarEvent("error", "pack_build_failed", {
      timestamp,
      provider: sourceFrame.provider,
      error: sanitizePackError(error),
    });
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
      await removeRadarComposite(pack.timestamp).catch(() => undefined);
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

async function buildPacksForFrames(
  frames: RadarPackSourceFrame[],
  errors: Array<{ timestamp: string; error: string }>,
) {
  // Newest scans first: the frame Atlas shows immediately is always the first one repaired.
  const queue = [...frames].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  let cursor = 0;

  async function processFrame(frame: RadarPackSourceFrame) {
    const timestamp = frame.timestamp;
    runtimeState.maintenanceSnapshot.building = [...new Set([...runtimeState.maintenanceSnapshot.building, timestamp])];
    await persistMaintenanceSnapshot();
    try {
      await buildScanPack(frame);
    } catch (error) {
      errors.push({ timestamp, error: sanitizePackError(error) });
      // Keep a usable European scan if composing the national source fails.
      if (frame.fallback) {
        await buildScanPack(frame.fallback).catch((fallbackError) => {
          errors.push({ timestamp, error: sanitizePackError(fallbackError) });
        });
      }
    } finally {
      runtimeState.maintenanceSnapshot.building = runtimeState.maintenanceSnapshot.building.filter(
        (item) => item !== timestamp,
      );
      await persistMaintenanceSnapshot();
    }
  }

  // Give the live frame the renderer exclusively. Once it is published Atlas has something
  // useful to show; older scans can then backfill concurrently without delaying first paint.
  const newest = queue[cursor];
  if (newest) {
    cursor += 1;
    await processFrame(newest);
  }

  async function worker() {
    while (cursor < queue.length) {
      const frame = queue[cursor];
      cursor += 1;
      if (!frame) continue;

      await processFrame(frame);
    }
  }

  const workers = Array.from({ length: Math.min(MAX_CONCURRENT_PACK_BUILDS, queue.length) }, () => worker());
  await Promise.all(workers);
}

async function runScanPackMaintenance() {
  const cycleStartedAt = Date.now();
  const errors: Array<{ timestamp: string; error: string }> = [];
  await hydrateMaintenanceHistory();

  // Make the newest cached frame available immediately, even if both upstream APIs are down.
  // National observations and European coverage are combined at identical timestamps.
  const cachedMeteoFranceFrames = (await listCachedMeteoFranceFrames()).map(meteoFranceFrameToPackSource);
  const cachedOperaFrames = await listCachedOperaSourceFrames();
  const cachedFrames = mergeSourceFrames(cachedOperaFrames, cachedMeteoFranceFrames).slice(-MAX_KEPT_PACKS);
  runtimeState.maintenanceSnapshot.scansDetected = cachedFrames.length;
  await persistMaintenanceSnapshot("cached-live");
  await buildPacksForFrames(cachedFrames.slice(-1), errors);
  runtimeState.maintenanceSnapshot.packsReady = (await listReadyScanPacks()).length;

  // France is sourced from the official Météo-France 1 km / 5 min reflectivity mosaic.
  // OPERA remains active for European coverage, history backfill and upstream fallback.
  let refreshedMeteoFranceFrames: RadarPackSourceFrame[] = cachedMeteoFranceFrames;
  await persistMaintenanceSnapshot("discovering");
  const meteoFrance = await prepareMeteoFranceRadarFrames();
  refreshedMeteoFranceFrames = meteoFrance.frames.map(meteoFranceFrameToPackSource);
  if (meteoFrance.latestTimestamp) {
    runtimeState.maintenanceSnapshot.latestSourceTimestamp = meteoFrance.latestTimestamp;
  }
  if (!meteoFrance.ok && meteoFrance.error) {
    errors.push({ timestamp: "meteofrance", error: sanitizePackError(meteoFrance.error) });
  }
  await persistMaintenanceSnapshot("publishing-live");
  await buildPacksForFrames(mergeSourceFrames(cachedOperaFrames, refreshedMeteoFranceFrames).slice(-1), errors);

  let readyOperaTimestamps: string[] = [];
  await persistMaintenanceSnapshot("discovering");
  try {
    const manifest = await prepareOperaFrames(TARGET_SCAN_COUNT, {
      onDiscovered: async ({ availableCount, latestTimestamp }) => {
        runtimeState.maintenanceSnapshot.scansDetected = Math.max(
          runtimeState.maintenanceSnapshot.scansDetected,
          availableCount,
        );
        if (
          latestTimestamp &&
          (!runtimeState.maintenanceSnapshot.latestSourceTimestamp ||
            new Date(latestTimestamp).getTime() >
              new Date(runtimeState.maintenanceSnapshot.latestSourceTimestamp).getTime())
        ) {
          runtimeState.maintenanceSnapshot.latestSourceTimestamp = latestTimestamp;
        }
        await persistMaintenanceSnapshot("rendering-history");
      },
      onLatestReady: async (timestamp) => {
        if (
          !runtimeState.maintenanceSnapshot.latestSourceTimestamp ||
          new Date(timestamp).getTime() > new Date(runtimeState.maintenanceSnapshot.latestSourceTimestamp).getTime()
        ) {
          runtimeState.maintenanceSnapshot.latestSourceTimestamp = timestamp;
        }
        await persistMaintenanceSnapshot("publishing-live");
        const meteoFranceFrame = refreshedMeteoFranceFrames.find((frame) => frame.timestamp === timestamp);
        const operaFrame = await getCachedOperaSourceFrame(timestamp);
        await buildPacksForFrames(
          mergeSourceFrames(
            [meteoFranceFrame, operaFrame].filter((frame): frame is RadarPackSourceFrame => Boolean(frame)),
          ),
          errors,
        );
        await persistMaintenanceSnapshot("rendering-history");
      },
    });
    readyOperaTimestamps = manifest.frames.filter((item) => item.status === "ready").map((item) => item.timestamp);
    runtimeState.maintenanceSnapshot.scansDetected = Math.max(
      runtimeState.maintenanceSnapshot.scansDetected,
      manifest.availableCount,
    );
    errors.push(
      ...manifest.errors.map((item) => ({
        timestamp: item.timestamp,
        error: sanitizePackError(item.error),
      })),
    );
    if (!manifest.ok && manifest.error) {
      errors.push({ timestamp: "discovery", error: sanitizePackError(manifest.error) });
    }
  } catch (error) {
    errors.push({ timestamp: "discovery", error: sanitizePackError(error) });
  }

  await persistMaintenanceSnapshot("publishing-history");
  const readyOperaFrames = (await Promise.all(readyOperaTimestamps.map(getCachedOperaSourceFrame))).filter(
    (frame): frame is RadarPackSourceFrame => frame !== null,
  );
  const allFrames = mergeSourceFrames(cachedOperaFrames, readyOperaFrames, refreshedMeteoFranceFrames).slice(
    -MAX_KEPT_PACKS,
  );
  runtimeState.maintenanceSnapshot.scansDetected = allFrames.length;
  await buildPacksForFrames(allFrames, errors);

  try {
    const layers = await prepareRadarLayers();
    logRadarEvent(layers.errors.length ? "warn" : "info", "radar_layers_prepared", {
      errors: layers.errors,
      packCount: Object.values(layers.packs).reduce((sum, count) => sum + count, 0),
    });
  } catch {
    logRadarEvent("warn", "radar_layers_failed", {
      note: "Optional layer preparation failed; live radar remains available.",
    });
  }

  await persistMaintenanceSnapshot("pruning");
  await pruneScanPacks();
  const packs = await listReadyScanPacks();
  const newestPack = packs.at(-1) ?? null;
  runtimeState.maintenanceSnapshot.packsReady = packs.length;
  runtimeState.maintenanceSnapshot.newestPackTimestamp = newestPack?.timestamp ?? null;
  runtimeState.maintenanceSnapshot.latestPackPublishedAt = newestPack?.publishedAt ?? null;
  runtimeState.maintenanceSnapshot.errors = errors.slice(0, 12);
  runtimeState.maintenanceSnapshot.cycleDurationMs = Date.now() - cycleStartedAt;
  await persistMaintenanceSnapshot("idle");
}

export function getScanPackMaintenanceStatus(): ScanPackMaintenanceSnapshot {
  const snapshot = runtimeState.maintenanceSnapshot;
  return { ...snapshot, building: [...snapshot.building], errors: [...snapshot.errors] };
}

export async function getPersistedScanPackMaintenanceStatus(): Promise<ScanPackMaintenanceSnapshot> {
  return (await readRadarMaintenanceState()) ?? getScanPackMaintenanceStatus();
}

// Server-only entry point. Detects available scans and builds missing packs with bounded Python
// concurrency (configured separately for web and worker processes),
// keeps the freshest MAX_KEPT_PACKS packs, and never depends on any browser request to make
// progress once triggered. Returns immediately with a status snapshot; the work continues in
// the background. In production this must be driven by a permanent worker/cron.
export function ensureRadarScanPacks(): ScanPackMaintenanceSnapshot {
  if (!runtimeState.maintenanceTask) {
    runtimeState.maintenanceSnapshot = {
      ...runtimeState.maintenanceSnapshot,
      running: true,
      phase: "cached-live",
      startedAt: nowIso(),
      finishedAt: null,
      updatedAt: nowIso(),
      cycleDurationMs: null,
      errors: [],
    };
    runtimeState.maintenanceTask = runScanPackMaintenance()
      .catch((error) => {
        runtimeState.maintenanceSnapshot.phase = "failed";
        runtimeState.maintenanceSnapshot.errors = [
          ...runtimeState.maintenanceSnapshot.errors,
          { timestamp: "maintenance", error: sanitizePackError(error) },
        ];
        logRadarEvent("error", "maintenance_cycle_failed", {
          error: sanitizePackError(error),
        });
      })
      .finally(() => {
        runtimeState.maintenanceSnapshot.running = false;
        runtimeState.maintenanceSnapshot.finishedAt = nowIso();
        runtimeState.maintenanceSnapshot.cycleDurationMs = runtimeState.maintenanceSnapshot.startedAt
          ? Date.now() - new Date(runtimeState.maintenanceSnapshot.startedAt).getTime()
          : runtimeState.maintenanceSnapshot.cycleDurationMs;
        runtimeState.maintenanceTask = null;
        void persistMaintenanceSnapshot(runtimeState.maintenanceSnapshot.phase === "failed" ? "failed" : "idle");
      });
  }

  return getScanPackMaintenanceStatus();
}
