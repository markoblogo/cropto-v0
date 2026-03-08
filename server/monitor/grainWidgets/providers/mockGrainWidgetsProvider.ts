import type {
  GrainWidget,
  GrainWidgetAlphaVantageGrainBenchmarks,
  GrainWidgetCropPriceIndex,
  GrainWidgetFaostatPpMultiCountry,
  GrainWidgetFpmaMarketPricesMultiCountry,
  GrainWidgetEcOfficialPricesSnapshot,
  GrainWidgetNasdaqDataLinkSnapshot,
  GrainWidgetCanadaRailPerformance,
  GrainWidgetUsdaGtrLogisticsSnapshot,
  GrainWidgetKind,
  GrainWidgetUsCashExportContext,
  GrainWidgetUsdaMarsDailyMarketRatesTxt,
  GrainWidgetUsdaMarsReports,
  GrainWidgetTableRow,
  GrainWidgetUSCashBids,
  GrainWidgetGlobalSpotTable,
  GrainWidgetCbotFuturesSnapshot,
} from "../types";
import { ENABLE_COUNTRY_MULTI_WIDGET_MOCK } from "../config";
import type { GrainWidgetsProvider, GrainWidgetsProviderContext } from "./types";
import { deriveSeries } from "./utils";
import { buildLivestockTieInWidget } from "../builders/livestockTieInBuilder";
import { buildMacroAgriIndicesWidget } from "../builders/macroAgriIndicesBuilder";
import { mockLivestockTieInWidgetRaw, mockMacroAgriIndicesRaw } from "./mockPayloads";

type MockProviderOptions = { kind: GrainWidgetKind };

function coverage(rows: GrainWidgetTableRow[]) {
  return {
    ok: rows.filter((row) => row.price?.normalizationStatus === "OK").length,
    partial: rows.filter((row) => row.price?.normalizationStatus === "PARTIAL").length,
    fxMissing: rows.filter((row) => row.price?.normalizationStatus === "FX_MISSING").length,
    unavailable: rows.filter((row) => row.price?.normalizationStatus === "UNAVAILABLE" || !row.price?.normalizationStatus).length,
  };
}

export class MockGrainWidgetsProvider implements GrainWidgetsProvider {
  id: string;
  kind: GrainWidgetKind;
  enabled = true;

  constructor(opts: MockProviderOptions) {
    this.kind = opts.kind;
    this.id = `mock-grain-widgets-${opts.kind.toLowerCase()}`;
  }

  async getWidget(ctx: GrainWidgetsProviderContext): Promise<GrainWidget> {
    return this.mockFallback("mock_provider", ctx);
  }

