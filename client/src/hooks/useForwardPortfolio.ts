import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface ForwardPosition {
  contractId: string;
  commodity: string;
  window: string;
  windowStart: string | null;
  windowEnd: string | null;
  settlementDate: string | null;
  role: 'long' | 'short';
  contractPrice: string;
  qtyTon: string;
  notional: string;
  initialMargin: string;
  status: string;
  realizedPnL: string;
  unrealizedPnL: string;
  totalPnL: string;
  createdAt: string;
  updatedAt: string;
}

export function useForwardPortfolio(enabled: boolean) {
  return useQuery<ForwardPosition[]>({
    queryKey: ["/api/portfolio/forwards/me"],
    enabled,
    queryFn: async () => {
      const resp = await apiRequest("GET", "/api/portfolio/forwards/me");
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load forward portfolio");
      }
      return resp.json();
    },
    refetchInterval: enabled ? 30000 : false,
  });
}