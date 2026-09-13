import "server-only";

import { spawn } from "child_process";
import { createHash } from "crypto";
import { existsSync } from "fs";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "fs/promises";
import { homedir } from "os";
import path from "path";
import { meteoFranceRadarFetch } from "@/lib/server/meteofrance-radar";
import { RADAR_CACHE_ROOT } from "@/lib/server/radar-config";
import { logRadarEvent } from "@/lib/server/radar-observability";

const METEOFRANCE_ROOT = path.join(RADAR_CACHE_ROOT, "meteofrance");
const METEOFRANCE_PACKAGE_ROOT = path.join(METEOFRANCE_ROOT, "packages");
export const METEOFRANCE_FRAME_ROOT = path.join(METEOFRANCE_ROOT, "frames");
const PACKAGE_STATE_PATH = path.join(METEOFRANCE_ROOT, "latest-package.json");
const MAX_PACKAGE_BYTES = 64 * 1024 * 1024;
const RENDER_TIMEOUT_MS = 120_000;
const MAX_KEPT_PACKAGES = 16;
const MAX_KEPT_FRAMES = 18;

export type MeteoFranceFrameMetadata = {
  source: "Météo-France";
  renderVersion: string;
  provider: "Météo-France";
  attribution: "Source : Météo-France";
  license: string;
  product: "Mosaique_metropole_Z_1km";
  productCode: "IMFR27_C_LFPW";
  timestamp: string;
  quantity: "DBZH";
  format: "BUFR";
  nodata: number;
  undetect: number;
  width: number;
  height: number;
  nativeResolutionMeters: number;
  minimumDbzh: number;
  maximumDbzh: number;
  nodataPixelCount: number;
  undetectPixelCount: number;
  visiblePixelCount: number;
  strongPixelCount: number;
  rainProbabilityAvailable: boolean;
  probabilityPixelCount: number;
  probabilityMissingPixelCount: number;
  minimumRainProbability: number | null;
  maximumRainProbability: number | null;
  rainProbabilityMean: number | null;
  rainProbabilityDisplayThreshold: number | null;
  displayFilter: string;
  displayValidPixelCount: number;
  displayVisiblePixelCount: number;
  projection: string;
  projectionBounds: [number, number, number, number];
  mapLibreCoordinates: [[number, number], [number, number], [number, number], [number, number]];
  geographicBounds: [number, number, number, number];
  bbox: [number, number, number, number];
  hasGeoreferencing: true;
  sourceGridPath: string;
  sourceGridRawPath: string;
  sourceGridCrs: string;
  sourceGridTransform: [number, number, number, number, number, number];
  sourceGridWidth: number;
  sourceGridHeight: number;
  sourceGridNodata: number;
  sourceGridPixelSize: [number, number];
  tileReady: boolean;
  renderedAt: string;
  decoder: string;
  sourceMember: string;
  sourceValidPixels: number;
};

export type MeteoFrancePreparedFrame = {
  provider: "Météo-France";
  attribution: "Source : Météo-France";
  timestamp: string;
  sourceGridPath: string;
  coverage: { west: number; south: number; east: number; north: number };
  metadata: MeteoFranceFrameMetadata;
};

export type MeteoFranceIngestResult = {
  ok: boolean;
  provider: "Météo-France";
  product: "DBZH";
  packageTimestamp: string | null;
  downloadedAt: string | null;
  availableCount: number;
  latestTimestamp: string | null;
  frames: MeteoFrancePreparedFrame[];
  durationMs: number;
  error: string | null;
};

type PackageState = {
  packageTimestamp: string | null;
  downloadedAt: string;
  packagePath: string;
  sha256: string;
  byteLength: number;
};

type PythonResult = { stdout: string; stderr: string };

