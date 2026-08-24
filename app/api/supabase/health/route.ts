import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({
      ok: true,
      configured: false,
      mode: "local",
      database: "not_configured",
      authenticated: false,
    });
  }

  const [claimsResult, databaseResult] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
  ]);
  const databaseReachable = !databaseResult.error;

  return NextResponse.json({
    ok: databaseReachable,
    configured: true,
    mode: "supabase",
    database: databaseReachable ? "reachable" : "unavailable",
    authenticated: Boolean(claimsResult.data?.claims?.sub),
    errorCode: databaseResult.error?.code ?? null,
  }, {
    status: databaseReachable ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
