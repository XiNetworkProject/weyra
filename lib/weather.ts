import type { LocationSelection, WeatherSnapshot } from "@/lib/types";

export const WEATHER_CODES: Record<number, { label: string; icon: string }> = {
  0: { label: "Ciel dégagé", icon: "☀️" },
  1: { label: "Globalement dégagé", icon: "🌤️" },
  2: { label: "Partiellement nuageux", icon: "⛅" },
  3: { label: "Couvert", icon: "☁️" },
  45: { label: "Brouillard", icon: "🌫️" },
  48: { label: "Brouillard givrant", icon: "🌫️" },
  51: { label: "Bruine faible", icon: "🌦️" },
  53: { label: "Bruine modérée", icon: "🌦️" },
  55: { label: "Bruine dense", icon: "🌧️" },
  61: { label: "Pluie faible", icon: "🌦️" },
  63: { label: "Pluie modérée", icon: "🌧️" },
  65: { label: "Forte pluie", icon: "🌧️" },
  71: { label: "Neige faible", icon: "🌨️" },
  73: { label: "Neige modérée", icon: "🌨️" },
  75: { label: "Forte neige", icon: "❄️" },
  80: { label: "Averses faibles", icon: "🌦️" },
  81: { label: "Averses modérées", icon: "🌧️" },
  82: { label: "Averses fortes", icon: "⛈️" },
  85: { label: "Averses de neige", icon: "🌨️" },
  86: { label: "Fortes averses neigeuses", icon: "❄️" },
  95: { label: "Orage", icon: "⛈️" },
  96: { label: "Orage avec grêle", icon: "⛈️" },
  99: { label: "Orage violent", icon: "⛈️" },
};

export function weatherCodeInfo(code: number) {
  return WEATHER_CODES[code] ?? { label: "Conditions variables", icon: "🌦️" };
}

export async function fetchWeather(location: LocationSelection): Promise<WeatherSnapshot> {
  const params = new URLSearchParams({
    latitude: String(location.lat),
    longitude: String(location.lon),
    current:
      "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure",
    timezone: "auto",
  });

  // A hung request must never block the UI: the initial loading overlay waits on this promise.
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, { signal: AbortSignal.timeout(9_000) });
  if (!response.ok) throw new Error("Open-Meteo is unavailable");
  const json = await response.json();
  const current = json.current;

  return {
    temperature: current.temperature_2m,
    apparentTemperature: current.apparent_temperature,
    precipitation: current.precipitation ?? 0,
    weatherCode: current.weather_code,
    windSpeed: current.wind_speed_10m,
    windDirection: current.wind_direction_10m,
    windGusts: current.wind_gusts_10m,
    pressure: current.surface_pressure,
    observedAt: current.time,
  };
}

export async function searchLocations(query: string): Promise<LocationSelection[]> {
  if (query.trim().length < 3) return [];
  const params = new URLSearchParams({ name: query.trim(), count: "6", language: "fr", format: "json" });
  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`, { signal: AbortSignal.timeout(9_000) });
  if (!response.ok) return [];
  const json = await response.json();

  return (json.results ?? []).map((item: Record<string, unknown>) => ({
    name: String(item.name),
    country: item.country ? String(item.country) : undefined,
    admin: item.admin1 ? String(item.admin1) : undefined,
    lat: Number(item.latitude),
    lon: Number(item.longitude),
  }));
}
