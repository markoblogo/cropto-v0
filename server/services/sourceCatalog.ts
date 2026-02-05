export type SourceKey = "IGC" | "USDA_AMS" | "spike_telegram" | "manual" | "mock" | "synthetic_model";
export type SourceType = "official_api" | "official_file" | "public_html" | "editorial_article" | "internal";
export type UsagePolicy = "open" | "restricted" | "unknown";
export type Visibility = "public" | "internal_only";

export interface SourceDescriptor {
  key: SourceKey;
  priority: number;
  sourceType: SourceType;
  usagePolicy: UsagePolicy;
  visibility: Visibility;
}

const CATALOG: Record<SourceKey, SourceDescriptor> = {
  USDA_AMS: {
    key: "USDA_AMS",
    priority: 100,
    sourceType: "official_file",
    usagePolicy: "open",
    visibility: "public",
  },
  IGC: {
    key: "IGC",
    priority: 90,
    sourceType: "public_html",
    usagePolicy: "restricted",
    visibility: "public",
  },
  spike_telegram: {
    key: "spike_telegram",
    priority: 70,
    sourceType: "internal",
    usagePolicy: "open",
    visibility: "public",
  },
  manual: {
    key: "manual",
    priority: 60,
    sourceType: "internal",
    usagePolicy: "open",
    visibility: "public",
  },
  mock: {
    key: "mock",
    priority: 10,
    sourceType: "internal",
    usagePolicy: "open",
    visibility: "public",
  },
  synthetic_model: {
    key: "synthetic_model",
    priority: 20,
    sourceType: "internal",
    usagePolicy: "open",
    visibility: "public",
  },
};

export function getSourceDescriptor(source: string): SourceDescriptor {
  const key = source as SourceKey;
  return CATALOG[key] || CATALOG.manual;
}
