import {
  BDI_SOURCE_URL,
  LOGISTICS_INDICATORS_CACHE_TTL_MS,
  LOGISTICS_INDICATORS_REFRESH_MS,
  MONITOR_FETCH_TIMEOUT_MS,
  USDA_GTR_RAIL_TARIFF_URL,
} from "./config";
import { getMonitorNews } from "./newsService";
import type { LogisticsIndicatorData, LogisticsIndicatorPoint } from "./types";

interface LogisticsIndicatorProvider {
  load(): Promise<LogisticsIndicatorData>;
}

type NumericSeriesPoint = {
  date: string;
  value: number;
};

function parseCsvSeries(raw: string): NumericSeriesPoint[] {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((value) => value.trim().replace(/^"|"$/g, "").toLowerCase());

  const dateIndex = headers.findIndex((value) => ["date", "week", "month", "period"].some((token) => value.includes(token)));
  const valueIndex = headers.findIndex((value) =>
    ["value", "index", "rate", "tariff", "bdi"].some((token) => value.includes(token)),
  );

  if (dateIndex < 0 || valueIndex < 0) return [];

  const series: NumericSeriesPoint[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(",").map((value) => value.trim().replace(/^"|"$/g, ""));
    const date = cols[dateIndex];
    const valueRaw = cols[valueIndex];
    const value = Number.parseFloat(valueRaw);
    if (!date || !Number.isFinite(value)) continue;
    series.push({ date, value });
  }

  return series;
}

function toMiniSeries(points: NumericSeriesPoint[], size = 8): LogisticsIndicatorPoint[] {
  const sliced = points.slice(-size);
  return sliced.map((point) => ({
    label: point.date.slice(5, 10),
    value: Number(point.value.toFixed(2)),
  }));
}

function calcChange(points: NumericSeriesPoint[]) {
  const latest = points[points.length - 1];
  const previous = points[points.length - 2];
  if (!latest) return { value: undefined, change: undefined, changePercent: undefined };
  if (!previous || previous.value === 0) {
    return { value: latest.value, change: undefined, changePercent: undefined };
  }
  const change = latest.value - previous.value;
  return {
    value: latest.value,
    change: Number(change.toFixed(2)),
    changePercent: Number(((change / previous.value) * 100).toFixed(2)),
  };
}

