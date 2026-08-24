import "server-only";

import { spawn } from "child_process";
import { createHash } from "crypto";
import { existsSync } from "fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "fs/promises";
import { homedir, setPriority, constants as osConstants } from "os";
import path from "path";
import {
  getLatestOperaComposite,
  getRecentOperaComposites,
  type MeteoGateDataLink,
  type RecentOperaComposite,
} from "@/lib/server/meteogate";
import { RADAR_CACHE_ROOT, readBoundedPositiveIntEnv } from "@/lib/server/radar-config";

const RENDER_TIMEOUT_MS = 120_000;
const DOWNLOAD_TIMEOUT_MS = 90_000;
const CACHE_DIR = path.join(RADAR_CACHE_ROOT, "frames");
const TILE_DIR = path.join(RADAR_CACHE_ROOT, "tiles");
const TILE_META_DIR = path.join(RADAR_CACHE_ROOT, "tile-meta");
const TILE_JOB_DIR = path.join(RADAR_CACHE_ROOT, "tile-jobs");
const QA_DIR = path.join(RADAR_CACHE_ROOT, "qa");
const METEOGATE_HOST = "api.meteogate.eu";
export const TILE_RENDER_VERSION = "v5";
const SUPPORTED_TILE_RENDER_VERSIONS = ["v1", "v2", "v3", "v3b", "v3c", "v4a", "v5"] as const;
const MAX_CACHED_FRAMES = 18;
const MAX_CONCURRENT_RENDERS = readBoundedPositiveIntEnv("WEYRA_RADAR_MAX_CONCURRENT_RENDERS", 2, 4);
const MAX_CONCURRENT_TILE_RENDERS = readBoundedPositiveIntEnv("WEYRA_RADAR_MAX_CONCURRENT_TILE_RENDERS", 2, 4);
const BATCH_RENDER_TIMEOUT_MS = 9 * 60_000;
const MIN_TILE_ZOOM = 3;
const MAX_TILE_ZOOM = 11;
const MAX_PREWARM_TILES_PER_TIMESTAMP = 160;
const MAX_PREWARM_TIMESTAMPS = 2;
const MAX_TILE_CACHE_BYTES = 300 * 1024 * 1024;

export type RenderMetadata = {
  source: "EUMETNET OPERA";
  timestamp: string | null;
  quantity: string;
  gain: number;
  offset: number;
  nodata: number | null;
  undetect: number | null;
  width: number;
  height: number;
  projection: string | null;
  projectionBounds?: { minX: number; minY: number; maxX: number; maxY: number } | null;
  mapLibreCoordinates?: [[number, number], [number, number], [number, number], [number, number]] | null;
  geographicBounds?: { west: number; south: number; east: number; north: number } | null;
  bbox?: { west: number; south: number; east: number; north: number } | null;
  hasGeoreferencing: boolean;
  renderedAt: string;
  warning: string | null;
  hdf5DataPath?: string;
  status?: "ready" | "failed";
  imageByteLength?: number;
  error?: string;
  palette?: string | null;
  sourceGridPath?: string | null;
  sourceGridCrs?: string | null;
  sourceGridTransform?: number[] | null;
  sourceGridWidth?: number | null;
  sourceGridHeight?: number | null;
  sourceGridNodata?: number | null;
  sourceGridPixelSize?: { x: number; y: number } | null;
  tileReady?: boolean;
};

export type OperaDbzhDiagnostic = {
  event: "opera_dbzh_diagnostic";
  hdf5DataPath: string;
  datasetShape: number[];
  rawShape: number[];
  rawDtype: string;
  rawRange: { min: number | null; max: number | null };
  rawPercentiles: Record<string, number | null>;
  gain: number;
  offset: number;
  nodata: number | null;
  undetect: number | null;
  totalPixels: number;
  nodataPixelCount: number;
  undetectPixelCount: number;
  transparentPixelCount: number;
  visiblePrecipitationPixelCount: number;
  invalidColoredPixelCount: number;
  dbzhRange: { min: number | null; max: number | null };
  dbzhPercentiles: Record<string, number | null>;
  projection: string | null;
  projectionBounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
  geographicBounds: { west: number; south: number; east: number; north: number } | null;
  mapLibreCoordinates: [[number, number], [number, number], [number, number], [number, number]] | null;
  mapLibreCorners: {
    topLeft: [number, number];
    topRight: [number, number];
    bottomRight: [number, number];
    bottomLeft: [number, number];
  } | null;
  checks: {
    nodataExcludedBeforePalette: boolean;
    undetectExcludedBeforePalette: boolean;
    nonFiniteExcludedBeforePalette: boolean;
    pixelsWithoutEchoTransparent: boolean;
    noInvalidPixelColored: boolean;
    dbzhRangeLooksMeteorological: boolean;
    transparentPixelsMatchInvalidMask: boolean;
  };
  diagnostic: {
    dbzhDecodingLooksCorrect: boolean;
    transparencyLooksCorrect: boolean;
    paletteLikelyPrimaryIssue: boolean;
    smoothingLikelyIssue: boolean;
    fourCornerLaeaWarpLikelyIssue: boolean;
    mixedCauseLikely: boolean;
    summary: string;
  };
  warning: string | null;
  palette: string;
};

export type OperaQaReport = {
  ok: true;
  provider: "EUMETNET OPERA";
  product: "DBZH";
  timestamp: string;
  generatedAt: string;
  nativeGridImageUrl: string;
  currentMapOverlayImageUrl: string;
  atlasRuntimeImageUrl: string;
  metadataUrl: string;
  width: number;
  height: number;
  imageByteLength: number;
  diagnostic: OperaDbzhDiagnostic;
  metadata: RenderMetadata;
};

export type OperaTileMeta = {
  ok: true;
  timestamp: string;
  z: number;
  x: number;
  y: number;
  tileBounds3857: { left: number; bottom: number; right: number; top: number };
  tileBounds4326: { west: number; south: number; east: number; north: number };
  sourceCrs?: string | null;
  targetCrs?: "EPSG:3857";
  targetProjection?: "EPSG:3857";
  resampling: string;
  resamplingDBZH?: string;
  resamplingAlpha?: string;
  displayVersion?: string;
  displayConfig?: {
    thresholdDbzh?: number;
    alphaRampDbzh?: number[];
    stops?: number[][];
  };
  thresholdDbzh?: number;
  gutterPixels?: number;
  strongEchoPreservationUsed?: boolean;
  sourceGridWidth?: number | null;
  sourceGridHeight?: number | null;
  sourceGridPixelSize?: { x: number; y: number } | null;
  sourceValidPixels?: number;
  validPixels: number;
  transparentPixels: number;
  generatedAt: string;
  cached?: boolean;
};

export type OperaTileResult = {
  imagePath: string;
  metadataPath: string;
  meta: OperaTileMeta;
  cached: boolean;
};

export type OperaTilePrewarmViewport = {
  west: number;
  south: number;
  east: number;
  north: number;
  zoom: number;
};

export type OperaTilePrewarmTimestampResult = {
  timestamp: string;
  requested: number;
  cacheHits: number;
  generated: number;
  failed: number;
  durationMs: number;
  tileUrls: string[];
  readyTiles: Array<{ z: number; x: number; y: number }>;
};

export type OperaTilePrewarmResult = {
  ok: boolean;
  style: OperaTileRenderVersion;
  timestamps: OperaTilePrewarmTimestampResult[];
  error?: string;
};

export type OperaRenderedFrame = {
  timestamp: string;
  imagePath: string;
  metadataPath: string;
  metadata: RenderMetadata;
  status: "ready";
  renderedAt: string;
  imageByteLength: number;
};

