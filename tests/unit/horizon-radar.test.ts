import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareRadarDetail, radarFramesFromPacks, radarTimelineReducer } from "@/lib/horizon-radar";
import type { OperaScanPackListResponse, OperaScanPackSummary } from "@/lib/types";
const pack = (minutes: number, overrides: Partial<OperaScanPackSummary> = {}): OperaScanPackSummary => ({
  timestamp: new Date(Date.UTC(2026, 8, 12, 12, minutes)).toISOString(),
  status: "ready",
  publishedAt: null,
  style: "v5",
  packVersion: "v1",
  tileSize: 256,
  baseZoomMin: 3,
  baseZoomMax: 6,
  detailZoomMin: 8,
  detailZoomMax: 9,
  baseTileCount: 12,
  detailTileCount: 0,
  coverage: { west: -5, south: 42, east: 10, north: 52 },
  provider: "Météo-France",
  attribution: "Météo-France",
  sourceProduct: "DBZH",
  sourceFormat: "BUFR",
  nativeResolutionMeters: 1000,
  displayFilter: null,
  rainProbabilityThreshold: null,
  ...overrides,
});
const frames = (packs: OperaScanPackSummary[]) =>
  radarFramesFromPacks({ ok: true, provider: "Weyra Radar", product: "DBZH", packs });
afterEach(() => vi.unstubAllGlobals());
describe("Horizon connected to Weyra radar packs", () => {
  it("rejects unpublished, empty, invalid-time and ungeoreferenced scans", () => {
    const valid = pack(5);
    expect(
      frames([
        pack(0, { status: "building" }),
        pack(1, { baseTileCount: 0 }),
        pack(2, { coverage: null }),
        pack(3, { timestamp: "invalid" }),
        valid,
      ]),
    ).toHaveLength(1);
    expect(frames([valid])[0].time).toBe(Date.parse(valid.timestamp) / 1000);
  });
  it("retains real provider attribution, bounds, zooms and the existing encoded API paths", () => {
    const scan = pack(0, { provider: "EUMETNET OPERA", attribution: "EUMETNET OPERA / MeteoGate", style: "v5+test" }),
      frame = frames([scan])[0];
    expect(frame).toMatchObject({
      provider: scan.provider,
      attribution: scan.attribution,
      bounds: [-5, 42, 10, 52],
      minZoom: 3,
      maxZoom: 6,
      detailMinZoom: 8,
      detailMaxZoom: 9,
    });
    expect(frame.tiles).toBe(
      `/api/radar/opera/packs/${encodeURIComponent(scan.timestamp)}/overview/{z}/{x}/{y}?style=v5%2Btest`,
    );
    expect(frame.detailTiles).toContain("/detail/{z}/{x}/{y}");
  });
  it("sorts, deduplicates and limits the rolling history to twelve real scans", () => {
    const input = Array.from({ length: 15 }, (_, i) => pack(i * 5));
    const result = frames([...input.reverse(), input[0]]);
    expect(result).toHaveLength(12);
    expect(result[0].time).toBe(Date.parse(pack(15).timestamp) / 1000);
    expect(result[11].time).toBe(Date.parse(pack(70).timestamp) / 1000);
  });
  it("keeps the first selected scan at index zero when the poll returns the same history", () => {
    const previous = frames([pack(0), pack(5), pack(10)]);
    expect(radarTimelineReducer({ frames: previous, index: 0 }, { type: "load", frames: previous }).index).toBe(0);
  });
  it("tracks the selected timestamp through a rolling window and follows latest only when already at latest", () => {
    const previous = frames([pack(0), pack(5), pack(10)]),
      next = frames([pack(5), pack(10), pack(15)]);
    expect(radarTimelineReducer({ frames: previous, index: 1 }, { type: "load", frames: next }).index).toBe(0);
    expect(radarTimelineReducer({ frames: previous, index: 2 }, { type: "load", frames: next }).index).toBe(2);
    expect(radarTimelineReducer({ frames: [], index: 0 }, { type: "load", frames: next }).index).toBe(2);
  });
  it("prepares only the paused scan and visible viewport using the existing detail API", async () => {
    const frame = frames([pack(0)])[0],
      signal = new AbortController().signal;
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ ok: true, timestamps: [{ timestamp: frame.timestamp, requested: 4, failed: 0 }] }),
      );
    vi.stubGlobal("fetch", fetch);
    await prepareRadarDetail(frame, { west: 2, south: 50, east: 3, north: 51, zoom: 13 }, signal);
    expect(fetch.mock.calls[0][0]).toBe("/api/radar/opera/tiles/prewarm");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      timestamps: [frame.timestamp],
      viewport: { west: 2, south: 50, east: 3, north: 51, zoom: 9 },
      paddingTiles: 1,
      style: "v5",
    });
    expect(fetch.mock.calls[0][1].signal).toBe(signal);
  });
  it("does not replace the overview with incomplete detail or accept a failed manifest", async () => {
    const frame = frames([pack(0)])[0];
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ ok: true, timestamps: [{ timestamp: frame.timestamp, requested: 4, failed: 1 }] }),
        ),
    );
    await expect(
      prepareRadarDetail(frame, { west: 2, south: 50, east: 3, north: 51, zoom: 8 }, new AbortController().signal),
    ).rejects.toThrow();
    expect(() => radarFramesFromPacks({ ok: false, packs: [] } as unknown as OperaScanPackListResponse)).toThrow();
  });
});
