import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import { getCachedRenderedOperaFrame, normalizeOperaTimestamp } from "@/lib/server/opera-render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{ timestamp: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { timestamp } = await context.params;
  const normalizedTimestamp = normalizeOperaTimestamp(timestamp);

  if (!normalizedTimestamp) {
    return NextResponse.json({ ok: false, error: "Invalid OPERA radar timestamp." }, { status: 400 });
  }

  const frame = await getCachedRenderedOperaFrame(normalizedTimestamp);

  if (!frame) {
    return NextResponse.json({ ok: false, error: "OPERA radar frame is not ready in the local cache." }, { status: 404 });
  }

  const image = await readFile(frame.imagePath);

  return new Response(new Uint8Array(image), {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, max-age=300",
      "X-Weyra-Radar-Provider": "EUMETNET-OPERA",
      "X-Weyra-Radar-Product": "DBZH",
      "X-Weyra-Radar-Timestamp": normalizedTimestamp,
    },
  });
}
