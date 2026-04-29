import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { inflateRawSync } from "node:zlib";
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
import { fetchBufferWithTimeout, fetchTextWithTimeout, parseNumber } from "./utils";

type ParsedDataset = {
  metric: GrainWidgetUsdaGtrLogisticsItem["metric"];
  label: string;
  series: GrainWidgetPoint[];
  rowsParsed: number;
  sourceUrlUsed: string;
  columnsDetected: string[];
  datasetUrlChosen: string;
  httpStatus?: number;
  finalUrl?: string;
  responseHeaders?: Record<string, string>;
  transportUsed?: "fetch" | "node_https_fallback";
  rangeRequestUsed?: boolean;
};

type CacheEntry = {
  fetchedAt: number;
  widget: GrainWidgetUsdaGtrLogisticsSnapshot;
};

type SheetRow = Record<string, string>;

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
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && numeric > 20_000 && numeric < 80_000) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    return new Date(excelEpoch + numeric * 86_400_000).toISOString();
  }
  const parsed = Date.parse(trimmed);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  const asMonthYear = Date.parse(`${trimmed}-01`);
  if (Number.isFinite(asMonthYear)) return new Date(asMonthYear).toISOString();
  return undefined;
}

function inferUnit(metric: GrainWidgetUsdaGtrLogisticsItem["metric"], label: string): string {
  const text = label.toLowerCase();
  if (text.includes("surcharge") || text.includes("mile")) return "USD/mile";
  if (text.includes("ton")) return "USD/t";
  if (text.includes("index") || metric === "BARGE") return "index";
  if (metric === "OCEAN") return "USD";
  return "rate";
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

function mapItem(parsed: ParsedDataset): GrainWidgetUsdaGtrLogisticsItem | undefined {
  const latest = parsed.series[parsed.series.length - 1];
  const prev = parsed.series[parsed.series.length - 2];
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
    series: parsed.series,
    confidence: parsed.series.length >= 8 ? "HIGH" : "MED",
  };
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
      if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) throw new Error("zip_local_header_missing");
      const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = buffer.slice(dataStart, dataStart + compressedSize);
      let content: Buffer;
      if (compression === 0) content = compressed;
      else if (compression === 8) content = inflateRawSync(compressed);
      else throw new Error(`zip_unsupported_compression:${compression}`);
      entries.set(fileName, content);
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function decodeXml(xml: string): string {
  return xml
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseSharedStrings(xml?: string): string[] {
  if (!xml) return [];
  const out: string[] = [];
  const matches = xml.matchAll(/<si[\s\S]*?>([\s\S]*?)<\/si>/g);
  for (const match of matches) {
    const text = Array.from(match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g))
      .map((part) => decodeXml(part[1]))
      .join("");
    out.push(text);
  }
  return out;
}

function parseWorkbookRelations(xml: string): Map<string, string> {
  const rels = new Map<string, string>();
  for (const match of xml.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    rels.set(match[1], match[2]);
  }
  return rels;
}

function parseWorkbookSheets(xml: string, rels: Map<string, string>): Map<string, string> {
  const sheets = new Map<string, string>();
  for (const match of xml.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const target = rels.get(match[2]);
    if (target) sheets.set(match[1], `xl/${target.replace(/^\/+/, "")}`);
  }
  return sheets;
}

function columnFromRef(ref: string): string {
  const match = ref.match(/[A-Z]+/i);
  return (match?.[0] || "").toUpperCase();
}

