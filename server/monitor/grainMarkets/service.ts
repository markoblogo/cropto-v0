import {
  ENABLE_GRAIN_MARKETS_CORE,
  GRAIN_MARKETS_CACHE_TTL_MS,
  GRAIN_MARKETS_REFRESH_MS,
  GRAIN_MARKETS_SERIES_POINTS,
  GRAIN_MARKETS_TIMEFRAME_DEFAULT,
} from "./config";
import { buildComparisonWidgets } from "./comparison";
import { quoteToWidget } from "./mapping";
import { normalizeGrainPriceToUsdTon } from "./normalization";
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
import { latestFxSnapshot } from "../../ingestion/storage/fxRepository";
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

function cropForBushel(key: GrainMarketInstrumentKey): "corn" | "wheat" | "soybeans" | undefined {
  if (key === "CBOT_CORN") return "corn";
  if (key === "CBOT_WHEAT") return "wheat";
  if (key === "CBOT_SOYBEANS") return "soybeans";
  return undefined;
}

function nativeUnitTypeForQuote(quote: GrainMarketQuoteNormalized) {
  const unit = (quote.unit || "").toLowerCase();
  const currency = (quote.currency || "").toLowerCase();
  if (unit.includes("c/bu") || unit.includes("cent")) return "CENTS_PER_BUSHEL" as const;
  if (unit.includes("usd/bu")) return "USD_PER_BUSHEL" as const;
  if (unit.includes("eur/t") || (currency === "eur" && unit.includes("/t"))) return "EUR_PER_TON" as const;
  if (unit.includes("usd/t") || (currency === "usd" && unit.includes("/t"))) return "USD_PER_TON" as const;
  return "UNKNOWN" as const;
}
const LIST_REFRESH_BUDGET_MS = 2500;

function applyPriceNormalization(
  quote: GrainMarketQuoteNormalized,
  eurUsd: number | null,
): GrainMarketQuoteNormalized {
  const normalization = normalizeGrainPriceToUsdTon({
    quote: {
      valueCurrent: quote.valueCurrent,
      valueChange: quote.valueChange,
      valueChangePct: quote.valueChangePct,
      currency: quote.currency,
      unit: quote.unit,
      nativeUnitType: nativeUnitTypeForQuote(quote),
      crop: cropForBushel(quote.key),
    },
    fx: { eurUsd: eurUsd ?? undefined },
  });

  const normalized = normalization.normalized;
  const useNormalized = normalization.status === "OK" && normalized?.valueCurrent != null;

  return {
    ...quote,
    nativeValueCurrent: normalization.native.valueCurrent,
    nativeValueChange: normalization.native.valueChange,
    nativeValueChangePct: normalization.native.valueChangePct,
    nativeCurrency: normalization.native.currency,
    nativeUnit: normalization.native.unit,
    normalizedValueCurrent: normalized?.valueCurrent,
    normalizedValueChange: normalized?.valueChange,
    normalizedValueChangePct: normalized?.valueChangePct,
    normalizedCurrency: normalized?.currency,
    normalizedUnit: normalized?.unit,
    normalizationStatus: normalization.status,
    normalizationMethod: normalization.meta.method,
    normalizationMeta: {
      fxRateUsed: normalization.meta.fxRateUsed,
      bushelsPerTon: normalization.meta.bushelsPerTon,
      cropFactor: normalization.meta.cropFactor,
      notes: normalization.meta.notes,
    },
    valueCurrent: useNormalized ? normalized?.valueCurrent : normalization.native.valueCurrent,
    valueChange: useNormalized ? normalized?.valueChange : normalization.native.valueChange,
    valueChangePct: useNormalized ? normalized?.valueChangePct : normalization.native.valueChangePct,
    currency: useNormalized ? "USD" : normalization.native.currency || quote.currency,
    unit: useNormalized ? "t" : normalization.native.unit,
  };
}

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

    let refreshTimedOut = false;
    await Promise.race([
      this.refresh(false),
      new Promise<void>((resolve) => setTimeout(() => {
        refreshTimedOut = true;
        resolve();
      }, LIST_REFRESH_BUDGET_MS)),
    ]);
    if (!this.cache) {
      await Promise.race([
        this.refresh(true),
        new Promise<void>((resolve) => setTimeout(() => {
          refreshTimedOut = true;
          resolve();
        }, LIST_REFRESH_BUDGET_MS)),
      ]);
    }

    if (!this.cache) {
      return this.offlineFallbackResponse(refreshTimedOut ? "refresh_timeout" : "cache_unavailable");
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
    if (refreshTimedOut) response.meta.partialFailure = true;

    return response;
  }

  debugSummary(): {
    enabled: boolean;
    refreshMs: number;
    cacheTtlMs: number;
    providers: GrainMarketsProviderDebug[];
    fxRateUsed?: number;
    normalization?: GrainMarketsDebug["normalization"];
  } {
    return {
      enabled: ENABLE_GRAIN_MARKETS_CORE,
      refreshMs: GRAIN_MARKETS_REFRESH_MS,
      cacheTtlMs: GRAIN_MARKETS_CACHE_TTL_MS,
      providers: this.cache?.providerDebug || [],
      fxRateUsed: this.cache?.response.meta.fxRateUsed,
      normalization: this.cache?.response.debug?.normalization,
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

      const eurUsd = await this.loadEurUsd();
      const cbotNormalized = cbotQuotes.map((quote) => applyPriceNormalization(quote, eurUsd));
      const euronextNormalized = euronextQuotes.map((quote) => applyPriceNormalization(quote, eurUsd));

      const allQuotes = [...cbotNormalized, ...euronextNormalized];
      const cbotWidgets = cbotNormalized.map((quote) => quoteToWidget(quote));
      const euronextWidgets = euronextNormalized.map((quote) => quoteToWidget(quote));
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
        fxRateUsed: eurUsd ?? undefined,
        normalizationCoverage: {
          ok: allQuotes.filter((quote) => quote.normalizationStatus === "OK").length,
          partial: allQuotes.filter((quote) => quote.normalizationStatus === "PARTIAL").length,
          fxMissing: allQuotes.filter((quote) => quote.normalizationStatus === "FX_MISSING").length,
          unavailable: allQuotes.filter((quote) => quote.normalizationStatus === "UNAVAILABLE" || !quote.normalizationStatus).length,
        },
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
          normalization: {
            defaults: {
              price: "USD/t",
              temperature: "C",
            },
            fxRateUsed: eurUsd ?? undefined,
            perInstrument: Object.fromEntries(
              allQuotes.map((quote) => [
                quote.key,
                {
                  normalizationStatus: quote.normalizationStatus || "UNAVAILABLE",
                  normalizationMethod: quote.normalizationMethod,
                  fxRateUsed: quote.normalizationMeta?.fxRateUsed,
                },
              ]),
            ),
            normalizedCount: allQuotes.filter((quote) => quote.normalizationStatus === "OK").length,
            nativeFallbackCount: allQuotes.filter(
              (quote) => quote.normalizationStatus === "FX_MISSING" || quote.normalizationStatus === "UNAVAILABLE",
            ).length,
          },
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

  private async loadEurUsd(): Promise<number | null> {
    try {
      const fx = await latestFxSnapshot();
      const eurUsd = fx?.usdPerUnit?.EUR;
      return typeof eurUsd === "number" && Number.isFinite(eurUsd) && eurUsd > 0 ? eurUsd : null;
    } catch {
      return null;
    }
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
