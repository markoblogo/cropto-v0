import { latestFxSnapshot } from "../../ingestion/storage/fxRepository";
import {
  ENABLE_GRAIN_WIDGETS_EXPANSION,
  ENABLE_GRAIN_WIDGETS_MOCK_FALLBACK,
  GRAIN_WIDGETS_CACHE_TTL_MS,
  GRAIN_WIDGETS_REFRESH_MS,
  GRAIN_WIDGETS_SERIES_POINTS,
  GRAIN_WIDGETS_TIMEFRAME_DEFAULT,
} from "./config";
import { ApiFarmerProvider } from "./providers/apiFarmerProvider";
import { BarchartCashProvider } from "./providers/barchartCashProvider";
import { CommoditicLivestockProvider } from "./providers/commoditicLivestockProvider";
import { CommoditicProvider } from "./providers/commoditicProvider";
import { DbNomicsSpotProvider } from "./providers/dbNomicsSpotProvider";
import { FaoFfpiProvider } from "./providers/faoFfpiProvider";
import { MockGrainWidgetsProvider } from "./providers/mockGrainWidgetsProvider";
import { TradingChartsFuturesProvider } from "./providers/tradingChartsFuturesProvider";
import { TradingEconomicsAgriProvider } from "./providers/tradingEconomicsAgriProvider";
import { UsCashExportContextProvider } from "./providers/usCashExportContextProvider";
import { UsdaMarsReportsProvider } from "./providers/usdaMarsReportsProvider";
import type { GrainWidgetsProvider, GrainWidgetsProviderContext } from "./providers/types";
import type {
  GrainWidget,
  GrainWidgetKind,
  GrainWidgetsDebug,
  GrainWidgetsMeta,
  GrainWidgetsProviderDebug,
  GrainWidgetsResponse,
} from "./types";

type CacheEntry = {
  providerId: string;
  fetchedAt: number;
  lastSuccessAt?: string;
  lastError?: string;
  chainTried?: string[];
  data: GrainWidget;
};

type ProviderRuntime = {
  status: GrainWidgetsProviderDebug["status"];
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  error?: string;
  errorKind?: GrainWidgetsProviderDebug["errorKind"];
  mappedCount?: number;
  expectedCount?: number;
  reportsFetched?: number;
  reportsScanned?: number;
  reportsMatchedInclude?: number;
  reportsExcluded?: number;
  reportsReturnedTop?: number;
  topScoreMin?: number;
  topScoreMax?: number;
  sourceUrlUsed?: string;
  widgetsReturned?: GrainWidgetKind[];
  fallbackUsed?: boolean;
  cacheHit?: boolean;
  notes?: string[];
};

const EXPECTED_COVERAGE: Partial<Record<GrainWidgetKind, number>> = {
  US_CASH_BIDS: 3,
  CBOT_FUTURES_SNAPSHOT: 3,
  GLOBAL_SPOT_TABLE: 4,
  CROP_PRICE_INDEX: 3,
  LIVESTOCK_FEED_TIEIN: 2,
  MACRO_AGRI_INDICES: 2,
  USDA_MARS_REPORTS: 6,
  US_CASH_EXPORT_CONTEXT: 3,
};

const WIDGET_ORDER: GrainWidgetKind[] = [
  "US_CASH_BIDS",
  "GLOBAL_SPOT_TABLE",
  "CROP_PRICE_INDEX",
  "CBOT_FUTURES_SNAPSHOT",
  "LIVESTOCK_FEED_TIEIN",
  "MACRO_AGRI_INDICES",
  "USDA_MARS_REPORTS",
  "US_CASH_EXPORT_CONTEXT",
];

function statusRank(status: GrainWidget["status"]): number {
  if (status === "LIVE") return 6;
  if (status === "REFRESH") return 5;
  if (status === "DELAYED") return 4;
  if (status === "INDICATIVE") return 3;
  if (status === "FALLBACK") return 2;
  return 1;
}

