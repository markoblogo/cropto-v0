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
  ALPHAVANTAGE_API_KEY,
  ALPHAVANTAGE_BASE_URL,
  ALPHAVANTAGE_FUNCTIONS,
  DBNOMICS_API_BASE_URL,
  ENABLE_ALPHAVANTAGE_PROVIDER,
  ENABLE_DBNOMICS_SPOT_PROVIDER,
  ENABLE_FAO_FFPI_PROVIDER,
  ENABLE_NASDAQ_CHRIS,
  ENABLE_NASDAQ_DATALINK_PROVIDER,
  ENABLE_FAOSTAT_PP_WIDGET,
  ENABLE_FPMA_DISCOVERY,
  ENABLE_FPMA_MARKET_PRICES_WIDGET,
  ENABLE_US_CASH_EXPORT_CONTEXT_WIDGET,
  ENABLE_USDA_MARS_DAILY_TXT,
  ENABLE_USDA_GTR_LOGISTICS_WIDGET,
  ENABLE_USDA_MARS_REPORTS_WIDGET,
  FAO_FFPI_URL,
  FAOSTAT_BASE_URL,
  FAOSTAT_TIMEOUT_MS,
  FPMA_API_BASE_URL,
  GRAIN_WIDGETS_CACHE_TTL_MS,
  GRAIN_WIDGETS_FETCH_TIMEOUT_MS,
  NASDAQ_API_KEY,
  NASDAQ_BASE_URL,
  NASDAQ_CHRIS_DATASETS,
  NASDAQ_DATASETS,
  USDA_MARS_BASE_URL,
  USDA_MARS_PUBLIC_INDEX_URLS,
  USDA_MARS_MNREPORTS_BASE_URL,
  USDA_GTR_DATASET_URLS,
} from "./grainWidgets/config";
import { CroptoUkraineIndexProvider } from "./indexProvider";
import { getLiveVisualTiles } from "./liveVisuals";
import { GrainMarketsService } from "./grainMarkets";
import { GrainWidgetsService } from "./grainWidgets";
import { LogisticsIndicatorsService } from "./logisticsIndicators";
import { filterMonitorNews, getMonitorNews, topSignals } from "./newsService";
import { fetchFpmaDiscoverySnapshot, getFpmaDiscoveryDebug, runFpmaDiscoveryResolutionTest } from "./grainWidgets/providers/fpmaDiscovery";
import { fetchWithHeaders } from "./grainWidgets/providers/utils";
import { buildMonitorTriageReport } from "./utils/triage";

function triageReportToMarkdown(report: any): string {
  const providers = Array.isArray(report?.providers) ? report.providers : [];
  const nextActions = Array.isArray(report?.nextActions) ? report.nextActions : [];
  const lines = [
    "# Monitor Triage Report",
    "",
    `Generated: ${report?.runtime?.timestamp || new Date().toISOString()}`,
    "",
    "| Provider | Status | Coverage | errorKind | Suggested fix |",
    "| --- | --- | --- | --- | --- |",
    ...providers.map((row: any) => {
      const fix = Array.isArray(row?.suggestedFix?.actions) ? row.suggestedFix.actions[0] : "No action";
      return `| ${row?.providerId || "unknown"} | ${row?.status || "OFFLINE"} | ${row?.coverage || "0/0"} | ${row?.errorKind || "none"} | ${fix.replace(/\|/g, "\\|")} |`;
    }),
  ];

  if (nextActions.length) {
    lines.push("", "## Next actions", "");
    for (const action of nextActions.slice(0, 10)) {
      const envBits = Array.isArray(action?.envKeys) && action.envKeys.length ? ` env: ${action.envKeys.join(",")}.` : "";
      const exampleBits = Array.isArray(action?.exampleValues) && action.exampleValues.length ? ` example: ${action.exampleValues.join(" | ")}.` : "";
      lines.push(`- [${action?.severity || "INFO"}] ${action?.providerId || "unknown"}: ${action?.why || "No action."}${envBits}${exampleBits} verify: ${action?.verifyUrl || "/api/monitor/triage-report"}`);
    }
  }

  return lines.join("\n");
}

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
  | "RATE_LIMIT"
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
  if (message.includes("rate_limit")) return "RATE_LIMIT";
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

