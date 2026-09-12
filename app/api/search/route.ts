export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") || "";
  if (q.length < 2 || q.length > 100) return Response.json({ results: [] });
  try {
    const r = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=fr&format=json`,
      { signal: AbortSignal.timeout(7000) },
    );
    if (!r.ok) throw new Error();
    return Response.json(await r.json(), { headers: { "Cache-Control": "public,max-age=3600" } });
  } catch {
    return Response.json({ error: "Recherche indisponible", results: [] }, { status: 503 });
  }
}
