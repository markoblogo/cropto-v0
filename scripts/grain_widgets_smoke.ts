import { ApiFarmerProvider } from "../server/monitor/grainWidgets/providers/apiFarmerProvider";
import { AlphaVantageCommoditiesProvider } from "../server/monitor/grainWidgets/providers/alphaVantageCommoditiesProvider";
import { BarchartCashProvider } from "../server/monitor/grainWidgets/providers/barchartCashProvider";
import { CommoditicProvider } from "../server/monitor/grainWidgets/providers/commoditicProvider";
import { DbNomicsSpotProvider } from "../server/monitor/grainWidgets/providers/dbNomicsSpotProvider";
import { FaoFfpiProvider } from "../server/monitor/grainWidgets/providers/faoFfpiProvider";
import { TradingChartsFuturesProvider } from "../server/monitor/grainWidgets/providers/tradingChartsFuturesProvider";
import { UsCashExportContextProvider } from "../server/monitor/grainWidgets/providers/usCashExportContextProvider";
import { UsdaMarsDailyMarketRatesTxtProvider } from "../server/monitor/grainWidgets/providers/usdaMarsDailyMarketRatesTxtProvider";
import { UsdaMarsReportsProvider } from "../server/monitor/grainWidgets/providers/usdaMarsReportsProvider";
import type { GrainWidgetsProviderContext } from "../server/monitor/grainWidgets/providers/types";
import type { GrainWidget } from "../server/monitor/grainWidgets/types";

function widgetCoverage(widget: GrainWidget): string {
  if (widget.kind === "US_CASH_BIDS" || widget.kind === "GLOBAL_SPOT_TABLE" || widget.kind === "CBOT_FUTURES_SNAPSHOT" || widget.kind === "LIVESTOCK_FEED_TIEIN") {
    const mapped = widget.rows.filter((row) => row.price?.nativeValueCurrent != null || row.price?.normalizedValueCurrent != null).length;
    return `${mapped}/${widget.rows.length}`;
  }
  if (widget.kind === "CROP_PRICE_INDEX") {
    const rows = widget.rows || [];
    const rowMapped = rows.filter((row) => row.price?.nativeValueCurrent != null || row.price?.normalizedValueCurrent != null).length;
    const cards = widget.cards || [];
    const cardMapped = cards.filter((card) => card.value != null || card.valueText != null).length;
    return `${rowMapped + cardMapped}/${rows.length + cards.length || 0}`;
  }
  if (widget.kind === "MACRO_AGRI_INDICES") {
    const items = widget.items || [];
    const mapped = items.filter((item) => {
      if (item.metricSemanticKind === "price") return item.price?.nativeValueCurrent != null || item.price?.normalizedValueCurrent != null;
      return item.valueCurrent != null;
    }).length;
    return `${mapped}/${items.length}`;
  }
  if (widget.kind === "USDA_MARS_DAILY_MARKET_RATES_TXT") {
    return `${widget.rows.length}/${widget.rows.length || 0}`;
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
    new AlphaVantageCommoditiesProvider(),
    new BarchartCashProvider(),
    new TradingChartsFuturesProvider(),
    new DbNomicsSpotProvider(),
    new CommoditicProvider(),
    new FaoFfpiProvider(),
    new ApiFarmerProvider(),
    new UsdaMarsReportsProvider(),
    new UsdaMarsDailyMarketRatesTxtProvider(),
    new UsCashExportContextProvider(),
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
      if (widget.kind === "USDA_MARS_REPORTS") {
        console.log(
          `  usda_reports fetched=${widget.summary?.fetchedCount ?? 0} scanned=${widget.summary?.scannedCount ?? 0} matched=${widget.summary?.matchedCount ?? 0} returned=${widget.summary?.reportsReturnedTop ?? widget.reports.length}`,
        );
      }
      if (widget.kind === "US_CASH_EXPORT_CONTEXT") {
        console.log(
          `  us_context reportsToday=${widget.summary?.reportsToday ?? 0} export=${widget.summary?.exportIndications ? "yes" : "no"} regions=${(widget.summary?.regions || []).join("/") || "n/a"}`,
        );
      }
      if (widget.kind === "USDA_MARS_DAILY_MARKET_RATES_TXT") {
        console.log(
          `  usda_daily_txt list_ok=${widget.debug?.metadataSourceUrl ? "yes" : "no"} daily_found=${widget.debug?.dailyReportFound === false ? "no" : "yes"} download=${widget.debug?.downloadUrlUsed || "n/a"} linesMatched=${widget.debug?.linesMatched ?? 0}/${widget.debug?.linesFetched ?? 0} rows=${widget.rows.length}`,
        );
      }
      if (widget.kind === "ALPHAVANTAGE_GRAIN_BENCHMARKS") {
        console.log(
          `  alpha coverage=${widget.summary?.coverage || `${widget.summary?.mappedCount ?? 0}/${widget.summary?.expectedCount ?? 0}`} cadence=${widget.summary?.cadence || "unknown"} rows=${widget.rows.length}`,
        );
        if (widget.summary?.byFunction?.length) {
          console.log(
            `  alpha functions=${widget.summary.byFunction
              .map((entry) => `${entry.fn}:${entry.unitConfidence}:${entry.allowNormalization ? "norm" : "native"}`)
              .join(", ")}`,
          );
        }
      }
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
