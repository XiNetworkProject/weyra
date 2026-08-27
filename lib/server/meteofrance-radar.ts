import "server-only";

const METEOFRANCE_RADAR_BASE_URL = "https://public-api.meteofrance.fr/public/DPPaquetRadar/v1";
const METEOFRANCE_TOKEN_URL = "https://portail-api.meteofrance.fr/token";
const TOKEN_REFRESH_MARGIN_MS = 60_000;

export type MeteoFranceCredentialMode = "oauth-client-credentials" | "temporary-access-token";

type MeteoFranceCredential = {
  token: string;
  mode: MeteoFranceCredentialMode;
  expiresAt: string | null;
  expiresAtMs: number | null;
};

type MeteoFranceTokenPayload = {
  access_token?: unknown;
  expires_in?: unknown;
};

export type MeteoFranceRadarStatus = {
  ok: boolean;
  provider: "Météo-France";
  api: "Package Radar";
  version: "v1";
  credentialMode: MeteoFranceCredentialMode | null;
  credentialExpiresAt: string | null;
  stationsAvailable: number | null;
  rateLimitRemaining: string | null;
  sourceStatus: {
    status: number | null;
    statusText: string | null;
    contentType: string | null;
    date: string | null;
  };
  error: string | null;
};

export class MeteoFranceRadarConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MeteoFranceRadarConfigError";
  }
}

let cachedOAuthCredential: MeteoFranceCredential | null = null;
let oauthRefreshInFlight: Promise<MeteoFranceCredential> | null = null;

function toIsoTimestamp(timestampMs: number | null) {
  return timestampMs === null ? null : new Date(timestampMs).toISOString();
}

function readJwtExpiryMs(token: string) {
  const payload = token.split(".")[1];
  if (!payload) return null;

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(Buffer.from(normalized, "base64").toString("utf8")) as {
      exp?: unknown;
    };
    return typeof decoded.exp === "number" && Number.isFinite(decoded.exp) ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}

function temporaryAccessTokenCredential(): MeteoFranceCredential | null {
  const token = process.env.METEOFRANCE_ACCESS_TOKEN?.trim();
  if (!token) return null;

  const expiresAtMs = readJwtExpiryMs(token);
  if (expiresAtMs !== null && expiresAtMs <= Date.now()) {
    throw new MeteoFranceRadarConfigError(
      "METEOFRANCE_ACCESS_TOKEN has expired. Generate a new token or configure METEOFRANCE_APPLICATION_ID.",
    );
  }

  return {
    token,
    mode: "temporary-access-token",
    expiresAt: toIsoTimestamp(expiresAtMs),
    expiresAtMs,
  };
}

