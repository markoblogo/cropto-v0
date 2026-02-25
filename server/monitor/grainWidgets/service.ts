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
import { CommoditicProvider } from "./providers/commoditicProvider";
import { CommoditicLivestockProvider } from "./providers/commoditicLivestockProvider";
import { MockGrainWidgetsProvider } from "./providers/mockGrainWidgetsProvider";
import { TradingChartsFuturesProvider } from "./providers/tradingChartsFuturesProvider";
import { TradingEconomicsAgriProvider } from "./providers/tradingEconomicsAgriProvider";
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
  fetchedAt: number;
  lastSuccessAt?: string;
  lastError?: string;
  data: GrainWidget;
};

const EXPECTED_COVERAGE: Partial<Record<GrainWidgetKind, number>> = {
  US_CASH_BIDS: 3,
  CBOT_FUTURES_SNAPSHOT: 3,
  GLOBAL_SPOT_TABLE: 4,
  CROP_PRICE_INDEX: 3,
  LIVESTOCK_FEED_TIEIN: 2,
  MACRO_AGRI_INDICES: 2,
};

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
  return { rows: 0, items: 0, cards: 0 };
}

function mappedCountForWidget(widget: GrainWidget): number {
  if (widget.kind === "US_CASH_BIDS" || widget.kind === "GLOBAL_SPOT_TABLE" || widget.kind === "CBOT_FUTURES_SNAPSHOT" || widget.kind === "LIVESTOCK_FEED_TIEIN") {
    return widget.rows.filter((row) => row.price?.nativeValueCurrent != null || row.price?.normalizedValueCurrent != null).length;
  }
  if (widget.kind === "CROP_PRICE_INDEX") {
    return (widget.rows || []).filter((row) => row.price?.nativeValueCurrent != null || row.price?.normalizedValueCurrent != null).length;
  }
  if (widget.kind === "MACRO_AGRI_INDICES") {
    return (widget.items || []).filter((item) => {
      if (item.metricSemanticKind === "price") return item.price?.nativeValueCurrent != null || item.price?.normalizedValueCurrent != null;
      return item.valueCurrent != null;
    }).length;
  }
  return 0;
}

