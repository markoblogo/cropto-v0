import {
  ENABLE_NASDAQ_CHRIS,
  ENABLE_NASDAQ_DATALINK_PROVIDER,
  NASDAQ_API_KEY,
  NASDAQ_BASE_URL,
  NASDAQ_CACHE_TTL_MS,
  NASDAQ_CHRIS_DATASETS,
  NASDAQ_DATASETS,
  NASDAQ_SERIES_COLUMN_MAP,
  NASDAQ_TIMEOUT_MS,
  NASDAQ_UNIT_MAP,
} from "../config";
import type {
  AlphaVantageUnitConfidence,
  GrainWidgetNasdaqDataLinkItem,
  GrainWidgetNasdaqDataLinkSnapshot,
  GrainWidgetPoint,
} from "../types";
import type { GrainWidgetsProvider, GrainWidgetsProviderContext } from "./types";
import { MockGrainWidgetsProvider } from "./mockGrainWidgetsProvider";
import { parseNumber } from "./utils";

type UnitMapEntry = {
  unit?: string;
  unitConfidence?: AlphaVantageUnitConfidence;
  allowNormalization?: boolean;
};

type DatasetStatus = NonNullable<NonNullable<GrainWidgetNasdaqDataLinkSnapshot["summary"]>["datasetStatuses"]>[number];

type DatasetSnapshot = {
  fetchedAt: number;
  item?: GrainWidgetNasdaqDataLinkItem;
  status: DatasetStatus;
};

const datasetCache = new Map<string, DatasetSnapshot>();

function toBase(url: string): string {
  return url.replace(/\/+$/, "");
}