async function requestOAuthCredential(applicationId: string): Promise<MeteoFranceCredential> {
  const response = await fetch(METEOFRANCE_TOKEN_URL, {
    method: "POST",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${applicationId}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });

  if (!response.ok) {
    throw new Error(`Météo-France OAuth returned HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as MeteoFranceTokenPayload;
  if (typeof payload.access_token !== "string" || !payload.access_token.trim()) {
    throw new Error("Météo-France OAuth did not return an access token.");
  }

  const expiresInSeconds =
    typeof payload.expires_in === "number" && Number.isFinite(payload.expires_in)
      ? Math.max(1, payload.expires_in)
      : 3600;
  const expiresAtMs = Date.now() + expiresInSeconds * 1000;

  return {
    token: payload.access_token.trim(),
    mode: "oauth-client-credentials",
    expiresAt: toIsoTimestamp(expiresAtMs),
    expiresAtMs,
  };
}

async function oauthCredential(applicationId: string) {
  if (cachedOAuthCredential?.expiresAtMs && cachedOAuthCredential.expiresAtMs - TOKEN_REFRESH_MARGIN_MS > Date.now()) {
    return cachedOAuthCredential;
  }

  oauthRefreshInFlight ??= requestOAuthCredential(applicationId).finally(() => {
    oauthRefreshInFlight = null;
  });
  cachedOAuthCredential = await oauthRefreshInFlight;
  return cachedOAuthCredential;
}

async function resolveCredential(): Promise<MeteoFranceCredential> {
  const applicationId = process.env.METEOFRANCE_APPLICATION_ID?.trim();
  if (applicationId) return oauthCredential(applicationId);

  const temporaryCredential = temporaryAccessTokenCredential();
  if (temporaryCredential) return temporaryCredential;

  throw new MeteoFranceRadarConfigError(
    "Météo-France Radar is not configured. Set METEOFRANCE_APPLICATION_ID or METEOFRANCE_ACCESS_TOKEN on the server.",
  );
}

function radarUrl(path: string) {
  if (/^https?:\/\//i.test(path)) {
    throw new Error("meteoFranceRadarFetch only accepts Package Radar API paths.");
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return new URL(`${METEOFRANCE_RADAR_BASE_URL}${normalizedPath}`);
}

async function authenticatedRadarFetch(path: string, init: RequestInit = {}) {
  const fetchWithCredential = (credential: MeteoFranceCredential) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${credential.token}`);
    if (!headers.has("Accept")) headers.set("Accept", "application/json");

    return fetch(radarUrl(path), {
      ...init,
      cache: "no-store",
      headers,
    });
  };

  let credential = await resolveCredential();
  let response = await fetchWithCredential(credential);

  // The upstream gateway can reject an otherwise unexpired cached token.
  // Refresh once instead of leaving the web process or radar worker stuck
  // with a transient 401.
  if (response.status === 401 && credential.mode === "oauth-client-credentials") {
    if (cachedOAuthCredential?.token === credential.token) {
      cachedOAuthCredential = null;
    }
    await response.body?.cancel().catch(() => undefined);
    credential = await resolveCredential();
    response = await fetchWithCredential(credential);
  }

  return { response, credential };
}

export async function meteoFranceRadarFetch(path: string, init: RequestInit = {}) {
  return (await authenticatedRadarFetch(path, init)).response;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function countStationLinks(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.links)) return null;

  const stationIds = new Set<string>();
  for (const value of payload.links) {
    if (!isRecord(value) || typeof value.href !== "string") continue;
    const match = value.href.match(/\/stations\/(\d+)(?:[/?#]|$)/);
    if (match?.[1]) stationIds.add(match[1]);
  }

  return stationIds.size;
}

function emptyStatus(overrides: Partial<MeteoFranceRadarStatus>): MeteoFranceRadarStatus {
  return {
    ok: false,
    provider: "Météo-France",
    api: "Package Radar",
    version: "v1",
    credentialMode: null,
    credentialExpiresAt: null,
    stationsAvailable: null,
    rateLimitRemaining: null,
    sourceStatus: {
      status: null,
      statusText: null,
      contentType: null,
      date: null,
    },
    error: null,
    ...overrides,
  };
}

export async function getMeteoFranceRadarStatus(): Promise<MeteoFranceRadarStatus> {
  try {
    const { response, credential } = await authenticatedRadarFetch("/stations");
    const sourceStatus = {
      status: response.status,
      statusText: response.statusText || null,
      contentType: response.headers.get("content-type"),
      date: response.headers.get("date"),
    };
    const rateLimitRemaining =
      response.headers.get("x-ratelimit-remaining") ?? response.headers.get("x-rate-limit-remaining");

    if (!response.ok) {
      return emptyStatus({
        credentialMode: credential.mode,
        credentialExpiresAt: credential.expiresAt,
        rateLimitRemaining,
        sourceStatus,
        error: `Météo-France Package Radar returned HTTP ${response.status}.`,
      });
    }

    const payload = await response.json().catch(() => null);
    return emptyStatus({
      ok: true,
      credentialMode: credential.mode,
      credentialExpiresAt: credential.expiresAt,
      stationsAvailable: countStationLinks(payload),
      rateLimitRemaining,
      sourceStatus,
    });
  } catch (error) {
    return emptyStatus({
      error: error instanceof Error ? error.message : "Unable to contact Météo-France Package Radar.",
    });
  }
}
