/**
 * External Market Poller Job
 * Fetches and stores daily grain prices from external sources (IGC + USDA AMS)
 */

import { fetchDailyPrices as fetchIgcDailyPrices } from "../services/igcPriceService";
import { fetchUsdaAmsPrices } from "../services/usdaAmsPriceService";
import { fetchUsBarchartPrices } from "../services/usBarchartPriceService";
import { fetchLatamFuturesProxyPrices } from "../services/latamFuturesProxyService";
import { upsertIgcIndexPrices } from "../services/igcUpsert";
import { emailService } from "../utils/emailMock";
import { storage } from "../storage";

const POLL_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
let pollerInterval: NodeJS.Timeout | null = null;
let lastPrimaryFailureAlertAt = 0;

type ParserSource = "IGC" | "USDA_AMS" | "BARCHART_USDA" | "FUTURES_PROXY";

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

async function writeParserHealthSnapshot(args: {
  source: ParserSource;
  rows: number;
  success: boolean;
  error?: string;
}) {
  const lower = args.source.toLowerCase();
  const nowIso = new Date().toISOString();
  try {
    await storage.upsertAppSetting(`parser_health_${lower}_last_fetch_at`, nowIso);
    await storage.upsertAppSetting(`parser_health_${lower}_last_rows`, String(args.rows));
    if (args.success) {
      await storage.upsertAppSetting(`parser_health_${lower}_last_success_at`, nowIso);
      await storage.upsertAppSetting(`parser_health_${lower}_last_error`, "");
    } else {
      await storage.upsertAppSetting(`parser_health_${lower}_last_error_at`, nowIso);
      await storage.upsertAppSetting(`parser_health_${lower}_last_error`, args.error || "parser returned zero rows");
    }
  } catch (error: any) {
    console.error(`[IGC Poller] Failed to write parser health snapshot for ${args.source}:`, error?.message || error);
  }
}

function sourceToSettingKey(source: ParserSource): string {
  return source.toLowerCase();
}

async function isSourceDisabledBySetting(source: ParserSource): Promise<boolean> {
  const key = `parser_disabled_${sourceToSettingKey(source)}`;
  const value = (await storage.getAppSetting(key))?.value || "";
  return value.toLowerCase() === "true";
}

async function setSourceDisabledBySetting(source: ParserSource, disabled: boolean): Promise<void> {
  const key = `parser_disabled_${sourceToSettingKey(source)}`;
  await storage.upsertAppSetting(key, disabled ? "true" : "false");
}

async function bumpConsecutiveZeroRuns(args: { source: ParserSource; zeroRun: boolean }): Promise<number> {
  const lower = sourceToSettingKey(args.source);
  const key = `parser_health_${lower}_consecutive_zero`;
  if (!args.zeroRun) {
    await storage.upsertAppSetting(key, "0");
    return 0;
  }
  const currentRaw = (await storage.getAppSetting(key))?.value || "0";
  const current = Number.parseInt(currentRaw, 10);
  const next = Number.isFinite(current) ? Math.max(current, 0) + 1 : 1;
  await storage.upsertAppSetting(key, String(next));
  return next;
}

function isEnvSourceEnabled(source: ParserSource): boolean {
  switch (source) {
    case "IGC":
      // Poller-level enablement is still controlled by ENABLE_IGC_POLLING, but source-level can be disabled by setting.
      return true;
    case "USDA_AMS":
      return process.env.ENABLE_USDA_AMS_POLLING !== "false";
    case "BARCHART_USDA":
      return process.env.ENABLE_BARCHART_USDA_POLLING !== "false";
    case "FUTURES_PROXY":
      return process.env.ENABLE_FUTURES_PROXY_POLLING !== "false";
    default:
      return true;
  }
}

/**
 * Run external price fetch and upsert once
 */
