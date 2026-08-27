import { observationErrorResponse, observationSuccessResponse } from "@/lib/server/observation-response";
import { reportObservationById } from "@/lib/server/observations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const report = await reportObservationById(decodeURIComponent(id), request);
    return observationSuccessResponse({ report }, 201);
  } catch (error) {
    return observationErrorResponse("observation_report_failed", error);
  }
}
