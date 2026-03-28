import { useMemo, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getSeaBrokerageMonitorState,
  subscribeToSeaBrokerageMonitorState,
} from "../services/seaBrokerageMonitor.service";
import { generateMatchSuggestions } from "../services/matchingEngine.service";
import { apiRequest } from "@/lib/queryClient";
import {
  buildSeaBrokerageMonitorAuthHeaders,
  getSeaBrokerageMonitorAuthChangedEventName,
  getSeaBrokerageMonitorToken,
} from "../services/monitorAuth.service";
import type { BrokerageEntry } from "../types";

function subscribeToMonitorAuthStore(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }
  const eventName = getSeaBrokerageMonitorAuthChangedEventName();
  window.addEventListener(eventName, onStoreChange as EventListener);
  return () => {
    window.removeEventListener(eventName, onStoreChange as EventListener);
  };
}

export function useSeaBrokerageMonitorState() {
  const localState = useSyncExternalStore(
    subscribeToSeaBrokerageMonitorState,
    getSeaBrokerageMonitorState,
    getSeaBrokerageMonitorState,
  );
  const monitorAuthToken = useSyncExternalStore(
    subscribeToMonitorAuthStore,
    getSeaBrokerageMonitorToken,
    () => null,
  );

  const { data, isError } = useQuery<BrokerageEntry[]>({
    queryKey: ["/api/sea-brokerage-monitor/entries", monitorAuthToken],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/sea-brokerage-monitor/entries", undefined, {
        headers: buildSeaBrokerageMonitorAuthHeaders(monitorAuthToken),
      });
      return response.json();
    },
  });

  return useMemo(() => {
    if (isError || !data) {
      return localState;
    }

    return {
      standardizedFeed: data,
      matchSuggestions: generateMatchSuggestions(data),
    };
  }, [data, localState]);
}