let ingestInFlight: Promise<MeteoFranceIngestResult> | null = null;

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function normalizeTimestamp(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function parseMeteoFrancePackageTimestamp(value: string | null) {
  const match = value?.match(/paquetradar_mosaique_(\d{14})\.tar\.gz/i);
  if (!match?.[1]) return null;
  const compact = match[1];
  return normalizeTimestamp(
    `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}T${compact.slice(8, 10)}:${compact.slice(10, 12)}:${compact.slice(12, 14)}Z`,
  );
}

function cacheKey(timestamp: string | null, sha256: string) {
  return timestamp ? timestamp.replace(/[-:]/g, "").replace("T", "-").replace("Z", "") : sha256.slice(0, 20);
}

function pythonCandidates() {
  if (process.env.PYTHON_BIN?.trim()) return [process.env.PYTHON_BIN.trim()];
  const candidates = [
    path.join(process.cwd(), ".venv", "Scripts", "python.exe"),
    path.join(process.cwd(), "venv", "Scripts", "python.exe"),
    path.join(homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe"),
    "python3",
    "python",
    "py",
  ];
  return [...new Set(candidates)].filter((candidate) =>
    path.isAbsolute(candidate) ? existsSync(/* turbopackIgnore: true */ candidate) : true,
  );
}

function decoderPath() {
  const configured = process.env.METEOFRANCE_BUFR_DECODER?.trim();
  if (configured) return path.resolve(/* turbopackIgnore: true */ configured);
  return process.platform === "win32"
    ? path.join(process.cwd(), "radar-worker", "bin", "decode_meteofrance_bufr.exe")
    : path.join(process.cwd(), "radar-worker", "bin", "decode_meteofrance_bufr");
}

function descriptorTablesPath() {
  const configured = process.env.METEOFRANCE_BUFR_TABLES_DIR?.trim();
  return configured
    ? path.resolve(/* turbopackIgnore: true */ configured)
    : path.join(process.cwd(), "radar-worker", "vendor", "opera-bufr-3.2", "tables");
}

function runPython(command: string, args: string[]): Promise<PythonResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`Météo-France renderer timed out after ${RENDER_TIMEOUT_MS / 1000}s.`));
    }, RENDER_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > 1_000_000) stdout = stdout.slice(-1_000_000);
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
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Météo-France renderer exited with code ${code}. ${stderr || stdout}`.trim()));
    });
  });
}

function publicError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]")
    .replace(/[A-Za-z]:[\\/][^\s]+/g, "[redacted-path]")
    .slice(0, 900);
}

async function downloadLatestPackage(): Promise<PackageState> {
  const response = await meteoFranceRadarFetch("/mosaique/paquet", {
    headers: { Accept: "application/gzip, application/octet-stream;q=0.9, */*;q=0.5" },
  });
  if (!response.ok) throw new Error(`Météo-France Package Radar returned HTTP ${response.status}.`);

  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_PACKAGE_BYTES) {
    throw new Error("Météo-France mosaic package exceeds the configured size limit.");
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1024 || bytes.length > MAX_PACKAGE_BYTES || bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
    throw new Error("Météo-France returned an invalid radar mosaic package.");
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const packageTimestamp = parseMeteoFrancePackageTimestamp(response.headers.get("content-disposition"));
  const key = cacheKey(packageTimestamp, sha256);
  const packagePath = path.join(METEOFRANCE_PACKAGE_ROOT, `${key}-${sha256.slice(0, 12)}.tar.gz`);
  const temporaryPath = `${packagePath}.${process.pid}.${Date.now()}.tmp`;
  await mkdir(METEOFRANCE_PACKAGE_ROOT, { recursive: true });
  const alreadyCached = await stat(packagePath)
    .then(() => true)
    .catch(() => false);
  if (!alreadyCached) {
    await writeFile(temporaryPath, bytes, { mode: 0o640 });
    await rename(temporaryPath, packagePath);
  }

  const state: PackageState = {
    packageTimestamp,
    downloadedAt: nowIso(),
    packagePath,
    sha256,
    byteLength: bytes.length,
  };
  await mkdir(METEOFRANCE_ROOT, { recursive: true });
  await writeFile(PACKAGE_STATE_PATH, JSON.stringify(state, null, 2), { encoding: "utf-8", mode: 0o640 });
  return state;
}

async function renderPackage(packageState: PackageState) {
  const decoder = decoderPath();
  const tables = descriptorTablesPath();
  if (!existsSync(/* turbopackIgnore: true */ decoder)) {
    throw new Error("Météo-France BUFR decoder is not built. Run radar-worker/build_meteofrance_decoder.sh.");
  }
  if (!existsSync(/* turbopackIgnore: true */ tables)) {
    throw new Error("Météo-France BUFR descriptor tables are missing.");
  }

  const script = path.join(process.cwd(), "radar-worker", "render_meteofrance.py");
  const args = [
    script,
    "--package",
    packageState.packagePath,
    "--output-root",
    METEOFRANCE_FRAME_ROOT,
    "--decoder",
    decoder,
    "--tables",
    tables,
  ];
  const errors: string[] = [];
  for (const candidate of pythonCandidates()) {
    try {
      const result = await runPython(candidate, args);
      const lastLine = result.stdout.trim().split(/\r?\n/).at(-1);
      const payload = lastLine ? (JSON.parse(lastLine) as { ok?: boolean }) : null;
      if (!payload?.ok) throw new Error("Météo-France renderer returned an invalid result.");
      if (result.stderr.trim()) {
        logRadarEvent("info", "meteofrance_renderer_note", { note: result.stderr.trim().slice(0, 1200) });
      }
      return;
    } catch (error) {
      errors.push(`${candidate}: ${publicError(error)}`);
      if (process.env.PYTHON_BIN?.trim()) break;
    }
  }
  throw new Error(`Unable to render Météo-France BUFR. ${errors.join(" | ")}`);
}

function metadataToFrame(metadata: MeteoFranceFrameMetadata): MeteoFrancePreparedFrame | null {
  const timestamp = normalizeTimestamp(metadata.timestamp);
  const bounds = metadata.geographicBounds;
  if (
    !timestamp ||
    metadata.provider !== "Météo-France" ||
    metadata.renderVersion !== "meteofrance-v3" ||
    metadata.quantity !== "DBZH" ||
    metadata.tileReady !== true ||
    !Array.isArray(bounds) ||
    bounds.length !== 4 ||
    !bounds.every(Number.isFinite)
  )
    return null;

  const sourceGridPath = path.resolve(/* turbopackIgnore: true */ metadata.sourceGridPath);
  return {
    provider: "Météo-France",
    attribution: "Source : Météo-France",
    timestamp,
    sourceGridPath,
    coverage: { west: bounds[0], south: bounds[1], east: bounds[2], north: bounds[3] },
    metadata: { ...metadata, timestamp, sourceGridPath },
  };
}

export async function getCachedMeteoFranceFrame(timestamp: string): Promise<MeteoFrancePreparedFrame | null> {
  const normalized = normalizeTimestamp(timestamp);
  if (!normalized) return null;
  const key = normalized.replace(/[-:]/g, "").replace("T", "-").replace("Z", "");
  try {
    const metadata = JSON.parse(
      await readFile(path.join(METEOFRANCE_FRAME_ROOT, key, "metadata.json"), "utf-8"),
    ) as MeteoFranceFrameMetadata;
    const frame = metadataToFrame(metadata);
    if (
      !frame ||
      !(await stat(/* turbopackIgnore: true */ frame.sourceGridPath)
        .then(() => true)
        .catch(() => false))
    )
      return null;
    return frame;
  } catch {
    return null;
  }
}

export async function listCachedMeteoFranceFrames(): Promise<MeteoFrancePreparedFrame[]> {
  const entries = await readdir(METEOFRANCE_FRAME_ROOT, { withFileTypes: true }).catch(() => []);
  const frames = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map(async (entry) => {
        try {
          const metadata = JSON.parse(
            await readFile(path.join(METEOFRANCE_FRAME_ROOT, entry.name, "metadata.json"), "utf-8"),
          ) as MeteoFranceFrameMetadata;
          const frame = metadataToFrame(metadata);
          if (
            !frame ||
            !(await stat(/* turbopackIgnore: true */ frame.sourceGridPath)
              .then(() => true)
              .catch(() => false))
          )
            return null;
          return frame;
        } catch {
          return null;
        }
      }),
  );
  return frames
    .filter((frame): frame is MeteoFrancePreparedFrame => frame !== null)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

async function prunePackages() {
  const entries = await readdir(METEOFRANCE_PACKAGE_ROOT, { withFileTypes: true }).catch(() => []);
  const packages = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".tar.gz"))
      .map(async (entry) => ({
        path: path.join(METEOFRANCE_PACKAGE_ROOT, entry.name),
        stats: await stat(path.join(METEOFRANCE_PACKAGE_ROOT, entry.name)),
      })),
  );
  packages.sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs);
  await Promise.all(packages.slice(MAX_KEPT_PACKAGES).map((item) => rm(item.path, { force: true })));
}

async function pruneFrames() {
  const frames = await listCachedMeteoFranceFrames();
  const stale = frames.slice(0, Math.max(0, frames.length - MAX_KEPT_FRAMES));
  await Promise.all(
    stale.map((frame) => {
      const key = frame.timestamp.replace(/[-:]/g, "").replace("T", "-").replace("Z", "");
      return rm(path.join(METEOFRANCE_FRAME_ROOT, key), { recursive: true, force: true });
    }),
  );
}

async function ingestLatestPackage(): Promise<MeteoFranceIngestResult> {
  const startedAt = Date.now();
  try {
    const packageState = await downloadLatestPackage();
    await renderPackage(packageState);
    await prunePackages();
    await pruneFrames();
    const frames = await listCachedMeteoFranceFrames();
    const result: MeteoFranceIngestResult = {
      ok: frames.length > 0,
      provider: "Météo-France",
      product: "DBZH",
      packageTimestamp: packageState.packageTimestamp,
      downloadedAt: packageState.downloadedAt,
      availableCount: frames.length,
      latestTimestamp: frames.at(-1)?.timestamp ?? null,
      frames,
      durationMs: Date.now() - startedAt,
      error: frames.length ? null : "No Météo-France mainland reflectivity frame is ready.",
    };
    logRadarEvent("info", "meteofrance_ingest_finished", {
      durationMs: result.durationMs,
      framesReady: frames.length,
      latestTimestamp: result.latestTimestamp,
      packageTimestamp: result.packageTimestamp,
    });
    return result;
  } catch (error) {
    const cachedFrames = await listCachedMeteoFranceFrames();
    const message = publicError(error);
    logRadarEvent("warn", "meteofrance_ingest_failed", { error: message, cachedFrames: cachedFrames.length });
    return {
      ok: false,
      provider: "Météo-France",
      product: "DBZH",
      packageTimestamp: null,
      downloadedAt: null,
      availableCount: cachedFrames.length,
      latestTimestamp: cachedFrames.at(-1)?.timestamp ?? null,
      frames: cachedFrames,
      durationMs: Date.now() - startedAt,
      error: message,
    };
  }
}

export function prepareMeteoFranceRadarFrames() {
  ingestInFlight ??= ingestLatestPackage().finally(() => {
    ingestInFlight = null;
  });
  return ingestInFlight;
}
