import { ApiFarmerProvider } from "../server/monitor/grainWidgets/providers/apiFarmerProvider";
import { BarchartCashProvider } from "../server/monitor/grainWidgets/providers/barchartCashProvider";
import { CommoditicProvider } from "../server/monitor/grainWidgets/providers/commoditicProvider";
import { TradingChartsFuturesProvider } from "../server/monitor/grainWidgets/providers/tradingChartsFuturesProvider";
import type { GrainWidgetsProviderContext } from "../server/monitor/grainWidgets/providers/types";
import type { GrainWidget } from "../server/monitor/grainWidgets/types";

function widgetCoverage(widget: GrainWidget): string {
  if (widget.kind === "US_CASH_BIDS" || widget.kind === "GLOBAL_SPOT_TABLE" || widget.kind === "CBOT_FUTURES_SNAPSHOT" || widget.kind === "LIVESTOCK_FEED_TIEIN") {
    const mapped = widget.rows.filter((row) => row.price?.nativeValueCurrent != null || row.price?.normalizedValueCurrent != null).length;
    return `${mapped}/${widget.rows.length}`;
  }
  if (widget.kind === "CROP_PRICE_INDEX") {
    const rows = widget.rows || [];
    const mapped = rows.filter((row) => row.price?.nativeValueCurrent != null || row.price?.normalizedValueCurrent != null).length;
    return `${mapped}/${rows.length || 0}`;
  }
  if (widget.kind === "MACRO_AGRI_INDICES") {
    const items = widget.items || [];
    const mapped = items.filter((item) => {
      if (item.metricSemanticKind === "price") return item.price?.nativeValueCurrent != null || item.price?.normalizedValueCurrent != null;
      return item.valueCurrent != null;
    }).length;
    return `${mapped}/${items.length}`;
  }
  return "n/a";
}

async function run() {
  const ctx: GrainWidgetsProviderContext = {
    now: new Date(),
    timeframe: "1d",
    seriesPoints: 7,
    eurUsd: null,
  };

  const providers = [
    new BarchartCashProvider(),
    new TradingChartsFuturesProvider(),
    new CommoditicProvider(),
    new ApiFarmerProvider(),
  ];

  console.log("grain-widgets smoke start");
  for (const provider of providers) {
    if (!provider.enabled) {
      console.log(`[${provider.id}] disabled`);
      continue;
    }

    try {
      const widget = await provider.getWidget(ctx);
      console.log(`[${provider.id}] status=${widget.status} kind=${widget.kind} coverage=${widgetCoverage(widget)} source=${widget.sourceUrl || "n/a"}`);
      if (widget.notes?.length) console.log(`  notes=${widget.notes.join(" | ")}`);
    } catch (error: any) {
      const reason = error?.message || "fetch_failed";
      const fallback = provider.mockFallback(reason, ctx);
      console.log(`[${provider.id}] error=${reason} -> fallback status=${fallback.status} kind=${fallback.kind} source=${fallback.sourceUrl || "n/a"}`);
    }
  }
  console.log("grain-widgets smoke done");
}

run().catch((error) => {
  console.error("grain-widgets smoke failed", error);
  process.exitCode = 1;
});