type PythonRunResult = {
  stdout: string;
  stderr: string;
};

export type OperaTileRenderVersion = typeof SUPPORTED_TILE_RENDER_VERSIONS[number];

export type RenderedOperaPublicMeta = {
  ok: true;
  provider: "EUMETNET OPERA";
  product: "DBZH";
  timestamp: string;
  imageUrl: string;
  mapLibreCoordinates: [[number, number], [number, number], [number, number], [number, number]] | null;
  geographicBounds: { west: number; south: number; east: number; north: number } | null;
  projectionBounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
  projection: string | null;
  width: number;
  height: number;
  imageByteLength: number | null;
  hasGeoreferencing: boolean;
  warning: string | null;
  metadata: RenderMetadata;
};

export type OperaFrameStatus = "ready" | "missing" | "failed";

export type OperaFrameManifestItem = {
  timestamp: string;
  status: OperaFrameStatus;
  imageUrl: string;
  metadataUrl: string;
  width: number | null;
  height: number | null;
  imageByteLength: number | null;
  hasGeoreferencing: boolean;
  error?: string;
};

export type OperaFrameManifest = {
  ok: boolean;
  provider: "EUMETNET OPERA";
  product: "DBZH";
  requestedCount: number;
  availableCount: number;
  readyCount: number;
  failedCount: number;
  missingCount: number;
  frames: OperaFrameManifestItem[];
  errors: Array<{ timestamp: string; error: string }>;
  durationMs?: number;
  error?: string | null;
};

const inFlight = new Map<string, Promise<OperaRenderedFrame>>();
const tileInFlight = new Map<string, Promise<OperaTileResult>>();
let activeRenderCount = 0;
let activeTileRenderCount = 0;
const renderQueue: Array<() => void> = [];
const tileRenderQueue: Array<() => void> = [];

function cacheKey(timestamp: string) {
  return timestamp.replace(/[^0-9A-Za-z_-]/g, "");
}

function frameCacheDir(timestamp: string) {
  return path.join(CACHE_DIR, cacheKey(timestamp));
}

function imagePathForTimestamp(timestamp: string) {
  return path.join(frameCacheDir(timestamp), "radar.webp");
}

function metadataPathForTimestamp(timestamp: string) {
  return path.join(frameCacheDir(timestamp), "metadata.json");
}

function sourceGridPathForTimestamp(timestamp: string) {
  return path.join(frameCacheDir(timestamp), "source-grid.tif");
}

function tileCacheDir(version: OperaTileRenderVersion, timestamp: string, z: number, x: number) {
  return path.join(TILE_DIR, version, cacheKey(timestamp), String(z), String(x));
}

function tileMetaCacheDir(version: OperaTileRenderVersion, timestamp: string, z: number, x: number) {
  return path.join(TILE_META_DIR, version, cacheKey(timestamp), String(z), String(x));
}

function tileImagePath(version: OperaTileRenderVersion, timestamp: string, z: number, x: number, y: number) {
  return path.join(tileCacheDir(version, timestamp, z, x), `${y}.webp`);
}

function tileMetadataPath(version: OperaTileRenderVersion, timestamp: string, z: number, x: number, y: number) {
  return path.join(tileMetaCacheDir(version, timestamp, z, x), `${y}.json`);
}

function qaBasePathForTimestamp(timestamp: string) {
  return path.join(QA_DIR, cacheKey(timestamp));
}

function qaNativeImagePathForTimestamp(timestamp: string) {
  return `${qaBasePathForTimestamp(timestamp)}-native-grid.webp`;
}

function qaCurrentOverlayPathForTimestamp(timestamp: string) {
  return `${qaBasePathForTimestamp(timestamp)}-current-map-overlay.webp`;
}

function qaDiagnosticPathForTimestamp(timestamp: string) {
  return `${qaBasePathForTimestamp(timestamp)}-diagnostic.json`;
}

function qaMetadataPathForTimestamp(timestamp: string) {
  return `${qaBasePathForTimestamp(timestamp)}-metadata.json`;
}

function qaNativeImageUrl(timestamp: string) {
  return `/api/radar/opera/qa/image?kind=native&ts=${encodeURIComponent(timestamp)}`;
}

function qaCurrentOverlayImageUrl(timestamp: string) {
  return `/api/radar/opera/qa/image?kind=current&ts=${encodeURIComponent(timestamp)}`;
}

function safeHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function normalizeOperaTimestamp(value: string) {
  const decoded = decodeURIComponent(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(decoded)) return null;

  const date = new Date(decoded);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function frameImageUrl(timestamp: string) {
  return `/api/radar/opera/render/frame/${encodeURIComponent(timestamp)}`;
}

function frameMetadataUrl(timestamp: string) {
  return `/api/radar/opera/render/frame/${encodeURIComponent(timestamp)}/meta`;
}

function sanitizeError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  const apiKey = process.env.METEOGATE_API_KEY?.trim();
  let message = raw;

  if (apiKey) {
    message = message.split(apiKey).join("[redacted-api-key]");
  }

  return message
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/s3:\/\/\S+/gi, "[redacted-url]")
    .slice(0, 1200);
}

async function withRenderSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activeRenderCount >= MAX_CONCURRENT_RENDERS) {
    await new Promise<void>((resolve) => {
      renderQueue.push(resolve);
    });
  }

  activeRenderCount += 1;

  try {
    return await task();
  } finally {
    activeRenderCount -= 1;
    renderQueue.shift()?.();
  }
}

export class OperaTileError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = "OperaTileError";
    this.statusCode = statusCode;
  }
}

async function withTileRenderSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activeTileRenderCount >= MAX_CONCURRENT_TILE_RENDERS) {
    await new Promise<void>((resolve) => {
      tileRenderQueue.push(resolve);
    });
  }

  activeTileRenderCount += 1;

  try {
    return await task();
  } finally {
    activeTileRenderCount -= 1;
    tileRenderQueue.shift()?.();
  }
}

function assertApiKeyForMeteoGateUrl(url: URL) {
  if (url.hostname !== METEOGATE_HOST) return undefined;

  const apiKey = process.env.METEOGATE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("METEOGATE_API_KEY is missing from the server environment.");
  }

  return apiKey;
}

function timestampMinute(timestamp: string) {
  return timestamp.slice(0, 16).replace(/[-:]/g, "");
}

function linkMatchesTimestamp(link: MeteoGateDataLink, timestamp: string) {
  const minute = timestampMinute(timestamp);
  const hrefMinute = link.href.replace(/[-:]/g, "");
  const linkMinute = link.timestamp?.slice(0, 16).replace(/[-:]/g, "");
  return link.isLatest === true || linkMinute === minute || hrefMinute.includes(minute);
}

function selectLatestHdf5Link(links: MeteoGateDataLink[], timestamp: string) {
  return links.find((link) => link.fileType === "ODIM HDF5" && linkMatchesTimestamp(link, timestamp)) ?? null;
}

async function readCachedFrame(timestamp: string): Promise<OperaRenderedFrame | null> {
  const imagePath = imagePathForTimestamp(timestamp);
  const metadataPath = metadataPathForTimestamp(timestamp);

  try {
    const [imageStats] = await Promise.all([stat(imagePath), stat(metadataPath)]);
    const metadata = JSON.parse(await readFile(metadataPath, "utf-8")) as RenderMetadata;
    if (metadata.status === "failed") return null;
    if (!isCurrentMetadata(metadata)) return null;
    return {
      timestamp,
      imagePath,
      metadataPath,
      metadata,
      status: "ready",
      renderedAt: metadata.renderedAt,
      imageByteLength: metadata.imageByteLength ?? imageStats.size,
    };
  } catch {
    return null;
  }
}

