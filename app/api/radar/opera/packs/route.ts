import { NextResponse } from "next/server";
import { getScanPackMaintenanceStatus, listReadyScanPacks } from "@/lib/server/opera-packs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Lists published scan packs. Pure disk read: no Python, no MeteoGate, no tile generation.
export async function GET() {
  const packs = await listReadyScanPacks();

  return NextResponse.json({
    ok: true,
    provider: "EUMETNET OPERA",
    product: "DBZH",
    packs,
    maintenance: getScanPackMaintenanceStatus(),
  }, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
