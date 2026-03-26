import type { Express } from "express";
import { readFile, writeFile } from "node:fs/promises";
import { lookup } from "node:dns/promises";
import path from "node:path";
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
  CANADA_RAIL_PRODUCT_ID,
  CANADA_RAIL_TIMEOUT_MS,
  CANADA_RAIL_WDS_BASE_URL,
  DBNOMICS_API_BASE_URL,
  ENABLE_AMIS_GLOBAL_BALANCE_WIDGET,
  EC_AGRI_API_BASE_URL,
  EC_CEREALS_API_PATH,
  EC_OILSEEDS_API_PATH,
  EC_AGRI_TIMEOUT_MS,
  ENABLE_CANADA_GRAIN_RAIL_WIDGET,
  ENABLE_EUROSTAT_AGRI_PRICE_INDICES_WIDGET,
  ENABLE_ALPHAVANTAGE_PROVIDER,
  ENABLE_DBNOMICS_SPOT_PROVIDER,
  ENABLE_EC_CEREALS_WIDGET,
  ENABLE_EC_OILSEEDS_WIDGET,
  ENABLE_FAO_FFPI_PROVIDER,
  ENABLE_NASDAQ_CHRIS,
  ENABLE_NASDAQ_DATALINK_PROVIDER,
  ENABLE_FAOSTAT_PP_WIDGET,
  ENABLE_FPMA_DISCOVERY,
  ENABLE_FPMA_MARKET_PRICES_WIDGET,
  ENABLE_WB_MICRODATA_WIDGET,
  ENABLE_WFP_MARKET_PRICES_WIDGET,
  ENABLE_IMF_PCPS_WIDGET,
  ENABLE_OECD_AGRICULTURAL_OUTLOOK_WIDGET,
  ENABLE_US_CASH_EXPORT_CONTEXT_WIDGET,
  ENABLE_USDA_PSD_WIDGET,
  ENABLE_USDA_NASS_WIDGET,
  ENABLE_USDA_MARS_DAILY_TXT,
  ENABLE_USDA_GTR_LOGISTICS_WIDGET,
  ENABLE_USDA_MARS_REPORTS_WIDGET,
  FAO_FFPI_URL,
  FAOSTAT_BASE_URL,
  FAOSTAT_TIMEOUT_MS,
  FPMA_API_BASE_URL,
  FPMA_DATA_PATHS,
  GRAIN_WIDGETS_CACHE_TTL_MS,
  GRAIN_WIDGETS_FETCH_TIMEOUT_MS,
  NASDAQ_API_KEY,
  NASDAQ_BASE_URL,
  NASDAQ_CHRIS_DATASETS,
  NASDAQ_DATASETS,
  EUROSTAT_BASE_URL,
  EUROSTAT_TIMEOUT_MS,
  IMF_PCPS_PAGE_URL,
  IMF_PCPS_TABLE2_URL,
  IMF_PCPS_TIMEOUT_MS,
  OECD_AGRICULTURAL_OUTLOOK_CEREALS_URL,
  OECD_AGRICULTURAL_OUTLOOK_OILSEEDS_URL,
  OECD_AGRICULTURAL_OUTLOOK_SDMX_BASE_URL,
  OECD_AGRICULTURAL_OUTLOOK_SDMX_DATASET,
  OECD_AGRICULTURAL_OUTLOOK_SDMX_START_PERIOD,
  OECD_AGRICULTURAL_OUTLOOK_TIMEOUT_MS,
  USDA_FAS_API_KEY,
  USDA_FAS_OPENDATA_BASE_URL,
  USDA_PSD_TIMEOUT_MS,
  USDA_NASS_API_KEY,
  USDA_NASS_BASE_URL,
  USDA_NASS_TIMEOUT_MS,
  USDA_MARS_BASE_URL,
  USDA_MARS_PUBLIC_INDEX_URLS,
  USDA_MARS_MNREPORTS_BASE_URL,
  USDA_GTR_DATASET_URLS,
  WB_MICRODATA_BASE_URL,
  WB_MICRODATA_CSV_URL,
  WB_MICRODATA_TIMEOUT_MS,
  WFP_DATABRIDGES_BASE_URL,
  WFP_DATABRIDGES_TOKEN,
  WFP_DATABRIDGES_TIMEOUT_MS,
  AMIS_MARKET_MONITOR_URL,
  AMIS_TIMEOUT_MS,
} from "./grainWidgets/config";
import { CroptoUkraineIndexProvider } from "./indexProvider";
import { getLiveVisualTiles } from "./liveVisuals";
import { GrainMarketsService } from "./grainMarkets";
import { GrainWidgetsService } from "./grainWidgets";
import { LogisticsIndicatorsService } from "./logisticsIndicators";
import { capBySource, filterMonitorNews, getMonitorNews, topSignals } from "./newsService";
import { getPredictionMarketsSnapshot } from "./predictionMarketsService";
import { getPredictionRiskTrends, startPredictionMarketsScheduler } from "./predictionMarketsPersistence";
import { getAgroExpectationsSnapshot } from "./agroExpectationsService";
import { getAgroCompositeTrends, getCgoWeightsSnapshot, startAgroExpectationsScheduler } from "./agroExpectationsPersistence";
import { getBinanceMarketSnapshot } from "./binanceMarketService";
import { getBinanceRiskTrends, startBinanceMarketScheduler } from "./binanceMarketPersistence";
import { getGlobalIndicesSnapshot } from "./globalIndicesService";
import { getGlobalIndexTrends, startGlobalIndicesScheduler } from "./globalIndicesPersistence";
import { getYieldFoodSecuritySnapshot } from "./yieldFoodSecurityService";
import { listPodcastCatalog, listPodcastEpisodes } from "./podcastsService";
import { getChokepointsMapLayer, getFoodPricesMapLayer } from "./mapLayersService";
import { getAgriEventsMapLayer, listAgriEvents } from "./eventsCalendarService";
import { fetchFpmaDiscoverySnapshot, getFpmaDiscoveryDebug, runFpmaDiscoveryResolutionTest } from "./grainWidgets/providers/fpmaDiscovery";
import { probeDbnomicsCore10 } from "./grainWidgets/providers/dbNomicsCoreRegistry";
import { fetchWithHeaders, redactSensitiveQuery, redactSensitiveUrl } from "./grainWidgets/providers/utils";
import { buildMonitorTriageReport } from "./utils/triage";
import type { MonitorNewsItem } from "./types";
import { buildWeatherYieldRiskLayer, getWeatherYieldRiskDetails } from "./weatherYieldRiskService";
import { loadLast30DaysSummary, type Last30DaysRecord, type Last30DaysSignal } from "./last30daysService";

