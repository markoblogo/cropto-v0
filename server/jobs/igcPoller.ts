/**
 * External Market Poller Job
 * Fetches and stores daily grain prices from external sources (IGC + USDA AMS)
 */

import { fetchDailyPrices as fetchIgcDailyPrices } from "../services/igcPriceService";
import { fetchUsdaAmsPrices } from "../services/usdaAmsPriceService";
import { upsertIgcIndexPrices } from "../services/igcUpsert";
import { emailService } from "../utils/emailMock";

const POLL_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
let pollerInterval: NodeJS.Timeout | null = null;
let lastPrimaryFailureAlertAt = 0;

function getAlertRecipients(): string[] {
  const configured =
    process.env.INDEX_PARSER_ALERT_EMAILS ||
    process.env.FEEDBACK_ALERT_EMAILS ||
    process.env.FEEDBACK_ALERT_EMAIL ||
    "a.biletskiy@gmail.com";
  return configured
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function sendPrimaryFailureAlert(details: { igcRows: number; usdaRows: number }) {
  const throttleHours = Number.parseInt(process.env.INDEX_PARSER_ALERT_THROTTLE_HOURS || "6", 10);
  const throttleMs = Math.max(1, throttleHours) * 60 * 60 * 1000;
  const now = Date.now();
  if (now - lastPrimaryFailureAlertAt < throttleMs) return;
  lastPrimaryFailureAlertAt = now;

  const subject = "Cropto: primary index parsers returned no data";
  const body = [
    "Index polling completed with no rows from primary parsers.",
    `IGC rows: ${details.igcRows}`,
    `USDA AMS rows: ${details.usdaRows}`,
    "",
    "Action required:",
    "1) Check upstream source availability",
    "2) Verify parser selectors/format",
    "3) Confirm fallback series status in Market Dashboard",
  ].join("\n");

  const recipients = getAlertRecipients();
  for (const email of recipients) {
    try {
      await emailService.sendEmail(email, subject, body);
    } catch (error: any) {
      console.error(`[IGC Poller] Failed to send parser alert to ${email}:`, error?.message || error);
    }
  }
}

/**
 * Run external price fetch and upsert once
 */
export async function pollOnce(): Promise<number> {
  try {
    console.log("[IGC Poller] Starting external price fetch...");

    const igcPrices = await fetchIgcDailyPrices();
    const usdaPrices = process.env.ENABLE_USDA_AMS_POLLING === "false"
      ? []
      : await fetchUsdaAmsPrices();

    if (igcPrices.length === 0 && usdaPrices.length === 0) {
      console.warn("[IGC Poller] No external prices fetched");
      await sendPrimaryFailureAlert({ igcRows: 0, usdaRows: 0 });
      return 0;
    }

    console.log(`[IGC Poller] Fetched ${igcPrices.length} IGC prices and ${usdaPrices.length} USDA AMS prices, upserting...`);

    const upsertedIgc = igcPrices.length > 0 ? await upsertIgcIndexPrices(igcPrices, "IGC") : 0;
    const upsertedUsda = usdaPrices.length > 0 ? await upsertIgcIndexPrices(usdaPrices, "USDA_AMS") : 0;
    const totalUpserted = upsertedIgc + upsertedUsda;

    console.log(`[IGC Poller] ✅ Upserted ${totalUpserted} prices (IGC=${upsertedIgc}, USDA_AMS=${upsertedUsda})`);
    return totalUpserted;
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
