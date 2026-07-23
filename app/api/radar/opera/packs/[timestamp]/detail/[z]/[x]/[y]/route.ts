import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import { operaCachedTileImagePath } from "@/lib/server/opera-render";
import {
  PACK_DETAIL_ZOOM_MAX,
  PACK_DETAIL_ZOOM_MIN,
  PACK_STYLE,
  packDetailTilePath,
} from "@/lib/server/opera-packs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{ timestamp: string; z: string; x: string; y: string }>;
};

function notFound() {
  // Fast 404 with zero processing: MapLibre keeps the overview layer underneath, so a missing
  // detail tile is invisible. The tile appears on a later request once the prewarm produced it.
  return NextResponse.json({ ok: false, error: "Detail tile is not generated yet." }, {
    status: 404,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

// Serves ONLY pre-generated WebP detail tiles (z8..z11) produced by the background prewarm.
// Zero Python, zero rasterio, zero HDF5, zero MeteoGate, zero tile generation.
export async function GET(_request: Request, context: RouteContext) {
  const params = await context.params;
  const timestamp = decodeURIComponent(params.timestamp);
  const z = Number(params.z);
  const x = Number(params.x);
  const y = Number(params.y);

  if (![z, x, y].every(Number.isInteger) || z < PACK_DETAIL_ZOOM_MIN || z > PACK_DETAIL_ZOOM_MAX) {
    return notFound();
  }
  const limit = 2 ** z;
  if (x < 0 || y < 0 || x >= limit || y >= limit) {
    return notFound();
  }

  try {
    // Primary storage: the scan pack itself (packs/v3/<ts>/detail/z/x/y.webp). The shared tile
    // cache stays as a read-only fallback for tiles prewarmed before the pack was published.
    const image = await readFile(packDetailTilePath(timestamp, z, x, y)).catch(() => (
      readFile(operaCachedTileImagePath(timestamp, z, x, y, PACK_STYLE))
    ));
    return new Response(new Uint8Array(image), {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Weyra-Radar-Provider": "EUMETNET-OPERA",
        "X-Weyra-Radar-Product": "DBZH",
        "X-Weyra-Radar-Projection": "EPSG-3857",
        "X-Weyra-Radar-Style": PACK_STYLE,
        "X-Weyra-Radar-Pack-Layer": "detail",
        "X-Weyra-Tile-Cache": "pack-hit",
      },
    });
  } catch {
    return notFound();
  }
}
