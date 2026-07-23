import type { LocationSelection, WeatherSnapshot } from "@/lib/types";

export type AlertLevel = "info" | "attention" | "fort";
export type AlertCategory = "pluie" | "orage" | "vent";

export type LocalAlert = {
  id: string;
  category: AlertCategory;
  title: string;
  zone: string;
  time: string;
  level: AlertLevel;
};

// Open-Meteo WMO weather codes for thunderstorms (see lib/weather.ts WEATHER_CODES): 95 plain,
// 96 with hail, 99 violent — hail/violent both read as the top severity bucket.
const THUNDER_LEVEL: Partial<Record<number, AlertLevel>> = { 95: "attention", 96: "fort", 99: "fort" };

// Derives simple, non-official alerts from weather data the app already fetched for the
// displayed location (lib/weather.ts fetchWeather) — no external alert feed involved.
export function deriveLocalAlerts(weather: WeatherSnapshot | null, location: LocationSelection): LocalAlert[] {
  if (!weather) return [];
  const zone = location.name;
  const alerts: LocalAlert[] = [];

  if (weather.precipitation >= 7.5) {
    alerts.push({ id: "pluie", category: "pluie", title: "Pluie forte", zone, time: weather.observedAt, level: "fort" });
  } else if (weather.precipitation >= 2.5) {
    alerts.push({ id: "pluie", category: "pluie", title: "Pluie soutenue", zone, time: weather.observedAt, level: "attention" });
  } else if (weather.precipitation >= 0.5) {
    alerts.push({ id: "pluie", category: "pluie", title: "Pluie légère", zone, time: weather.observedAt, level: "info" });
  }

  const thunderLevel = THUNDER_LEVEL[weather.weatherCode];
  if (thunderLevel) {
    const title = weather.weatherCode === 96 ? "Orage avec grêle" : weather.weatherCode === 99 ? "Orage violent" : "Orage";
    alerts.push({ id: "orage", category: "orage", title, zone, time: weather.observedAt, level: thunderLevel });
  }

  if (weather.windGusts >= 80) {
    alerts.push({ id: "vent", category: "vent", title: "Rafales très fortes", zone, time: weather.observedAt, level: "fort" });
  } else if (weather.windGusts >= 50) {
    alerts.push({ id: "vent", category: "vent", title: "Rafales fortes", zone, time: weather.observedAt, level: "attention" });
  } else if (weather.windGusts >= 35) {
    alerts.push({ id: "vent", category: "vent", title: "Vent soutenu", zone, time: weather.observedAt, level: "info" });
  }

  return alerts;
}
