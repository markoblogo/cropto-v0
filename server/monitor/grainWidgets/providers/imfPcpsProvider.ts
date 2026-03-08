import * as cheerio from "cheerio";
import { inflateSync } from "node:zlib";
import {
  ENABLE_IMF_PCPS_WIDGET,
  IMF_PCPS_CACHE_TTL_MS,
  IMF_PCPS_PAGE_URL,
  IMF_PCPS_TABLE2_URL,
  IMF_PCPS_TIMEOUT_MS,
} from "../config";
import type { GrainWidgetImfCommodityBenchmarks, GrainWidgetImfCommodityBenchmarkRow } from "../types";
import type { GrainWidgetsProvider, GrainWidgetsProviderContext } from "./types";
import { MockGrainWidgetsProvider } from "./mockGrainWidgetsProvider";
import { deriveSeries, fetchBufferWithTimeout, fetchTextResponseWithTimeout, makeProviderError, parseNumber, redactSensitiveUrl } from "./utils";

type CacheEntry = { fetchedAt: number; widget: GrainWidgetImfCommodityBenchmarks };
let cacheEntry: CacheEntry | null = null;

const TARGETS = [
  { commodity: "WHEAT" as const, label: "Wheat", aliases: ["wheat"] },
  { commodity: "MAIZE" as const, label: "Maize (Corn)", aliases: ["maize", "corn"] },
  { commodity: "SOYBEANS" as const, label: "Soybeans", aliases: ["soybeans", "soybean"] },
];

function buildImfRow(target: (typeof TARGETS)[number], seriesValues: number[], extractionMode: string): GrainWidgetImfCommodityBenchmarkRow {
  const current = seriesValues[seriesValues.length - 1];
  const prev = seriesValues[seriesValues.length - 2];
  return {
    commodity: target.commodity,
    label: target.label,
    current,
    unit: "USD index",
    cadence: "monthly",
    changeAbs: prev != null ? Number((current - prev).toFixed(4)) : undefined,
    changePct: prev && prev !== 0 ? Number((((current - prev) / prev) * 100).toFixed(2)) : undefined,
    series: seriesValues.map((value, index) => ({ ...deriveSeries(current, prev != null ? current - prev : undefined, seriesValues.length)[index], value })),
    confidence: seriesValues.length >= 6 ? "HIGH" : "MED",
    notes: [
      "Parsed from IMF primary commodity prices monthly table",
      `extraction_mode:${extractionMode}`,
    ],
  } satisfies GrainWidgetImfCommodityBenchmarkRow;
}

function parseRowsFromStructuredText(text: string, extractionMode: string): GrainWidgetImfCommodityBenchmarkRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return TARGETS.flatMap((target) => {
    const index = lines.findIndex((line) => target.aliases.some((alias) => line.toLowerCase() === alias.toLowerCase()));
    if (index < 0) return [];
    const numericWindow = lines
      .slice(index + 1, index + 18)
      .map((line) => parseNumber(line))
      .filter((value): value is number => value != null)
      .filter((value) => value >= 10 && value <= 10000)
      .slice(0, 8);
    if (numericWindow.length < 3) return [];
    return [buildImfRow(target, numericWindow, extractionMode)];
  });
}

function parseRowsFromLooseText(text: string, extractionMode: string): GrainWidgetImfCommodityBenchmarkRow[] {
  return TARGETS.flatMap((target) => {
    const normalized = text.replace(/\s+/g, " ");
    const indices = target.aliases
      .map((alias) => normalized.toLowerCase().indexOf(alias.toLowerCase()))
      .filter((value) => value >= 0);
    const index = indices[0];
    if (index == null) return [];
    const window = normalized.slice(index, index + 900);
    const numbers = (window.match(/-?\d+(?:\.\d+)?/g) || [])
      .map((value) => Number.parseFloat(value))
      .filter(Number.isFinite)
      .filter((value) => value >= 10 && value <= 10000)
      .slice(0, 8);
    if (numbers.length < 3) return [];
    return [buildImfRow(target, numbers, extractionMode)];
  });
}

