import {
  ENABLE_USDA_MARS_DAILY_TXT,
  USDA_MARS_BASE_URL,
  USDA_MARS_DAILY_MAX_ROWS,
  USDA_MARS_DAILY_REPORT_ID,
  USDA_MARS_FILE_URL_TEMPLATES,
  USDA_MARS_MNREPORTS_BASE_URL,
  USDA_MARS_PUBLISHED_LIST_PATHS,
  USDA_MARS_TIMEOUT_MS,
} from "../config";
import type { GrainWidgetUsdaMarsDailyMarketRatesTxt, GrainWidgetUsdaMarsDailyMarketRatesTxtRow } from "../types";
import type { GrainWidgetsProvider, GrainWidgetsProviderContext } from "./types";
import { MockGrainWidgetsProvider } from "./mockGrainWidgetsProvider";
import { normalizeGrainPriceToUsdTon } from "../../grainMarkets/normalization";

type MarsPublishedReport = {
  id?: number | string;
  reportId?: number | string;
  fileName?: string;
  fileExtension?: string;
  extension?: string;
  file_type?: string;
  fileType?: string;
  publishedDate?: string;
  publishDate?: string;
  releaseDate?: string;
  reportTitle?: string;
  title?: string;
  reportURL?: string;
  reportUrl?: string;
  url?: string;
};

type ParsedLine = {
  row: GrainWidgetUsdaMarsDailyMarketRatesTxtRow;
  section?: string;
  warning?: string;
};

function toBase(url: string): string {
  return url.replace(/\/+$/, "");
}

