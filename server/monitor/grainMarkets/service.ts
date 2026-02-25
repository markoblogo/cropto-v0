import {
  ENABLE_GRAIN_MARKETS_CORE,
  ENABLE_GRAIN_MARKETS_MOCK_FALLBACK,
  GRAIN_MARKETS_CACHE_TTL_MS,
  GRAIN_MARKETS_REFRESH_MS,
} from "./config";
import { CbotProvider } from "./providers/cbotProvider";
import { EuronextProvider } from "./providers/euronextProvider";
import { rankStatus } from "./providers/utils";
import type {
  GrainComparisonWidget,
  GrainInstrumentWidget,
  GrainMarketsProvider,
  GrainMarketsResponse,
  GrainProviderDebug,
  GrainWidgetStatus,
} from "./types";

type CacheEntry = {
  fetchedAt: number;
  lastSuccessAt?: string;
  lastError?: string;
  data: GrainInstrumentWidget[];
};

function normalizeProxyValue(widget?: GrainInstrumentWidget): number | undefined {
  if (widget?.lastPrice == null) return undefined;
  const unit = widget.unit.toLowerCase();
  if (unit.includes("usd/bu")) {
    return Number((widget.lastPrice * 36.7437).toFixed(2));
  }
  return widget.lastPrice;
}

function makeComparison(args: {
  id: string;
  title: string;
  leftLabel: string;
  rightLabel: string;
  left?: GrainInstrumentWidget;
  right?: GrainInstrumentWidget;
  note: string;
}): GrainComparisonWidget {
  const leftValue = normalizeProxyValue(args.left);
  const rightValue = normalizeProxyValue(args.right);
  const spread = leftValue != null && rightValue != null ? Number((leftValue - rightValue).toFixed(2)) : undefined;
  const spreadPct =
    spread != null && rightValue && rightValue !== 0 ? Number(((spread / rightValue) * 100).toFixed(2)) : undefined;
  const status = rankStatus([args.left?.status || "OFFLINE", args.right?.status || "OFFLINE"]);

  return {
    id: args.id,
    title: args.title,
    status,
    sourceName: `${args.left?.sourceName || "n/a"} + ${args.right?.sourceName || "n/a"}`,
    sourceAttribution: "Cross-market comparison for demo orientation (not contract parity)",
    leftLabel: args.leftLabel,
    rightLabel: args.rightLabel,
    leftValue,
    rightValue,
    spread,
    spreadPct,
    note: args.note,
  };
}

