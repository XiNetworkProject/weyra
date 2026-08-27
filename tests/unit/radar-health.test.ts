import { describe, expect, it } from "vitest";
import {
  evaluateRadarHealth,
  secondsBetween,
  secondsSince,
  type RadarHealthInput,
  type RadarMaintenanceState,
  type RadarWorkerState,
} from "../../lib/radar-health";

const now = new Date("2026-08-25T01:00:00.000Z");

const worker: RadarWorkerState = {
  schemaVersion: 1,
  pid: 42,
  release: "test",
  state: "idle",
  startedAt: "2026-08-25T00:00:00.000Z",
  heartbeatAt: "2026-08-25T00:59:55.000Z",
  pollSeconds: 90,
  lastCycleStartedAt: "2026-08-25T00:55:00.000Z",
  lastCycleFinishedAt: "2026-08-25T00:58:00.000Z",
  lastCycleDurationMs: 180_000,
  lastError: null,
};

const maintenance: RadarMaintenanceState = {
  schemaVersion: 1,
  running: false,
  phase: "idle",
  startedAt: "2026-08-25T00:55:00.000Z",
  finishedAt: "2026-08-25T00:58:00.000Z",
  updatedAt: "2026-08-25T00:58:00.000Z",
  cycleDurationMs: 180_000,
  scansDetected: 12,
  packsReady: 16,
  building: [],
  errors: [],
  note: "test",
  latestSourceTimestamp: "2026-08-25T00:55:00.000Z",
  newestPackTimestamp: "2026-08-25T00:55:00.000Z",
  latestPackPublishedAt: "2026-08-25T00:58:00.000Z",
  lastPackBuildDurationMs: 98_000,
  lastSuccessfulPackAt: "2026-08-25T00:58:00.000Z",
};

function input(overrides: Partial<RadarHealthInput> = {}): RadarHealthInput {
  return {
    now,
    cacheWritable: true,
    newestPackTimestamp: "2026-08-25T00:55:00.000Z",
    newestPackPublishedAt: "2026-08-25T00:58:00.000Z",
    latestSourceTimestamp: "2026-08-25T00:55:00.000Z",
    worker,
    maintenance,
    averagePackBuildDurationMs: 96_000,
    ...overrides,
  };
}

describe("radar health", () => {
  it("reports a fresh synchronized pipeline as healthy", () => {
    const report = evaluateRadarHealth(input());
    expect(report.level).toBe("healthy");
    expect(report.ok).toBe(true);
    expect(report.latestScan.ageSeconds).toBe(300);
    expect(report.source.lagToPublishedScanSeconds).toBe(0);
    expect(report.worker.responsive).toBe(true);
  });

  it("reports a critically stale published scan", () => {
    const report = evaluateRadarHealth(
      input({
        newestPackTimestamp: "2026-08-24T17:45:00.000Z",
        latestSourceTimestamp: "2026-08-25T00:20:00.000Z",
      }),
    );
    expect(report.level).toBe("critical");
    expect(report.ok).toBe(false);
    expect(report.reasons).toContain("published_scan_critically_stale");
    expect(report.reasons).toContain("source_to_pack_lag_critical");
  });

  it("degrades when worker state is unavailable but the pack is fresh", () => {
    const report = evaluateRadarHealth(input({ worker: null }));
    expect(report.level).toBe("degraded");
    expect(report.reasons).toContain("worker_status_unknown");
  });

  it("marks an unavailable cache and missing pack as critical", () => {
    const report = evaluateRadarHealth(
      input({
        cacheWritable: false,
        newestPackTimestamp: null,
        newestPackPublishedAt: null,
      }),
    );
    expect(report.level).toBe("critical");
    expect(report.reasons).toContain("radar_cache_unavailable");
    expect(report.reasons).toContain("published_scan_missing");
  });

  it("detects stale heartbeat and maintenance errors", () => {
    const report = evaluateRadarHealth(
      input({
        worker: { ...worker, heartbeatAt: "2026-08-25T00:40:00.000Z" },
        maintenance: {
          ...maintenance,
          errors: [{ timestamp: "2026-08-25T00:50:00.000Z", error: "renderer failed" }],
        },
      }),
    );
    expect(report.level).toBe("degraded");
    expect(report.reasons).toContain("worker_heartbeat_stale");
    expect(report.reasons).toContain("maintenance_errors_present");
  });

  it("handles invalid and future timestamps safely", () => {
    expect(secondsSince("invalid", now.getTime())).toBeNull();
    expect(secondsSince("2026-08-25T01:05:00.000Z", now.getTime())).toBe(0);
    expect(secondsBetween(null, "2026-08-25T00:00:00.000Z")).toBeNull();
  });
});
