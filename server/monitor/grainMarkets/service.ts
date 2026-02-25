import {
  ENABLE_GRAIN_MARKETS_CORE,
  GRAIN_MARKETS_CACHE_TTL_MS,
  GRAIN_MARKETS_REFRESH_MS,
  GRAIN_MARKETS_SERIES_POINTS,
  GRAIN_MARKETS_TIMEFRAME_DEFAULT,
} from "./config";
import { buildComparisonWidgets } from "./comparison";
import { quoteToWidget } from "./mapping";
import { CBOT_KEYS, DEFAULT_GRAIN_MARKET_INSTRUMENT_ORDER, EURONEXT_KEYS } from "./symbols";
import type {
  GrainMarketInstrumentKey,
  GrainMarketQuoteNormalized,
  GrainMarketsDebug,
  GrainMarketsMeta,
  GrainMarketsProviderDebug,
  GrainMarketsResponse,
  GrainMarketsWidgetsPayload,
} from "./types";
import { CbotBarchartProvider } from "./providers/cbotBarchartProvider";
import { CbotTradingChartsProvider } from "./providers/cbotTradingChartsProvider";
import { EuronextWebProvider } from "./providers/euronextWebProvider";
import { MockGrainMarketsProvider } from "./providers/mockGrainMarketsProvider";
import type { GrainMarketsProvider, GrainMarketsProviderContext } from "./providers/types";

type ProviderRuntimeDebug = GrainMarketsProviderDebug & {
  sourceErrors?: Array<{ instrumentKey?: GrainMarketInstrumentKey; message: string }>;
};

type CacheEntry = {
  fetchedAt: number;
  response: GrainMarketsResponse;
  providerDebug: ProviderRuntimeDebug[];
};

export class GrainMarketsService {
  private readonly cbotPrimary: GrainMarketsProvider = new CbotBarchartProvider();
  private readonly cbotFallback: GrainMarketsProvider = new CbotTradingChartsProvider();
  private readonly euronextPrimary: GrainMarketsProvider = new EuronextWebProvider();
  private readonly mockProvider: GrainMarketsProvider = new MockGrainMarketsProvider();

