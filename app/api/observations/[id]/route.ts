import { observationErrorResponse, observationSuccessResponse } from "@/lib/server/observation-response";
import { deleteObservationById } from "@/lib/server/observations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const result = await deleteObservationById(decodeURIComponent(id));
    return observationSuccessResponse({ observation: result });
  } catch (error) {
    return observationErrorResponse("observation_delete_failed", error);
  }
}
