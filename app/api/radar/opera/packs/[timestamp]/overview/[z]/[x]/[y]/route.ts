import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import {
  PACK_STYLE,
  PACK_OVERVIEW_ZOOM_MAX,
  PACK_OVERVIEW_ZOOM_MIN,
  getScanPackManifest,
  packOverviewTilePath,
} from "@/lib/server/opera-packs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{ timestamp: string; z: string; x: string; y: string }>;
};

// A fully transparent 256x256 lossless WebP (42 bytes). Served for the rare in-range overview
// tile that is not part of a published pack, so the base radar layer can never show a hole.
const TRANSPARENT_TILE = Buffer.from(
  "UklGRiIAAABXRUJQVlA4TBUAAAAv/8A/EAcQEREAUKT//ymi/6n//QcA",
  "base64",
);
const LEGACY_OVERVIEW_ZOOM_MAX = 7;

const IMMUTABLE_HEADERS = {
  "Content-Type": "image/webp",
  "Cache-Control": "public, max-age=31536000, immutable",
  "X-Weyra-Radar-Provider": "EUMETNET-OPERA",
  "X-Weyra-Radar-Product": "DBZH",
  "X-Weyra-Radar-Projection": "EPSG-3857",
  "X-Weyra-Radar-Style": PACK_STYLE,
  "X-Weyra-Radar-Pack-Layer": "overview",
} as const;

function notFound() {
  return NextResponse.json({ ok: false, error: "Overview tile not found." }, {
    status: 404,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

// Serves ONLY pre-generated WebP overview tiles from a published scan pack.
// Zero Python, zero rasterio, zero HDF5, zero MeteoGate, zero tile generation.
export async function GET(_request: Request, context: RouteContext) {
  const params = await context.params;
  const timestamp = decodeURIComponent(params.timestamp);
  const z = Number(params.z);
  const x = Number(params.x);
  const y = Number(params.y);

  if (![z, x, y].every(Number.isInteger) || z < PACK_OVERVIEW_ZOOM_MIN || z > Math.max(PACK_OVERVIEW_ZOOM_MAX, LEGACY_OVERVIEW_ZOOM_MAX)) {
    return notFound();
  }
  const limit = 2 ** z;
  if (x < 0 || y < 0 || x >= limit || y >= limit) {
    return notFound();
  }

  try {
    const image = await readFile(packOverviewTilePath(timestamp, z, x, y));
    return new Response(new Uint8Array(image), {
      status: 200,
      headers: { ...IMMUTABLE_HEADERS, "X-Weyra-Tile-Cache": "pack-hit" },
    });
  } catch {
    // In-range miss: only answer transparently for a genuinely published pack, so a published
    // overview never shows a hole while unpublished timestamps keep returning a fast 404.
    const manifest = await getScanPackManifest(timestamp);
    if (manifest?.status === "ready" && z <= manifest.baseZoomMax) {
      return new Response(new Uint8Array(TRANSPARENT_TILE), {
        status: 200,
        headers: { ...IMMUTABLE_HEADERS, "X-Weyra-Tile-Cache": "pack-transparent" },
      });
    }
    return notFound();
  }
}