  private timer: NodeJS.Timeout | null = null;
  private refreshInFlight: Promise<void> | null = null;
  private cache: CacheEntry | null = null;

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.refresh(true);
    }, GRAIN_MARKETS_REFRESH_MS);
  }

  async list(): Promise<GrainMarketsResponse> {
    if (!ENABLE_GRAIN_MARKETS_CORE) {
      const emptyWidgets: GrainMarketsWidgetsPayload = { cbot: [], euronext: [], comparisons: [] };
      return {
        widgets: emptyWidgets,
        meta: {
          generatedAt: new Date().toISOString(),
          partialFailure: false,
          timeframe: GRAIN_MARKETS_TIMEFRAME_DEFAULT,
          instrumentsRequested: DEFAULT_GRAIN_MARKET_INSTRUMENT_ORDER,
          instrumentsReturned: [],
        },
        debug: { providers: [] },
      };
    }

    await this.refresh(false);
    if (!this.cache) {
      await this.refresh(true);
    }

    if (!this.cache) {
      return this.offlineFallbackResponse("cache_unavailable");
    }

    const age = Date.now() - this.cache.fetchedAt;
    const response = structuredClone(this.cache.response);
    response.meta.cacheAgeSec = Math.floor(age / 1000);

    if (age > GRAIN_MARKETS_CACHE_TTL_MS) {
      for (const group of [response.widgets.cbot, response.widgets.euronext]) {
        for (const widget of group) {
          if (widget.status === "LIVE" || widget.status === "REFRESH") {
            widget.status = "DELAYED";
          }
          widget.fallbackReason = widget.fallbackReason || "cache_stale";
        }
      }
      for (const widget of response.widgets.comparisons) {
        if (widget.status === "LIVE" || widget.status === "REFRESH") {
          widget.status = "DELAYED";
        }
        widget.fallbackReason = widget.fallbackReason || "cache_stale";
      }
      response.meta.partialFailure = true;
    }

    return response;
  }

  debugSummary(): { enabled: boolean; refreshMs: number; cacheTtlMs: number; providers: GrainMarketsProviderDebug[] } {
    return {
      enabled: ENABLE_GRAIN_MARKETS_CORE,
      refreshMs: GRAIN_MARKETS_REFRESH_MS,
      cacheTtlMs: GRAIN_MARKETS_CACHE_TTL_MS,
      providers: this.cache?.providerDebug || [],
    };
  }

  private async refresh(force: boolean): Promise<void> {
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = (async () => {
      if (!force && this.cache && Date.now() - this.cache.fetchedAt < GRAIN_MARKETS_REFRESH_MS) {
        return;
      }

      const now = new Date();
      const ctx: GrainMarketsProviderContext = {
        timeframe: GRAIN_MARKETS_TIMEFRAME_DEFAULT,
        seriesPoints: GRAIN_MARKETS_SERIES_POINTS,
        now,
      };

      const providerDebug: ProviderRuntimeDebug[] = [];
      const sourceErrors: GrainMarketsDebug["sourceErrors"] = [];

      const cbotQuotes = await this.resolveVenueQuotes(
        CBOT_KEYS,
        [this.cbotPrimary, this.cbotFallback],
        ctx,
        providerDebug,
        sourceErrors,
      );

      const euronextQuotes = await this.resolveVenueQuotes(
        EURONEXT_KEYS,
        [this.euronextPrimary],
        ctx,
        providerDebug,
        sourceErrors,
      );

      const allQuotes = [...cbotQuotes, ...euronextQuotes];
      const cbotWidgets = cbotQuotes.map((quote) => quoteToWidget(quote));
      const euronextWidgets = euronextQuotes.map((quote) => quoteToWidget(quote));
      const comparisons = buildComparisonWidgets(allQuotes, now.toISOString());

      const instrumentsReturned = allQuotes
        .filter((quote) => quote.valueCurrent != null)
        .map((quote) => quote.key);

      const fallbackUsed: Partial<Record<GrainMarketInstrumentKey, boolean>> = {};
      for (const quote of allQuotes) {
        if (["FALLBACK", "OFFLINE", "INDICATIVE", "DELAYED"].includes(quote.status)) {
          fallbackUsed[quote.key] = true;
        }
      }

      const meta: GrainMarketsMeta = {
        generatedAt: now.toISOString(),
        partialFailure: allQuotes.some((quote) => quote.status === "FALLBACK" || quote.status === "OFFLINE"),
        timeframe: GRAIN_MARKETS_TIMEFRAME_DEFAULT,
        instrumentsRequested: DEFAULT_GRAIN_MARKET_INSTRUMENT_ORDER,
        instrumentsReturned,
        counts: {
          total: allQuotes.length,
          live: allQuotes.filter((quote) => quote.status === "LIVE" || quote.status === "REFRESH").length,
          delayed: allQuotes.filter((quote) => quote.status === "DELAYED").length,
          indicative: allQuotes.filter((quote) => quote.status === "INDICATIVE").length,
          fallback: allQuotes.filter((quote) => quote.status === "FALLBACK").length,
          offline: allQuotes.filter((quote) => quote.status === "OFFLINE").length,
        },
      };

      const response: GrainMarketsResponse = {
        widgets: {
          cbot: cbotWidgets,
          euronext: euronextWidgets,
          comparisons,
        },
        meta,
        debug: {
          providers: providerDebug,
          sourceErrors,
          fallbackUsed,
          symbolMapping: {
            CBOT_CORN: "ZC*1",
            CBOT_WHEAT: "ZW*1",
            CBOT_SOYBEANS: "ZS*1",
            EURONEXT_MILLING_WHEAT: "EBM",
            EURONEXT_CORN: "EMA",
            EURONEXT_RAPESEED: "ECO",
          },
          unavailableInstruments: DEFAULT_GRAIN_MARKET_INSTRUMENT_ORDER.filter(
            (key) => !instrumentsReturned.includes(key),
          ),
        },
      };

      this.cache = {
        fetchedAt: now.getTime(),
        response,
        providerDebug,
      };
    })().finally(() => {
      this.refreshInFlight = null;
    });

    return this.refreshInFlight;
  }

  private async resolveVenueQuotes(
    keys: GrainMarketInstrumentKey[],
    providers: GrainMarketsProvider[],
    ctx: GrainMarketsProviderContext,
    providerDebug: ProviderRuntimeDebug[],
    sourceErrors: GrainMarketsDebug["sourceErrors"],
  ): Promise<GrainMarketQuoteNormalized[]> {
    const unresolved = new Set(keys);
    const out: GrainMarketQuoteNormalized[] = [];

    for (const provider of providers) {
      const requestKeys = [...unresolved].filter((key) => provider.enabled && provider.supports(key));
      if (!requestKeys.length) {
        providerDebug.push({
          providerId: provider.id,
          providerType: provider.providerType,
          enabled: provider.enabled,
          status: provider.enabled ? "partial" : "disabled",
          instrumentsRequested: [],
          instrumentsReturned: [],
          fallbackUsed: !provider.enabled,
          lastAttemptAt: ctx.now.toISOString(),
        });
        continue;
      }

      try {
        const result = await provider.getQuotes(requestKeys, ctx);
        const resolved = result.quotes.filter((quote) => quote.valueCurrent != null || quote.status !== "OFFLINE");
        out.push(...resolved);

        for (const quote of resolved) {
          unresolved.delete(quote.key);
        }

        providerDebug.push({
          providerId: provider.id,
          providerType: provider.providerType,
          enabled: provider.enabled,
          status: result.partial ? "partial" : "ok",
          instrumentsRequested: requestKeys,
          instrumentsReturned: resolved.map((quote) => quote.key),
          fallbackUsed: resolved.some((quote) => quote.status === "FALLBACK" || quote.status === "INDICATIVE"),
          lastSuccessAt: ctx.now.toISOString(),
          lastAttemptAt: ctx.now.toISOString(),
        });

        if (result.errors?.length) {
          for (const err of result.errors) {
            sourceErrors?.push({ providerId: provider.id, instrumentKey: err.instrumentKey, message: err.message });
          }
        }
      } catch (error: any) {
        const message = error?.message || "provider_failed";
        providerDebug.push({
          providerId: provider.id,
          providerType: provider.providerType,
          enabled: provider.enabled,
          status: "error",
          instrumentsRequested: requestKeys,
          instrumentsReturned: [],
          fallbackUsed: true,
          error: message,
          lastAttemptAt: ctx.now.toISOString(),
        });
        for (const key of requestKeys) {
          sourceErrors?.push({ providerId: provider.id, instrumentKey: key, message });
        }
      }

      if (!unresolved.size) break;
    }

    if (unresolved.size) {
      const fallback = await this.mockProvider.getQuotes([...unresolved], ctx);
      out.push(...fallback.quotes);
      providerDebug.push({
        providerId: this.mockProvider.id,
        providerType: this.mockProvider.providerType,
        enabled: true,
        status: "partial",
        instrumentsRequested: [...unresolved],
        instrumentsReturned: fallback.quotes.map((quote) => quote.key),
        fallbackUsed: true,
        lastSuccessAt: ctx.now.toISOString(),
        lastAttemptAt: ctx.now.toISOString(),
      });
      unresolved.clear();
    }

    return out.sort((a, b) => DEFAULT_GRAIN_MARKET_INSTRUMENT_ORDER.indexOf(a.key) - DEFAULT_GRAIN_MARKET_INSTRUMENT_ORDER.indexOf(b.key));
  }

  private offlineFallbackResponse(reason: string): GrainMarketsResponse {
    const now = new Date().toISOString();
    const widgets = { cbot: [], euronext: [], comparisons: [] } as GrainMarketsWidgetsPayload;
    return {
      widgets,
      meta: {
        generatedAt: now,
        partialFailure: true,
        timeframe: GRAIN_MARKETS_TIMEFRAME_DEFAULT,
        instrumentsRequested: DEFAULT_GRAIN_MARKET_INSTRUMENT_ORDER,
        instrumentsReturned: [],
      },
      debug: {
        providers: [
          {
            providerId: "service",
            providerType: "service",
            enabled: true,
            status: "error",
            error: reason,
            fallbackUsed: true,
            lastAttemptAt: now,
          },
        ],
      },
    };
  }
}