function providerState(provider: GrainWidgetsProvider, cached?: CacheEntry): GrainWidgetsProviderDebug["status"] {
  if (!provider.enabled) return "disabled";
  if (!cached) return "error";
  if (cached.data.status === "OFFLINE") return "error";
  if (cached.data.status === "FALLBACK" || cached.data.status === "DELAYED" || cached.lastError) return "partial";
  return "ok";
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

export class GrainWidgetsService {
  private readonly providers: GrainWidgetsProvider[] = [
    new BarchartCashProvider(),
    new TradingChartsFuturesProvider(),
    new CommoditicProvider(),
    new ApiFarmerProvider(),
    new CommoditicLivestockProvider(),
    new TradingEconomicsAgriProvider(),
  ];

  private readonly mockProviders: Record<GrainWidgetKind, GrainWidgetsProvider> = {
    US_CASH_BIDS: new MockGrainWidgetsProvider({ kind: "US_CASH_BIDS" }),
    GLOBAL_SPOT_TABLE: new MockGrainWidgetsProvider({ kind: "GLOBAL_SPOT_TABLE" }),
    CROP_PRICE_INDEX: new MockGrainWidgetsProvider({ kind: "CROP_PRICE_INDEX" }),
    CBOT_FUTURES_SNAPSHOT: new MockGrainWidgetsProvider({ kind: "CBOT_FUTURES_SNAPSHOT" }),
    CBOT_FUTURES_CURVE: new MockGrainWidgetsProvider({ kind: "CBOT_FUTURES_SNAPSHOT" }),
    LIVESTOCK_FEED_TIEIN: new MockGrainWidgetsProvider({ kind: "LIVESTOCK_FEED_TIEIN" }),
    MACRO_AGRI_INDICES: new MockGrainWidgetsProvider({ kind: "MACRO_AGRI_INDICES" }),
  };

  private readonly cache = new Map<GrainWidgetKind, CacheEntry>();
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

    const enabledKinds = this.providers.filter((provider) => provider.enabled).map((provider) => provider.kind);
    const widgets: GrainWidget[] = [];
    const fallbackUsed: Partial<Record<GrainWidgetKind, boolean>> = {};
    const sourceErrors: Array<{ providerId: string; widgetKind?: GrainWidgetKind; rowId?: string; message: string }> = [];
    const now = Date.now();

    for (const provider of this.providers) {
      if (!provider.enabled) continue;
      const cached = this.cache.get(provider.kind);
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
      if (cached.lastError) sourceErrors.push({ providerId: provider.id, widgetKind: provider.kind, message: cached.lastError });
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
        const cached = this.cache.get(provider.kind);
        const counts = cached ? widgetMetricCounts(cached.data) : { rows: 0, items: 0, cards: 0 };
        const mappedCount = cached ? mappedCountForWidget(cached.data) : 0;
        const expectedCount = EXPECTED_COVERAGE[provider.kind];
        return {
          providerId: provider.id,
          providerType: provider.id,
          enabled: provider.enabled,
          status: providerState(provider, cached),
          lastSuccessAt: cached?.lastSuccessAt,
          lastAttemptAt: new Date().toISOString(),
          cacheAgeSec: cached ? Math.floor((now - cached.fetchedAt) / 1000) : undefined,
          widgetsRequested: [provider.kind],
          widgetsReturned: cached ? [cached.data.kind] : [],
          rowsReturned: counts.rows || undefined,
          itemsReturned: counts.items || undefined,
          cardsReturned: counts.cards || undefined,
          mappedCount: cached ? mappedCount : undefined,
          expectedCount,
          coverage: expectedCount ? `${mappedCount}/${expectedCount}` : undefined,
          sourceUrlUsed: cached?.data.sourceUrl,
          fallbackChain: "real->cache->mock",
          fallbackUsed: cached ? ["DELAYED", "FALLBACK", "OFFLINE"].includes(cached.data.status) : undefined,
          error: cached?.lastError,
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
        const cached = this.cache.get(provider.kind);
        const counts = cached ? widgetMetricCounts(cached.data) : { rows: 0, items: 0, cards: 0 };
        const mappedCount = cached ? mappedCountForWidget(cached.data) : 0;
        const expectedCount = EXPECTED_COVERAGE[provider.kind];
        return {
          providerId: provider.id,
          providerType: provider.id,
          enabled: provider.enabled,
          status: providerState(provider, cached),
          lastSuccessAt: cached?.lastSuccessAt,
          lastAttemptAt: new Date().toISOString(),
          cacheHit: Boolean(cached),
          cacheAgeSec: cached ? Math.floor((now - cached.fetchedAt) / 1000) : undefined,
          widgetsRequested: [provider.kind],
          widgetsReturned: cached ? [cached.data.kind] : [],
          rowsReturned: counts.rows || undefined,
          itemsReturned: counts.items || undefined,
          cardsReturned: counts.cards || undefined,
          mappedCount: cached ? mappedCount : undefined,
          expectedCount,
          coverage: expectedCount ? `${mappedCount}/${expectedCount}` : undefined,
          sourceUrlUsed: cached?.data.sourceUrl,
          fallbackChain: "real->cache->mock",
          fallbackUsed: cached ? ["DELAYED", "FALLBACK", "OFFLINE"].includes(cached.data.status) : undefined,
          error: cached?.lastError,
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
      };

      await Promise.all(
        this.providers.map(async (provider) => {
          if (!provider.enabled) return;
          const existing = this.cache.get(provider.kind);
          if (!force && existing && now - existing.fetchedAt < GRAIN_WIDGETS_REFRESH_MS) return;
          try {
            const data = await provider.getWidget(ctx);
            this.cache.set(provider.kind, {
              fetchedAt: now,
              lastSuccessAt: new Date().toISOString(),
              data,
            });
          } catch (error: any) {
            const reason = error?.message || "fetch_failed";
            if (existing) {
              this.cache.set(provider.kind, {
                ...existing,
                lastError: reason,
              });
              return;
            }
            if (ENABLE_GRAIN_WIDGETS_MOCK_FALLBACK) {
              const mockProvider = this.mockProviders[provider.kind];
              const data = mockProvider.mockFallback(reason, ctx);
              this.cache.set(provider.kind, {
                fetchedAt: now,
                data: {
                  ...data,
                  status: "FALLBACK",
                  fallbackReason: reason,
                },
                lastError: reason,
              });
              return;
            }
            this.cache.set(provider.kind, {
              fetchedAt: now,
              data: {
                ...provider.mockFallback(reason, ctx),
                status: "OFFLINE",
                fallbackReason: reason,
              },
              lastError: reason,
            });
          }
        }),
      );
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
