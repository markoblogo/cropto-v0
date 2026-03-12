import type { MonitorNewsItem } from "./types";
import { AGRO_REGIONS, type AgroRegionCrop } from "./agroRegionsConfig";

type WeatherRiskFeature = {
  id: string;
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: {
    name: string;
    region_id: string;
    crop: AgroRegionCrop;
    stress_score: number;
    stress_level: "low" | "medium" | "high";
    metrics: {
      rainfall_anomaly_30d: number;
      temp_anomaly_30d_c: number;
      soil_moisture_percentile: number;
      ndvi_anomaly: number;
      yield_deviation: number;
    };
    weather_event_count_7d: number;
  };
};

type WeatherRiskLayer = {
  layer_id: "weather_yield_risk";
  layer_type: "region";
  updated_at: string;
  legend: {
    metric: "stress_score";
    unit: "index_0_100";
    scale: "sequential";
    min: 0;
    max: 100;
  };
  features: WeatherRiskFeature[];
  note: string;
};

type WeatherRiskDetails = {
  region_id: string;
  crop: AgroRegionCrop;
  name: string;
  stress_score: number;
  stress_level: "low" | "medium" | "high";
  metrics: {
    rainfall_anomaly_30d: number;
    temp_anomaly_30d_c: number;
    soil_moisture_percentile: number;
    ndvi_anomaly: number;
    yield_deviation: number;
  };
  timeseries: {
    rainfall_vs_norm: Array<{ date: string; actual: number; normal: number }>;
    ndvi_vs_median: Array<{ date: string; actual: number; median: number }>;
  };
  news: Array<{
    id: string;
    source: string;
    title: string;
    published_at: string;
    url?: string;
  }>;
};

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function normalizedCrop(input?: string): AgroRegionCrop | "all" {
  const token = String(input || "all").toLowerCase();
  if (token === "all") return "all";
  if (token === "wheat") return "wheat";
  if (token === "corn" || token === "maize") return "corn";
  if (token === "soy" || token === "soybeans") return "soybeans";
  if (token === "spring_wheat") return "spring_wheat";
  if (token === "corn_second_crop" || token === "safrinha") return "corn_second_crop";
  return "all";
}

function cropHints(crop: AgroRegionCrop): string[] {
  if (crop === "wheat" || crop === "spring_wheat") return ["wheat", "spring wheat"];
  if (crop === "corn" || crop === "corn_second_crop") return ["corn", "maize", "safrinha"];
  if (crop === "soybeans") return ["soy", "soybean", "soybeans"];
  return [crop];
}

function countRegionalWeatherEvents(news: MonitorNewsItem[], countries: string[], crop: AgroRegionCrop) {
  const cropWords = cropHints(crop);
  return news.filter((item) => {
    const tags = (item.topic_tags || []).map((tag) => tag.toLowerCase());
    if (!tags.includes("weather")) return false;
    const text = `${item.title || ""} ${item.summary || ""}`.toLowerCase();
    const countryHit = countries.some((country) => text.includes(country.toLowerCase()));
    const cropHit = cropWords.some((word) => text.includes(word));
    return countryHit || cropHit;
  }).length;
}

function score(metrics: {
  rainfall_anomaly_30d: number;
  temp_anomaly_30d_c: number;
  soil_moisture_percentile: number;
  ndvi_anomaly: number;
  yield_deviation: number;
}, eventBoost: number) {
  const rain = clamp(Math.max(0, -metrics.rainfall_anomaly_30d) / 0.35, 0, 1) * 24;
  const temp = clamp(Math.max(0, metrics.temp_anomaly_30d_c) / 4.5, 0, 1) * 22;
  const soil = clamp((45 - metrics.soil_moisture_percentile) / 45, 0, 1) * 24;
  const ndvi = clamp(Math.max(0, -metrics.ndvi_anomaly) / 0.15, 0, 1) * 18;
  const yieldPart = clamp(Math.max(0, -metrics.yield_deviation) / 0.12, 0, 1) * 12;
  return Math.round(clamp(rain + temp + soil + ndvi + yieldPart + eventBoost, 0, 100));
}

function stressLevel(scoreValue: number): "low" | "medium" | "high" {
  if (scoreValue >= 65) return "high";
  if (scoreValue >= 40) return "medium";
  return "low";
}

