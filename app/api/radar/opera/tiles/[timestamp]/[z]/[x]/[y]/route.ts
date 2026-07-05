import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import { getCachedOperaTile, OperaTileError } from "@/lib/server/opera-render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{ timestamp: string; z: string; x: string; y: string }>;
};

function sanitizeTileError(error: unknown) {
  const raw = error instanceof Error ? error.message : "Unable to render OPERA Web Mercator tile.";
  return raw
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/s3:\/\/\S+/gi, "[redacted-url]")
    .slice(0, 1200);
}

export async function GET(_request: Request, context: RouteContext) {
  const startedAt = Date.now();
  let tileLabel = "unknown";
  let styleLabel = "v3c";

  try {
    const request = _request;
    const url = new URL(request.url);
    const params = await context.params;
    const timestamp = decodeURIComponent(params.timestamp);
    const z = Number(params.z);
    const x = Number(params.x);
    const y = Number(params.y);
    const style = url.searchParams.get("style");
    styleLabel = style ?? styleLabel;
    tileLabel = `${timestamp}/${z}/${x}/${y}`;

    const tile = await getCachedOperaTile({ timestamp, z, x, y, style });
    const image = await readFile(tile.imagePath);
    const durationMs = Date.now() - startedAt;
    console.info(`[radar tile] cache-hit style=${tile.meta.displayVersion ?? styleLabel} tile=${tileLabel} dur=${durationMs}ms`);

    return new Response(new Uint8Array(image), {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Weyra-Radar-Provider": "EUMETNET-OPERA",
        "X-Weyra-Radar-Product": "DBZH",
        "X-Weyra-Radar-Timestamp": tile.meta.timestamp,
        "X-Weyra-Radar-Projection": "EPSG-3857",
        "X-Weyra-Tile-Cache": "hit",
        "X-Weyra-Radar-Tile-Style": tile.meta.displayVersion ?? "v3",
        "Server-Timing": `weyra-tile;dur=${durationMs}`,
      },
    });
  } catch (error) {
    const status = error instanceof OperaTileError ? error.statusCode : 500;
    const durationMs = Date.now() - startedAt;
    console.warn(`[radar tile] CACHE-MISS style=${styleLabel} tile=${tileLabel} status=${status} dur=${durationMs}ms`);
    return NextResponse.json({
      ok: false,
      provider: "EUMETNET OPERA",
      product: "DBZH",
      error: sanitizeTileError(error),
    }, {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Weyra-Tile-Cache": "miss",
        "X-Weyra-Radar-Projection": "EPSG-3857",
        "Server-Timing": `weyra-tile;dur=${durationMs}`,
      },
    });
  }
}
