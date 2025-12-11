import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface RiskOverviewResponse {
  userRole?: string;
  metrics: {
    activeOptions: number;
    openMarginCalls: number;
    overdueMarginCalls: number;
    totalLockedCollateral: string;
  };
}

interface UseRiskOverviewOptions {
  enabled?: boolean;
}

export function useRiskOverview(options?: UseRiskOverviewOptions) {
  const { enabled = true } = options || {};

  const query = useQuery<RiskOverviewResponse>({
    queryKey: ["/api/risk/overview"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/risk/overview");
      return (await response.json()) as RiskOverviewResponse;
    },
    retry: false,
    enabled,
  });

  const status = (query.error as any)?.status as number | undefined;

  return {
    ...query,
    status,
    isUnauthorized: status === 401,
    isForbidden: status === 403,
  };
}

