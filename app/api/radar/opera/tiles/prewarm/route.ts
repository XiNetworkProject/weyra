import { NextResponse } from "next/server";
import { OperaTileError, prewarmOperaTiles, type OperaTilePrewarmViewport } from "@/lib/server/opera-render";
import { mirrorPrewarmedDetailTilesIntoPacks } from "@/lib/server/opera-packs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function sanitizePrewarmError(error: unknown) {
  const raw = error instanceof Error ? error.message : "Unable to prewarm OPERA tiles.";
  return raw
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/s3:\/\/\S+/gi, "[redacted-url]")
    .replace(/[A-Za-z]:[\\/][^\s]+/g, "[redacted-path]")
    .slice(0, 1200);
}

function readViewport(value: unknown): OperaTilePrewarmViewport | null {
  if (!value || typeof value !== "object") return null;
  const viewport = value as Partial<OperaTilePrewarmViewport>;
  if (![viewport.west, viewport.south, viewport.east, viewport.north, viewport.zoom].every(Number.isFinite)) return null;
  return {
    west: viewport.west as number,
    south: viewport.south as number,
    east: viewport.east as number,
    north: viewport.north as number,
    zoom: viewport.zoom as number,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      timestamps?: unknown;
      viewport?: unknown;
      paddingTiles?: unknown;
      style?: unknown;
    };
    const timestamps = Array.isArray(body.timestamps)
      ? body.timestamps.filter((timestamp): timestamp is string => typeof timestamp === "string")
      : [];
    const viewport = readViewport(body.viewport);
    if (!viewport) {
      throw new OperaTileError("Invalid OPERA tile prewarm viewport.", 400);
    }

    const result = await prewarmOperaTiles({
      timestamps,
      viewport,
      paddingTiles: typeof body.paddingTiles === "number" ? body.paddingTiles : 1,
      style: typeof body.style === "string" ? body.style : "v3c",
    });

    // The pack detail route serves only files that already sit in the pack directory, so the
    // freshly prewarmed tiles must land there before the client is told they are ready.
    await mirrorPrewarmedDetailTilesIntoPacks(result);

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const status = error instanceof OperaTileError ? error.statusCode : 500;
    return NextResponse.json({
      ok: false,
      style: "v3c",
      timestamps: [],
      error: sanitizePrewarmError(error),
    }, {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }
}
