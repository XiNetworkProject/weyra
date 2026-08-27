import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      configured: false,
      retired: true,
      mode: "weyra-self-hosted",
      database: "not_connected",
      authenticated: false,
    },
    {
      status: 410,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
