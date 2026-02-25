import {
  ENABLE_US_CASH_EXPORT_CONTEXT_WIDGET,
  US_CASH_EXPORT_CONTEXT_MAX_REPORTS_SCAN,
  US_CASH_EXPORT_CONTEXT_TOP_N,
} from "../config";
import type {
  GrainWidget,
  GrainWidgetGlobalSpotTable,
  GrainWidgetCropPriceIndex,
  GrainWidgetUsCashExportContext,
  GrainWidgetUsdaMarsReports,
} from "../types";
import type { GrainWidgetsProvider, GrainWidgetsProviderContext } from "./types";
import { DbNomicsSpotProvider } from "./dbNomicsSpotProvider";
import { FaoFfpiProvider } from "./faoFfpiProvider";
import { MockGrainWidgetsProvider } from "./mockGrainWidgetsProvider";
import { UsdaMarsReportsProvider } from "./usdaMarsReportsProvider";

function reportMatchesDailyBids(report: GrainWidgetUsdaMarsReports["reports"][number]): boolean {
  const type = String(report.tags?.type || "").toLowerCase();
  const title = String(report.title || "").toLowerCase();
  return type.includes("cash bids") || /\bdaily\b.*\bgrain\b.*\bbids?\b/.test(title) || /\bcash\b.*\bbids?\b/.test(title);
}

function reportMatchesExport(report: GrainWidgetUsdaMarsReports["reports"][number]): boolean {
  const type = String(report.tags?.type || "").toLowerCase();
  const region = String(report.tags?.region || "").toLowerCase();
  const title = String(report.title || "").toLowerCase();
  return type.includes("export") || title.includes("export bids") || region.includes("gulf") || region.includes("pnw");
}

function reportMatchesMarketRates(report: GrainWidgetUsdaMarsReports["reports"][number]): boolean {
  const type = String(report.tags?.type || "").toLowerCase();
  const title = String(report.title || "").toLowerCase();
  return type.includes("market rates") || /\bmarket\b.*\brates?\b/.test(title);
}

function reportsTodayCount(reports: GrainWidgetUsdaMarsReports["reports"], now: Date): number {
  const yyyyMmDd = now.toISOString().slice(0, 10);
  return reports.filter((report) => (report.publishedAt || "").slice(0, 10) === yyyyMmDd).length;
}

function sortReports(reports: GrainWidgetUsdaMarsReports["reports"]) {
  return reports.slice().sort((a, b) => {
    const aTs = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const bTs = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return bTs - aTs;
  });
}

function detectCadenceHints(args: {
  mars?: GrainWidgetUsdaMarsReports;
  spot?: GrainWidgetGlobalSpotTable;
  index?: GrainWidgetCropPriceIndex;
}): string[] {
  const hints = new Set<string>();
  const marsTitles = (args.mars?.reports || []).map((report) => report.title.toLowerCase());
  if (marsTitles.some((title) => title.includes("daily"))) hints.add("Daily");
  if (marsTitles.some((title) => title.includes("weekly"))) hints.add("Weekly");
  const spotNotes = (args.spot?.notes || []).join(" ").toLowerCase();
  if (spotNotes.includes("annual")) hints.add("Annual");
  if (spotNotes.includes("monthly")) hints.add("Monthly");
  const indexSubtitle = String(args.index?.subtitle || "").toLowerCase();
  if (indexSubtitle.includes("monthly")) hints.add("Monthly");
  if (hints.size === 0) hints.add("Mixed cadence");
  return Array.from(hints);
}

function asSpot(widget?: GrainWidget): GrainWidgetGlobalSpotTable | undefined {
  return widget?.kind === "GLOBAL_SPOT_TABLE" ? widget : undefined;
}

function asIndex(widget?: GrainWidget): GrainWidgetCropPriceIndex | undefined {
  return widget?.kind === "CROP_PRICE_INDEX" ? widget : undefined;
}

function asMars(widget?: GrainWidget): GrainWidgetUsdaMarsReports | undefined {
  return widget?.kind === "USDA_MARS_REPORTS" ? widget : undefined;
}

export class UsCashExportContextProvider implements GrainWidgetsProvider {
  id = "us-cash-export-context";
  kind = "US_CASH_EXPORT_CONTEXT" as const;
  enabled = ENABLE_US_CASH_EXPORT_CONTEXT_WIDGET;
  private readonly fallback = new MockGrainWidgetsProvider({ kind: "US_CASH_EXPORT_CONTEXT" });
  private readonly marsProvider = new UsdaMarsReportsProvider();
  private readonly spotProvider = new DbNomicsSpotProvider();
  private readonly indexProvider = new FaoFfpiProvider();