function countStatuses(widgets: GrainWidget[]) {
  return {
    totalWidgets: widgets.length,
    live: widgets.filter((widget) => widget.status === "LIVE").length,
    delayed: widgets.filter((widget) => widget.status === "DELAYED").length,
    indicative: widgets.filter((widget) => widget.status === "INDICATIVE" || widget.status === "REFRESH").length,
    fallback: widgets.filter((widget) => widget.status === "FALLBACK").length,
    offline: widgets.filter((widget) => widget.status === "OFFLINE").length,
  };
}

function collectRows(widget: GrainWidget) {
  if (widget.kind === "US_CASH_BIDS" || widget.kind === "GLOBAL_SPOT_TABLE" || widget.kind === "CBOT_FUTURES_SNAPSHOT") {
    return widget.rows;
  }
  if (widget.kind === "CROP_PRICE_INDEX") {
    return widget.rows || [];
  }
  if (widget.kind === "LIVESTOCK_FEED_TIEIN") {
    return widget.rows;
  }
  return [];
}

function widgetMetricCounts(widget: GrainWidget): { rows: number; items: number; cards: number } {
  if (widget.kind === "US_CASH_BIDS" || widget.kind === "GLOBAL_SPOT_TABLE" || widget.kind === "CBOT_FUTURES_SNAPSHOT") {
    return { rows: widget.rows.length, items: 0, cards: 0 };
  }
  if (widget.kind === "CROP_PRICE_INDEX") {
    return { rows: widget.rows?.length || 0, items: 0, cards: widget.cards.length };
  }
  if (widget.kind === "LIVESTOCK_FEED_TIEIN") {
    return { rows: widget.rows.length, items: 0, cards: 0 };
  }
  if (widget.kind === "MACRO_AGRI_INDICES") {
    return { rows: 0, items: widget.items?.length || 0, cards: widget.cards?.length || 0 };
  }
  if (widget.kind === "USDA_MARS_REPORTS") {
    return { rows: 0, items: widget.reports.length, cards: 0 };
  }
  if (widget.kind === "US_CASH_EXPORT_CONTEXT") {
    return { rows: 0, items: widget.topReports.length, cards: 0 };
  }
  return { rows: 0, items: 0, cards: 0 };
}

function mappedCountForWidget(widget: GrainWidget): number {
  if (widget.kind === "US_CASH_BIDS" || widget.kind === "GLOBAL_SPOT_TABLE" || widget.kind === "CBOT_FUTURES_SNAPSHOT" || widget.kind === "LIVESTOCK_FEED_TIEIN") {
    return widget.rows.filter((row) => row.price?.nativeValueCurrent != null || row.price?.normalizedValueCurrent != null).length;
  }
  if (widget.kind === "CROP_PRICE_INDEX") {
    const rowCount = (widget.rows || []).filter((row) => row.price?.nativeValueCurrent != null || row.price?.normalizedValueCurrent != null).length;
    const cardCount = (widget.cards || []).filter((card) => card.value != null || card.valueText != null).length;
    return rowCount + cardCount;
  }
  if (widget.kind === "MACRO_AGRI_INDICES") {
    return (widget.items || []).filter((item) => {
      if (item.metricSemanticKind === "price") return item.price?.nativeValueCurrent != null || item.price?.normalizedValueCurrent != null;
      return item.valueCurrent != null;
    }).length;
  }
  if (widget.kind === "USDA_MARS_REPORTS") {
    return widget.reports.length;
  }
  if (widget.kind === "US_CASH_EXPORT_CONTEXT") {
    return widget.topReports.length;
  }
  return 0;
}

function widgetHasUsableData(widget: GrainWidget): boolean {
  if (widget.status === "OFFLINE") return false;
  if (widget.kind === "US_CASH_EXPORT_CONTEXT") {
    const hasTopReports = widget.topReports.length > 0;
    const hasSummarySignals =
      widget.summary.reportsToday > 0 ||
      widget.summary.exportIndications ||
      widget.summary.dailyBids ||
      widget.summary.marketRates ||
      widget.summary.regions.length > 0 ||
      (widget.summary.cadenceHints?.length || 0) > 0;
    return hasTopReports || hasSummarySignals;
  }
  const counts = widgetMetricCounts(widget);
  const mapped = mappedCountForWidget(widget);
  return mapped > 0 || counts.rows > 0 || counts.items > 0 || counts.cards > 0;
}