export class GrainMarketsService {
  private readonly providers: GrainMarketsProvider[] = [new CbotProvider(), new EuronextProvider()];
  private readonly cache = new Map<string, CacheEntry>();
  private timer: NodeJS.Timeout | null = null;
  private refreshInFlight: Promise<void> | null = null;

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.refreshAll(true);
    }, GRAIN_MARKETS_REFRESH_MS);
  }

  async list(): Promise<GrainMarketsResponse> {
    if (!ENABLE_GRAIN_MARKETS_CORE) {
      return {
        widgets: [],
        comparisons: [],
        meta: { generatedAt: new Date().toISOString() },
      };
    }

    await this.refreshAll(false);
    const now = Date.now();

    const widgets = this.providers
      .filter((provider) => provider.enabled)
      .flatMap((provider) => {
        const cached = this.cache.get(provider.id);
        if (!cached) {
          return provider.mockFallback("no_snapshot");
        }
        const age = now - cached.fetchedAt;
        if (age > GRAIN_MARKETS_CACHE_TTL_MS) {
          return cached.data.map((item) => ({
            ...item,
            status: item.status === "LIVE" ? ("DELAYED" as GrainWidgetStatus) : item.status,
            fallbackReason: item.fallbackReason || "cache_stale",
          }));
        }
        return cached.data;
      });

    const byId = new Map(widgets.map((widget) => [widget.id, widget]));
    const comparisons: GrainComparisonWidget[] = [
      makeComparison({
        id: "cmp-wheat",
        title: "Wheat: CBOT vs Euronext",
        leftLabel: "CBOT Wheat (USD/bu)",
        rightLabel: "Euronext Milling Wheat (EUR/t)",
        left: byId.get("cbot-wheat"),
        right: byId.get("euronext-wheat"),
        note: "Indicative cross-market view. Unit normalization uses USD/bu to EUR/t proxy.",
      }),
      makeComparison({
        id: "cmp-corn",
        title: "Corn: CBOT vs Euronext",
        leftLabel: "CBOT Corn (USD/bu)",
        rightLabel: "Euronext Corn (EUR/t)",
        left: byId.get("cbot-corn"),
        right: byId.get("euronext-corn"),
        note: "Indicative cross-market view. Monitor relative corridor pressure, not exact parity.",
      }),
      makeComparison({
        id: "cmp-soy-rapeseed",
        title: "Soy vs Rapeseed Proxy",
        leftLabel: "CBOT Soybeans (USD/bu)",
        rightLabel: "Euronext Rapeseed (EUR/t)",
        left: byId.get("cbot-soy"),
        right: byId.get("euronext-rapeseed"),
        note: "Proxy comparison across oilseed complexes. Not identical contract exposure.",
      }),
    ];

    const partialFailure = widgets.some((widget) => ["FALLBACK", "OFFLINE"].includes(widget.status));
    const cacheAgeSec = this.cache.size ? Math.floor((now - Math.min(...[...this.cache.values()].map((entry) => entry.fetchedAt))) / 1000) : undefined;

    return {
      widgets,
      comparisons,
      meta: {
        generatedAt: new Date().toISOString(),
        cacheAgeSec,
        partialFailure,
      },
    };
  }

  debugSummary(): { enabled: boolean; refreshMs: number; cacheTtlMs: number; providers: GrainProviderDebug[] } {
    const now = Date.now();
    return {
      enabled: ENABLE_GRAIN_MARKETS_CORE,
      refreshMs: GRAIN_MARKETS_REFRESH_MS,
      cacheTtlMs: GRAIN_MARKETS_CACHE_TTL_MS,
      providers: this.providers.map((provider) => {
        const cached = this.cache.get(provider.id);
        const status: GrainWidgetStatus =
          cached?.data?.find((item) => item.status === "LIVE")?.status ||
          cached?.data?.[0]?.status ||
          "OFFLINE";
        return {
          id: provider.id,
          enabled: provider.enabled,
          status,
          cacheAgeSec: cached ? Math.floor((now - cached.fetchedAt) / 1000) : undefined,
          lastSuccessAt: cached?.lastSuccessAt,
          fallbackMode: status === "FALLBACK" || status === "OFFLINE",
          lastError: cached?.lastError,
        };
      }),
    };
  }

  private async refreshAll(force: boolean): Promise<void> {
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = (async () => {
      const now = Date.now();
      await Promise.all(this.providers.map((provider) => this.refreshProvider(provider, now, force)));
    })().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private async refreshProvider(provider: GrainMarketsProvider, now: number, force: boolean): Promise<void> {
    if (!provider.enabled) return;
    const existing = this.cache.get(provider.id);
    if (!force && existing && now - existing.fetchedAt < GRAIN_MARKETS_REFRESH_MS) return;

    try {
      const widgets = await provider.getWidgets();
      this.cache.set(provider.id, {
        fetchedAt: now,
        lastSuccessAt: new Date().toISOString(),
        data: widgets,
      });
    } catch (error: any) {
      const reason = error?.message || "grain_provider_fetch_failed";
      if (existing) {
        this.cache.set(provider.id, {
          ...existing,
          data: existing.data.map((item) => ({
            ...item,
            status: item.status === "LIVE" ? "DELAYED" : item.status,
            fallbackReason: reason,
          })),
          lastError: reason,
        });
        return;
      }

      if (ENABLE_GRAIN_MARKETS_MOCK_FALLBACK) {
        this.cache.set(provider.id, {
          fetchedAt: now,
          data: provider.mockFallback(reason),
          lastError: reason,
        });
        return;
      }

      this.cache.set(provider.id, {
        fetchedAt: now,
        data: provider.mockFallback(reason).map((item) => ({ ...item, status: "OFFLINE", series: [], lastPrice: undefined })),
        lastError: reason,
      });
    }
  }
}