function parseUnitMap(): Record<string, UnitMapEntry> {
  if (!NASDAQ_UNIT_MAP) return {};
  try {
    const parsed = JSON.parse(NASDAQ_UNIT_MAP);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function parseColumnMap(): Record<string, string | number> {
  if (!NASDAQ_SERIES_COLUMN_MAP) return {};
  try {
    const parsed = JSON.parse(NASDAQ_SERIES_COLUMN_MAP);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has("api_key")) parsed.searchParams.set("api_key", "REDACTED");
    return parsed.toString();
  } catch {
    return url.replace(/api_key=[^&]+/gi, "api_key=REDACTED");
  }
}

function classifyErrorKind(error: string): DatasetStatus["errorKind"] {
  const upper = error.toUpperCase();
  if (upper.includes("ENOTFOUND")) return "DNS";
  if (upper.includes("ETIMEDOUT") || upper.includes("ABORT_ERR") || upper.includes("TIMEOUT")) return "TIMEOUT";
  if (upper.includes("RATE_LIMIT") || upper.includes("HTTP 429")) return "RATE_LIMIT";
  const http = error.match(/HTTP\s+(\d{3})/i);
  if (http) {
    const code = Number.parseInt(http[1], 10);
    if (code >= 400 && code < 500) return code === 403 ? "BLOCKED" : "HTTP_4XX";
    if (code >= 500) return "HTTP_5XX";
  }
  if (upper.includes("PARSE")) return "PARSE";
  if (upper.includes("EMPTY")) return "EMPTY";
  return "UNKNOWN";
}

function inferUnit(args: { dataset: string; datasetName?: string; columnName?: string; unitMap: Record<string, UnitMapEntry> }): {
  nativeUnit: string;
  unitConfidence: AlphaVantageUnitConfidence;
  allowNormalization: boolean;
} {
  const override = args.unitMap[args.dataset];
  if (override?.unit) {
    return {
      nativeUnit: override.unit,
      unitConfidence: override.unitConfidence || "UNKNOWN",
      allowNormalization: Boolean(override.allowNormalization),
    };
  }
  const text = `${args.datasetName || ""} ${args.columnName || ""}`.toLowerCase();
  if (text.includes("yield") || text.includes("rate") || text.includes("percent")) {
    return { nativeUnit: "pct", unitConfidence: "ASSUMED", allowNormalization: false };
  }
  if (text.includes("index")) {
    return { nativeUnit: "index", unitConfidence: "ASSUMED", allowNormalization: false };
  }
  if (text.includes("usd") || text.includes("dollar")) {
    return { nativeUnit: "USD", unitConfidence: "ASSUMED", allowNormalization: false };
  }
  return { nativeUnit: "value", unitConfidence: "UNKNOWN", allowNormalization: false };
}

function parseIso(value: unknown): string | undefined {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  const ts = Date.parse(raw);
  if (!Number.isFinite(ts)) return undefined;
  return new Date(ts).toISOString();
}

function pickValueColumn(args: {
  row: unknown[];
  columnNames: string[];
  mapped?: string | number;
}): { idx: number; columnName: string } | undefined {
  if (typeof args.mapped === "number" && args.mapped >= 1 && args.mapped < args.row.length) {
    const idx = args.mapped;
    return { idx, columnName: args.columnNames[idx] || `col_${idx}` };
  }
  if (typeof args.mapped === "string") {
    const mappedLower = args.mapped.toLowerCase();
    const idx = args.columnNames.findIndex((column) => String(column || "").toLowerCase() === mappedLower);
    if (idx > 0 && idx < args.row.length) return { idx, columnName: args.columnNames[idx] };
  }
  for (let idx = 1; idx < args.row.length; idx++) {
    const value = parseNumber(args.row[idx]);
    if (value != null) return { idx, columnName: args.columnNames[idx] || `col_${idx}` };
  }
  return undefined;
}

function normalizedSeries(series: GrainWidgetPoint[], maxPoints: number): GrainWidgetPoint[] {
  const dedup = series
    .filter((point) => Number.isFinite(point.value))
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  return dedup.slice(-Math.max(3, maxPoints)).map((point) => ({ ts: point.ts, value: Number(point.value.toFixed(6)) }));
}

function splitDataset(dataset: string): { db: string; code: string } | undefined {
  const parts = dataset.split("/");
  if (parts.length < 2) return undefined;
  const [db, ...rest] = parts;
  const normalizedDb = String(db || "").trim().toUpperCase();
  const code = rest.join("/").trim();
  if (!normalizedDb || !code) return undefined;
  if (!["FRED", "CHRIS"].includes(normalizedDb)) {
    return undefined;
  }
  return { db: normalizedDb, code };
}

async function fetchJson(url: string): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NASDAQ_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "CroptoMonitor/1.1 (+https://cr0pto.com)",
        accept: "application/json,text/plain,*/*",
      },
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parsed = JSON.parse(text);
    if (parsed?.quandl_error?.message) {
      throw new Error(`NASDAQ_ERROR:${String(parsed.quandl_error.message)}`);
    }
    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchDataset(args: {
  dataset: string;
  rows: number;
  columnMap: Record<string, string | number>;
  unitMap: Record<string, UnitMapEntry>;
}): Promise<DatasetSnapshot> {
  const cached = datasetCache.get(args.dataset);
  const now = Date.now();
  if (cached && now - cached.fetchedAt <= NASDAQ_CACHE_TTL_MS) {
    return {
      ...cached,
      status: {
        ...cached.status,
        note: [cached.status.note, "cache_hit"].filter(Boolean).join("; "),
      },
    };
  }

  if (!NASDAQ_API_KEY) {
    throw new Error("no_key:NASDAQ_API_KEY");
  }

  const split = splitDataset(args.dataset);
  if (!split) {
    return {
      fetchedAt: now,
      status: {
        dataset: args.dataset,
        status: "parse_error",
        errorKind: "PARSE",
        note: "dataset_code_invalid",
      },
    };
  }

  const requestUrl = `${toBase(NASDAQ_BASE_URL)}/datasets/${encodeURIComponent(split.db)}/${encodeURIComponent(split.code)}.json?rows=${Math.max(6, args.rows)}&api_key=${encodeURIComponent(NASDAQ_API_KEY)}`;
  const sourceUrlUsed = sanitizeUrl(requestUrl);
  try {
    const payload = await fetchJson(requestUrl);
    const dataset = payload?.dataset;
    const datasetName = String(dataset?.name || args.dataset);
    const dataRows = Array.isArray(dataset?.data) ? dataset.data : [];
    const columnNames = Array.isArray(dataset?.column_names) ? dataset.column_names.map((value: unknown) => String(value || "")) : [];
    if (!dataRows.length) {
      const emptyStatus: DatasetStatus = {
        dataset: args.dataset,
        status: "empty",
        errorKind: "EMPTY",
        sourceUrlUsed,
        note: "dataset_empty",
      };
      const snapshot = { fetchedAt: now, status: emptyStatus };
      datasetCache.set(args.dataset, snapshot);
      return snapshot;
    }

    const mappedColumn = args.columnMap[args.dataset];
    const firstRow = Array.isArray(dataRows[0]) ? dataRows[0] : [];
    const valueColumn = pickValueColumn({
      row: firstRow,
      columnNames,
      mapped: mappedColumn,
    });
    if (!valueColumn) {
      const noNumericStatus: DatasetStatus = {
        dataset: args.dataset,
        status: "parse_error",
        errorKind: "PARSE",
        sourceUrlUsed,
        note: "numeric_column_not_found",
      };
      const snapshot = { fetchedAt: now, status: noNumericStatus };
      datasetCache.set(args.dataset, snapshot);
      return snapshot;
    }

    const points: GrainWidgetPoint[] = dataRows
      .map((row: unknown) => {
        if (!Array.isArray(row)) return undefined;
        const ts = parseIso(row[0]);
        const value = parseNumber(row[valueColumn.idx]);
        if (!ts || value == null) return undefined;
        return { ts, value };
      })
      .filter((point: GrainWidgetPoint | undefined): point is GrainWidgetPoint => Boolean(point));
    const series = normalizedSeries(points, args.rows);
    if (!series.length) {
      const noSeriesStatus: DatasetStatus = {
        dataset: args.dataset,
        status: "empty",
        errorKind: "EMPTY",
        sourceUrlUsed,
        note: "series_not_parseable",
      };
      const snapshot = { fetchedAt: now, status: noSeriesStatus };
      datasetCache.set(args.dataset, snapshot);
      return snapshot;
    }

    const current = series[series.length - 1]?.value;
    const prev = series.length > 1 ? series[series.length - 2]?.value : undefined;
    const changeAbs = current != null && prev != null ? Number((current - prev).toFixed(6)) : undefined;
    const changePct = current != null && prev != null && prev !== 0
      ? Number((((current - prev) / prev) * 100).toFixed(2))
      : undefined;

    const unit = inferUnit({
      dataset: args.dataset,
      datasetName,
      columnName: valueColumn.columnName,
      unitMap: args.unitMap,
    });

    const item: GrainWidgetNasdaqDataLinkItem = {
      id: `nasdaq-${args.dataset.replace(/[^\w]+/g, "-").toLowerCase()}`,
      dataset: args.dataset,
      label: datasetName,
      nativeValueCurrent: current,
      nativeUnit: unit.nativeUnit,
      changeAbs,
      changePct,
      series,
      unitConfidence: unit.unitConfidence,
      notes: [
        `column:${valueColumn.columnName}`,
        ...(unit.unitConfidence !== "CONFIRMED" ? ["unit_unverified"] : []),
      ],
    };
    const status: DatasetStatus = {
      dataset: args.dataset,
      status: "ok",
      sourceUrlUsed,
      note: unit.allowNormalization ? "allow_normalization=true" : "allow_normalization=false",
    };
    const snapshot: DatasetSnapshot = { fetchedAt: now, item, status };
    datasetCache.set(args.dataset, snapshot);
    return snapshot;
  } catch (error: any) {
    const message = String(error?.message || "fetch_failed");
    const errorKind = classifyErrorKind(message);
    const http403 = /HTTP\s+403/i.test(message) || message.toLowerCase().includes("forbidden");
    const status: DatasetStatus = {
      dataset: args.dataset,
      status: http403 ? "forbidden" : "error",
      errorKind,
      sourceUrlUsed,
      note: http403 ? "premium_access_denied_or_quota_blocked" : message.slice(0, 120),
    };
    const snapshot: DatasetSnapshot = { fetchedAt: now, status };
    datasetCache.set(args.dataset, snapshot);
    return snapshot;
  }
}