  mockFallback(reason: string, ctx: GrainWidgetsProviderContext): GrainWidget {
    if (this.kind === "US_CASH_BIDS") {
      const rows: GrainWidgetTableRow[] = [
        {
          id: "cash-corn",
          label: "Corn",
          region: "US Midwest",
          commodityGroup: "Grains",
          status: "FALLBACK",
          sourceName: "Demo sample",
          updatedAt: ctx.now.toISOString(),
          price: {
            nativeValueCurrent: 4.65,
            nativeUnit: "c/bu",
            normalizedValueCurrent: 183.2,
            normalizedUnit: "t",
            normalizedCurrency: "USD",
            nativeValueChange: 0.06,
            nativeValueChangePct: 1.31,
            normalizedValueChange: 2.36,
            normalizedValueChangePct: 1.31,
            normalizationStatus: "OK",
            normalizationMethod: "cbot_cents_bu_to_usd_t",
            normalizationMeta: { bushelsPerTon: 39.368, cropFactor: "corn" },
            series: deriveSeries(183.2, 2.36, ctx.seriesPoints),
          },
        },
        {
          id: "cash-wheat",
          label: "Wheat",
          region: "US Plains",
          commodityGroup: "Grains",
          status: "FALLBACK",
          sourceName: "Demo sample",
          updatedAt: ctx.now.toISOString(),
          price: {
            nativeValueCurrent: 5.84,
            nativeUnit: "c/bu",
            normalizedValueCurrent: 214.7,
            normalizedUnit: "t",
            normalizedCurrency: "USD",
            nativeValueChange: -0.05,
            nativeValueChangePct: -0.85,
            normalizedValueChange: -1.84,
            normalizedValueChangePct: -0.85,
            normalizationStatus: "OK",
            normalizationMethod: "cbot_cents_bu_to_usd_t",
            normalizationMeta: { bushelsPerTon: 36.744, cropFactor: "wheat" },
            series: deriveSeries(214.7, -1.84, ctx.seriesPoints),
          },
        },
        {
          id: "cash-soy",
          label: "Soybeans",
          region: "US Gulf",
          commodityGroup: "Oilseeds",
          status: "FALLBACK",
          sourceName: "Demo sample",
          updatedAt: ctx.now.toISOString(),
          price: {
            nativeValueCurrent: 11.22,
            nativeUnit: "c/bu",
            normalizedValueCurrent: 412.6,
            normalizedUnit: "t",
            normalizedCurrency: "USD",
            nativeValueChange: 0.11,
            nativeValueChangePct: 0.99,
            normalizedValueChange: 4.04,
            normalizedValueChangePct: 0.99,
            normalizationStatus: "OK",
            normalizationMethod: "cbot_cents_bu_to_usd_t",
            normalizationMeta: { bushelsPerTon: 36.744, cropFactor: "soybeans" },
            series: deriveSeries(412.6, 4.04, ctx.seriesPoints),
          },
        },
      ];
      const values = rows.map((row) => row.price?.normalizedValueCurrent || 0);
      const widget: GrainWidgetUSCashBids = {
        id: "grain-us-cash-bids",
        kind: "US_CASH_BIDS",
        title: "US Cash Bids Snapshot",
        subtitle: "Corn / Wheat / Soybeans",
        status: "FALLBACK",
        sourceName: "Demo sample",
        sourceAttribution: "Data: Demo fallback sample",
        sourceUrl: "https://www.barchart.com/futures/commodities/grains",
        updatedAt: ctx.now.toISOString(),
        timeframe: ctx.timeframe,
        rows,
        summary: {
          rowCount: rows.length,
          normalizedCoverage: coverage(rows),
          spreadCue: {
            min: Math.min(...values),
            max: Math.max(...values),
            range: Number((Math.max(...values) - Math.min(...values)).toFixed(2)),
            unit: "USD/t",
            label: "Bid range",
          },
        },
        fallbackReason: reason,
      };
      return widget;
    }

    if (this.kind === "GLOBAL_SPOT_TABLE") {
      const rows: GrainWidgetTableRow[] = [
        {
          id: "spot-wheat",
          label: "Wheat",
          region: "Global",
          commodityGroup: "Grains",
          status: "FALLBACK",
          sourceName: "Demo sample",
          updatedAt: ctx.now.toISOString(),
          price: {
            nativeValueCurrent: 238.4,
            nativeCurrency: "USD",
            nativeUnit: "USD/t",
            normalizedValueCurrent: 238.4,
            normalizedCurrency: "USD",
            normalizedUnit: "t",
            nativeValueChangePct: 0.8,
            normalizedValueChangePct: 0.8,
            normalizationStatus: "OK",
            normalizationMethod: "identity_usd_t",
            series: deriveSeries(238.4, 1.9, ctx.seriesPoints),
          },
        },
        {
          id: "spot-corn",
          label: "Corn",
          region: "Global",
          commodityGroup: "Grains",
          status: "FALLBACK",
          sourceName: "Demo sample",
          updatedAt: ctx.now.toISOString(),
          price: {
            nativeValueCurrent: 196.1,
            nativeCurrency: "USD",
            nativeUnit: "USD/t",
            normalizedValueCurrent: 196.1,
            normalizedCurrency: "USD",
            normalizedUnit: "t",
            nativeValueChangePct: -0.36,
            normalizedValueChangePct: -0.36,
            normalizationStatus: "OK",
            normalizationMethod: "identity_usd_t",
            series: deriveSeries(196.1, -0.7, ctx.seriesPoints),
          },
        },
        {
          id: "spot-soy",
          label: "Soybeans",
          region: "Global",
          commodityGroup: "Oilseeds",
          status: "FALLBACK",
          sourceName: "Demo sample",
          updatedAt: ctx.now.toISOString(),
          price: {
            nativeValueCurrent: 431.9,
            nativeCurrency: "USD",
            nativeUnit: "USD/t",
            normalizedValueCurrent: 431.9,
            normalizedCurrency: "USD",
            normalizedUnit: "t",
            nativeValueChangePct: 0.58,
            normalizedValueChangePct: 0.58,
            normalizationStatus: "OK",
            normalizationMethod: "identity_usd_t",
            series: deriveSeries(431.9, 2.5, ctx.seriesPoints),
          },
        },
        {
          id: "spot-rapeseed",
          label: "Rapeseed",
          region: "EU",
          commodityGroup: "Oilseeds",
          status: "FALLBACK",
          sourceName: "Demo sample",
          updatedAt: ctx.now.toISOString(),
          price: {
            nativeValueCurrent: 472.4,
            nativeCurrency: "EUR",
            nativeUnit: "EUR/t",
            normalizedValueCurrent: 515.3,
            normalizedCurrency: "USD",
            normalizedUnit: "t",
            nativeValueChangePct: 0.66,
            normalizedValueChangePct: 0.66,
            normalizationStatus: "OK",
            normalizationMethod: "eur_t_to_usd_t",
            normalizationMeta: { fxRateUsed: 1.09 },
            series: deriveSeries(515.3, 3.4, ctx.seriesPoints),
          },
        },
      ];
      const widget: GrainWidgetGlobalSpotTable = {
        id: "grain-global-spot",
        kind: "GLOBAL_SPOT_TABLE",
        title: "Global Spot Prices",
        subtitle: "Wheat / Corn / Soy / Rapeseed",
        status: "FALLBACK",
        sourceName: "Demo sample",
        sourceAttribution: "Data: Demo fallback sample",
        sourceUrl: "https://www.commoditic.com/",
        updatedAt: ctx.now.toISOString(),
        timeframe: ctx.timeframe,
        rows,
        summary: {
          rowCount: rows.length,
          momentumLabel: "Mixed",
          normalizedCoverage: coverage(rows),
        },
        fallbackReason: reason,
      };
      return widget;
    }

    if (this.kind === "CROP_PRICE_INDEX") {
      const country = String(ctx.country || "US").toUpperCase();
      const territoryLabelMap: Record<string, string> = {
        US: "United States",
        UA: "Ukraine",
        BR: "Brazil",
        AR: "Argentina",
      };
      const currentLabel = territoryLabelMap[country] || "United States";
      const widget: GrainWidgetCropPriceIndex = {
        id: "grain-crop-price-index",
        kind: "CROP_PRICE_INDEX",
        title: ENABLE_COUNTRY_MULTI_WIDGET_MOCK ? "Crop Price Index (Mock Multi-Country)" : "Crop Price Index",
        subtitle: ENABLE_COUNTRY_MULTI_WIDGET_MOCK ? "Mock COUNTRY_MULTI selector path" : "Wheat / Soy / Oilseeds composite",
        status: "FALLBACK",
        sourceName: "Demo sample",
        sourceAttribution: "Data: Demo fallback sample",
        sourceUrl: "https://apifarmer.com/",
        updatedAt: ctx.now.toISOString(),
        timeframe: ctx.timeframe,
        cards: [
          { id: "crop-index-total", label: "Crop Price Index", value: 104.8, delta: 1.1, deltaPct: 1.06, status: "FALLBACK", series: deriveSeries(104.8, 1.1, ctx.seriesPoints) },
          { id: "oilseeds-index", label: "Oilseeds", value: 108.4, delta: 1.8, deltaPct: 1.69, status: "FALLBACK", series: deriveSeries(108.4, 1.8, ctx.seriesPoints) },
        ],
        weatherTieIn: {
          available: false,
          label: "Weather-linked signal",
          notes: ["Weather tie-in not available in current provider response"],
        },
        territoryScope: ENABLE_COUNTRY_MULTI_WIDGET_MOCK ? "COUNTRY_MULTI" : "GLOBAL",
        territory: ENABLE_COUNTRY_MULTI_WIDGET_MOCK
          ? { code: country, label: currentLabel }
          : { code: "GLOBAL", label: "Global" },
        supportedTerritories: ENABLE_COUNTRY_MULTI_WIDGET_MOCK
          ? [
              { code: "US", label: "United States" },
              { code: "UA", label: "Ukraine" },
              { code: "BR", label: "Brazil" },
              { code: "AR", label: "Argentina" },
            ]
          : undefined,
        territorySelector: ENABLE_COUNTRY_MULTI_WIDGET_MOCK
          ? {
              paramName: "country",
              default: "US",
              current: country,
              persistKey: "monitor_country_CROP_PRICE_INDEX",
            }
          : undefined,
        fallbackReason: reason,
      };
      return widget;
    }

    if (this.kind === "LIVESTOCK_FEED_TIEIN") {
      const rows = mockLivestockTieInWidgetRaw({
        statusMode: "fallback",
        includeCornFeed: true,
        includeFxSensitiveRow: true,
        partialMode: false,
        sourceName: "Commoditic",
        sourceAttribution: "Data: Commoditic",
      });
      return buildLivestockTieInWidget({
        sourceName: "Commoditic",
        sourceAttribution: "Data: Commoditic",
        sourceUrl: "https://www.commoditic.com/",
        updatedAt: ctx.now.toISOString(),
        status: "FALLBACK",
        rows,
        fx: { eurUsd: ctx.eurUsd },
        buildDerivedCue: true,
        fallbackReason: reason,
        derivedFrom: [{ source: "grainMarkets", key: "CBOT_SOYBEANS", label: "CBOT Soybeans" }],
      });
    }

    if (this.kind === "MACRO_AGRI_INDICES") {
      const raw = mockMacroAgriIndicesRaw({
        statusMode: "fallback",
        renderMode: "fallback",
        includePriceLikeItem: true,
        includeEmbedConfig: true,
        embedBlocked: true,
        partialMode: false,
        sourceName: "TradingEconomics",
        sourceAttribution: "Data: TradingEconomics",
      });
      return buildMacroAgriIndicesWidget({
        sourceName: "TradingEconomics",
        sourceAttribution: "Data: TradingEconomics",
        sourceUrl: "https://tradingeconomics.com/commodities",
        updatedAt: ctx.now.toISOString(),
        timeframe: ctx.timeframe,
        renderMode: "fallback",
        status: "FALLBACK",
        items: raw.items,
        cards: raw.cards,
        embed: raw.embed,
        fx: { eurUsd: ctx.eurUsd },
        fallbackReason: reason,
      });
    }

    if (this.kind === "USDA_MARS_REPORTS") {
      const widget: GrainWidgetUsdaMarsReports = {
        id: "grain-usda-mars-reports",
        kind: "USDA_MARS_REPORTS",
        title: "USDA MARS Grain Reports",
        subtitle: "Metadata-driven report flow (no PDF/TXT parsing)",
        status: "FALLBACK",
        sourceName: "USDA AMS MARS API",
        sourceAttribution: "Data: USDA AMS MARS (public)",
        sourceUrl: "https://marsapi.ams.usda.gov/services/v3.1/public/listPublishedReports?format=json",
        updatedAt: ctx.now.toISOString(),
        timeframe: ctx.timeframe,
        reports: [
          {
            id: "mars-r1",
            title: "Daily Grain Bids - Portland",
            reportId: "MARS-DEMO-001",
            fileType: "PDF",
            category: "Regional bids",
            score: 11,
            tags: {
              region: "US PNW",
              type: "Cash Bids",
              crops: ["wheat", "corn"],
            },
            publishedAt: ctx.now.toISOString(),
            sourceUrl: "https://marsapi.ams.usda.gov/services/v3.1/public/listPublishedReport/MARS-DEMO-001?format=json",
          },
          {
            id: "mars-r2",
            title: "Export Grain Bids - Gulf",
            reportId: "MARS-DEMO-002",
            fileType: "TXT",
            category: "Export bids",
            score: 13,
            tags: {
              region: "US Gulf",
              type: "Export",
              crops: ["soy", "corn"],
            },
            publishedAt: ctx.now.toISOString(),
            sourceUrl: "https://marsapi.ams.usda.gov/services/v3.1/public/listPublishedReport/MARS-DEMO-002?format=json",
          },
          {
            id: "mars-r3",
            title: "Daily Market Rates - Corn and Wheat",
            reportId: "MARS-DEMO-003",
            fileType: "PDF",
            category: "Market rates",
            score: 10,
            tags: {
              region: "US / Other",
              type: "Market Rates",
              crops: ["corn", "wheat"],
            },
            publishedAt: ctx.now.toISOString(),
            sourceUrl: "https://marsapi.ams.usda.gov/services/v3.1/public/listPublishedReport/MARS-DEMO-003?format=json",
          },
        ],
        summary: {
          fetchedCount: 12,
          scannedCount: 12,
          matchedCount: 5,
          excludedCount: 2,
          shownCount: 3,
          reportsReturnedTop: 3,
          moreReportsCount: 2,
          topScoreMin: 10,
          topScoreMax: 13,
          categories: [
            { label: "Regional bids", count: 1 },
            { label: "Export bids", count: 1 },
            { label: "Market rates", count: 1 },
          ],
        },
        notes: ["Mock fallback payload (metadata-only report list)"],
        fallbackReason: reason,
      };
      return widget;
    }

    if (this.kind === "ALPHAVANTAGE_GRAIN_BENCHMARKS") {
      const widget: GrainWidgetAlphaVantageGrainBenchmarks = {
        id: "grain-alpha-vantage-benchmarks",
        kind: "ALPHAVANTAGE_GRAIN_BENCHMARKS",
        title: "Alpha Vantage Grain Benchmarks",
        subtitle: "Functions: WHEAT, CORN",
        status: "FALLBACK",
        sourceName: "Alpha Vantage",
        sourceAttribution: "Data: Alpha Vantage Commodities",
        sourceUrl: "https://www.alphavantage.co/query?function=WHEAT&interval=monthly&apikey=REDACTED",
        updatedAt: ctx.now.toISOString(),
        timeframe: ctx.timeframe,
        rows: [
          {
            id: "av-wheat",
            alphaFunction: "WHEAT",
            label: "Wheat",
            region: "Global",
            commodityGroup: "Grains",
            metricSemanticKind: "price",
            status: "FALLBACK",
            sourceName: "Alpha Vantage",
            sourceAttribution: "Data: Alpha Vantage Commodities",
            updatedAt: ctx.now.toISOString(),
            unitConfidence: "UNKNOWN",
            allowNormalization: false,
            momChangePct: 0.74,
            yoyChangePct: 4.12,
            tags: ["unitConfidence:UNKNOWN", "allowNormalization:false", "cache_hit"],
            notes: ["unit_unverified", "interval:monthly"],
            price: {
              nativeValueCurrent: 241.6,
              nativeCurrency: "USD",
              nativeUnit: "USD (unit unknown)",
              nativeValueChange: 1.8,
              nativeValueChangePct: 0.74,
              normalizationStatus: "UNAVAILABLE",
              series: deriveSeries(241.6, 1.8, Math.max(7, ctx.seriesPoints)),
            },
          },
          {
            id: "av-corn",
            alphaFunction: "CORN",
            label: "Corn",
            region: "Global",
            commodityGroup: "Grains",
            metricSemanticKind: "price",
            status: "FALLBACK",
            sourceName: "Alpha Vantage",
            sourceAttribution: "Data: Alpha Vantage Commodities",
            updatedAt: ctx.now.toISOString(),
            unitConfidence: "UNKNOWN",
            allowNormalization: false,
            momChangePct: -0.41,
            yoyChangePct: 2.38,
            tags: ["unitConfidence:UNKNOWN", "allowNormalization:false", "cache_hit"],
            notes: ["unit_unverified", "interval:monthly"],
            price: {
              nativeValueCurrent: 198.3,
              nativeCurrency: "USD",
              nativeUnit: "USD (unit unknown)",
              nativeValueChange: -0.82,
              nativeValueChangePct: -0.41,
              normalizationStatus: "UNAVAILABLE",
              series: deriveSeries(198.3, -0.82, Math.max(7, ctx.seriesPoints)),
            },
          },
        ],
        summary: {
          expectedCount: 2,
          mappedCount: 2,
          coverage: "2/2",
          cadence: "monthly",
          normalizedCoverage: {
            ok: 0,
            partial: 0,
            fxMissing: 0,
            unavailable: 2,
          },
          byFunction: [
            {
              fn: "WHEAT",
              unitLabel: "USD (unit unknown)",
              unitConfidence: "UNKNOWN",
              allowNormalization: false,
              seriesPoints: Math.max(7, ctx.seriesPoints),
              cacheHit: true,
            },
            {
              fn: "CORN",
              unitLabel: "USD (unit unknown)",
              unitConfidence: "UNKNOWN",
              allowNormalization: false,
              seriesPoints: Math.max(7, ctx.seriesPoints),
              cacheHit: true,
            },
          ],
        },
        notes: ["Mock fallback payload for Alpha Vantage provider"],
        fallbackReason: reason,
      };
      return widget;
    }

    if (this.kind === "NASDAQ_DATA_LINK_SNAPSHOT") {
      const widget: GrainWidgetNasdaqDataLinkSnapshot = {
        id: "grain-nasdaq-data-link-snapshot",
        kind: "NASDAQ_DATA_LINK_SNAPSHOT",
        title: "Nasdaq Data Link Snapshot",
        subtitle: "Macro/gov series",
        status: "FALLBACK",
        sourceName: "Nasdaq Data Link",
        sourceAttribution: "Data: Nasdaq Data Link",
        sourceUrl: "https://data.nasdaq.com/api/v3/datasets/FRED/DGS10.json?rows=8&api_key=REDACTED",
        updatedAt: ctx.now.toISOString(),
        timeframe: ctx.timeframe,
        items: [
          {
            id: "nasdaq-fred-dgs10",
            dataset: "FRED/DGS10",
            label: "10-Year Treasury Constant Maturity Rate",
            nativeValueCurrent: 4.23,
            nativeUnit: "pct",
            changeAbs: 0.03,
            changePct: 0.71,
            unitConfidence: "ASSUMED",
            series: deriveSeries(4.23, 0.03, Math.max(7, ctx.seriesPoints)),
          },
          {
            id: "nasdaq-fred-dgs2",
            dataset: "FRED/DGS2",
            label: "2-Year Treasury Constant Maturity Rate",
            nativeValueCurrent: 4.67,
            nativeUnit: "pct",
            changeAbs: -0.01,
            changePct: -0.21,
            unitConfidence: "ASSUMED",
            series: deriveSeries(4.67, -0.01, Math.max(7, ctx.seriesPoints)),
          },
          {
            id: "nasdaq-fred-dtwexbgs",
            dataset: "FRED/DTWEXBGS",
            label: "Trade Weighted U.S. Dollar Index: Broad",
            nativeValueCurrent: 121.8,
            nativeUnit: "index",
            changeAbs: 0.4,
            changePct: 0.33,
            unitConfidence: "ASSUMED",
            series: deriveSeries(121.8, 0.4, Math.max(7, ctx.seriesPoints)),
          },
          {
            id: "nasdaq-fred-t10y2y",
            dataset: "FRED/T10Y2Y",
            label: "10Y Minus 2Y Treasury Spread",
            nativeValueCurrent: -0.44,
            nativeUnit: "pct",
            changeAbs: 0.02,
            changePct: 4.76,
            unitConfidence: "ASSUMED",
            series: deriveSeries(-0.44, 0.02, Math.max(7, ctx.seriesPoints)),
          },
        ],
        summary: {
          expectedCount: 4,
          mappedCount: 4,
          coverage: "4/4",
          datasetStatuses: [
            { dataset: "FRED/DGS10", status: "ok", sourceUrlUsed: "https://data.nasdaq.com/api/v3/datasets/FRED/DGS10.json?rows=8&api_key=REDACTED" },
            { dataset: "FRED/DGS2", status: "ok", sourceUrlUsed: "https://data.nasdaq.com/api/v3/datasets/FRED/DGS2.json?rows=8&api_key=REDACTED" },
            { dataset: "FRED/DTWEXBGS", status: "ok", sourceUrlUsed: "https://data.nasdaq.com/api/v3/datasets/FRED/DTWEXBGS.json?rows=8&api_key=REDACTED" },
            { dataset: "FRED/T10Y2Y", status: "ok", sourceUrlUsed: "https://data.nasdaq.com/api/v3/datasets/FRED/T10Y2Y.json?rows=8&api_key=REDACTED" },
          ],
        },
        notes: ["Mock fallback payload for Nasdaq Data Link snapshot"],
        fallbackReason: reason,
      };
      return widget;
    }

    if (this.kind === "US_CASH_EXPORT_CONTEXT") {
      const widget: GrainWidgetUsCashExportContext = {
        id: "grain-us-cash-export-context",
        kind: "US_CASH_EXPORT_CONTEXT",
        title: "US Cash / Export Context (USDA)",
        subtitle: "Metadata-only: daily bids & export indications",
        status: "FALLBACK",
        sourceName: "USDA AMS MARS API",
        sourceAttribution: "Data: USDA AMS MARS (public)",
        sourceUrl: "https://marsapi.ams.usda.gov/services/v3.1/public/listPublishedReports?format=json",
        updatedAt: ctx.now.toISOString(),
        timeframe: ctx.timeframe,
        summary: {
          exportIndications: true,
          dailyBids: true,
          marketRates: true,
          reportsToday: 2,
          regions: ["US Gulf", "US PNW", "US Midwest"],
          cadenceHints: ["Daily", "Weekly"],
        },
        topReports: [
          {
            id: "uscx-r1",
            title: "Export Grain Bids - Gulf",
            publishedAt: ctx.now.toISOString(),
            fileType: "TXT",
            regionTag: "US Gulf",
            typeTag: "Export",
            url: "https://marsapi.ams.usda.gov/services/v3.1/public/listPublishedReport/MARS-DEMO-002?format=json",
          },
          {
            id: "uscx-r2",
            title: "Daily Grain Bids - Portland",
            publishedAt: ctx.now.toISOString(),
            fileType: "PDF",
            regionTag: "US PNW",
            typeTag: "Cash Bids",
            url: "https://marsapi.ams.usda.gov/services/v3.1/public/listPublishedReport/MARS-DEMO-001?format=json",
          },
          {
            id: "uscx-r3",
            title: "Daily Market Rates - Corn and Wheat",
            publishedAt: ctx.now.toISOString(),
            fileType: "PDF",
            regionTag: "US Midwest",
            typeTag: "Market Rates",
            url: "https://marsapi.ams.usda.gov/services/v3.1/public/listPublishedReport/MARS-DEMO-003?format=json",
          },
        ],
        notes: ["Mock fallback summary (metadata-only)"],
        fallbackReason: reason,
      };
      return widget;
    }

    if (this.kind === "USDA_GTR_LOGISTICS_SNAPSHOT") {
      const points = Math.max(7, ctx.seriesPoints);
      const widget: GrainWidgetUsdaGtrLogisticsSnapshot = {
        id: "grain-usda-gtr-logistics-snapshot",
        kind: "USDA_GTR_LOGISTICS_SNAPSHOT",
        title: "US Logistics (USDA GTR)",
        subtitle: "Barge / Rail / Fuel freight proxies",
        status: "FALLBACK",
        sourceName: "USDA AMS (GTR)",
        sourceAttribution: "Data: USDA Grain Transportation Report",
        sourceUrl: "https://www.ams.usda.gov/services/transportation-analysis/grain-transportation-report",
        updatedAt: ctx.now.toISOString(),
        timeframe: ctx.timeframe,
        items: [
          {
            metric: "BARGE",
            label: "Barge Rate Index",
            current: 611,
            unit: "index",
            changeAbs: 8,
            changePct: 1.33,
            series: deriveSeries(611, 8, points),
            confidence: "HIGH",
          },
          {
            metric: "RAIL",
            label: "Rail Tariff Proxy",
            current: 224,
            unit: "index",
            changeAbs: -2,
            changePct: -0.88,
            series: deriveSeries(224, -2, points),
            confidence: "MED",
          },
          {
            metric: "FUEL",
            label: "Rail Fuel Surcharge Proxy",
            current: 188,
            unit: "index",
            changeAbs: 4,
            changePct: 2.17,
            series: deriveSeries(188, 4, points),
            confidence: "MED",
          },
        ],
        summary: {
          expectedCount: 3,
          mappedCount: 3,
          coverage: "3/3",
          cadence: "weekly",
        },
        notes: ["Mock fallback payload for USDA GTR logistics snapshot"],
        fallbackReason: reason,
        debug: {
          sourceUrlUsed: "https://www.ams.usda.gov/sites/default/files/media/GTRTable7.csv",
          rowsParsed: 24,
          parseWarnings: ["mock_fallback_mode"],
        },
      };
      return widget;
    }

    if (this.kind === "CANADA_GRAIN_RAIL_PERFORMANCE") {
      const points = Math.max(7, ctx.seriesPoints);
      const widget: GrainWidgetCanadaRailPerformance = {
        id: "grain-canada-rail-performance",
        kind: "CANADA_GRAIN_RAIL_PERFORMANCE",
        title: "Canada Grain Rail Performance",
        subtitle: "Official weekly rail performance indicators",
        status: "FALLBACK",
        sourceName: "Statistics Canada",
        sourceAttribution: "Data: Statistics Canada rail service indicators",
        sourceUrl: "https://www150.statcan.gc.ca/t1/wds/rest/getFullTableDownloadCSV/23100275/en",
        updatedAt: ctx.now.toISOString(),
        timeframe: ctx.timeframe,
        territoryScope: "COUNTRY_FIXED",
        territory: { code: "CA", label: "Canada" },
        items: [
          { metric: "LOADED_CARS", label: "Cars loaded", current: 5712, unit: "cars", changeAbs: 84, changePct: 1.49, confidence: "HIGH", series: deriveSeries(5712, 84, points) },
          { metric: "FULFILLMENT", label: "Order fulfillment", current: 91.6, unit: "%", changeAbs: 0.7, changePct: 0.77, confidence: "MED", series: deriveSeries(91.6, 0.7, points) },
        ],
        summary: {
          expectedCount: 4,
          mappedCount: 2,
          coverage: "2/4",
          cadence: "weekly",
        },
        notes: ["Mock fallback payload for Canada grain rail performance"],
        fallbackReason: reason,
        debug: {
          sourceUrlUsed: "https://www150.statcan.gc.ca/t1/wds/rest/getFullTableDownloadCSV/23100275/en",
          rowsParsed: 42,
          columnsDetected: ["REF_DATE", "Rail service indicators", "VALUE", "UOM"],
        },
      };
      return widget;
    }

    if (this.kind === "EC_CEREALS_MULTI_COUNTRY" || this.kind === "EC_OILSEEDS_MULTI_COUNTRY" || this.kind === "USDA_NASS_PRODUCER_PRICES") {
      const isCereals = this.kind === "EC_CEREALS_MULTI_COUNTRY";
      const isOilseeds = this.kind === "EC_OILSEEDS_MULTI_COUNTRY";
      const territoryCode = isCereals || isOilseeds ? String(ctx.country || "FR").toUpperCase() : "US";
      const territoryLabelMap: Record<string, string> = {
        FR: "France",
        DE: "Germany",
        PL: "Poland",
        RO: "Romania",
        ES: "Spain",
        BG: "Bulgaria",
        US: "United States",
      };
      const supportedTerritories = isCereals
        ? ["FR", "DE", "PL", "RO", "ES"]
        : isOilseeds
          ? ["FR", "DE", "RO", "BG", "PL", "ES"]
          : ["US"];
      const currentTerritory = supportedTerritories.includes(territoryCode) ? territoryCode : supportedTerritories[0];
      const label = territoryLabelMap[currentTerritory] || currentTerritory;
      const rows: GrainWidgetTableRow[] = isCereals
        ? [
            {
              id: `ec-cereal-softwheat-${currentTerritory}`,
              label: "Soft Wheat",
              region: label,
              commodityGroup: "Grains",
              status: "FALLBACK",
              sourceName: "EC Agri-food Data Portal",
              updatedAt: ctx.now.toISOString(),
              price: {
                nativeValueCurrent: 228.4,
                nativeCurrency: "EUR",
                nativeUnit: "EUR/t",
                normalizedValueCurrent: 246.7,
                normalizedCurrency: "USD",
                normalizedUnit: "t",
                nativeValueChangePct: 1.14,
                normalizedValueChangePct: 1.14,
                normalizationStatus: "OK",
                normalizationMethod: "eur_t_to_usd_t",
                series: deriveSeries(246.7, 2.8, ctx.seriesPoints),
              },
            },
            {
              id: `ec-cereal-maize-${currentTerritory}`,
              label: "Maize (Corn)",
              region: label,
              commodityGroup: "Grains",
              status: "FALLBACK",
              sourceName: "EC Agri-food Data Portal",
              updatedAt: ctx.now.toISOString(),
              price: {
                nativeValueCurrent: 214.1,
                nativeCurrency: "EUR",
                nativeUnit: "EUR/t",
                normalizedValueCurrent: 231.2,
                normalizedCurrency: "USD",
                normalizedUnit: "t",
                nativeValueChangePct: -0.61,
                normalizedValueChangePct: -0.61,
                normalizationStatus: "OK",
                normalizationMethod: "eur_t_to_usd_t",
                series: deriveSeries(231.2, -1.4, ctx.seriesPoints),
              },
            },
            {
              id: `ec-cereal-barley-${currentTerritory}`,
              label: "Barley",
              region: label,
              commodityGroup: "Grains",
              status: "FALLBACK",
              sourceName: "EC Agri-food Data Portal",
              updatedAt: ctx.now.toISOString(),
              price: {
                nativeValueCurrent: 205.3,
                nativeCurrency: "EUR",
                nativeUnit: "EUR/t",
                normalizedValueCurrent: 221.7,
                normalizedCurrency: "USD",
                normalizedUnit: "t",
                nativeValueChangePct: 0.24,
                normalizedValueChangePct: 0.24,
                normalizationStatus: "OK",
                normalizationMethod: "eur_t_to_usd_t",
                series: deriveSeries(221.7, 0.5, ctx.seriesPoints),
              },
            },
          ]
        : isOilseeds
          ? [
              {
                id: `ec-oil-rapeseed-${currentTerritory}`,
                label: "Rapeseed (Canola)",
                region: label,
                commodityGroup: "Oilseeds",
                status: "FALLBACK",
                sourceName: "EC Agri-food Data Portal",
                updatedAt: ctx.now.toISOString(),
                price: {
                  nativeValueCurrent: 486.2,
                  nativeCurrency: "EUR",
                  nativeUnit: "EUR/t",
                  normalizedValueCurrent: 525.1,
                  normalizedCurrency: "USD",
                  normalizedUnit: "t",
                  nativeValueChangePct: 0.92,
                  normalizedValueChangePct: 0.92,
                  normalizationStatus: "OK",
                  normalizationMethod: "eur_t_to_usd_t",
                  series: deriveSeries(525.1, 4.8, ctx.seriesPoints),
                },
              },
              {
                id: `ec-oil-sunflower-${currentTerritory}`,
                label: "Sunflower seed",
                region: label,
                commodityGroup: "Oilseeds",
                status: "FALLBACK",
                sourceName: "EC Agri-food Data Portal",
                updatedAt: ctx.now.toISOString(),
                price: {
                  nativeValueCurrent: 438.6,
                  nativeCurrency: "EUR",
                  nativeUnit: "EUR/t",
                  normalizedValueCurrent: 473.7,
                  normalizedCurrency: "USD",
                  normalizedUnit: "t",
                  nativeValueChangePct: -0.34,
                  normalizedValueChangePct: -0.34,
                  normalizationStatus: "OK",
                  normalizationMethod: "eur_t_to_usd_t",
                  series: deriveSeries(473.7, -1.6, ctx.seriesPoints),
                },
              },
            ]
          : [
              {
                id: "usda-nass-corn",
                label: "Corn",
                region: "United States",
                commodityGroup: "Grains",
                status: "FALLBACK",
                sourceName: "USDA NASS QuickStats",
                updatedAt: ctx.now.toISOString(),
                price: {
                  nativeValueCurrent: 4.82,
                  nativeCurrency: "USD",
                  nativeUnit: "USD/bu",
                  normalizedValueCurrent: 189.8,
                  normalizedCurrency: "USD",
                  normalizedUnit: "t",
                  normalizationStatus: "OK",
                  normalizationMethod: "usd_bu_to_usd_t",
                  series: deriveSeries(189.8, 2.4, ctx.seriesPoints),
                },
              },
              {
                id: "usda-nass-wheat",
                label: "Wheat",
                region: "United States",
                commodityGroup: "Grains",
                status: "FALLBACK",
                sourceName: "USDA NASS QuickStats",
                updatedAt: ctx.now.toISOString(),
                price: {
                  nativeValueCurrent: 6.13,
                  nativeCurrency: "USD",
                  nativeUnit: "USD/bu",
                  normalizedValueCurrent: 225.3,
                  normalizedCurrency: "USD",
                  normalizedUnit: "t",
                  normalizationStatus: "OK",
                  normalizationMethod: "usd_bu_to_usd_t",
                  series: deriveSeries(225.3, -1.8, ctx.seriesPoints),
                },
              },
              {
                id: "usda-nass-soy",
                label: "Soybeans",
                region: "United States",
                commodityGroup: "Oilseeds",
                status: "FALLBACK",
                sourceName: "USDA NASS QuickStats",
                updatedAt: ctx.now.toISOString(),
                price: {
                  nativeValueCurrent: 11.44,
                  nativeCurrency: "USD",
                  nativeUnit: "USD/bu",
                  normalizedValueCurrent: 420.4,
                  normalizedCurrency: "USD",
                  normalizedUnit: "t",
                  normalizationStatus: "OK",
                  normalizationMethod: "usd_bu_to_usd_t",
                  series: deriveSeries(420.4, 3.9, ctx.seriesPoints),
                },
              },
            ];
      const widget: GrainWidgetEcOfficialPricesSnapshot = {
        id: `mock-${this.kind.toLowerCase()}`,
        kind: this.kind as any,
        title: isCereals ? "EC Cereals Prices" : isOilseeds ? "EC Oilseeds Prices" : "USDA NASS Producer Prices",
        subtitle: isCereals ? "Official EU cereals market layer" : isOilseeds ? "Official EU oilseeds market layer" : "Official US producer/statistical layer",
        status: "FALLBACK",
        sourceName: isCereals || isOilseeds ? "EC Agri-food Data Portal" : "USDA NASS QuickStats",
        sourceAttribution: isCereals ? "Data: European Commission Agri-food Data Portal (Cereals)" : isOilseeds ? "Data: European Commission Agri-food Data Portal (Oilseeds)" : "Data: USDA NASS QuickStats API",
        sourceUrl: isCereals ? "https://agridata.ec.europa.eu/extensions/API_Documentation/cereals.html" : isOilseeds ? "https://agridata.ec.europa.eu/extensions/API_Documentation/oilseeds.html" : "https://quickstats.nass.usda.gov/api",
        updatedAt: ctx.now.toISOString(),
        timeframe: ctx.timeframe,
        territoryScope: isCereals || isOilseeds ? "COUNTRY_MULTI" : "COUNTRY_FIXED",
        territory: { code: currentTerritory, label },
        supportedTerritories: (isCereals || isOilseeds) ? supportedTerritories.map((code) => ({ code, label: territoryLabelMap[code] || code })) : undefined,
        territorySelector: (isCereals || isOilseeds)
          ? { paramName: "country", default: supportedTerritories[0], current: currentTerritory, persistKey: `monitor_country_${this.kind}` }
          : undefined,
        rows,
        summary: {
          expectedCount: isCereals ? 5 : isOilseeds ? 3 : 3,
          mappedCount: rows.length,
          coverage: `${rows.length}/${isCereals ? 5 : isOilseeds ? 3 : 3}`,
          cadence: isCereals || isOilseeds ? "weekly" : "annual",
          selectedTerritory: currentTerritory,
        },
        debug: {
          rowsParsed: rows.length * 8,
          warnings: ["mock_fallback_mode"],
        },
        notes: [`Mock fallback payload for ${this.kind}`],
        fallbackReason: reason,
      };
      return widget;
    }

    if (this.kind === "FAOSTAT_PP_MULTI_COUNTRY") {
      const territoryCode = String(ctx.country || "UA").toUpperCase();
      const territoryLabelMap: Record<string, string> = {
        UA: "Ukraine",
        US: "United States",
        BR: "Brazil",
        AR: "Argentina",
        EU: "EU (proxy)",
      };
      const territoryLabel = territoryLabelMap[territoryCode] || "Ukraine";
      const points = Math.max(7, ctx.seriesPoints);
      const widget: GrainWidgetFaostatPpMultiCountry = {
        id: "grain-faostat-pp-multi-country",
        kind: "FAOSTAT_PP_MULTI_COUNTRY",
        title: "Regional Producer Prices (FAOSTAT)",
        subtitle: "FAOSTAT PP (producer prices)",
        status: "FALLBACK",
        sourceName: "FAOSTAT (PP)",
        sourceAttribution: "Data: FAOSTAT Producer Prices",
        sourceUrl: "https://fenixservices.fao.org/faostat/api/v1/en/data/PP",
        updatedAt: ctx.now.toISOString(),
        timeframe: ctx.timeframe,
        territoryScope: "COUNTRY_MULTI",
        territory: { code: territoryCode, label: territoryLabel },
        supportedTerritories: [
          { code: "UA", label: "Ukraine" },
          { code: "US", label: "United States" },
          { code: "BR", label: "Brazil" },
          { code: "AR", label: "Argentina" },
          { code: "EU", label: "European Union" },
        ],
        territorySelector: {
          paramName: "country",
          default: "UA",
          current: territoryCode,
          persistKey: "monitor_country_FAOSTAT_PP_MULTI_COUNTRY",
        },
        rows: [
          {
            crop: "WHEAT",
            label: "Wheat",
            current: 248.6,
            unit: "USD/t",
            cadence: "annual",
            changeAbs: 6.1,
            changePct: 2.51,
            series: deriveSeries(248.6, 6.1, points),
            confidence: "MED",
            territory: { code: territoryCode, label: territoryLabel },
          },
          {
            crop: "MAIZE",
            label: "Maize (Corn)",
            current: 219.4,
            unit: "USD/t",
            cadence: "annual",
            changeAbs: -2.4,
            changePct: -1.08,
            series: deriveSeries(219.4, -2.4, points),
            confidence: "MED",
            territory: { code: territoryCode, label: territoryLabel },
          },
          {
            crop: "SOY",
            label: "Soybeans",
            current: 403.8,
            unit: "USD/t",
            cadence: "annual",
            changeAbs: 4.3,
            changePct: 1.08,
            series: deriveSeries(403.8, 4.3, points),
            confidence: "MED",
            territory: { code: territoryCode, label: territoryLabel },
          },
        ],
        summary: {
          expectedCount: 5,
          mappedCount: 3,
          coverage: "3/5",
          cadence: "annual",
          selectedTerritory: territoryCode,
        },
        debug: {
          sourceUrlUsed: "https://fenixservices.fao.org/faostat/api/v1/en/data/PP",
          areaCodes: [territoryCode],
          itemCodes: ["WHEAT", "MAIZE", "SOYBEANS"],
          elementCode: "5532",
          elementLabel: "Producer Price (USD/tonne)",
          observationsByCrop: [
            { crop: "WHEAT", count: 5 },
            { crop: "MAIZE", count: 5 },
            { crop: "SOY", count: 5 },
          ],
          discoveryCacheHit: true,
          warnings: ["mock_fallback_mode"],
        },
        notes: ["Mock fallback payload for FAOSTAT PP multi-country widget"],
        fallbackReason: reason,
      };
      return widget;
    }

    if (this.kind === "FPMA_MARKET_PRICES_MULTI_COUNTRY") {
      const territoryCode = String(ctx.country || "UA").toUpperCase();
      const territoryLabelMap: Record<string, string> = {
        UA: "Ukraine",
        US: "United States",
        BR: "Brazil",
        AR: "Argentina",
        EU: "European Union",
      };
      const territoryLabel = territoryLabelMap[territoryCode] || "Ukraine";
      const selectedPriceType = String(ctx.priceType || "WHOLESALE").toUpperCase() === "RETAIL" ? "RETAIL" : "WHOLESALE";
      const points = Math.max(7, ctx.seriesPoints);
      const widget: GrainWidgetFpmaMarketPricesMultiCountry = {
        id: "grain-fpma-market-prices-multi-country",
        kind: "FPMA_MARKET_PRICES_MULTI_COUNTRY",
        title: "Domestic Market Prices (FPMA)",
        subtitle: "FAO FPMA (wholesale/retail)",
        status: "FALLBACK",
        sourceName: "FAO FPMA (GIEWS)",
        sourceAttribution: "Data: FAO FPMA domestic market prices",
        sourceUrl: "https://fpma.fao.org/giews/fpmat4/api/prices",
        updatedAt: ctx.now.toISOString(),
        timeframe: ctx.timeframe,
        territoryScope: "COUNTRY_MULTI",
        territory: { code: territoryCode, label: territoryLabel },
        supportedTerritories: [
          { code: "UA", label: "Ukraine" },
          { code: "US", label: "United States" },
          { code: "BR", label: "Brazil" },
          { code: "AR", label: "Argentina" },
          { code: "EU", label: "European Union" },
        ],
        territorySelector: {
          paramName: "country",
          default: "UA",
          current: territoryCode,
          persistKey: "monitor_country_FPMA_MARKET_PRICES_MULTI_COUNTRY",
        },
        selector: {
          priceType: {
            current: selectedPriceType,
            options: ["WHOLESALE", "RETAIL"],
          },
        },
        rows: [
          {
            crop: "WHEAT",
            label: "Wheat",
            current: 9.42,
            unit: territoryCode === "UA" ? "UAH/kg" : territoryCode === "BR" ? "BRL/60kg" : "USD/t",
            currency: territoryCode === "UA" ? "UAH" : territoryCode === "BR" ? "BRL" : "USD",
            cadence: "monthly",
            changeAbs: 0.21,
            changePct: 2.28,
            series: deriveSeries(9.42, 0.21, points),
            confidence: "MED",
            territory: { code: territoryCode, label: territoryLabel },
          },
          {
            crop: "MAIZE",
            label: "Maize (Corn)",
            current: 7.13,
            unit: territoryCode === "UA" ? "UAH/kg" : territoryCode === "AR" ? "ARS/t" : "USD/t",
            currency: territoryCode === "UA" ? "UAH" : territoryCode === "AR" ? "ARS" : "USD",
            cadence: "monthly",
            changeAbs: -0.08,
            changePct: -1.11,
            series: deriveSeries(7.13, -0.08, points),
            confidence: "MED",
            territory: { code: territoryCode, label: territoryLabel },
          },
          {
            crop: "SOY",
            label: "Soybeans",
            current: 14.87,
            unit: territoryCode === "UA" ? "UAH/kg" : territoryCode === "BR" ? "BRL/60kg" : "USD/t",
            currency: territoryCode === "UA" ? "UAH" : territoryCode === "BR" ? "BRL" : "USD",
            cadence: "monthly",
            changeAbs: 0.19,
            changePct: 1.29,
            series: deriveSeries(14.87, 0.19, points),
            confidence: "MED",
            territory: { code: territoryCode, label: territoryLabel },
          },
        ],
        summary: {
          expectedCount: 5,
          mappedCount: 3,
          coverage: "3/5",
          cadence: "monthly",
          selectedTerritory: territoryCode,
          selectedPriceType,
        },
        debug: {
          sourceUrlUsed: "https://fpma.fao.org/giews/fpmat4/api/prices?format=json",
          countryQueryUsed: territoryCode,
          commodityIdsUsed: ["WHEAT", "MAIZE", "SOYBEANS"],
          rowsParsed: 18,
          warnings: ["mock_fallback_mode"],
        },
        notes: ["Mock fallback payload for FPMA multi-country widget", "Native units preserved"],
        fallbackReason: reason,
      };
      return widget;
    }

    if (this.kind === "USDA_MARS_DAILY_MARKET_RATES_TXT") {
      const widget: GrainWidgetUsdaMarsDailyMarketRatesTxt = {
        id: "grain-usda-mars-daily-market-rates-txt",
        kind: "USDA_MARS_DAILY_MARKET_RATES_TXT",
        title: "US Daily Market Rates (TXT)",
        subtitle: "USDA AMS MARS (metadata + TXT parse)",
        status: "FALLBACK",
        sourceName: "USDA AMS MARS",
        sourceAttribution: "USDA MARS Daily Market Rates (TXT)",
        sourceUrl: "https://marsapi.ams.usda.gov/services/v3.1/public/listPublishedReports?format=json",
        updatedAt: ctx.now.toISOString(),
        timeframe: ctx.timeframe,
        report: {
          reportId: 3420,
          publishedAt: ctx.now.toISOString(),
          fileName: "daily_market_rates_demo",
          fileType: "txt",
          sourceUrl: "https://marsapi.ams.usda.gov/marsapi/reports/daily_market_rates_demo.txt",
        },
        rows: [
          {
            commodity: "WHEAT",
            market: "US Gulf",
            label: "HRW Wheat Gulf",
            price: { nativeValueCurrent: 5.62, nativeUnit: "USD/bu", normalizedValueCurrent: 206.4, normalizedUnit: "USD/t" },
            change: { nativeAbs: 0.04, nativePct: 0.72 },
            confidence: "HIGH",
          },
          {
            commodity: "CORN",
            market: "US Midwest",
            label: "Corn Elevator Bid",
            price: { nativeValueCurrent: 471, nativeUnit: "c/bu", normalizedValueCurrent: 185.4, normalizedUnit: "USD/t" },
            change: { nativeAbs: -2, nativePct: -0.42 },
            confidence: "HIGH",
          },
          {
            commodity: "SOY",
            market: "US PNW",
            label: "Soybeans PNW Bid",
            price: { nativeValueCurrent: 11.14, nativeUnit: "USD/bu", normalizedValueCurrent: 409.2, normalizedUnit: "USD/t" },
            change: { nativeAbs: 0.08, nativePct: 0.72 },
            confidence: "MED",
          },
        ],
        notes: ["Mock fallback payload for USDA TXT parser widget"],
        debug: {
          linesFetched: 120,
          linesMatched: 3,
          parseMode: "strict",
          matchedSections: ["WHEAT", "CORN", "SOY", "MARKET_RATES"],
          warnings: ["range_midpoint_used: Corn Elevator Bid"],
        },
        fallbackReason: reason,
      };
      return widget;
    }

    const rows: GrainWidgetTableRow[] = [
      {
        id: "fut-corn-nearby",
        label: "Corn",
        sublabel: "Nearby",
        commodityGroup: "Grains",
        status: "FALLBACK",
        sourceName: "Demo sample",
        updatedAt: ctx.now.toISOString(),
        price: {
          nativeValueCurrent: 472.25,
          nativeCurrency: "USD",
          nativeUnit: "c/bu",
          normalizedValueCurrent: 185.9,
          normalizedCurrency: "USD",
          normalizedUnit: "t",
          nativeValueChangePct: 0.75,
          normalizedValueChangePct: 0.75,
          normalizationStatus: "OK",
          normalizationMethod: "cbot_cents_bu_to_usd_t",
          normalizationMeta: { bushelsPerTon: 39.368, cropFactor: "corn" },
          series: deriveSeries(185.9, 1.4, ctx.seriesPoints),
        },
      },
      {
        id: "fut-wheat-nearby",
        label: "Wheat",
        sublabel: "Nearby",
        commodityGroup: "Grains",
        status: "FALLBACK",
        sourceName: "Demo sample",
        updatedAt: ctx.now.toISOString(),
        price: {
          nativeValueCurrent: 580.15,
          nativeCurrency: "USD",
          nativeUnit: "c/bu",
          normalizedValueCurrent: 213.1,
          normalizedCurrency: "USD",
          normalizedUnit: "t",
          nativeValueChangePct: -0.22,
          normalizedValueChangePct: -0.22,
          normalizationStatus: "OK",
          normalizationMethod: "cbot_cents_bu_to_usd_t",
          normalizationMeta: { bushelsPerTon: 36.744, cropFactor: "wheat" },
          series: deriveSeries(213.1, -0.5, ctx.seriesPoints),
        },
      },
      {
        id: "fut-soy-nearby",
        label: "Soybeans",
        sublabel: "Nearby",
        commodityGroup: "Oilseeds",
        status: "FALLBACK",
        sourceName: "Demo sample",
        updatedAt: ctx.now.toISOString(),
        price: {
          nativeValueCurrent: 1124.3,
          nativeCurrency: "USD",
          nativeUnit: "c/bu",
          normalizedValueCurrent: 413.1,
          normalizedCurrency: "USD",
          normalizedUnit: "t",
          nativeValueChangePct: 0.53,
          normalizedValueChangePct: 0.53,
          normalizationStatus: "OK",
          normalizationMethod: "cbot_cents_bu_to_usd_t",
          normalizationMeta: { bushelsPerTon: 36.744, cropFactor: "soybeans" },
          series: deriveSeries(413.1, 2.2, ctx.seriesPoints),
        },
      },
    ];
    const widget: GrainWidgetCbotFuturesSnapshot = {
      id: "grain-cbot-futures-snapshot",
      kind: "CBOT_FUTURES_SNAPSHOT",
      title: "CBOT Futures Snapshot",
      subtitle: "Intraday snapshot",
      status: "FALLBACK",
      sourceName: "Demo sample",
      sourceAttribution: "Data: Demo fallback sample",
      sourceUrl: "https://futures.tradingcharts.com/marketquotes/CBOT.html",
      updatedAt: ctx.now.toISOString(),
      timeframe: ctx.timeframe,
      rows,
      summary: {
        contractsParsed: rows.length,
        parseMode: "snapshot",
      },
      fallbackReason: reason,
    };
    return widget;
  }
}