function triageReportToMarkdown(report: any): string {
  const providers = Array.isArray(report?.providers) ? report.providers : [];
  const nextActions = Array.isArray(report?.nextActions) ? report.nextActions : [];
  const statusRationale = (row: any) => {
    const status = String(row?.status || "").toUpperCase();
    if (status === "INDICATIVE") return "partial usable rows available";
    if (status === "CONSTRAINED") return "no usable rows in latest fetch; upstream constrained";
    return "—";
  };
  const lines = [
    "# Monitor Triage Report",
    "",
    `Generated: ${report?.runtime?.timestamp || new Date().toISOString()}`,
    "",
    "| Provider | Status | Coverage | errorKind | Rationale | Suggested fix |",
    "| --- | --- | --- | --- | --- | --- |",
    ...providers.map((row: any) => {
      const fix = Array.isArray(row?.suggestedFix?.actions) ? row.suggestedFix.actions[0] : "No action";
      return `| ${row?.providerId || "unknown"} | ${row?.status || "OFFLINE"} | ${row?.coverage || "0/0"} | ${row?.errorKind || "none"} | ${statusRationale(row)} | ${fix.replace(/\|/g, "\\|")} |`;
    }),
  ];

  const summary = providers.reduce(
    (acc: Record<string, number>, row: any) => {
      const key = String(row?.status || "OFFLINE").toUpperCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    {},
  );
  lines.push(
    "",
    "## Status Summary",
    "",
    `- REFRESH: ${summary.REFRESH || 0}`,
    `- INDICATIVE: ${summary.INDICATIVE || 0}`,
    `- CONSTRAINED: ${summary.CONSTRAINED || 0}`,
    `- OFFLINE: ${summary.OFFLINE || 0}`,
  );

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
const REPORT_PROBE_TIMEOUT_MS = 3500;
const REPORT_ROUTE_BUDGET_MS = 5000;
const REPORT_FPMA_BUDGET_MS = 1200;
const REPORT_WARMUP_BUDGET_MS = 2200;

function topEntries(record: Record<string, number>, limit = 5) {
  return Object.entries(record)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([sourceId, count]) => ({ sourceId, count }));
}

type LogisticsEventMode = "rail" | "barge" | "ocean" | "truck" | "multi-modal";
type LogisticsEventRegion = "US" | "Canada" | "Brazil" | "Black Sea" | "Global";
type LogisticsEventCommodity = "grains" | "agri" | "mixed";

type LogisticsEventItem = {
  id: string;
  source: string;
  title: string;
  summary?: string;
  url?: string;
  publishedAt: string;
  modes: LogisticsEventMode[];
  regions: LogisticsEventRegion[];
  commodities: LogisticsEventCommodity[];
  indices: string[];
};

function classifyLogisticsModes(item: MonitorNewsItem): LogisticsEventMode[] {
  const text = `${item.title || ""} ${item.summary || ""} ${item.source_name || ""}`.toLowerCase();
  const modes = new Set<LogisticsEventMode>();
  if (/\brail\b|\btrain\b|\brailroad\b|\bcpkc\b|\bcn\b|\bcsx\b|\bunion pacific\b/.test(text)) modes.add("rail");
  if (/\bbarge\b|\bmississippi\b|\blocks?\b|\btow\b|\bcolumbia\b|\bsnake river\b/.test(text)) modes.add("barge");
  if (/\bocean\b|\bmarine\b|\bshipping\b|\bship\b|\bvessel\b|\bport\b|\bharbor\b|\bgulf\b|\bpnw\b|\bblack sea\b/.test(text)) modes.add("ocean");
  if (/\btruck\b|\btrucking\b|\bdiesel\b|\bhighway\b/.test(text)) modes.add("truck");
  if (modes.size === 0) modes.add("multi-modal");
  if (modes.size > 1) modes.add("multi-modal");
  return Array.from(modes);
}

function classifyLogisticsRegions(item: MonitorNewsItem): LogisticsEventRegion[] {
  const text = `${item.title || ""} ${item.summary || ""}`.toLowerCase();
  const regionTags = (item.region_tags || []).map((tag) => String(tag).toLowerCase());
  const out = new Set<LogisticsEventRegion>();
  if (regionTags.some((tag) => tag.includes("us") || tag.includes("usa") || tag.includes("united states")) || /\busa\b|\bunited states\b|\bgulf\b|\bpnw\b/.test(text)) out.add("US");
  if (regionTags.some((tag) => tag.includes("canada")) || /\bcanada\b|\bcn\b|\bcpkc\b/.test(text)) out.add("Canada");
  if (regionTags.some((tag) => tag.includes("brazil")) || /\bbrazil\b|\bbrasil\b/.test(text)) out.add("Brazil");
  if (regionTags.some((tag) => tag.includes("blacksea") || tag.includes("black sea") || tag.includes("ukraine")) || /\bblack sea\b|\bukraine\b|\bodesa\b|\bodessa\b/.test(text)) out.add("Black Sea");
  if (out.size === 0) out.add("Global");
  return Array.from(out);
}

function classifyLogisticsCommodities(item: MonitorNewsItem): LogisticsEventCommodity[] {
  const cropTags = (item.crop_tags || []).map((tag) => String(tag).toLowerCase());
  const text = `${item.title || ""} ${item.summary || ""}`.toLowerCase();
  const out = new Set<LogisticsEventCommodity>();
  if (cropTags.length > 0 || /\bgrain\b|\bwheat\b|\bcorn\b|\bmaize\b|\bsoy\b|\bsoybean\b|\boilseed\b/.test(text)) out.add("grains");
  if (/\bagri\b|\bagriculture\b|\bfarm\b|\bfeed\b|\bfertilizer\b/.test(text)) out.add("agri");
  if (out.size === 0) out.add("mixed");
  return Array.from(out);
}

function mapLogisticsIndices(modes: LogisticsEventMode[], regions: LogisticsEventRegion[]): string[] {
  const linked = new Set<string>();
  if (modes.includes("rail")) {
    linked.add("us_rail_tariff_wheat_index");
    linked.add("rail_deliveries_to_port_index");
  }
  if (modes.includes("barge")) {
    linked.add("us_barge_rate_index");
    linked.add("us_barge_movement_index");
  }
  if (modes.includes("ocean")) {
    linked.add("ocean_freight_grain_index");
    linked.add("export_throughput_index");
  }
  if (modes.includes("truck") || modes.includes("multi-modal")) {
    linked.add("logistics_pressure_index");
  }
  if (regions.includes("Black Sea")) linked.add("black_sea_corridor_pressure_index");
  return Array.from(linked);
}

function toLogisticsEvent(item: MonitorNewsItem): LogisticsEventItem {
  const modes = classifyLogisticsModes(item);
  const regions = classifyLogisticsRegions(item);
  const commodities = classifyLogisticsCommodities(item);
  const indices = mapLogisticsIndices(modes, regions);
  return {
    id: item.id,
    source: item.source_name || "Unknown source",
    title: item.title || "Logistics event",
    summary: item.summary,
    url: item.url,
    publishedAt: item.published_at,
    modes,
    regions,
    commodities,
    indices,
  };
}

async function warmGrainWidgetsSnapshot() {
  await withQuickReportBudget(
    grainWidgetsService.list(),
    () => null,
    REPORT_WARMUP_BUDGET_MS,
  ).catch(() => null);
}

type ActivationErrorKind =
  | "CONFIG_MISSING"
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
  if (message.includes("config_missing") || message.includes("api_key_missing") || message.includes("token_missing")) return "CONFIG_MISSING";
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
  const redacted = redactSensitiveUrl(error);
  const statusMatch = error.match(/HTTP\s+(\d{3})/i);
  const httpStatus = statusMatch ? Number.parseInt(statusMatch[1], 10) : undefined;
  const codeMatch = error.match(/\b(ENOTFOUND|ETIMEDOUT|ABORT_ERR)\b/i);
  const code = codeMatch?.[1]?.toUpperCase();
  return {
    name: "ProviderError",
    code,
    message: redacted,
    httpStatus,
    errorKind: classifyErrorKind({ message: redacted, code, httpStatus }),
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
      url: redactSensitiveUrl(url) || url,
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
      url: redactSensitiveUrl(url) || url,
      ok: false,
      resolvedIp,
      elapsedMs: Date.now() - started,
      errorKind: classifyErrorKind({ message, code }),
      errorMessage: redactSensitiveUrl(message),
    };
  }
}

function clampReportProbeTimeout(timeoutMs?: number): number {
  return Math.min(timeoutMs || 5000, REPORT_PROBE_TIMEOUT_MS);
}

async function withReportBudget<T>(work: Promise<T>, fallback: () => T): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((resolve) => {
        timeoutHandle = setTimeout(() => resolve(fallback()), REPORT_ROUTE_BUDGET_MS);
      }),
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

async function withQuickReportBudget<T>(work: Promise<T>, fallback: () => T, timeoutMs = REPORT_FPMA_BUDGET_MS): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((resolve) => {
        timeoutHandle = setTimeout(() => resolve(fallback()), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

function quickProviderReport(providers: any[]) {
  const indicativeProviders = new Set([
    "oecd-agricultural-outlook",
    "wfp-databridges",
    "faostat-pp",
    "fpma-market-prices",
    "usda-psd",
  ]);
  const normalizeStatus = (providerId: string, rawStatus: string, mappedCount: number) => {
    const status = String(rawStatus || "OFFLINE").toUpperCase();
    if (!indicativeProviders.has(providerId)) return status;
    if (status === "REFRESH" || status === "LIVE") return status;
    return mappedCount > 0 ? "INDICATIVE" : "CONSTRAINED";
  };
  return providers.map((provider) => ({
    providerId: provider?.providerId,
    enabled: Boolean(provider?.enabled),
    mappedCount: provider?.mappedCount ?? 0,
    expectedCount: provider?.expectedCount,
    coverage: provider?.coverage || `${provider?.mappedCount ?? 0}/${provider?.expectedCount ?? 0}`,
    status: normalizeStatus(
      provider?.providerId,
      provider?.status === "ok"
        ? "REFRESH"
        : provider?.status === "partial"
          ? "FALLBACK"
          : provider?.status === "disabled"
            ? "OFFLINE"
            : "OFFLINE",
      provider?.mappedCount ?? 0,
    ),
    sourceUrlUsed: redactSensitiveUrl(provider?.sourceUrlUsed),
    rowsParsed: provider?.rowsParsed,
    columnsDetected: provider?.columnsDetected,
    seriesPoints: provider?.seriesPoints,
    httpStatus: provider?.httpStatus,
    finalUrl: redactSensitiveUrl(provider?.finalUrl),
    responseHeaders: provider?.responseHeaders,
    transportUsed: provider?.transportUsed,
    rangeRequestUsed: provider?.rangeRequestUsed,
    query: redactSensitiveQuery(provider?.query),
    cadence: provider?.cadence,
    datasetUrlChosen: redactSensitiveUrl(provider?.datasetUrlChosen),
    lastFetchAt: provider?.lastSuccessAt || provider?.lastAttemptAt,
    cacheHit: Boolean(provider?.cacheHit),
    fallbackChainUsed: provider?.fallbackChain || "real->cache->mock",
    lastError: normalizeProviderError(provider?.error || (provider?.errorKind ? String(provider.errorKind) : undefined)),
    notes: provider?.notes || [],
  }));
}

function quickTriageReport(providers: any[]) {
  const rows = quickProviderReport(providers).map((provider) => {
    const errorKind =
      provider?.lastError?.errorKind ||
      (provider?.status === "REFRESH" || provider?.status === "INDICATIVE" ? undefined : "UNKNOWN");
    const fix =
      errorKind === "CONFIG_MISSING"
        ? "Set required env/config for this provider."
        : errorKind === "HTTP_4XX"
          ? "Inspect sourceUrlUsed/finalUrl and verify auth or endpoint path."
          : errorKind === "HTTP_5XX"
            ? "Keep fallback enabled; upstream is failing server-side."
            : errorKind === "BLOCKED"
              ? "Treat as upstream access restriction unless provider diagnostics prove otherwise."
              : errorKind === "EMPTY_DATA"
                ? "Requests succeed but no usable rows were extracted."
                : errorKind === "PARSE_ERROR"
                  ? "Source responded but parser did not recover usable data."
                  : errorKind
                    ? "No safe automatic fix beyond the current fallback chain."
                    : "No action required.";
    return {
      providerId: provider.providerId,
      status: provider.status,
      coverage: provider.coverage,
      errorKind,
      suggestedFix: { actions: [fix] },
    };
  });

  return {
    runtime: {
      timestamp: new Date().toISOString(),
      appVersion: process.env.APP_VERSION || process.env.npm_package_version || "unknown",
      commit:
        process.env.RAILWAY_GIT_COMMIT_SHA ||
        process.env.RAILWAY_GIT_COMMIT ||
        process.env.VERCEL_GIT_COMMIT_SHA ||
        process.env.COMMIT_SHA ||
        "unknown",
      note: "lightweight_triage_snapshot",
    },
    providers: rows,
    nextActions: [],
    networkProbe: {},
  };
}

type Last30DaysAiSummaryBlock = {
  language: "en" | "uk";
  scope: string;
  model: string;
  text: string;
  inputCounts: {
    last30days: number;
    monitor: number;
  };
};

function isUkraineScopedMonitorItem(item: MonitorNewsItem): boolean {
  const text = `${item.title || ""} ${item.summary || ""}`.toLowerCase();
  return (
    item.region_tags.some((tag) => String(tag).toLowerCase().includes("ukraine")) ||
    /\bukraine\b|\bua\b|\bodesa\b|\bodessa\b/.test(text)
  );
}

function buildLast30Context(items: Last30DaysRecord[], limit = 18): string {
  return items
    .slice(0, limit)
    .map((item, idx) => {
      const date = item.publishedAt.slice(0, 10);
      return `${idx + 1}. [${date}] ${item.commodity.toUpperCase()} | ${item.region} | ${item.signal} | impact ${item.impact.toFixed(1)} | ${item.title}`;
    })
    .join("\n");
}

function buildMonitorContext(items: MonitorNewsItem[], limit = 14): string {
  return items
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))
    .slice(0, limit)
    .map((item, idx) => {
      const date = item.published_at.slice(0, 10);
      const regions = item.region_tags.slice(0, 2).join(",");
      return `${idx + 1}. [${date}] score ${item.relevance_score} | ${regions || "global"} | ${item.title}`;
    })
    .join("\n");
}

function extractResponseText(payload: any): string {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  const out = Array.isArray(payload?.output) ? payload.output : [];
  const chunks: string[] = [];
  for (const item of out) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.text === "string") chunks.push(part.text);
    }
  }
  return chunks.join("\n").trim();
}

