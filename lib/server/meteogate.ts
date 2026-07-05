import "server-only";

const METEOGATE_BASE_URL = "https://api.meteogate.eu/eu-eumetnet-weather-radar";
const OPERA_LOCATION_ID = "0-20010-0-OPERA";
const PRODUCT = "DBZH";
const METHOD = "comp";
const FORMAT = "ODIM";

type DataFileType = "ODIM HDF5" | "GeoTIFF" | "Unknown";

export type MeteoGateDataLink = {
  href: string;
  rel?: string;
  title?: string;
  type?: string;
  format?: string;
  fileType: DataFileType;
  timestamp?: string;
  isLatest?: boolean;
};

export type OperaCompositeResult = {
  ok: boolean;
  provider: "EUMETNET OPERA";
  product: "DBZH";
  method: "comp";
  latestTimestamp: string | null;
  format: string | null;
  dataLinks: MeteoGateDataLink[];
  rateLimitRemaining: string | null;
  sourceStatus: {
    status: number | null;
    statusText: string | null;
    contentType: string | null;
    date: string | null;
    locationId: string;
    windowStart: string;
    windowEnd: string;
  };
  error: string | null;
};

export type RecentOperaComposite = {
  timestamp: string;
  provider: "EUMETNET OPERA";
  product: "DBZH";
  method: "comp";
  format: "ODIM HDF5";
  internalDataLink: MeteoGateDataLink;
  sourceStatus: OperaCompositeResult["sourceStatus"];
};

export type RecentOperaCompositeResult = {
  ok: boolean;
  provider: "EUMETNET OPERA";
  product: "DBZH";
  method: "comp";
  format: "ODIM HDF5";
  requestedCount: number;
  availableCount: number;
  frames: RecentOperaComposite[];
  rateLimitRemaining: string | null;
  sourceStatus: OperaCompositeResult["sourceStatus"];
  error: string | null;
};

class MeteoGateConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MeteoGateConfigError";
  }
}

type TimeWindow = {
  start: Date;
  end: Date;
  startIso: string;
  endIso: string;
};

type TimeCandidate = {
  date: Date;
  iso: string;
  score: number;
};

function toQueryIso(date: Date) {
  const copy = new Date(date);
  copy.setUTCSeconds(0, 0);
  return copy.toISOString().replace(/:00\.000Z$/, "Z");
}

