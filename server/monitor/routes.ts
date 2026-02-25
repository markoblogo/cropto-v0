import type { Express } from "express";
import { lookup } from "node:dns/promises";
import { latestFxSnapshot } from "../ingestion/storage/fxRepository";
import {
  MONITOR_FEATURE_FLAGS,
  MONITOR_RELEVANCE_THRESHOLD,
  MONITOR_RELEVANCE_THRESHOLD_MAX,
  MONITOR_RELEVANCE_THRESHOLD_MIN,
  MONITOR_SOURCES,
} from "./config";
import {
  DBNOMICS_API_BASE_URL,
  ENABLE_DBNOMICS_SPOT_PROVIDER,
  ENABLE_FAO_FFPI_PROVIDER,
  ENABLE_US_CASH_EXPORT_CONTEXT_WIDGET,
  ENABLE_USDA_MARS_REPORTS_WIDGET,
  FAO_FFPI_URL,
  GRAIN_WIDGETS_CACHE_TTL_MS,
  GRAIN_WIDGETS_FETCH_TIMEOUT_MS,
  USDA_MARS_BASE_URL,
} from "./grainWidgets/config";
import { CroptoUkraineIndexProvider } from "./indexProvider";
import { getLiveVisualTiles } from "./liveVisuals";
import { GrainMarketsService } from "./grainMarkets";
import { GrainWidgetsService } from "./grainWidgets";
import { LogisticsIndicatorsService } from "./logisticsIndicators";
import { filterMonitorNews, getMonitorNews, topSignals } from "./newsService";

const indexProvider = new CroptoUkraineIndexProvider();
const logisticsIndicatorsService = new LogisticsIndicatorsService();
const grainMarketsService = new GrainMarketsService();
const grainWidgetsService = new GrainWidgetsService();

function topEntries(record: Record<string, number>, limit = 5) {
  return Object.entries(record)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([sourceId, count]) => ({ sourceId, count }));
}

type ActivationErrorKind =
  | "DNS"
  | "TIMEOUT"
  | "HTTP_4XX"
  | "HTTP_5XX"
  | "PARSE_ERROR"
  | "EMPTY_DATA"
  | "BLOCKED"
  | "UNKNOWN";

function classifyErrorKind(args: { message?: string; code?: string; httpStatus?: number }): ActivationErrorKind {
  const message = String(args.message || "").toLowerCase();
  const code = String(args.code || "").toUpperCase();
  const status = args.httpStatus;
  if (code === "ENOTFOUND" || message.includes("enotfound") || message.includes("could not resolve host")) return "DNS";
  if (code === "ETIMEDOUT" || code === "ABORT_ERR" || message.includes("timed out") || message.includes("aborted")) return "TIMEOUT";
  if (status != null && status >= 400 && status < 500) return "HTTP_4XX";
  if (status != null && status >= 500) return "HTTP_5XX";
  if (message.includes("parse")) return "PARSE_ERROR";
  if (message.includes("empty") || message.includes("coverage_empty")) return "EMPTY_DATA";
  if (status === 403 || message.includes("forbidden") || message.includes("blocked")) return "BLOCKED";
  return "UNKNOWN";
}

function normalizeProviderError(error?: string) {
  if (!error) return undefined;
  const statusMatch = error.match(/HTTP\s+(\d{3})/i);
  const httpStatus = statusMatch ? Number.parseInt(statusMatch[1], 10) : undefined;
  const codeMatch = error.match(/\b(ENOTFOUND|ETIMEDOUT|ABORT_ERR)\b/i);
  const code = codeMatch?.[1]?.toUpperCase();
  return {
    name: "ProviderError",
    code,
    message: error,
    httpStatus,
    errorKind: classifyErrorKind({ message: error, code, httpStatus }),
  };
}

