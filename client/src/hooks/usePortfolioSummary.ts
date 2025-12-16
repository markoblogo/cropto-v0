import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface PortfolioSummary {
  totalNotionalUsd: number;
  requiredMargin: number;
  currentMargin: number;
  realizedPnl: number;
  unrealizedPnl: number;
  healthPct: number;
}

export function usePortfolioSummary(enabled: boolean) {
  return useQuery<PortfolioSummary>({
    queryKey: ["/api/portfolio/summary"],
    enabled,
    queryFn: async () => {
      const resp = await apiRequest("GET", "/api/portfolio/summary");
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load portfolio summary");
      }
      return resp.json();
    },
    refetchInterval: enabled ? 30000 : false,
  });
}


