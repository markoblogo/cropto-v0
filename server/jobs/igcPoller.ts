/**
 * IGC Poller Job
 * Fetches and stores daily grain prices from IGC (International Grains Council)
 */

import { fetchDailyPrices } from "../services/igcPriceService";
import { upsertIgcIndexPrices } from "../services/igcUpsert";

const POLL_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
let pollerInterval: NodeJS.Timeout | null = null;

/**
 * Run IGC price fetch and upsert once
 */
export async function pollOnce(): Promise<number> {
  try {
    console.log("[IGC Poller] Starting price fetch...");
    
    const prices = await fetchDailyPrices();
    
    if (prices.length === 0) {
      console.warn("[IGC Poller] No prices fetched");
      return 0;
    }

    console.log(`[IGC Poller] Fetched ${prices.length} prices, upserting...`);
    
    const upserted = await upsertIgcIndexPrices(prices);
    
    console.log(`[IGC Poller] ✅ Upserted ${upserted} prices`);
    return upserted;
  } catch (error: any) {
    console.error("[IGC Poller] Error in poll cycle:", error.message);
    throw error;
  }
}

/**
 * Start the IGC poller with interval
 */
export function startPoller(): void {
  if (pollerInterval) {
    console.log("[IGC Poller] Already running");
    return;
  }

  if (process.env.ENABLE_IGC_POLLING !== "true") {
    console.log("[IGC Poller] Disabled (ENABLE_IGC_POLLING != true)");
    return;
  }

  const intervalHours = parseInt(process.env.IGC_POLL_INTERVAL_HOURS || "24", 10);
  const intervalMs = intervalHours * 60 * 60 * 1000;

  console.log(`[IGC Poller] Starting with ${intervalHours}h interval`);

  // Run immediately on start
  pollOnce().catch((error) => {
    console.error("[IGC Poller] Error in initial poll:", error);
  });

  // Then run on interval
  pollerInterval = setInterval(() => {
    pollOnce().catch((error) => {
      console.error("[IGC Poller] Error in scheduled poll:", error);
    });
  }, intervalMs);
}

/**
 * Stop the IGC poller
 */
export function stopPoller(): void {
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
    console.log("[IGC Poller] Stopped");
  }
}

// CLI support: run once if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  pollOnce()
    .then((count) => {
      console.log(`[IGC Poller] Completed: ${count} prices upserted`);
      process.exit(0);
    })
    .catch((error) => {
      console.error("[IGC Poller] Failed:", error);
      process.exit(1);
    });
}