function uniqueDatasets(): string[] {
  const datasets = [...NASDAQ_DATASETS];
  if (ENABLE_NASDAQ_CHRIS) datasets.push(...NASDAQ_CHRIS_DATASETS);
  return Array.from(new Set(datasets.map((value) => value.trim()).filter(Boolean)));
}

export class NasdaqDataLinkProvider implements GrainWidgetsProvider {
  id = "nasdaq-datalink";
  kind = "NASDAQ_DATA_LINK_SNAPSHOT" as const;
  enabled = ENABLE_NASDAQ_DATALINK_PROVIDER;
  private readonly fallback = new MockGrainWidgetsProvider({ kind: "NASDAQ_DATA_LINK_SNAPSHOT" });

  async getWidget(ctx: GrainWidgetsProviderContext): Promise<GrainWidgetNasdaqDataLinkSnapshot> {
    const datasets = uniqueDatasets();
    if (!datasets.length) {
      throw new Error("nasdaq_datasets_empty");
    }

    const unitMap = parseUnitMap();
    const columnMap = parseColumnMap();
    const statuses: DatasetStatus[] = [];
    const items: GrainWidgetNasdaqDataLinkItem[] = [];
    const notes: string[] = [];

    for (const dataset of datasets) {
      const snapshot = await fetchDataset({
        dataset,
        rows: Math.max(6, ctx.seriesPoints),
        columnMap,
        unitMap,
      });
      statuses.push(snapshot.status);
      if (snapshot.item?.nativeValueCurrent != null) {
        items.push(snapshot.item);
      }
    }

    const expectedCount = datasets.length;
    const mappedCount = items.length;
    const coverage = `${mappedCount}/${expectedCount}`;
    const forbiddenCount = statuses.filter((status) => status.status === "forbidden").length;
    if (forbiddenCount > 0) {
      notes.push(`premium_access_denied:${forbiddenCount}`);
    }
    if (statuses.some((status) => status.status === "rate_limited")) {
      notes.push("rate_limit_observed");
    }

    const coverageRatio = expectedCount > 0 ? mappedCount / expectedCount : 0;
    const status = coverageRatio >= 0.7
      ? "REFRESH"
      : mappedCount > 0
        ? "INDICATIVE"
        : "OFFLINE";
    if (!mappedCount) {
      throw new Error(
        statuses
          .map((entry) => `${entry.dataset}:${entry.status}${entry.errorKind ? `:${entry.errorKind}` : ""}`)
          .join(" | ") || "coverage_empty",
      );
    }

    const primarySource = statuses.find((entry) => entry.sourceUrlUsed)?.sourceUrlUsed;
    return {
      id: "grain-nasdaq-data-link-snapshot",
      kind: "NASDAQ_DATA_LINK_SNAPSHOT",
      title: "Nasdaq Data Link Snapshot",
      subtitle: ENABLE_NASDAQ_CHRIS ? "Macro/gov + optional CHRIS series" : "Macro/gov series",
      status,
      sourceName: "Nasdaq Data Link",
      sourceAttribution: "Data: Nasdaq Data Link",
      sourceUrl: primarySource || `${toBase(NASDAQ_BASE_URL)}/datasets/FRED/DGS10.json`,
      updatedAt: ctx.now.toISOString(),
      timeframe: ctx.timeframe,
      items: items.slice(0, 8),
      summary: {
        expectedCount,
        mappedCount,
        coverage,
        datasetStatuses: statuses,
      },
      notes: notes.length ? notes : undefined,
      fallbackReason: mappedCount > 0 ? undefined : "coverage_empty",
    };
  }

  mockFallback(reason: string, ctx: GrainWidgetsProviderContext): GrainWidgetNasdaqDataLinkSnapshot {
    return this.fallback.mockFallback(reason, ctx) as GrainWidgetNasdaqDataLinkSnapshot;
  }
}