async function probeUrl(url: string): Promise<{
  url: string;
  ok: boolean;
  httpStatus?: number;
  resolvedIp?: string;
  elapsedMs: number;
  errorKind?: ActivationErrorKind;
  errorMessage?: string;
}> {
  const started = Date.now();
  const parsed = new URL(url);
  let resolvedIp: string | undefined;
  try {
    const dns = await lookup(parsed.hostname);
    resolvedIp = dns.address;
  } catch {
    resolvedIp = undefined;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    let response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      headers: {
        accept: "application/json,text/csv,text/plain,*/*",
        "user-agent": "CroptoMonitor/activation-report",
      },
    });
    if (response.status === 405 || response.status === 501) {
      response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: {
          accept: "application/json,text/csv,text/plain,*/*",
          "user-agent": "CroptoMonitor/activation-report",
        },
      });
    }
    clearTimeout(timeout);
    return {
      url,
      ok: response.ok,
      httpStatus: response.status,
      resolvedIp,
      elapsedMs: Date.now() - started,
      errorKind: response.ok ? undefined : classifyErrorKind({ httpStatus: response.status }),
      errorMessage: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error: any) {
    clearTimeout(timeout);
    const code = String(error?.cause?.code || error?.code || "");
    const message = String(error?.message || "probe_failed");
    return {
      url,
      ok: false,
      resolvedIp,
      elapsedMs: Date.now() - started,
      errorKind: classifyErrorKind({ message, code }),
      errorMessage: message,
    };
  }
}

