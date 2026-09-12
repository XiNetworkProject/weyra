import type { OperaScanPackCoverage, RadarDataProvider } from "@/lib/types";

export type RadarPackSourceFrame = {
  timestamp: string;
  provider: RadarDataProvider;
  attribution: string;
  sourceProduct: string;
  sourceFormat: string;
  nativeResolutionMeters: number | null;
  displayFilter: string | null;
  rainProbabilityThreshold: number | null;
  sourceGridPath: string;
  coverage: OperaScanPackCoverage;
  fallback?: RadarPackSourceFrame;
};

// Separate cache namespaces: a late national scan must never reuse an OPERA-only tile.
export function radarSourceStyle(provider: RadarDataProvider) {
  if (provider === "Météo-France + OPERA") return "v5-mf-opera";
  if (provider === "Météo-France") return "v5-mf";
  return "v5";
}

export function radarProviderHeader(provider?: RadarDataProvider) {
  if (provider === "Météo-France + OPERA") return "METEO-FRANCE+EUMETNET-OPERA";
  return provider === "Météo-France" ? "METEO-FRANCE" : "EUMETNET-OPERA";
}

// Pair exact observation times only. An old national scan must not overwrite a newer storm.
export function mergeRadarSourceFrames(...groups: RadarPackSourceFrame[][]): RadarPackSourceFrame[] {
  const times = new Map<string, Map<RadarDataProvider, RadarPackSourceFrame>>();
  for (const frame of groups.flat()) {
    const sources = times.get(frame.timestamp) ?? new Map();
    sources.set(frame.provider, frame);
    times.set(frame.timestamp, sources);
  }
  return [...times.values()]
    .map((sources) => {
      const mf = sources.get("Météo-France");
      const opera = sources.get("EUMETNET OPERA");
      if (!mf || !opera) return mf ?? opera ?? sources.values().next().value!;
      return {
        ...mf,
        provider: "Météo-France + OPERA" as const,
        attribution: "Sources : Météo-France · EUMETNET OPERA",
        sourceProduct: "DBZH — mosaïque Météo-France et Europe OPERA",
        sourceFormat: "BUFR + ODIM HDF5",
        // The composite uses the European grid; no claim of finer native resolution.
        nativeResolutionMeters: opera.nativeResolutionMeters,
        coverage: {
          west: Math.min(mf.coverage.west, opera.coverage.west),
          south: Math.min(mf.coverage.south, opera.coverage.south),
          east: Math.max(mf.coverage.east, opera.coverage.east),
          north: Math.max(mf.coverage.north, opera.coverage.north),
        },
        fallback: opera,
      };
    })
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}