function toResponseIso(date: Date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function buildOperaWindow(now = new Date(), lookbackMinutes = 45): TimeWindow {
  const roundedNow = new Date(now);
  roundedNow.setUTCSeconds(0, 0);

  const start = new Date(roundedNow.getTime() - lookbackMinutes * 60 * 1000);
  const end = new Date(roundedNow.getTime() + 5 * 60 * 1000);

  return {
    start,
    end,
    startIso: toQueryIso(start),
    endIso: toQueryIso(end),
  };
}

function emptyResult(window: TimeWindow, overrides: Partial<OperaCompositeResult>): OperaCompositeResult {
  const sourceStatus: OperaCompositeResult["sourceStatus"] = {
    status: null,
    statusText: null,
    contentType: null,
    date: null,
    locationId: OPERA_LOCATION_ID,
    windowStart: window.startIso,
    windowEnd: window.endIso,
    ...overrides.sourceStatus,
  };

  const result: OperaCompositeResult = {
    ok: false,
    provider: "EUMETNET OPERA",
    product: PRODUCT,
    method: METHOD,
    latestTimestamp: null,
    format: null,
    dataLinks: [],
    rateLimitRemaining: null,
    sourceStatus,
    error: null,
    ...overrides,
  };

  return { ...result, sourceStatus };
}

function buildLatestOperaPath(window: TimeWindow) {
  const params = new URLSearchParams({
    datetime: `${window.startIso}/${window.endIso}`,
    standard_name: PRODUCT,
    method: METHOD,
    format: FORMAT,
    f: "CoverageJSON",
  });

  return `/collections/observations/locations/${OPERA_LOCATION_ID}?${params.toString()}`;
}

function buildSourceStatus(
  window: TimeWindow,
  response: Response,
): OperaCompositeResult["sourceStatus"] {
  return {
    status: response.status,
    statusText: response.statusText || null,
    contentType: response.headers.get("content-type"),
    date: response.headers.get("date"),
    locationId: OPERA_LOCATION_ID,
    windowStart: window.startIso,
    windowEnd: window.endIso,
  };
}

export async function meteoGateFetch(path: string) {
  const apiKey = process.env.METEOGATE_API_KEY?.trim();

  if (!apiKey) {
    throw new MeteoGateConfigError("METEOGATE_API_KEY is missing from the server environment.");
  }

  if (/^https?:\/\//i.test(path)) {
    throw new Error("meteoGateFetch only accepts MeteoGate API paths.");
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${METEOGATE_BASE_URL}${normalizedPath}`);

  return fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      apikey: apiKey,
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function classifyDataFile(text: string, fallbackFormat?: string): DataFileType {
  const lower = `${text} ${fallbackFormat ?? ""}`.toLowerCase();

  if (/\.(h5|hdf5)(?:[?#]|$)/.test(lower) || lower.includes("hdf5") || lower.includes("odim")) {
    return "ODIM HDF5";
  }

  if (/\.(tif|tiff)(?:[?#]|$)/.test(lower) || lower.includes("geotiff") || lower.includes("cog")) {
    return "GeoTIFF";
  }

  return "Unknown";
}

function parseTimestamp(value: string) {
  const trimmed = value.trim();

  const isoMatch = trimmed.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?Z/);
  if (isoMatch) {
    const date = new Date(isoMatch[0]);
    if (!Number.isNaN(date.getTime())) return toResponseIso(date);
  }

  const compactMatch = trimmed.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?/);
  if (compactMatch) {
    const [, year, month, day, hour, minute, second = "00"] = compactMatch;
    const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
    if (!Number.isNaN(date.getTime())) return toResponseIso(date);
  }

  return null;
}

function isUrlLike(value: string) {
  return /^(https?:\/\/|s3:\/\/)/i.test(value);
}

function isLikelyDataLink(link: MeteoGateDataLink, sourcePath: string) {
  const rel = link.rel?.toLowerCase();
  if (rel && ["self", "root", "service-desc", "service-doc", "conformance", "collection"].includes(rel)) {
    return false;
  }

  const descriptor = [
    link.href,
    link.rel,
    link.title,
    link.type,
    link.format,
    sourcePath,
  ].filter(Boolean).join(" ").toLowerCase();

  if (link.fileType !== "Unknown") return true;
  if (descriptor.includes("format=odim")) return true;
  if (descriptor.includes("format=geotiff")) return true;
  if (descriptor.includes("download")) return true;
  if (descriptor.includes("data")) return true;
  if (descriptor.includes("coverage")) return true;
  if (descriptor.includes("observations/locations")) return true;

  return false;
}

function isUsableHdf5DataLink(link: MeteoGateDataLink) {
  if (link.fileType !== "ODIM HDF5") return false;

  const rel = link.rel?.toLowerCase();
  if (rel && ["self", "root", "service-desc", "service-doc", "conformance", "collection"].includes(rel)) {
    return false;
  }

  const descriptor = [
    link.href,
    link.rel,
    link.title,
    link.type,
    link.format,
  ].filter(Boolean).join(" ").toLowerCase();

  if (descriptor.includes("service-desc") || descriptor.includes("service-doc")) return false;
  if (descriptor.includes("metadata-only") || descriptor.includes("metadata only")) return false;
  if (descriptor.includes("application/json")) return false;

  return true;
}

function extractDataLinks(payload: unknown) {
  const links: MeteoGateDataLink[] = [];
  const seen = new Set<string>();

  function addLink(href: string, record: Record<string, unknown>, sourcePath: string) {
    if (!isUrlLike(href) || seen.has(href)) return;

    const rel = getString(record, "rel");
    const title = getString(record, "title") ?? getString(record, "name");
    const type = getString(record, "type") ?? getString(record, "mediaType");
    const format = getString(record, "format");
    const fileType = classifyDataFile(`${href} ${title ?? ""} ${type ?? ""}`, format);
    const timestamp = parseTimestamp(`${href} ${title ?? ""}`);
    const link: MeteoGateDataLink = { href, rel, title, type, format, fileType };

    if (timestamp) link.timestamp = timestamp;
    if (!isLikelyDataLink(link, sourcePath)) return;

    seen.add(href);
    links.push(link);
  }

  function visit(value: unknown, sourcePath: string) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${sourcePath}.${index}`));
      return;
    }

    if (!isRecord(value)) return;

    const href = getString(value, "href");
    if (href) addLink(href, value, `${sourcePath}.href`);

    for (const [key, child] of Object.entries(value)) {
      if (typeof child === "string" && ["data", "download", "download_url", "downloadUrl", "url"].includes(key)) {
        addLink(child, value, `${sourcePath}.${key}`);
      }

      visit(child, `${sourcePath}.${key}`);
    }
  }

  visit(payload, "$");
  return links;
}

function maybeAddTimeCandidate(candidates: TimeCandidate[], value: string, score: number) {
  const iso = parseTimestamp(value);
  if (!iso) return;

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return;
  candidates.push({ date, iso, score });
}

