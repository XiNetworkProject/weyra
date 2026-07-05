import { NextResponse } from "next/server";
import { getOperaFramesManifest, prepareOperaFrames } from "@/lib/server/opera-render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseCount(value: string | null | undefined) {
  const parsed = Number(value ?? 12);
  if (!Number.isInteger(parsed) || parsed < 2 || parsed > 12) return null;
  return parsed;
}

function invalidCountResponse() {
  return NextResponse.json({
    ok: false,
    error: "count must be an integer between 2 and 12.",
  }, { status: 400 });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const count = parseCount(url.searchParams.get("count"));
  if (!count) return invalidCountResponse();

  const manifest = await getOperaFramesManifest(count);

  return NextResponse.json(manifest, {
    status: manifest.ok ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

export async function POST(request: Request) {
  let body: unknown = null;

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const count = parseCount(
    typeof body === "object" && body && "count" in body ? String(body.count) : undefined,
  );
  if (!count) return invalidCountResponse();

  const manifest = await prepareOperaFrames(count);

  return NextResponse.json(manifest, {
    status: manifest.ok ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
