import {
  ENABLE_USDA_GTR_LOGISTICS_WIDGET,
  USDA_GTR_BASE_URL,
  USDA_GTR_CACHE_TTL_MS,
  USDA_GTR_DATASET_URLS,
  USDA_GTR_MAX_SIGNALS,
  USDA_GTR_TIMEOUT_MS,
} from "../config";
import type {
  GrainWidgetPoint,
  GrainWidgetUsdaGtrLogisticsItem,
  GrainWidgetUsdaGtrLogisticsSnapshot,
} from "../types";
import type { GrainWidgetsProvider, GrainWidgetsProviderContext } from "./types";
import { MockGrainWidgetsProvider } from "./mockGrainWidgetsProvider";
import { fetchTextWithTimeout, parseNumber } from "./utils";

type ParsedDataset = {
  metric: GrainWidgetUsdaGtrLogisticsItem["metric"];
  label: string;
  series: GrainWidgetPoint[];
  rowsParsed: number;
  sourceUrlUsed: string;
};

type CacheEntry = {
  fetchedAt: number;
  widget: GrainWidgetUsdaGtrLogisticsSnapshot;
};

let cacheEntry: CacheEntry | null = null;

function splitCsvRow(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      out.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  out.push(current.trim());
  return out;
}

function normalizeTs(raw: string): string | undefined {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return undefined;
  const parsed = Date.parse(trimmed);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  const asMonthYear = Date.parse(`${trimmed}-01`);
  if (Number.isFinite(asMonthYear)) return new Date(asMonthYear).toISOString();
  return undefined;
}

function classifyMetric(args: { url: string; header: string }): GrainWidgetUsdaGtrLogisticsItem["metric"] {
  const text = `${args.url} ${args.header}`.toLowerCase();
  if (text.includes("barge")) return "BARGE";
  if (text.includes("fuel") || text.includes("surcharge")) return "FUEL";
  if (text.includes("ocean") || text.includes("freight")) return "OCEAN";
  if (text.includes("rail") || text.includes("tariff")) return "RAIL";
  if (text.includes("transit")) return "TRANSIT";
  return "OTHER";
}

function deriveCadence(points: GrainWidgetPoint[]): "daily" | "weekly" | "monthly" | "unknown" {
  if (points.length < 3) return "unknown";
  const times = points
    .map((point) => Date.parse(point.ts))
    .filter((ts) => Number.isFinite(ts))
    .sort((a, b) => a - b);
  if (times.length < 3) return "unknown";
  const diffs: number[] = [];
  for (let i = 1; i < times.length; i += 1) {
    const diffDays = Math.round((times[i] - times[i - 1]) / 86_400_000);
    if (diffDays > 0) diffs.push(diffDays);
  }
  if (!diffs.length) return "unknown";
  const sorted = [...diffs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (median <= 2) return "daily";
  if (median <= 10) return "weekly";
  if (median <= 40) return "monthly";
  return "unknown";
}

function inferUnit(metric: GrainWidgetUsdaGtrLogisticsItem["metric"], header: string): string {
  const text = header.toLowerCase();
  if (text.includes("percent") || text.includes("%")) return "%";
  if (text.includes("dollar") || text.includes("usd") || text.includes("$") || metric === "OCEAN") return "USD";
  if (text.includes("index") || metric === "BARGE") return "index";
  if (metric === "FUEL") return "index";
  return "rate";
}

function parseDataset(csv: string, sourceUrlUsed: string, seriesPoints: number): ParsedDataset | undefined {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return undefined;

  const headers = splitCsvRow(lines[0]).map((value) => value.replace(/^"|"$/g, ""));
  const dateIdx = headers.findIndex((header) => {
    const key = header.toLowerCase();
    return key.includes("date") || key.includes("week") || key.includes("month") || key.includes("period");
  });
  if (dateIdx < 0) return undefined;

  const numericCandidates = headers
    .map((header, idx) => ({ header, idx }))
    .filter(({ idx, header }) => idx !== dateIdx && /(rate|index|tariff|fuel|surcharge|freight|cost|price)/i.test(header));
  if (!numericCandidates.length) return undefined;

  const preferred = numericCandidates[0];
  const points: GrainWidgetPoint[] = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsvRow(line);
    const ts = normalizeTs(cols[dateIdx] || "");
    const value = parseNumber(cols[preferred.idx]);
    if (!ts || value == null) continue;
    points.push({ ts, value: Number(value.toFixed(4)) });
  }

  if (points.length < 2) return undefined;

  const metric = classifyMetric({
    url: sourceUrlUsed,
    header: preferred.header,
  });

  const sorted = points.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts)).slice(-Math.max(6, seriesPoints));
  return {
    metric,
    label: preferred.header.replace(/\s+/g, " ").trim() || metric,
    series: sorted,
    rowsParsed: points.length,
    sourceUrlUsed,
  };
}

