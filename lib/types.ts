export type Coordinates = {
  lat: number;
  lon: number;
};

export type LocationSelection = Coordinates & {
  name: string;
  country?: string;
  admin?: string;
};

export type WeatherSnapshot = {
  temperature: number;
  apparentTemperature: number;
  precipitation: number;
  weatherCode: number;
  windSpeed: number;
  windDirection: number;
  windGusts: number;
  pressure: number;
  observedAt: string;
};

export type RadarFrame = {
  time: number;
  path: string;
};

export type MapLibreImageCoordinates = [[number, number], [number, number], [number, number], [number, number]];

export type OperaRadarOverlayMeta = {
  ok: true;
  provider: "EUMETNET OPERA";
  product: "DBZH";
  timestamp: string;
  imageUrl: string;
  mapLibreCoordinates: MapLibreImageCoordinates | null;
  geographicBounds: { west: number; south: number; east: number; north: number } | null;
  projectionBounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
  projection: string | null;
  width: number;
  height: number;
  imageByteLength: number | null;
  hasGeoreferencing: boolean;
  warning: string | null;
  metadata?: {
    source: "EUMETNET OPERA";
    timestamp: string | null;
    quantity: string;
    gain: number;
    offset: number;
    nodata: number | null;
    undetect: number | null;
    width: number;
    height: number;
    projection: string | null;
    projectionBounds?: { minX: number; minY: number; maxX: number; maxY: number } | null;
    mapLibreCoordinates?: MapLibreImageCoordinates | null;
    geographicBounds?: { west: number; south: number; east: number; north: number } | null;
    bbox?: { west: number; south: number; east: number; north: number } | null;
    hasGeoreferencing: boolean;
    renderedAt: string;
    warning: string | null;
    hdf5DataPath?: string;
    status?: "ready" | "failed";
    imageByteLength?: number;
    error?: string;
    tileReady?: boolean;
  };
};

export type OperaRadarStatus = {
  available: boolean;
  timestamp: string | null;
  error?: string;
  historyStatus?: "static" | "preparing" | "preloading" | "ready" | "unavailable";
  historyReadyCount?: number;
  historyTotalCount?: number;
};

export type ObservationCategory = "pluie" | "orage" | "grêle" | "rafales" | "neige" | "nuage";

export type OperaFrameStatus = "ready" | "missing" | "failed";

export type OperaFrameManifestItem = {
  timestamp: string;
  status: OperaFrameStatus;
  imageUrl: string;
  metadataUrl: string;
  width: number | null;
  height: number | null;
  imageByteLength: number | null;
  hasGeoreferencing: boolean;
  error?: string;
};

export type OperaFrameManifest = {
  ok: boolean;
  provider: "EUMETNET OPERA";
  product: "DBZH";
  requestedCount: number;
  availableCount: number;
  readyCount: number;
  failedCount: number;
  missingCount: number;
  frames: OperaFrameManifestItem[];
  errors: Array<{ timestamp: string; error: string }>;
  durationMs?: number;
  error?: string | null;
};

export type OperaScanPackCoverage = { west: number; south: number; east: number; north: number };

export type OperaScanPackSummary = {
  timestamp: string;
  status: "building" | "ready" | "failed";
  publishedAt: string | null;
  style: string;
  packVersion: string;
  tileSize: number;
  baseZoomMin: number;
  baseZoomMax: number;
  detailZoomMin: number;
  detailZoomMax: number;
  baseTileCount: number;
  detailTileCount: number;
  coverage: OperaScanPackCoverage | null;
  packBytes?: number;
  buildDurationMs?: number;
};

export type OperaScanPackMaintenance = {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  scansDetected: number;
  packsReady: number;
  building: string[];
  errors: Array<{ timestamp: string; error: string }>;
  note: string;
};

export type OperaScanPackListResponse = {
  ok: boolean;
  provider: "EUMETNET OPERA";
  product: "DBZH";
  packs: OperaScanPackSummary[];
  maintenance?: OperaScanPackMaintenance;
  error?: string | null;
};

export type OperaRadarHistoryFrame = OperaFrameManifestItem & {
  status: "ready";
  mapLibreCoordinates: MapLibreImageCoordinates;
  geographicBounds: { west: number; south: number; east: number; north: number } | null;
  projectionBounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
  projection: string | null;
  pack?: OperaScanPackSummary;
};

export type OperaRadarMapTransition = {
  id: number;
  toFrame: OperaRadarHistoryFrame;
  durationMs: number;
};

export type Observation = {
  id: string;
  nickname: string;
  category: ObservationCategory;
  intensity: number;
  details?: string | null;
  imageUrl?: string | null;
  lat: number;
  lon: number;
  createdAt: string;
  likes: number;
  place?: string;
  isSeed?: boolean;
};
