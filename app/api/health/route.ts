import { NextResponse } from "next/server";
import { getRadarOperationalHealthReport } from "@/lib/server/radar-health-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const radar = await getRadarOperationalHealthReport();
  const radarCacheWritable = !radar.reasons.includes("radar_cache_unavailable");

  return NextResponse.json(
    {
      ok: radarCacheWritable,
      status: radar.level,
      service: "weyra",
      release: process.env.WEYRA_RELEASE_SHA?.trim() || "development",
      runtime: process.version,
      radarCache: radarCacheWritable ? "writable" : "unavailable",
      radar,
      dataMode: "local",
      dataPlatform: {
        target: "weyra-self-hosted",
        database: "postgresql",
        connectionConfigured: Boolean(process.env.WEYRA_DATABASE_URL?.trim()),
        runtimeConnected: false,
      },
    },
    {
      status: radarCacheWritable ? 200 : 503,
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}
