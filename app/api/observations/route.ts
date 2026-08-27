import { observationErrorResponse, observationSuccessResponse } from "@/lib/server/observation-response";
import { createObservationFromRequest } from "@/lib/server/observations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const observation = await createObservationFromRequest(request);
    return observationSuccessResponse({ observation }, 201);
  } catch (error) {
    return observationErrorResponse("observation_create_failed", error);
  }
}