async function readNewestCachedFrame(): Promise<OperaRenderedFrame | null> {
  try {
    const entries = await readdir(CACHE_DIR, { withFileTypes: true });
    const frameDirs = entries.filter((entry) => entry.isDirectory());
    const candidates = await Promise.all(frameDirs.map(async (entry) => {
      const metadataPath = path.join(CACHE_DIR, entry.name, "metadata.json");
      const stats = await stat(metadataPath);
      return { metadataPath, stats };
    }));

    candidates.sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs);

    for (const candidate of candidates) {
      try {
        const metadata = JSON.parse(await readFile(candidate.metadataPath, "utf-8")) as RenderMetadata;
        const timestamp = metadata.timestamp;
        if (!timestamp || !isCurrentMetadata(metadata)) continue;

        if (metadata.status === "failed") continue;
        const imagePath = imagePathForTimestamp(timestamp);
        const imageStats = await stat(imagePath);
        return {
          timestamp,
          imagePath,
          metadataPath: candidate.metadataPath,
          metadata,
          status: "ready",
          renderedAt: metadata.renderedAt,
          imageByteLength: metadata.imageByteLength ?? imageStats.size,
        };
      } catch {
        // Try the next cache entry.
      }
    }
  } catch {
    return null;
  }

  return null;
}

const CURRENT_PALETTE = "weyra-v2";

function isCurrentMetadata(metadata: RenderMetadata) {
  return Boolean(
    metadata.timestamp &&
    metadata.projectionBounds &&
    metadata.geographicBounds &&
    Array.isArray(metadata.mapLibreCoordinates) &&
    metadata.mapLibreCoordinates.length === 4 &&
    // Frames rendered with an older color palette are treated as stale and re-rendered.
    metadata.palette === CURRENT_PALETTE,
  );
}

async function downloadHdf5(link: MeteoGateDataLink, timestamp: string) {
  const url = new URL(link.href);
  const apiKey = assertApiKeyForMeteoGateUrl(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: apiKey ? { apikey: apiKey } : undefined,
    });

    if (!response.ok) {
      throw new Error(`Radar HDF5 download failed with HTTP ${response.status}.`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.toLowerCase().includes("json")) {
      throw new Error(`Radar HDF5 download returned JSON instead of binary data.`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 1024) {
      throw new Error("Radar HDF5 download was unexpectedly small.");
    }

    await mkdir(frameCacheDir(timestamp), { recursive: true });
    const hdf5Path = path.join(frameCacheDir(timestamp), `${safeHash(link.href)}.h5`);
    await writeFile(hdf5Path, buffer);
    return hdf5Path;
  } finally {
    clearTimeout(timeout);
  }
}

function pythonCandidates() {
  if (process.env.PYTHON_BIN?.trim()) {
    return [process.env.PYTHON_BIN.trim()];
  }

  const candidates = [
    path.join(homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe"),
    path.join(process.cwd(), ".venv", "Scripts", "python.exe"),
    path.join(process.cwd(), "venv", "Scripts", "python.exe"),
    "python3",
    "python",
    "py",
  ];

  return [...new Set(candidates)].filter((candidate) => (
    path.isAbsolute(candidate) ? existsSync(candidate) : true
  ));
}

function runPython(command: string, args: string[], timeoutMs = RENDER_TIMEOUT_MS) {
  return new Promise<PythonRunResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
      windowsHide: true,
    });

    // Background renders must never starve the interactive path: the Node server keeps serving
    // static tiles and the browser keeps animating while Python crunches at low priority.
    try {
      if (child.pid) setPriority(child.pid, osConstants.priority.PRIORITY_BELOW_NORMAL);
    } catch {
      // Priority tuning is best-effort; rendering works the same without it.
    }

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`Python renderer timed out after ${timeoutMs / 1000}s.`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > 80_000) stdout = stdout.slice(-80_000);
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 80_000) stderr = stderr.slice(-80_000);
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Python renderer exited with code ${code}. ${stderr || stdout}`.trim()));
      }
    });
  });
}

async function runRenderer(
  hdf5Path: string,
  outputPath: string,
  metadataPath: string,
  options: { diagnosticPath?: string; nativeOutputPath?: string; sourceGridPath?: string } = {},
) {
  const scriptPath = path.join(process.cwd(), "radar-worker", "render_opera.py");
  const args = [
    scriptPath,
    "--input",
    hdf5Path,
    "--output",
    outputPath,
    "--metadata",
    metadataPath,
  ];

  if (options.diagnosticPath) {
    args.push("--diagnostic", options.diagnosticPath);
  }
  if (options.nativeOutputPath) {
    args.push("--native-output", options.nativeOutputPath);
  }
  if (options.sourceGridPath) {
    args.push("--source-grid", options.sourceGridPath);
  }

  const candidates = pythonCandidates();
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      const result = await runPython(candidate, args);
      logHdf5Summary(result.stdout);
      if (result.stderr.trim()) {
        console.info(`Weyra OPERA renderer notes: ${result.stderr.trim().slice(0, 1200)}`);
      }
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${candidate}: ${message}`);
      if (process.env.PYTHON_BIN?.trim()) break;
    }
  }

  throw new Error(
    `Unable to render OPERA HDF5. Install Python dependencies with "python -m pip install -r radar-worker/requirements.txt" or set PYTHON_BIN. Details: ${errors.join(" | ")}`,
  );
}

async function runTileRenderer(args: string[]) {
  const candidates = pythonCandidates();
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      const result = await runPython(candidate, args);
      if (result.stderr.trim()) {
        console.info(`Weyra OPERA tile renderer notes: ${result.stderr.trim().slice(0, 1200)}`);
      }
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${candidate}: ${message}`);
      if (process.env.PYTHON_BIN?.trim()) break;
    }
  }

  throw new OperaTileError(
    `Unable to render OPERA Web Mercator tile. Install Python dependencies with "python -m pip install -r radar-worker/requirements.txt" or set PYTHON_BIN. Details: ${errors.join(" | ")}`,
    500,
  );
}

async function runTileBatchRenderer(args: string[], context: { style: OperaTileRenderVersion; timestamp: string; jobs: number }) {
  const candidates = pythonCandidates();
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      console.info(`[radar tile] python-spawn batch style=${context.style} timestamp=${context.timestamp} jobs=${context.jobs}`);
      const result = await runPython(candidate, args, BATCH_RENDER_TIMEOUT_MS);
      if (result.stderr.trim()) {
        console.info(`Weyra OPERA tile batch renderer notes: ${result.stderr.trim().slice(0, 1200)}`);
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${candidate}: ${message}`);
      if (process.env.PYTHON_BIN?.trim()) break;
    }
  }

  throw new OperaTileError(
    `Unable to batch render OPERA Web Mercator tiles. Install Python dependencies with "python -m pip install -r radar-worker/requirements.txt" or set PYTHON_BIN. Details: ${errors.join(" | ")}`,
    500,
  );
}

function logHdf5Summary(stdout: string) {
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as {
        event?: string;
        selectedDataPath?: string;
        entryCount?: number;
        truncated?: boolean;
        entries?: Array<{ path?: string; kind?: string; shape?: unknown }>;
      };

      if (parsed.event !== "hdf5_structure") continue;
      const compactEntries = (parsed.entries ?? [])
        .slice(0, 24)
        .map((entry) => `${entry.kind}:${entry.path}${entry.shape ? ` ${JSON.stringify(entry.shape)}` : ""}`);

      console.info(
        `Weyra OPERA HDF5 structure selected=${parsed.selectedDataPath ?? "unknown"} entries=${parsed.entryCount ?? 0} truncated=${Boolean(parsed.truncated)} sample=${compactEntries.join(" | ")}`,
      );
      return;
    } catch {
      // Ignore non-JSON renderer output.
    }
  }
}

