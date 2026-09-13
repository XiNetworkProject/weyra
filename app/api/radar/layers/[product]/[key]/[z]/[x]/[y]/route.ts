import { readFile } from "node:fs/promises";
import path from "node:path";
import { isExtraRadarProduct } from "@/lib/radar-layers";
import { radarProviderHeader } from "@/lib/radar-source-selection";
import { RADAR_LAYERS_ROOT, readRadarLayerPack } from "@/lib/server/radar-layers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ product: string; key: string; z: string; x: string; y: string }> };
const missing = () =>
  Response.json({ ok: false, error: "Couche indisponible" }, { status: 404, headers: { "Cache-Control": "no-store" } });

// Published files only. Product and timestamp are part of the immutable URL.
export async function GET(_request: Request, context: Context) {
  const p = await context.params;
  const z = Number(p.z),
    x = Number(p.x),
    y = Number(p.y);
  if (
    !isExtraRadarProduct(p.product) ||
    ![z, x, y].every(Number.isInteger) ||
    z < 3 ||
    z > 8 ||
    x < 0 ||
    y < 0 ||
    x >= 2 ** z ||
    y >= 2 ** z
  )
    return missing();
  const pack = await readRadarLayerPack(p.product, p.key);
  if (!pack || z < pack.minZoom || z > pack.maxZoom) return missing();
  try {
    const bytes = await readFile(
      path.join(RADAR_LAYERS_ROOT, p.product, p.key, "tiles", String(z), String(x), `${y}.webp`),
    );
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Weyra-Radar-Provider": radarProviderHeader(pack.provider),
        "X-Weyra-Radar-Product": p.product,
        "X-Weyra-Radar-Unit": pack.unit,
      },
    });
  } catch {
    return missing();
  }
}