function collectPriceLikeMetrics(widgets: GrainWidget[]) {
  const rowMetrics = widgets.flatMap((widget) => collectRows(widget)).filter((row) => row.price);
  const macroPriceMetrics = widgets
    .filter((widget): widget is Extract<GrainWidget, { kind: "MACRO_AGRI_INDICES" }> => widget.kind === "MACRO_AGRI_INDICES")
    .flatMap((widget) => widget.items || [])
    .filter((item) => item.metricSemanticKind === "price" && item.price)
    .map((item) => item.price!);
  const allPriceMetrics = [
    ...rowMetrics.map((row) => row.price!),
    ...macroPriceMetrics,
  ];
  return allPriceMetrics;
}

function runtimeStatusFromWidget(widget: GrainWidget): GrainWidgetsProviderDebug["status"] {
  if (widget.status === "OFFLINE") return "error";
  if (widget.status === "FALLBACK" || widget.status === "DELAYED" || widget.status === "INDICATIVE") return "partial";
  return "ok";
}

function classifyProviderErrorKind(error?: string): GrainWidgetsProviderDebug["errorKind"] {
  if (!error) return undefined;
  const upper = error.toUpperCase();
  if (upper.includes("ENOTFOUND")) return "DNS";
  if (upper.includes("ETIMEDOUT") || upper.includes("ABORT_ERR") || upper.includes("TIMEOUT")) return "TIMEOUT";
  const httpCode = error.match(/HTTP\s+(\d{3})/i);
  if (httpCode) {
    const code = Number.parseInt(httpCode[1], 10);
    if (code >= 400 && code < 500) return code === 403 ? "BLOCKED" : "HTTP_4XX";
    if (code >= 500) return "HTTP_5XX";
  }
  if (upper.includes("PARSE")) return "PARSE";
  if (upper.includes("EMPTY") || upper.includes("NO_MATCHING_REPORTS") || upper.includes("COVERAGE_EMPTY")) return "EMPTY";
  if (upper.includes("BLOCKED")) return "BLOCKED";
  return "UNKNOWN";
}

export class GrainWidgetsService {
  private readonly providerChains: Record<GrainWidgetKind, GrainWidgetsProvider[]> = {
    US_CASH_BIDS: [new BarchartCashProvider()],
    GLOBAL_SPOT_TABLE: [new DbNomicsSpotProvider(), new CommoditicProvider()],
    CROP_PRICE_INDEX: [new FaoFfpiProvider(), new ApiFarmerProvider()],
    CBOT_FUTURES_SNAPSHOT: [new TradingChartsFuturesProvider()],
    CBOT_FUTURES_CURVE: [],
    LIVESTOCK_FEED_TIEIN: [new CommoditicLivestockProvider()],
    MACRO_AGRI_INDICES: [new TradingEconomicsAgriProvider()],
    USDA_MARS_REPORTS: [new UsdaMarsReportsProvider()],
    US_CASH_EXPORT_CONTEXT: [new UsCashExportContextProvider()],
  };

  private readonly providers: GrainWidgetsProvider[] = Object.values(this.providerChains)
    .flat()
    .reduce<GrainWidgetsProvider[]>((acc, provider) => {
      if (!acc.some((item) => item.id === provider.id)) acc.push(provider);
      return acc;
    }, []);

  private readonly mockProviders: Record<GrainWidgetKind, GrainWidgetsProvider> = {
    US_CASH_BIDS: new MockGrainWidgetsProvider({ kind: "US_CASH_BIDS" }),
    GLOBAL_SPOT_TABLE: new MockGrainWidgetsProvider({ kind: "GLOBAL_SPOT_TABLE" }),
    CROP_PRICE_INDEX: new MockGrainWidgetsProvider({ kind: "CROP_PRICE_INDEX" }),
    CBOT_FUTURES_SNAPSHOT: new MockGrainWidgetsProvider({ kind: "CBOT_FUTURES_SNAPSHOT" }),
    CBOT_FUTURES_CURVE: new MockGrainWidgetsProvider({ kind: "CBOT_FUTURES_SNAPSHOT" }),
    LIVESTOCK_FEED_TIEIN: new MockGrainWidgetsProvider({ kind: "LIVESTOCK_FEED_TIEIN" }),
    MACRO_AGRI_INDICES: new MockGrainWidgetsProvider({ kind: "MACRO_AGRI_INDICES" }),
    USDA_MARS_REPORTS: new MockGrainWidgetsProvider({ kind: "USDA_MARS_REPORTS" }),
    US_CASH_EXPORT_CONTEXT: new MockGrainWidgetsProvider({ kind: "US_CASH_EXPORT_CONTEXT" }),
  };

