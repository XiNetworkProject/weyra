export type RadarHealthLevel = "healthy" | "degraded" | "critical";

export type RadarWorkerState = {
  schemaVersion: 1;
  pid: number;
  release: string;
  state: "starting" | "running" | "idle" | "stopping" | "failed";
  startedAt: string;
  heartbeatAt: string;
  pollSeconds: number;
  lastCycleStartedAt: string | null;
  lastCycleFinishedAt: string | null;
  lastCycleDurationMs: number | null;
  lastError: string | null;
};

export type RadarMaintenancePhase =
  | "idle"
  | "cached-live"
  | "discovering"
  | "publishing-live"
  | "rendering-history"
  | "publishing-history"
  | "pruning"
  | "failed";

export type RadarMaintenanceState = {
  schemaVersion: 1;
  running: boolean;
  phase: RadarMaintenancePhase;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
  cycleDurationMs: number | null;
  scansDetected: number;
  packsReady: number;
  building: string[];
  errors: Array<{ timestamp: string; error: string }>;
  note: string;
  latestSourceTimestamp: string | null;
  newestPackTimestamp: string | null;
  latestPackPublishedAt: string | null;
  lastPackBuildDurationMs: number | null;
  lastSuccessfulPackAt: string | null;
};

export type RadarHealthThresholds = {
  degradedPackAgeSeconds: number;
  criticalPackAgeSeconds: number;
  degradedSourceLagSeconds: number;
  criticalSourceLagSeconds: number;
  minimumWorkerHeartbeatGraceSeconds: number;
};

export const DEFAULT_RADAR_HEALTH_THRESHOLDS: RadarHealthThresholds = {
  degradedPackAgeSeconds: 15 * 60,
  criticalPackAgeSeconds: 30 * 60,
  degradedSourceLagSeconds: 10 * 60,
  criticalSourceLagSeconds: 20 * 60,
  minimumWorkerHeartbeatGraceSeconds: 5 * 60,
};

export type RadarHealthInput = {
  now?: Date;
  cacheWritable: boolean;
  newestPackTimestamp: string | null;
  newestPackPublishedAt: string | null;
  newestPackProvider?: "Météo-France" | "EUMETNET OPERA" | "Météo-France + OPERA" | null;
  newestPackAttribution?: string | null;
  newestPackCoverage?: { west: number; south: number; east: number; north: number } | null;
  newestPackResolutionMeters?: number | null;
  latestSourceTimestamp: string | null;
  worker: RadarWorkerState | null;
  maintenance: RadarMaintenanceState | null;
  averagePackBuildDurationMs: number | null;
  thresholds?: Partial<RadarHealthThresholds>;
};

export type RadarHealthReport = {
  ok: boolean;
  level: RadarHealthLevel;
  reasons: string[];
  checkedAt: string;
  latestScan: {
    timestamp: string | null;
    publishedAt: string | null;
    ageSeconds: number | null;
    provider: "Météo-France" | "EUMETNET OPERA" | "Météo-France + OPERA" | null;
    attribution: string | null;
    coverage: { west: number; south: number; east: number; north: number } | null;
    nativeResolutionMeters: number | null;
  };
  source: {
    latestTimestamp: string | null;
    ageSeconds: number | null;
    lagToPublishedScanSeconds: number | null;
  };
  worker: {
    state: RadarWorkerState["state"] | "unknown";
    heartbeatAt: string | null;
    heartbeatAgeSeconds: number | null;
    responsive: boolean;
    pollSeconds: number | null;
    lastCycleDurationMs: number | null;
  };
  generation: {
    phase: RadarMaintenancePhase | "unknown";
    running: boolean;
    building: string[];
    lastPackBuildDurationMs: number | null;
    averagePackBuildDurationMs: number | null;
    lastSuccessfulPackAt: string | null;
    errorCount: number;
  };
};

