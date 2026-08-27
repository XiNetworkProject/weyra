import "server-only";

import type { RadarHealthReport } from "@/lib/radar-health";

type RadarLogLevel = "info" | "warn" | "error";
type RadarLogFields = Record<string, string | number | boolean | null | string[]>;

export function logRadarEvent(level: RadarLogLevel, event: string, fields: RadarLogFields = {}) {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    service: "weyra-radar",
    level,
    event,
    ...fields,
  });

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export async function sendRadarHealthAlert(report: RadarHealthReport, previousLevel: string | null) {
  const webhookUrl = process.env.WEYRA_RADAR_ALERT_WEBHOOK_URL?.trim();
  if (!webhookUrl) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  const token = process.env.WEYRA_RADAR_ALERT_WEBHOOK_TOKEN?.trim();

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        event: "weyra.radar.health_changed",
        service: "weyra-radar",
        release: process.env.WEYRA_RELEASE_SHA?.trim() || "development",
        previousLevel,
        report,
      }),
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
