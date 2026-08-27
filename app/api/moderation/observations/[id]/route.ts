import { observationErrorResponse, observationSuccessResponse } from "@/lib/server/observation-response";
import { moderateObservationById } from "@/lib/server/observations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const observation = await moderateObservationById(decodeURIComponent(id), request);
    return observationSuccessResponse({ observation });
  } catch (error) {
    return observationErrorResponse("observation_moderation_decision_failed", error);
  }
}