export async function pollOnce(): Promise<number> {
  try {
    console.log("[IGC Poller] Starting external price fetch...");

    const autoDisableThresholdRaw = Number.parseInt(process.env.PARSER_AUTO_DISABLE_AFTER_ZERO_RUNS || "3", 10);
    const autoDisableThreshold = Number.isFinite(autoDisableThresholdRaw)
      ? Math.min(Math.max(autoDisableThresholdRaw, 2), 20)
      : 3;

    const enabledBySource: Record<ParserSource, boolean> = {
      IGC: isEnvSourceEnabled("IGC") && !(await isSourceDisabledBySetting("IGC")),
      USDA_AMS: isEnvSourceEnabled("USDA_AMS") && !(await isSourceDisabledBySetting("USDA_AMS")),
      BARCHART_USDA: isEnvSourceEnabled("BARCHART_USDA") && !(await isSourceDisabledBySetting("BARCHART_USDA")),
      FUTURES_PROXY: isEnvSourceEnabled("FUTURES_PROXY") && !(await isSourceDisabledBySetting("FUTURES_PROXY")),
    };

    const igcPrices = enabledBySource.IGC ? await fetchIgcDailyPrices() : [];
    const usdaPrices = enabledBySource.USDA_AMS ? await fetchUsdaAmsPrices() : [];
    const barchartUsPrices = enabledBySource.BARCHART_USDA ? await fetchUsBarchartPrices() : [];
    const futuresProxyPrices = enabledBySource.FUTURES_PROXY ? await fetchLatamFuturesProxyPrices() : [];

    await writeParserHealthSnapshot({
      source: "IGC",
      rows: igcPrices.length,
      success: !enabledBySource.IGC || igcPrices.length > 0,
      error: !enabledBySource.IGC
        ? "Polling disabled by app setting parser_disabled_igc=true"
        : igcPrices.length === 0
          ? "No rows parsed from IGC source"
          : undefined,
    });
    await writeParserHealthSnapshot({
      source: "USDA_AMS",
      rows: usdaPrices.length,
      success: !enabledBySource.USDA_AMS || usdaPrices.length > 0,
      error:
        !enabledBySource.USDA_AMS
          ? isEnvSourceEnabled("USDA_AMS")
            ? "Polling disabled by app setting parser_disabled_usda_ams=true"
            : "Polling disabled by ENABLE_USDA_AMS_POLLING=false"
          : usdaPrices.length === 0
            ? "No rows parsed from USDA AMS source"
            : undefined,
    });
    await writeParserHealthSnapshot({
      source: "BARCHART_USDA",
      rows: barchartUsPrices.length,
      success: !enabledBySource.BARCHART_USDA || barchartUsPrices.length > 0,
      error:
        !enabledBySource.BARCHART_USDA
          ? isEnvSourceEnabled("BARCHART_USDA")
            ? "Polling disabled by app setting parser_disabled_barchart_usda=true"
            : "Polling disabled by ENABLE_BARCHART_USDA_POLLING=false"
          : barchartUsPrices.length === 0
            ? "No rows parsed from Barchart USDA source"
            : undefined,
    });
    await writeParserHealthSnapshot({
      source: "FUTURES_PROXY",
      rows: futuresProxyPrices.length,
      success: !enabledBySource.FUTURES_PROXY || futuresProxyPrices.length > 0,
      error:
        !enabledBySource.FUTURES_PROXY
          ? isEnvSourceEnabled("FUTURES_PROXY")
            ? "Polling disabled by app setting parser_disabled_futures_proxy=true"
            : "Polling disabled by ENABLE_FUTURES_PROXY_POLLING=false"
          : futuresProxyPrices.length === 0
            ? "No rows parsed from futures proxy source"
            : undefined,
    });

    const enabledCount = Object.values(enabledBySource).filter(Boolean).length;
    const allEnabledReturnedZero =
      (!enabledBySource.IGC || igcPrices.length === 0) &&
      (!enabledBySource.USDA_AMS || usdaPrices.length === 0) &&
      (!enabledBySource.BARCHART_USDA || barchartUsPrices.length === 0) &&
      (!enabledBySource.FUTURES_PROXY || futuresProxyPrices.length === 0) &&
      enabledCount > 0;

    // Auto-disable sources that return zero repeatedly to avoid wasting resources in demo deployments.
    for (const source of Object.keys(enabledBySource) as ParserSource[]) {
      if (!enabledBySource[source]) continue;
      const rows =
        source === "IGC"
          ? igcPrices.length
          : source === "USDA_AMS"
            ? usdaPrices.length
            : source === "BARCHART_USDA"
              ? barchartUsPrices.length
              : futuresProxyPrices.length;

      const consecutiveZero = await bumpConsecutiveZeroRuns({ source, zeroRun: rows === 0 });
      if (rows === 0 && consecutiveZero >= autoDisableThreshold) {
        await setSourceDisabledBySetting(source, true);
        await storage.writeAuditEvent({
          event: "parser_auto_disabled",
          userId: null,
          metadata: { source, consecutiveZero, threshold: autoDisableThreshold },
        });
        console.warn(`[IGC Poller] Auto-disabled ${source} after ${consecutiveZero} consecutive zero runs`);
      }
    }

    if (allEnabledReturnedZero) {
      console.warn("[IGC Poller] No external prices fetched");
      await sendPrimaryFailureAlert({ igcRows: 0, usdaRows: 0 });
      return 0;
    }

    console.log(
      `[IGC Poller] Fetched IGC=${igcPrices.length}, USDA_AMS=${usdaPrices.length}, BARCHART_USDA=${barchartUsPrices.length}, FUTURES_PROXY=${futuresProxyPrices.length}; upserting...`
    );

    const upsertedIgc = igcPrices.length > 0 ? await upsertIgcIndexPrices(igcPrices, "IGC") : 0;
    const upsertedUsda = usdaPrices.length > 0 ? await upsertIgcIndexPrices(usdaPrices, "USDA_AMS") : 0;
    const upsertedBarchart =
      barchartUsPrices.length > 0 ? await upsertIgcIndexPrices(barchartUsPrices, "BARCHART_USDA") : 0;
    const upsertedFuturesProxy =
      futuresProxyPrices.length > 0 ? await upsertIgcIndexPrices(futuresProxyPrices, "FUTURES_PROXY") : 0;
    const totalUpserted = upsertedIgc + upsertedUsda + upsertedBarchart + upsertedFuturesProxy;

    console.log(
      `[IGC Poller] ✅ Upserted ${totalUpserted} prices (IGC=${upsertedIgc}, USDA_AMS=${upsertedUsda}, BARCHART_USDA=${upsertedBarchart}, FUTURES_PROXY=${upsertedFuturesProxy})`
    );
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
