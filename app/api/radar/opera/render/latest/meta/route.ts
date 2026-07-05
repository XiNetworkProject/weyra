import { NextResponse } from "next/server";
import { getLatestRenderedOperaMeta } from "@/lib/server/opera-render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const meta = await getLatestRenderedOperaMeta();

    return NextResponse.json(meta, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      provider: "EUMETNET OPERA",
      product: "DBZH",
      error: error instanceof Error ? error.message : "Unable to render OPERA radar metadata.",
    }, { status: 500 });
  }
}