function buildTimeseries(metrics: WeatherRiskDetails["metrics"], points = 12) {
  const now = new Date();
  const rainfall_vs_norm: Array<{ date: string; actual: number; normal: number }> = [];
  const ndvi_vs_median: Array<{ date: string; actual: number; median: number }> = [];
  for (let i = points - 1; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - i * 7);
    const wave = Math.sin((points - i) / 2.8);
    const normalRain = 8 + (i % 4) * 0.6;
    const rainActual = clamp(normalRain * (1 + metrics.rainfall_anomaly_30d * 0.8 + wave * 0.08), 0.4, 40);
    const medianNdvi = 0.62 + Math.cos((points - i) / 4.2) * 0.03;
    const ndviActual = clamp(medianNdvi * (1 + metrics.ndvi_anomaly * 0.7 + wave * 0.02), 0.2, 0.95);
    rainfall_vs_norm.push({
      date: date.toISOString().slice(0, 10),
      actual: Number(rainActual.toFixed(2)),
      normal: Number(normalRain.toFixed(2)),
    });
    ndvi_vs_median.push({
      date: date.toISOString().slice(0, 10),
      actual: Number(ndviActual.toFixed(3)),
      median: Number(medianNdvi.toFixed(3)),
    });
  }
  return { rainfall_vs_norm, ndvi_vs_median };
}

function relevantNews(news: MonitorNewsItem[], countries: string[], crop: AgroRegionCrop) {
  const words = cropHints(crop);
  return news
    .filter((item) => {
      const text = `${item.title || ""} ${item.summary || ""}`.toLowerCase();
      const countryHit = countries.some((country) => text.includes(country.toLowerCase()) || text.includes(country.toLowerCase().replace("_", " ")));
      const cropHit = words.some((word) => text.includes(word));
      return countryHit || cropHit;
    })
    .sort((a, b) => Date.parse(b.published_at || "") - Date.parse(a.published_at || ""))
    .slice(0, 3)
    .map((item) => ({
      id: item.id,
      source: item.source_name,
      title: item.title,
      published_at: item.published_at,
      url: item.url,
    }));
}

export function buildWeatherYieldRiskLayer(args: { news: MonitorNewsItem[]; crop?: string }): WeatherRiskLayer {
  const crop = normalizedCrop(args.crop);
  const features: WeatherRiskFeature[] = [];
  AGRO_REGIONS.forEach((region) => {
    const crops = crop === "all" ? region.crops : region.crops.filter((candidate) => candidate === crop);
    crops.forEach((cropId) => {
      const eventCount = countRegionalWeatherEvents(args.news, region.countries, cropId);
      const eventBoost = Math.min(14, eventCount * 2.5);
      const stressScore = score(region.baseline, eventBoost);
      features.push({
        id: `${region.region_id}_${cropId}`,
        geometry: { type: "Point", coordinates: region.centroid },
        properties: {
          name: `${region.name} - ${cropId}`,
          region_id: region.region_id,
          crop: cropId,
          stress_score: stressScore,
          stress_level: stressLevel(stressScore),
          metrics: { ...region.baseline },
          weather_event_count_7d: eventCount,
        },
      });
    });
  });

  return {
    layer_id: "weather_yield_risk",
    layer_type: "region",
    updated_at: new Date().toISOString(),
    legend: {
      metric: "stress_score",
      unit: "index_0_100",
      scale: "sequential",
      min: 0,
      max: 100,
    },
    features,
    note: "Indicative weather-yield risk from regional baselines + current weather-event flow.",
  };
}

export function getWeatherYieldRiskDetails(args: {
  news: MonitorNewsItem[];
  regionId: string;
  crop: string;
}): WeatherRiskDetails | null {
  const region = AGRO_REGIONS.find((candidate) => candidate.region_id === args.regionId);
  if (!region) return null;
  const crop = normalizedCrop(args.crop);
  if (crop === "all" || !region.crops.includes(crop)) return null;
  const eventCount = countRegionalWeatherEvents(args.news, region.countries, crop);
  const eventBoost = Math.min(14, eventCount * 2.5);
  const stressScore = score(region.baseline, eventBoost);
  return {
    region_id: region.region_id,
    crop,
    name: `${region.name} - ${crop}`,
    stress_score: stressScore,
    stress_level: stressLevel(stressScore),
    metrics: { ...region.baseline },
    timeseries: buildTimeseries(region.baseline),
    news: relevantNews(args.news, region.countries, crop),
  };
}

