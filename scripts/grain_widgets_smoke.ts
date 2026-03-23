import { ApiFarmerProvider } from "../server/monitor/grainWidgets/providers/apiFarmerProvider";
import { AlphaVantageCommoditiesProvider } from "../server/monitor/grainWidgets/providers/alphaVantageCommoditiesProvider";
import { BarchartCashProvider } from "../server/monitor/grainWidgets/providers/barchartCashProvider";
import { CanadaRailPerformanceProvider } from "../server/monitor/grainWidgets/providers/canadaRailPerformanceProvider";
import { CommoditicProvider } from "../server/monitor/grainWidgets/providers/commoditicProvider";
import { DbNomicsSpotProvider } from "../server/monitor/grainWidgets/providers/dbNomicsSpotProvider";
import { EcCerealsPricesProvider } from "../server/monitor/grainWidgets/providers/ecCerealsPricesProvider";
import { EcOilseedsPricesProvider } from "../server/monitor/grainWidgets/providers/ecOilseedsPricesProvider";
import { EurostatAgriIndicesProvider } from "../server/monitor/grainWidgets/providers/eurostatAgriIndicesProvider";
import { FaoFfpiProvider } from "../server/monitor/grainWidgets/providers/faoFfpiProvider";
import { FaostatProducerPricesProvider } from "../server/monitor/grainWidgets/providers/faostatProducerPricesProvider";
import { FpmaMarketPricesProvider } from "../server/monitor/grainWidgets/providers/fpmaMarketPricesProvider";
import { ImfPcpsProvider } from "../server/monitor/grainWidgets/providers/imfPcpsProvider";
import { NasdaqDataLinkProvider } from "../server/monitor/grainWidgets/providers/nasdaqDataLinkProvider";
import { OecdAgriculturalOutlookProvider } from "../server/monitor/grainWidgets/providers/oecdAgriculturalOutlookProvider";
import { TradingChartsFuturesProvider } from "../server/monitor/grainWidgets/providers/tradingChartsFuturesProvider";
import { AmisOutlookProvider } from "../server/monitor/grainWidgets/providers/amisOutlookProvider";
import { UsCashExportContextProvider } from "../server/monitor/grainWidgets/providers/usCashExportContextProvider";
import { UsdaPsdProvider } from "../server/monitor/grainWidgets/providers/usdaPsdProvider";
import { WfpDataBridgesProvider } from "../server/monitor/grainWidgets/providers/wfpDataBridgesProvider";
import { WorldBankMicrodataProvider } from "../server/monitor/grainWidgets/providers/worldBankMicrodataProvider";
import { UsdaNassQuickStatsProvider } from "../server/monitor/grainWidgets/providers/usdaNassQuickStatsProvider";
import { UsdaMarsDailyMarketRatesTxtProvider } from "../server/monitor/grainWidgets/providers/usdaMarsDailyMarketRatesTxtProvider";
import { UsdaGtrLogisticsProvider } from "../server/monitor/grainWidgets/providers/usdaGtrLogisticsProvider";
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
  if (widget.kind === "NASDAQ_DATA_LINK_SNAPSHOT") {
    const mapped = widget.items.filter((item) => item.nativeValueCurrent != null).length;
    return `${mapped}/${widget.items.length || 0}`;
  }
  if (widget.kind === "USDA_GTR_LOGISTICS_SNAPSHOT") {
    const mapped = widget.items.filter((item) => item.current != null).length;
    return `${mapped}/${widget.items.length || 0}`;
  }
  if (widget.kind === "CANADA_GRAIN_RAIL_PERFORMANCE") {
    const mapped = widget.items.filter((item) => item.current != null).length;
    return `${mapped}/${widget.items.length || 0}`;
  }
  if (widget.kind === "WFP_MARKET_PRICES_MULTI_COUNTRY" || widget.kind === "WB_MICRODATA_MARKET_PRICES") {
    const mapped = widget.rows.filter((row) => row.current != null).length;
    return `${mapped}/${widget.rows.length || 0}`;
  }
  if (widget.kind === "EUROSTAT_AGRI_PRICE_INDICES") {
    const mapped = widget.items.filter((item) => item.current != null).length;
    return `${mapped}/${widget.items.length || 0}`;
  }
  if (widget.kind === "USDA_PSD_BALANCES" || widget.kind === "IMF_COMMODITY_BENCHMARKS") {
    const mapped = widget.rows.filter((row) => row.current != null).length;
    return `${mapped}/${widget.rows.length || 0}`;
  }
  if (widget.kind === "AMIS_GLOBAL_BALANCE" || widget.kind === "OECD_AGRICULTURAL_OUTLOOK") {
    return `${widget.items.length}/${widget.items.length || 0}`;
  }
  if (widget.kind === "FAOSTAT_PP_MULTI_COUNTRY") {
    const mapped = widget.rows.filter((row) => row.current != null).length;
    return `${mapped}/${widget.rows.length || 0}`;
  }
  if (widget.kind === "FPMA_MARKET_PRICES_MULTI_COUNTRY") {
    const mapped = widget.rows.filter((row) => row.current != null).length;
    return `${mapped}/${widget.rows.length || 0}`;
  }
  if (widget.kind === "EC_CEREALS_MULTI_COUNTRY" || widget.kind === "EC_OILSEEDS_MULTI_COUNTRY" || widget.kind === "USDA_NASS_PRODUCER_PRICES") {
    const mapped = widget.rows.filter((row) => row.price?.nativeValueCurrent != null || row.price?.normalizedValueCurrent != null).length;
    return `${mapped}/${widget.rows.length || 0}`;
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
    new NasdaqDataLinkProvider(),
    new EcCerealsPricesProvider(),
    new EcOilseedsPricesProvider(),
    new UsdaNassQuickStatsProvider(),
    new WfpDataBridgesProvider(),
    new WorldBankMicrodataProvider(),
    new EurostatAgriIndicesProvider(),
    new UsdaPsdProvider(),
    new AmisOutlookProvider(),
    new ImfPcpsProvider(),
    new OecdAgriculturalOutlookProvider(),
    new UsdaGtrLogisticsProvider(),
    new CanadaRailPerformanceProvider(),
    new FaostatProducerPricesProvider(),
    new FpmaMarketPricesProvider(),
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
      if (widget.kind === "NASDAQ_DATA_LINK_SNAPSHOT") {
        const forbidden = (widget.summary?.datasetStatuses || []).filter((entry) => entry.status === "forbidden").length;
        console.log(
          `  nasdaq coverage=${widget.summary?.coverage || `${widget.summary?.mappedCount ?? 0}/${widget.summary?.expectedCount ?? 0}`} items=${widget.items.length} forbidden=${forbidden}`,
        );
      }
      if (widget.kind === "USDA_GTR_LOGISTICS_SNAPSHOT") {
        console.log(
          `  usda_gtr coverage=${widget.summary?.coverage || `${widget.summary?.mappedCount ?? 0}/${widget.summary?.expectedCount ?? 0}`} cadence=${widget.summary?.cadence || "unknown"} dataset=${widget.debug?.datasetUrlChosen || "n/a"} rowsParsed=${widget.debug?.rowsParsed ?? 0} seriesPoints=${widget.debug?.seriesPoints ?? 0}`,
        );
      }
      if (widget.kind === "CANADA_GRAIN_RAIL_PERFORMANCE") {
        console.log(
          `  canada_rail coverage=${widget.summary?.coverage || `${widget.summary?.mappedCount ?? 0}/${widget.summary?.expectedCount ?? 0}`} cadence=${widget.summary?.cadence || "unknown"} dataset=${widget.debug?.datasetUrlChosen || "n/a"} rowsParsed=${widget.debug?.rowsParsed ?? 0}`,
        );
      }
      if (widget.kind === "FAOSTAT_PP_MULTI_COUNTRY") {
        console.log(
          `  faostat territory=${widget.territory?.code || "n/a"} coverage=${widget.summary?.coverage || `${widget.summary?.mappedCount ?? 0}/${widget.summary?.expectedCount ?? 0}`} element=${widget.debug?.elementCode || "n/a"} rows=${widget.rows.length}`,
        );
      }
      if (widget.kind === "FPMA_MARKET_PRICES_MULTI_COUNTRY") {
        console.log(
          `  fpma territory=${widget.territory?.code || "n/a"} priceType=${widget.summary?.selectedPriceType || "n/a"} coverage=${widget.summary?.coverage || `${widget.summary?.mappedCount ?? 0}/${widget.summary?.expectedCount ?? 0}`} rows=${widget.rows.length}`,
        );
      }
      if (widget.kind === "EC_CEREALS_MULTI_COUNTRY" || widget.kind === "EC_OILSEEDS_MULTI_COUNTRY" || widget.kind === "USDA_NASS_PRODUCER_PRICES") {
        console.log(
          `  official_rows territory=${widget.territory?.code || "n/a"} coverage=${widget.summary?.coverage || `${widget.summary?.mappedCount ?? 0}/${widget.summary?.expectedCount ?? 0}`} rows=${widget.rows.length} cadence=${widget.summary?.cadence || "unknown"}`,
        );
      }
      if (widget.kind === "WFP_MARKET_PRICES_MULTI_COUNTRY" || widget.kind === "WB_MICRODATA_MARKET_PRICES") {
        console.log(
          `  multi_country territory=${widget.territory?.code || "n/a"} coverage=${widget.summary?.coverage || `${widget.summary?.mappedCount ?? 0}/${widget.summary?.expectedCount ?? 0}`} rows=${widget.rows.length} cadence=${widget.summary?.cadence || "unknown"}`,
        );
      }
      if (widget.kind === "EUROSTAT_AGRI_PRICE_INDICES") {
        console.log(
          `  eurostat territory=${widget.territory?.code || "n/a"} coverage=${widget.summary?.coverage || `${widget.summary?.mappedCount ?? 0}/${widget.summary?.expectedCount ?? 0}`} items=${widget.items.length} cadence=${widget.summary?.cadence || "unknown"}`,
        );
      }
      if (widget.kind === "USDA_PSD_BALANCES") {
        console.log(
          `  usda_psd coverage=${widget.summary?.coverage || `${widget.summary?.mappedCount ?? 0}/${widget.summary?.expectedCount ?? 0}`} rows=${widget.rows.length} cadence=${widget.summary?.cadence || "unknown"}`,
        );
      }
      if (widget.kind === "AMIS_GLOBAL_BALANCE") {
        console.log(
          `  amis issue=${widget.summary?.issueLabel || "n/a"} release=${widget.summary?.releaseDate || "n/a"} items=${widget.items.length}`,
        );
      }
      if (widget.kind === "IMF_COMMODITY_BENCHMARKS") {
        console.log(
          `  imf coverage=${widget.summary?.coverage || `${widget.summary?.mappedCount ?? 0}/${widget.summary?.expectedCount ?? 0}`} rows=${widget.rows.length} cadence=${widget.summary?.cadence || "unknown"}`,
        );
      }
      if (widget.kind === "OECD_AGRICULTURAL_OUTLOOK") {
        console.log(
          `  oecd release=${widget.summary?.releaseDate || "n/a"} horizon=${widget.summary?.horizon || "n/a"} items=${widget.items.length}`,
        );
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
