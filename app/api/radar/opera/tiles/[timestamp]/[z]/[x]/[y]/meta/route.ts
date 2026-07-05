import { NextResponse } from "next/server";
import { getCachedOperaTile, OperaTileError } from "@/lib/server/opera-render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{ timestamp: string; z: string; x: string; y: string }>;
};

function sanitizeTileError(error: unknown) {
  const raw = error instanceof Error ? error.message : "Unable to read OPERA Web Mercator tile metadata.";
  return raw
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/s3:\/\/\S+/gi, "[redacted-url]")
    .slice(0, 1200);
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const request = _request;
    const url = new URL(request.url);
    const params = await context.params;
    const timestamp = decodeURIComponent(params.timestamp);
    const z = Number(params.z);
    const x = Number(params.x);
    const y = Number(params.y);
    const style = url.searchParams.get("style");
    const tile = await getCachedOperaTile({ timestamp, z, x, y, style });

    return NextResponse.json({
      ok: true,
      timestamp: tile.meta.timestamp,
      z: tile.meta.z,
      x: tile.meta.x,
      y: tile.meta.y,
      tileBounds3857: tile.meta.tileBounds3857,
      tileBounds4326: tile.meta.tileBounds4326,
      targetProjection: "EPSG:3857",
      resampling: tile.meta.resampling,
      resamplingDBZH: tile.meta.resamplingDBZH ?? null,
      resamplingAlpha: tile.meta.resamplingAlpha ?? null,
      displayVersion: tile.meta.displayVersion ?? "v3",
      thresholdDbzh: tile.meta.thresholdDbzh ?? null,
      gutterPixels: tile.meta.gutterPixels ?? null,
      strongEchoPreservationUsed: tile.meta.strongEchoPreservationUsed ?? false,
      sourceGridWidth: tile.meta.sourceGridWidth ?? null,
      sourceGridHeight: tile.meta.sourceGridHeight ?? null,
      sourceGridPixelSize: tile.meta.sourceGridPixelSize ?? null,
      sourceValidPixels: tile.meta.sourceValidPixels ?? null,
      validPixels: tile.meta.validPixels,
      transparentPixels: tile.meta.transparentPixels,
      cached: tile.cached,
    }, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Weyra-Tile-Cache": "hit",
      },
    });
  } catch (error) {
    const status = error instanceof OperaTileError ? error.statusCode : 500;
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
      },
    });
  }
}