export function registerMonitorRoutes(app: Express): void {
  logisticsIndicatorsService.start();
  grainMarketsService.start();
  grainWidgetsService.start();

  function resolveThreshold(raw?: string): number {
    const parsed = Number.parseInt(raw || "", 10);
    if (!Number.isFinite(parsed)) return MONITOR_RELEVANCE_THRESHOLD;
    return Math.min(MONITOR_RELEVANCE_THRESHOLD_MAX, Math.max(MONITOR_RELEVANCE_THRESHOLD_MIN, parsed));
  }

  app.get("/api/monitor/config", (_req, res) => {
    res.json({
      flags: MONITOR_FEATURE_FLAGS,
      relevanceThreshold: {
        default: MONITOR_RELEVANCE_THRESHOLD,
        min: MONITOR_RELEVANCE_THRESHOLD_MIN,
        max: MONITOR_RELEVANCE_THRESHOLD_MAX,
      },
      sources: {
        total: MONITOR_SOURCES.length,
        enabled: MONITOR_SOURCES.filter((source) => source.enabled).length,
      },
    });
  });

  app.get("/api/monitor/news", async (req, res) => {
    try {
      const threshold = resolveThreshold(typeof req.query.threshold === "string" ? req.query.threshold : undefined);
      const { items, stats } = await getMonitorNews(req.query.refresh === "1", { threshold });
      const filtered = filterMonitorNews(items, {
        crop: typeof req.query.crop === "string" ? req.query.crop : undefined,
        topic: typeof req.query.topic === "string" ? req.query.topic : undefined,
        region: typeof req.query.region === "string" ? req.query.region : undefined,
        time: req.query.time === "24h" ? "24h" : "7d",
        search: typeof req.query.search === "string" ? req.query.search : undefined,
      });

      const top = topSignals(filtered, 10);
      const logistics = filtered
        .filter((item) => item.category === "logistics-shipping" || item.topic_tags.includes("logistics"))
        .slice(0, 8);
      const policy = filtered
        .filter((item) => item.category === "policy-macro" || item.topic_tags.includes("policy") || item.topic_tags.includes("trade"))
        .slice(0, 8);

      res.json({
        generatedAt: stats.generatedAt,
        filters: {
          crop: req.query.crop || "all",
          topic: req.query.topic || "all",
          region: req.query.region || "all",
          time: req.query.time === "24h" ? "24h" : "7d",
          threshold,
        },
        stats,
        topSignals: top,
        feed: filtered,
        sidePanels: {
          logistics,
          policy,
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Failed to load monitor news" });
    }
  });

  app.get("/api/monitor/indices", async (_req, res) => {
    if (!MONITOR_FEATURE_FLAGS.ENABLE_CROPTO_INDICES) {
      return res.json({ enabled: false, items: [], note: "Disabled by feature flag" });
    }

    try {
      const items = await indexProvider.listIndexes();
      return res.json({ enabled: true, items });
    } catch (error: any) {
      return res.status(500).json({ enabled: true, items: [], message: error?.message || "Failed to load indices" });
    }
  });

  app.get("/api/monitor/macro-fx", async (_req, res) => {
    if (!MONITOR_FEATURE_FLAGS.ENABLE_MACRO_WIDGETS) {
      return res.json({ enabled: false, mode: "coming_soon", message: "Macro widgets disabled" });
    }

    try {
      const fx = await latestFxSnapshot();
      const currencies = ["EUR", "UAH", "BRL", "ARS"];
      const rates = currencies
        .map((currency) => ({ currency, usdPerUnit: fx.usdPerUnit[currency] ?? null }))
        .filter((item) => item.usdPerUnit != null);

      if (rates.length === 0) {
        return res.json({
          enabled: true,
          mode: "coming_soon",
          message: "FX snapshot is not available yet",
          rates: [],
        });
      }

      return res.json({
        enabled: true,
        mode: "live",
        asOf: fx.asOf,
        source: "fx_rates",
        rates,
      });
    } catch {
      return res.json({
        enabled: true,
        mode: "coming_soon",
        message: "FX snapshot temporarily unavailable",
        rates: [],
      });
    }
  });

  app.get("/api/monitor/live-visuals", (_req, res) => {
    res.json(getLiveVisualTiles());
  });

  app.get("/api/monitor/logistics-indicators", async (_req, res) => {
    if (!MONITOR_FEATURE_FLAGS.ENABLE_LOGISTICS_INDICATORS) {
      return res.json({
        enabled: false,
        widgets: [],
        meta: { generatedAt: new Date().toISOString() },
        message: "Logistics indicators disabled",
      });
    }

    try {
      const payload = await logisticsIndicatorsService.list();
      return res.json({
        enabled: true,
        ...payload,
      });
    } catch (error: any) {
      return res.status(500).json({
        enabled: true,
        widgets: [],
        meta: { generatedAt: new Date().toISOString(), partialFailure: true },
        message: error?.message || "Failed to load logistics indicators",
      });
    }
  });

  app.get("/api/monitor/grain-markets", async (_req, res) => {
    if (!MONITOR_FEATURE_FLAGS.ENABLE_GRAIN_MARKETS_CORE) {
      return res.json({
        enabled: false,
        widgets: { cbot: [], euronext: [], comparisons: [] },
        meta: {
          generatedAt: new Date().toISOString(),
          partialFailure: false,
          timeframe: "1d",
          instrumentsRequested: [],
          instrumentsReturned: [],
        },
        message: "Grain markets core disabled",
      });
    }

    try {
      const payload = await grainMarketsService.list();
      return res.json({
        enabled: true,
        ...payload,
      });
    } catch (error: any) {
      return res.status(500).json({
        enabled: true,
        widgets: { cbot: [], euronext: [], comparisons: [] },
        meta: {
          generatedAt: new Date().toISOString(),
          partialFailure: true,
          timeframe: "1d",
          instrumentsRequested: [],
          instrumentsReturned: [],
        },
        message: error?.message || "Failed to load grain markets core",
      });
    }
  });

  app.get("/api/monitor/grain-widgets", async (_req, res) => {
    if (!MONITOR_FEATURE_FLAGS.ENABLE_GRAIN_WIDGETS_EXPANSION) {
      return res.json({
        enabled: false,
        widgets: { byKind: {}, order: [] },
        meta: {
          generatedAt: new Date().toISOString(),
          partialFailure: false,
          timeframe: "1d",
          enabledWidgetKinds: [],
          returnedWidgetKinds: [],
        },
        message: "Grain widgets expansion disabled",
      });
    }

    try {
      const payload = await grainWidgetsService.list();
      return res.json({
        enabled: true,
        ...payload,
      });
    } catch (error: any) {
      return res.status(500).json({
        enabled: true,
        widgets: { byKind: {}, order: [] },
        meta: {
          generatedAt: new Date().toISOString(),
          partialFailure: true,
          timeframe: "1d",
          enabledWidgetKinds: [],
          returnedWidgetKinds: [],
        },
        message: error?.message || "Failed to load grain widgets",
      });
    }
  });

  app.get("/api/monitor/debug", async (_req, res) => {
    if (!MONITOR_FEATURE_FLAGS.ENABLE_DEBUG_DASHBOARD) {
      return res.status(404).json({ message: "Debug dashboard disabled" });
    }

    const { stats } = await getMonitorNews(false);
    const liveVisuals = getLiveVisualTiles();
    res.json({
      generatedAt: stats.generatedAt,
      sourcesTotal: stats.sourceCount,
      sourcesEnabled: stats.enabledSourceCount,
      itemsFetchedLast24h: stats.fetchedItems,
      itemsAfterFiltering: stats.acceptedItems,
      duplicatesRemoved: stats.duplicatesDropped,
      topSourcesByRelevantItems: topEntries(stats.sourceAcceptedCounts, 8),
      noisySources: topEntries(stats.sourceNoiseCounts, 8),
      sourceErrors: stats.sourceErrors,
      liveVisuals: liveVisuals.summary,
      logisticsIndicators: logisticsIndicatorsService.debugSummary(),
      grainMarkets: grainMarketsService.debugSummary(),
      grainWidgets: grainWidgetsService.debugSummary(),
    });
  });

  app.get("/api/monitor/activation-report", async (_req, res) => {
    try {
      const nowIso = new Date().toISOString();
      const grainWidgets = await grainWidgetsService.list();
      const grainWidgetsDebug = grainWidgetsService.debugSummary();
      const byKind = grainWidgets.widgets.byKind || {};
      const providers = grainWidgetsDebug.providers || [];

      const providerToKind: Record<string, "GLOBAL_SPOT_TABLE" | "CROP_PRICE_INDEX" | "USDA_MARS_REPORTS" | "US_CASH_EXPORT_CONTEXT"> = {
        "dbnomics-worldbank": "GLOBAL_SPOT_TABLE",
        "fao-ffpi": "CROP_PRICE_INDEX",
        "usda-mars-public": "USDA_MARS_REPORTS",
        "us-cash-export-context": "US_CASH_EXPORT_CONTEXT",
      };

      const sourceMatchesProvider = (sourceName?: string, providerId?: string) => {
        const source = String(sourceName || "").toLowerCase();
        const id = String(providerId || "").toLowerCase();
        if (id.includes("dbnomics")) return source.includes("dbnomics");
        if (id.includes("fao")) return source.includes("fao");
        if (id.includes("usda")) return source.includes("usda");
        if (id.includes("us-cash-export-context")) return source.includes("usda") || source.includes("open data");
        return false;
      };

      const expectedCoverage: Record<string, number> = {
        "dbnomics-worldbank": 4,
        "fao-ffpi": 3,
        "usda-mars-public": 6,
        "us-cash-export-context": 3,
      };

      const providerReport = ["dbnomics-worldbank", "fao-ffpi", "usda-mars-public", "us-cash-export-context"].map((providerId) => {
        const provider = providers.find((item) => item.providerId === providerId);
        const kind = providerToKind[providerId];
        const widget = byKind[kind] as any;
        const providerError = normalizeProviderError(provider?.error);
        const status = widget && sourceMatchesProvider(widget.sourceName, providerId)
          ? widget.status
          : provider?.status === "ok"
            ? "REFRESH"
            : provider?.status === "partial"
              ? "FALLBACK"
              : "OFFLINE";

        return {
          providerId,
          enabled: Boolean(provider?.enabled),
          status,
          sourceUrlUsed: provider?.sourceUrlUsed || widget?.sourceUrl,
          expectedCount: provider?.expectedCount ?? expectedCoverage[providerId],
          mappedCount: provider?.mappedCount ?? 0,
          coverage: provider?.coverage || `${provider?.mappedCount ?? 0}/${provider?.expectedCount ?? expectedCoverage[providerId]}`,
          reportsFetched: provider?.reportsFetched,
          reportsScanned: provider?.reportsScanned,
          reportsMatchedInclude: provider?.reportsMatchedInclude,
          reportsExcluded: provider?.reportsExcluded,
          reportsReturnedTop: provider?.reportsReturnedTop,
          topScoreMin: provider?.topScoreMin,
          topScoreMax: provider?.topScoreMax,
          lastFetchAt: provider?.lastSuccessAt || provider?.lastAttemptAt,
          cacheHit: Boolean(provider?.cacheHit),
          fallbackChainUsed: provider?.fallbackChain || "real->cache->mock",
          lastError: providerError,
          notes: provider?.notes,
        };
      });

      const hasSparklineEligibleSeries = (widget: any): boolean => {
        if (!widget) return false;
        const rowSeries = (widget.rows || []).flatMap((row: any) => row?.price?.series || []);
        const cardSeries = (widget.cards || []).flatMap((card: any) => card?.series || []);
        const itemSeries = (widget.items || []).flatMap((item: any) => item?.series || []);
        const allSeriesGroups = [rowSeries, cardSeries, itemSeries]
          .filter((series) => Array.isArray(series) && series.length > 0);
        return allSeriesGroups.some((series) => {
          const values = series
            .map((point: any) => point?.value)
            .filter((value: any) => typeof value === "number" && Number.isFinite(value));
          if (values.length < 3) return false;
          return Math.max(...values) - Math.min(...values) > 1e-8;
        });
      };

      const widgetSnapshot = ([
        "GLOBAL_SPOT_TABLE",
        "CROP_PRICE_INDEX",
        "USDA_MARS_REPORTS",
        "US_CASH_EXPORT_CONTEXT",
      ] as const).map((widgetKind) => {
        const widget = byKind[widgetKind] as any;
        const rowsCount = Array.isArray(widget?.rows) ? widget.rows.length : 0;
        const itemsCount = Array.isArray(widget?.items) ? widget.items.length : 0;
        const cardsCount = Array.isArray(widget?.cards) ? widget.cards.length : 0;
        const reportsCount = Array.isArray(widget?.reports) ? widget.reports.length : 0;
        const topReportsCount = Array.isArray(widget?.topReports) ? widget.topReports.length : 0;
        const seriesPointsCount =
          (Array.isArray(widget?.rows) ? widget.rows.flatMap((row: any) => row?.price?.series || []).length : 0) +
          (Array.isArray(widget?.items) ? widget.items.flatMap((item: any) => item?.series || []).length : 0) +
          (Array.isArray(widget?.cards) ? widget.cards.flatMap((card: any) => card?.series || []).length : 0);
        return {
          widgetKind,
          widgetStatus: widget?.status || "OFFLINE",
          sourceName: widget?.sourceName,
          sourceAttribution: widget?.sourceAttribution,
          updatedAt: widget?.updatedAt,
          rowsCount,
          itemsCount,
          cardsCount,
          reportsCount,
          topReportsCount,
          reportsToday: widget?.kind === "US_CASH_EXPORT_CONTEXT" ? widget?.summary?.reportsToday ?? 0 : undefined,
          exportIndications: widget?.kind === "US_CASH_EXPORT_CONTEXT" ? Boolean(widget?.summary?.exportIndications) : undefined,
          notes: (widget?.notes || []).slice(0, 4),
          seriesPointsCount,
          hasSparklineEligibleSeries: hasSparklineEligibleSeries(widget),
        };
      });

      const [dbnomicsProbe, faoProbe, marsProbe] = await Promise.all([
        probeUrl(`${DBNOMICS_API_BASE_URL}/series/WB/commodity_prices/FMAIZE.1W?observations=true`),
        probeUrl(FAO_FFPI_URL),
        probeUrl(`${USDA_MARS_BASE_URL}/listPublishedReports?format=json`),
      ]);

      res.json({
        runtime: {
          timestamp: nowIso,
          appVersion: process.env.APP_VERSION || process.env.npm_package_version || "unknown",
          commit:
            process.env.RAILWAY_GIT_COMMIT_SHA ||
            process.env.RAILWAY_GIT_COMMIT ||
            process.env.VERCEL_GIT_COMMIT_SHA ||
            process.env.COMMIT_SHA ||
            "unknown",
          env: {
            ENABLE_GRAIN_WIDGETS_EXPANSION: MONITOR_FEATURE_FLAGS.ENABLE_GRAIN_WIDGETS_EXPANSION,
            ENABLE_DBNOMICS_SPOT_PROVIDER,
            ENABLE_FAO_FFPI_PROVIDER,
            ENABLE_USDA_MARS_REPORTS_WIDGET,
            ENABLE_US_CASH_EXPORT_CONTEXT_WIDGET,
            DBNOMICS_API_BASE_URL: DBNOMICS_API_BASE_URL ? "present" : "missing",
            FAO_FFPI_URL: FAO_FFPI_URL ? "present" : "missing",
            USDA_MARS_BASE_URL: USDA_MARS_BASE_URL ? "present" : "missing",
            GRAIN_WIDGETS_FETCH_TIMEOUT_MS,
            GRAIN_WIDGETS_CACHE_TTL_MS,
          },
        },
        providers: providerReport,
        widgets: widgetSnapshot,
        networkProbe: {
          dbnomics: dbnomicsProbe,
          faoFfpi: faoProbe,
          usdaMars: marsProbe,
        },
      });
    } catch (error: any) {
      res.status(200).json({
        runtime: {
          timestamp: new Date().toISOString(),
          appVersion: process.env.APP_VERSION || process.env.npm_package_version || "unknown",
          commit:
            process.env.RAILWAY_GIT_COMMIT_SHA ||
            process.env.RAILWAY_GIT_COMMIT ||
            process.env.VERCEL_GIT_COMMIT_SHA ||
            process.env.COMMIT_SHA ||
            "unknown",
        },
        error: {
          message: error?.message || "activation_report_failed",
          errorKind: classifyErrorKind({ message: error?.message }),
        },
      });
    }
  });
}