  private readonly cache = new Map<GrainWidgetKind, CacheEntry>();
  private readonly providerRuntime = new Map<string, ProviderRuntime>();
  private refreshInFlight: Promise<void> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private lastFxRateUsed: number | null = null;

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.refreshAll(true);
    }, GRAIN_WIDGETS_REFRESH_MS);
  }

  async list(): Promise<GrainWidgetsResponse> {
    if (!ENABLE_GRAIN_WIDGETS_EXPANSION) {
      return {
        widgets: {
          byKind: {},
          order: [],
        },
        meta: {
          generatedAt: new Date().toISOString(),
          partialFailure: false,
          timeframe: GRAIN_WIDGETS_TIMEFRAME_DEFAULT,
          enabledWidgetKinds: [],
          returnedWidgetKinds: [],
        },
      };
    }

    await this.refreshAll(false);

    const enabledKinds = WIDGET_ORDER.filter((kind) => (this.providerChains[kind] || []).some((provider) => provider.enabled));
    const widgets: GrainWidget[] = [];
    const fallbackUsed: Partial<Record<GrainWidgetKind, boolean>> = {};
    const sourceErrors: Array<{ providerId: string; widgetKind?: GrainWidgetKind; rowId?: string; message: string }> = [];
    const now = Date.now();

    for (const kind of enabledKinds) {
      const cached = this.cache.get(kind);
      if (!cached) continue;
      const age = now - cached.fetchedAt;
      let data = cached.data;
      if (age > GRAIN_WIDGETS_CACHE_TTL_MS && (data.status === "LIVE" || data.status === "REFRESH" || data.status === "INDICATIVE")) {
        data = {
          ...data,
          status: "DELAYED",
          fallbackReason: data.fallbackReason || "cache_stale",
        };
      }
      widgets.push(data);
      if (statusRank(data.status) <= statusRank("FALLBACK")) fallbackUsed[data.kind] = true;
      if (cached.lastError) sourceErrors.push({ providerId: cached.providerId, widgetKind: kind, message: cached.lastError });
    }

    const byKind = Object.fromEntries(widgets.map((widget) => [widget.kind, widget])) as GrainWidgetsResponse["widgets"]["byKind"];
    const order = widgets.map((widget) => widget.kind);
    const priceMetrics = collectPriceLikeMetrics(widgets);
    const rowsByStatus = {
      OK: priceMetrics.filter((row) => row.normalizationStatus === "OK").length,
      PARTIAL: priceMetrics.filter((row) => row.normalizationStatus === "PARTIAL").length,
      FX_MISSING: priceMetrics.filter((row) => row.normalizationStatus === "FX_MISSING").length,
      UNAVAILABLE: priceMetrics.filter((row) => row.normalizationStatus === "UNAVAILABLE" || !row.normalizationStatus).length,
    };
    const macroEmbed = widgets
      .filter((widget): widget is Extract<GrainWidget, { kind: "MACRO_AGRI_INDICES" }> => widget.kind === "MACRO_AGRI_INDICES")
      .map((widget) => widget.embed?.status)
      .filter(Boolean);

    const meta: GrainWidgetsMeta = {
      generatedAt: new Date().toISOString(),
      partialFailure: widgets.some((widget) => ["DELAYED", "FALLBACK", "OFFLINE"].includes(widget.status)),
      cacheAgeSec: widgets.length
        ? Math.floor((now - Math.min(...widgets.map((widget) => this.cache.get(widget.kind)?.fetchedAt || now))) / 1000)
        : undefined,
      timeframe: GRAIN_WIDGETS_TIMEFRAME_DEFAULT,
      enabledWidgetKinds: enabledKinds,
      returnedWidgetKinds: order,
      counts: countStatuses(widgets),
      normalization: {
        normalizedPriceMetricsOk: rowsByStatus.OK,
        normalizedPriceMetricsPartial: rowsByStatus.PARTIAL,
        fxMissing: rowsByStatus.FX_MISSING,
        unavailable: rowsByStatus.UNAVAILABLE,
        fxRateUsed: this.lastFxRateUsed ?? undefined,
      },
    };

    const debug: GrainWidgetsDebug = {
      providers: this.providers.map((provider) => {
        const state = this.providerRuntime.get(provider.id);
        const kindCache = this.cache.get(provider.kind);
        const ownsCache = kindCache?.providerId === provider.id;

        return {
          providerId: provider.id,
          providerType: provider.id,
          enabled: provider.enabled,
          status: state?.status || (provider.enabled ? "error" : "disabled"),
          lastSuccessAt: state?.lastSuccessAt,
          lastAttemptAt: state?.lastAttemptAt || new Date().toISOString(),
          cacheHit: ownsCache ? true : state?.cacheHit,
          cacheAgeSec: ownsCache && kindCache ? Math.floor((now - kindCache.fetchedAt) / 1000) : undefined,
          widgetsRequested: [provider.kind],
          widgetsReturned: state?.widgetsReturned || (ownsCache ? [provider.kind] : []),
          mappedCount: state?.mappedCount,
          expectedCount: state?.expectedCount,
          reportsFetched: state?.reportsFetched,
          reportsScanned: state?.reportsScanned,
          reportsMatchedInclude: state?.reportsMatchedInclude,
          reportsExcluded: state?.reportsExcluded,
          reportsReturnedTop: state?.reportsReturnedTop,
          topScoreMin: state?.topScoreMin,
          topScoreMax: state?.topScoreMax,
          errorKind: state?.errorKind,
          coverage: state?.expectedCount != null ? `${state?.mappedCount || 0}/${state.expectedCount}` : undefined,
          sourceUrlUsed: state?.sourceUrlUsed || (ownsCache ? kindCache?.data.sourceUrl : undefined),
          fallbackChain: "real->cache->mock",
          fallbackUsed: state?.fallbackUsed,
          notes: state?.notes,
          error: state?.error,
        } satisfies GrainWidgetsProviderDebug;
      }),
      sourceErrors: sourceErrors.length ? sourceErrors : undefined,
      fallbackUsed,
      normalization: {
        fxRateUsed: this.lastFxRateUsed ?? undefined,
        rowsByStatus,
        embed: {
          blockedCount: macroEmbed.filter((status) => status === "BLOCKED").length,
          disabledCount: macroEmbed.filter((status) => status === "DISABLED").length,
          unavailableCount: macroEmbed.filter((status) => status === "UNAVAILABLE").length,
        },
      },
      fallbackChain: "real->cache->mock",
      unavailableWidgets: enabledKinds.filter((kind) => !order.includes(kind)),
    };

    return {
      widgets: {
        byKind,
        order,
      },
      meta,
      debug,
    };
  }

  debugSummary(): {
    enabled: boolean;
    refreshMs: number;
    cacheTtlMs: number;
    providers: GrainWidgetsProviderDebug[];
    normalization: {
      fxRateUsed?: number;
      normalizedCount: number;
      nativeFallbackCount: number;
      rowsByStatus?: {
        OK: number;
        PARTIAL: number;
        FX_MISSING: number;
        UNAVAILABLE: number;
      };
    };
  } {
    const now = Date.now();
    const priceMetrics = collectPriceLikeMetrics([...this.cache.values()].map((entry) => entry.data));
    return {
      enabled: ENABLE_GRAIN_WIDGETS_EXPANSION,
      refreshMs: GRAIN_WIDGETS_REFRESH_MS,
      cacheTtlMs: GRAIN_WIDGETS_CACHE_TTL_MS,
      providers: this.providers.map((provider) => {
        const state = this.providerRuntime.get(provider.id);
        const kindCache = this.cache.get(provider.kind);
        const ownsCache = kindCache?.providerId === provider.id;
        return {
          providerId: provider.id,
          providerType: provider.id,
          enabled: provider.enabled,
          status: state?.status || (provider.enabled ? "error" : "disabled"),
          lastSuccessAt: state?.lastSuccessAt,
          lastAttemptAt: state?.lastAttemptAt || new Date().toISOString(),
          cacheHit: ownsCache ? true : state?.cacheHit,
          cacheAgeSec: ownsCache && kindCache ? Math.floor((now - kindCache.fetchedAt) / 1000) : undefined,
          widgetsRequested: [provider.kind],
          widgetsReturned: state?.widgetsReturned || (ownsCache ? [provider.kind] : []),
          mappedCount: state?.mappedCount,
          expectedCount: state?.expectedCount,
          reportsFetched: state?.reportsFetched,
          reportsScanned: state?.reportsScanned,
          reportsMatchedInclude: state?.reportsMatchedInclude,
          reportsExcluded: state?.reportsExcluded,
          reportsReturnedTop: state?.reportsReturnedTop,
          topScoreMin: state?.topScoreMin,
          topScoreMax: state?.topScoreMax,
          errorKind: state?.errorKind,
          coverage: state?.expectedCount != null ? `${state?.mappedCount || 0}/${state.expectedCount}` : undefined,
          sourceUrlUsed: state?.sourceUrlUsed || (ownsCache ? kindCache?.data.sourceUrl : undefined),
          fallbackChain: "real->cache->mock",
          fallbackUsed: state?.fallbackUsed,
          notes: state?.notes,
          error: state?.error,
        };
      }),
      normalization: {
        fxRateUsed: this.lastFxRateUsed ?? undefined,
        normalizedCount: priceMetrics.filter((row) => row.normalizationStatus === "OK").length,
        nativeFallbackCount: priceMetrics.filter((row) => row.normalizationStatus !== "OK").length,
        rowsByStatus: {
          OK: priceMetrics.filter((row) => row.normalizationStatus === "OK").length,
          PARTIAL: priceMetrics.filter((row) => row.normalizationStatus === "PARTIAL").length,
          FX_MISSING: priceMetrics.filter((row) => row.normalizationStatus === "FX_MISSING").length,
          UNAVAILABLE: priceMetrics.filter((row) => row.normalizationStatus === "UNAVAILABLE" || !row.normalizationStatus).length,
        },
      },
    };
  }

  private recordProviderState(provider: GrainWidgetsProvider, state: Partial<ProviderRuntime>): void {
    const current = this.providerRuntime.get(provider.id) || { status: provider.enabled ? "error" : "disabled" };
    this.providerRuntime.set(provider.id, {
      ...current,
      ...state,
      expectedCount: EXPECTED_COVERAGE[provider.kind],
    });
  }

  private async refreshKind(kind: GrainWidgetKind, ctx: GrainWidgetsProviderContext, now: number, force: boolean): Promise<void> {
    const chain = (this.providerChains[kind] || []).filter((provider) => provider.enabled);
    const existing = this.cache.get(kind);
    if (!chain.length) return;
    if (!force && existing && now - existing.fetchedAt < GRAIN_WIDGETS_REFRESH_MS) {
      const owner = chain.find((provider) => provider.id === existing.providerId);
      if (owner) this.recordProviderState(owner, { status: runtimeStatusFromWidget(existing.data), cacheHit: true });
      return;
    }

    const chainTried: string[] = [];
    const errors: string[] = [];

    for (const provider of chain) {
      const attemptAt = new Date().toISOString();
      chainTried.push(provider.id);
      this.recordProviderState(provider, {
        status: provider.enabled ? "partial" : "disabled",
        lastAttemptAt: attemptAt,
        cacheHit: false,
        widgetsReturned: [],
        errorKind: undefined,
        reportsFetched: undefined,
        reportsScanned: undefined,
        reportsMatchedInclude: undefined,
        reportsExcluded: undefined,
        reportsReturnedTop: undefined,
        topScoreMin: undefined,
        topScoreMax: undefined,
      });

      try {
        const data = await provider.getWidget(ctx);
        const mappedCount = mappedCountForWidget(data);
        const usable = widgetHasUsableData(data);
        const usdaSummary = data.kind === "USDA_MARS_REPORTS" ? data.summary : undefined;

        if (!usable) {
          const reason = data.fallbackReason || "coverage_empty";
          errors.push(`${provider.id}:${reason}`);
          this.recordProviderState(provider, {
            status: "partial",
            error: reason,
            errorKind: classifyProviderErrorKind(reason),
            sourceUrlUsed: data.sourceUrl,
            mappedCount,
            reportsFetched: usdaSummary?.fetchedCount,
            reportsScanned: usdaSummary?.scannedCount,
            reportsMatchedInclude: usdaSummary?.matchedCount,
            reportsExcluded: usdaSummary?.excludedCount,
            reportsReturnedTop: usdaSummary?.reportsReturnedTop ?? usdaSummary?.shownCount,
            topScoreMin: usdaSummary?.topScoreMin,
            topScoreMax: usdaSummary?.topScoreMax,
            fallbackUsed: true,
          });
          continue;
        }

        this.cache.set(kind, {
          providerId: provider.id,
          fetchedAt: now,
          lastSuccessAt: attemptAt,
          data,
          chainTried,
        });

        this.recordProviderState(provider, {
          status: runtimeStatusFromWidget(data),
          lastSuccessAt: attemptAt,
          error: undefined,
          errorKind: undefined,
          sourceUrlUsed: data.sourceUrl,
          mappedCount,
          reportsFetched: usdaSummary?.fetchedCount,
          reportsScanned: usdaSummary?.scannedCount,
          reportsMatchedInclude: usdaSummary?.matchedCount,
          reportsExcluded: usdaSummary?.excludedCount,
          reportsReturnedTop: usdaSummary?.reportsReturnedTop ?? usdaSummary?.shownCount,
          topScoreMin: usdaSummary?.topScoreMin,
          topScoreMax: usdaSummary?.topScoreMax,
          widgetsReturned: [kind],
          fallbackUsed: ["DELAYED", "FALLBACK", "OFFLINE"].includes(data.status),
          notes: data.notes?.slice(0, 3),
        });

        return;
      } catch (error: any) {
        const reason = error?.message || "fetch_failed";
        errors.push(`${provider.id}:${reason}`);
        this.recordProviderState(provider, {
          status: "error",
          error: reason,
          errorKind: classifyProviderErrorKind(reason),
          mappedCount: 0,
          widgetsReturned: [],
          fallbackUsed: true,
        });
      }
    }

    const reason = errors.length ? errors.join(" | ") : "all_providers_failed";

    if (existing) {
      this.cache.set(kind, {
        ...existing,
        lastError: reason,
        chainTried,
      });
      return;
    }

    if (ENABLE_GRAIN_WIDGETS_MOCK_FALLBACK) {
      const mockProvider = this.mockProviders[kind];
      const data = mockProvider.mockFallback(reason, ctx);
      this.cache.set(kind, {
        providerId: mockProvider.id,
        fetchedAt: now,
        data: {
          ...data,
          status: "FALLBACK",
          fallbackReason: reason,
        },
        lastError: reason,
        chainTried,
      });
      return;
    }

    const provider = chain[0];
    if (!provider) return;
    this.cache.set(kind, {
      providerId: provider.id,
      fetchedAt: now,
      data: {
        ...provider.mockFallback(reason, ctx),
        status: "OFFLINE",
        fallbackReason: reason,
      },
      lastError: reason,
      chainTried,
    });
  }

  private async refreshAll(force: boolean): Promise<void> {
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = (async () => {
      const now = Date.now();
      const eurUsd = await this.loadEurUsd();
      const ctx: GrainWidgetsProviderContext = {
        now: new Date(),
        timeframe: GRAIN_WIDGETS_TIMEFRAME_DEFAULT,
        seriesPoints: GRAIN_WIDGETS_SERIES_POINTS,
        eurUsd,
        getCachedWidget: (kind) => this.cache.get(kind)?.data,
      };

      await Promise.all(WIDGET_ORDER.map((kind) => this.refreshKind(kind, ctx, now, force)));
    })().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private async loadEurUsd(): Promise<number | null> {
    try {
      const fx = await latestFxSnapshot();
      const eurUsd = fx.usdPerUnit.EUR ?? null;
      this.lastFxRateUsed = eurUsd;
      return eurUsd;
    } catch {
      this.lastFxRateUsed = null;
      return null;
    }
  }
}
