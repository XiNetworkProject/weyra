import { NextResponse } from "next/server";
import { readRadarLayerCatalog } from "@/lib/server/radar-layers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readRadarLayerCatalog(), { headers: { "Cache-Control": "no-store" } });
}
