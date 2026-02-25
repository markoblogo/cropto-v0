import type {
  GrainWidget,
  GrainWidgetCropPriceIndex,
  GrainWidgetKind,
  GrainWidgetUsdaMarsReports,
  GrainWidgetTableRow,
  GrainWidgetUSCashBids,
  GrainWidgetGlobalSpotTable,
  GrainWidgetCbotFuturesSnapshot,
} from "../types";
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
      const widget: GrainWidgetCropPriceIndex = {
        id: "grain-crop-price-index",
        kind: "CROP_PRICE_INDEX",
        title: "Crop Price Index",
        subtitle: "Wheat / Soy / Oilseeds composite",
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
            publishedAt: ctx.now.toISOString(),
            sourceUrl: "https://marsapi.ams.usda.gov/services/v3.1/public/listPublishedReport/MARS-DEMO-001?format=json",
          },
          {
            id: "mars-r2",
            title: "Export Grain Bids - Gulf",
            reportId: "MARS-DEMO-002",
            fileType: "TXT",
            category: "Export bids",
            publishedAt: ctx.now.toISOString(),
            sourceUrl: "https://marsapi.ams.usda.gov/services/v3.1/public/listPublishedReport/MARS-DEMO-002?format=json",
          },
          {
            id: "mars-r3",
            title: "Daily Market Rates - Corn and Wheat",
            reportId: "MARS-DEMO-003",
            fileType: "PDF",
            category: "Market rates",
            publishedAt: ctx.now.toISOString(),
            sourceUrl: "https://marsapi.ams.usda.gov/services/v3.1/public/listPublishedReport/MARS-DEMO-003?format=json",
          },
        ],
        summary: {
          fetchedCount: 12,
          matchedCount: 5,
          shownCount: 3,
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