function stripPrivateMetadata(metadata: RenderMetadata): RenderMetadata {
  return {
    source: metadata.source,
    timestamp: metadata.timestamp,
    quantity: metadata.quantity,
    gain: metadata.gain,
    offset: metadata.offset,
    nodata: metadata.nodata,
    undetect: metadata.undetect,
    width: metadata.width,
    height: metadata.height,
    projection: metadata.projection,
    projectionBounds: metadata.projectionBounds ?? null,
    mapLibreCoordinates: metadata.mapLibreCoordinates ?? null,
    geographicBounds: metadata.geographicBounds ?? metadata.bbox ?? null,
    bbox: metadata.geographicBounds ?? metadata.bbox ?? null,
    hasGeoreferencing: metadata.hasGeoreferencing,
    renderedAt: metadata.renderedAt,
    warning: metadata.warning,
    hdf5DataPath: metadata.hdf5DataPath,
    status: metadata.status,
    imageByteLength: metadata.imageByteLength,
    error: metadata.error ? sanitizeError(metadata.error) : undefined,
    palette: metadata.palette ?? null,
    sourceGridPath: undefined,
    sourceGridCrs: metadata.sourceGridCrs ?? null,
    sourceGridTransform: metadata.sourceGridTransform ?? null,
    sourceGridWidth: metadata.sourceGridWidth ?? null,
    sourceGridHeight: metadata.sourceGridHeight ?? null,
    sourceGridNodata: metadata.sourceGridNodata ?? null,
    sourceGridPixelSize: metadata.sourceGridPixelSize ?? null,
    tileReady: Boolean(metadata.tileReady),
  };
}

async function writeFailedCache(timestamp: string, error: unknown) {
  await mkdir(frameCacheDir(timestamp), { recursive: true });

  const renderedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const metadata: RenderMetadata = {
    source: "EUMETNET OPERA",
    timestamp,
    quantity: "DBZH",
    gain: 1,
    offset: 0,
    nodata: null,
    undetect: null,
    width: 0,
    height: 0,
    projection: null,
    projectionBounds: null,
    mapLibreCoordinates: null,
    geographicBounds: null,
    bbox: null,
    hasGeoreferencing: false,
    renderedAt,
    warning: null,
    status: "failed",
    imageByteLength: 0,
    error: sanitizeError(error),
    tileReady: false,
  };

  await writeFile(metadataPathForTimestamp(timestamp), JSON.stringify(metadata, null, 2), "utf-8");
  await pruneFrameCache();
}

async function readFailedCache(timestamp: string) {
  try {
    const metadata = JSON.parse(await readFile(metadataPathForTimestamp(timestamp), "utf-8")) as RenderMetadata;
    if (metadata.status !== "failed") return null;
    return metadata;
  } catch {
    return null;
  }
}

async function getFrameManifestItem(timestamp: string): Promise<OperaFrameManifestItem> {
  const ready = await readCachedFrame(timestamp);

  if (ready) {
    return {
      timestamp,
      status: "ready",
      imageUrl: frameImageUrl(timestamp),
      metadataUrl: frameMetadataUrl(timestamp),
      width: ready.metadata.width,
      height: ready.metadata.height,
      imageByteLength: ready.imageByteLength,
      hasGeoreferencing: ready.metadata.hasGeoreferencing,
    };
  }

  const failed = await readFailedCache(timestamp);

  if (failed) {
    return {
      timestamp,
      status: "failed",
      imageUrl: frameImageUrl(timestamp),
      metadataUrl: frameMetadataUrl(timestamp),
      width: null,
      height: null,
      imageByteLength: null,
      hasGeoreferencing: false,
      error: failed.error ?? "OPERA frame rendering failed.",
    };
  }

  return {
    timestamp,
    status: "missing",
    imageUrl: frameImageUrl(timestamp),
    metadataUrl: frameMetadataUrl(timestamp),
    width: null,
    height: null,
    imageByteLength: null,
    hasGeoreferencing: false,
  };
}

async function buildManifest(
  frames: RecentOperaComposite[],
  requestedCount: number,
  errors: Array<{ timestamp: string; error: string }> = [],
  durationMs?: number,
  error: string | null = null,
): Promise<OperaFrameManifest> {
  const items: OperaFrameManifestItem[] = [];

  for (const frame of frames) {
    items.push(await getFrameManifestItem(frame.timestamp));
  }

  const readyCount = items.filter((item) => item.status === "ready").length;
  const failedCount = items.filter((item) => item.status === "failed").length;
  const missingCount = items.filter((item) => item.status === "missing").length;

  return {
    ok: !error && items.length > 0,
    provider: "EUMETNET OPERA",
    product: "DBZH",
    requestedCount,
    availableCount: items.length,
    readyCount,
    failedCount,
    missingCount,
    frames: items,
    errors,
    durationMs,
    error,
  };
}

async function pruneFrameCache() {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    const entries = await readdir(CACHE_DIR, { withFileTypes: true });
    const records: Array<{ timestamp: string; time: number }> = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      try {
        const metadata = JSON.parse(await readFile(path.join(CACHE_DIR, entry.name, "metadata.json"), "utf-8")) as RenderMetadata;
        if (!metadata.timestamp) continue;
        records.push({ timestamp: metadata.timestamp, time: new Date(metadata.timestamp).getTime() });
      } catch {
        // Ignore corrupt cache entries.
      }
    }

    const staleRecords = records
      .filter((record) => Number.isFinite(record.time))
      .sort((a, b) => b.time - a.time)
      .slice(MAX_CACHED_FRAMES);

    for (const record of staleRecords) {
      await rm(frameCacheDir(record.timestamp), { recursive: true, force: true }).catch(() => undefined);
      await rm(path.join(TILE_DIR, cacheKey(record.timestamp)), { recursive: true, force: true }).catch(() => undefined);
      await rm(path.join(TILE_META_DIR, cacheKey(record.timestamp)), { recursive: true, force: true }).catch(() => undefined);
    }
  } catch {
    // Cache cleanup should never block a valid render.
  }
}

async function renderFrame(timestamp: string, link: MeteoGateDataLink): Promise<OperaRenderedFrame> {
  const cached = await readCachedFrame(timestamp);
  if (cached) return cached;

  const imagePath = imagePathForTimestamp(timestamp);
  const metadataPath = metadataPathForTimestamp(timestamp);
  const sourceGridPath = sourceGridPathForTimestamp(timestamp);
  let hdf5Path: string | null = null;

  try {
    hdf5Path = await downloadHdf5(link, timestamp);
    await runRenderer(hdf5Path, imagePath, metadataPath, { sourceGridPath });
    const metadata = JSON.parse(await readFile(metadataPath, "utf-8")) as RenderMetadata;
    const imageStats = await stat(imagePath);
    metadata.status = "ready";
    metadata.imageByteLength = imageStats.size;
    metadata.error = undefined;
    metadata.sourceGridPath = metadata.sourceGridPath ?? sourceGridPath;
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");
    await pruneFrameCache();
    return {
      timestamp,
      imagePath,
      metadataPath,
      metadata,
      status: "ready",
      renderedAt: metadata.renderedAt,
      imageByteLength: imageStats.size,
    };
  } catch (error) {
    await rm(imagePath, { force: true }).catch(() => undefined);
    await writeFailedCache(timestamp, error);
    throw error;
  } finally {
    if (hdf5Path) {
      await rm(hdf5Path, { force: true }).catch(() => undefined);
    }
  }
}

