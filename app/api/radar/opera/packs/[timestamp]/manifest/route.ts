import { NextResponse } from "next/server";
import { getScanPackManifest } from "@/lib/server/opera-packs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{ timestamp: string }>;
};

// Serves the published pack manifest. Pure disk read, no generation of any kind.
export async function GET(_request: Request, context: RouteContext) {
  const params = await context.params;
  const manifest = await getScanPackManifest(decodeURIComponent(params.timestamp));

  if (!manifest) {
    return NextResponse.json({ ok: false, error: "Scan pack not found." }, {
      status: 404,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }

  return NextResponse.json({ ok: true, ...manifest }, {
    headers: {
      "Cache-Control": manifest.status === "ready"
        ? "public, max-age=60, stale-while-revalidate=300"
        : "no-store, max-age=0",
    },
  });
}
