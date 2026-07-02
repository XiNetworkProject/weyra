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

export type ObservationCategory = "pluie" | "orage" | "grêle" | "rafales" | "neige" | "nuage";

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