async function probeUrl(url: string, opts?: { timeoutMs?: number; headers?: HeadersInit }): Promise<{
  url: string;
  ok: boolean;
  httpStatus?: number;
  resolvedIp?: string;
  elapsedMs: number;
  errorKind?: ActivationErrorKind;
  errorMessage?: string;
}> {
  const started = Date.now();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (error: any) {
    return {
      url,
      ok: false,
      elapsedMs: Date.now() - started,
      errorKind: classifyErrorKind({ message: String(error?.message || "invalid_url") }),
      errorMessage: "invalid_url",
    };
  }
  let resolvedIp: string | undefined;
  try {
    const dns = await lookup(parsed.hostname);
    resolvedIp = dns.address;
  } catch {
    resolvedIp = undefined;
  }

  try {
    const response = await fetchWithHeaders(url, {
      timeoutMs: opts?.timeoutMs || 5000,
      retryOnStatuses: [403, 429],
      headers: {
        accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/json,text/csv,text/plain,*/*",
        "user-agent": "CroptoMonitor/activation-report",
        ...opts?.headers,
      },
    });
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
    const grainWidgetsDebug = grainWidgetsService.debugSummary();
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

  app.get("/api/monitor/grain-widgets", async (req, res) => {
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
      const country = typeof req.query.country === "string" ? req.query.country : undefined;
      const priceTypeRaw = typeof req.query.priceType === "string" ? req.query.priceType.toUpperCase() : undefined;
      const priceType = priceTypeRaw === "RETAIL" || priceTypeRaw === "WHOLESALE" ? priceTypeRaw : undefined;
      const payload = await grainWidgetsService.list({ country, priceType });
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
    const grainWidgetsDebug = grainWidgetsService.debugSummary();
    let fpmaDiscovery: ReturnType<typeof getFpmaDiscoveryDebug> | undefined;
    try {
      const snapshot = await fetchFpmaDiscoverySnapshot();
      fpmaDiscovery = getFpmaDiscoveryDebug(snapshot);
    } catch (error: any) {
      fpmaDiscovery = {
        cacheHit: false,
        stale: false,
        fetchedAt: undefined,
        countriesCount: 0,
        commoditiesCount: 0,
        priceTypesCount: 0,
        endpointsTried: [],
        notes: [`fpma_discovery_error:${String(error?.message || "unknown")}`],
      };
    }
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
      grainWidgets: {
        ...grainWidgetsDebug,
        fpmaDiscovery,
      },
      fpmaDiscovery,
    });
  });

  app.get("/api/monitor/activation-report", async (_req, res) => {
    try {
      const nowIso = new Date().toISOString();
      const grainWidgets = await grainWidgetsService.list();
      const grainWidgetsDebug = grainWidgetsService.debugSummary();
      const byKind = grainWidgets.widgets.byKind || {};
      const providers = grainWidgetsDebug.providers || [];
      let fpmaDiscovery: ReturnType<typeof getFpmaDiscoveryDebug> | undefined;
      let fpmaResolutionTest: Awaited<ReturnType<typeof runFpmaDiscoveryResolutionTest>> = [];
      try {
        const fpmaSnapshot = await fetchFpmaDiscoverySnapshot();
        fpmaDiscovery = getFpmaDiscoveryDebug(fpmaSnapshot);
        fpmaResolutionTest = await runFpmaDiscoveryResolutionTest();
      } catch (error: any) {
        fpmaDiscovery = {
          cacheHit: false,
          stale: false,
          fetchedAt: undefined,
          countriesCount: 0,
          commoditiesCount: 0,
          priceTypesCount: 0,
          endpointsTried: [],
          notes: [`fpma_discovery_error:${String(error?.message || "unknown")}`],
        };
      }

      const providerToKind: Record<string, "GLOBAL_SPOT_TABLE" | "CROP_PRICE_INDEX" | "USDA_MARS_REPORTS" | "US_CASH_EXPORT_CONTEXT" | "USDA_MARS_DAILY_MARKET_RATES_TXT" | "ALPHAVANTAGE_GRAIN_BENCHMARKS" | "NASDAQ_DATA_LINK_SNAPSHOT" | "USDA_GTR_LOGISTICS_SNAPSHOT" | "FAOSTAT_PP_MULTI_COUNTRY" | "FPMA_MARKET_PRICES_MULTI_COUNTRY"> = {
        "dbnomics-worldbank": "GLOBAL_SPOT_TABLE",
        "fao-ffpi": "CROP_PRICE_INDEX",
        "usda-mars-public": "USDA_MARS_REPORTS",
        "us-cash-export-context": "US_CASH_EXPORT_CONTEXT",
        "usda-mars-daily-txt": "USDA_MARS_DAILY_MARKET_RATES_TXT",
        "alpha-vantage-commodities": "ALPHAVANTAGE_GRAIN_BENCHMARKS",
        "nasdaq-datalink": "NASDAQ_DATA_LINK_SNAPSHOT",
        "usda-gtr-logistics": "USDA_GTR_LOGISTICS_SNAPSHOT",
        "faostat-pp": "FAOSTAT_PP_MULTI_COUNTRY",
        "fpma-market-prices": "FPMA_MARKET_PRICES_MULTI_COUNTRY",
      };

      const sourceMatchesProvider = (sourceName?: string, providerId?: string) => {
        const source = String(sourceName || "").toLowerCase();
        const id = String(providerId || "").toLowerCase();
        if (id.includes("dbnomics")) return source.includes("dbnomics");
        if (id.includes("fao")) return source.includes("fao");
        if (id.includes("usda")) return source.includes("usda");
        if (id.includes("alpha-vantage")) return source.includes("alpha vantage");
        if (id.includes("nasdaq")) return source.includes("nasdaq");
        if (id.includes("usda-gtr")) return source.includes("usda");
        if (id.includes("faostat")) return source.includes("faostat");
        if (id.includes("fpma")) return source.includes("fpma");
        if (id.includes("us-cash-export-context")) return source.includes("usda") || source.includes("open data");
        return false;
      };

      const expectedCoverage: Record<string, number> = {
        "dbnomics-worldbank": 4,
        "fao-ffpi": 3,
        "usda-mars-public": 6,
        "us-cash-export-context": 3,
        "usda-mars-daily-txt": 3,
        "alpha-vantage-commodities": Math.max(2, ALPHAVANTAGE_FUNCTIONS.length),
        "nasdaq-datalink": Math.max(2, NASDAQ_DATASETS.length),
        "usda-gtr-logistics": 2,
        "faostat-pp": 5,
        "fpma-market-prices": 5,
      };

      const providerReport = ["dbnomics-worldbank", "fao-ffpi", "usda-mars-public", "us-cash-export-context", "usda-mars-daily-txt", "alpha-vantage-commodities", "nasdaq-datalink", "usda-gtr-logistics", "faostat-pp", "fpma-market-prices"].map((providerId) => {
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
          linesFetched: provider?.linesFetched,
          linesMatched: provider?.linesMatched,
          downloadUrlUsed:
            provider?.downloadUrlUsed ||
            (widget?.kind === "USDA_MARS_DAILY_MARKET_RATES_TXT" ? widget?.debug?.downloadUrlUsed : undefined),
          parseMode: provider?.parseMode,
          topScoreMin: provider?.topScoreMin,
          topScoreMax: provider?.topScoreMax,
          unitConfidenceByFunction: provider?.unitConfidenceByFunction,
          datasetStatuses: provider?.datasetStatuses,
          rowsParsed: provider?.rowsParsed,
          columnsDetected: provider?.columnsDetected,
          seriesPoints: provider?.seriesPoints,
          httpStatus: provider?.httpStatus,
          finalUrl: provider?.finalUrl,
          responseHeaders: provider?.responseHeaders,
          parseWarnings: provider?.parseWarnings,
          areaCodes: provider?.areaCodes,
          itemCodes: provider?.itemCodes,
          commodityIdsUsed: provider?.commodityIdsUsed,
          elementCode: provider?.elementCode,
          elementLabel: provider?.elementLabel,
          observationsByCrop: provider?.observationsByCrop,
          discoveryFetchedAt: provider?.discoveryFetchedAt,
          discoveryCacheHit: provider?.discoveryCacheHit,
          discoveryEndpointsTried: provider?.discoveryEndpointsTried,
          countryQueryUsed: provider?.countryQueryUsed,
          selectedPriceType: provider?.selectedPriceType,
          query: provider?.query,
          cadence: provider?.cadence,
          datasetUrlChosen: provider?.datasetUrlChosen || (widget?.kind === "USDA_GTR_LOGISTICS_SNAPSHOT" ? widget?.debug?.datasetUrlChosen : undefined),
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
        "USDA_MARS_DAILY_MARKET_RATES_TXT",
        "ALPHAVANTAGE_GRAIN_BENCHMARKS",
        "NASDAQ_DATA_LINK_SNAPSHOT",
        "USDA_GTR_LOGISTICS_SNAPSHOT",
        "FAOSTAT_PP_MULTI_COUNTRY",
        "FPMA_MARKET_PRICES_MULTI_COUNTRY",
      ] as const).map((widgetKind) => {
        const widget = byKind[widgetKind] as any;
        const rowsCount = Array.isArray(widget?.rows) ? widget.rows.length : 0;
        const itemsCount = Array.isArray(widget?.items) ? widget.items.length : 0;
        const cardsCount = Array.isArray(widget?.cards) ? widget.cards.length : 0;
        const reportsCount = Array.isArray(widget?.reports) ? widget.reports.length : 0;
        const topReportsCount = Array.isArray(widget?.topReports) ? widget.topReports.length : 0;
        const txtRowsCount = Array.isArray(widget?.rows) && widget?.kind === "USDA_MARS_DAILY_MARKET_RATES_TXT" ? widget.rows.length : 0;
        const alphaFunctionsCount = Array.isArray(widget?.summary?.byFunction) ? widget.summary.byFunction.length : 0;
        const datasetStatusesCount = Array.isArray(widget?.summary?.datasetStatuses) ? widget.summary.datasetStatuses.length : 0;
        const logisticsItemsCount = widget?.kind === "USDA_GTR_LOGISTICS_SNAPSHOT" && Array.isArray(widget?.items) ? widget.items.length : 0;
        const faostatRowsCount = widget?.kind === "FAOSTAT_PP_MULTI_COUNTRY" && Array.isArray(widget?.rows) ? widget.rows.length : 0;
        const fpmaRowsCount = widget?.kind === "FPMA_MARKET_PRICES_MULTI_COUNTRY" && Array.isArray(widget?.rows) ? widget.rows.length : 0;
        const seriesPointsCount =
          (Array.isArray(widget?.rows) ? widget.rows.flatMap((row: any) => row?.price?.series || []).length : 0) +
          (Array.isArray(widget?.items) ? widget.items.flatMap((item: any) => item?.series || []).length : 0) +
          (Array.isArray(widget?.cards) ? widget.cards.flatMap((card: any) => card?.series || []).length : 0);
        return {
          widgetKind,
          widgetStatus: widget?.status || "OFFLINE",
          territoryScope: widget?.territoryScope,
          territory: widget?.territory,
          sourceName: widget?.sourceName,
          sourceAttribution: widget?.sourceAttribution,
          updatedAt: widget?.updatedAt,
          rowsCount,
          itemsCount,
          cardsCount,
          reportsCount,
          topReportsCount,
          txtRowsCount,
          alphaFunctionsCount,
          datasetStatusesCount,
          logisticsItemsCount,
          logisticsDatasetUrlChosen: widget?.kind === "USDA_GTR_LOGISTICS_SNAPSHOT" ? widget?.debug?.datasetUrlChosen : undefined,
          logisticsColumnsDetected: widget?.kind === "USDA_GTR_LOGISTICS_SNAPSHOT" ? widget?.debug?.columnsDetected : undefined,
          logisticsSeriesPoints: widget?.kind === "USDA_GTR_LOGISTICS_SNAPSHOT" ? widget?.debug?.seriesPoints : undefined,
          logisticsHttpStatus: widget?.kind === "USDA_GTR_LOGISTICS_SNAPSHOT" ? widget?.debug?.httpStatus : undefined,
          logisticsFinalUrl: widget?.kind === "USDA_GTR_LOGISTICS_SNAPSHOT" ? widget?.debug?.finalUrl : undefined,
          logisticsResponseHeaders: widget?.kind === "USDA_GTR_LOGISTICS_SNAPSHOT" ? widget?.debug?.responseHeaders : undefined,
          faostatRowsCount,
          fpmaRowsCount,
          selectedPriceType: widget?.kind === "FPMA_MARKET_PRICES_MULTI_COUNTRY" ? widget?.summary?.selectedPriceType : undefined,
          dailyMetadataSourceUrl: widget?.kind === "USDA_MARS_DAILY_MARKET_RATES_TXT" ? widget?.debug?.metadataSourceUrl : undefined,
          dailyDownloadUrlUsed: widget?.kind === "USDA_MARS_DAILY_MARKET_RATES_TXT" ? widget?.debug?.downloadUrlUsed : undefined,
          dailyReportFound: widget?.kind === "USDA_MARS_DAILY_MARKET_RATES_TXT" ? widget?.debug?.dailyReportFound : undefined,
          reportsToday: widget?.kind === "US_CASH_EXPORT_CONTEXT" ? widget?.summary?.reportsToday ?? 0 : undefined,
          exportIndications: widget?.kind === "US_CASH_EXPORT_CONTEXT" ? Boolean(widget?.summary?.exportIndications) : undefined,
          notes: (widget?.notes || []).slice(0, 4),
          seriesPointsCount,
          hasSparklineEligibleSeries: hasSparklineEligibleSeries(widget),
        };
      });

      const marsIndexProbeUrl = USDA_MARS_PUBLIC_INDEX_URLS[0] || `${USDA_MARS_BASE_URL.replace(/\/+$/, "")}/listPublishedReports`;
      const [dbnomicsProbe, faoProbe, marsProbe] = await Promise.all([
        probeUrl(`${DBNOMICS_API_BASE_URL}/series/WB/commodity_prices/FMAIZE.1W?observations=true`),
        probeUrl(FAO_FFPI_URL),
        probeUrl(marsIndexProbeUrl),
      ]);
      const marsDailyTxtSource =
        (byKind["USDA_MARS_DAILY_MARKET_RATES_TXT"] as any)?.debug?.downloadUrlUsed ||
        providers.find((provider) => provider.providerId === "usda-mars-daily-txt")?.downloadUrlUsed ||
        providers.find((provider) => provider.providerId === "usda-mars-daily-txt")?.sourceUrlUsed ||
        marsIndexProbeUrl;
      const alphaProbeUrl = `${ALPHAVANTAGE_BASE_URL}?function=${encodeURIComponent(ALPHAVANTAGE_FUNCTIONS[0] || "WHEAT")}&interval=monthly${ALPHAVANTAGE_API_KEY ? "&apikey=REDACTED" : ""}`;
      const marsDailyTxtProbe = await probeUrl(marsDailyTxtSource);
      const alphaProbe = await probeUrl(ALPHAVANTAGE_BASE_URL);
      const nasdaqProbeDataset = NASDAQ_DATASETS[0] || "FRED/DGS10";
      const [nasdaqDb, ...nasdaqRest] = nasdaqProbeDataset.split("/");
      const nasdaqDatasetCode = nasdaqRest.join("/") || "DGS10";
      const nasdaqProbeRawUrl = `${NASDAQ_BASE_URL.replace(/\/+$/, "")}/datasets/${encodeURIComponent(nasdaqDb || "FRED")}/${encodeURIComponent(nasdaqDatasetCode)}.json?rows=1${NASDAQ_API_KEY ? `&api_key=${encodeURIComponent(NASDAQ_API_KEY)}` : ""}`;
      const nasdaqProbeUrl = `${NASDAQ_BASE_URL.replace(/\/+$/, "")}/datasets/${encodeURIComponent(nasdaqDb || "FRED")}/${encodeURIComponent(nasdaqDatasetCode)}.json?rows=1${NASDAQ_API_KEY ? "&api_key=REDACTED" : ""}`;
      const nasdaqProbeResult = await probeUrl(nasdaqProbeRawUrl);
      const usdaGtrProbeUrl = USDA_GTR_DATASET_URLS[0] || "https://www.ams.usda.gov/services/transportation-analysis/grain-transportation-report";
      const usdaGtrProbe = await probeUrl(usdaGtrProbeUrl, {
        headers: {
          accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*",
        },
      });
      const faostatProbeUrl = `${FAOSTAT_BASE_URL.replace(/\/+$/, "")}/definitions/types/area`;
      const faostatProbe = await probeUrl(faostatProbeUrl, { timeoutMs: FAOSTAT_TIMEOUT_MS });
      const faostatSampleProbeUrl = `${FAOSTAT_BASE_URL.replace(/\/+$/, "")}/data/PP?area=231&item=15&year=2022&outputType=json`;
      const faostatSampleProbe = await probeUrl(faostatSampleProbeUrl, { timeoutMs: FAOSTAT_TIMEOUT_MS });
      const fpmaProbeUrl = `${FPMA_API_BASE_URL.replace(/\/+$/, "")}/prices?format=json`;
      const fpmaProbe = await probeUrl(fpmaProbeUrl);

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
            ENABLE_USDA_MARS_DAILY_TXT,
            ENABLE_USDA_GTR_LOGISTICS_WIDGET,
            ENABLE_ALPHAVANTAGE_PROVIDER,
            ENABLE_NASDAQ_DATALINK_PROVIDER,
            ENABLE_FAOSTAT_PP_WIDGET,
            ENABLE_FPMA_DISCOVERY,
            ENABLE_FPMA_MARKET_PRICES_WIDGET,
            DBNOMICS_API_BASE_URL: DBNOMICS_API_BASE_URL ? "present" : "missing",
            FAO_FFPI_URL: FAO_FFPI_URL ? "present" : "missing",
            USDA_MARS_BASE_URL: USDA_MARS_BASE_URL ? "present" : "missing",
            USDA_MARS_MNREPORTS_BASE_URL: USDA_MARS_MNREPORTS_BASE_URL ? "present" : "missing",
            ALPHAVANTAGE_BASE_URL: ALPHAVANTAGE_BASE_URL ? "present" : "missing",
            ALPHAVANTAGE_API_KEY: ALPHAVANTAGE_API_KEY ? "present" : "missing",
            NASDAQ_BASE_URL: NASDAQ_BASE_URL ? "present" : "missing",
            NASDAQ_API_KEY: NASDAQ_API_KEY ? "present" : "missing",
            NASDAQ_DATASETS: NASDAQ_DATASETS,
            NASDAQ_DATASET_PREFIXES: Array.from(new Set(NASDAQ_DATASETS.map((value) => String(value).split("/")[0] || ""))).filter(Boolean),
            ENABLE_NASDAQ_CHRIS,
            NASDAQ_CHRIS_DATASETS,
            FAOSTAT_BASE_URL: FAOSTAT_BASE_URL ? "present" : "missing",
            FPMA_API_BASE_URL: FPMA_API_BASE_URL ? "present" : "missing",
            GRAIN_WIDGETS_FETCH_TIMEOUT_MS,
            GRAIN_WIDGETS_CACHE_TTL_MS,
          },
        },
        providers: providerReport,
        fpmaDiscovery,
        fpmaResolutionTest,
        widgets: widgetSnapshot,
        networkProbe: {
          dbnomics: dbnomicsProbe,
          faoFfpi: faoProbe,
          usdaMars: marsProbe,
          usdaMarsDailyTxt: marsDailyTxtProbe,
          alphaVantageBase: alphaProbe,
          alphaVantageCommodities: {
            ...alphaProbe,
            url: alphaProbeUrl,
          },
          nasdaqDataLink: {
            ...nasdaqProbeResult,
            url: nasdaqProbeUrl,
          },
          usdaGtrLogistics: usdaGtrProbe,
          faostatPp: faostatProbe,
          faostatPpSample: faostatSampleProbe,
          fpmaMarketPrices: fpmaProbe,
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

  app.get("/api/monitor/triage-report", async (req, res) => {
    try {
      const report = await buildMonitorTriageReport(grainWidgetsService);
      if (req.query.format === "md") {
        res.type("text/markdown").send(triageReportToMarkdown(report));
        return;
      }
      res.json(report);
    } catch (error: any) {
      const fallback = {
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
        providers: [],
        nextActions: [],
        error: {
          message: error?.message || "triage_report_failed",
        },
      };
      if (req.query.format === "md") {
        res.type("text/markdown").send(triageReportToMarkdown(fallback));
        return;
      }
      res.status(200).json({
        ...fallback,
      });
    }
  });
}
