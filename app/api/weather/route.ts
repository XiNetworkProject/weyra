export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const lat = Number(q.get("lat")),
    lon = Number(q.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
    return Response.json({ error: "Lieu invalide" }, { status: 400 });
  try {
    const r = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,weather_code&forecast_days=2&timezone=Europe%2FParis`,
      { signal: AbortSignal.timeout(10000) },
    );
    if (!r.ok) throw new Error("unavailable");
    return Response.json(await r.json(), { headers: { "Cache-Control": "public,max-age=600" } });
  } catch {
    return Response.json({ error: "La météo locale est momentanément indisponible." }, { status: 503 });
  }
}
