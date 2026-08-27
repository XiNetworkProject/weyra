import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("Météo-France Package Radar server client", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("uses the temporary token only in the server Authorization header", async () => {
    const token = "temporary-secret-token";
    vi.stubEnv("METEOFRANCE_ACCESS_TOKEN", token);
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${token}`);
      return new Response(
        JSON.stringify({
          links: [
            { href: "https://public-api.meteofrance.fr/public/DPRadar/stations", rel: "self" },
            { href: "https://public-api.meteofrance.fr/public/DPRadar/stations/36" },
            { href: "https://public-api.meteofrance.fr/public/DPRadar/stations/37" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getMeteoFranceRadarStatus } = await import("../../lib/server/meteofrance-radar");
    const result = await getMeteoFranceRadarStatus();

    expect(result).toMatchObject({
      ok: true,
      credentialMode: "temporary-access-token",
      stationsAvailable: 2,
      error: null,
    });
    expect(JSON.stringify(result)).not.toContain(token);
  });

  it("returns a clear configuration error without throwing", async () => {
    const { getMeteoFranceRadarStatus } = await import("../../lib/server/meteofrance-radar");
    const result = await getMeteoFranceRadarStatus();

    expect(result.ok).toBe(false);
    expect(result.error).toContain("METEOFRANCE_APPLICATION_ID");
  });

  it("renews an OAuth token before calling the radar API", async () => {
    vi.stubEnv("METEOFRANCE_APPLICATION_ID", "encoded-application-id");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "oauth-secret", expires_in: 3600 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ links: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { getMeteoFranceRadarStatus } = await import("../../lib/server/meteofrance-radar");
    const result = await getMeteoFranceRadarStatus();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://portail-api.meteofrance.fr/token",
      expect.objectContaining({ method: "POST" }),
    );
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("authorization")).toBe(
      "Basic encoded-application-id",
    );
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("authorization")).toBe("Bearer oauth-secret");
    expect(result).toMatchObject({ ok: true, credentialMode: "oauth-client-credentials" });
  });

  it("renews and retries once when the radar API rejects a cached OAuth token", async () => {
    vi.stubEnv("METEOFRANCE_APPLICATION_ID", "encoded-application-id");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "oauth-stale", expires_in: 3600 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "oauth-fresh", expires_in: 3600 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ links: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { getMeteoFranceRadarStatus } = await import("../../lib/server/meteofrance-radar");
    const result = await getMeteoFranceRadarStatus();

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("authorization")).toBe("Bearer oauth-stale");
    expect(new Headers(fetchMock.mock.calls[3]?.[1]?.headers).get("authorization")).toBe("Bearer oauth-fresh");
    expect(result).toMatchObject({ ok: true, credentialMode: "oauth-client-credentials" });
  });

  it("extracts the official package timestamp without trusting unrelated filenames", async () => {
    const { parseMeteoFrancePackageTimestamp } = await import("../../lib/server/meteofrance-radar-ingest");

    expect(parseMeteoFrancePackageTimestamp('attachment; filename="paquetradar_mosaique_20260826214500.tar.gz"')).toBe(
      "2026-08-26T21:45:00Z",
    );
    expect(parseMeteoFrancePackageTimestamp("attachment; filename=other.tar.gz")).toBeNull();
  });
});
