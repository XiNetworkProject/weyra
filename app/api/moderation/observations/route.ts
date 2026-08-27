import { observationErrorResponse, observationSuccessResponse } from "@/lib/server/observation-response";
import { listPendingObservations } from "@/lib/server/observations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const observations = await listPendingObservations(url.searchParams.get("limit"));
    return observationSuccessResponse({ observations });
  } catch (error) {
    return observationErrorResponse("observation_moderation_queue_failed", error);
  }
}
