import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface MarketIndexDto {
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
  source: "spike_telegram" | "mock" | "manual" | "IGC" | "USDA_AMS";
  confidence?: "high" | "medium" | "low";
  freshnessDays?: number;
  isStale?: boolean;
  sourceType?: "official_api" | "official_file" | "public_html" | "editorial_article" | "internal";
  usagePolicy?: "open" | "restricted" | "unknown";
  visibility?: "public" | "internal_only";
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
}

export function useMarketDashboard() {
  return useQuery<MarketDashboardResponse>({
    queryKey: ["/api/market-dashboard"],
    queryFn: async () => {
      const resp = await apiRequest("GET", "/api/market-dashboard");
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load market dashboard");
      }
      return resp.json();
    },
    staleTime: 60000, // 1 minute
    retry: 1,
  });
}