function parseTime(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function secondsSince(value: string | null | undefined, nowMs: number) {
  const parsed = parseTime(value);
  return parsed === null ? null : Math.max(0, Math.round((nowMs - parsed) / 1_000));
}

export function secondsBetween(newer: string | null | undefined, older: string | null | undefined) {
  const newerMs = parseTime(newer);
  const olderMs = parseTime(older);
  if (newerMs === null || olderMs === null) return null;
  return Math.max(0, Math.round((newerMs - olderMs) / 1_000));
}

export function evaluateRadarHealth(input: RadarHealthInput): RadarHealthReport {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const thresholds = { ...DEFAULT_RADAR_HEALTH_THRESHOLDS, ...input.thresholds };
  const packAgeSeconds = secondsSince(input.newestPackTimestamp, nowMs);
  const sourceAgeSeconds = secondsSince(input.latestSourceTimestamp, nowMs);
  const sourceLagSeconds = secondsBetween(input.latestSourceTimestamp, input.newestPackTimestamp);
  const heartbeatAgeSeconds = secondsSince(input.worker?.heartbeatAt, nowMs);
  const heartbeatGraceSeconds = Math.max(
    thresholds.minimumWorkerHeartbeatGraceSeconds,
    (input.worker?.pollSeconds ?? 90) * 3,
  );

  const rank: Record<RadarHealthLevel, number> = { healthy: 0, degraded: 1, critical: 2 };
  let severity = 0;
  const reasons: string[] = [];

  const flag = (requested: RadarHealthLevel, reason: string) => {
    severity = Math.max(severity, rank[requested]);
    reasons.push(reason);
  };

  if (!input.cacheWritable) flag("critical", "radar_cache_unavailable");

  if (packAgeSeconds === null) {
    flag("critical", "published_scan_missing");
  } else if (packAgeSeconds > thresholds.criticalPackAgeSeconds) {
    flag("critical", "published_scan_critically_stale");
  } else if (packAgeSeconds > thresholds.degradedPackAgeSeconds) {
    flag("degraded", "published_scan_stale");
  }

  if (input.latestSourceTimestamp === null) {
    flag("degraded", "source_timestamp_unknown");
  } else if (sourceAgeSeconds !== null && sourceAgeSeconds > thresholds.criticalPackAgeSeconds) {
    flag("degraded", "source_feed_stale");
  }

  if (sourceLagSeconds !== null && sourceLagSeconds > thresholds.criticalSourceLagSeconds) {
    flag("critical", "source_to_pack_lag_critical");
  } else if (sourceLagSeconds !== null && sourceLagSeconds > thresholds.degradedSourceLagSeconds) {
    flag("degraded", "source_to_pack_lag_high");
  }

  if (!input.worker) {
    flag("degraded", "worker_status_unknown");
  } else if (input.worker.state === "failed" || input.worker.state === "stopping") {
    flag("critical", `worker_${input.worker.state}`);
  } else if (heartbeatAgeSeconds === null || heartbeatAgeSeconds > heartbeatGraceSeconds) {
    flag(
      packAgeSeconds !== null && packAgeSeconds <= thresholds.degradedPackAgeSeconds ? "degraded" : "critical",
      "worker_heartbeat_stale",
    );
  }

  if ((input.maintenance?.errors.length ?? 0) > 0) {
    flag("degraded", "maintenance_errors_present");
  }

  const level: RadarHealthLevel = severity >= 2 ? "critical" : severity === 1 ? "degraded" : "healthy";

  return {
    ok: level !== "critical",
    level,
    reasons,
    checkedAt: now.toISOString(),
    latestScan: {
      timestamp: input.newestPackTimestamp,
      publishedAt: input.newestPackPublishedAt,
      ageSeconds: packAgeSeconds,
      provider: input.newestPackProvider ?? null,
      attribution: input.newestPackAttribution ?? null,
      coverage: input.newestPackCoverage ?? null,
      nativeResolutionMeters: input.newestPackResolutionMeters ?? null,
    },
    source: {
      latestTimestamp: input.latestSourceTimestamp,
      ageSeconds: sourceAgeSeconds,
      lagToPublishedScanSeconds: sourceLagSeconds,
    },
    worker: {
      state: input.worker?.state ?? "unknown",
      heartbeatAt: input.worker?.heartbeatAt ?? null,
      heartbeatAgeSeconds,
      responsive: Boolean(input.worker && heartbeatAgeSeconds !== null && heartbeatAgeSeconds <= heartbeatGraceSeconds),
      pollSeconds: input.worker?.pollSeconds ?? null,
      lastCycleDurationMs: input.worker?.lastCycleDurationMs ?? null,
    },
    generation: {
      phase: input.maintenance?.phase ?? "unknown",
      running: input.maintenance?.running ?? false,
      building: [...(input.maintenance?.building ?? [])],
      lastPackBuildDurationMs: input.maintenance?.lastPackBuildDurationMs ?? null,
      averagePackBuildDurationMs: input.averagePackBuildDurationMs,
      lastSuccessfulPackAt: input.maintenance?.lastSuccessfulPackAt ?? null,
      errorCount: input.maintenance?.errors.length ?? 0,
    },
  };
}
