import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface OptionsMarketRow {
  id: string;
  commodity: string;
  commoditySlug?: string | null;
  expiryWindowLabel: string;
  expirationDate: string | null;
  type: "CALL" | "PUT";
  qtyTons: number;
  strikePerTon: number;
  premiumPerTon: number;
  side: "SHORT" | "LONG";
}

export interface OptionsMarketResponse {
  options: OptionsMarketRow[];
}

interface UseOptionsMarketSnapshotParams {
  commodity?: string;
  window?: string;
  limit?: number;
}

export function useOptionsMarketSnapshot(params?: UseOptionsMarketSnapshotParams) {
  const hasToken = typeof window !== "undefined" && !!localStorage.getItem("cropto_token");

  const queryKey = useMemo(() => {
    const base = ["/api/options/market"];
    if (params?.commodity) base.push(`commodity=${params.commodity}`);
    if (params?.window) base.push(`window=${params.window}`);
    if (params?.limit) base.push(`limit=${params.limit}`);
    return base;
  }, [params?.commodity, params?.window, params?.limit]);

  const query = useQuery<OptionsMarketResponse>({
    queryKey,
    enabled: hasToken,
    retry: false,
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params?.commodity) searchParams.set("commodity", params.commodity);
      if (params?.window) searchParams.set("window", params.window);
      if (params?.limit) searchParams.set("limit", params.limit.toString());

      const qs = searchParams.toString();
      const url = qs ? `/api/options/market?${qs}` : "/api/options/market";
      const res = await apiRequest("GET", url);
      return (await res.json()) as OptionsMarketResponse;
    },
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    isFetching: query.isFetching,
  };
}