export async function renderOperaFrame(
  frame: RecentOperaComposite,
  options: { retryFailed?: boolean } = {},
): Promise<OperaRenderedFrame> {
  const cached = await readCachedFrame(frame.timestamp);
  if (cached) return cached;

  const failed = options.retryFailed ? null : await readFailedCache(frame.timestamp);
  if (failed) {
    throw new Error(failed.error ?? `OPERA frame ${frame.timestamp} previously failed.`);
  }

  const existing = inFlight.get(frame.timestamp);
  if (existing) return existing;

  const pending = withRenderSlot(() => renderFrame(frame.timestamp, frame.internalDataLink)).finally(() => {
    inFlight.delete(frame.timestamp);
  });

  inFlight.set(frame.timestamp, pending);
  return pending;
}

export async function renderLatestOperaFrame(): Promise<OperaRenderedFrame> {
  const latest = await getLatestOperaComposite();

  if (!latest.ok || !latest.latestTimestamp) {
    const cached = await readNewestCachedFrame();
    if (cached) return cached;

    throw new Error(latest.error ?? "No latest OPERA DBZH composite is available.");
  }

  const link = selectLatestHdf5Link(latest.dataLinks, latest.latestTimestamp);
  if (!link) {
    throw new Error(`No ODIM HDF5 link was found for latest OPERA timestamp ${latest.latestTimestamp}.`);
  }

  const cached = await readCachedFrame(latest.latestTimestamp);
  if (cached) return cached;

  return renderOperaFrame({
    timestamp: latest.latestTimestamp,
    provider: "EUMETNET OPERA",
    product: "DBZH",
    method: "comp",
    format: "ODIM HDF5",
    internalDataLink: link,
    sourceStatus: latest.sourceStatus,
  }, { retryFailed: true });
}

async function qaArtifactsExist(timestamp: string) {
  try {
    await Promise.all([
      stat(qaNativeImagePathForTimestamp(timestamp)),
      stat(qaCurrentOverlayPathForTimestamp(timestamp)),
      stat(qaDiagnosticPathForTimestamp(timestamp)),
      stat(qaMetadataPathForTimestamp(timestamp)),
    ]);
    return true;
  } catch {
    return false;
  }
}

async function buildQaReport(frame: RecentOperaComposite): Promise<OperaQaReport> {
  const renderedFrame = await renderOperaFrame(frame, { retryFailed: true });
  const timestamp = renderedFrame.metadata.timestamp ?? renderedFrame.timestamp;
  const nativeImagePath = qaNativeImagePathForTimestamp(timestamp);
  const currentOverlayPath = qaCurrentOverlayPathForTimestamp(timestamp);
  const diagnosticPath = qaDiagnosticPathForTimestamp(timestamp);
  const metadataPath = qaMetadataPathForTimestamp(timestamp);

  if (!await qaArtifactsExist(timestamp)) {
    let hdf5Path: string | null = null;

    try {
      hdf5Path = await downloadHdf5(frame.internalDataLink, timestamp);
      await mkdir(QA_DIR, { recursive: true });
      await runRenderer(hdf5Path, currentOverlayPath, metadataPath, {
        diagnosticPath,
        nativeOutputPath: nativeImagePath,
      });
    } finally {
      if (hdf5Path) {
        await rm(hdf5Path, { force: true }).catch(() => undefined);
      }
    }
  }

  const [diagnostic, qaMetadata, imageStats] = await Promise.all([
    readFile(diagnosticPath, "utf-8").then((content) => JSON.parse(content) as OperaDbzhDiagnostic),
    readFile(metadataPath, "utf-8").then((content) => stripPrivateMetadata(JSON.parse(content) as RenderMetadata)),
    stat(currentOverlayPath),
  ]);

  const publicFrameMetadata = stripPrivateMetadata(renderedFrame.metadata);
  publicFrameMetadata.status = "ready";
  publicFrameMetadata.imageByteLength = renderedFrame.imageByteLength;

  return {
    ok: true,
    provider: "EUMETNET OPERA",
    product: "DBZH",
    timestamp,
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    nativeGridImageUrl: qaNativeImageUrl(timestamp),
    currentMapOverlayImageUrl: qaCurrentOverlayImageUrl(timestamp),
    atlasRuntimeImageUrl: frameImageUrl(timestamp),
    metadataUrl: frameMetadataUrl(timestamp),
    width: qaMetadata.width,
    height: qaMetadata.height,
    imageByteLength: imageStats.size,
    diagnostic,
    metadata: publicFrameMetadata,
  };
}

export async function getLatestOperaQaReport(): Promise<OperaQaReport> {
  const latest = await getLatestOperaComposite();

  if (!latest.ok || !latest.latestTimestamp) {
    throw new Error(latest.error ?? "No latest OPERA DBZH composite is available for QA.");
  }

  const link = selectLatestHdf5Link(latest.dataLinks, latest.latestTimestamp);
  if (!link) {
    throw new Error(`No ODIM HDF5 link was found for OPERA QA timestamp ${latest.latestTimestamp}.`);
  }

  return buildQaReport({
    timestamp: latest.latestTimestamp,
    provider: "EUMETNET OPERA",
    product: "DBZH",
    method: "comp",
    format: "ODIM HDF5",
    internalDataLink: link,
    sourceStatus: latest.sourceStatus,
  });
}

export async function getOperaQaImagePath(kind: "native" | "current", timestamp: string): Promise<string> {
  const normalizedTimestamp = normalizeOperaTimestamp(timestamp);
  if (!normalizedTimestamp) {
    throw new Error("Invalid OPERA QA timestamp.");
  }

  const imagePath = kind === "native"
    ? qaNativeImagePathForTimestamp(normalizedTimestamp)
    : qaCurrentOverlayPathForTimestamp(normalizedTimestamp);

  try {
    await stat(imagePath);
    return imagePath;
  } catch {
    const report = await getLatestOperaQaReport();
    if (report.timestamp !== normalizedTimestamp) {
      throw new Error(`OPERA QA image for ${normalizedTimestamp} is not available.`);
    }
    await stat(imagePath);
    return imagePath;
  }
}

function validateTileInput(timestamp: string, z: number, x: number, y: number) {
  const normalizedTimestamp = normalizeOperaTimestamp(timestamp);
  if (!normalizedTimestamp) {
    throw new OperaTileError("Invalid OPERA radar timestamp.", 400);
  }

  if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y)) {
    throw new OperaTileError("Invalid OPERA tile coordinates.", 400);
  }

  if (z < MIN_TILE_ZOOM || z > MAX_TILE_ZOOM) {
    throw new OperaTileError(`OPERA tiles are available only from z=${MIN_TILE_ZOOM} to z=${MAX_TILE_ZOOM}.`, 400);
  }

  const limit = 2 ** z;
  if (x < 0 || y < 0 || x >= limit || y >= limit) {
    throw new OperaTileError("OPERA tile coordinates are outside the XYZ range for this zoom.", 400);
  }

  return normalizedTimestamp;
}

export function normalizeOperaTileRenderVersion(value: string | null | undefined): OperaTileRenderVersion {
  return SUPPORTED_TILE_RENDER_VERSIONS.includes(value as OperaTileRenderVersion)
    ? value as OperaTileRenderVersion
    : TILE_RENDER_VERSION;
}

function tileBounds4326(z: number, x: number, y: number) {
  const tileCount = 2 ** z;
  const west = x / tileCount * 360 - 180;
  const east = (x + 1) / tileCount * 360 - 180;
  const northRadians = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / tileCount)));
  const southRadians = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / tileCount)));
  return {
    west,
    south: southRadians * 180 / Math.PI,
    east,
    north: northRadians * 180 / Math.PI,
  };
}

