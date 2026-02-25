export type FeedSourceCategory =
  | "agro-general"
  | "grain-oilseeds"
  | "logistics-shipping"
  | "policy-macro"
  | "internal-cropto";

export type ParsingStrategy = "rss" | "atom" | "json" | "html";

export type MonitorSource = {
  id: string;
  name: string;
  url: string;
  category: FeedSourceCategory;
  strategy: ParsingStrategy;
  enabled: boolean;
};

export type MonitorFeatureFlags = {
  ENABLE_GEO_WIDGETS: boolean;
  ENABLE_AI_SUMMARIZATION: boolean;
  ENABLE_MACRO_WIDGETS: boolean;
  ENABLE_CROPTO_INDICES: boolean;
  ENABLE_LOGISTICS_PANEL: boolean;
  ENABLE_WEATHER_PLACEHOLDER: boolean;
  ENABLE_DEBUG_DASHBOARD: boolean;
  ENABLE_LIVE_VISUALS: boolean;
};

export type MonitorNewsItem = {
  id: string;
  title: string;
  summary?: string;
  url: string;
  source_name: string;
  source_type: "rss" | "api" | "html" | "internal";
  published_at: string;
  lang: string;
  topic_tags: string[];
  crop_tags: string[];
  region_tags: string[];
  relevance_score: number;
  dedup_cluster_id?: string;
  raw_keywords_matched?: string[];
  is_top_signal?: boolean;
  category: FeedSourceCategory;
};

export type MonitorIngestStats = {
  sourceCount: number;
  enabledSourceCount: number;
  fetchedItems: number;
  acceptedItems: number;
  droppedByScore: number;
  droppedByTime: number;
  duplicatesDropped: number;
  sourceErrors: Array<{ sourceId: string; message: string }>;
  sourceAcceptedCounts: Record<string, number>;
  sourceNoiseCounts: Record<string, number>;
  generatedAt: string;
};

export type MonitorIndexPoint = {
  slug: string;
  name: string;
  value: number;
  change?: number;
  updatedAt: string;
  source: string;
};

export type LiveVisualProviderType = "embedded" | "image_refresh" | "external_link";
export type LiveVisualStatus = "LIVE" | "REFRESH" | "EXTERNAL" | "OFFLINE";
export type LiveVisualCategory = "Port" | "Logistics" | "Weather" | "Market Media" | "Rail";

export type LiveVisualSourceConfig = {
  id: string;
  title: string;
  subtitle?: string;
  region: string;
  category: LiveVisualCategory;
  providerType: LiveVisualProviderType;
  sourceName: string;
  url: string;
  embedUrl?: string;
  imageUrl?: string;
  externalUrl?: string;
  previewImageUrl?: string;
  refreshIntervalSec?: number;
  enabled: boolean;
  priority: number;
  statusHint?: string;
  attribution?: string;
  tags?: string[];
};

export type LiveVisualTileData = {
  id: string;
  title: string;
  subtitle: string;
  category: LiveVisualCategory;
  region: string;
  providerType: LiveVisualProviderType;
  renderMode: "embed" | "image" | "external" | "fallback";
  status: LiveVisualStatus;
  sourceName: string;
  previewUrl?: string;
  externalUrl: string;
  refreshIntervalSec?: number;
  checkedAt: string;
  updatedAt?: string;
  statusHint?: string;
  attribution?: string;
  tags: string[];
  error?: string;
};
