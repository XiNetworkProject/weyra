import "server-only";

import { mkdir, readFile, rename, rm, writeFile } from "fs/promises";
import path from "path";
import type { RadarMaintenanceState, RadarWorkerState } from "@/lib/radar-health";
import { RADAR_CACHE_ROOT } from "@/lib/server/radar-config";

const STATUS_ROOT = path.join(RADAR_CACHE_ROOT, "status");
const WORKER_STATUS_PATH = path.join(STATUS_ROOT, "worker.json");
const MAINTENANCE_STATUS_PATH = path.join(STATUS_ROOT, "maintenance.json");

async function readStatus<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

async function writeStatus(filePath: string, value: unknown) {
  await mkdir(STATUS_ROOT, { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(value, null, 2), { encoding: "utf-8", mode: 0o640 });
  try {
    await rename(temporaryPath, filePath);
  } catch {
    await rm(filePath, { force: true }).catch(() => undefined);
    await rename(temporaryPath, filePath);
  }
}

export function readRadarWorkerState() {
  return readStatus<RadarWorkerState>(WORKER_STATUS_PATH);
}

export function writeRadarWorkerState(state: RadarWorkerState) {
  return writeStatus(WORKER_STATUS_PATH, state);
}

export function readRadarMaintenanceState() {
  return readStatus<RadarMaintenanceState>(MAINTENANCE_STATUS_PATH);
}

export function writeRadarMaintenanceState(state: RadarMaintenanceState) {
  return writeStatus(MAINTENANCE_STATUS_PATH, state);
}