function mapItem(parsed: ParsedDataset): GrainWidgetUsdaGtrLogisticsItem | undefined {
  const series = parsed.series;
  const latest = series[series.length - 1];
  const prev = series[series.length - 2];
  if (!latest) return undefined;
  const changeAbs = prev ? Number((latest.value - prev.value).toFixed(4)) : undefined;
  const changePct = prev && prev.value !== 0
    ? Number((((latest.value - prev.value) / prev.value) * 100).toFixed(2))
    : undefined;

  return {
    metric: parsed.metric,
    label: parsed.label,
    current: latest.value,
    unit: inferUnit(parsed.metric, parsed.label),
    changeAbs,
    changePct,
    series,
    confidence: series.length >= 6 ? "HIGH" : "MED",
  };
}

export class UsdaGtrLogisticsProvider implements GrainWidgetsProvider {
  id = "usda-gtr-logistics";
  kind = "USDA_GTR_LOGISTICS_SNAPSHOT" as const;
  enabled = ENABLE_USDA_GTR_LOGISTICS_WIDGET;
  private readonly fallback = new MockGrainWidgetsProvider({ kind: "USDA_GTR_LOGISTICS_SNAPSHOT" });

  async getWidget(ctx: GrainWidgetsProviderContext): Promise<GrainWidgetUsdaGtrLogisticsSnapshot> {
    const now = Date.now();
    if (cacheEntry && now - cacheEntry.fetchedAt <= USDA_GTR_CACHE_TTL_MS) {
      return {
        ...cacheEntry.widget,
        updatedAt: ctx.now.toISOString(),
        notes: [...(cacheEntry.widget.notes || []), "cache_hit"],
      };
    }

    const warnings: string[] = [];
    const parsedSignals: ParsedDataset[] = [];
    let sourceUrlUsed: string | undefined;
    let rowsParsed = 0;

    for (const url of USDA_GTR_DATASET_URLS) {
      try {
        const csv = await fetchTextWithTimeout(url, USDA_GTR_TIMEOUT_MS, {
          accept: "text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*",
        });
        const parsed = parseDataset(csv, url, ctx.seriesPoints);
        if (!parsed) {
          warnings.push(`parse_empty:${url}`);
          continue;
        }
        if (parsedSignals.some((entry) => entry.metric === parsed.metric)) {
          warnings.push(`duplicate_metric:${parsed.metric}`);
          continue;
        }
        parsedSignals.push(parsed);
        rowsParsed += parsed.rowsParsed;
        sourceUrlUsed = sourceUrlUsed || parsed.sourceUrlUsed;
        if (parsedSignals.length >= Math.max(1, USDA_GTR_MAX_SIGNALS)) break;
      } catch (error: any) {
        warnings.push(`${url}:${String(error?.message || "fetch_failed").slice(0, 90)}`);
      }
    }

    const items = parsedSignals
      .map(mapItem)
      .filter((item): item is GrainWidgetUsdaGtrLogisticsItem => Boolean(item))
      .slice(0, Math.max(1, USDA_GTR_MAX_SIGNALS));

    if (!items.length) {
      throw new Error(warnings[0] || "usda_gtr_no_signals");
    }

    const expectedCount = Math.min(Math.max(2, USDA_GTR_MAX_SIGNALS), 4);
    const mappedCount = items.length;
    const coverage = `${mappedCount}/${expectedCount}`;
    const cadence = deriveCadence(items.flatMap((item) => item.series || []).slice(-Math.max(6, ctx.seriesPoints)));
    const status = mappedCount >= 2 ? "REFRESH" : "INDICATIVE";

    const widget: GrainWidgetUsdaGtrLogisticsSnapshot = {
      id: "grain-usda-gtr-logistics-snapshot",
      kind: "USDA_GTR_LOGISTICS_SNAPSHOT",
      title: "US Logistics (USDA GTR)",
      subtitle: "Barge / Rail / Fuel freight proxies",
      status,
      sourceName: "USDA AMS (GTR)",
      sourceAttribution: "Data: USDA Grain Transportation Report",
      sourceUrl: sourceUrlUsed || USDA_GTR_BASE_URL,
      updatedAt: ctx.now.toISOString(),
      timeframe: ctx.timeframe,
      items,
      summary: {
        expectedCount,
        mappedCount,
        coverage,
        cadence,
      },
      notes: ["Open USDA GTR datasets", "weekly cadence"],
      debug: {
        sourceUrlUsed: sourceUrlUsed || USDA_GTR_BASE_URL,
        rowsParsed,
        parseWarnings: warnings.length ? warnings : undefined,
      },
    };

    cacheEntry = {
      fetchedAt: now,
      widget,
    };

    return widget;
  }

  mockFallback(reason: string, ctx: GrainWidgetsProviderContext): GrainWidgetUsdaGtrLogisticsSnapshot {
    return this.fallback.mockFallback(reason, ctx) as GrainWidgetUsdaGtrLogisticsSnapshot;
  }
}