function parseSheetRows(xml: string, sharedStrings: string[]): SheetRow[] {
  const rows: SheetRow[] = [];
  for (const rowMatch of xml.matchAll(/<row\b[\s\S]*?>([\s\S]*?)<\/row>/g)) {
    const row: SheetRow = {};
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2];
      const refMatch = attrs.match(/\br="([^"]+)"/);
      const typeMatch = attrs.match(/\bt="([^"]+)"/);
      const column = refMatch ? columnFromRef(refMatch[1]) : "";
      if (!column) continue;
      let value = "";
      const inlineMatch = body.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/);
      const rawMatch = body.match(/<v>([\s\S]*?)<\/v>/);
      if (inlineMatch) value = decodeXml(inlineMatch[1]);
      else if (rawMatch) {
        value = decodeXml(rawMatch[1]);
        if (typeMatch?.[1] === "s") value = sharedStrings[Number.parseInt(value, 10)] || value;
      }
      row[column] = value;
    }
    if (Object.keys(row).length) rows.push(row);
  }
  return rows;
}

function parseXlsxWorkbook(buffer: Buffer) {
  const files = unzipEntries(buffer);
  const sharedStrings = parseSharedStrings(files.get("xl/sharedStrings.xml")?.toString("utf8"));
  const workbookXml = files.get("xl/workbook.xml")?.toString("utf8");
  const relsXml = files.get("xl/_rels/workbook.xml.rels")?.toString("utf8");
  if (!workbookXml || !relsXml) throw new Error("xlsx_workbook_missing");
  const rels = parseWorkbookRelations(relsXml);
  const sheets = parseWorkbookSheets(workbookXml, rels);
  return {
    getSheetRows(sheetName: string): SheetRow[] {
      const path = sheets.get(sheetName);
      const xml = path ? files.get(path)?.toString("utf8") : undefined;
      if (!xml) return [];
      return parseSheetRows(xml, sharedStrings);
    },
  };
}

function lastPoints(points: GrainWidgetPoint[], seriesPoints: number): GrainWidgetPoint[] {
  return points
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
    .slice(-Math.max(6, seriesPoints));
}

function parseTable1Workbook(buffer: Buffer, sourceUrlUsed: string, seriesPoints: number): ParsedDataset[] {
  const workbook = parseXlsxWorkbook(buffer);
  const rows = workbook.getSheetRows("Data");
  if (rows.length < 8) return [];

  const dataRows = rows.slice(7);
  const bargePoints: GrainWidgetPoint[] = [];
  const oceanPoints: GrainWidgetPoint[] = [];

  for (const row of dataRows) {
    const ts = normalizeTs(row.A);
    if (!ts) continue;
    const bargeValue = parseNumber(row.K);
    const oceanValue = parseNumber(row.L);
    if (bargeValue != null) bargePoints.push({ ts, value: Number(bargeValue.toFixed(4)) });
    if (oceanValue != null) oceanPoints.push({ ts, value: Number(oceanValue.toFixed(4)) });
  }

  const out: ParsedDataset[] = [];
  if (bargePoints.length >= 2) {
    out.push({
      metric: "BARGE",
      label: "Barge transport cost index",
      series: lastPoints(bargePoints, seriesPoints),
      rowsParsed: bargePoints.length,
      sourceUrlUsed,
      columnsDetected: ["A:Date", "K:Barge"],
      datasetUrlChosen: sourceUrlUsed,
    });
  }
  if (oceanPoints.length >= 2) {
    out.push({
      metric: "OCEAN",
      label: "Gulf ocean vessel cost index",
      series: lastPoints(oceanPoints, seriesPoints),
      rowsParsed: oceanPoints.length,
      sourceUrlUsed,
      columnsDetected: ["A:Date", "L:Gulf ocean vessel"],
      datasetUrlChosen: sourceUrlUsed,
    });
  }
  return out;
}

