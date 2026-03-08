import {
  ENABLE_LOGISTICS_INDICATORS,
  ENABLE_LOGISTICS_MOCK_FALLBACK,
  LOGISTICS_INDICATORS_CACHE_TTL_MS,
  LOGISTICS_INDICATORS_REFRESH_MS,
} from "./config";
import { BdiProvider } from "./providers/bdiProvider";
import { LogisticsPressureProvider } from "./providers/logisticsPressureProvider";
import { UsdaRailProvider } from "./providers/usdaRailProvider";
import type {
  LogisticsIndicatorProvider,
  LogisticsIndicatorStatus,
  LogisticsIndicatorsResponse,
  LogisticsProviderDebug,
  LogisticsIndicatorWidgetData,
  LogisticsPressureContext,
} from "./types";

type CacheEntry = {
  fetchedAt: number;
  lastSuccessAt?: string;
  lastError?: string;
  data: LogisticsIndicatorWidgetData;
};
const LIST_REFRESH_BUDGET_MS = 2500;

export class LogisticsIndicatorsService {
  private readonly providers: LogisticsIndicatorProvider[] = [
    new BdiProvider(),
    new UsdaRailProvider(),
    new LogisticsPressureProvider(),
  ];

  private readonly cache = new Map<string, CacheEntry>();
  private refreshInFlight: Promise<void> | null = null;
  private timer: NodeJS.Timeout | null = null;

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.refreshAll(true);
    }, LOGISTICS_INDICATORS_REFRESH_MS);
  }

  async list(): Promise<LogisticsIndicatorsResponse> {
    if (!ENABLE_LOGISTICS_INDICATORS) {
      return {
        widgets: [],
        meta: {
          generatedAt: new Date().toISOString(),
        },
      };
    }

    let refreshTimedOut = false;
    await Promise.race([
      this.refreshAll(false),
      new Promise<void>((resolve) => setTimeout(() => {
        refreshTimedOut = true;
        resolve();
      }, LIST_REFRESH_BUDGET_MS)),
    ]);
    const now = Date.now();
    const widgets: LogisticsIndicatorWidgetData[] = this.providers
      .filter((provider) => provider.enabled)
      .map((provider) => {
        const cached = this.cache.get(provider.id);
        if (!cached) {
          return provider.mockFallback("No successful snapshot yet.");
        }
        const age = now - cached.fetchedAt;
        if (age > LOGISTICS_INDICATORS_CACHE_TTL_MS && cached.data.status === "LIVE") {
          return {
            ...cached.data,
            status: "DELAYED",
            fallbackReason: "Data is older than cache TTL.",
          };
        }
        return cached.data;
      });

    const partialFailure = refreshTimedOut || widgets.some((widget) => widget.status === "FALLBACK" || widget.status === "OFFLINE");
    const cacheAgeSec = widgets.length
      ? Math.floor(
          (now - Math.min(...widgets.map((widget) => this.cache.get(widget.type)?.fetchedAt ?? now))) / 1000,
        )
      : undefined;

    return {
      widgets,
      meta: {
        generatedAt: new Date().toISOString(),
        cacheAgeSec,
        partialFailure,
      },
    };
  }

  debugSummary(): { enabled: boolean; providers: LogisticsProviderDebug[]; refreshMs: number; cacheTtlMs: number } {
    const now = Date.now();
    return {
      enabled: ENABLE_LOGISTICS_INDICATORS,
      refreshMs: LOGISTICS_INDICATORS_REFRESH_MS,
      cacheTtlMs: LOGISTICS_INDICATORS_CACHE_TTL_MS,
      providers: this.providers.map((provider) => {
        const cached = this.cache.get(provider.id);
        const status: LogisticsIndicatorStatus = cached?.data.status ?? "OFFLINE";
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
      const nonPressure = this.providers.filter((provider) => !(provider instanceof LogisticsPressureProvider));
      const pressure = this.providers.find((provider) => provider instanceof LogisticsPressureProvider);

      await Promise.all(nonPressure.map((provider) => this.refreshProvider(provider, now, force)));

      if (pressure) {
        const context = this.resolvePressureContext();
        await this.refreshProvider(pressure, now, force, context);
      }
    })().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private resolvePressureContext(): LogisticsPressureContext {
    const bdi = this.cache.get("bdi")?.data;
    const rail = this.cache.get("rail_tariff")?.data;

    const toDirection = (change?: number): "up" | "down" | "flat" | "unknown" => {
      if (change == null) return "unknown";
      if (Math.abs(change) < 0.01) return "flat";
      return change > 0 ? "up" : "down";
    };

    return {
      bdiDirection: toDirection(bdi?.valueChange),
      bdiChangePct: bdi?.valueChangePct,
      railDirection: toDirection(rail?.valueChange),
      railChangePct: rail?.valueChangePct,
    };
  }

  private async refreshProvider(
    provider: LogisticsIndicatorProvider,
    now: number,
    force: boolean,
    context?: LogisticsPressureContext,
  ): Promise<void> {
    if (!provider.enabled) return;
    const existing = this.cache.get(provider.id);
    if (!force && existing && now - existing.fetchedAt < LOGISTICS_INDICATORS_REFRESH_MS) return;
    try {
      const data = await provider.getWidgetData(context);
      this.cache.set(provider.id, {
        fetchedAt: now,
        lastSuccessAt: new Date().toISOString(),
        data: {
          ...data,
          status: data.status === "OFFLINE" ? "REFRESH" : data.status,
        },
      });
    } catch (error: any) {
      const reason = error?.message || "fetch_failed";
      if (existing) {
        this.cache.set(provider.id, {
          ...existing,
          data: {
            ...existing.data,
            status: existing.data.status === "LIVE" ? "DELAYED" : existing.data.status,
            fallbackReason: reason,
          },
          lastError: reason,
        });
        return;
      }
      if (ENABLE_LOGISTICS_MOCK_FALLBACK) {
        this.cache.set(provider.id, {
          fetchedAt: now,
          data: provider.mockFallback(reason),
          lastError: reason,
        });
        return;
      }
      this.cache.set(provider.id, {
        fetchedAt: now,
        data: {
          ...provider.mockFallback(reason),
          status: "OFFLINE",
          series: [],
          valueCurrent: undefined,
        },
        lastError: reason,
      });
    }
  }
}
