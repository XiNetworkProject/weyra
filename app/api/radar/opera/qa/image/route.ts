import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import { getOperaQaImagePath } from "@/lib/server/opera-render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function sanitizeQaError(error: unknown) {
  const raw = error instanceof Error ? error.message : "Unable to read OPERA QA image.";
  return raw
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/s3:\/\/\S+/gi, "[redacted-url]")
    .slice(0, 1200);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind");
    const timestamp = url.searchParams.get("ts");

    if (kind !== "native" && kind !== "current") {
      return NextResponse.json({ ok: false, error: "Invalid OPERA QA image kind." }, { status: 400 });
    }

    if (!timestamp) {
      return NextResponse.json({ ok: false, error: "Missing OPERA QA timestamp." }, { status: 400 });
    }

    const imagePath = await getOperaQaImagePath(kind, timestamp);
    const image = await readFile(imagePath);

    return new Response(new Uint8Array(image), {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "no-store, max-age=0",
        "X-Weyra-Radar-Provider": "EUMETNET-OPERA",
        "X-Weyra-Radar-Product": "DBZH",
        "X-Weyra-Radar-QA-Kind": kind,
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