function boundsIntersect(
  a: { west: number; south: number; east: number; north: number },
  b: { west: number; south: number; east: number; north: number },
) {
  return a.west <= b.east && a.east >= b.west && a.south <= b.north && a.north >= b.south;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function lonToTileX(lon: number, z: number) {
  const tileCount = 2 ** z;
  return clampNumber(Math.floor(((lon + 180) / 360) * tileCount), 0, tileCount - 1);
}

function latToTileY(lat: number, z: number) {
  const tileCount = 2 ** z;
  const clampedLat = clampNumber(lat, -85.05112878, 85.05112878);
  const radians = clampedLat * Math.PI / 180;
  const y = (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2 * tileCount;
  return clampNumber(Math.floor(y), 0, tileCount - 1);
}

function normalizePrewarmViewport(viewport: OperaTilePrewarmViewport) {
  const west = clampNumber(Math.min(viewport.west, viewport.east), -180, 180);
  const east = clampNumber(Math.max(viewport.west, viewport.east), -180, 180);
  const south = clampNumber(Math.min(viewport.south, viewport.north), -85.05112878, 85.05112878);
  const north = clampNumber(Math.max(viewport.south, viewport.north), -85.05112878, 85.05112878);
  const zoom = clampNumber(viewport.zoom, MIN_TILE_ZOOM, MAX_TILE_ZOOM);
  return { west, south, east, north, zoom };
}

function zoomLevelsForPrewarm(zoom: number) {
  const floorZoom = clampNumber(Math.floor(zoom), MIN_TILE_ZOOM, MAX_TILE_ZOOM);
  const ceilZoom = clampNumber(Math.ceil(zoom), MIN_TILE_ZOOM, MAX_TILE_ZOOM);
  return [...new Set([floorZoom, ceilZoom])];
}

function tileUrl(timestamp: string, z: number, x: number, y: number, style: OperaTileRenderVersion) {
  return `/api/radar/opera/tiles/${encodeURIComponent(timestamp)}/${z}/${x}/${y}?style=${style}`;
}

function tileJobsForViewport(viewport: OperaTilePrewarmViewport, paddingTiles: number) {
  const normalized = normalizePrewarmViewport(viewport);
  const padding = clampNumber(Math.floor(Number.isFinite(paddingTiles) ? paddingTiles : 1), 0, 2);
  const jobs: Array<{ z: number; x: number; y: number; distance: number }> = [];

  for (const z of zoomLevelsForPrewarm(normalized.zoom)) {
    const tileCount = 2 ** z;
    const westX = lonToTileX(normalized.west, z);
    const eastX = lonToTileX(normalized.east, z);
    const northY = latToTileY(normalized.north, z);
    const southY = latToTileY(normalized.south, z);
    const minX = clampNumber(Math.min(westX, eastX) - padding, 0, tileCount - 1);
    const maxX = clampNumber(Math.max(westX, eastX) + padding, 0, tileCount - 1);
    const minY = clampNumber(Math.min(northY, southY) - padding, 0, tileCount - 1);
    const maxY = clampNumber(Math.max(northY, southY) + padding, 0, tileCount - 1);
    const centerX = ((normalized.west + normalized.east) / 2 + 180) / 360 * tileCount;
    const centerY = latToTileY((normalized.south + normalized.north) / 2, z);

    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        jobs.push({
          z,
          x,
          y,
          distance: Math.hypot(x - centerX, y - centerY),
        });
      }
    }
  }

  const deduped = new Map<string, { z: number; x: number; y: number; distance: number }>();
  for (const job of jobs) {
    deduped.set(`${job.z}/${job.x}/${job.y}`, job);
  }

  return [...deduped.values()]
    .sort((a, b) => a.distance - b.distance || a.z - b.z || a.x - b.x || a.y - b.y)
    .slice(0, MAX_PREWARM_TILES_PER_TIMESTAMP)
    .map(({ z, x, y }) => ({ z, x, y }));
}

function tileLockKey(version: OperaTileRenderVersion, timestamp: string, z: number, x: number, y: number) {
  return `${version}/${timestamp}/${z}/${x}/${y}`;
}

async function readCachedTile(
  version: OperaTileRenderVersion,
  timestamp: string,
  z: number,
  x: number,
  y: number,
): Promise<OperaTileResult | null> {
  const imagePath = tileImagePath(version, timestamp, z, x, y);
  const metadataPath = tileMetadataPath(version, timestamp, z, x, y);

  try {
    await Promise.all([stat(imagePath), stat(metadataPath)]);
    const meta = JSON.parse(await readFile(metadataPath, "utf-8")) as OperaTileMeta;
    return {
      imagePath,
      metadataPath,
      meta: {
        ...meta,
        timestamp,
        z,
        x,
        y,
        targetProjection: "EPSG:3857",
        displayVersion: meta.displayVersion ?? version,
        cached: true,
      },
      cached: true,
    };
  } catch {
    return null;
  }
}

export async function getCachedOperaTile(input: {
  timestamp: string;
  z: number;
  x: number;
  y: number;
  style?: string | null;
}): Promise<OperaTileResult> {
  const timestamp = validateTileInput(input.timestamp, input.z, input.x, input.y);
  const version = normalizeOperaTileRenderVersion(input.style);
  const cached = await readCachedTile(version, timestamp, input.z, input.x, input.y);
  if (!cached) {
    throw new OperaTileError("OPERA tile is not prewarmed in the local Weyra cache.", 404);
  }
  return cached;
}

async function renderOperaTile(
  version: OperaTileRenderVersion,
  timestamp: string,
  z: number,
  x: number,
  y: number,
  sourceGridPath: string | null,
  transparent = false,
): Promise<OperaTileResult> {
  const imagePath = tileImagePath(version, timestamp, z, x, y);
  const metadataPath = tileMetadataPath(version, timestamp, z, x, y);
  await Promise.all([
    mkdir(tileCacheDir(version, timestamp, z, x), { recursive: true }),
    mkdir(tileMetaCacheDir(version, timestamp, z, x), { recursive: true }),
  ]);

  const scriptPath = path.join(process.cwd(), "radar-worker", "render_opera_tile.py");
  const args = [
    scriptPath,
    "--output",
    imagePath,
    "--z",
    String(z),
    "--x",
    String(x),
    "--y",
    String(y),
    "--metadata",
    metadataPath,
    "--timestamp",
    timestamp,
    "--display-version",
    version,
  ];

  if (transparent) {
    args.push("--transparent");
  } else if (sourceGridPath) {
    args.push("--input", sourceGridPath);
  } else {
    throw new OperaTileError("OPERA frame has no local source grid for tile generation.", 409);
  }

  await withTileRenderSlot(() => runTileRenderer(args));
  const meta = JSON.parse(await readFile(metadataPath, "utf-8")) as OperaTileMeta;
  await pruneTileCache();

  return {
    imagePath,
    metadataPath,
    meta: {
      ...meta,
      timestamp,
      z,
      x,
      y,
      targetProjection: "EPSG:3857",
      displayVersion: meta.displayVersion ?? version,
      cached: false,
    },
    cached: false,
  };
}

