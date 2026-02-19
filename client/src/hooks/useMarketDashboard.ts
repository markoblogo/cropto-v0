import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface MarketIndexDto {
  seriesKey?: string;
  commodity: string;
  grade: string | null;
  country: "UA" | "BR" | "AR" | "US";
  basis: string;
  price: number;
  currency: "USD";
  change24h: number;
  change7d: number;
  change30d: number;
  asOf: string;
  source:
    | "spike_telegram"
    | "mock"
    | "manual"
    | "IGC"
    | "USDA_AMS"
    | "BARCHART_USDA"
    | "FUTURES_PROXY"
    | "CLAL"
    | "GRAINSPRICES"
    | "FSGRAIN"
    | "BCR"
    | "COMMODITY3"
    | "synthetic_model";
  sourceTier?: "primary" | "secondary" | "synthetic" | "last_known";
  dataStatus?: "fresh" | "stale" | "no_recent";
  priceStatus?: "fresh" | "stale" | "missing";
  lastFetchStatus?: "ok" | "failed" | "unknown";
  lastFetchError?: string | null;
  needsReview?: boolean;
  isMockData?: boolean;
  confidence?: "high" | "medium" | "low";
  freshnessDays?: number;
  isStale?: boolean;
  sourceType?: "official_api" | "official_file" | "public_html" | "editorial_article" | "internal";
  usagePolicy?: "open" | "restricted" | "unknown";
  visibility?: "public" | "internal_only";
  fetchedAt?: string;
  provider?: string;
  channel?: string;
  rawCommodity?: string;
  category?: "grain" | "oilseed" | "other";
  rawPrice?: number;
  rawUnit?: string;
  rawCurrency?: string;
  rawToUsdFxRate?: number;
  conversionNotes?: string;
  invalidReason?: string | null;
  alternatives?: Array<{
    provider: string;
    source: string;
    channel?: string;
    asOf: string;
    fetchedAt?: string;
    priceStatus?: string;
    lastFetchStatus?: string;
    sourceTier?: string;
  }>;
  // Optional IGC-specific fields
  dailyChange?: number; // alias for change24h (for backward compatibility)
  annualChange?: number;
  low52w?: number;
  high52w?: number;
}

export interface MarketDashboardResponse {
  ua: MarketIndexDto[];
  br: MarketIndexDto[];
  ar: MarketIndexDto[];
  us: MarketIndexDto[];
  seriesStatus?: {
    ua: Array<{
      country: "UA";
      key: string;
      commodity: string;
      basis: string;
      status: "fresh" | "stale" | "no_recent";
      sourceTier?: "primary" | "secondary" | "synthetic" | "last_known";
      source?: string;
      asOf?: string;
      freshnessDays?: number;
    }>;
    br: Array<{
      country: "BR";
      key: string;
      commodity: string;
      basis: string;
      status: "fresh" | "stale" | "no_recent";
      sourceTier?: "primary" | "secondary" | "synthetic" | "last_known";
      source?: string;
      asOf?: string;
      freshnessDays?: number;
    }>;
    ar: Array<{
      country: "AR";
      key: string;
      commodity: string;
      basis: string;
      status: "fresh" | "stale" | "no_recent";
      sourceTier?: "primary" | "secondary" | "synthetic" | "last_known";
      source?: string;
      asOf?: string;
      freshnessDays?: number;
    }>;
    us: Array<{
      country: "US";
      key: string;
      commodity: string;
      basis: string;
      status: "fresh" | "stale" | "no_recent";
      sourceTier?: "primary" | "secondary" | "synthetic" | "last_known";
      source?: string;
      asOf?: string;
      freshnessDays?: number;
    }>;
  };
  debugSources?: Array<Record<string, unknown>>;
  marketHealth?: {
    ua: { status: "OK" | "WARN" | "FAIL"; lastSuccessfulUpdate: string | null; source: string | null };
    br: { status: "OK" | "WARN" | "FAIL"; lastSuccessfulUpdate: string | null; source: string | null };
    ar: { status: "OK" | "WARN" | "FAIL"; lastSuccessfulUpdate: string | null; source: string | null };
    us: { status: "OK" | "WARN" | "FAIL"; lastSuccessfulUpdate: string | null; source: string | null };
  };
  dataAlerts?: {
    br: string | null;
    ar: string | null;
    us: string | null;
  };
}

export function useMarketDashboard() {
  const debugSources = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debugSources") === "1";
  return useQuery<MarketDashboardResponse>({
    queryKey: ["/api/market-dashboard", debugSources ? "debugSources=1" : ""],
    queryFn: async () => {
      const resp = await apiRequest("GET", debugSources ? "/api/market-dashboard?debugSources=1" : "/api/market-dashboard");
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load market dashboard");
      }
      return resp.json();
    },
    staleTime: 60000, // 1 minute
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}
