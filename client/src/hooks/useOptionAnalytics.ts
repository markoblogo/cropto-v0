import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Option } from "@shared/schema";
import {
  type AnalyticsMetric,
  type StrikeVolumePoint,
  groupByStrikeForAnalytics,
} from "@/lib/optionCalculations";

export interface UseOptionAnalyticsOptions {
  commodity?: string;
  expiry?: string;
  metric: AnalyticsMetric;
}

export interface UseOptionAnalyticsResult {
  data: StrikeVolumePoint[];
  isLoading: boolean;
  error: Error | null;
  availableExpiries: string[];
  availableCommodities: string[];
}

/**
 * Hook to fetch and aggregate option analytics data
 * Aggregates options by strike price for volume or open interest metrics
 */
export function useOptionAnalytics(options: UseOptionAnalyticsOptions): UseOptionAnalyticsResult {
  const { commodity, expiry, metric } = options;

  // Fetch all options (same API as OptionChain uses)
  const { data: allOptions = [], isLoading, error } = useQuery<Option[]>({
    queryKey: ["/api/options"],
  });

  // Extract available commodities and expiries
  const { availableCommodities, availableExpiries } = useMemo(() => {
    const commoditiesSet = new Set<string>();
    const expiriesSet = new Set<string>();

    allOptions.forEach((option) => {
      if (option.commodity) {
        commoditiesSet.add(option.commodity);
      }
      if (option.expirationDate) {
        const expiryDate = typeof option.expirationDate === 'string' 
          ? new Date(option.expirationDate)
          : option.expirationDate;
        if (!isNaN(expiryDate.getTime())) {
          // Format as YYYY-MM-DD for consistency
          const expiryStr = expiryDate.toISOString().split('T')[0];
          expiriesSet.add(expiryStr);
        }
      }
    });

    return {
      availableCommodities: Array.from(commoditiesSet).sort(),
      availableExpiries: Array.from(expiriesSet).sort(),
    };
  }, [allOptions]);

  // Filter and aggregate options
  const aggregatedData = useMemo(() => {
    return groupByStrikeForAnalytics(allOptions, {
      commodity,
      expiry,
      metric,
    });
  }, [allOptions, commodity, expiry, metric]);

  return {
    data: aggregatedData,
    isLoading,
    error: error as Error | null,
    availableExpiries,
    availableCommodities,
  };
}


