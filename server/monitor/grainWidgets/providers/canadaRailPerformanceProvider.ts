import { inflateRawSync } from "node:zlib";
import {
  CANADA_RAIL_CACHE_TTL_MS,
  CANADA_RAIL_PRODUCT_ID,
  CANADA_RAIL_TIMEOUT_MS,
  CANADA_RAIL_WDS_BASE_URL,
  ENABLE_CANADA_GRAIN_RAIL_WIDGET,
} from "../config";
import type { GrainWidgetCanadaRailPerformance, GrainWidgetCanadaRailPerformanceItem, GrainWidgetPoint } from "../types";
import type { GrainWidgetsProvider, GrainWidgetsProviderContext } from "./types";
import { MockGrainWidgetsProvider } from "./mockGrainWidgetsProvider";
import { fetchBufferWithTimeout, fetchTextResponseWithTimeout, parseNumber } from "./utils";

type CacheEntry = { fetchedAt: number; widget: GrainWidgetCanadaRailPerformance };
type CsvRow = Record<string, string>;

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
      out.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  out.push(current);
  return out.map((value) => value.trim());
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 66_000); offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("zip_eocd_missing");
}

function unzipEntries(buffer: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  const eocd = findEndOfCentralDirectory(buffer);
  const centralDirOffset = buffer.readUInt32LE(eocd + 16);
  const totalEntries = buffer.readUInt16LE(eocd + 10);
  let offset = centralDirOffset;
  for (let i = 0; i < totalEntries; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const compression = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer.slice(offset + 46, offset + 46 + fileNameLength).toString("utf8");
    if (!fileName.endsWith("/")) {
      const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = buffer.slice(dataStart, dataStart + compressedSize);
      const content = compression === 0 ? compressed : compression === 8 ? inflateRawSync(compressed) : undefined;
      if (content) entries.set(fileName, content);
    }
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

function parseCsv(content: string): CsvRow[] {
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvRow(lines[0]);
  return lines.slice(1).map((line) => {
    const cols = splitCsvRow(line);
    return Object.fromEntries(headers.map((header, index) => [header, cols[index] || ""]));
  });
}

function looksLikeZip(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

function decodeBufferText(buffer: Buffer): string {
  const utf8 = buffer.toString("utf8");
  if (utf8.includes(",") && /\r?\n/.test(utf8)) return utf8;
  return buffer.toString("latin1");
}

function normalizeDate(value: string): string | undefined {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function metricKind(label: string): GrainWidgetCanadaRailPerformanceItem["metric"] {
  const norm = label.toLowerCase();
  if (norm.includes("fulfillment")) return "FULFILLMENT";
  if (norm.includes("delay")) return "DELAY";
  if (norm.includes("car")) return "LOADED_CARS";
  if (norm.includes("movement")) return "MOVEMENT";
  return "OTHER";
}

function metricRank(label: string): number {
  const norm = label.toLowerCase();
  if (norm.includes("cars loaded")) return 10;
  if (norm.includes("fulfillment")) return 9;
  if (norm.includes("order")) return 8;
  if (norm.includes("delay")) return 7;
  if (norm.includes("movement")) return 6;
  return 1;
}

function toItems(rows: CsvRow[], points: number): { items: GrainWidgetCanadaRailPerformanceItem[]; columnsDetected: string[]; rowsParsed: number } {
  if (!rows.length) return { items: [], columnsDetected: [], rowsParsed: 0 };
  const headers = Object.keys(rows[0]);
  const dateKey = headers.find((header) => /ref_date|date/i.test(header)) || headers[0];
  const valueKey = headers.find((header) => /^value$/i.test(header)) || headers.find((header) => /value/i.test(header)) || "VALUE";
  const labelKey = headers.find((header) => /indicator|characteristic|rail service/i.test(header)) || headers.find((header) => /rail/i.test(header)) || headers[1];
  const unitKey = headers.find((header) => /^uom$/i.test(header) || /unit/i.test(header));
  const geoKey = headers.find((header) => /^geo$/i.test(header));

  const filtered = rows.filter((row) => {
    const geo = String(geoKey ? row[geoKey] : "Canada").toLowerCase();
    return !geo || geo === "canada";
  });

  const grouped = new Map<string, Array<{ ts: string; value: number; unit: string }>>();
  for (const row of filtered) {
    const label = String(row[labelKey] || "").trim();
    const ts = normalizeDate(String(row[dateKey] || ""));
    const value = parseNumber(row[valueKey]);
    if (!label || !ts || value == null) continue;
    const unit = String(unitKey ? row[unitKey] || "" : "").trim() || "value";
    if (!grouped.has(label)) grouped.set(label, []);
    grouped.get(label)!.push({ ts, value, unit });
  }

  const items = Array.from(grouped.entries())
    .sort((a, b) => metricRank(b[0]) - metricRank(a[0]))
    .slice(0, 4)
    .map(([label, seriesRows]): GrainWidgetCanadaRailPerformanceItem | null => {
      const series = seriesRows
        .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
        .slice(-Math.max(6, points))
        .map((entry) => ({ ts: entry.ts, value: Number(entry.value.toFixed(4)) })) satisfies GrainWidgetPoint[];
      const latest = series[series.length - 1];
      const prev = series[series.length - 2];
      return latest ? {
        metric: metricKind(label),
        label,
        current: latest.value,
        unit: seriesRows[seriesRows.length - 1]?.unit || "value",
        changeAbs: prev ? Number((latest.value - prev.value).toFixed(4)) : undefined,
        changePct: prev && prev.value !== 0 ? Number((((latest.value - prev.value) / prev.value) * 100).toFixed(2)) : undefined,
        series,
        confidence: series.length >= 8 ? "HIGH" : "MED",
      } : null;
    })
    .filter((entry): entry is GrainWidgetCanadaRailPerformanceItem => entry !== null);

  return {
    items,
    columnsDetected: [dateKey, labelKey, valueKey, unitKey].filter(Boolean) as string[],
    rowsParsed: filtered.length,
  };
}

export class CanadaRailPerformanceProvider implements GrainWidgetsProvider {
  id = "canada-grain-rail-performance";
  kind = "CANADA_GRAIN_RAIL_PERFORMANCE" as const;
  enabled = ENABLE_CANADA_GRAIN_RAIL_WIDGET;
  private readonly fallback = new MockGrainWidgetsProvider({ kind: "CANADA_GRAIN_RAIL_PERFORMANCE" as any });

  async getWidget(ctx: GrainWidgetsProviderContext): Promise<GrainWidgetCanadaRailPerformance> {
    const now = Date.now();
    if (cacheEntry && now - cacheEntry.fetchedAt <= CANADA_RAIL_CACHE_TTL_MS) {
      return {
        ...cacheEntry.widget,
        updatedAt: ctx.now.toISOString(),
        notes: [...(cacheEntry.widget.notes || []), "cache_hit"],
      };
    }

    const wdsUrl = `${CANADA_RAIL_WDS_BASE_URL}/getFullTableDownloadCSV/${CANADA_RAIL_PRODUCT_ID}/en`;
    const descriptor = await fetchTextResponseWithTimeout(wdsUrl, CANADA_RAIL_TIMEOUT_MS, { accept: "application/json,text/plain,*/*" });
    const descriptorJson = JSON.parse(descriptor.text);
    const zipUrl = typeof descriptorJson === "string"
      ? descriptorJson.trim()
      : String(descriptorJson?.object || descriptorJson?.url || "").trim();
    if (!zipUrl) throw new Error("canada_rail_zip_url_missing");

    const zipped = await fetchBufferWithTimeout(zipUrl, CANADA_RAIL_TIMEOUT_MS, { accept: "application/zip,*/*" });
    let rows: CsvRow[] = [];
    let datasetUrlChosen = zipUrl;
    if (looksLikeZip(zipped.buffer)) {
      const entries = unzipEntries(zipped.buffer);
      const csvEntry = Array.from(entries.entries()).find(([name]) => /\.csv$/i.test(name));
      if (!csvEntry) throw new Error("canada_rail_csv_missing");
      datasetUrlChosen = `${zipUrl}#${csvEntry[0]}`;
      rows = parseCsv(csvEntry[1].toString("utf8"));
    } else {
      const directText = decodeBufferText(zipped.buffer);
      rows = parseCsv(directText);
      if (!rows.length) throw new Error("canada_rail_csv_missing");
    }
    const parsed = toItems(rows, ctx.seriesPoints);
    if (!parsed.items.length) throw new Error("canada_rail_metrics_empty");

    const widget: GrainWidgetCanadaRailPerformance = {
      id: "grain-canada-rail-performance",
      kind: "CANADA_GRAIN_RAIL_PERFORMANCE",
      title: "Canada Grain Rail Performance",
      subtitle: "Official weekly rail performance indicators",
      status: parsed.items.length >= 2 ? "REFRESH" : "INDICATIVE",
      sourceName: "Statistics Canada",
      sourceAttribution: "Data: Statistics Canada rail service indicators",
      sourceUrl: datasetUrlChosen,
      updatedAt: ctx.now.toISOString(),
      timeframe: ctx.timeframe,
      territoryScope: "COUNTRY_FIXED",
      territory: { code: "CA", label: "Canada" },
      items: parsed.items,
      summary: {
        expectedCount: 4,
        mappedCount: parsed.items.length,
        coverage: `${parsed.items.length}/4`,
        cadence: "weekly",
      },
      notes: ["Official Statistics Canada weekly rail indicators", "No price normalization applied"],
      debug: {
        sourceUrlUsed: zipped.finalUrl || zipUrl,
        datasetUrlChosen,
        rowsParsed: parsed.rowsParsed,
        columnsDetected: parsed.columnsDetected,
        seriesPoints: parsed.items.reduce((sum, item) => sum + (item.series?.length || 0), 0),
      },
    };

    cacheEntry = { fetchedAt: now, widget };
    return widget;
  }

  mockFallback(reason: string, ctx: GrainWidgetsProviderContext) {
    return this.fallback.mockFallback(reason, ctx) as any;
  }
}
