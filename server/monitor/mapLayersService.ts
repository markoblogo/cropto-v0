import { CHOKEPOINTS_CONFIG, toChokepointStatus, toSeverityLevel } from "./chokepointsConfig";

type CountryCode = "US" | "UA" | "BR" | "AR" | "FR" | "DE" | "RO";

type MapMetric = {
  code: string;
  label: string;
  value: number | null;
  unit: string;
  yoy_change: number | null;
  mom_change: number | null;
  severity: "low" | "medium" | "high";
  source: "WFP" | "WB";
};

type MapFeature = {
  id: string;
  geometry: {
    type: "CountryCentroid";
    coordinates: [number, number];
  };
  properties: {
    name: string;
    type: "country";
    metrics: MapMetric[];
  };
};

type MapLayerResponse = {
  layer_id: string;
  layer_type: "country";
  updated_at: string;
  legend: {
    metric: "yoy_change";
    unit: "%";
    scale: "diverging";
    min: number;
    max: number;
  };
  features: MapFeature[];
  note?: string;
};

type ChokepointFeature = {
  id: string;
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: {
    name: string;
    type: "chokepoint";
    status: "normal" | "stressed" | "critical";
    severity_level: 1 | 2 | 3;
    metrics: {
      traffic_ratio: number;
      baseline: number;
      current: number;
      unit: string;
      as_of: string;
    };
    region: string;
    summary: string;
    source_url: string;
    source_name: string;
  };
};

type ChokepointsMapLayerResponse = {
  layer_id: string;
  layer_type: "point";
  updated_at: string;
  legend: {
    metric: "traffic_ratio";
    unit: "ratio";
    scale: "threshold";
    min: number;
    max: number;
  };
  features: ChokepointFeature[];
  note?: string;
};

const COUNTRY_CONFIG: Record<CountryCode, { name: string; centroid: [number, number] }> = {
  US: { name: "United States", centroid: [-98.5, 39.8] },
  UA: { name: "Ukraine", centroid: [31.4, 49.0] },
  BR: { name: "Brazil", centroid: [-52.8, -10.8] },
  AR: { name: "Argentina", centroid: [-63.8, -36.7] },
  FR: { name: "France", centroid: [2.4, 46.5] },
  DE: { name: "Germany", centroid: [10.4, 51.1] },
  RO: { name: "Romania", centroid: [24.9, 45.9] },
};

const CROP_ALIAS: Record<string, string[]> = {
  wheat: ["WHEAT"],
  maize: ["MAIZE", "CORN"],
  rice: ["RICE"],
  soy: ["SOY", "SOYBEAN"],
  oil: ["SUNFLOWER", "RAPESEED"],
  oilseeds: ["SUNFLOWER", "RAPESEED", "SOY", "SOYBEAN"],
};

function normalizeCommodities(input?: string): Set<string> {
  const result = new Set<string>();
  const raw = String(input || "wheat,maize,rice,oilseeds")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  for (const token of raw) {
    if (CROP_ALIAS[token]) {
      CROP_ALIAS[token].forEach((crop) => result.add(crop));
      continue;
    }
    result.add(token.toUpperCase());
  }
  return result.size ? result : new Set(["WHEAT", "MAIZE", "RICE", "SUNFLOWER", "RAPESEED", "SOY", "SOYBEAN"]);
}

function asFraction(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (Math.abs(n) > 1) return n / 100;
  return n;
}

function severityFromChange(change: number | null): "low" | "medium" | "high" {
  const abs = Math.abs(Number(change || 0));
  if (abs >= 0.25) return "high";
  if (abs >= 0.1) return "medium";
  return "low";
}

function metricFromRow(row: any, source: "WFP" | "WB"): MapMetric | null {
  if (!row || typeof row !== "object") return null;
  const code = String(row.crop || "").toUpperCase();
  const value = Number.isFinite(Number(row.current)) ? Number(row.current) : null;
  const unit = String(row.unit || "");
  const yoy = asFraction(row.changePct);
  const mom = asFraction(row.changeAbs);
  return {
    code,
    label: String(row.label || code || "Commodity"),
    value,
    unit,
    yoy_change: yoy,
    mom_change: mom,
    severity: severityFromChange(yoy),
    source,
  };
}

function latestUpdatedAt(widgets: any[]): string {
  const times = widgets
    .map((widget) => Date.parse(String(widget?.updatedAt || "")))
    .filter((ts) => Number.isFinite(ts))
    .sort((a, b) => b - a);
  return times.length ? new Date(times[0]).toISOString() : new Date().toISOString();
}

