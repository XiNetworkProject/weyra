import "server-only";

import { spawn } from "child_process";
import { createHash } from "crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { getLatestOperaComposite, type MeteoGateDataLink } from "@/lib/server/meteogate";

const RENDER_TIMEOUT_MS = 120_000;
const DOWNLOAD_TIMEOUT_MS = 90_000;
const CACHE_DIR = path.join(tmpdir(), "weyra-opera-render-cache");
const METEOGATE_HOST = "api.meteogate.eu";

type RenderMetadata = {
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
  bbox: { west: number; south: number; east: number; north: number } | null;
  hasGeoreferencing: boolean;
  renderedAt: string;
  warning: string | null;
  hdf5DataPath?: string;
};

export type OperaRenderedFrame = {
  timestamp: string;
  imagePath: string;
  metadataPath: string;
  metadata: RenderMetadata;
};

type PythonRunResult = {
  stdout: string;
  stderr: string;
};

const inFlight = new Map<string, Promise<OperaRenderedFrame>>();

function cacheKey(timestamp: string) {
  return timestamp.replace(/[^0-9A-Za-z_-]/g, "");
}

function safeHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
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
  const key = cacheKey(timestamp);
  const imagePath = path.join(CACHE_DIR, `${key}.webp`);
  const metadataPath = path.join(CACHE_DIR, `${key}.json`);

  try {
    await Promise.all([stat(imagePath), stat(metadataPath)]);
    const metadata = JSON.parse(await readFile(metadataPath, "utf-8")) as RenderMetadata;
    return { timestamp, imagePath, metadataPath, metadata };
  } catch {
    return null;
  }
}

async function readNewestCachedFrame(): Promise<OperaRenderedFrame | null> {
  try {
    const entries = await readdir(CACHE_DIR);
    const metadataFiles = entries.filter((entry) => entry.endsWith(".json"));
    const candidates = await Promise.all(metadataFiles.map(async (entry) => {
      const metadataPath = path.join(CACHE_DIR, entry);
      const stats = await stat(metadataPath);
      return { metadataPath, stats };
    }));

    candidates.sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs);

    for (const candidate of candidates) {
      try {
        const metadata = JSON.parse(await readFile(candidate.metadataPath, "utf-8")) as RenderMetadata;
        const timestamp = metadata.timestamp;
        if (!timestamp) continue;

        const imagePath = path.join(CACHE_DIR, `${cacheKey(timestamp)}.webp`);
        await stat(imagePath);
        return { timestamp, imagePath, metadataPath: candidate.metadataPath, metadata };
      } catch {
        // Try the next cache entry.
      }
    }
  } catch {
    return null;
  }

  return null;
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

    await mkdir(CACHE_DIR, { recursive: true });
    const hdf5Path = path.join(CACHE_DIR, `${cacheKey(timestamp)}-${safeHash(link.href)}.h5`);
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

  return ["python", "py"];
}

function runPython(command: string, args: string[]) {
  return new Promise<PythonRunResult>((resolve, reject) => {
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
      reject(new Error(`Python renderer timed out after ${RENDER_TIMEOUT_MS / 1000}s.`));
    }, RENDER_TIMEOUT_MS);

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

async function runRenderer(hdf5Path: string, outputPath: string, metadataPath: string) {
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
    bbox: metadata.bbox,
    hasGeoreferencing: metadata.hasGeoreferencing,
    renderedAt: metadata.renderedAt,
    warning: metadata.warning,
    hdf5DataPath: metadata.hdf5DataPath,
  };
}

async function renderFrame(timestamp: string, link: MeteoGateDataLink): Promise<OperaRenderedFrame> {
  const cached = await readCachedFrame(timestamp);
  if (cached) return cached;

  const key = cacheKey(timestamp);
  const imagePath = path.join(CACHE_DIR, `${key}.webp`);
  const metadataPath = path.join(CACHE_DIR, `${key}.json`);
  let hdf5Path: string | null = null;

  try {
    hdf5Path = await downloadHdf5(link, timestamp);
    await runRenderer(hdf5Path, imagePath, metadataPath);
    const metadata = stripPrivateMetadata(JSON.parse(await readFile(metadataPath, "utf-8")) as RenderMetadata);
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");
    return { timestamp, imagePath, metadataPath, metadata };
  } finally {
    if (hdf5Path) {
      await rm(hdf5Path, { force: true }).catch(() => undefined);
    }
  }
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

  const existing = inFlight.get(latest.latestTimestamp);
  if (existing) return existing;

  const pending = renderFrame(latest.latestTimestamp, link).finally(() => {
    inFlight.delete(latest.latestTimestamp as string);
  });
  inFlight.set(latest.latestTimestamp, pending);
  return pending;
}
