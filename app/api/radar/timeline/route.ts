import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RadarFrame = { time: number; path: string };
type Timeline = {
  host?: string;
  radar?: { past?: RadarFrame[] };
  past?: RadarFrame[];
  provider?: string;
  cadenceMinutes?: number;
};

/**
 * Server-only radar gateway.
 *
 * Production path: set WEYRA_RADAR_TIMELINE_URL to a Weyra backend endpoint that
 * reads the authorised Météo-France radar data, converts/caches it as raster tiles,
 * and returns: { host, radar:{past:[{time,path}]}, provider:'meteofrance', cadenceMinutes:5 }.
 *
 * Until that converter exists, we expose RainViewer as an honest 10-minute fallback.
 * No provider secret is ever exposed to the browser.
 */
export async function GET() {
  const adapterUrl = process.env.WEYRA_RADAR_TIMELINE_URL;
  const upstream = adapterUrl || "https://api.rainviewer.com/public/weather-maps.json";

  try {
    const response = await fetch(upstream, {
      cache: "no-store",
      headers: adapterUrl && process.env.WEYRA_RADAR_ADAPTER_TOKEN
        ? { Authorization: `Bearer ${process.env.WEYRA_RADAR_ADAPTER_TOKEN}` }
        : undefined,
    });
    if (!response.ok) {
      return NextResponse.json({ error: "Radar upstream unavailable" }, { status: 502 });
    }

    const raw = (await response.json()) as Timeline;
    const past = raw.radar?.past ?? raw.past ?? [];
    if (!Array.isArray(past) || !past.length) {
      return NextResponse.json({ error: "Radar timeline contains no frames" }, { status: 502 });
    }

    return NextResponse.json({
      host: raw.host ?? "",
      radar: { past },
      provider: raw.provider ?? (adapterUrl ? "weyra-adapter" : "rainviewer"),
      cadenceMinutes: raw.cadenceMinutes ?? (adapterUrl ? 5 : 10),
      fetchedAt: Date.now(),
    }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch {
    return NextResponse.json({ error: "Radar gateway failed" }, { status: 502 });
  }
}
