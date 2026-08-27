import { NextResponse } from "next/server";
import { listCachedMeteoFranceFrames } from "@/lib/server/meteofrance-radar-ingest";
import { getMeteoFranceRadarStatus } from "@/lib/server/meteofrance-radar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function responseStatus(ok: boolean, sourceStatus: number | null) {
  if (ok) return 200;
  if (sourceStatus === 401 || sourceStatus === 403 || sourceStatus === 429) return sourceStatus;
  if (sourceStatus !== null) return 502;
  return 503;
}

export async function GET() {
  const [result, frames] = await Promise.all([getMeteoFranceRadarStatus(), listCachedMeteoFranceFrames()]);
  const latestFrame = frames.at(-1) ?? null;

  return NextResponse.json(
    {
      ...result,
      product: "DBZH",
      format: "BUFR",
      attribution: "Source : Météo-France",
      cachedFramesReady: frames.length,
      latestTimestamp: latestFrame?.timestamp ?? null,
      nativeResolutionMeters: latestFrame?.metadata.nativeResolutionMeters ?? null,
      coverage: latestFrame?.coverage ?? null,
      displayFilter: latestFrame?.metadata.displayFilter ?? null,
      rainProbabilityThreshold: latestFrame?.metadata.rainProbabilityDisplayThreshold ?? null,
      rawReflectivityRetained: Boolean(latestFrame?.metadata.sourceGridRawPath),
    },
    {
      status: responseStatus(result.ok, result.sourceStatus.status),
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
