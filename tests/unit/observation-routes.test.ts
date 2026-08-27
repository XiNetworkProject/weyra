import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  delete: vi.fn(),
  listModeration: vi.fn(),
  moderate: vi.fn(),
  report: vi.fn(),
  log: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/observations", () => {
  class ObservationServiceError extends Error {
    constructor(
      readonly code: string,
      readonly status: number,
      readonly issues: string[] = [],
      readonly providerCode: string | null = null,
    ) {
      super(code);
    }
  }

  return {
    ObservationServiceError,
    createObservationFromRequest: mocks.create,
    deleteObservationById: mocks.delete,
    listPendingObservations: mocks.listModeration,
    moderateObservationById: mocks.moderate,
    reportObservationById: mocks.report,
    logObservationServiceError: mocks.log,
  };
});

import { POST as createObservation } from "../../app/api/observations/route";
import { DELETE as deleteObservation } from "../../app/api/observations/[id]/route";
import { POST as reportObservation } from "../../app/api/observations/[id]/report/route";
import { GET as moderationQueue } from "../../app/api/moderation/observations/route";
import { POST as moderateObservation } from "../../app/api/moderation/observations/[id]/route";
import { ObservationServiceError } from "../../lib/server/observations";

const observationId = "d8f4dcb8-a082-4a8c-a8a5-4b6f10a38114";

describe("observation API routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the normalized server observation and disables caching", async () => {
    mocks.create.mockResolvedValue({
      id: observationId,
      status: "pending",
      latitude: 50.633,
      longitude: 3.057,
      hasMedia: true,
    });
    const response = await createObservation(
      new Request("http://weyra.test/api/observations", {
        method: "POST",
        body: new FormData(),
      }),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      observation: { id: observationId, latitude: 50.633, longitude: 3.057 },
    });
  });

  it("maps authentication failures without exposing provider details", async () => {
    mocks.create.mockRejectedValue(
      new ObservationServiceError("authentication_required", 401, [], "provider-private-code"),
    );
    const response = await createObservation(
      new Request("http://weyra.test/api/observations", {
        method: "POST",
        body: new FormData(),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ ok: false, error: "authentication_required", issues: [] });
    expect(JSON.stringify(body)).not.toContain("provider-private-code");
  });

  it("passes the decoded id to deletion and report services", async () => {
    mocks.delete.mockResolvedValue({ id: observationId, deleted: true, mediaCleanup: "completed" });
    mocks.report.mockResolvedValue({ id: "report-id", status: "open" });
    const context = { params: Promise.resolve({ id: encodeURIComponent(observationId) }) };

    const deleted = await deleteObservation(
      new Request(`http://weyra.test/api/observations/${observationId}`, { method: "DELETE" }),
      context,
    );
    const reported = await reportObservation(
      new Request(`http://weyra.test/api/observations/${observationId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "quality", details: "A verifier" }),
      }),
      context,
    );

    expect(mocks.delete).toHaveBeenCalledWith(observationId);
    expect(mocks.report).toHaveBeenCalledWith(observationId, expect.any(Request));
    expect(deleted.status).toBe(200);
    expect(reported.status).toBe(201);
  });

  it("normalizes the moderation queue and decisions", async () => {
    mocks.listModeration.mockResolvedValue([{ id: observationId, status: "pending" }]);
    mocks.moderate.mockResolvedValue({ id: observationId, status: "published", decision: "approve" });
    const queue = await moderationQueue(new Request("http://weyra.test/api/moderation/observations?limit=12"));
    const decision = await moderateObservation(
      new Request(`http://weyra.test/api/moderation/observations/${observationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approve", reason: "Observation cohérente." }),
      }),
      { params: Promise.resolve({ id: observationId }) },
    );

    expect(mocks.listModeration).toHaveBeenCalledWith("12");
    expect(mocks.moderate).toHaveBeenCalledWith(observationId, expect.any(Request));
    await expect(queue.json()).resolves.toMatchObject({ ok: true, observations: [{ id: observationId }] });
    await expect(decision.json()).resolves.toMatchObject({
      ok: true,
      observation: { id: observationId, status: "published" },
    });
  });
});
