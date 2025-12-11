import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface OrderBookLevel {
  price: number;
  quantity: number;
  type?: string;
}

export interface SpotOrderBookResponse {
  commodity: string;
  windowLabel?: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

interface UseSpotOrderBookParams {
  commodity: string;
  window?: string;
  depth?: number;
}

export function useSpotOrderBook(params: UseSpotOrderBookParams) {
  const { commodity, window, depth } = params;

  return useQuery<SpotOrderBookResponse>({
    queryKey: ["/api/spot/orderbook", commodity, window, depth],
    enabled: !!commodity,
    queryFn: async () => {
      const search = new URLSearchParams();
      search.set("commodity", commodity);
      if (window) search.set("window", window);
      if (depth) search.set("depth", String(depth));
      const res = await apiRequest("GET", `/api/spot/orderbook?${search.toString()}`);
      return await res.json();
    },
    staleTime: 15_000,
  });
}

