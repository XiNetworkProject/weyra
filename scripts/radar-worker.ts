import type { RadarHealthLevel, RadarWorkerState } from "../lib/radar-health";
import { getRadarOperationalHealthReport } from "../lib/server/radar-health-report";
import { writeRadarWorkerState } from "../lib/server/radar-health-store";
import { logRadarEvent, sendRadarHealthAlert } from "../lib/server/radar-observability";
import { getScanPackMaintenanceStatus, ensureRadarScanPacks } from "../lib/server/opera-packs";

const pollSeconds = Math.max(30, Math.min(600, Number(process.env.WEYRA_RADAR_POLL_SECONDS) || 90));
const release = process.env.WEYRA_RELEASE_SHA?.trim() || "development";
const startedAt = new Date().toISOString();
let stopping = false;
let previousHealthLevel: RadarHealthLevel | null = null;
let statusWrite = Promise.resolve();

const workerState: RadarWorkerState = {
  schemaVersion: 1,
  pid: process.pid,
  release,
  state: "starting",
  startedAt,
  heartbeatAt: startedAt,
  pollSeconds,
  lastCycleStartedAt: null,
  lastCycleFinishedAt: null,
  lastCycleDurationMs: null,
  lastError: null,
};

function sleep(delayMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

function persistWorkerState(patch: Partial<RadarWorkerState> = {}) {
  Object.assign(workerState, patch, { heartbeatAt: new Date().toISOString() });
  const snapshot = { ...workerState };
  statusWrite = statusWrite
    .then(() => writeRadarWorkerState(snapshot))
    .catch((error) => {
      logRadarEvent("warn", "worker_status_write_failed", {
        error: error instanceof Error ? error.message.slice(0, 400) : String(error).slice(0, 400),
      });
    });
  return statusWrite;
}

async function sleepWithHeartbeat(delayMs: number) {
  const deadline = Date.now() + delayMs;
  while (!stopping && Date.now() < deadline) {
    await sleep(Math.min(15_000, deadline - Date.now()));
    await persistWorkerState();
  }
}

function requestStop() {
  stopping = true;
  void persistWorkerState({ state: "stopping" });
}

process.on("SIGINT", requestStop);
process.on("SIGTERM", requestStop);

async function reportCycleHealth() {
  const report = await getRadarOperationalHealthReport();
  logRadarEvent(report.level === "healthy" ? "info" : "warn", "health_evaluated", {
    level: report.level,
    reasons: report.reasons,
    latestScan: report.latestScan.timestamp,
    scanAgeSeconds: report.latestScan.ageSeconds,
    sourceLagSeconds: report.source.lagToPublishedScanSeconds,
  });

  if (previousHealthLevel !== report.level) {
    if (previousHealthLevel !== null || report.level !== "healthy") {
      const sent = await sendRadarHealthAlert(report, previousHealthLevel);
      if (process.env.WEYRA_RADAR_ALERT_WEBHOOK_URL?.trim()) {
        logRadarEvent(sent ? "info" : "warn", sent ? "health_alert_sent" : "health_alert_failed", {
          previousLevel: previousHealthLevel,
          level: report.level,
        });
      }
    }
    previousHealthLevel = report.level;
  }
}

async function runMaintenanceCycle() {
  const cycleStartedAt = Date.now();
  const cycleStartedIso = new Date(cycleStartedAt).toISOString();
  await persistWorkerState({
    state: "running",
    lastCycleStartedAt: cycleStartedIso,
    lastError: null,
  });
  logRadarEvent("info", "maintenance_cycle_started", { pollSeconds });
  ensureRadarScanPacks();

  while (!stopping) {
    const snapshot = getScanPackMaintenanceStatus();
    await persistWorkerState();
    if (!snapshot.running) {
      const finishedAt = new Date().toISOString();
      const durationMs = Date.now() - cycleStartedAt;
      const lastError = snapshot.errors.length > 0 ? `${snapshot.errors.length} maintenance error(s)` : null;
      await persistWorkerState({
        state: "idle",
        lastCycleFinishedAt: finishedAt,
        lastCycleDurationMs: durationMs,
        lastError,
      });
      logRadarEvent(snapshot.errors.length > 0 ? "warn" : "info", "maintenance_cycle_finished", {
        durationMs,
        packsReady: snapshot.packsReady,
        errorCount: snapshot.errors.length,
        latestSourceTimestamp: snapshot.latestSourceTimestamp,
        newestPackTimestamp: snapshot.newestPackTimestamp,
      });
      await reportCycleHealth();
      return;
    }
    await sleep(5_000);
  }
}

async function main() {
  await persistWorkerState({ state: "idle" });
  logRadarEvent("info", "worker_started", { pollSeconds, release, pid: process.pid });
  while (!stopping) {
    await runMaintenanceCycle();
    if (!stopping) await sleepWithHeartbeat(pollSeconds * 1_000);
  }
  await persistWorkerState({ state: "stopping" });
  logRadarEvent("info", "worker_stopped", { pid: process.pid });
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  await persistWorkerState({ state: "failed", lastError: message.slice(0, 500) });
  logRadarEvent("error", "worker_fatal", { error: message.slice(0, 500) });
  process.exitCode = 1;
});
