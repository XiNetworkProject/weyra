import { NextResponse } from "next/server";
import { getLatestOperaQaReport } from "@/lib/server/opera-render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function sanitizeQaError(error: unknown) {
  const raw = error instanceof Error ? error.message : "Unable to generate OPERA QA diagnostics.";
  return raw
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/s3:\/\/\S+/gi, "[redacted-url]")
    .slice(0, 1200);
}

export async function GET() {
  try {
    const report = await getLatestOperaQaReport();

    return NextResponse.json(report, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      provider: "EUMETNET OPERA",
      product: "DBZH",
      error: sanitizeQaError(error),
    }, { status: 500 });
  }
}