export async function getFoodPricesMapLayer(args: {
  grainWidgetsService: { list: (params?: any) => Promise<any> };
  forceRefresh?: boolean;
  commodities?: string;
  countries?: string[];
}): Promise<MapLayerResponse> {
  const commodityFilter = normalizeCommodities(args.commodities);
  const countryList = (args.countries?.length ? args.countries : Object.keys(COUNTRY_CONFIG))
    .map((code) => String(code).toUpperCase())
    .filter((code): code is CountryCode => code in COUNTRY_CONFIG);

  const features: MapFeature[] = [];
  const updatedWidgets: any[] = [];

  await Promise.all(
    countryList.map(async (countryCode) => {
      try {
        const payload = await args.grainWidgetsService.list({ country: countryCode, forceRefresh: Boolean(args.forceRefresh) });
        const byKind = payload?.widgets?.byKind || {};
        const wfpWidget = byKind.WFP_MARKET_PRICES_MULTI_COUNTRY;
        const wbWidget = byKind.WB_MICRODATA_MARKET_PRICES;
        updatedWidgets.push(wfpWidget, wbWidget);
        const rows = [
          ...(Array.isArray(wfpWidget?.rows) ? wfpWidget.rows.map((row: any) => ({ row, source: "WFP" as const })) : []),
          ...(Array.isArray(wbWidget?.rows) ? wbWidget.rows.map((row: any) => ({ row, source: "WB" as const })) : []),
        ]
          .map((item) => metricFromRow(item.row, item.source))
          .filter((metric): metric is MapMetric => Boolean(metric))
          .filter((metric) => commodityFilter.has(metric.code));
        if (!rows.length) return;
        features.push({
          id: countryCode,
          geometry: {
            type: "CountryCentroid",
            coordinates: COUNTRY_CONFIG[countryCode].centroid,
          },
          properties: {
            name: COUNTRY_CONFIG[countryCode].name,
            type: "country",
            metrics: rows.slice(0, 6),
          },
        });
      } catch {
        // Skip country on upstream failure; layer stays available with partial data.
      }
    }),
  );

  return {
    layer_id: "food_prices_wfp",
    layer_type: "country",
    updated_at: latestUpdatedAt(updatedWidgets),
    legend: {
      metric: "yoy_change",
      unit: "%",
      scale: "diverging",
      min: -0.5,
      max: 1.0,
    },
    features,
    note: features.length
      ? "Country layer built from WFP/WB local market rows in grain widgets."
      : "No country rows found for selected commodities.",
  };
}

function chokepointsUpdatedAt(features: ChokepointFeature[]): string {
  const timestamps = features
    .map((feature) => Date.parse(feature.properties.metrics.as_of))
    .filter((value) => Number.isFinite(value));
  if (timestamps.length === 0) return new Date().toISOString();
  return new Date(Math.max(...timestamps)).toISOString();
}

export async function getChokepointsMapLayer(): Promise<ChokepointsMapLayerResponse> {
  const features: ChokepointFeature[] = CHOKEPOINTS_CONFIG.map((point) => {
    const baseline = Number(point.baseline.value) || 0;
    const current = Number(point.current.value) || 0;
    const trafficRatio = baseline > 0 ? Number((current / baseline).toFixed(4)) : 0;
    const status = toChokepointStatus(trafficRatio);
    const severityLevel = toSeverityLevel(trafficRatio);
    return {
      id: point.id,
      geometry: {
        type: "Point",
        coordinates: point.coordinates,
      },
      properties: {
        name: point.name,
        type: "chokepoint",
        status,
        severity_level: severityLevel,
        metrics: {
          traffic_ratio: trafficRatio,
          baseline,
          current,
          unit: point.baseline.metric === "ship_transits_per_day" ? "ships/day" : "Mt/month",
          as_of: point.current.as_of,
        },
        region: point.region,
        summary: point.summary,
        source_url: point.current.source_url || point.baseline.source_url,
        source_name: point.current.source_name || point.baseline.source_name,
      },
    };
  });

  return {
    layer_id: "chokepoints",
    layer_type: "point",
    updated_at: chokepointsUpdatedAt(features),
    legend: {
      metric: "traffic_ratio",
      unit: "ratio",
      scale: "threshold",
      min: 0,
      max: 1.2,
    },
    features,
    note: "Manual/semi-automated chokepoint baseline vs current traffic ratios for logistics stress monitoring.",
  };
}