function extractPdfReadableText(buffer: Buffer): string {
  const latin = buffer.toString("latin1");
  const chunks = latin.match(/\((?:\\.|[^()]){2,400}\)/g) || [];
  const textParts = chunks
    .map((chunk) =>
      chunk
        .slice(1, -1)
        .replace(/\\\)/g, ")")
        .replace(/\\\(/g, "(")
        .replace(/\\n/g, " ")
        .replace(/\\r/g, " ")
        .replace(/\\t/g, " "),
    )
    .filter((chunk) => /wheat|maize|corn|soybean|sunflower|rapeseed/i.test(chunk) || /\d{2,4}(?:\.\d+)?/.test(chunk));
  return textParts.join("\n");
}

function extractPdfTextFromFlateStreams(buffer: Buffer): string {
  const source = buffer.toString("latin1");
  const streams = [...source.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)];
  const parts: string[] = [];
  for (const match of streams) {
    const raw = match[1];
    if (!raw) continue;
    try {
      const inflated = inflateSync(Buffer.from(raw, "latin1")).toString("latin1");
      const textParts = (inflated.match(/\((?:\\.|[^()]){1,400}\)/g) || [])
        .map((chunk) =>
          chunk
            .slice(1, -1)
            .replace(/\\\)/g, ")")
            .replace(/\\\(/g, "(")
            .replace(/\\n/g, " ")
            .replace(/\\r/g, " ")
            .replace(/\\t/g, " "),
        )
        .filter((chunk) => /wheat|maize|corn|soybean|sunflower|rapeseed|\d{2,4}(?:\.\d+)?/i.test(chunk));
      if (textParts.length) parts.push(textParts.join("\n"));
    } catch {
      continue;
    }
  }
  return parts.join("\n");
}