function extractTimeCandidates(payload: unknown, links: MeteoGateDataLink[], window: TimeWindow) {
  const candidates: TimeCandidate[] = [];

  for (const link of links) {
    maybeAddTimeCandidate(candidates, `${link.href} ${link.title ?? ""}`, 100);
  }

  function visit(value: unknown, sourcePath: string, key = "") {
    if (typeof value === "string") {
      const lowerPath = sourcePath.toLowerCase();
      const lowerKey = key.toLowerCase();

      if (
        lowerPath.includes(".axes.t.values") ||
        ["datetime", "time", "timestamp", "valid_time", "validtime", "observed", "observed_at", "phenomenontime", "t"].includes(lowerKey)
      ) {
        maybeAddTimeCandidate(candidates, value, lowerPath.includes(".axes.t.values") ? 90 : 75);
      }

      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${sourcePath}.${index}`, key));
      return;
    }

    if (!isRecord(value)) return;

    for (const [childKey, child] of Object.entries(value)) {
      visit(child, `${sourcePath}.${childKey}`, childKey);
    }
  }

  visit(payload, "$");

  const start = window.start.getTime();
  const end = window.end.getTime();

  return candidates
    .filter((candidate) => {
      const time = candidate.date.getTime();
      return time >= start && time <= end;
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime() || b.score - a.score);
}

function inferFormat(payload: unknown, links: MeteoGateDataLink[]) {
  const linkFormat = links.find((link) => link.format)?.format;
  if (linkFormat) return linkFormat;

  const hasHdf5 = links.some((link) => link.fileType === "ODIM HDF5");
  if (hasHdf5) return "ODIM HDF5";

  const hasGeoTiff = links.some((link) => link.fileType === "GeoTIFF");
  if (hasGeoTiff) return "GeoTIFF";

  function visit(value: unknown): string | null {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = visit(item);
        if (found) return found;
      }
      return null;
    }

    if (!isRecord(value)) return null;

    const direct = getString(value, "format");
    if (direct) return direct;

    for (const child of Object.values(value)) {
      const found = visit(child);
      if (found) return found;
    }

    return null;
  }

  return visit(payload);
}

function markLatestLinks(links: MeteoGateDataLink[], latestTimestamp: string | null) {
  if (!latestTimestamp) return links;

  const latestMinute = latestTimestamp.slice(0, 16).replace(/[-:]/g, "");

  return links.map((link) => {
    const linkMinute = link.timestamp?.slice(0, 16).replace(/[-:]/g, "");
    const hrefMinute = link.href.replace(/[-:]/g, "");
    const isLatest = linkMinute === latestMinute || hrefMinute.includes(latestMinute);
    return isLatest ? { ...link, isLatest } : link;
  });
}

function withinWindow(timestamp: string, window: TimeWindow) {
  const date = new Date(timestamp);
  const time = date.getTime();
  return !Number.isNaN(time) && time >= window.start.getTime() && time <= window.end.getTime();
}

function toRecentFrames(
  links: MeteoGateDataLink[],
  sourceStatus: OperaCompositeResult["sourceStatus"],
  window: TimeWindow,
  count: number,
) {
  const byTimestamp = new Map<string, RecentOperaComposite>();

  for (const link of links) {
    if (!isUsableHdf5DataLink(link) || !link.timestamp || !withinWindow(link.timestamp, window)) continue;

    const existing = byTimestamp.get(link.timestamp);
    if (existing && existing.internalDataLink.href.length <= link.href.length) continue;

    byTimestamp.set(link.timestamp, {
      timestamp: link.timestamp,
      provider: "EUMETNET OPERA",
      product: PRODUCT,
      method: METHOD,
      format: "ODIM HDF5",
      internalDataLink: link,
      sourceStatus,
    });
  }

  return [...byTimestamp.values()]
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .slice(-count);
}

export async function getLatestOperaComposite(now = new Date()): Promise<OperaCompositeResult> {
  const window = buildOperaWindow(now);
  const path = buildLatestOperaPath(window);

  try {
    const response = await meteoGateFetch(path);
    const rateLimitRemaining = response.headers.get("x-ratelimit-remaining");
    const contentType = response.headers.get("content-type");
    const sourceStatus = buildSourceStatus(window, response);

    if (response.status === 204) {
      return emptyResult(window, {
        rateLimitRemaining,
        sourceStatus,
        error: "MeteoGate returned no OPERA DBZH composite for the requested 45-minute window.",
      });
    }

    if (!response.ok) {
      return emptyResult(window, {
        rateLimitRemaining,
        sourceStatus,
        error: `MeteoGate returned ${response.status}${response.statusText ? ` ${response.statusText}` : ""}.`,
      });
    }

    if (!contentType?.toLowerCase().includes("json")) {
      return emptyResult(window, {
        rateLimitRemaining,
        sourceStatus,
        error: `MeteoGate returned an unexpected content type: ${contentType ?? "unknown"}.`,
      });
    }

    const payload = await response.json() as unknown;
    const dataLinks = extractDataLinks(payload);
    const latest = extractTimeCandidates(payload, dataLinks, window).at(0)?.iso ?? null;
    const markedLinks = markLatestLinks(dataLinks, latest);
    const format = inferFormat(payload, markedLinks) ?? FORMAT;
    const ok = Boolean(latest && markedLinks.length);

    return {
      ok,
      provider: "EUMETNET OPERA",
      product: PRODUCT,
      method: METHOD,
      latestTimestamp: latest,
      format,
      dataLinks: markedLinks,
      rateLimitRemaining,
      sourceStatus,
      error: ok ? null : "No recent OPERA DBZH composite download link was found in the MeteoGate response.",
    };
  } catch (error) {
    const message = error instanceof MeteoGateConfigError
      ? error.message
      : "MeteoGate request failed before a usable response was received.";

    return emptyResult(window, {
      sourceStatus: {
        status: null,
        statusText: error instanceof MeteoGateConfigError ? "missing-api-key" : "request-failed",
        contentType: null,
        date: null,
        locationId: OPERA_LOCATION_ID,
        windowStart: window.startIso,
        windowEnd: window.endIso,
      },
      error: message,
    });
  }
}

export async function getRecentOperaComposites(options: {
  count?: number;
  lookbackMinutes?: number;
} = {}): Promise<RecentOperaCompositeResult> {
  const requestedCount = Math.min(Math.max(Math.trunc(options.count ?? 12), 1), 24);
  const lookbackMinutes = Math.max(options.lookbackMinutes ?? 100, 15);
  const window = buildOperaWindow(new Date(), lookbackMinutes);
  const path = buildLatestOperaPath(window);

  const empty = (
    overrides: Partial<RecentOperaCompositeResult>,
  ): RecentOperaCompositeResult => {
    const sourceStatus: OperaCompositeResult["sourceStatus"] = {
      status: null,
      statusText: null,
      contentType: null,
      date: null,
      locationId: OPERA_LOCATION_ID,
      windowStart: window.startIso,
      windowEnd: window.endIso,
      ...overrides.sourceStatus,
    };

    return {
      ok: false,
      provider: "EUMETNET OPERA",
      product: PRODUCT,
      method: METHOD,
      format: "ODIM HDF5",
      requestedCount,
      availableCount: 0,
      frames: [],
      rateLimitRemaining: null,
      error: null,
      ...overrides,
      sourceStatus,
    };
  };

  try {
    const response = await meteoGateFetch(path);
    const rateLimitRemaining = response.headers.get("x-ratelimit-remaining");
    const contentType = response.headers.get("content-type");
    const sourceStatus = buildSourceStatus(window, response);

    if (response.status === 204) {
      return empty({
        rateLimitRemaining,
        sourceStatus,
        error: `MeteoGate returned no OPERA DBZH composite for the requested ${lookbackMinutes}-minute window.`,
      });
    }

    if (!response.ok) {
      return empty({
        rateLimitRemaining,
        sourceStatus,
        error: `MeteoGate returned ${response.status}${response.statusText ? ` ${response.statusText}` : ""}.`,
      });
    }

    if (!contentType?.toLowerCase().includes("json")) {
      return empty({
        rateLimitRemaining,
        sourceStatus,
        error: `MeteoGate returned an unexpected content type: ${contentType ?? "unknown"}.`,
      });
    }

    const payload = await response.json() as unknown;
    const dataLinks = extractDataLinks(payload);
    const frames = toRecentFrames(dataLinks, sourceStatus, window, requestedCount);

    return {
      ok: frames.length > 0,
      provider: "EUMETNET OPERA",
      product: PRODUCT,
      method: METHOD,
      format: "ODIM HDF5",
      requestedCount,
      availableCount: frames.length,
      frames,
      rateLimitRemaining,
      sourceStatus,
      error: frames.length > 0 ? null : "No recent OPERA DBZH ODIM HDF5 frames were found in the MeteoGate response.",
    };
  } catch (error) {
    const message = error instanceof MeteoGateConfigError
      ? error.message
      : "MeteoGate recent frame request failed before a usable response was received.";

    return empty({
      sourceStatus: {
        status: null,
        statusText: error instanceof MeteoGateConfigError ? "missing-api-key" : "request-failed",
        contentType: null,
        date: null,
        locationId: OPERA_LOCATION_ID,
        windowStart: window.startIso,
        windowEnd: window.endIso,
      },
      error: message,
    });
  }
}
