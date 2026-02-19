export type SourceKey =
  | "IGC"
  | "USDA_AMS"
  | "BARCHART_USDA"
  | "FUTURES_PROXY"
  | "CLAL"
  | "GRAINSPRICES"
  | "FSGRAIN"
  | "BCR"
  | "COMMODITY3"
  | "spike_telegram"
  | "manual"
  | "mock"
  | "synthetic_model";
export type SourceType = "official_api" | "official_file" | "public_html" | "editorial_article" | "internal";
export type UsagePolicy = "open" | "restricted" | "unknown";
export type Visibility = "public" | "internal_only";

export interface SourceDescriptor {
  key: SourceKey;
  vendor: string;
  channel: string;
  label: string;
  priority: number;
  sourceType: SourceType;
  usagePolicy: UsagePolicy;
  visibility: Visibility;
}

const CATALOG: Record<SourceKey, SourceDescriptor> = {
  USDA_AMS: {
    key: "USDA_AMS",
    vendor: "USDA",
    channel: "AMS",
    label: "USDA (AMS)",
    priority: 100,
    sourceType: "official_file",
    usagePolicy: "open",
    visibility: "public",
  },
  IGC: {
    key: "IGC",
    vendor: "IGC",
    channel: "HTML_PAGE",
    label: "IGC (HTML_PAGE)",
    priority: 90,
    sourceType: "public_html",
    usagePolicy: "restricted",
    visibility: "public",
  },
  BARCHART_USDA: {
    key: "BARCHART_USDA",
    vendor: "BARCHART",
    channel: "USDA_FEED",
    label: "Barchart (USDA_FEED)",
    priority: 95,
    sourceType: "public_html",
    usagePolicy: "open",
    visibility: "public",
  },
  FUTURES_PROXY: {
    key: "FUTURES_PROXY",
    vendor: "FUTURES_PROXY",
    channel: "STATIC",
    label: "Futures Proxy (STATIC)",
    priority: 85,
    sourceType: "public_html",
    usagePolicy: "open",
    visibility: "public",
  },
  CLAL: {
    key: "CLAL",
    vendor: "CLAL",
    channel: "TESEO",
    label: "CLAL (TESEO)",
    priority: 92,
    sourceType: "public_html",
    usagePolicy: "open",
    visibility: "public",
  },
  GRAINSPRICES: {
    key: "GRAINSPRICES",
    vendor: "GRAINSPRICES",
    channel: "HTML_PAGE",
    label: "GrainsPrices (HTML_PAGE)",
    priority: 88,
    sourceType: "public_html",
    usagePolicy: "open",
    visibility: "public",
  },
  FSGRAIN: {
    key: "FSGRAIN",
    vendor: "FSGRAIN",
    channel: "HTML_PAGE",
    label: "FSGrain (HTML_PAGE)",
    priority: 89,
    sourceType: "public_html",
    usagePolicy: "open",
    visibility: "public",
  },
  BCR: {
    key: "BCR",
    vendor: "BCR",
    channel: "HTML_PAGE",
    label: "BCR (HTML_PAGE)",
    priority: 94,
    sourceType: "public_html",
    usagePolicy: "open",
    visibility: "public",
  },
  COMMODITY3: {
    key: "COMMODITY3",
    vendor: "COMMODITY3",
    channel: "HTML_PAGE",
    label: "Commodity3 (HTML_PAGE)",
    priority: 87,
    sourceType: "public_html",
    usagePolicy: "open",
    visibility: "public",
  },
  spike_telegram: {
    key: "spike_telegram",
    vendor: "SPIKE",
    channel: "TELEGRAM",
    label: "SPIKE (TELEGRAM)",
    priority: 70,
    sourceType: "internal",
    usagePolicy: "open",
    visibility: "public",
  },
  manual: {
    key: "manual",
    vendor: "MANUAL",
    channel: "MANUAL",
    label: "Manual",
    priority: 60,
    sourceType: "internal",
    usagePolicy: "open",
    visibility: "public",
  },
  mock: {
    key: "mock",
    vendor: "MOCK",
    channel: "MOCK",
    label: "Mock",
    priority: 10,
    sourceType: "internal",
    usagePolicy: "open",
    visibility: "public",
  },
  synthetic_model: {
    key: "synthetic_model",
    vendor: "SYNTHETIC",
    channel: "MODEL",
    label: "Synthetic (MODEL)",
    priority: 20,
    sourceType: "internal",
    usagePolicy: "open",
    visibility: "public",
  },
};

export function getSourceDescriptor(source: string): SourceDescriptor {
  const normalized = source === "TESEO_CLAL" ? "CLAL" : source;
  const key = normalized as SourceKey;
  return CATALOG[key] || CATALOG.manual;
}
