import { NextResponse } from "next/server";
import { renderLatestOperaFrame } from "@/lib/server/opera-render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const frame = await renderLatestOperaFrame();

    return NextResponse.json({
      ok: true,
      provider: "EUMETNET OPERA",
      product: "DBZH",
      timestamp: frame.metadata.timestamp ?? frame.timestamp,
      image: {
        contentType: "image/webp",
        route: "/api/radar/opera/render/latest",
      },
      metadata: frame.metadata,
    }, {
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
