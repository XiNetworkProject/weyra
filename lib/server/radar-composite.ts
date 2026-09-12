import "server-only";
import { execFile } from "node:child_process";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { RadarPackSourceFrame } from "@/lib/radar-source-selection";
import type { OperaScanPackCoverage } from "@/lib/types";
import { RADAR_CACHE_ROOT } from "@/lib/server/radar-config";

const run = promisify(execFile);
const root = path.join(RADAR_CACHE_ROOT, "composites", "v1");
function directory(timestamp: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(timestamp)) throw new Error("Invalid composite timestamp.");
  return path.join(root, timestamp.replace(/[^\w-]/g, ""));
}

export async function getCachedRadarComposite(timestamp: string) {
  try {
    const dir = directory(timestamp);
    const metadata = JSON.parse(await readFile(path.join(dir, "metadata.json"), "utf8")) as {
      timestamp: string;
      coverage: OperaScanPackCoverage;
    };
    const sourceGridPath = path.join(dir, "source-grid.tif");
    if (metadata.timestamp !== timestamp || !(await stat(sourceGridPath)).size) return null;
    return { sourceGridPath, bounds: metadata.coverage, tileReady: true };
  } catch {
    return null;
  }
}

export async function prepareRadarComposite(frame: RadarPackSourceFrame) {
  if (!frame.fallback || frame.fallback.timestamp !== frame.timestamp)
    throw new Error("Radar sources must have identical observation times.");
  const cached = await getCachedRadarComposite(frame.timestamp);
  if (cached) return cached;
  const dir = directory(frame.timestamp);
  const staging = `${dir}-${process.pid}-${Date.now()}`;
  await mkdir(staging, { recursive: true });
  try {
    const { stdout } = await run(
      process.env.PYTHON_BIN?.trim() || "python3",
      [
        path.join(process.cwd(), "radar-worker", "compose_radar.py"),
        "--primary",
        frame.sourceGridPath,
        "--fallback",
        frame.fallback.sourceGridPath,
        "--output",
        path.join(staging, "source-grid.tif"),
        "--timestamp",
        frame.timestamp,
      ],
      { timeout: 180_000, maxBuffer: 64 * 1024, env: { ...process.env, GDAL_NUM_THREADS: "1" } },
    );
    const metadata = JSON.parse(stdout);
    await writeFile(path.join(staging, "metadata.json"), JSON.stringify(metadata));
    await rename(staging, dir);
    const result = await getCachedRadarComposite(frame.timestamp);
    if (!result) throw new Error("The radar composite was not published.");
    return result;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export async function removeRadarComposite(timestamp: string) {
  await rm(directory(timestamp), { recursive: true, force: true });
}
