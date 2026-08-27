import { NextResponse } from "next/server";
import { getRadarOperationalHealthReport } from "@/lib/server/radar-health-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const report = await getRadarOperationalHealthReport();

  return NextResponse.json(report, {
    status: report.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