function joinUrl(base: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${toBase(base)}/${path.replace(/^\/+/, "")}`;
}

function parseDateIso(value?: string): string | undefined {
  if (!value) return undefined;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? new Date(ts).toISOString() : undefined;
}

function flattenReports(payload: any): MarsPublishedReport[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.listPublishedReportsResult)) return payload.listPublishedReportsResult;
  return [];
}

function normalizeSection(line: string): string | undefined {
  const t = line.toUpperCase();
  if (/\bWHEAT\b/.test(t)) return "WHEAT";
  if (/\bCORN\b|\bMAIZE\b/.test(t)) return "CORN";
  if (/\bSOY\b|\bSOYBEAN\b/.test(t)) return "SOY";
  if (/\bEXPORT\b|\bGULF\b|\bPNW\b/.test(t)) return "EXPORT";
  if (/\bMARKET RATES?\b/.test(t)) return "MARKET_RATES";
  return undefined;
}

function marketFromText(text: string): string | undefined {
  const t = text.toLowerCase();
  if (/\bgulf\b|\blouisiana\b|\btexas\b|\bnew orleans\b/.test(t)) return "US Gulf";
  if (/\bpnw\b|\bportland\b|\bpacific northwest\b|\boregon\b|\bwashington\b/.test(t)) return "US PNW";
  if (/\bmidwest\b|\billinois\b|\biowa\b|\bnebraska\b|\bkansas\b|\bminnesota\b|\bindiana\b|\bohio\b/.test(t)) return "US Midwest";
  return undefined;
}

function commodityFromText(text: string, section?: string): { commodity: GrainWidgetUsdaMarsDailyMarketRatesTxtRow["commodity"]; fromLine: boolean } {
  const t = text.toLowerCase();
  if (/\bwheat\b|\bhrw\b|\bsrw\b/.test(t)) return { commodity: "WHEAT", fromLine: true };
  if (/\bcorn\b|\bmaize\b/.test(t)) return { commodity: "CORN", fromLine: true };
  if (/\bsoy\b|\bsoybean\b/.test(t)) return { commodity: "SOY", fromLine: true };
  if (section === "WHEAT") return { commodity: "WHEAT", fromLine: false };
  if (section === "CORN") return { commodity: "CORN", fromLine: false };
  if (section === "SOY") return { commodity: "SOY", fromLine: false };
  return { commodity: "OTHER", fromLine: false };
}

function parseRangeOrValue(raw: string): { value?: number; warning?: string } {
  const cleaned = raw.replace(/\$/g, "").trim();
  const rangeMatch = cleaned.match(/^(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)$/);
  if (rangeMatch) {
    const left = Number.parseFloat(rangeMatch[1]);
    const right = Number.parseFloat(rangeMatch[2]);
    if (Number.isFinite(left) && Number.isFinite(right)) {
      return { value: Number(((left + right) / 2).toFixed(4)), warning: "range_midpoint_used" };
    }
  }
  const single = Number.parseFloat(cleaned);
  return Number.isFinite(single) ? { value: single } : {};
}

function normalizeUnit(raw: string): { unit: string; nativeUnitType: "CENTS_PER_BUSHEL" | "USD_PER_BUSHEL" | "USD_PER_TON" | "UNKNOWN" } {
  const t = raw.toLowerCase().replace(/\s+/g, "");
  if (t === "c/bu" || t === "cents/bu" || t === "cent/bu" || t === "cbu") return { unit: "c/bu", nativeUnitType: "CENTS_PER_BUSHEL" };
  if (t === "$/bu" || t === "usd/bu") return { unit: "USD/bu", nativeUnitType: "USD_PER_BUSHEL" };
  if (t === "$/t" || t === "usd/t") return { unit: "USD/t", nativeUnitType: "USD_PER_TON" };
  return { unit: raw, nativeUnitType: "UNKNOWN" };
}

function cropHintFromCommodity(commodity: GrainWidgetUsdaMarsDailyMarketRatesTxtRow["commodity"]): "corn" | "wheat" | "soybeans" | undefined {
  if (commodity === "CORN") return "corn";
  if (commodity === "WHEAT") return "wheat";
  if (commodity === "SOY") return "soybeans";
  return undefined;
}

function parseLine(line: string, section?: string): ParsedLine | undefined {
  const cleaned = line.trim().replace(/\s+/g, " ");
  if (!cleaned) return undefined;
  if (/^[-=_]{3,}$/.test(cleaned)) return undefined;
  if (/^(daily market rates?|report|page|for release)/i.test(cleaned)) return undefined;

  const valueWithUnit = cleaned.match(/(?<label>.+?)\s+(?<value>\$?-?\d+(?:\.\d+)?(?:\s*-\s*\$?-?\d+(?:\.\d+)?)?)\s+(?<unit>c\/bu|cents\/bu|cent\/bu|cbu|usd\/bu|\$\/bu|usd\/t|\$\/t)\b/i);
  if (!valueWithUnit?.groups) return undefined;

  const label = valueWithUnit.groups.label.trim();
  const parsedValue = parseRangeOrValue(valueWithUnit.groups.value);
  if (parsedValue.value == null) return undefined;
  const unitInfo = normalizeUnit(valueWithUnit.groups.unit);
  const commodityInfo = commodityFromText(`${label} ${cleaned}`, section);
  const explicitUnit = unitInfo.nativeUnitType !== "UNKNOWN";
  const confidence: GrainWidgetUsdaMarsDailyMarketRatesTxtRow["confidence"] =
    commodityInfo.fromLine && explicitUnit ? "HIGH" : !commodityInfo.fromLine && explicitUnit ? "MED" : "LOW";
  if (confidence === "LOW") return undefined;

  const tail = cleaned.slice((valueWithUnit.index || 0) + valueWithUnit[0].length);
  const absMatch = tail.match(/([+-]?\d+(?:\.\d+)?)(?!.*\d)/);
  const pctMatch = tail.match(/([+-]?\d+(?:\.\d+)?)\s*%/);
  const nativeAbs = absMatch ? Number.parseFloat(absMatch[1]) : undefined;
  const nativePct = pctMatch ? Number.parseFloat(pctMatch[1]) : undefined;

  let normalizedValueCurrent: number | undefined;
  const crop = cropHintFromCommodity(commodityInfo.commodity);
  if (crop && unitInfo.nativeUnitType !== "UNKNOWN") {
    const normalized = normalizeGrainPriceToUsdTon({
      quote: {
        valueCurrent: parsedValue.value,
        currency: "USD",
        unit: unitInfo.unit,
        nativeUnitType: unitInfo.nativeUnitType,
        crop,
      },
      fx: {},
    });
    normalizedValueCurrent = normalized.normalized?.valueCurrent;
  }

  return {
    row: {
      commodity: commodityInfo.commodity,
      market: marketFromText(cleaned) || marketFromText(section || ""),
      label,
      price: {
        nativeValueCurrent: parsedValue.value,
        nativeUnit: unitInfo.unit,
        normalizedValueCurrent,
        normalizedUnit: normalizedValueCurrent != null ? "USD/t" : undefined,
      },
      change: {
        nativeAbs: Number.isFinite(nativeAbs as number) ? nativeAbs : undefined,
        nativePct: Number.isFinite(nativePct as number) ? nativePct : undefined,
      },
      confidence,
    },
    section,
    warning: parsedValue.warning,
  };
}

function applyTemplate(urlTemplate: string, fileName: string, ext: string): string {
  return urlTemplate
    .replaceAll("{fileName}", encodeURIComponent(fileName))
    .replaceAll("{ext}", encodeURIComponent(ext));
}

function reportExtension(report: MarsPublishedReport): string {
  return String(report.fileExtension || report.extension || report.file_type || report.fileType || "").trim().toLowerCase();
}

function reportFileName(report: MarsPublishedReport): string {
  return String(report.fileName || "").trim().replace(/\.(txt|pdf|html?)$/i, "");
}

async function fetchTextResponse(url: string, timeoutMs: number): Promise<{ text: string; contentType: string | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "CroptoMonitor/1.1 (+https://cropto.abvx.xyz)",
        accept: "application/json,text/plain,*/*",
      },
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { text, contentType: response.headers.get("content-type") };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPublishedReports(base: string): Promise<{ rows: MarsPublishedReport[]; sourceUrlUsed: string }> {
  const urls = USDA_MARS_PUBLISHED_LIST_PATHS.map((path) => joinUrl(base, path));
  let lastError: string | undefined;
  for (const sourceUrlUsed of urls) {
    try {
      const response = await fetchTextResponse(sourceUrlUsed, USDA_MARS_TIMEOUT_MS);
      const payload = JSON.parse(response.text);
      const rows = flattenReports(payload);
      if (rows.length) return { rows, sourceUrlUsed };
      lastError = `empty_data:${sourceUrlUsed}`;
    } catch (error: any) {
      lastError = error?.message || "fetch_failed";
    }
  }
  throw new Error(`usda_mars_published_list_failed:${lastError || "fetch_failed"}`);
}

function findDailyReport(rows: MarsPublishedReport[]): MarsPublishedReport | undefined {
  return rows.find((report) => {
    const idValue = String(report.id ?? report.reportId ?? "").trim();
    return idValue === String(USDA_MARS_DAILY_REPORT_ID);
  });
}

function buildDownloadCandidates(report: MarsPublishedReport, ext: string): string[] {
  const fileName = reportFileName(report);
  const direct = [
    String(report.reportURL || "").trim(),
    String(report.reportUrl || "").trim(),
    String(report.url || "").trim(),
    `${toBase(USDA_MARS_MNREPORTS_BASE_URL)}/${encodeURIComponent(fileName)}.${encodeURIComponent(ext)}`,
    ...USDA_MARS_FILE_URL_TEMPLATES.map((template) => applyTemplate(template, fileName, ext)),
  ].filter(Boolean);
  return Array.from(new Set(direct));
}

export class UsdaMarsDailyMarketRatesTxtProvider implements GrainWidgetsProvider {
  id = "usda-mars-daily-txt";
  kind = "USDA_MARS_DAILY_MARKET_RATES_TXT" as const;
  enabled = ENABLE_USDA_MARS_DAILY_TXT;
  private readonly fallback = new MockGrainWidgetsProvider({ kind: "USDA_MARS_DAILY_MARKET_RATES_TXT" });

  async getWidget(ctx: GrainWidgetsProviderContext): Promise<GrainWidgetUsdaMarsDailyMarketRatesTxt> {
    const { rows, sourceUrlUsed: metadataSourceUrl } = await fetchPublishedReports(USDA_MARS_BASE_URL);
    const dailyReport = findDailyReport(rows);
    if (!dailyReport) {
      return {
        id: "grain-usda-mars-daily-market-rates-txt",
        kind: "USDA_MARS_DAILY_MARKET_RATES_TXT",
        title: "US Daily Market Rates (TXT)",
        subtitle: "USDA AMS MARS (metadata + TXT parse)",
        status: "INDICATIVE",
        sourceName: "USDA AMS MARS",
        sourceAttribution: "USDA MARS Daily Market Rates (TXT)",
        sourceUrl: metadataSourceUrl,
        updatedAt: ctx.now.toISOString(),
        timeframe: ctx.timeframe,
        report: {
          reportId: USDA_MARS_DAILY_REPORT_ID,
          fileType: "txt",
          sourceUrl: metadataSourceUrl,
        },
        rows: [],
        notes: ["daily_report_not_in_list", "metadata_source:listPublishedReports"],
        debug: {
          linesFetched: 0,
          linesMatched: 0,
          parseMode: "strict",
          reportsFetched: rows.length,
          metadataSourceUrl,
          dailyReportFound: false,
          warnings: ["daily_report_not_in_list"],
        },
      };
    }

    const fileName = reportFileName(dailyReport);
    const ext = reportExtension(dailyReport) || "txt";
    if (!fileName) {
      return {
        id: "grain-usda-mars-daily-market-rates-txt",
        kind: "USDA_MARS_DAILY_MARKET_RATES_TXT",
        title: "US Daily Market Rates (TXT)",
        subtitle: "USDA AMS MARS (metadata + TXT parse)",
        status: "INDICATIVE",
        sourceName: "USDA AMS MARS",
        sourceAttribution: "USDA MARS Daily Market Rates (TXT)",
        sourceUrl: metadataSourceUrl,
        updatedAt: ctx.now.toISOString(),
        timeframe: ctx.timeframe,
        report: {
          reportId: Number(dailyReport.id || dailyReport.reportId || USDA_MARS_DAILY_REPORT_ID),
          publishedAt: parseDateIso(String(dailyReport.publishedDate || dailyReport.publishDate || dailyReport.releaseDate || "")),
          fileType: "txt",
          sourceUrl: metadataSourceUrl,
        },
        rows: [],
        notes: ["daily_report_filename_missing", "metadata_source:listPublishedReports"],
        debug: {
          linesFetched: 0,
          linesMatched: 0,
          parseMode: "strict",
          reportsFetched: rows.length,
          metadataSourceUrl,
          dailyReportFound: true,
          warnings: ["daily_report_filename_missing"],
        },
      };
    }

    if (ext !== "txt" && ext !== "text") {
      return {
        id: "grain-usda-mars-daily-market-rates-txt",
        kind: "USDA_MARS_DAILY_MARKET_RATES_TXT",
        title: "US Daily Market Rates (TXT)",
        subtitle: "USDA AMS MARS (metadata + TXT parse)",
        status: "INDICATIVE",
        sourceName: "USDA AMS MARS",
        sourceAttribution: "USDA MARS Daily Market Rates (TXT)",
        sourceUrl: metadataSourceUrl,
        updatedAt: ctx.now.toISOString(),
        timeframe: ctx.timeframe,
        report: {
          reportId: Number(dailyReport.id || dailyReport.reportId || USDA_MARS_DAILY_REPORT_ID),
          publishedAt: parseDateIso(String(dailyReport.publishedDate || dailyReport.publishDate || dailyReport.releaseDate || "")),
          fileName,
          fileType: "txt",
          sourceUrl: metadataSourceUrl,
        },
        rows: [],
        notes: [`expected_txt_missing:${ext}`],
        debug: {
          linesFetched: 0,
          linesMatched: 0,
          parseMode: "strict",
          reportsFetched: rows.length,
          metadataSourceUrl,
          dailyReportFound: true,
          warnings: [`expected_txt_missing:${ext}`],
        },
      };
    }

    const downloadCandidates = buildDownloadCandidates(dailyReport, ext === "text" ? "txt" : ext);
    let txtContent = "";
    let downloadUrlUsed: string | undefined;
    let lastDownloadError = "";

    for (const url of downloadCandidates) {
      try {
        const response = await fetchTextResponse(url, USDA_MARS_TIMEOUT_MS);
        const looksText = (response.contentType || "").includes("text") || response.text.includes("\n");
        if (!looksText) throw new Error("non_text_payload");
        txtContent = response.text;
        downloadUrlUsed = url;
        break;
      } catch (error: any) {
        lastDownloadError = error?.message || "download_failed";
      }
    }

    if (!txtContent) {
      throw new Error(`usda_mars_daily_txt_download_failed:${lastDownloadError || "no_url_succeeded"}`);
    }

    const lines = txtContent
      .replace(/\r/g, "")
      .split("\n")
      .map((line) => line.trimEnd());
    let section: string | undefined;
    const matchedSections = new Set<string>();
    const warnings: string[] = [];
    const parsedRows: GrainWidgetUsdaMarsDailyMarketRatesTxtRow[] = [];

    for (const line of lines) {
      const nextSection = normalizeSection(line);
      if (nextSection) section = nextSection;
      const parsed = parseLine(line, section);
      if (!parsed) continue;
      if (parsed.section) matchedSections.add(parsed.section);
      if (parsed.warning) warnings.push(`${parsed.row.label}:${parsed.warning}`);
      parsedRows.push(parsed.row);
      if (parsedRows.length >= USDA_MARS_DAILY_MAX_ROWS) break;
    }

    const highMedRows = parsedRows.filter((row) => row.confidence === "HIGH" || row.confidence === "MED");
    const notes: string[] = [
      "TXT-only strict parse; PDF/TXT body parsing is limited to confident numeric rows.",
      `metadata_source:${metadataSourceUrl}`,
      ...(downloadUrlUsed ? [`download_url:${downloadUrlUsed}`] : []),
    ];
    if (warnings.length) notes.push(`warnings:${warnings.slice(0, 2).join(" | ")}`);

    return {
      id: "grain-usda-mars-daily-market-rates-txt",
      kind: "USDA_MARS_DAILY_MARKET_RATES_TXT",
      title: "US Daily Market Rates (TXT)",
      subtitle: "USDA AMS MARS (metadata + TXT parse)",
      status: highMedRows.length > 0 ? "REFRESH" : "INDICATIVE",
      sourceName: "USDA AMS MARS",
      sourceAttribution: "USDA MARS Daily Market Rates (TXT)",
      sourceUrl: metadataSourceUrl,
      updatedAt: ctx.now.toISOString(),
      timeframe: ctx.timeframe,
      report: {
        reportId: Number(dailyReport.id || dailyReport.reportId || USDA_MARS_DAILY_REPORT_ID),
        publishedAt: parseDateIso(String(dailyReport.publishedDate || dailyReport.publishDate || dailyReport.releaseDate || "")),
        fileName,
        fileType: "txt",
        sourceUrl: downloadUrlUsed || metadataSourceUrl,
      },
      rows: highMedRows,
      notes,
      debug: {
        linesFetched: lines.length,
        linesMatched: highMedRows.length,
        parseMode: "strict",
        reportsFetched: rows.length,
        metadataSourceUrl,
        downloadUrlUsed,
        dailyReportFound: true,
        matchedSections: Array.from(matchedSections),
        warnings: warnings.slice(0, 5),
      },
      fallbackReason: highMedRows.length > 0 ? undefined : "coverage_empty",
    };
  }

  mockFallback(reason: string, ctx: GrainWidgetsProviderContext): GrainWidgetUsdaMarsDailyMarketRatesTxt {
    return this.fallback.mockFallback(reason, ctx) as GrainWidgetUsdaMarsDailyMarketRatesTxt;
  }
}