function average(values: number[]): number | undefined {
  if (!values.length) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function parseFigure9Workbook(buffer: Buffer, sourceUrlUsed: string, seriesPoints: number): ParsedDataset[] {
  const workbook = parseXlsxWorkbook(buffer);
  const rows = workbook.getSheetRows("data");
  if (rows.length < 3) return [];
  const candidateColumns = ["C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
  const points: GrainWidgetPoint[] = [];

  for (const row of rows.slice(1)) {
    const ts = normalizeTs(row.A);
    if (!ts) continue;
    const values = candidateColumns
      .map((column) => parseNumber(row[column]))
      .filter((value): value is number => value != null && Number.isFinite(value));
    const current = average(values);
    if (current == null) continue;
    points.push({ ts, value: Number(current.toFixed(4)) });
  }

  if (points.length < 2) return [];
  return [
    {
      metric: "FUEL",
      label: "Rail fuel surcharge average",
      series: lastPoints(points, seriesPoints),
      rowsParsed: points.length,
      sourceUrlUsed,
      columnsDetected: ["A:Date", "C-L:Carrier surcharge columns"],
      datasetUrlChosen: sourceUrlUsed,
    },
  ];
}

function parseCsvDataset(csv: string, sourceUrlUsed: string, seriesPoints: number): ParsedDataset[] {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = splitCsvRow(lines[0]).map((value) => value.replace(/^"|"$/g, ""));
  const dateIdx = headers.findIndex((header) => {
    const key = header.toLowerCase();
    return key.includes("date") || key.includes("week") || key.includes("month") || key.includes("period");
  });
  const valueIdx = headers.findIndex((header) => /(rate|index|surcharge|tariff|price)/i.test(header));
  if (dateIdx < 0 || valueIdx < 0) return [];

  const points: GrainWidgetPoint[] = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsvRow(line);
    const ts = normalizeTs(cols[dateIdx] || "");
    const value = parseNumber(cols[valueIdx]);
    if (!ts || value == null) continue;
    points.push({ ts, value: Number(value.toFixed(4)) });
  }
  if (points.length < 2) return [];

  return [
    {
      metric: /barge/i.test(headers[valueIdx]) ? "BARGE" : /fuel|surcharge/i.test(headers[valueIdx]) ? "FUEL" : "RAIL",
      label: headers[valueIdx].replace(/\s+/g, " ").trim(),
      series: lastPoints(points, seriesPoints),
      rowsParsed: points.length,
      sourceUrlUsed,
      columnsDetected: [headers[dateIdx], headers[valueIdx]],
      datasetUrlChosen: sourceUrlUsed,
    },
  ];
}

async function downloadBufferViaNode(url: string): Promise<{ buffer: Buffer; finalUrl: string; statusCode?: number; headers: Record<string, string> }> {
  const visit = (targetUrl: string, redirectsLeft: number): Promise<{ buffer: Buffer; finalUrl: string; statusCode?: number; headers: Record<string, string> }> =>
    new Promise((resolve, reject) => {
      const parsed = new URL(targetUrl);
      const requester = parsed.protocol === "http:" ? httpRequest : httpsRequest;
      const req = requester(targetUrl, {
        method: "GET",
        headers: {
          "user-agent": "CroptoMonitor/1.0 (+https://cr0pto.com)",
          accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*",
          "accept-language": "en-US,en;q=0.9",
          referer: "https://www.ams.usda.gov/",
          pragma: "no-cache",
          "cache-control": "no-cache",
          range: "bytes=0-1048575",
        },
      }, (res) => {
        const statusCode = res.statusCode;
        const headers = Object.fromEntries(
          Object.entries(res.headers)
            .filter(([, value]) => typeof value === "string")
            .map(([key, value]) => [key, String(value)]),
        );
        if (statusCode && statusCode >= 300 && statusCode < 400 && res.headers.location && redirectsLeft > 0) {
          const nextUrl = new URL(res.headers.location, targetUrl).toString();
          res.resume();
          visit(nextUrl, redirectsLeft - 1).then(resolve).catch(reject);
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => {
          const buffer = Buffer.concat(chunks);
          if (statusCode && statusCode >= 400) {
            const error = new Error(`HTTP ${statusCode}`) as Error & {
              httpStatus?: number;
              finalUrl?: string;
              responseHeaders?: Record<string, string>;
            };
            error.httpStatus = statusCode;
            error.finalUrl = targetUrl;
            error.responseHeaders = headers;
            reject(error);
            return;
          }
          resolve({
            buffer,
            finalUrl: targetUrl,
            statusCode,
            headers,
          });
        });
      });
      req.on("error", reject);
      req.setTimeout(USDA_GTR_TIMEOUT_MS, () => {
        req.destroy(new Error("ETIMEDOUT"));
      });
      req.end();
    });

  return visit(url, 4);
}

async function parseDatasetFromUrl(url: string, seriesPoints: number): Promise<ParsedDataset[]> {
  if (/\.xlsx(?:$|\?)/i.test(url)) {
    let buffer: Buffer;
    let finalUrl: string;
    let responseHeaders: Record<string, string> | undefined;
    let httpStatus: number | undefined;
    let transportUsed: "fetch" | "node_https_fallback" = "fetch";
    const rangeRequestUsed = true;
    try {
      const fetched = await fetchBufferWithTimeout(url, USDA_GTR_TIMEOUT_MS, {
        accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*",
        range: "bytes=0-1048575",
      });
      buffer = fetched.buffer;
      finalUrl = fetched.finalUrl;
    } catch (error: any) {
      Object.assign(error, {
        transportUsed: "fetch",
        rangeRequestUsed,
      });
      if (Number(error?.httpStatus) === 403) {
        try {
          const fallback = await downloadBufferViaNode(url);
          buffer = fallback.buffer;
          finalUrl = fallback.finalUrl;
          responseHeaders = fallback.headers;
          httpStatus = fallback.statusCode;
          transportUsed = "node_https_fallback";
        } catch (fallbackError: any) {
          Object.assign(fallbackError, {
            transportUsed: "node_https_fallback",
            rangeRequestUsed,
          });
          throw fallbackError;
        }
      } else {
        throw error;
      }
    }
    if (/GTRTable1\.xlsx/i.test(finalUrl) || /GTRTable1\.xlsx/i.test(url)) {
      return parseTable1Workbook(buffer, finalUrl, seriesPoints).map((entry) => ({
        ...entry,
        httpStatus,
        finalUrl,
        responseHeaders,
        transportUsed,
        rangeRequestUsed,
      }));
    }
    if (/GTRFigure9\.xlsx/i.test(finalUrl) || /GTRFigure9\.xlsx/i.test(url)) {
      return parseFigure9Workbook(buffer, finalUrl, seriesPoints).map((entry) => ({
        ...entry,
        httpStatus,
        finalUrl,
        responseHeaders,
        transportUsed,
        rangeRequestUsed,
      }));
    }
    return [];
  }

  const csv = await fetchTextWithTimeout(url, USDA_GTR_TIMEOUT_MS, {
    accept: "text/csv,text/plain,*/*",
  });
  return parseCsvDataset(csv, url, seriesPoints);
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
    let datasetUrlChosen: string | undefined;
    let rowsParsed = 0;
    let columnsDetected: string[] = [];
    let totalSeriesPoints = 0;
    let httpStatus: number | undefined;
    let finalUrl: string | undefined;
    let responseHeaders: Record<string, string> | undefined;
    let transportUsed: "fetch" | "node_https_fallback" | undefined;
    let rangeRequestUsed: boolean | undefined;

    for (const url of USDA_GTR_DATASET_URLS) {
      try {
        const parsedList = await parseDatasetFromUrl(url, ctx.seriesPoints);
        if (!parsedList.length) {
          warnings.push(`parse_empty:${url}`);
          continue;
        }
        for (const parsed of parsedList) {
          if (parsedSignals.some((entry) => entry.metric === parsed.metric)) continue;
          parsedSignals.push(parsed);
          rowsParsed += parsed.rowsParsed;
          totalSeriesPoints += parsed.series.length;
          sourceUrlUsed = sourceUrlUsed || parsed.sourceUrlUsed;
          datasetUrlChosen = datasetUrlChosen || parsed.datasetUrlChosen;
          columnsDetected = Array.from(new Set([...columnsDetected, ...parsed.columnsDetected]));
          transportUsed = transportUsed || parsed.transportUsed;
          rangeRequestUsed = rangeRequestUsed ?? parsed.rangeRequestUsed;
          if (parsedSignals.length >= Math.max(1, USDA_GTR_MAX_SIGNALS)) break;
        }
        if (parsedSignals.length >= Math.max(1, USDA_GTR_MAX_SIGNALS)) break;
      } catch (error: any) {
        if (typeof error?.httpStatus === "number") httpStatus = error.httpStatus;
        if (typeof error?.finalUrl === "string") finalUrl = error.finalUrl;
        if (error?.responseHeaders && typeof error.responseHeaders === "object") {
          responseHeaders = error.responseHeaders;
        }
        if (error?.transportUsed === "fetch" || error?.transportUsed === "node_https_fallback") {
          transportUsed = error.transportUsed;
        }
        if (typeof error?.rangeRequestUsed === "boolean") {
          rangeRequestUsed = error.rangeRequestUsed;
        }
        warnings.push(`${url}:${String(error?.message || "fetch_failed").slice(0, 120)}`);
      }
    }

    const items = parsedSignals
      .map(mapItem)
      .filter((item): item is GrainWidgetUsdaGtrLogisticsItem => Boolean(item))
      .slice(0, Math.max(1, USDA_GTR_MAX_SIGNALS));

    if (!items.length) {
      const error = new Error(warnings[0] || "usda_gtr_no_signals") as Error & {
        httpStatus?: number;
        finalUrl?: string;
        responseHeaders?: Record<string, string>;
        transportUsed?: "fetch" | "node_https_fallback";
        rangeRequestUsed?: boolean;
      };
      error.httpStatus = httpStatus;
      error.finalUrl = finalUrl;
      error.responseHeaders = responseHeaders;
      error.transportUsed = transportUsed;
      error.rangeRequestUsed = rangeRequestUsed;
      throw error;
    }

    const expectedCount = 2;
    const mappedCount = items.length;
    const coverage = `${mappedCount}/${expectedCount}`;
    const cadence = deriveCadence(items.flatMap((item) => item.series || []));
    const status = mappedCount >= 2 ? "REFRESH" : "INDICATIVE";

    const widget: GrainWidgetUsdaGtrLogisticsSnapshot = {
      id: "grain-usda-gtr-logistics-snapshot",
      kind: "USDA_GTR_LOGISTICS_SNAPSHOT",
      title: "US Logistics (USDA GTR)",
      subtitle: "Barge / Rail fuel / Ocean proxies",
      status,
      sourceName: "USDA AMS (GTR)",
      sourceAttribution: "Data: USDA Grain Transportation Report datasets",
      sourceUrl: sourceUrlUsed || datasetUrlChosen || USDA_GTR_BASE_URL,
      updatedAt: ctx.now.toISOString(),
      timeframe: ctx.timeframe,
      items,
      summary: {
        expectedCount,
        mappedCount,
        coverage,
        cadence,
      },
      notes: [
        "Official USDA AMS GTR datasets",
        "weekly cadence",
        "Table 1 + Figure 9 selection",
      ],
      debug: {
        sourceUrlUsed: sourceUrlUsed || datasetUrlChosen || USDA_GTR_BASE_URL,
        datasetUrlChosen: datasetUrlChosen || sourceUrlUsed || USDA_GTR_BASE_URL,
        rowsParsed,
        columnsDetected: columnsDetected.length ? columnsDetected : undefined,
        seriesPoints: totalSeriesPoints || undefined,
        httpStatus,
        finalUrl,
        responseHeaders,
        transportUsed,
        rangeRequestUsed,
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
