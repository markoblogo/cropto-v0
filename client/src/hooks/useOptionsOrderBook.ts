import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { OrderBookLevel } from "./useSpotOrderBook";

export interface OptionsOrderBookResponse {
  commodity: string;
  windowLabel?: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

interface UseOptionsOrderBookParams {
  commodity: string;
  window?: string;
  depth?: number;
}

export function useOptionsOrderBook(params: UseOptionsOrderBookParams) {
  const { commodity, window, depth } = params;

  return useQuery<OptionsOrderBookResponse>({
    queryKey: ["/api/options/orderbook", commodity, window, depth],
    enabled: !!commodity,
    queryFn: async () => {
      const search = new URLSearchParams();
      search.set("commodity", commodity);
      if (window) search.set("window", window);
      if (depth) search.set("depth", String(depth));
      const res = await apiRequest("GET", `/api/options/orderbook?${search.toString()}`);
      return await res.json();
    },
    staleTime: 15_000,
  });
}

