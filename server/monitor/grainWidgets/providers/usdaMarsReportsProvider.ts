import {
  ENABLE_USDA_MARS_REPORTS_WIDGET,
  USDA_MARS_BASE_URL,
  USDA_MARS_EXCLUDE_KEYWORDS,
  USDA_MARS_GRAIN_WIDGET_LIMIT,
  USDA_MARS_INCLUDE_KEYWORDS,
  USDA_MARS_REPORTS_LIMIT,
  USDA_MARS_TIMEOUT_MS,
} from "../config";
import type { GrainWidgetUsdaMarsReportItem, GrainWidgetUsdaMarsReports } from "../types";
import type { GrainWidgetsProvider, GrainWidgetsProviderContext } from "./types";
import { MockGrainWidgetsProvider } from "./mockGrainWidgetsProvider";
import { fetchTextWithTimeout } from "./utils";

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
  if (t.includes("PDF")) return "PDF";
  if (t.includes("TXT") || t.includes("TEXT")) return "TXT";
  if (t.includes("HTML") || t.includes("HTM")) return "HTML";
  return "OTHER";
}

function categoryFromTitle(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("export") && t.includes("bid")) return "Export bids";
  if (t.includes("market") && t.includes("rate")) return "Market rates";
  if (t.includes("portland") || t.includes("louisiana") || t.includes("texas")) return "Regional bids";
  if (t.includes("bid")) return "Grain bids";
  return "Grain market report";
}

function scoreRelevance(title: string, include: string[], exclude: string[]): number {
  const t = title.toLowerCase();
  if (!t) return 0;
  if (exclude.some((keyword) => t.includes(keyword))) return -100;
  let score = 0;
  for (const keyword of include) {
    if (t.includes(keyword)) score += 2;
  }
  if (t.includes("grain")) score += 3;
  if (t.includes("corn") || t.includes("wheat") || t.includes("soy")) score += 2;
  return score;
}

async function fetchReports(base: string): Promise<{ rows: MarsRaw[]; sourceUrl: string }> {
  const urls = [
    `${base}/listPublishedReports?format=json`,
    `${base}/reports/listPublishedReports?format=json`,
  ];

  for (const sourceUrl of urls) {
    try {
      const text = await fetchTextWithTimeout(sourceUrl, USDA_MARS_TIMEOUT_MS);
      const payload = JSON.parse(text);
      const rows = flatten(payload);
      if (rows.length) {
        return { rows, sourceUrl };
      }
    } catch {
      // try next URL
    }
  }

  throw new Error("usda_mars_reports_unavailable");
}

export class UsdaMarsReportsProvider implements GrainWidgetsProvider {
  id = "usda-mars-public";
  kind = "USDA_MARS_REPORTS" as const;
  enabled = ENABLE_USDA_MARS_REPORTS_WIDGET;
  private readonly fallback = new MockGrainWidgetsProvider({ kind: "USDA_MARS_REPORTS" });

  async getWidget(ctx: GrainWidgetsProviderContext): Promise<GrainWidgetUsdaMarsReports> {
    const { rows, sourceUrl } = await fetchReports(USDA_MARS_BASE_URL);

    const sliced = rows.slice(0, Math.max(USDA_MARS_REPORTS_LIMIT, USDA_MARS_GRAIN_WIDGET_LIMIT));
    const mapped = sliced
      .map((row, index) => {
        const title = String(row.title || row.reportTitle || row.report_name || "").trim();
        const reportId = String(row.reportId || row.id || row.slug || "").trim();
        const source = String(row.reportURL || row.reportUrl || row.url || "").trim() || sourceUrl;
        const publishedAt = parseDate(row.publishedAt || row.publishDate || row.releaseDate);
        const reportDate = parseDate(row.reportDate);
        const fileType = normalizeType(row.fileType || row.file_type || row.reportType);
        const category = row.category || categoryFromTitle(title);
        const relevance = scoreRelevance(title, USDA_MARS_INCLUDE_KEYWORDS, USDA_MARS_EXCLUDE_KEYWORDS);
        return {
          id: reportId || `mars-${index + 1}`,
          title,
          reportId,
          sourceUrl: source,
          publishedAt,
          reportDate,
          fileType,
          category,
          relevance,
        };
      })
      .filter((item) => item.title)
      .sort((a, b) => b.relevance - a.relevance);

    const matched = mapped.filter((item) => item.relevance > 0);
    const reports: GrainWidgetUsdaMarsReportItem[] = matched
      .slice(0, USDA_MARS_GRAIN_WIDGET_LIMIT)
      .map((item) => ({
        id: item.id,
        title: item.title,
        reportId: item.reportId || undefined,
        sourceUrl: item.sourceUrl,
        publishedAt: item.publishedAt,
        reportDate: item.reportDate,
        fileType: item.fileType,
        category: item.category,
      }));

    const categoryCounts = reports.reduce<Record<string, number>>((acc, report) => {
      const label = report.category || "Other";
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {});

    return {
      id: "grain-usda-mars-reports",
      kind: "USDA_MARS_REPORTS",
      title: "USDA MARS Grain Reports",
      subtitle: "Metadata-driven report flow (no PDF/TXT parsing)",
      status: reports.length >= 4 ? "REFRESH" : reports.length > 0 ? "INDICATIVE" : "OFFLINE",
      sourceName: "USDA AMS MARS API",
      sourceAttribution: "Data: USDA AMS MARS (public)",
      sourceUrl,
      updatedAt: ctx.now.toISOString(),
      timeframe: ctx.timeframe,
      reports,
      summary: {
        fetchedCount: rows.length,
        matchedCount: matched.length,
        shownCount: reports.length,
        categories: Object.entries(categoryCounts).map(([label, count]) => ({ label, count })),
      },
      notes: [
        `keywords include: ${USDA_MARS_INCLUDE_KEYWORDS.join(", ")}`,
        `keywords exclude: ${USDA_MARS_EXCLUDE_KEYWORDS.join(", ")}`,
      ],
      fallbackReason: reports.length ? undefined : "coverage_empty",
    };
  }

  mockFallback(reason: string, ctx: GrainWidgetsProviderContext): GrainWidgetUsdaMarsReports {
    return this.fallback.mockFallback(reason, ctx) as GrainWidgetUsdaMarsReports;
  }
}
