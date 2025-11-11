import { useEffect, useRef } from "react";
import { queryClient } from "@/lib/queryClient";

interface UsePollingOptions {
  endpoint: string;
  interval?: number; // milliseconds, default 15000 (15s)
  enabled?: boolean;
  visibilityPause?: boolean; // pause when page hidden, default true
}

export function usePolling({
  endpoint,
  interval = 15000,
  enabled = true,
  visibilityPause = true,
}: UsePollingOptions) {
  const lastSyncRef = useRef<string | null>(null);
  const intervalIdRef = useRef<NodeJS.Timeout | null>(null);
  const isFetchingRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const poll = async () => {
      // Check visibility
      if (visibilityPause && document.visibilityState === "hidden") {
        return;
      }

      // Prevent overlapping requests
      if (isFetchingRef.current) {
        return;
      }

      // Check if any queries are currently fetching
      if (queryClient.isFetching() > 0) {
        return;
      }

      try {
        isFetchingRef.current = true;

        const token = localStorage.getItem("cropto_token");
        if (!token) {
          return;
        }

        // Build URL with since parameter
        const url = lastSyncRef.current
          ? `${endpoint}?since=${encodeURIComponent(lastSyncRef.current)}`
          : endpoint;

        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          console.error("[Polling] Error:", response.statusText);
          return;
        }

        const data = await response.json();

        // Update cursor
        if (data.lastSync) {
          lastSyncRef.current = data.lastSync;
        }

        // Invalidate queries if there are updates
        if (data.options && data.options.length > 0) {
          queryClient.invalidateQueries({ queryKey: ["/api/options"] });
          queryClient.invalidateQueries({ queryKey: ["/api/portfolio/me"] });
        }

        if (data.marginCalls && data.marginCalls.length > 0) {
          queryClient.invalidateQueries({ queryKey: ["/api/margin-calls"] });
          queryClient.invalidateQueries({ queryKey: ["/api/portfolio/me"] });
        }

        if (data.transactions && data.transactions.length > 0) {
          queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
          queryClient.invalidateQueries({ queryKey: ["/api/settlements"] });
          queryClient.invalidateQueries({ queryKey: ["/api/portfolio/me"] });
        }
      } catch (error) {
        console.error("[Polling] Fetch error:", error);
      } finally {
        isFetchingRef.current = false;
      }
    };

    // Initial poll
    poll();

    // Setup interval
    intervalIdRef.current = setInterval(poll, interval);

    // Cleanup
    return () => {
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
    };
  }, [endpoint, interval, enabled, visibilityPause]);
}
