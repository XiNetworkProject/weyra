import "server-only";

import { NextResponse } from "next/server";
import { logObservationServiceError, ObservationServiceError } from "@/lib/server/observations";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

export function observationSuccessResponse(data: Record<string, unknown>, status = 200) {
  return NextResponse.json({ ok: true, ...data }, { status, headers: NO_STORE_HEADERS });
}

export function observationErrorResponse(event: string, error: unknown) {
  if (error instanceof ObservationServiceError) {
    if (error.status >= 500) logObservationServiceError(event, error);
    return NextResponse.json(
      {
        ok: false,
        error: error.code,
        issues: error.issues,
      },
      {
        status: error.status,
        headers: NO_STORE_HEADERS,
      },
    );
  }

  logObservationServiceError(event, error);
  return NextResponse.json(
    { ok: false, error: "internal_error", issues: [] },
    {
      status: 500,
      headers: NO_STORE_HEADERS,
    },
  );
}