async function generateLast30AiSummary(params: {
  language: "en" | "uk";
  periodLabel: string;
  scopeDescription: string;
  last30Items: Last30DaysRecord[];
  monitorItems: MonitorNewsItem[];
}): Promise<Last30DaysAiSummaryBlock> {
  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing");
  }

  const model = process.env.LAST30DAYS_AI_MODEL || "gpt-4.1-mini";
  const last30Context = buildLast30Context(params.last30Items);
  const monitorContext = buildMonitorContext(params.monitorItems);

  const systemPrompt =
    params.language === "uk"
      ? "You are an agricultural market analyst. Write in Ukrainian. Keep it practical and concise."
      : "You are an agricultural market analyst. Write in English. Keep it practical and concise.";

  const userPrompt = [
    `Time window: ${params.periodLabel}.`,
    `Scope: ${params.scopeDescription}.`,
    "",
    "Use BOTH datasets below when building conclusions.",
    "",
    "Last30Days feed:",
    last30Context || "No last30days records.",
    "",
    "Monitor context feed:",
    monitorContext || "No monitor records.",
    "",
    "Output format requirements:",
    "1) Start with one short paragraph: current market situation and directional tone.",
    "2) Then a 'Key facts' section with 4-6 bullets.",
    "3) Focus on implications for grains/oilseeds trading and brokerage decisions.",
    "4) Do not repeat raw dashboards metrics (coverage, risk index, etc).",
    "5) Do not mention missing data unless critical.",
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_output_tokens: 700,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI request failed: HTTP ${response.status} ${text.slice(0, 240)}`);
  }

  const payload = await response.json();
  const text = extractResponseText(payload);
  if (!text) {
    throw new Error("OpenAI response did not contain summary text");
  }

  return {
    language: params.language,
    scope: params.scopeDescription,
    model,
    text,
    inputCounts: {
      last30days: params.last30Items.length,
      monitor: params.monitorItems.length,
    },
  };
}

async function readCachedAiSummary(days: number): Promise<any | null> {
  const dir = process.env.LAST30DAYS_OUTPUT_DIR || path.resolve(process.cwd(), "artifacts/last30days");
  const file = path.join(dir, `ai-summary-${days}.json`);
  try {
    const content = await readFile(file, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function writeCachedAiSummary(days: number, payload: any): Promise<void> {
  const dir = process.env.LAST30DAYS_OUTPUT_DIR || path.resolve(process.cwd(), "artifacts/last30days");
  const file = path.join(dir, `ai-summary-${days}.json`);
  await writeFile(file, JSON.stringify(payload, null, 2), "utf-8");
}

export function registerMonitorRoutes(app: Express): void {
  // Keep monitor routes available even if a background source or scheduler fails
  // during boot. The web process should bind first and degrade gracefully rather
  // than crash because one monitor worker cannot start.
  const safeStart = (label: string, fn: () => void) => {
    setTimeout(() => {
      try {
        fn();
      } catch (error) {
        console.error(`[MonitorBoot] Failed to start ${label}:`, error);
      }
    }, 0);
  };

  safeStart("logistics indicators service", () => logisticsIndicatorsService.start());
  safeStart("grain markets service", () => grainMarketsService.start());
  safeStart("grain widgets service", () => grainWidgetsService.start());
  safeStart("prediction markets scheduler", () => startPredictionMarketsScheduler());
  safeStart("agro expectations scheduler", () => startAgroExpectationsScheduler());
  safeStart("binance market scheduler", () => startBinanceMarketScheduler());
  safeStart("global indices scheduler", () => startGlobalIndicesScheduler());

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

  app.get("/api/last30days/summary", async (req, res) => {
    try {
      const daysRaw = Number.parseInt(String(req.query.days || "30"), 10);
      const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(30, daysRaw)) : 30;
      const region = String(req.query.region || "all").toLowerCase();
      const lang = String(req.query.lang || "all").toLowerCase();
      const includeSources = req.query.includeSources === "1" || req.query.includeSources === "true";

      const base = await loadLast30DaysSummary();
      const minTs = Date.now() - days * 24 * 60 * 60 * 1000;

      const filtered = base.items
        .filter((item) => Date.parse(item.publishedAt) >= minTs)
        .filter((item) => region === "all" || item.region === region)
        .filter((item) => lang === "all" || item.language === lang)
        .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

      const signalWeight: Record<Last30DaysSignal, number> = {
        bullish: 1,
        neutral: 0,
        bearish: -1,
      };

      const byCount = (items: Last30DaysRecord[], keyFn: (item: Last30DaysRecord) => string) => {
        return items.reduce<Record<string, number>>((acc, item) => {
          const key = keyFn(item) || "unknown";
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {});
      };

      const commodityShare = byCount(filtered, (item) => item.commodity);
      const regionalHeat = byCount(
        filtered.filter((item) => item.impact >= 4),
        (item) => item.region,
      );

      const signalScoreRaw = filtered.reduce((acc, item) => acc + signalWeight[item.signal], 0);
      const signalBalancePct = filtered.length ? Math.round((signalScoreRaw / filtered.length) * 100) : 0;
      const riskIndex = filtered.length
        ? Number((filtered.reduce((acc, item) => acc + item.impact, 0) / filtered.length).toFixed(2))
        : 0;
      const topCommodity =
        Object.entries(commodityShare).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

      const sources = includeSources
        ? Array.from(new Set(filtered.map((item) => item.source))).sort((a, b) => a.localeCompare(b))
        : undefined;

      return res.json({
        generatedAt: base.generatedAt,
        sourceFile: base.sourceFile,
        sourceUpdatedAt: base.sourceUpdatedAt,
        warnings: base.warnings,
        filters: {
          days,
          region,
          lang,
        },
        summary: {
          coverageCount: filtered.length,
          signalBalancePct,
          riskIndex,
          topCommodity,
          commodityShare,
          regionalHeat,
        },
        sources,
        items: filtered.slice(0, 250),
      });
    } catch (error: any) {
      return res.status(500).json({
        generatedAt: new Date().toISOString(),
        summary: {
          coverageCount: 0,
          signalBalancePct: 0,
          riskIndex: 0,
          topCommodity: null,
          commodityShare: {},
          regionalHeat: {},
        },
        items: [],
        message: error?.message || "Failed to build last30days summary",
      });
    }
  });

  app.get("/api/last30days/ai-summary", async (req, res) => {
    try {
      const daysRaw = Number.parseInt(String(req.query.days || "30"), 10);
      const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(30, daysRaw)) : 30;
      const refresh = req.query.refresh === "1" || req.query.refresh === "true";
      const periodLabel = days === 1 ? "Yesterday" : days === 7 ? "Week" : "30 Days";
      const minTs = Date.now() - days * 24 * 60 * 60 * 1000;
      const warnings: string[] = [];

      if (!refresh) {
        const cached = await readCachedAiSummary(days);
        if (cached) {
          return res.json({ ...cached, mode: cached.mode || "precomputed" });
        }
        return res.json({
          generatedAt: new Date().toISOString(),
          filters: { days },
          sourceUpdatedAt: null,
          warnings: ["precomputed_ai_summary_missing: run scheduled refresh/generator"],
          en: null,
          uk: null,
          mode: "fallback_only",
        });
      }

      const base = await loadLast30DaysSummary();
      const scopedLast30 = base.items
        .filter((item) => Date.parse(item.publishedAt) >= minTs)
        .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

      const enLast30 = scopedLast30.filter((item) => item.language === "en" && item.region !== "ukraine");
      const ukLast30 = scopedLast30.filter((item) => item.language === "uk" || item.region === "ukraine");

      const { items: monitorItems } = await getMonitorNews(false, { threshold: MONITOR_RELEVANCE_THRESHOLD });
      const scopedMonitor = monitorItems.filter((item) => {
        const ts = Date.parse(item.published_at);
        return Number.isFinite(ts) ? ts >= minTs : true;
      });
      const enMonitor = scopedMonitor.filter((item) => !isUkraineScopedMonitorItem(item));
      const ukMonitor = scopedMonitor.filter((item) => isUkraineScopedMonitorItem(item));

      const [enResult, ukResult] = await Promise.allSettled([
        generateLast30AiSummary({
          language: "en",
          periodLabel,
          scopeDescription: "English language + non-Ukraine markets",
          last30Items: enLast30,
          monitorItems: enMonitor,
        }),
        generateLast30AiSummary({
          language: "uk",
          periodLabel,
          scopeDescription: "Ukraine market context",
          last30Items: ukLast30,
          monitorItems: ukMonitor,
        }),
      ]);

      const en = enResult.status === "fulfilled" ? enResult.value : null;
      const uk = ukResult.status === "fulfilled" ? ukResult.value : null;
      if (enResult.status === "rejected") warnings.push(`en_summary_failed: ${String(enResult.reason?.message || enResult.reason)}`);
      if (ukResult.status === "rejected") warnings.push(`uk_summary_failed: ${String(ukResult.reason?.message || ukResult.reason)}`);

      const payload = {
        generatedAt: new Date().toISOString(),
        filters: { days },
        sourceUpdatedAt: base.sourceUpdatedAt,
        warnings,
        en,
        uk,
        mode: "live_refresh",
      };
      await writeCachedAiSummary(days, payload).catch((error: any) => {
        warnings.push(`cache_write_failed: ${String(error?.message || error)}`);
      });
      return res.json(payload);
    } catch (error: any) {
      return res.status(500).json({
        generatedAt: new Date().toISOString(),
        warnings: [error?.message || "Failed to generate AI summaries"],
        en: null,
        uk: null,
      });
    }
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

      const feed = capBySource(filtered, 3, 200);
      const top = topSignals(feed, 10);
      const logistics = capBySource(
        feed.filter((item) => item.category === "logistics-shipping" || item.topic_tags.includes("logistics")),
        2,
        8,
      );
      const policy = capBySource(
        feed.filter((item) => item.category === "policy-macro" || item.topic_tags.includes("policy") || item.topic_tags.includes("trade")),
        2,
        8,
      );

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
        feed,
        sidePanels: {
          logistics,
          policy,
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Failed to load monitor news" });
    }
  });

  app.get("/api/monitor/weather-yield-risk", async (req, res) => {
    try {
      const threshold = resolveThreshold(typeof req.query.threshold === "string" ? req.query.threshold : undefined);
      const { items } = await getMonitorNews(req.query.refresh === "1", { threshold });
      const layer = buildWeatherYieldRiskLayer({
        news: items,
        crop: typeof req.query.crop === "string" ? req.query.crop : "all",
      });
      return res.json(layer);
    } catch (error: any) {
      return res.status(500).json({
        layer_id: "weather_yield_risk",
        layer_type: "region",
        updated_at: new Date().toISOString(),
        legend: { metric: "stress_score", unit: "index_0_100", scale: "sequential", min: 0, max: 100 },
        features: [],
        message: error?.message || "Failed to load weather yield risk layer",
      });
    }
  });

  app.get("/api/monitor/weather-yield-risk/details", async (req, res) => {
    try {
      const regionId = String(req.query.region_id || "").trim();
      const crop = String(req.query.crop || "").trim();
      if (!regionId || !crop) {
        return res.status(400).json({ message: "region_id and crop are required" });
      }
      const threshold = resolveThreshold(typeof req.query.threshold === "string" ? req.query.threshold : undefined);
      const { items } = await getMonitorNews(req.query.refresh === "1", { threshold });
      const details = getWeatherYieldRiskDetails({ news: items, regionId, crop });
      if (!details) {
        return res.status(404).json({ message: "Region/crop not found" });
      }
      return res.json(details);
    } catch (error: any) {
      return res.status(500).json({ message: error?.message || "Failed to load weather yield risk details" });
    }
  });

  app.get("/api/monitor/logistics-news", async (req, res) => {
    try {
      const threshold = resolveThreshold(typeof req.query.threshold === "string" ? req.query.threshold : undefined);
      const modeFilter = String(req.query.mode || "all").toLowerCase();
      const regionFilter = String(req.query.region || "all").toLowerCase();
      const commodityFilter = String(req.query.commodity || "all").toLowerCase();
      const { items, stats } = await getMonitorNews(req.query.refresh === "1", { threshold });
      const scoped = filterMonitorNews(items, {
        crop: "all",
        topic: "all",
        region: "all",
        time: req.query.time === "24h" ? "24h" : "7d",
      });
      const logistics = scoped.filter((item) => item.category === "logistics-shipping" || item.topic_tags.includes("logistics"));
      const capped = capBySource(logistics, 4, 120).map(toLogisticsEvent);
      const filtered = capped.filter((item) => {
        if (modeFilter !== "all" && !item.modes.some((mode) => mode.toLowerCase() === modeFilter)) return false;
        if (regionFilter !== "all" && !item.regions.some((region) => region.toLowerCase() === regionFilter)) return false;
        if (commodityFilter !== "all" && !item.commodities.some((commodity) => commodity.toLowerCase() === commodityFilter)) return false;
        return true;
      });
      const itemsOut = filtered
        .sort((a, b) => Date.parse(b.publishedAt || "") - Date.parse(a.publishedAt || ""))
        .slice(0, 80);
      const facets = {
        modes: ["all", "rail", "barge", "ocean", "truck", "multi-modal"].map((value) => ({
          value,
          count: value === "all" ? capped.length : capped.filter((item) => item.modes.includes(value as LogisticsEventMode)).length,
        })),
        regions: ["all", "US", "Canada", "Brazil", "Black Sea", "Global"].map((value) => ({
          value,
          count: value === "all" ? capped.length : capped.filter((item) => item.regions.includes(value as LogisticsEventRegion)).length,
        })),
        commodities: ["all", "grains", "agri", "mixed"].map((value) => ({
          value,
          count: value === "all" ? capped.length : capped.filter((item) => item.commodities.includes(value as LogisticsEventCommodity)).length,
        })),
      };
      return res.json({
        generatedAt: stats.generatedAt,
        filters: {
          mode: modeFilter,
          region: regionFilter,
          commodity: commodityFilter,
          threshold,
          time: req.query.time === "24h" ? "24h" : "7d",
        },
        facets,
        items: itemsOut,
      });
    } catch (error: any) {
      return res.status(500).json({
        generatedAt: new Date().toISOString(),
        items: [],
        message: error?.message || "Failed to load logistics news",
      });
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

  app.get("/api/monitor/prediction-markets", async (req, res) => {
    try {
      const forceRefresh = req.query.refresh === "1";
      const payload = await getPredictionMarketsSnapshot(forceRefresh);
      return res.json(payload);
    } catch (error: any) {
      return res.status(500).json({
        generatedAt: new Date().toISOString(),
        source: "kalshi+polymarket",
        cacheHit: false,
        marketCount: 0,
        sources: {
          kalshi: { ok: false, count: 0, error: "unavailable" },
          polymarket: { ok: false, count: 0, error: "unavailable" },
        },
        indices: [],
        directGrainMarkets: [],
        message: error?.message || "Failed to load prediction markets",
      });
    }
  });

  app.get("/api/monitor/prediction-risk-trends", async (req, res) => {
    try {
      const hoursRaw = typeof req.query.hours === "string" ? Number.parseInt(req.query.hours, 10) : 168;
      const payload = await getPredictionRiskTrends(Number.isFinite(hoursRaw) ? hoursRaw : 168);
      return res.json(payload);
    } catch (error: any) {
      return res.status(500).json({
        generatedAt: new Date().toISOString(),
        hours: 168,
        keys: ["inflation_risk", "rates_risk", "geopolitics_risk", "grain_risk"],
        byIndex: {},
        message: error?.message || "Failed to load prediction risk trends",
      });
    }
  });

  app.get("/api/monitor/agro-expectations", async (req, res) => {
    try {
      const forceRefresh = req.query.refresh === "1";
      const payload = await getAgroExpectationsSnapshot(forceRefresh);
      return res.json(payload);
    } catch (error: any) {
      return res.status(500).json({
        generatedAt: new Date().toISOString(),
        cacheHit: false,
        barometer: {
          status: "CONSTRAINED",
          source: "Purdue/CME Ag Economy Barometer",
          agEconomy: null,
          currentConditions: null,
          futureExpectations: null,
          note: error?.message || "Failed to load barometer",
        },
        etfProxies: {
          status: "CONSTRAINED",
          rows: [],
          cgoComposite: {
            value: null,
            dayChangePct: null,
            d30ChangePct: null,
            weights: { CORN: 0.4, WEAT: 0.3, SOYB: 0.3 },
            series: [],
            note: "Composite unavailable",
          },
        },
      });
    }
  });

  app.get("/api/monitor/agro-composite-trends", async (req, res) => {
    try {
      const hoursRaw = typeof req.query.hours === "string" ? Number.parseInt(req.query.hours, 10) : 168;
      const region = typeof req.query.region === "string" ? req.query.region.toUpperCase() : "GLOBAL";
      const payload = await getAgroCompositeTrends(Number.isFinite(hoursRaw) ? hoursRaw : 168, region);
      return res.json(payload);
    } catch (error: any) {
      return res.status(500).json({
        generatedAt: new Date().toISOString(),
        hours: 168,
        region: "GLOBAL",
        byIndex: {},
        message: error?.message || "Failed to load agro composite trends",
      });
    }
  });

  app.get("/api/monitor/cgo-weights", async (req, res) => {
    try {
      const yearRaw = typeof req.query.year === "string" ? Number.parseInt(req.query.year, 10) : new Date().getUTCFullYear();
      const region = typeof req.query.region === "string" ? req.query.region.toUpperCase() : "GLOBAL";
      const year = Number.isFinite(yearRaw) ? yearRaw : new Date().getUTCFullYear();
      const payload = await getCgoWeightsSnapshot(year, region);
      return res.json(payload);
    } catch (error: any) {
      return res.status(500).json({
        generatedAt: new Date().toISOString(),
        year: new Date().getUTCFullYear(),
        region: "GLOBAL",
        rows: [],
        message: error?.message || "Failed to load CGO weights",
      });
    }
  });

  app.get("/api/monitor/binance-snapshot", async (req, res) => {
    try {
      const forceRefresh = req.query.refresh === "1";
      const payload = await getBinanceMarketSnapshot(forceRefresh);
      return res.json(payload);
    } catch (error: any) {
      return res.status(500).json({
        generatedAt: new Date().toISOString(),
        cacheHit: false,
        status: "CONSTRAINED",
        rows: [],
        macroRisk: {
          score: null,
          btcVolProxy: null,
          ethVolProxy: null,
          note: error?.message || "Binance snapshot unavailable",
        },
      });
    }
  });

  app.get("/api/monitor/binance-risk-trends", async (req, res) => {
    try {
      const hoursRaw = typeof req.query.hours === "string" ? Number.parseInt(req.query.hours, 10) : 168;
      const payload = await getBinanceRiskTrends(Number.isFinite(hoursRaw) ? hoursRaw : 168);
      return res.json(payload);
    } catch (error: any) {
      return res.status(500).json({
        generatedAt: new Date().toISOString(),
        hours: 168,
        bySymbol: {},
        macroRisk: { score: null, avgIv: null, avgAbsMove: null },
        message: error?.message || "Binance risk trends unavailable",
      });
    }
  });

  app.get("/api/monitor/global-indices", async (req, res) => {
    try {
      const forceRefresh = req.query.refresh === "1";
      const payload = await getGlobalIndicesSnapshot(forceRefresh);
      return res.json(payload);
    } catch (error: any) {
      return res.status(500).json({
        generatedAt: new Date().toISOString(),
        cacheHit: false,
        status: "CONSTRAINED",
        providerMode: "fallback",
        rows: [],
        riskOnOff: {
          regime: "NEUTRAL",
          score: null,
          matrix: [],
          note: error?.message || "Global indices unavailable",
        },
        crossAsset: {
          btc: null,
          gold: null,
          oil: null,
          dxy: null,
          note: "Global indices unavailable",
        },
      });
    }
  });

  app.get("/api/monitor/global-indices-trends", async (req, res) => {
    try {
      const hoursRaw = typeof req.query.hours === "string" ? Number.parseInt(req.query.hours, 10) : 168;
      const payload = await getGlobalIndexTrends(Number.isFinite(hoursRaw) ? hoursRaw : 168);
      return res.json(payload);
    } catch (error: any) {
      return res.status(500).json({
        generatedAt: new Date().toISOString(),
        hours: 168,
        bySymbol: {},
        status: "CONSTRAINED",
        provider: "unknown",
        message: error?.message || "Global index trends unavailable",
      });
    }
  });

  app.get("/api/monitor/yield-food-security", async (req, res) => {
    try {
      const country = typeof req.query.country === "string" ? req.query.country.toUpperCase() : "UA";
      const crop = typeof req.query.crop === "string" ? req.query.crop.toUpperCase() : "ALL";
      const forceRefresh = req.query.refresh === "1";
      const grainWidgets = await grainWidgetsService.list({ country, forceRefresh });
      const byKind = grainWidgets?.widgets?.byKind || {};
      const payload = await getYieldFoodSecuritySnapshot({
        country,
        crop,
        forceRefresh,
        byKind,
      });
      return res.json(payload);
    } catch (error: any) {
      return res.status(500).json({
        generatedAt: new Date().toISOString(),
        cacheHit: false,
        country: "UA",
        crop: "ALL",
        geoglam: {
          status: "CONSTRAINED",
          source: "GEOGLAM Crop Monitor",
          archiveUrl: "https://www.cropmonitor.org/data-archive/",
          selectedCount: 0,
          note: error?.message || "yield_food_security_unavailable",
          datasets: [],
        },
        foodPrices: {
          status: "CONSTRAINED",
          source: "FAO FFPI",
          faoRows: [],
        },
        foodSecurity: {
          status: "CONSTRAINED",
          source: "WFP + World Bank + FAO",
          score: null,
          localDeviation: null,
          globalDeviation: null,
          localScore: null,
          globalScore: null,
          marketRows: [],
          note: "Yield/Food Security endpoint unavailable",
        },
      });
    }
  });

  app.get("/api/monitor/podcasts/catalog", (req, res) => {
    try {
      const region = typeof req.query.region === "string" ? req.query.region : undefined;
      const country = typeof req.query.country === "string" ? req.query.country : undefined;
      const items = listPodcastCatalog({ region, country });
      return res.json({ items });
    } catch (error: any) {
      return res.status(500).json({
        items: [],
        message: error?.message || "Failed to load podcasts catalog",
      });
    }
  });

  app.get("/api/monitor/podcasts/:podcastId/episodes", async (req, res) => {
    try {
      const podcastId = String(req.params.podcastId || "");
      const limit = typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : 20;
      const offset = typeof req.query.offset === "string" ? Number.parseInt(req.query.offset, 10) : 0;
      const payload = await listPodcastEpisodes(podcastId, { limit, offset });
      return res.json(payload);
    } catch (error: any) {
      const message = String(error?.message || "Failed to load podcast episodes");
      if (message.startsWith("podcast_not_found:")) {
        return res.status(404).json({ message });
      }
      return res.status(500).json({
        podcast: null,
        episodes: [],
        message,
      });
    }
  });

  app.get("/api/monitor/events", (req, res) => {
    try {
      const country = typeof req.query.country === "string" ? req.query.country : undefined;
      const scope = typeof req.query.scope === "string" ? req.query.scope : undefined;
      const region = typeof req.query.region === "string" ? req.query.region : undefined;
      const segment = typeof req.query.segment === "string" ? req.query.segment : undefined;
      const payload = listAgriEvents({ country, scope, region, segment });
      return res.json(payload);
    } catch (error: any) {
      return res.status(500).json({
        generatedAt: new Date().toISOString(),
        today: null,
        items: [],
        facets: { scopes: [], countries: [] },
        message: error?.message || "Failed to load agri events",
      });
    }
  });

  app.get("/api/monitor/map-layer", async (req, res) => {
    const layer = String(req.query.layer || "food_prices_wfp").toLowerCase();
    try {
      if (layer !== "food_prices_wfp" && layer !== "chokepoints" && layer !== "weather_yield_risk" && layer !== "agri_events") {
        return res.status(400).json({
          message: `Unsupported layer: ${layer}`,
          supported: ["food_prices_wfp", "chokepoints", "weather_yield_risk", "agri_events"],
        });
      }
      if (layer === "chokepoints") {
        const payload = await getChokepointsMapLayer();
        return res.json(payload);
      }
      if (layer === "agri_events") {
        const payload = getAgriEventsMapLayer();
        return res.json(payload);
      }
      if (layer === "weather_yield_risk") {
        const threshold = resolveThreshold(typeof req.query.threshold === "string" ? req.query.threshold : undefined);
        const { items } = await getMonitorNews(req.query.refresh === "1", { threshold });
        const payload = buildWeatherYieldRiskLayer({
          news: items,
          crop: typeof req.query.crop === "string" ? req.query.crop : "all",
        });
        return res.json(payload);
      }
      const commodities = typeof req.query.commodities === "string" ? req.query.commodities : undefined;
      const countries = typeof req.query.countries === "string" ? req.query.countries.split(",").map((row) => row.trim()).filter(Boolean) : undefined;
      const forceRefresh = req.query.refresh === "1";
      const payload = await getFoodPricesMapLayer({
        grainWidgetsService,
        forceRefresh,
        commodities,
        countries,
      });
      return res.json(payload);
    } catch (error: any) {
      if (layer === "chokepoints") {
        return res.status(500).json({
          layer_id: "chokepoints",
          layer_type: "point",
          updated_at: new Date().toISOString(),
          legend: { metric: "traffic_ratio", unit: "ratio", scale: "threshold", min: 0, max: 1.2 },
          features: [],
          message: error?.message || "Failed to load chokepoints layer",
        });
      }
      if (layer === "weather_yield_risk") {
        return res.status(500).json({
          layer_id: "weather_yield_risk",
          layer_type: "region",
          updated_at: new Date().toISOString(),
          legend: { metric: "stress_score", unit: "index_0_100", scale: "sequential", min: 0, max: 100 },
          features: [],
          message: error?.message || "Failed to load weather yield risk layer",
        });
      }
      if (layer === "agri_events") {
        return res.status(500).json({
          layer_id: "agri_events",
          layer_type: "point",
          updated_at: new Date().toISOString(),
          legend: { metric: "events_count", unit: "count", scale: "sequential", min: 0, max: 0 },
          features: [],
          message: error?.message || "Failed to load agri events layer",
        });
      }
      return res.status(500).json({
        layer_id: "food_prices_wfp",
        layer_type: "country",
        updated_at: new Date().toISOString(),
        legend: { metric: "yoy_change", unit: "%", scale: "diverging", min: -0.5, max: 1.0 },
        features: [],
        message: error?.message || "Failed to load map layer",
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
      const forceRefresh = req.query.refresh === "1";
      const payload = await grainWidgetsService.list({ country, priceType, forceRefresh });
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

  app.get("/api/monitor/activation-report", async (req, res) => {
    try {
      const nowIso = new Date().toISOString();
      const deepReport = req.query.deep === "1";
      if (!deepReport) {
        await warmGrainWidgetsSnapshot();
        const grainWidgetsDebug = grainWidgetsService.debugSummary();
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
            note: "lightweight_activation_snapshot",
          },
          providers: quickProviderReport(grainWidgetsDebug.providers || []),
          fpmaDiscovery: {
            cacheHit: false,
            stale: false,
            fetchedAt: undefined,
            countriesCount: 0,
            commoditiesCount: 0,
            priceTypesCount: 0,
            endpointsTried: [],
            notes: ["skipped_in_lightweight_report_use_deep_1"],
          },
          fpmaResolutionTest: [],
          widgets: [],
          networkProbe: {},
        });
        return;
      }
      const grainWidgets = await withReportBudget(
        grainWidgetsService.list(),
        () =>
          ({
            widgets: { byKind: {} },
            meta: {},
            territories: {},
          } as any),
      );
      const grainWidgetsDebug = grainWidgetsService.debugSummary();
      const byKind = grainWidgets.widgets.byKind || {};
      const providers = grainWidgetsDebug.providers || [];
      const emptyFpmaDiscovery = {
        cacheHit: false,
        stale: false,
        fetchedAt: undefined,
        countriesCount: 0,
        commoditiesCount: 0,
        priceTypesCount: 0,
        endpointsTried: [],
        notes: ["fpma_discovery_skipped_or_timed_out"],
      };
      const fpmaDiscovery: ReturnType<typeof getFpmaDiscoveryDebug> = await withQuickReportBudget(
        fetchFpmaDiscoverySnapshot().then((snapshot) => getFpmaDiscoveryDebug(snapshot)),
        () => emptyFpmaDiscovery,
      ).catch((error: any) => ({
        ...emptyFpmaDiscovery,
        notes: [`fpma_discovery_error:${String(error?.message || "unknown")}`],
      }));
      const fpmaResolutionTest: Awaited<ReturnType<typeof runFpmaDiscoveryResolutionTest>> =
        deepReport
          ? await withQuickReportBudget(runFpmaDiscoveryResolutionTest(), () => [], REPORT_FPMA_BUDGET_MS)
          : [];

      const providerToKind: Record<string, "GLOBAL_SPOT_TABLE" | "CROP_PRICE_INDEX" | "USDA_MARS_REPORTS" | "US_CASH_EXPORT_CONTEXT" | "USDA_MARS_DAILY_MARKET_RATES_TXT" | "ALPHAVANTAGE_GRAIN_BENCHMARKS" | "NASDAQ_DATA_LINK_SNAPSHOT" | "EC_CEREALS_MULTI_COUNTRY" | "EC_OILSEEDS_MULTI_COUNTRY" | "USDA_NASS_PRODUCER_PRICES" | "WFP_MARKET_PRICES_MULTI_COUNTRY" | "WB_MICRODATA_MARKET_PRICES" | "EUROSTAT_AGRI_PRICE_INDICES" | "USDA_PSD_BALANCES" | "AMIS_GLOBAL_BALANCE" | "IMF_COMMODITY_BENCHMARKS" | "OECD_AGRICULTURAL_OUTLOOK" | "USDA_GTR_LOGISTICS_SNAPSHOT" | "CANADA_GRAIN_RAIL_PERFORMANCE" | "FAOSTAT_PP_MULTI_COUNTRY" | "FPMA_MARKET_PRICES_MULTI_COUNTRY"> = {
        "dbnomics-worldbank": "GLOBAL_SPOT_TABLE",
        "fao-ffpi": "CROP_PRICE_INDEX",
        "usda-mars-public": "USDA_MARS_REPORTS",
        "us-cash-export-context": "US_CASH_EXPORT_CONTEXT",
        "usda-mars-daily-txt": "USDA_MARS_DAILY_MARKET_RATES_TXT",
        "alpha-vantage-commodities": "ALPHAVANTAGE_GRAIN_BENCHMARKS",
        "nasdaq-datalink": "NASDAQ_DATA_LINK_SNAPSHOT",
        "ec-cereals-prices": "EC_CEREALS_MULTI_COUNTRY",
        "ec-oilseeds-prices": "EC_OILSEEDS_MULTI_COUNTRY",
        "usda-nass-quickstats": "USDA_NASS_PRODUCER_PRICES",
        "wfp-databridges": "WFP_MARKET_PRICES_MULTI_COUNTRY",
        "worldbank-microdata": "WB_MICRODATA_MARKET_PRICES",
        "eurostat-agri-indices": "EUROSTAT_AGRI_PRICE_INDICES",
        "usda-psd": "USDA_PSD_BALANCES",
        "amis-outlook": "AMIS_GLOBAL_BALANCE",
        "imf-pcps": "IMF_COMMODITY_BENCHMARKS",
        "oecd-agricultural-outlook": "OECD_AGRICULTURAL_OUTLOOK",
        "usda-gtr-logistics": "USDA_GTR_LOGISTICS_SNAPSHOT",
        "canada-grain-rail-performance": "CANADA_GRAIN_RAIL_PERFORMANCE",
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
        if (id.includes("ec-cereals") || id.includes("ec-oilseeds")) return source.includes("ec agri") || source.includes("european commission");
        if (id.includes("usda-nass")) return source.includes("nass");
        if (id.includes("wfp")) return source.includes("wfp");
        if (id.includes("worldbank")) return source.includes("world bank");
        if (id.includes("eurostat")) return source.includes("eurostat");
        if (id.includes("usda-psd")) return source.includes("usda");
        if (id.includes("amis")) return source.includes("amis");
        if (id.includes("imf")) return source.includes("imf");
        if (id.includes("oecd")) return source.includes("oecd");
        if (id.includes("usda-gtr")) return source.includes("usda");
        if (id.includes("canada-grain-rail")) return source.includes("statistics canada") || source.includes("statcan");
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
        "ec-cereals-prices": 5,
        "ec-oilseeds-prices": 3,
        "usda-nass-quickstats": 3,
        "wfp-databridges": 3,
        "worldbank-microdata": 3,
        "eurostat-agri-indices": 3,
        "usda-psd": 8,
        "amis-outlook": 4,
        "imf-pcps": 4,
        "oecd-agricultural-outlook": 5,
        "usda-gtr-logistics": 2,
        "canada-grain-rail-performance": 4,
        "faostat-pp": 5,
        "fpma-market-prices": 5,
      };
      const indicativeProviders = new Set([
        "oecd-agricultural-outlook",
        "wfp-databridges",
        "faostat-pp",
        "fpma-market-prices",
        "usda-psd",
      ]);
      const normalizeStatus = (providerId: string, rawStatus: string, mappedCount: number) => {
        const status = String(rawStatus || "OFFLINE").toUpperCase();
        if (!indicativeProviders.has(providerId)) return status;
        if (status === "REFRESH" || status === "LIVE") return status;
        return mappedCount > 0 ? "INDICATIVE" : "CONSTRAINED";
      };

      const providerReport: any[] = ["dbnomics-worldbank", "fao-ffpi", "usda-mars-public", "us-cash-export-context", "usda-mars-daily-txt", "alpha-vantage-commodities", "nasdaq-datalink", "ec-cereals-prices", "ec-oilseeds-prices", "usda-nass-quickstats", "wfp-databridges", "worldbank-microdata", "eurostat-agri-indices", "usda-psd", "amis-outlook", "imf-pcps", "oecd-agricultural-outlook", "usda-gtr-logistics", "canada-grain-rail-performance", "faostat-pp", "fpma-market-prices"].map((providerId) => {
        const provider = providers.find((item: any) => item.providerId === providerId);
        const kind = providerToKind[providerId];
        const widget = byKind[kind] as any;
        const providerError = normalizeProviderError(provider?.error || (provider?.errorKind ? String(provider.errorKind) : undefined));
        const status = widget && sourceMatchesProvider(widget.sourceName, providerId)
          ? widget.status
          : provider?.status === "ok"
            ? "REFRESH"
            : provider?.status === "partial"
              ? "FALLBACK"
              : "OFFLINE";
        const mappedCount = provider?.mappedCount ?? 0;
        const normalizedStatus = normalizeStatus(providerId, status, mappedCount);

        return {
          providerId,
          enabled: Boolean(provider?.enabled),
          status: normalizedStatus,
          sourceUrlUsed: redactSensitiveUrl(provider?.sourceUrlUsed || widget?.sourceUrl),
          expectedCount: provider?.expectedCount ?? expectedCoverage[providerId],
          mappedCount,
          coverage: provider?.coverage || `${mappedCount}/${provider?.expectedCount ?? expectedCoverage[providerId]}`,
          reportsFetched: provider?.reportsFetched,
          reportsScanned: provider?.reportsScanned,
          reportsMatchedInclude: provider?.reportsMatchedInclude,
          reportsExcluded: provider?.reportsExcluded,
          reportsReturnedTop: provider?.reportsReturnedTop,
          linesFetched: provider?.linesFetched,
          linesMatched: provider?.linesMatched,
          downloadUrlUsed:
            redactSensitiveUrl(
              provider?.downloadUrlUsed ||
              (widget?.kind === "USDA_MARS_DAILY_MARKET_RATES_TXT" ? widget?.debug?.downloadUrlUsed : undefined),
            ),
          parseMode: provider?.parseMode,
          topScoreMin: provider?.topScoreMin,
          topScoreMax: provider?.topScoreMax,
          unitConfidenceByFunction: provider?.unitConfidenceByFunction,
          datasetStatuses: provider?.datasetStatuses,
          rowsParsed: provider?.rowsParsed,
          columnsDetected: provider?.columnsDetected,
          seriesPoints: provider?.seriesPoints,
          httpStatus: provider?.httpStatus,
          finalUrl: redactSensitiveUrl(provider?.finalUrl),
          responseHeaders: provider?.responseHeaders,
          transportUsed: provider?.transportUsed,
          rangeRequestUsed: provider?.rangeRequestUsed,
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
          query: redactSensitiveQuery(provider?.query),
          cadence: provider?.cadence,
          datasetUrlChosen: redactSensitiveUrl(provider?.datasetUrlChosen || (widget?.kind === "USDA_GTR_LOGISTICS_SNAPSHOT" ? widget?.debug?.datasetUrlChosen : undefined)),
          lastFetchAt: provider?.lastSuccessAt || provider?.lastAttemptAt,
          cacheHit: Boolean(provider?.cacheHit),
          fallbackChainUsed: provider?.fallbackChain || "real->cache->mock",
          lastError: providerError,
          notes: [
            ...(provider?.notes || []),
            ...(providerId === "nasdaq-datalink" && normalizedStatus !== "REFRESH" && NASDAQ_DATASETS.every((dataset) => String(dataset).startsWith("FRED/")) && providerError?.errorKind === "BLOCKED"
              ? ["FRED datasets requested; upstream returned 403", "likely access/quota/premium restriction"]
              : []),
            ...(providerId === "fpma-market-prices" && String(provider?.error || "").includes("html_response:")
              ? ["Current FPMA base/path returned an HTML shell instead of JSON API data", "verify the correct FPMA JSON endpoint before enabling live mode"]
              : []),
            ...(providerId === "faostat-pp" && providerError?.errorKind === "TIMEOUT"
              ? ["FAOSTAT upstream is slow or unresponsive from the current runtime", "keep fallback enabled unless a longer live timeout is acceptable"]
              : []),
            ...(providerId === "usda-gtr-logistics" && providerError?.httpStatus === 403
              ? ["Probe succeeds but runtime binary retrieval is blocked", "inspect provider finalUrl/headers/transportUsed for AMS behavior differences"]
              : []),
          ],
        };
      });

      const dbnomicsCore10 = await withQuickReportBudget(
        probeDbnomicsCore10({
          baseUrl: DBNOMICS_API_BASE_URL,
          timeoutMs: Math.min(GRAIN_WIDGETS_FETCH_TIMEOUT_MS, REPORT_PROBE_TIMEOUT_MS),
        }),
        () => ({
          items: [],
          summary: {
            total: 10,
            ready: 0,
            coverage: "0/10",
            status: "CONSTRAINED" as const,
            errorKind: "UNKNOWN" as const,
          },
        }),
      );
      providerReport.push({
        providerId: "dbnomics-core10",
        enabled: true,
        status: dbnomicsCore10.summary.status,
        sourceUrlUsed: `${DBNOMICS_API_BASE_URL}/datasets/IMF/PCPS`,
        expectedCount: dbnomicsCore10.summary.total,
        mappedCount: dbnomicsCore10.summary.ready,
        coverage: dbnomicsCore10.summary.coverage,
        lastFetchAt: nowIso,
        cacheHit: false,
        fallbackChainUsed: "real->cache->mock",
        lastError: dbnomicsCore10.summary.errorKind
          ? {
              name: "ProviderError",
              code: undefined,
              message: `core10_probe_${String(dbnomicsCore10.summary.errorKind).toLowerCase()}`,
              httpStatus: undefined,
              errorKind:
                dbnomicsCore10.summary.errorKind === "PARSE_ERROR"
                  ? "PARSE_ERROR"
                  : dbnomicsCore10.summary.errorKind,
            }
          : undefined,
        notes: [
          "Core 10 DBnomics registry readiness (IMF PCPS + WB commodity_prices)",
          ...dbnomicsCore10.items
            .filter((item) => item.status !== "READY")
            .slice(0, 4)
            .map((item) => `${item.id}:${item.status}${item.errorKind ? `:${item.errorKind}` : ""}`),
        ],
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
        "EC_CEREALS_MULTI_COUNTRY",
        "EC_OILSEEDS_MULTI_COUNTRY",
        "USDA_NASS_PRODUCER_PRICES",
        "WFP_MARKET_PRICES_MULTI_COUNTRY",
        "WB_MICRODATA_MARKET_PRICES",
        "EUROSTAT_AGRI_PRICE_INDICES",
        "USDA_PSD_BALANCES",
        "AMIS_GLOBAL_BALANCE",
        "IMF_COMMODITY_BENCHMARKS",
        "OECD_AGRICULTURAL_OUTLOOK",
        "USDA_GTR_LOGISTICS_SNAPSHOT",
        "CANADA_GRAIN_RAIL_PERFORMANCE",
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
        const canadaItemsCount = widget?.kind === "CANADA_GRAIN_RAIL_PERFORMANCE" && Array.isArray(widget?.items) ? widget.items.length : 0;
        const wfpRowsCount = widget?.kind === "WFP_MARKET_PRICES_MULTI_COUNTRY" && Array.isArray(widget?.rows) ? widget.rows.length : 0;
        const wbRowsCount = widget?.kind === "WB_MICRODATA_MARKET_PRICES" && Array.isArray(widget?.rows) ? widget.rows.length : 0;
        const eurostatItemsCount = widget?.kind === "EUROSTAT_AGRI_PRICE_INDICES" && Array.isArray(widget?.items) ? widget.items.length : 0;
        const usdaPsdRowsCount = widget?.kind === "USDA_PSD_BALANCES" && Array.isArray(widget?.rows) ? widget.rows.length : 0;
        const amisItemsCount = widget?.kind === "AMIS_GLOBAL_BALANCE" && Array.isArray(widget?.items) ? widget.items.length : 0;
        const imfRowsCount = widget?.kind === "IMF_COMMODITY_BENCHMARKS" && Array.isArray(widget?.rows) ? widget.rows.length : 0;
        const oecdItemsCount = widget?.kind === "OECD_AGRICULTURAL_OUTLOOK" && Array.isArray(widget?.items) ? widget.items.length : 0;
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
          canadaItemsCount,
          wfpRowsCount,
          wbRowsCount,
          eurostatItemsCount,
          usdaPsdRowsCount,
          amisItemsCount,
          imfRowsCount,
          oecdItemsCount,
          logisticsDatasetUrlChosen: widget?.kind === "USDA_GTR_LOGISTICS_SNAPSHOT" ? widget?.debug?.datasetUrlChosen : undefined,
          logisticsColumnsDetected: widget?.kind === "USDA_GTR_LOGISTICS_SNAPSHOT" ? widget?.debug?.columnsDetected : undefined,
          logisticsSeriesPoints: widget?.kind === "USDA_GTR_LOGISTICS_SNAPSHOT" ? widget?.debug?.seriesPoints : undefined,
          logisticsHttpStatus: widget?.kind === "USDA_GTR_LOGISTICS_SNAPSHOT" ? widget?.debug?.httpStatus : undefined,
          logisticsFinalUrl: widget?.kind === "USDA_GTR_LOGISTICS_SNAPSHOT" ? redactSensitiveUrl(widget?.debug?.finalUrl) : undefined,
          logisticsResponseHeaders: widget?.kind === "USDA_GTR_LOGISTICS_SNAPSHOT" ? widget?.debug?.responseHeaders : undefined,
          logisticsTransportUsed: widget?.kind === "USDA_GTR_LOGISTICS_SNAPSHOT" ? widget?.debug?.transportUsed : undefined,
          logisticsRangeRequestUsed: widget?.kind === "USDA_GTR_LOGISTICS_SNAPSHOT" ? widget?.debug?.rangeRequestUsed : undefined,
          faostatRowsCount,
          fpmaRowsCount,
          selectedPriceType: widget?.kind === "FPMA_MARKET_PRICES_MULTI_COUNTRY" ? widget?.summary?.selectedPriceType : undefined,
          dailyMetadataSourceUrl: widget?.kind === "USDA_MARS_DAILY_MARKET_RATES_TXT" ? widget?.debug?.metadataSourceUrl : undefined,
          dailyDownloadUrlUsed: widget?.kind === "USDA_MARS_DAILY_MARKET_RATES_TXT" ? redactSensitiveUrl(widget?.debug?.downloadUrlUsed) : undefined,
          dailyReportFound: widget?.kind === "USDA_MARS_DAILY_MARKET_RATES_TXT" ? widget?.debug?.dailyReportFound : undefined,
          reportsToday: widget?.kind === "US_CASH_EXPORT_CONTEXT" ? widget?.summary?.reportsToday ?? 0 : undefined,
          exportIndications: widget?.kind === "US_CASH_EXPORT_CONTEXT" ? Boolean(widget?.summary?.exportIndications) : undefined,
          notes: (widget?.notes || []).slice(0, 4),
          seriesPointsCount,
          hasSparklineEligibleSeries: hasSparklineEligibleSeries(widget),
        };
      });

      const marsIndexProbeUrl = USDA_MARS_PUBLIC_INDEX_URLS[0] || `${USDA_MARS_BASE_URL.replace(/\/+$/, "")}/listPublishedReports`;
      const marsDailyTxtSource =
        (byKind["USDA_MARS_DAILY_MARKET_RATES_TXT"] as any)?.debug?.downloadUrlUsed ||
        providers.find((provider: any) => provider.providerId === "usda-mars-daily-txt")?.downloadUrlUsed ||
        providers.find((provider: any) => provider.providerId === "usda-mars-daily-txt")?.sourceUrlUsed ||
        marsIndexProbeUrl;
      const alphaProbeUrl = `${ALPHAVANTAGE_BASE_URL}?function=${encodeURIComponent(ALPHAVANTAGE_FUNCTIONS[0] || "WHEAT")}&interval=monthly${ALPHAVANTAGE_API_KEY ? "&apikey=REDACTED" : ""}`;
      const nasdaqProbeDataset = NASDAQ_DATASETS[0] || "FRED/DGS10";
      const [nasdaqDb, ...nasdaqRest] = nasdaqProbeDataset.split("/");
      const nasdaqDatasetCode = nasdaqRest.join("/") || "DGS10";
      const nasdaqProbeRawUrl = `${NASDAQ_BASE_URL.replace(/\/+$/, "")}/datasets/${encodeURIComponent(nasdaqDb || "FRED")}/${encodeURIComponent(nasdaqDatasetCode)}.json?rows=1${NASDAQ_API_KEY ? `&api_key=${encodeURIComponent(NASDAQ_API_KEY)}` : ""}`;
      const nasdaqProbeUrl = `${NASDAQ_BASE_URL.replace(/\/+$/, "")}/datasets/${encodeURIComponent(nasdaqDb || "FRED")}/${encodeURIComponent(nasdaqDatasetCode)}.json?rows=1${NASDAQ_API_KEY ? "&api_key=REDACTED" : ""}`;
      const usdaNassProbeRawUrl = `${USDA_NASS_BASE_URL}?commodity_desc=CORN&agg_level_desc=NATIONAL&statisticcat_desc=PRICE%20RECEIVED&format=JSON${USDA_NASS_API_KEY ? `&key=${encodeURIComponent(USDA_NASS_API_KEY)}` : ""}`;
      const usdaNassProbeUrl = `${USDA_NASS_BASE_URL}?commodity_desc=CORN&agg_level_desc=NATIONAL&statisticcat_desc=PRICE%20RECEIVED&format=JSON${USDA_NASS_API_KEY ? "&key=REDACTED" : ""}`;
      const usdaGtrProbeUrl = USDA_GTR_DATASET_URLS[0] || "https://www.ams.usda.gov/services/transportation-analysis/grain-transportation-report";
      const canadaRailProbeUrl = `${CANADA_RAIL_WDS_BASE_URL.replace(/\/+$/, "")}/getFullTableDownloadCSV/${CANADA_RAIL_PRODUCT_ID}/en`;
      const wfpProbeRawUrl = `${WFP_DATABRIDGES_BASE_URL}?limit=1`;
      const wfpProbeUrl = redactSensitiveUrl(wfpProbeRawUrl);
      const wbProbeUrl = WB_MICRODATA_CSV_URL || `${WB_MICRODATA_BASE_URL.replace(/\/+$/, "")}/data-api`;
      const eurostatProbeUrl = `${EUROSTAT_BASE_URL.replace(/\/+$/, "")}/apri_pi20_outq?geo=FR&lang=en&format=JSON`;
      const usdaPsdProbeRawUrl = `${USDA_FAS_OPENDATA_BASE_URL.replace(/\/+$/, "")}/psd/commodities`;
      const usdaPsdProbeUrl = redactSensitiveUrl(usdaPsdProbeRawUrl);
      const faostatProbeUrl = `${FAOSTAT_BASE_URL.replace(/\/+$/, "")}/definitions/types/area`;
      const faostatSampleProbeUrl = `${FAOSTAT_BASE_URL.replace(/\/+$/, "")}/data/PP?area=231&item=15&year=2022&outputType=json`;
      const fpmaProbeUrl = `${FPMA_API_BASE_URL.replace(/\/+$/, "")}/prices?format=json`;
      const oecdSdmxProbeUrl = `${OECD_AGRICULTURAL_OUTLOOK_SDMX_BASE_URL.replace(/\/+$/, "")}/${OECD_AGRICULTURAL_OUTLOOK_SDMX_DATASET}?format=structure`;
      const [
        dbnomicsProbe,
        faoProbe,
        marsProbe,
        marsDailyTxtProbe,
        alphaProbe,
        nasdaqProbeResult,
        ecCerealsProbe,
        ecOilseedsProbe,
        usdaNassProbeResult,
        usdaGtrProbe,
        canadaRailProbe,
        wfpProbe,
        wbProbe,
        eurostatProbe,
        usdaPsdProbe,
        amisProbe,
        imfProbe,
        oecdProbe,
        faostatProbe,
        faostatSampleProbe,
        fpmaProbe,
      ] = await Promise.all([
        probeUrl(`${DBNOMICS_API_BASE_URL}/series/WB/commodity_prices/FMAIZE.1W?observations=true`, { timeoutMs: REPORT_PROBE_TIMEOUT_MS }),
        probeUrl(FAO_FFPI_URL, { timeoutMs: REPORT_PROBE_TIMEOUT_MS }),
        probeUrl(marsIndexProbeUrl, { timeoutMs: REPORT_PROBE_TIMEOUT_MS }),
        probeUrl(marsDailyTxtSource, { timeoutMs: REPORT_PROBE_TIMEOUT_MS }),
        probeUrl(ALPHAVANTAGE_BASE_URL, { timeoutMs: REPORT_PROBE_TIMEOUT_MS }),
        probeUrl(nasdaqProbeRawUrl, { timeoutMs: REPORT_PROBE_TIMEOUT_MS }),
        probeUrl(`${EC_AGRI_API_BASE_URL.replace(/\/+$/, "")}/${EC_CEREALS_API_PATH.replace(/^\/+/, "")}/products`, { timeoutMs: clampReportProbeTimeout(EC_AGRI_TIMEOUT_MS) }),
        probeUrl(`${EC_AGRI_API_BASE_URL.replace(/\/+$/, "")}/${EC_OILSEEDS_API_PATH.replace(/^\/+/, "")}/products`, { timeoutMs: clampReportProbeTimeout(EC_AGRI_TIMEOUT_MS) }),
        probeUrl(usdaNassProbeRawUrl, { timeoutMs: clampReportProbeTimeout(USDA_NASS_TIMEOUT_MS) }),
        probeUrl(usdaGtrProbeUrl, {
          timeoutMs: REPORT_PROBE_TIMEOUT_MS,
          headers: {
            accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*",
          },
        }),
        probeUrl(canadaRailProbeUrl, { timeoutMs: clampReportProbeTimeout(CANADA_RAIL_TIMEOUT_MS) }),
        probeUrl(wfpProbeRawUrl, {
          timeoutMs: clampReportProbeTimeout(WFP_DATABRIDGES_TIMEOUT_MS),
          headers: WFP_DATABRIDGES_TOKEN ? { authorization: `Bearer ${WFP_DATABRIDGES_TOKEN}` } : undefined,
        }),
        probeUrl(wbProbeUrl, { timeoutMs: clampReportProbeTimeout(WB_MICRODATA_TIMEOUT_MS) }),
        probeUrl(eurostatProbeUrl, { timeoutMs: clampReportProbeTimeout(EUROSTAT_TIMEOUT_MS) }),
        probeUrl(usdaPsdProbeRawUrl, {
          timeoutMs: clampReportProbeTimeout(USDA_PSD_TIMEOUT_MS),
          headers: USDA_FAS_API_KEY ? { API_KEY: USDA_FAS_API_KEY } : undefined,
        }),
        probeUrl(AMIS_MARKET_MONITOR_URL, { timeoutMs: clampReportProbeTimeout(AMIS_TIMEOUT_MS) }),
        probeUrl(IMF_PCPS_TABLE2_URL, { timeoutMs: clampReportProbeTimeout(IMF_PCPS_TIMEOUT_MS) }),
        probeUrl(oecdSdmxProbeUrl, { timeoutMs: clampReportProbeTimeout(OECD_AGRICULTURAL_OUTLOOK_TIMEOUT_MS) }),
        probeUrl(faostatProbeUrl, { timeoutMs: clampReportProbeTimeout(FAOSTAT_TIMEOUT_MS) }),
        probeUrl(faostatSampleProbeUrl, { timeoutMs: clampReportProbeTimeout(FAOSTAT_TIMEOUT_MS) }),
        probeUrl(fpmaProbeUrl, { timeoutMs: REPORT_PROBE_TIMEOUT_MS }),
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
            ENABLE_USDA_MARS_DAILY_TXT,
            ENABLE_USDA_GTR_LOGISTICS_WIDGET,
            ENABLE_ALPHAVANTAGE_PROVIDER,
            ENABLE_NASDAQ_DATALINK_PROVIDER,
            ENABLE_EC_CEREALS_WIDGET,
            ENABLE_EC_OILSEEDS_WIDGET,
            ENABLE_USDA_NASS_WIDGET,
            ENABLE_WFP_MARKET_PRICES_WIDGET,
            ENABLE_WB_MICRODATA_WIDGET,
            ENABLE_EUROSTAT_AGRI_PRICE_INDICES_WIDGET,
            ENABLE_USDA_PSD_WIDGET,
            ENABLE_AMIS_GLOBAL_BALANCE_WIDGET,
            ENABLE_IMF_PCPS_WIDGET,
            ENABLE_OECD_AGRICULTURAL_OUTLOOK_WIDGET,
            ENABLE_CANADA_GRAIN_RAIL_WIDGET,
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
            EC_AGRI_API_BASE_URL: EC_AGRI_API_BASE_URL ? "present" : "missing",
            USDA_NASS_BASE_URL: USDA_NASS_BASE_URL ? "present" : "missing",
            USDA_NASS_API_KEY: USDA_NASS_API_KEY ? "present" : "missing",
            WFP_DATABRIDGES_BASE_URL: WFP_DATABRIDGES_BASE_URL ? "present" : "missing",
            WFP_DATABRIDGES_TOKEN: WFP_DATABRIDGES_TOKEN ? "present" : "missing",
            WB_MICRODATA_BASE_URL: WB_MICRODATA_BASE_URL ? "present" : "missing",
            WB_MICRODATA_CSV_URL: WB_MICRODATA_CSV_URL ? "present" : "missing",
            EUROSTAT_BASE_URL: EUROSTAT_BASE_URL ? "present" : "missing",
            USDA_FAS_OPENDATA_BASE_URL: USDA_FAS_OPENDATA_BASE_URL ? "present" : "missing",
            USDA_FAS_API_KEY: USDA_FAS_API_KEY ? "present" : "missing",
            AMIS_MARKET_MONITOR_URL: AMIS_MARKET_MONITOR_URL ? "present" : "missing",
            IMF_PCPS_TABLE2_URL: IMF_PCPS_TABLE2_URL ? "present" : "missing",
            OECD_AGRICULTURAL_OUTLOOK_CEREALS_URL: OECD_AGRICULTURAL_OUTLOOK_CEREALS_URL ? "present" : "missing",
            OECD_AGRICULTURAL_OUTLOOK_SDMX_BASE_URL: OECD_AGRICULTURAL_OUTLOOK_SDMX_BASE_URL ? "present" : "missing",
            OECD_AGRICULTURAL_OUTLOOK_SDMX_DATASET: OECD_AGRICULTURAL_OUTLOOK_SDMX_DATASET ? "present" : "missing",
            OECD_AGRICULTURAL_OUTLOOK_SDMX_START_PERIOD: OECD_AGRICULTURAL_OUTLOOK_SDMX_START_PERIOD ? "present" : "missing",
            CANADA_RAIL_WDS_BASE_URL: CANADA_RAIL_WDS_BASE_URL ? "present" : "missing",
            FAOSTAT_BASE_URL: FAOSTAT_BASE_URL ? "present" : "missing",
            FPMA_API_BASE_URL: FPMA_API_BASE_URL ? "present" : "missing",
            FPMA_DATA_PATHS,
            GRAIN_WIDGETS_FETCH_TIMEOUT_MS,
            GRAIN_WIDGETS_CACHE_TTL_MS,
          },
        },
        providers: providerReport,
        fpmaDiscovery,
        fpmaResolutionTest,
        dbnomicsCore10,
        widgets: widgetSnapshot,
        networkProbe: {
          dbnomics: dbnomicsProbe,
          dbnomicsCore10Summary: dbnomicsCore10.summary,
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
          ecCereals: ecCerealsProbe,
          ecOilseeds: ecOilseedsProbe,
          usdaNass: {
            ...usdaNassProbeResult,
            url: usdaNassProbeUrl,
          },
          wfpDataBridges: {
            ...wfpProbe,
            url: wfpProbeUrl,
          },
          worldBankMicrodata: wbProbe,
          eurostatAgriIndices: eurostatProbe,
          usdaPsd: {
            ...usdaPsdProbe,
            url: usdaPsdProbeUrl,
          },
          amisOutlook: amisProbe,
          imfPcps: imfProbe,
          oecdAgriculturalOutlook: oecdProbe,
          usdaGtrLogistics: usdaGtrProbe,
          canadaRailPerformance: canadaRailProbe,
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
      if (req.query.deep !== "1") {
        await warmGrainWidgetsSnapshot();
        const report = quickTriageReport(grainWidgetsService.debugSummary().providers || []);
        if (req.query.format === "md") {
          res.type("text/markdown").send(triageReportToMarkdown(report));
          return;
        }
        res.json(report);
        return;
      }
      const report = await withReportBudget(
        buildMonitorTriageReport(grainWidgetsService),
        () => ({
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
            message: "triage_report_timeout_budget_hit",
          },
        } as any),
      );
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