  async getWidget(ctx: GrainWidgetsProviderContext): Promise<GrainWidgetUsCashExportContext> {
    const fromCacheMars = asMars(ctx.getCachedWidget?.("USDA_MARS_REPORTS"));
    let mars = fromCacheMars;
    let marsError: string | undefined;

    if (!mars || mars.reports.length === 0 || mars.status === "OFFLINE") {
      try {
        mars = await this.marsProvider.getWidget(ctx);
      } catch (error: any) {
        marsError = error?.message || "mars_fetch_failed";
      }
    }

    if (mars && mars.reports.length > 0) {
      const ranked = sortReports(mars.reports).slice(0, Math.max(US_CASH_EXPORT_CONTEXT_MAX_REPORTS_SCAN, US_CASH_EXPORT_CONTEXT_TOP_N));
      const top = ranked.slice(0, US_CASH_EXPORT_CONTEXT_TOP_N);
      const regions = Array.from(new Set(top.map((report) => report.tags?.region).filter(Boolean) as string[]));

      return {
        id: "grain-us-cash-export-context",
        kind: "US_CASH_EXPORT_CONTEXT",
        title: "US Cash / Export Context (USDA)",
        subtitle: "Metadata-only: daily bids & export indications",
        status: "REFRESH",
        sourceName: "USDA AMS MARS API",
        sourceAttribution: "Data: USDA AMS MARS (public)",
        sourceUrl: mars.sourceUrl,
        updatedAt: ctx.now.toISOString(),
        timeframe: ctx.timeframe,
        summary: {
          exportIndications: top.some((report) => reportMatchesExport(report)),
          dailyBids: top.some((report) => reportMatchesDailyBids(report)),
          marketRates: top.some((report) => reportMatchesMarketRates(report)),
          reportsToday: reportsTodayCount(ranked, ctx.now),
          regions,
          cadenceHints: detectCadenceHints({ mars }),
        },
        topReports: top.map((report) => ({
          id: report.id,
          title: report.title,
          publishedAt: report.publishedAt,
          fileType: report.fileType,
          regionTag: report.tags?.region,
          typeTag: report.tags?.type,
          url: report.sourceUrl || mars?.sourceUrl,
        })),
        notes: ["Derived from USDA MARS metadata only (no PDF/TXT parsing)"],
      };
    }

    const cachedSpot = asSpot(ctx.getCachedWidget?.("GLOBAL_SPOT_TABLE"));
    const cachedIndex = asIndex(ctx.getCachedWidget?.("CROP_PRICE_INDEX"));
    let spot = cachedSpot;
    let index = cachedIndex;
    let anchorErrors: string[] = [];

    if (!spot || !spot.rows?.length) {
      try {
        spot = await this.spotProvider.getWidget(ctx);
      } catch (error: any) {
        anchorErrors.push(`spot:${error?.message || "fetch_failed"}`);
      }
    }
    if (!index || !index.cards?.length) {
      try {
        index = await this.indexProvider.getWidget(ctx);
      } catch (error: any) {
        anchorErrors.push(`index:${error?.message || "fetch_failed"}`);
      }
    }

    const spotRows = spot?.rows || [];
    const indexCards = index?.cards || [];
    const hasAnchors = spotRows.length >= 2 || indexCards.length >= 2;
    if (hasAnchors) {
      const regions = Array.from(new Set(spotRows.map((row) => row.region).filter(Boolean) as string[])).slice(0, 3);
      return {
        id: "grain-us-cash-export-context",
        kind: "US_CASH_EXPORT_CONTEXT",
        title: "US Cash / Export Context (USDA)",
        subtitle: "Open-data anchor mode (MARS unavailable)",
        status: "INDICATIVE",
        sourceName: "Open Data (DBnomics + FAO)",
        sourceAttribution: "Data: DBnomics + FAO",
        sourceUrl: spot?.sourceUrl || index?.sourceUrl,
        updatedAt: ctx.now.toISOString(),
        timeframe: ctx.timeframe,
        summary: {
          exportIndications: false,
          dailyBids: false,
          marketRates: false,
          reportsToday: 0,
          regions: regions.length ? regions : ["Global"],
          cadenceHints: detectCadenceHints({ spot, index }),
        },
        topReports: [],
        notes: [
          "USDA MARS unavailable; using open-data benchmark anchors",
          ...(marsError ? [`mars_error:${marsError}`] : []),
          ...anchorErrors.slice(0, 2),
        ],
        fallbackReason: "mars_unavailable_anchor_mode",
      };
    }

    throw new Error(marsError || anchorErrors[0] || "coverage_empty");
  }

  mockFallback(reason: string, ctx: GrainWidgetsProviderContext): GrainWidgetUsCashExportContext {
    return this.fallback.mockFallback(reason, ctx) as GrainWidgetUsCashExportContext;
  }
}
