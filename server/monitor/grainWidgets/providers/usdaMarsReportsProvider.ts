import {
  ENABLE_USDA_MARS_REPORTS_WIDGET,
  USDA_MARS_BASE_URL,
  USDA_MARS_EXCLUDE_KEYWORDS,
  USDA_MARS_GRAIN_WIDGET_LIMIT,
  USDA_MARS_INCLUDE_KEYWORDS,
  USDA_MARS_MAX_REPORTS_SCAN,
  USDA_MARS_PUBLISHED_LIST_PATHS,
  USDA_MARS_REPORTS_LIMIT,
  USDA_MARS_TIMEOUT_MS,
} from "../config";
import type { GrainWidgetUsdaMarsReportItem, GrainWidgetUsdaMarsReports } from "../types";
import type { GrainWidgetsProvider, GrainWidgetsProviderContext } from "./types";
import { MockGrainWidgetsProvider } from "./mockGrainWidgetsProvider";

type MarsRaw = {
  id?: string | number;
  reportId?: string | number;
  slug?: string;
  title?: string;
  reportTitle?: string;
  report_name?: string;
  commodity?: string;
  category?: string;
  reportType?: string;
  publishedAt?: string;
  publishDate?: string;
  reportDate?: string;
  releaseDate?: string;
  fileType?: string;
  file_type?: string;
  reportURL?: string;
  reportUrl?: string;
  url?: string;
};

type RankedReport = {
  id: string;
  title: string;
  titleNorm: string;
  reportId?: string;
  sourceUrl: string;
  publishedAt?: string;
  reportDate?: string;
  fileType: GrainWidgetUsdaMarsReportItem["fileType"];
  category: string;
  score: number;
  excluded: boolean;
  tags: NonNullable<GrainWidgetUsdaMarsReportItem["tags"]>;
};

const INCLUDE_PATTERNS: RegExp[] = [
  /\bgrain\b.*\bbids?\b/,
  /\bdaily\b.*\bgrain\b.*\bbids?\b/,
  /\bexport\b.*\bbids?\b/,
  /\bgulf\b.*\b(export|bids?)\b/,
  /\bport\b.*\bgrain\b/,
  /\bmarket\b.*\brates?\b/,
  /\bcash\b.*\bbids?\b/,
  /\bfeed\b/,
  /\bsoy\s*meal\b/,
  /\bddgs\b/,
  /\bwheat\b|\bcorn\b|\bsoy\b|\bsorghum\b|\bbarley\b|\boats\b|\bcanola\b|\brapeseed\b|\bsunflower\b/,
];

const EXCLUDE_PATTERNS: RegExp[] = [
  /\bfruits?\b|\bvegetables?\b|\bproduce\b/,
  /\bdairy\b|\bmilk\b|\bcheese\b/,
  /\blivestock\b|\bauction\b|\bcattle\b|\bhogs?\b/,
  /\beggs?\b|\bpoultry\b|\bchicken\b|\bturkey\b/,
  /\bhay\b|\balfalfa\b/,
  /\bornamental\b|\bflowers?\b/,
  /\bretail\b|\bconsumer\b/,
];

const CROP_KEYWORDS = [
  "wheat",
  "corn",
  "soy",
  "sorghum",
  "barley",
  "oats",
  "canola",
  "rapeseed",
  "sunflower",
] as const;

function toBase(url: string): string {
  return url.replace(/\/+$/, "");
}

