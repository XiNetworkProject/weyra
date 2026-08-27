import { NextResponse } from "next/server";
import { getPersistedScanPackMaintenanceStatus, listReadyScanPacks } from "@/lib/server/opera-packs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Lists published scan packs. Pure disk read: no Python, no MeteoGate, no tile generation.
export async function GET() {
  const [packs, maintenance] = await Promise.all([listReadyScanPacks(), getPersistedScanPackMaintenanceStatus()]);
  const latestPack = packs.at(-1) ?? null;
  const providers = [...new Set(packs.map((pack) => pack.provider))];

  return NextResponse.json(
    {
      ok: true,
      provider: latestPack?.provider ?? "Weyra Radar",
      providers,
      attribution: latestPack?.attribution ?? null,
      product: "DBZH",
      packs,
      maintenance,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
