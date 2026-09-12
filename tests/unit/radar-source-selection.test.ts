import { describe, expect, it } from "vitest";
import { mergeRadarSourceFrames, radarSourceStyle, type RadarPackSourceFrame } from "../../lib/radar-source-selection";

const mf: RadarPackSourceFrame = {
  timestamp: "2026-09-12T12:00:00Z",
  provider: "Météo-France",
  attribution: "Source : Météo-France",
  sourceProduct: "IMFR27",
  sourceFormat: "BUFR",
  nativeResolutionMeters: 1000,
  displayFilter: "rain-probability>=0.25",
  rainProbabilityThreshold: 0.25,
  sourceGridPath: "/national.tif",
  coverage: { west: -6, south: 40, east: 11, north: 53 },
};
const opera: RadarPackSourceFrame = {
  ...mf,
  provider: "EUMETNET OPERA",
  sourceGridPath: "/europe.tif",
  coverage: { west: -39, south: 31, east: 57, north: 67 },
};

describe("radar source selection", () => {
  it("preserves national priority and European coverage at the same observation time", () => {
    const [frame] = mergeRadarSourceFrames([opera], [mf]);
    expect(frame).toMatchObject({
      provider: "Météo-France + OPERA",
      sourceGridPath: "/national.tif",
      fallback: opera,
      coverage: opera.coverage,
      nativeResolutionMeters: 1000,
    });
    expect(frame.attribution).toContain("Météo-France");
    expect(frame.attribution).toContain("OPERA");
    expect(mergeRadarSourceFrames([mf], [opera])).toEqual([frame]);
  });

  it("never mixes a stale national observation into a newer European scan", () => {
    const latest = { ...opera, timestamp: "2026-09-12T12:05:00Z" };
    expect(mergeRadarSourceFrames([latest], [mf])).toEqual([mf, latest]);
  });

  it("keeps either source available independently during an upstream outage", () => {
    expect(mergeRadarSourceFrames([], [opera])).toEqual([opera]);
    expect(mergeRadarSourceFrames([mf], [])).toEqual([mf]);
    expect(mergeRadarSourceFrames([], [])).toEqual([]);
  });

  it("keeps source revisions in separate tile caches", () => {
    expect(new Set([mf.provider, opera.provider, "Météo-France + OPERA" as const].map(radarSourceStyle)).size).toBe(3);
  });
});
