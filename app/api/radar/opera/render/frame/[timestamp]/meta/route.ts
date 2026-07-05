import { NextResponse } from "next/server";
import { getCachedRenderedOperaMeta, normalizeOperaTimestamp } from "@/lib/server/opera-render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{ timestamp: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { timestamp } = await context.params;
  const normalizedTimestamp = normalizeOperaTimestamp(timestamp);

  if (!normalizedTimestamp) {
    return NextResponse.json({ ok: false, error: "Invalid OPERA radar timestamp." }, { status: 400 });
  }

  const meta = await getCachedRenderedOperaMeta(normalizedTimestamp);

  if (!meta) {
    return NextResponse.json({ ok: false, error: "OPERA radar frame metadata is not ready in the local cache." }, { status: 404 });
  }

  return NextResponse.json(meta, {
    headers: {
      "Cache-Control": "private, max-age=300",
    },
  });
}
