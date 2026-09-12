import type { OperaScanPackListResponse, RadarDataProvider } from "@/lib/types";

export type HorizonRadarFrame = {
  time: number;
  timestamp: string;
  tiles: string;
  detailTiles: string;
  minZoom: number;
  maxZoom: number;
  detailMinZoom: number;
  detailMaxZoom: number;
  tileSize: number;
  bounds: [number, number, number, number];
  provider: RadarDataProvider;
  attribution: string;
  style: string;
};

/** Only published, georeferenced packs enter the timeline. No synthetic scans. */
export function radarFramesFromPacks(payload: OperaScanPackListResponse): HorizonRadarFrame[] {
  if (!payload.ok || !Array.isArray(payload.packs)) throw new Error("Radar indisponible");
  const frames = new Map<number, HorizonRadarFrame>();
  for (const pack of payload.packs) {
    const c = pack.coverage;
    const time = Date.parse(pack.timestamp) / 1000;
    if (pack.status !== "ready" || pack.baseTileCount < 1 || !c || !Number.isFinite(time)) continue;
    if (![c.west, c.south, c.east, c.north].every(Number.isFinite) || c.west >= c.east || c.south >= c.north) continue;
    if (![pack.baseZoomMin, pack.baseZoomMax, pack.detailZoomMin, pack.detailZoomMax].every(Number.isInteger)) continue;
    const base = `/api/radar/opera/packs/${encodeURIComponent(pack.timestamp)}`;
    const query = `?style=${encodeURIComponent(pack.style)}`;
    frames.set(time, {
      time,
      timestamp: pack.timestamp,
      tiles: `${base}/overview/{z}/{x}/{y}${query}`,
      detailTiles: `${base}/detail/{z}/{x}/{y}${query}`,
      minZoom: pack.baseZoomMin,
      maxZoom: pack.baseZoomMax,
      detailMinZoom: pack.detailZoomMin,
      detailMaxZoom: pack.detailZoomMax,
      tileSize: pack.tileSize,
      bounds: [c.west, c.south, c.east, c.north],
      provider: pack.provider,
      attribution: pack.attribution,
      style: pack.style,
    });
  }
  return [...frames.values()].sort((a, b) => a.time - b.time).slice(-12);
}

export function reconcileRadarIndex(previous: HorizonRadarFrame[], next: HorizonRadarFrame[], index: number) {
  if (!next.length) return 0;
  if (!previous.length || index === previous.length - 1) return next.length - 1;
  const same = next.findIndex((f) => f.time === previous[index]?.time);
  return same < 0 ? 0 : same;
}

export function radarTimelineReducer(
  state: { frames: HorizonRadarFrame[]; index: number },
  action: { type: "load"; frames: HorizonRadarFrame[] } | { type: "select"; index: number },
) {
  if (action.type === "load")
    return { frames: action.frames, index: reconcileRadarIndex(state.frames, action.frames, state.index) };
  return { ...state, index: Math.max(0, Math.min(state.frames.length - 1, action.index)) };
}

export async function prepareRadarDetail(
  frame: HorizonRadarFrame,
  viewport: { west: number; south: number; east: number; north: number; zoom: number },
  signal: AbortSignal,
) {
  const response = await fetch("/api/radar/opera/tiles/prewarm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    signal,
    body: JSON.stringify({
      timestamps: [frame.timestamp],
      viewport: {
        ...viewport,
        zoom: Math.min(frame.detailMaxZoom, Math.max(frame.detailMinZoom, Math.floor(viewport.zoom))),
      },
      paddingTiles: 1,
      style: frame.style,
    }),
  });
  const data = (await response.json()) as {
    ok: boolean;
    timestamps?: { timestamp: string; requested: number; failed: number }[];
  };
  const scan = data.timestamps?.find((f) => f.timestamp === frame.timestamp);
  if (!response.ok || !data.ok || !scan || scan.requested === 0 || scan.failed > 0)
    throw new Error("Détail radar indisponible");
}
