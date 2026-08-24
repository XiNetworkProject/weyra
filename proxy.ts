import type { NextRequest } from "next/server";
import { refreshSupabaseSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return refreshSupabaseSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/radar|map-styles|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|pbf|woff2?)$).*)",
  ],
};
