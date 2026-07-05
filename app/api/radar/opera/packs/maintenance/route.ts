import { NextResponse } from "next/server";
import { ensureRadarScanPacks } from "@/lib/server/opera-packs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Local maintenance trigger: kicks the scan-pack builder in the background and returns
// immediately. In production the same ensureRadarScanPacks() must run in a permanent
// worker/cron instead of relying on this route or on any browser.
export async function POST() {
  const snapshot = ensureRadarScanPacks();

  return NextResponse.json({ ok: true, maintenance: snapshot }, {
    status: 202,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