function joinUrl(base: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${toBase(base)}/${path.replace(/^\/+/, "")}`;
}

function flatten(payload: any): MarsRaw[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.listPublishedReportsResult)) return payload.listPublishedReportsResult;
  return [];
}

function parseDate(value?: string): string | undefined {
  if (!value) return undefined;
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return undefined;
  return new Date(ts).toISOString();
}

function normalizeType(value?: string): GrainWidgetUsdaMarsReportItem["fileType"] {
  const t = String(value || "").trim().toUpperCase();
  if (t.includes("TXT") || t.includes("TEXT")) return "TXT";
  if (t.includes("PDF")) return "PDF";
  if (t.includes("HTML") || t.includes("HTM")) return "HTML";
  return "OTHER";
}

export function normalizeTitle(title: string): string {
  return String(title || "")
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()"'[\]\\|?<>+]/g, " ")
    .replace(/\bsoybeans?\b/g, "soy")
    .replace(/\bmaize\b/g, "corn")
    .replace(/\brapeseed\b|\bcanola\b/g, "canola rapeseed")
    .replace(/\s+/g, " ")
    .trim();
}

function deriveRegionTag(titleNorm: string): string {
  if (/\bgulf\b|\blouisiana\b|\btexas\b|\bnew orleans\b/.test(titleNorm)) return "US Gulf";
  if (/\bportland\b|\bpnw\b|\bpacific northwest\b|\bwashington\b|\boregon\b/.test(titleNorm)) return "US PNW";
  if (/\bmississippi\b|\billinois\b|\biowa\b|\bnebraska\b|\bkansas\b|\bdakota\b|\bminnesota\b|\bindiana\b|\bohio\b/.test(titleNorm)) return "US Midwest";
  if (/\bcalifornia\b/.test(titleNorm)) return "US West";
  return "US / Other";
}

function deriveTypeTag(titleNorm: string): string {
  if (/\bexport\b.*\bbids?\b/.test(titleNorm)) return "Export";
  if (/\bgrain\b.*\bbids?\b|\bcash\b.*\bbids?\b/.test(titleNorm)) return "Cash Bids";
  if (/\bmarket\b.*\brates?\b/.test(titleNorm)) return "Market Rates";
  if (/\bfeed\b|\bmeal\b|\bddgs\b/.test(titleNorm)) return "Feed";
  return "Report";
}

function deriveCropTags(titleNorm: string): string[] {
  const tags = CROP_KEYWORDS.filter((crop) => new RegExp(`\\b${crop}\\b`).test(titleNorm));
  return [...tags];
}

function categoryFromType(typeTag: string): string {
  if (typeTag === "Export") return "Export bids";
  if (typeTag === "Cash Bids") return "Grain bids";
  if (typeTag === "Market Rates") return "Market rates";
  if (typeTag === "Feed") return "Feed tie-in";
  return "Grain market report";
}

function scoreReport(args: { titleNorm: string; fileType: GrainWidgetUsdaMarsReportItem["fileType"] }): number {
  const { titleNorm, fileType } = args;
  const isExcluded = EXCLUDE_PATTERNS.some((pattern) => pattern.test(titleNorm));
  let score = 0;

  if (/\bexport\b.*\bbids?\b|\bgulf\b|\bpnw\b|\blouisiana\b|\btexas\b/.test(titleNorm)) score += 6;
  if (/\bdaily\b.*\bgrain\b.*\bbids?\b|\bdaily\b.*\bmarket\b.*\brates?\b/.test(titleNorm)) score += 5;
  if (/\bgrain\b.*\bbids?\b|\bcash\b.*\bbids?\b/.test(titleNorm)) score += 4;
  if (/\bwheat\b|\bcorn\b|\bsoy\b|\bcanola\b|\brapeseed\b/.test(titleNorm)) score += 3;
  if (fileType === "TXT") score += 2;
  if (fileType === "PDF") score += 1;
  if (isExcluded) score -= 5;
  if (!/\b(grain|market|bids?|export|corn|wheat|soy|sorghum|barley|oats|canola|rapeseed|sunflower|feed|meal|ddgs)\b/.test(titleNorm)) {
    score -= 2;
  }

  return score;
}

function matchesInclude(titleNorm: string): boolean {
  if (INCLUDE_PATTERNS.some((pattern) => pattern.test(titleNorm))) return true;
  return USDA_MARS_INCLUDE_KEYWORDS.some((keyword) => titleNorm.includes(keyword));
}

function matchesExclude(titleNorm: string): boolean {
  if (EXCLUDE_PATTERNS.some((pattern) => pattern.test(titleNorm))) return true;
  return USDA_MARS_EXCLUDE_KEYWORDS.some((keyword) => titleNorm.includes(keyword));
}

function classifyFetchError(error: unknown): string {
  const message = String((error as { message?: string })?.message || "");
  const upper = message.toUpperCase();
  if (upper.includes("ENOTFOUND")) return "DNS";
  if (upper.includes("ETIMEDOUT") || upper.includes("ABORT_ERR") || message.toLowerCase().includes("timed out")) return "TIMEOUT";
  const http = message.match(/HTTP\s+(\d{3})/i);
  if (http) {
    const code = Number.parseInt(http[1], 10);
    if (code >= 400 && code < 500) return "HTTP_4XX";
    if (code >= 500) return "HTTP_5XX";
  }
  if (message.toLowerCase().includes("parse")) return "PARSE";
  if (message.toLowerCase().includes("empty")) return "EMPTY";
  return "UNKNOWN";
}

async function fetchTextWithStatus(url: string, timeoutMs: number): Promise<{ status: number; text: string }> {
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
    return { status: response.status, text };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchReports(base: string): Promise<{ rows: MarsRaw[]; sourceUrl: string }> {
  const urls = USDA_MARS_PUBLISHED_LIST_PATHS.map((path) => joinUrl(base, path));
  let lastError: Error | null = null;

  for (const sourceUrl of urls) {
    try {
      const { text } = await fetchTextWithStatus(sourceUrl, USDA_MARS_TIMEOUT_MS);
      const payload = JSON.parse(text);
      const rows = flatten(payload);
      if (rows.length) {
        return { rows, sourceUrl };
      }
      lastError = new Error(`empty_data:${sourceUrl}`);
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error || "fetch_failed"));
    }
  }

  const errorKind = classifyFetchError(lastError);
  throw new Error(`usda_mars_reports_unavailable:${errorKind}:${lastError?.message || "fetch_failed"}`);
}

export class UsdaMarsReportsProvider implements GrainWidgetsProvider {
  id = "usda-mars-public";
  kind = "USDA_MARS_REPORTS" as const;
  enabled = ENABLE_USDA_MARS_REPORTS_WIDGET;
  private readonly fallback = new MockGrainWidgetsProvider({ kind: "USDA_MARS_REPORTS" });

  async getWidget(ctx: GrainWidgetsProviderContext): Promise<GrainWidgetUsdaMarsReports> {
    const { rows, sourceUrl } = await fetchReports(USDA_MARS_BASE_URL);
    const fetchLimit = Math.max(USDA_MARS_REPORTS_LIMIT, USDA_MARS_GRAIN_WIDGET_LIMIT);
    const scanLimit = Math.max(fetchLimit, USDA_MARS_MAX_REPORTS_SCAN);
    const sliced = rows.slice(0, scanLimit);

    const ranked: RankedReport[] = sliced
      .map((row, index) => {
        const title = String(row.title || row.reportTitle || row.report_name || "").trim();
        const titleNorm = normalizeTitle(title);
        const reportId = String(row.reportId || row.id || row.slug || "").trim() || undefined;
        const resolvedUrl = String(row.reportURL || row.reportUrl || row.url || "").trim() || sourceUrl;
        const fileType = normalizeType(row.fileType || row.file_type || row.reportType);
        const typeTag = deriveTypeTag(titleNorm);
        const excluded = matchesExclude(titleNorm);
        const score = scoreReport({ titleNorm, fileType });
        return {
          id: reportId || `mars-${index + 1}`,
          title,
          titleNorm,
          reportId,
          sourceUrl: resolvedUrl,
          publishedAt: parseDate(row.publishedAt || row.publishDate || row.releaseDate),
          reportDate: parseDate(row.reportDate),
          fileType,
          category: row.category || categoryFromType(typeTag),
          score,
          excluded,
          tags: {
            region: deriveRegionTag(titleNorm),
            type: typeTag,
            crops: deriveCropTags(titleNorm),
          },
        } satisfies RankedReport;
      })
      .filter((item) => item.title);

    const reportsExcluded = ranked.filter((item) => item.excluded).length;
    const includeMatched = ranked.filter((item) => !item.excluded && matchesInclude(item.titleNorm));
    const sorted = includeMatched
      .slice()
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const aTs = a.publishedAt ? Date.parse(a.publishedAt) : 0;
        const bTs = b.publishedAt ? Date.parse(b.publishedAt) : 0;
        return bTs - aTs;
      });

    const topReports = sorted.slice(0, USDA_MARS_GRAIN_WIDGET_LIMIT);
    const moreReportsCount = Math.max(0, sorted.length - topReports.length);
    const topScores = topReports.map((item) => item.score);

    const reports: GrainWidgetUsdaMarsReportItem[] = topReports.map((item) => ({
      id: item.id,
      title: item.title,
      reportId: item.reportId,
      sourceUrl: item.sourceUrl,
      publishedAt: item.publishedAt,
      reportDate: item.reportDate,
      fileType: item.fileType,
      category: item.category,
      score: item.score,
      tags: item.tags,
    }));

    const categoryCounts = reports.reduce<Record<string, number>>((acc, report) => {
      const label = report.category || "Other";
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {});

    const baseNote = "Filtered by grain/export/bids keywords; metadata-only.";
    const status = reports.length > 0 ? "REFRESH" : "INDICATIVE";

    return {
      id: "grain-usda-mars-reports",
      kind: "USDA_MARS_REPORTS",
      title: "USDA MARS Grain Reports",
      subtitle: "US cash/export context (metadata-only, no PDF/TXT parsing)",
      status,
      sourceName: "USDA AMS MARS API",
      sourceAttribution: "Data: USDA AMS MARS (public)",
      sourceUrl,
      updatedAt: ctx.now.toISOString(),
      timeframe: ctx.timeframe,
      reports,
      summary: {
        fetchedCount: rows.length,
        scannedCount: sliced.length,
        matchedCount: includeMatched.length,
        excludedCount: reportsExcluded,
        shownCount: reports.length,
        reportsReturnedTop: reports.length,
        moreReportsCount,
        topScoreMin: topScores.length ? Math.min(...topScores) : undefined,
        topScoreMax: topScores.length ? Math.max(...topScores) : undefined,
        categories: Object.entries(categoryCounts).map(([label, count]) => ({ label, count })),
      },
      notes: reports.length
        ? [baseNote]
        : [baseNote, "no_matching_reports"],
      fallbackReason: reports.length ? undefined : "no_matching_reports",
    };
  }

  mockFallback(reason: string, ctx: GrainWidgetsProviderContext): GrainWidgetUsdaMarsReports {
    return this.fallback.mockFallback(reason, ctx) as GrainWidgetUsdaMarsReports;
  }
}