function extractAsciiRuns(buffer: Buffer): string {
  const matches = buffer
    .toString("latin1")
    .match(/[A-Za-z0-9$%.,:/()'"\- ]{3,}/g) || [];
  return matches
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length >= 3)
    .join("\n");
}

function resolveImfTableUrl($: cheerio.CheerioAPI): string {
  const hrefs = $("a[href]")
    .map((_, el) => String($(el).attr("href") || "").trim())
    .get();
  const pdfHref = hrefs.find((href) => /table2\.pdf/i.test(href));
  if (!pdfHref) return IMF_PCPS_TABLE2_URL;
  return new URL(pdfHref, IMF_PCPS_PAGE_URL).toString();
}

export class ImfPcpsProvider implements GrainWidgetsProvider {
  id = "imf-pcps";
  kind = "IMF_COMMODITY_BENCHMARKS" as const;
  enabled = ENABLE_IMF_PCPS_WIDGET;
  private readonly fallback = new MockGrainWidgetsProvider({ kind: "IMF_COMMODITY_BENCHMARKS" as any });

  async getWidget(ctx: GrainWidgetsProviderContext): Promise<GrainWidgetImfCommodityBenchmarks> {
    const now = Date.now();
    if (cacheEntry && now - cacheEntry.fetchedAt <= IMF_PCPS_CACHE_TTL_MS) {
      return { ...cacheEntry.widget, updatedAt: ctx.now.toISOString(), notes: [...(cacheEntry.widget.notes || []), "cache_hit"] };
    }

    const page = await fetchTextResponseWithTimeout(IMF_PCPS_PAGE_URL, IMF_PCPS_TIMEOUT_MS, { accept: "text/html,application/xhtml+xml,*/*" });
    const $ = cheerio.load(page.text);
    const updatedText = $.text().match(/Updated\s*:?\s*[A-Za-z]+\s+\d{1,2},\s*\d{4}|Updated:\s*[A-Za-z]+\s+\d{4}/i)?.[0];
    const discoveredLinks = $("a[href]")
      .map((_, el) => String($(el).attr("href") || "").trim())
      .get()
      .filter((href) => /table2\.pdf|table3\.pdf|external-data\.xls/i.test(href))
      .map((href) => new URL(href, IMF_PCPS_PAGE_URL).toString());
    const tableUrl = resolveImfTableUrl($);
    const tableBinary = await fetchBufferWithTimeout(tableUrl, IMF_PCPS_TIMEOUT_MS, { accept: "application/pdf,text/plain,*/*" });
    const extractedText = [
      extractPdfTextFromFlateStreams(tableBinary.buffer),
      extractPdfReadableText(tableBinary.buffer),
    ].filter(Boolean).join("\n");
    let extractionMode = "pdf_flate_stream";
    let rows = parseRowsFromStructuredText(extractedText, extractionMode)
      .concat(parseRowsFromLooseText(extractedText, extractionMode))
      .filter((row, index, all) => all.findIndex((candidate) => candidate.commodity === row.commodity) === index);
    if (!rows.length) {
      const workbookUrl = discoveredLinks.find((href) => /external-data\.xls/i.test(href));
      if (workbookUrl) {
        const workbookBinary = await fetchBufferWithTimeout(workbookUrl, IMF_PCPS_TIMEOUT_MS, {
          accept: "application/vnd.ms-excel,application/octet-stream,*/*",
        });
        const workbookText = extractAsciiRuns(workbookBinary.buffer);
        extractionMode = "xls_ascii";
        rows = parseRowsFromStructuredText(workbookText, extractionMode)
          .concat(parseRowsFromLooseText(workbookText, extractionMode))
          .filter((row, index, all) => all.findIndex((candidate) => candidate.commodity === row.commodity) === index);
      }
    }
    if (!rows.length) {
      throw makeProviderError("imf_pcps_rows_empty", {
        errorKind: "EMPTY",
        finalUrl: tableBinary.finalUrl,
        contentType: tableBinary.contentType,
      });
    }

    const widget: GrainWidgetImfCommodityBenchmarks = {
      id: "grain-imf-commodity-benchmarks",
      kind: "IMF_COMMODITY_BENCHMARKS",
      title: "IMF Commodity Benchmarks",
      subtitle: "Primary commodity price system",
      status: rows.length >= 3 ? "REFRESH" : "INDICATIVE",
      sourceName: "IMF",
      sourceAttribution: "Data: IMF primary commodity prices",
      sourceUrl: redactSensitiveUrl(tableUrl),
      updatedAt: ctx.now.toISOString(),
      timeframe: ctx.timeframe,
      territoryScope: "GLOBAL",
      territory: { code: "GLOBAL", label: "Global" },
      rows,
      summary: {
        expectedCount: 4,
        mappedCount: rows.length,
        coverage: `${rows.length}/4`,
        cadence: "monthly",
      },
      notes: [
        updatedText || "Monthly IMF commodity benchmarks",
        "Parsed from IMF Table 2 PDF text layer",
        "Benchmark layer; units kept explicit and conservative",
      ],
      debug: {
        sourceUrlUsed: redactSensitiveUrl(tableBinary.finalUrl || tableUrl),
        rowsParsed: rows.length,
        warnings: [
          `content_type:${tableBinary.contentType || "unknown"}`,
          `extraction_mode:${extractionMode}`,
          ...(discoveredLinks.length ? [`discovered_links:${discoveredLinks.join(" | ")}`] : []),
          ...(rows.some((row) => row.confidence !== "HIGH") ? ["some_rows_not_high_confidence"] : []),
        ],
      },
    };
    cacheEntry = { fetchedAt: now, widget };
    return widget;
  }

  mockFallback(reason: string, ctx: GrainWidgetsProviderContext) {
    return this.fallback.mockFallback(reason, ctx) as any;
  }
}
