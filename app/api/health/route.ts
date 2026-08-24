import { constants } from "fs";
import { access } from "fs/promises";
import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { RADAR_CACHE_ROOT } from "@/lib/server/radar-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const radarCacheWritable = await access(RADAR_CACHE_ROOT, constants.R_OK | constants.W_OK)
    .then(() => true)
    .catch(() => false);

  return NextResponse.json({
    ok: radarCacheWritable,
    service: "weyra",
    release: process.env.WEYRA_RELEASE_SHA?.trim() || "development",
    runtime: process.version,
    radarCache: radarCacheWritable ? "writable" : "unavailable",
    dataMode: isSupabaseConfigured() ? "supabase" : "local",
  }, {
    status: radarCacheWritable ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