async function fetchWithTimeout(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MONITOR_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "CroptoMonitor/1.1 (+https://cropto.abvx.xyz)",
        accept: "text/csv,text/plain,application/json,*/*",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

class BalticDryIndexProvider implements LogisticsIndicatorProvider {
  async load(): Promise<LogisticsIndicatorData> {
    const csv = await fetchWithTimeout(BDI_SOURCE_URL);
    const series = parseCsvSeries(csv);
    if (!series.length) throw new Error("bdi_series_empty");

    const { value, change, changePercent } = calcChange(series);
    const latest = series[series.length - 1];
    return {
      id: "bdi",
      title: "Baltic Dry Index (BDI)",
      subtitle: "Dry bulk shipping benchmark",
      unit: "index",
      value: value != null ? Number(value.toFixed(2)) : undefined,
      change,
      changePercent,
      status: "live",
      sourceName: "FRED / Baltic Exchange",
      sourceUrl: "https://fred.stlouisfed.org/series/BDIY",
      asOf: latest?.date,
      updateFrequency: "Daily (market days)",
      series: toMiniSeries(series),
    };
  }
}

class UsdaRailTariffProvider implements LogisticsIndicatorProvider {
  async load(): Promise<LogisticsIndicatorData> {
    const csv = await fetchWithTimeout(USDA_GTR_RAIL_TARIFF_URL);
    const series = parseCsvSeries(csv);
    if (!series.length) throw new Error("usda_rail_series_empty");

    const { value, change, changePercent } = calcChange(series);
    const latest = series[series.length - 1];
    return {
      id: "usda_rail_tariff",
      title: "USDA Rail Tariff Trend",
      subtitle: "GTR rail tariff indicator",
      unit: "index",
      value: value != null ? Number(value.toFixed(2)) : undefined,
      change,
      changePercent,
      status: "live",
      sourceName: "USDA AMS Grain Transportation Report",
      sourceUrl: "https://www.ams.usda.gov/services/transportation-analysis/grain-transportation-report",
      asOf: latest?.date,
      updateFrequency: "Weekly",
      series: toMiniSeries(series),
    };
  }
}

class LogisticsPressureProvider implements LogisticsIndicatorProvider {
  async load(): Promise<LogisticsIndicatorData> {
    const { items } = await getMonitorNews(false);
    const now = Date.now();
    const last24 = items.filter((item) => now - Date.parse(item.published_at) <= 24 * 60 * 60 * 1000);
    const prev24 = items.filter((item) => {
      const delta = now - Date.parse(item.published_at);
      return delta > 24 * 60 * 60 * 1000 && delta <= 48 * 60 * 60 * 1000;
    });

    const lastSignalSet = last24.filter((item) =>
      item.topic_tags.some((tag) => ["logistics", "policy", "weather", "trade"].includes(tag)),
    );
    const prevSignalSet = prev24.filter((item) =>
      item.topic_tags.some((tag) => ["logistics", "policy", "weather", "trade"].includes(tag)),
    );
    const highImpact = lastSignalSet.filter((item) => item.relevance_score >= 10).length;

    const rawScore = 35 + lastSignalSet.length * 2 + highImpact * 4;
    const score = Math.max(0, Math.min(100, rawScore));
    const previousRaw = 35 + prevSignalSet.length * 2 + prevSignalSet.filter((item) => item.relevance_score >= 10).length * 4;
    const previousScore = Math.max(0, Math.min(100, previousRaw));
    const change = Number((score - previousScore).toFixed(2));
    const changePercent = previousScore > 0 ? Number((((score - previousScore) / previousScore) * 100).toFixed(2)) : undefined;

    const series: LogisticsIndicatorPoint[] = [
      { label: "Prev24h", value: previousScore },
      { label: "Now24h", value: score },
    ];

    return {
      id: "logistics_pressure",
      title: "Logistics Pressure",
      subtitle: "Composite from logistics/policy/weather signals",
      unit: "score",
      value: score,
      change,
      changePercent,
      status: "live",
      sourceName: "Cropto Monitor Signal Engine",
      sourceUrl: "/monitor?debug=1",
      asOf: new Date().toISOString(),
      updateFrequency: "Every 15 min",
      series,
      note: "Demo composite based on signal density and impact tags.",
    };
  }
}

type CachedIndicator = {
  data: LogisticsIndicatorData;
  fetchedAt: number;
};

export class LogisticsIndicatorsService {
  private readonly providers: LogisticsIndicatorProvider[] = [
    new BalticDryIndexProvider(),
    new UsdaRailTariffProvider(),
    new LogisticsPressureProvider(),
  ];

  private cache = new Map<LogisticsIndicatorData["id"], CachedIndicator>();
  private refreshTimer: NodeJS.Timeout | null = null;
  private refreshInFlight: Promise<void> | null = null;

  start(): void {
    if (this.refreshTimer) return;
    this.refreshTimer = setInterval(() => {
      void this.refreshAll(true);
    }, LOGISTICS_INDICATORS_REFRESH_MS);
  }

  async listIndicators(): Promise<{ indicators: LogisticsIndicatorData[]; generatedAt: string; refreshMs: number }> {
    await this.refreshAll(false);
    const now = Date.now();
    const indicators = this.providers.map((provider) => {
      const id = this.providerId(provider);
      const cached = this.cache.get(id);
      if (!cached) {
        return this.unavailableById(id, "No successful snapshot yet.");
      }
      const age = now - cached.fetchedAt;
      if (age > LOGISTICS_INDICATORS_CACHE_TTL_MS && cached.data.status === "live") {
        return { ...cached.data, status: "stale" as const };
      }
      return cached.data;
    });

    return {
      indicators,
      generatedAt: new Date().toISOString(),
      refreshMs: LOGISTICS_INDICATORS_REFRESH_MS,
    };
  }

  private providerId(provider: LogisticsIndicatorProvider): LogisticsIndicatorData["id"] {
    if (provider instanceof BalticDryIndexProvider) return "bdi";
    if (provider instanceof UsdaRailTariffProvider) return "usda_rail_tariff";
    return "logistics_pressure";
  }

  private unavailableById(id: LogisticsIndicatorData["id"], note: string): LogisticsIndicatorData {
    if (id === "bdi") {
      return {
        id,
        title: "Baltic Dry Index (BDI)",
        subtitle: "Dry bulk shipping benchmark",
        unit: "index",
        status: "unavailable",
        sourceName: "FRED / Baltic Exchange",
        sourceUrl: "https://fred.stlouisfed.org/series/BDIY",
        updateFrequency: "Daily (market days)",
        series: [],
        note,
      };
    }
    if (id === "usda_rail_tariff") {
      return {
        id,
        title: "USDA Rail Tariff Trend",
        subtitle: "GTR rail tariff indicator",
        unit: "index",
        status: "unavailable",
        sourceName: "USDA AMS Grain Transportation Report",
        sourceUrl: "https://www.ams.usda.gov/services/transportation-analysis/grain-transportation-report",
        updateFrequency: "Weekly",
        series: [],
        note,
      };
    }
    return {
      id,
      title: "Logistics Pressure",
      subtitle: "Composite from logistics/policy/weather signals",
      unit: "score",
      status: "fallback",
      sourceName: "Cropto Monitor Signal Engine",
      sourceUrl: "/monitor?debug=1",
      updateFrequency: "Every 15 min",
      series: [],
      note,
    };
  }

  private async refreshAll(force: boolean): Promise<void> {
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = (async () => {
      const now = Date.now();
      await Promise.all(
        this.providers.map(async (provider) => {
          const id = this.providerId(provider);
          const existing = this.cache.get(id);
          if (!force && existing && now - existing.fetchedAt < LOGISTICS_INDICATORS_REFRESH_MS) return;

          try {
            const data = await provider.load();
            this.cache.set(id, { data: { ...data, status: "live" }, fetchedAt: now });
          } catch (error: any) {
            if (existing) {
              this.cache.set(id, {
                data: {
                  ...existing.data,
                  status: existing.data.status === "live" ? "stale" : existing.data.status,
                  note: `Using last successful snapshot. ${error?.message || "fetch_failed"}`,
                },
                fetchedAt: existing.fetchedAt,
              });
              return;
            }
            this.cache.set(id, {
              data: this.unavailableById(id, `Source unavailable: ${error?.message || "fetch_failed"}`),
              fetchedAt: now,
            });
          }
        }),
      );
    })()
      .finally(() => {
        this.refreshInFlight = null;
      });
    return this.refreshInFlight;
  }
}
