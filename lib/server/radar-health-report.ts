import "server-only";

import { constants } from "fs";
import { access } from "fs/promises";
import { evaluateRadarHealth, type RadarHealthThresholds } from "@/lib/radar-health";
import { listReadyScanPacks } from "@/lib/server/opera-packs";
import { RADAR_CACHE_ROOT, readBoundedPositiveIntEnv } from "@/lib/server/radar-config";
import { readRadarMaintenanceState, readRadarWorkerState } from "@/lib/server/radar-health-store";

function healthThresholds(): RadarHealthThresholds {
  const degradedPackAgeSeconds = readBoundedPositiveIntEnv("WEYRA_RADAR_DEGRADED_AGE_SECONDS", 15 * 60, 24 * 60 * 60);
  const criticalPackAgeSeconds = Math.max(
    degradedPackAgeSeconds,
    readBoundedPositiveIntEnv("WEYRA_RADAR_CRITICAL_AGE_SECONDS", 30 * 60, 48 * 60 * 60),
  );
  const degradedSourceLagSeconds = readBoundedPositiveIntEnv("WEYRA_RADAR_DEGRADED_LAG_SECONDS", 10 * 60, 24 * 60 * 60);
  const criticalSourceLagSeconds = Math.max(
    degradedSourceLagSeconds,
    readBoundedPositiveIntEnv("WEYRA_RADAR_CRITICAL_LAG_SECONDS", 20 * 60, 48 * 60 * 60),
  );

  return {
    degradedPackAgeSeconds,
    criticalPackAgeSeconds,
    degradedSourceLagSeconds,
    criticalSourceLagSeconds,
    minimumWorkerHeartbeatGraceSeconds: readBoundedPositiveIntEnv(
      "WEYRA_RADAR_WORKER_HEARTBEAT_GRACE_SECONDS",
      5 * 60,
      60 * 60,
    ),
  };
}

export async function getRadarOperationalHealthReport(now = new Date()) {
  const [cacheWritable, packs, worker, maintenance] = await Promise.all([
    access(RADAR_CACHE_ROOT, constants.R_OK | constants.W_OK)
      .then(() => true)
      .catch(() => false),
    listReadyScanPacks(),
    readRadarWorkerState(),
    readRadarMaintenanceState(),
  ]);
  const newestPack = packs.at(-1) ?? null;
  const durations = packs
    .map((pack) => pack.buildDurationMs)
    .filter((duration): duration is number => Number.isFinite(duration));
  const averagePackBuildDurationMs =
    durations.length > 0 ? Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length) : null;

  return evaluateRadarHealth({
    now,
    cacheWritable,
    newestPackTimestamp: newestPack?.timestamp ?? maintenance?.newestPackTimestamp ?? null,
    newestPackPublishedAt: newestPack?.publishedAt ?? maintenance?.latestPackPublishedAt ?? null,
    newestPackProvider: newestPack?.provider ?? null,
    newestPackAttribution: newestPack?.attribution ?? null,
    newestPackCoverage: newestPack?.coverage ?? null,
    newestPackResolutionMeters: newestPack?.nativeResolutionMeters ?? null,
    latestSourceTimestamp: maintenance?.latestSourceTimestamp ?? null,
    worker,
    maintenance,
    averagePackBuildDurationMs,
    thresholds: healthThresholds(),
  });
}