async function pruneTileCache() {
  try {
    await mkdir(TILE_DIR, { recursive: true });
    const records: Array<{ imagePath: string; metadataPath: string; size: number; mtimeMs: number }> = [];

    async function visit(directory: string) {
      const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          await visit(entryPath);
          continue;
        }
        if (!entry.isFile() || !entry.name.endsWith(".webp")) continue;
        const stats = await stat(entryPath);
        const relativePath = path.relative(TILE_DIR, entryPath);
        const metadataPath = path.join(TILE_META_DIR, relativePath).replace(/\.webp$/, ".json");
        records.push({ imagePath: entryPath, metadataPath, size: stats.size, mtimeMs: stats.mtimeMs });
      }
    }

    await visit(TILE_DIR);

    let total = records.reduce((sum, record) => sum + record.size, 0);
    const stale = records.sort((a, b) => a.mtimeMs - b.mtimeMs);

    for (const record of stale) {
      if (total <= MAX_TILE_CACHE_BYTES) break;
      await rm(record.imagePath, { force: true }).catch(() => undefined);
      await rm(record.metadataPath, { force: true }).catch(() => undefined);
      total -= record.size;
    }
  } catch {
    // Tile cache pruning must not block a valid tile response.
  }
}

async function prewarmTimestampTiles(
  timestamp: string,
  version: OperaTileRenderVersion,
  jobs: Array<{ z: number; x: number; y: number }>,
): Promise<OperaTilePrewarmTimestampResult> {
  const startedAt = Date.now();
  const cachedBefore = await Promise.all(jobs.map((job) => readCachedTile(version, timestamp, job.z, job.x, job.y)));
  const cacheHits = cachedBefore.filter(Boolean).length;
  const missingJobs = jobs.filter((_job, index) => !cachedBefore[index]);

  if (missingJobs.length === 0) {
    console.info(`[radar tile] cache-hit prewarm style=${version} timestamp=${timestamp} requested=${jobs.length}`);
    return {
      timestamp,
      requested: jobs.length,
      cacheHits,
      generated: 0,
      failed: 0,
      durationMs: Date.now() - startedAt,
      tileUrls: jobs.map((job) => tileUrl(timestamp, job.z, job.x, job.y, version)),
      readyTiles: jobs.map(({ z, x, y }) => ({ z, x, y })),
    };
  }

  console.warn(`[radar tile] CACHE-MISS prewarm style=${version} timestamp=${timestamp} missing=${missingJobs.length} requested=${jobs.length}`);

  const frame = await readCachedFrame(timestamp);
  if (!frame) {
    return {
      timestamp,
      requested: jobs.length,
      cacheHits,
      generated: 0,
      failed: missingJobs.length,
      durationMs: Date.now() - startedAt,
      tileUrls: jobs
        .filter((_job, index) => cachedBefore[index])
        .map((job) => tileUrl(timestamp, job.z, job.x, job.y, version)),
      readyTiles: jobs
        .filter((_job, index) => Boolean(cachedBefore[index]))
        .map(({ z, x, y }) => ({ z, x, y })),
    };
  }

  const sourceGridPath = frame.metadata.sourceGridPath ?? sourceGridPathForTimestamp(timestamp);
  const sourceGridExists = await stat(sourceGridPath).then(() => true).catch(() => false);
  if (!sourceGridExists || frame.metadata.tileReady === false) {
    return {
      timestamp,
      requested: jobs.length,
      cacheHits,
      generated: 0,
      failed: missingJobs.length,
      durationMs: Date.now() - startedAt,
      tileUrls: jobs
        .filter((_job, index) => cachedBefore[index])
        .map((job) => tileUrl(timestamp, job.z, job.x, job.y, version)),
      readyTiles: jobs
        .filter((_job, index) => Boolean(cachedBefore[index]))
        .map(({ z, x, y }) => ({ z, x, y })),
    };
  }

  await mkdir(TILE_JOB_DIR, { recursive: true });
  const jobsPath = path.join(
    TILE_JOB_DIR,
    `${cacheKey(timestamp)}-${version}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
  await writeFile(jobsPath, JSON.stringify(missingJobs), "utf-8");

  try {
    const scriptPath = path.join(process.cwd(), "radar-worker", "render_opera_tiles_batch.py");
    await withTileRenderSlot(() => runTileBatchRenderer([
      scriptPath,
      "--input",
      sourceGridPath,
      "--jobs",
      jobsPath,
      "--style",
      version,
      "--timestamp",
      timestamp,
      "--output-root",
      RADAR_CACHE_ROOT,
    ], { style: version, timestamp, jobs: missingJobs.length }));
    await pruneTileCache();
  } catch (error) {
    console.warn(`[radar tile] batch-prewarm failed style=${version} timestamp=${timestamp} jobs=${missingJobs.length}: ${sanitizeError(error)}`);
  } finally {
    await rm(jobsPath, { force: true }).catch(() => undefined);
  }

  const cachedAfter = await Promise.all(jobs.map((job) => readCachedTile(version, timestamp, job.z, job.x, job.y)));
  const readyCount = cachedAfter.filter(Boolean).length;

  return {
    timestamp,
    requested: jobs.length,
    cacheHits,
    generated: Math.max(0, readyCount - cacheHits),
    failed: Math.max(0, jobs.length - readyCount),
    durationMs: Date.now() - startedAt,
    tileUrls: jobs
      .filter((_job, index) => Boolean(cachedAfter[index]))
      .map((job) => tileUrl(timestamp, job.z, job.x, job.y, version)),
    readyTiles: jobs
      .filter((_job, index) => Boolean(cachedAfter[index]))
      .map(({ z, x, y }) => ({ z, x, y })),
  };
}

export async function prewarmOperaTiles(input: {
  timestamps: string[];
  viewport: OperaTilePrewarmViewport;
  paddingTiles?: number;
  style?: string | null;
}): Promise<OperaTilePrewarmResult> {
  const version = normalizeOperaTileRenderVersion(input.style);
  const viewport = input.viewport;
  if (!viewport || ![viewport.west, viewport.south, viewport.east, viewport.north, viewport.zoom].every(Number.isFinite)) {
    throw new OperaTileError("Invalid OPERA tile prewarm viewport.", 400);
  }

  const timestamps = [...new Set((input.timestamps ?? [])
    .map((timestamp) => normalizeOperaTimestamp(timestamp))
    .filter((timestamp): timestamp is string => Boolean(timestamp)))]
    .slice(0, MAX_PREWARM_TIMESTAMPS);

  if (!timestamps.length) {
    throw new OperaTileError("No valid OPERA timestamps were provided for tile prewarm.", 400);
  }

  const jobs = tileJobsForViewport(viewport, input.paddingTiles ?? 1);
  const timestampsResult = await Promise.all(timestamps.map((timestamp) => prewarmTimestampTiles(timestamp, version, jobs)));

  return {
    ok: timestampsResult.some((item) => item.failed < item.requested),
    style: version,
    timestamps: timestampsResult,
  };
}

export async function getOrCreateOperaTile(input: {
  timestamp: string;
  z: number;
  x: number;
  y: number;
  style?: string | null;
}): Promise<OperaTileResult> {
  const timestamp = validateTileInput(input.timestamp, input.z, input.x, input.y);
  const version = normalizeOperaTileRenderVersion(input.style);
  const cached = await readCachedTile(version, timestamp, input.z, input.x, input.y);
  if (cached) return cached;

  const lockKey = tileLockKey(version, timestamp, input.z, input.x, input.y);
  const existing = tileInFlight.get(lockKey);
  if (existing) return existing;

  const pending = (async () => {
    const frame = await readCachedFrame(timestamp);
    if (!frame) {
      throw new OperaTileError("OPERA radar frame is not ready in the local Weyra cache.", 404);
    }

    const sourceGridPath = frame.metadata.sourceGridPath ?? sourceGridPathForTimestamp(timestamp);
    const sourceGridExists = await stat(sourceGridPath).then(() => true).catch(() => false);
    if (!sourceGridExists || frame.metadata.tileReady === false) {
      throw new OperaTileError("OPERA frame is not tile-ready. Render it again after installing rasterio and mercantile.", 409);
    }

    const frameBounds = frame.metadata.geographicBounds ?? frame.metadata.bbox;
    const requestedBounds = tileBounds4326(input.z, input.x, input.y);
    const outside = frameBounds ? !boundsIntersect(requestedBounds, frameBounds) : false;

    return renderOperaTile(version, timestamp, input.z, input.x, input.y, sourceGridPath, outside);
  })().finally(() => {
    tileInFlight.delete(lockKey);
  });

  tileInFlight.set(lockKey, pending);
  return pending;
}

export async function getCachedRenderedOperaFrame(timestamp: string): Promise<OperaRenderedFrame | null> {
  return readCachedFrame(timestamp);
}

export type OperaOverviewTileJob = { z: number; x: number; y: number };

export function operaCacheKey(timestamp: string) {
  return cacheKey(timestamp);
}

export function operaSourceGridPath(timestamp: string) {
  return sourceGridPathForTimestamp(timestamp);
}

export function operaCachedTileImagePath(timestamp: string, z: number, x: number, y: number, style?: string | null) {
  const version = normalizeOperaTileRenderVersion(style);
  return tileImagePath(version, timestamp, z, x, y);
}

export function operaOverviewTileJobsForBounds(
  bounds: { west: number; south: number; east: number; north: number },
  zoomMin: number,
  zoomMax: number,
): OperaOverviewTileJob[] {
  const jobs: OperaOverviewTileJob[] = [];

  for (let z = zoomMin; z <= zoomMax; z += 1) {
    const minX = lonToTileX(Math.min(bounds.west, bounds.east), z);
    const maxX = lonToTileX(Math.max(bounds.west, bounds.east), z);
    const minY = latToTileY(Math.max(bounds.south, bounds.north), z);
    const maxY = latToTileY(Math.min(bounds.south, bounds.north), z);

    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        jobs.push({ z, x, y });
      }
    }
  }

  return jobs;
}

// Runs the existing batch tile renderer for a scan-pack overview build: one Python process
// per scan, the source GeoTIFF opened once, bounded by the same global 2-process tile slot
// shared with viewport detail prewarms.
export async function runOperaOverviewTileBatch(input: {
  sourceGridPath: string;
  jobs: OperaOverviewTileJob[];
  timestamp: string;
  outputRoot: string;
  style?: string | null;
}): Promise<void> {
  const style = normalizeOperaTileRenderVersion(input.style);
  await mkdir(input.outputRoot, { recursive: true });
  const jobsPath = path.join(input.outputRoot, `jobs-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  await writeFile(jobsPath, JSON.stringify(input.jobs), "utf-8");

  try {
    const scriptPath = path.join(process.cwd(), "radar-worker", "render_opera_tiles_batch.py");
    await withTileRenderSlot(() => runTileBatchRenderer([
      scriptPath,
      "--input",
      input.sourceGridPath,
      "--jobs",
      jobsPath,
      "--style",
      style,
      "--timestamp",
      input.timestamp,
      "--output-root",
      input.outputRoot,
    ], { style, timestamp: input.timestamp, jobs: input.jobs.length }));
  } finally {
    await rm(jobsPath, { force: true }).catch(() => undefined);
  }
}

export async function getLatestRenderedOperaMeta(): Promise<RenderedOperaPublicMeta> {
  const frame = await renderLatestOperaFrame();
  const timestamp = frame.metadata.timestamp ?? frame.timestamp;

  return {
    ok: true,
    provider: "EUMETNET OPERA",
    product: "DBZH",
    timestamp,
    imageUrl: `/api/radar/opera/render/latest?ts=${encodeURIComponent(timestamp)}`,
    mapLibreCoordinates: frame.metadata.mapLibreCoordinates ?? null,
    geographicBounds: frame.metadata.geographicBounds ?? frame.metadata.bbox ?? null,
    projectionBounds: frame.metadata.projectionBounds ?? null,
    projection: frame.metadata.projection,
    width: frame.metadata.width,
    height: frame.metadata.height,
    imageByteLength: frame.imageByteLength,
    hasGeoreferencing: frame.metadata.hasGeoreferencing,
    warning: frame.metadata.warning,
    metadata: stripPrivateMetadata(frame.metadata),
  };
}

export async function getCachedRenderedOperaMeta(timestamp: string): Promise<RenderedOperaPublicMeta | null> {
  const normalizedTimestamp = normalizeOperaTimestamp(timestamp);
  if (!normalizedTimestamp) return null;

  const frame = await readCachedFrame(normalizedTimestamp);
  if (!frame) return null;

  return {
    ok: true,
    provider: "EUMETNET OPERA",
    product: "DBZH",
    timestamp: normalizedTimestamp,
    imageUrl: frameImageUrl(normalizedTimestamp),
    mapLibreCoordinates: frame.metadata.mapLibreCoordinates ?? null,
    geographicBounds: frame.metadata.geographicBounds ?? frame.metadata.bbox ?? null,
    projectionBounds: frame.metadata.projectionBounds ?? null,
    projection: frame.metadata.projection,
    width: frame.metadata.width,
    height: frame.metadata.height,
    imageByteLength: frame.imageByteLength,
    hasGeoreferencing: frame.metadata.hasGeoreferencing,
    warning: frame.metadata.warning,
    metadata: stripPrivateMetadata(frame.metadata),
  };
}

export async function getOperaFramesManifest(count: number): Promise<OperaFrameManifest> {
  const recent = await getRecentOperaComposites({ count });

  if (!recent.ok) {
    return buildManifest([], count, [], undefined, recent.error ?? "No OPERA frames were discovered.");
  }

  return buildManifest(recent.frames, count);
}

export async function prepareOperaFrames(count: number): Promise<OperaFrameManifest> {
  const startedAt = Date.now();
  const recent = await getRecentOperaComposites({ count });

  if (!recent.ok) {
    return buildManifest([], count, [], Date.now() - startedAt, recent.error ?? "No OPERA frames were discovered.");
  }

  const initialManifest = await buildManifest(recent.frames, count);
  // Failed frames are retried on each prepare call: a transient download error or a renderer
  // hiccup on one page load must not poison a timestamp for the rest of its history window.
  const framesToRender = recent.frames.filter((frame) => {
    const item = initialManifest.frames.find((candidate) => candidate.timestamp === frame.timestamp);
    return item?.status === "missing" || item?.status === "failed";
  });
  const errors: Array<{ timestamp: string; error: string }> = [];
  const deadline = startedAt + BATCH_RENDER_TIMEOUT_MS;
  let cursor = 0;

  async function worker() {
    while (cursor < framesToRender.length) {
      const index = cursor;
      cursor += 1;
      const frame = framesToRender[index];
      if (!frame) continue;

      if (Date.now() >= deadline) {
        errors.push({
          timestamp: frame.timestamp,
          error: "Batch render time budget reached before this frame could be rendered.",
        });
        continue;
      }

      try {
        await renderOperaFrame(frame, { retryFailed: true });
      } catch (error) {
        errors.push({ timestamp: frame.timestamp, error: sanitizeError(error) });
      }
    }
  }

  const workerCount = Math.min(MAX_CONCURRENT_RENDERS, framesToRender.length);
  const workers: Array<Promise<void>> = [];

  for (let index = 0; index < workerCount; index += 1) {
    workers.push(worker());
  }

  await Promise.all(workers);

  return buildManifest(recent.frames, count, errors, Date.now() - startedAt);
}
