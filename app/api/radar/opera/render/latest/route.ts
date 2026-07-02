import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import { renderLatestOperaFrame } from "@/lib/server/opera-render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const frame = await renderLatestOperaFrame();
    const image = await readFile(frame.imagePath);

    return new Response(new Uint8Array(image), {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "no-store, max-age=0",
        "X-Weyra-Radar-Timestamp": frame.metadata.timestamp ?? frame.timestamp,
        "X-Weyra-Radar-Provider": "EUMETNET-OPERA",
        "X-Weyra-Radar-Product": "DBZH",
      },
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to render OPERA radar image.",
    }, { status: 500 });
  }
}
