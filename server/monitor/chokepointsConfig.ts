export type ChokepointStatus = "normal" | "stressed" | "critical";
export type ChokepointType = "canal" | "strait" | "sea_area";

export type ChokepointConfigRow = {
  id: string;
  name: string;
  coordinates: [number, number];
  region: string;
  type: ChokepointType;
  baseline: {
    metric: "ship_transits_per_day" | "monthly_cargo_million_tons";
    value: number;
    source_name: string;
    source_url: string;
    notes?: string;
  };
  current: {
    value: number;
    source_name: string;
    source_url: string;
    as_of: string;
  };
  summary: string;
};

export const CHOKEPOINTS_CONFIG: ChokepointConfigRow[] = [
  {
    id: "panama_canal",
    name: "Panama Canal",
    coordinates: [-79.9, 9.1],
    region: "Global",
    type: "canal",
    baseline: {
      metric: "ship_transits_per_day",
      value: 35,
      source_name: "Panama Canal Authority historical average",
      source_url: "https://pancanal.com/en/statistics/",
      notes: "Average daily oceangoing transits pre-drought (2017-2021)",
    },
    current: {
      value: 27.7,
      source_name: "Panama Canal Authority / monthly commercial traffic",
      source_url: "https://pancanal.com/en/statistics/",
      as_of: "2026-03-01",
    },
    summary: "Traffic remains below normal due to residual water constraints and managed transit slots.",
  },
  {
    id: "suez_canal",
    name: "Suez Canal",
    coordinates: [32.3, 30.4],
    region: "Global",
    type: "canal",
    baseline: {
      metric: "ship_transits_per_day",
      value: 50,
      source_name: "PortEconomics baseline (pre-disruption average)",
      source_url: "https://porteconomicsmanagement.org/pemp/contents/part1/interoceanic-passages/tonnage-number-transits-suez-canal/",
    },
    current: {
      value: 31.5,
      source_name: "Suez Canal Authority / public shipping updates",
      source_url: "https://shippingtelegraph.com/shipping-reports/suez-canal-sees-1315-ships-and-449m-in-revenue-since-2026/",
      as_of: "2026-03-01",
    },
    summary: "Transit and tonnage are still stressed versus pre-crisis norms across Red Sea-linked flows.",
  },
  {
    id: "strait_of_hormuz",
    name: "Strait of Hormuz",
    coordinates: [56.3, 26.4],
    region: "Middle East",
    type: "strait",
    baseline: {
      metric: "ship_transits_per_day",
      value: 138,
      source_name: "Pre-conflict average daily ship traffic",
      source_url: "https://www.shiptraffic.net/2001/04/hormuz-strait-ship-traffic.html",
    },
    current: {
      value: 8.3,
      source_name: "Argus / conflict-period ship traffic update",
      source_url: "https://www.argusmedia.com/en/news-and-insights/latest-market-news/2795597-hormuz-ship-traffic-down-94pc-since-iran-conflict-began",
      as_of: "2026-03-01",
    },
    summary: "Traffic is at critical levels versus baseline amid sustained geopolitical risk.",
  },
  {
    id: "black_sea_routes",
    name: "Black Sea & Danube Routes",
    coordinates: [30.7, 46.5],
    region: "Black Sea",
    type: "sea_area",
    baseline: {
      metric: "monthly_cargo_million_tons",
      value: 6.0,
      source_name: "Pre-war average monthly grains/oilseeds corridor throughput",
      source_url: "https://unctad.org/news/black-sea-grain-initiative-what-it-and-why-its-important-world",
    },
    current: {
      value: 3.2,
      source_name: "Solidarity lanes and corridor public reporting",
      source_url: "https://transport.ec.europa.eu/news-events/news/solidarity-lanes-latest-figures-june-2025-2025-08-04_en",
      as_of: "2026-03-01",
    },
    summary: "Regional route remains stressed with uneven recovery and persistent corridor risk premium.",
  },
];

export const CHOKEPOINT_STATUS_RULES = {
  normalMin: 0.9,
  stressedMin: 0.7,
  criticalMin: 0.4,
};

export function toChokepointStatus(trafficRatio: number): ChokepointStatus {
  if (trafficRatio >= CHOKEPOINT_STATUS_RULES.normalMin) return "normal";
  if (trafficRatio >= CHOKEPOINT_STATUS_RULES.stressedMin) return "stressed";
  return "critical";
}

export function toSeverityLevel(trafficRatio: number): 1 | 2 | 3 {
  if (trafficRatio >= CHOKEPOINT_STATUS_RULES.normalMin) return 1;
  if (trafficRatio >= CHOKEPOINT_STATUS_RULES.criticalMin) return 2;
  return 3;
}
