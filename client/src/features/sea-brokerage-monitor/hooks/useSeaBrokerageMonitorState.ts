import { useMemo, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getSeaBrokerageMonitorState,
  subscribeToSeaBrokerageMonitorState,
} from "../services/seaBrokerageMonitor.service";
import { generateMatchSuggestions } from "../services/matchingEngine.service";
import { apiRequest } from "@/lib/queryClient";
import type { BrokerageEntry } from "../types";

export function useSeaBrokerageMonitorState() {
  const localState = useSyncExternalStore(
    subscribeToSeaBrokerageMonitorState,
    getSeaBrokerageMonitorState,
    getSeaBrokerageMonitorState,
  );

  const { data } = useQuery<BrokerageEntry[]>({
    queryKey: ["/api/sea-brokerage-monitor/entries"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/sea-brokerage-monitor/entries");
      return response.json();
    },
  });

  return useMemo(() => {
    if (!data || data.length === 0) {
      return localState;
    }

    return {
      standardizedFeed: data,
      matchSuggestions: generateMatchSuggestions(data),
    };
  }, [data, localState]);
}
