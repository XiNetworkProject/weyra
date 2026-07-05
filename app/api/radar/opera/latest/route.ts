import { NextResponse } from "next/server";
import { getLatestOperaComposite } from "@/lib/server/meteogate";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function statusFromResult(ok: boolean, sourceStatus: number | null) {
  if (ok) return 200;
  if (sourceStatus === 204) return 404;
  if (sourceStatus === 401 || sourceStatus === 403 || sourceStatus === 429) return sourceStatus;
  if (sourceStatus && sourceStatus >= 400) return 502;
  return 503;
}

export async function GET() {
  const result = await getLatestOperaComposite();
  const publicResult = {
    ...result,
    dataLinks: result.dataLinks.map(({ href: _href, ...link }) => ({
      ...link,
      href: "server-only",
    })),
  };

  return NextResponse.json(publicResult, {
    status: statusFromResult(result.ok, result.sourceStatus.status),
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
