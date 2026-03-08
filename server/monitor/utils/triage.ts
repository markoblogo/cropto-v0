import { lookup } from "node:dns/promises";
import {
  AMIS_MARKET_MONITOR_URL,
  AMIS_TIMEOUT_MS,
  CANADA_RAIL_PRODUCT_ID,
  CANADA_RAIL_WDS_BASE_URL,
  EC_AGRI_API_BASE_URL,
  EC_CEREALS_API_PATH,
  EC_OILSEEDS_API_PATH,
  ENABLE_CANADA_GRAIN_RAIL_WIDGET,
  ENABLE_EUROSTAT_AGRI_PRICE_INDICES_WIDGET,
  ENABLE_FAOSTAT_PP_WIDGET,
  ENABLE_AMIS_GLOBAL_BALANCE_WIDGET,
  ENABLE_EC_CEREALS_WIDGET,
  ENABLE_EC_OILSEEDS_WIDGET,
  ENABLE_IMF_PCPS_WIDGET,
  ENABLE_NASDAQ_CHRIS,
  ENABLE_NASDAQ_DATALINK_PROVIDER,
  ENABLE_OECD_AGRICULTURAL_OUTLOOK_WIDGET,
  ENABLE_FPMA_MARKET_PRICES_WIDGET,
  ENABLE_WB_MICRODATA_WIDGET,
  ENABLE_WFP_MARKET_PRICES_WIDGET,
  ENABLE_USDA_PSD_WIDGET,
  ENABLE_USDA_NASS_WIDGET,
  ENABLE_USDA_GTR_LOGISTICS_WIDGET,
  ENABLE_USDA_MARS_DAILY_TXT,
  EUROSTAT_BASE_URL,
  EUROSTAT_TIMEOUT_MS,
  FAOSTAT_BASE_URL,
  FAOSTAT_TIMEOUT_MS,
  FPMA_API_BASE_URL,
  FPMA_DATA_PATHS,
  GRAIN_WIDGETS_CACHE_TTL_MS,
  GRAIN_WIDGETS_FETCH_TIMEOUT_MS,
  IMF_PCPS_TABLE2_URL,
  IMF_PCPS_TIMEOUT_MS,
  NASDAQ_API_KEY,
  NASDAQ_BASE_URL,
  NASDAQ_CHRIS_DATASETS,
  NASDAQ_DATASETS,
  USDA_NASS_API_KEY,
  USDA_NASS_BASE_URL,
  USDA_FAS_API_KEY,
  USDA_FAS_OPENDATA_BASE_URL,
  USDA_PSD_TIMEOUT_MS,
  USDA_GTR_DATASET_URLS,
  USDA_MARS_BASE_URL,
  USDA_MARS_PUBLIC_INDEX_URLS,
  WB_MICRODATA_BASE_URL,
  WB_MICRODATA_CSV_URL,
  WB_MICRODATA_TIMEOUT_MS,
  WFP_DATABRIDGES_BASE_URL,
  WFP_DATABRIDGES_TIMEOUT_MS,
  WFP_DATABRIDGES_TOKEN,
  OECD_AGRICULTURAL_OUTLOOK_CEREALS_URL,
  OECD_AGRICULTURAL_OUTLOOK_TIMEOUT_MS,
} from "../grainWidgets/config";
import { fetchFpmaDiscoverySnapshot, getFpmaDiscoveryDebug, runFpmaDiscoveryResolutionTest } from "../grainWidgets/providers/fpmaDiscovery";
import { fetchWithHeaders } from "../grainWidgets/providers/utils";

type TriageErrorKind =
  | "CONFIG_MISSING"
  | "DNS"
  | "TIMEOUT"
  | "BLOCKED"
  | "HTTP_4XX"
  | "HTTP_5XX"
  | "PARSE"
  | "EMPTY"
  | "RATE_LIMIT"
  | "UNKNOWN";

type ProbeResult = {
  url?: string;
  ok: boolean;
  httpStatus?: number;
  elapsedMs: number;
  errorKind?: TriageErrorKind;
  errorMessage?: string;
  resolvedIp?: string;
};

type SuggestedFix = {
  severity: "BLOCKER" | "WARN" | "INFO";
  type: "SET_ENV" | "CHANGE_CONFIG" | "CODE_FIX" | "NO_ACTION";
  actions: string[];
  envKeys?: string[];
  exampleValues?: string[];
  why?: string;
  verifyUrl?: string;
};

function redactUrl(url?: string): string | undefined {
  if (!url) return undefined;
  return url
    .replace(/([?&](?:api_?key|apikey)=)[^&]+/gi, "$1REDACTED")
    .replace(/(\/datasets\/[^?]+\?rows=\d+&api_key=)[^&]+/gi, "$1REDACTED");
}

function classifyErrorKind(args: {
  message?: string;
  code?: string;
  httpStatus?: number;
  configMissing?: boolean;
}): TriageErrorKind {
  if (args.configMissing) return "CONFIG_MISSING";
  const message = String(args.message || "").toLowerCase();
  const code = String(args.code || "").toUpperCase();
  const status = args.httpStatus;
  if (code === "ENOTFOUND" || message.includes("enotfound") || message.includes("could not resolve host")) return "DNS";
  if (code === "ETIMEDOUT" || code === "ABORT_ERR" || message.includes("timed out") || message.includes("aborted")) return "TIMEOUT";
  if (message.includes("rate_limit") || message.includes("rate limit")) return "RATE_LIMIT";
  if (status === 403 || message.includes("forbidden") || message.includes("blocked")) return "BLOCKED";
  if (status != null && status >= 400 && status < 500) return "HTTP_4XX";
  if (status != null && status >= 500) return "HTTP_5XX";
  if (message.includes("parse")) return "PARSE";
  if (message.includes("empty") || message.includes("no_data") || message.includes("coverage_empty")) return "EMPTY";
  return "UNKNOWN";
}

function normalizeProviderError(error?: string, configMissing = false) {
  if (!error && !configMissing) return undefined;
  const statusMatch = String(error || "").match(/HTTP\s+(\d{3})/i);
  const httpStatus = statusMatch ? Number.parseInt(statusMatch[1], 10) : undefined;
  const codeMatch = String(error || "").match(/\b(ENOTFOUND|ETIMEDOUT|ABORT_ERR)\b/i);
  const code = codeMatch?.[1]?.toUpperCase();
  return {
    code,
    httpStatus,
    message: error || "config_missing",
    errorKind: classifyErrorKind({ message: error, code, httpStatus, configMissing }),
  };
}

function inferProviderErrorKind(args: {
  providerId: string;
  providerErrorKind?: TriageErrorKind;
  providerError?: string;
  probe?: ProbeResult;
  fpmaDiscovery?: ReturnType<typeof getFpmaDiscoveryDebug>;
}): TriageErrorKind | undefined {
  if (args.providerErrorKind && args.providerErrorKind !== "UNKNOWN") return args.providerErrorKind;
  const providerErrorText = String(args.providerError || "").toLowerCase();
  if (args.providerId === "faostat-pp") {
    if (args.probe?.errorKind === "TIMEOUT") return "TIMEOUT";
    if (providerErrorText.includes("aborted") || providerErrorText.includes("timeout")) return "TIMEOUT";
  }
  if (args.providerId === "fpma-market-prices") {
    const endpoints = args.fpmaDiscovery?.endpointsTried || [];
    const htmlEndpoint = endpoints.find((entry) => (entry.contentType || "").includes("text/html"));
    if (htmlEndpoint) return "PARSE";
    if (args.probe?.ok && args.fpmaDiscovery && args.fpmaDiscovery.countriesCount === 0 && args.fpmaDiscovery.commoditiesCount === 0) {
      return "PARSE";
    }
    if (providerErrorText.includes("html_response") || providerErrorText.includes("parse")) return "PARSE";
    if (providerErrorText.includes("empty")) return "EMPTY";
  }
  if (args.providerId === "usda-gtr-logistics") {
    if (providerErrorText.includes("403") || providerErrorText.includes("blocked")) return "BLOCKED";
    if (args.probe?.errorKind === "HTTP_4XX") return "HTTP_4XX";
  }
  if (args.providerId === "nasdaq-datalink") {
    const datasetsAreCleanFRED = NASDAQ_DATASETS.length > 0 && NASDAQ_DATASETS.every((value) => String(value).startsWith("FRED/"));
    if (datasetsAreCleanFRED && !ENABLE_NASDAQ_CHRIS && (args.probe?.httpStatus === 403 || providerErrorText.includes("forbidden") || providerErrorText.includes("blocked"))) {
      return "BLOCKED";
    }
    if (providerErrorText.includes("red/dgs10")) return "PARSE";
    if (args.probe?.errorKind === "HTTP_4XX") return "HTTP_4XX";
    if (providerErrorText.includes("forbidden") || providerErrorText.includes("blocked")) return "HTTP_4XX";
  }
  return args.providerErrorKind || args.probe?.errorKind || normalizeProviderError(args.providerError)?.errorKind;
}

async function probeUrl(url: string | undefined, options?: { configMissing?: boolean; timeoutMs?: number; headers?: HeadersInit }): Promise<ProbeResult> {
  if (!url || options?.configMissing) {
    return {
      url: redactUrl(url),
      ok: false,
      elapsedMs: 0,
      errorKind: "CONFIG_MISSING",
      errorMessage: "config_missing",
    };
  }

  const started = Date.now();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return {
      url: redactUrl(url),
      ok: false,
      elapsedMs: Date.now() - started,
      errorKind: "UNKNOWN",
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
      timeoutMs: options?.timeoutMs || 5000,
      retryOnStatuses: [403, 429],
      headers: {
        accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/json,text/csv,text/plain,*/*",
        "user-agent": "CroptoMonitor/triage-report",
        ...options?.headers,
      },
    });
    return {
      url: redactUrl(url),
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
      url: redactUrl(url),
      ok: false,
      resolvedIp,
      elapsedMs: Date.now() - started,
      errorKind: classifyErrorKind({ message, code }),
      errorMessage: message,
    };
  }
}

function shortMessage(message?: string): string | undefined {
  if (!message) return undefined;
  return String(message).trim().slice(0, 180);
}

function providerSuggestedFix(args: {
  providerId: string;
  errorKind?: TriageErrorKind;
  errorMessage?: string;
  sourceUrlUsed?: string;
  downloadUrlUsed?: string;
  notes?: string[];
  configMissing?: boolean;
}): SuggestedFix {
  const actions: string[] = [];
  let severity: "BLOCKER" | "WARN" | "INFO" = "INFO";
  let type: "SET_ENV" | "CHANGE_CONFIG" | "CODE_FIX" | "NO_ACTION" = "NO_ACTION";
  let envKeys: string[] = [];
  let exampleValues: string[] = [];
  let why = "";
  const errorMessage = String(args.errorMessage || "");
  const notes = args.notes || [];
  const verifyUrl = "/api/monitor/triage-report";

  if (args.providerId === "usda-gtr-logistics" && args.configMissing) {
    return {
      severity: "BLOCKER" as const,
      type: "SET_ENV" as const,
      actions: ["Set USDA_GTR_DATASET_URLS to 1-2 public USDA GTR CSV URLs from the datasets page."],
      envKeys: ["USDA_GTR_DATASET_URLS"],
      exampleValues: ["https://www.ams.usda.gov/sites/default/files/media/GTRTable1.xlsx,https://www.ams.usda.gov/sites/default/files/media/GTRFigure9.xlsx"],
      why: "The provider cannot probe or parse anything without at least one official USDA GTR dataset URL.",
      verifyUrl,
    };
  }
  if (args.providerId === "fpma-market-prices" && args.configMissing) {
    return {
      severity: "BLOCKER" as const,
      type: "SET_ENV" as const,
      actions: ["Set FPMA_API_BASE_URL=https://fpma.fao.org/giews/fpmat4/api/"],
      envKeys: ["FPMA_API_BASE_URL"],
      exampleValues: ["https://fpma.fao.org/giews/fpmat4/api/"],
      why: "FPMA discovery and data queries need the API base URL; without it the provider is configuration-blocked.",
      verifyUrl,
    };
  }
  if (args.providerId === "faostat-pp" && args.configMissing) {
    return {
      severity: "BLOCKER" as const,
      type: "SET_ENV" as const,
      actions: ["Set FAOSTAT_BASE_URL=https://fenixservices.fao.org/faostat/api/v1/en"],
      envKeys: ["FAOSTAT_BASE_URL"],
      exampleValues: ["https://fenixservices.fao.org/faostat/api/v1/en"],
      why: "FAOSTAT PP queries and definition discovery cannot start without the configured base URL.",
      verifyUrl,
    };
  }
  if (args.providerId === "usda-psd" && args.configMissing) {
    return {
      severity: "BLOCKER" as const,
      type: "SET_ENV" as const,
      actions: ["Set USDA_FAS_API_KEY and verify USDA_FAS_OPENDATA_BASE_URL for the PSD/OpenData endpoint."],
      envKeys: ["USDA_FAS_API_KEY", "USDA_FAS_OPENDATA_BASE_URL"],
      exampleValues: ["<free-usda-fas-key>", "https://apps.fas.usda.gov/OpenData/api"],
      why: "USDA PSD/OpenData cannot run live without the configured API key and base URL.",
      verifyUrl,
    };
  }

  switch (args.errorKind) {
    case "DNS":
      severity = "BLOCKER";
      type = "CHANGE_CONFIG";
      why = "Runtime DNS or egress is failing before the provider can reach the upstream host.";
      actions.push("Check Railway egress/DNS, redeploy, try another region, and verify the domain resolves from runtime.");
      break;
    case "TIMEOUT":
      severity = "WARN";
      type = "CHANGE_CONFIG";
      why = "The upstream is reachable but not responding within the current timeout budget.";
      actions.push("Increase provider timeout or reduce rows/years requested to shrink payload size.");
      break;
    case "HTTP_4XX":
      severity = "WARN";
      type = "CHANGE_CONFIG";
      why = "The upstream endpoint responded, but the current URL/path/template is not accepted.";
      actions.push("Check base URL/path and verify sourceUrlUsed manually; 4xx usually means wrong path or blocked endpoint.");
      if (errorMessage.includes("403")) actions.push("Endpoint may require auth or premium access; keep open-data fallback active.");
      break;
    case "BLOCKED":
      severity = "WARN";
      type = "CHANGE_CONFIG";
      why = "The upstream is reachable, but runtime access is explicitly blocked.";
      actions.push("Treat this as an access restriction unless provider-specific diagnostics prove otherwise.");
      break;
    case "HTTP_5XX":
      severity = "WARN";
      type = "NO_ACTION";
      why = "The upstream is currently failing server-side; the safest action is to keep fallback enabled.";
      actions.push("Upstream server error; retry later and keep cache/mock fallback.");
      break;
    case "PARSE":
      severity = "WARN";
      type = "CODE_FIX";
      why = "Data arrived, but the runtime did not receive the expected machine-readable payload.";
      actions.push("Inspect the live payload/content-type and verify the endpoint is serving machine-readable data.");
      break;
    case "EMPTY":
      severity = "WARN";
      type = "CODE_FIX";
      why = "Requests succeed, but the current mapping/query yields no usable rows.";
      actions.push("Likely mapping mismatch or no data for query; run discovery and adjust crop/item mapping.");
      break;
    case "RATE_LIMIT":
      severity = "WARN";
      type = "CHANGE_CONFIG";
      why = "The provider is hitting upstream rate limits and should back off more aggressively.";
      actions.push("Increase cache TTL, reduce functions/datasets requested, and add backoff.");
      break;
    case "CONFIG_MISSING":
      severity = "BLOCKER";
      type = "SET_ENV";
      why = "The provider is blocked by missing required configuration.";
      break;
    default:
      break;
  }

  if (args.providerId === "usda-mars-daily-txt") {
    if (notes.some((note) => note.includes("daily_report_not_in_list")) || errorMessage.includes("daily_report_not_in_list")) {
      severity = "WARN";
      type = "CHANGE_CONFIG";
      envKeys = ["USDA_MARS_MAX_REPORTS_SCAN"];
      exampleValues = ["800"];
      why = "The target report is not in the scanned subset of the USDA MARS published list.";
      actions.push("Increase USDA_MARS_MAX_REPORTS_SCAN, for example 200 -> 800.");
    }
    if ((args.downloadUrlUsed || args.sourceUrlUsed) && args.errorKind === "HTTP_4XX") {
      severity = "WARN";
      type = "CHANGE_CONFIG";
      envKeys = ["USDA_MARS_MNREPORTS_BASE_URL", "USDA_MARS_FILE_URL_TEMPLATES"];
      exampleValues = ["https://www.ams.usda.gov/mnreports", "https://www.ams.usda.gov/mnreports/{fileName}.{ext}"];
      why = "The TXT metadata path resolved, but the derived report download URL is returning 4xx.";
      actions.push("Adjust USDA_MARS_MNREPORTS_BASE_URL or USDA_MARS_FILE_URL_TEMPLATES and verify extension lowercasing.");
    }
  }

  if (args.providerId === "fpma-market-prices" && args.errorKind === "PARSE") {
    severity = "WARN";
    type = "CHANGE_CONFIG";
    why = "Current FPMA base/path returns an HTML shell instead of a JSON API payload.";
    actions.length = 0;
    actions.push("Verify FPMA_API_BASE_URL points to the correct FPMA JSON endpoint before enabling live mode.");
  }
  if (args.providerId === "amis-outlook" && args.errorKind === "PARSE") {
    severity = "WARN";
    type = "CODE_FIX";
    why = "AMIS page responded, but the latest monitor link or release metadata did not match the current HTML shape.";
    actions.length = 0;
    actions.push("Verify the current AMIS monitoring page HTML and refresh the link/date selectors.");
  }
  if (args.providerId === "imf-pcps" && args.errorKind === "PARSE") {
    severity = "WARN";
    type = "CODE_FIX";
    why = "IMF source responded, but the current public file shape did not yield a parsable benchmark row set.";
    actions.length = 0;
    actions.push("Verify IMF table URL/file format and keep fallback enabled if the public file remains opaque.");
  }
  if (args.providerId === "oecd-agricultural-outlook" && args.errorKind === "PARSE") {
    severity = "WARN";
    type = "CODE_FIX";
    why = "OECD outlook pages responded, but the current text did not match the expected projection patterns.";
    actions.length = 0;
    actions.push("Verify the current OECD Agricultural Outlook chapter URLs and refresh the projection regex patterns.");
  }

  if (args.providerId === "faostat-pp" && args.errorKind === "TIMEOUT") {
    severity = "WARN";
    type = "CHANGE_CONFIG";
    why = "FAOSTAT upstream is slow or unresponsive from the current runtime even on reduced probes.";
    actions.length = 0;
    actions.push("Keep fallback enabled for demo or reduce live reliance unless a longer timeout budget is acceptable.");
  }

  if (args.providerId === "usda-gtr-logistics" && (args.errorKind === "BLOCKED" || args.errorKind === "HTTP_4XX" || errorMessage.includes("403"))) {
    severity = "WARN";
    type = "CODE_FIX";
    why = "The GTR probe succeeds, but runtime binary retrieval is blocked during provider download.";
    actions.length = 0;
    actions.push("Inspect GTR provider httpStatus/finalUrl/responseHeaders/transportUsed in activation-report and compare the blocked runtime request against the successful probe.");
  }

  if (args.providerId === "nasdaq-datalink") {
    let nasdaqWhy = why;
    const datasetsAreCleanFRED = NASDAQ_DATASETS.length > 0 && NASDAQ_DATASETS.every((value) => String(value).startsWith("FRED/"));
    if (!datasetsAreCleanFRED && errorMessage.includes("RED/")) {
      severity = "WARN";
      type = "SET_ENV";
      envKeys = ["NASDAQ_DATASETS"];
      exampleValues = ["FRED/DGS10,FRED/DGS2,FRED/T10Y2Y,FRED/DFF,FRED/DTWEXBGS"];
      nasdaqWhy = "Production datasets include an invalid RED/... prefix instead of FRED/....";
      actions.push("Fix NASDAQ_DATASETS on Railway so every FRED dataset keeps the FRED/ prefix.");
    }
    if (ENABLE_NASDAQ_CHRIS && errorMessage.includes("CHRIS/")) {
      if (!envKeys.length) {
        severity = "WARN";
        type = "SET_ENV";
        envKeys = ["ENABLE_NASDAQ_CHRIS", "NASDAQ_CHRIS_DATASETS"];
        exampleValues = ["false", ""];
        nasdaqWhy = "Premium CHRIS datasets are enabled in production and add avoidable 403 noise.";
      }
      actions.push("Disable CHRIS on production unless you explicitly want premium-only datasets.");
    }
    if (datasetsAreCleanFRED && !ENABLE_NASDAQ_CHRIS && (args.errorKind === "BLOCKED" || args.errorKind === "HTTP_4XX" || errorMessage.includes("forbidden") || errorMessage.includes("blocked"))) {
      severity = "WARN";
      type = "SET_ENV";
      envKeys = ["NASDAQ_API_KEY"];
      exampleValues = ["<valid-nasdaq-key>"];
      nasdaqWhy = "FRED datasets are correctly configured, but Nasdaq Data Link is returning 403 for the current key/access level.";
      actions.length = 0;
      actions.push("Verify NASDAQ_API_KEY is valid on Railway and that the key has access to FRED datasets on Nasdaq Data Link.");
      actions.push("If access remains blocked, keep provider fallback-enabled for demo.");
    }
    if (nasdaqWhy) why = nasdaqWhy;
  }

  if (!actions.length) {
    actions.push(args.errorKind ? "No safe automatic fix beyond the current fallback chain." : "No action required.");
  }

  return { severity, type, actions, envKeys, exampleValues, why, verifyUrl };
}

type TargetProviderId =
  | "fpma-market-prices"
  | "faostat-pp"
  | "usda-gtr-logistics"
  | "usda-mars-daily-txt"
  | "nasdaq-datalink"
  | "ec-cereals-prices"
  | "ec-oilseeds-prices"
  | "usda-nass-quickstats"
  | "wfp-databridges"
  | "worldbank-microdata"
  | "eurostat-agri-indices"
  | "canada-grain-rail-performance"
  | "usda-psd"
  | "amis-outlook"
  | "imf-pcps"
  | "oecd-agricultural-outlook";

const TARGETS: Array<{ providerId: TargetProviderId; widgetKind: string; expectedCount: number }> = [
  { providerId: "fpma-market-prices", widgetKind: "FPMA_MARKET_PRICES_MULTI_COUNTRY", expectedCount: 5 },
  { providerId: "faostat-pp", widgetKind: "FAOSTAT_PP_MULTI_COUNTRY", expectedCount: 5 },
  { providerId: "usda-gtr-logistics", widgetKind: "USDA_GTR_LOGISTICS_SNAPSHOT", expectedCount: 2 },
  { providerId: "usda-mars-daily-txt", widgetKind: "USDA_MARS_DAILY_MARKET_RATES_TXT", expectedCount: 3 },
  { providerId: "nasdaq-datalink", widgetKind: "NASDAQ_DATA_LINK_SNAPSHOT", expectedCount: Math.max(2, NASDAQ_DATASETS.length) },
  { providerId: "ec-cereals-prices", widgetKind: "EC_CEREALS_MULTI_COUNTRY", expectedCount: 5 },
  { providerId: "ec-oilseeds-prices", widgetKind: "EC_OILSEEDS_MULTI_COUNTRY", expectedCount: 3 },
  { providerId: "usda-nass-quickstats", widgetKind: "USDA_NASS_PRODUCER_PRICES", expectedCount: 3 },
  { providerId: "wfp-databridges", widgetKind: "WFP_MARKET_PRICES_MULTI_COUNTRY", expectedCount: 3 },
  { providerId: "worldbank-microdata", widgetKind: "WB_MICRODATA_MARKET_PRICES", expectedCount: 3 },
  { providerId: "eurostat-agri-indices", widgetKind: "EUROSTAT_AGRI_PRICE_INDICES", expectedCount: 3 },
  { providerId: "usda-psd", widgetKind: "USDA_PSD_BALANCES", expectedCount: 8 },
  { providerId: "amis-outlook", widgetKind: "AMIS_GLOBAL_BALANCE", expectedCount: 4 },
  { providerId: "imf-pcps", widgetKind: "IMF_COMMODITY_BENCHMARKS", expectedCount: 4 },
  { providerId: "oecd-agricultural-outlook", widgetKind: "OECD_AGRICULTURAL_OUTLOOK", expectedCount: 5 },
  { providerId: "canada-grain-rail-performance", widgetKind: "CANADA_GRAIN_RAIL_PERFORMANCE", expectedCount: 4 },
];

export async function buildMonitorTriageReport(grainWidgetsService: {
  list: () => Promise<any>;
  debugSummary: () => any;
}) {
  const nowIso = new Date().toISOString();
  const grainWidgets = await grainWidgetsService.list();
  const grainWidgetsDebug = grainWidgetsService.debugSummary();
  const byKind = grainWidgets.widgets.byKind || {};
  const providers = Array.isArray(grainWidgetsDebug.providers) ? grainWidgetsDebug.providers : [];

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

  const envPresence = {
    ENABLE_FPMA_MARKET_PRICES_WIDGET,
    ENABLE_FAOSTAT_PP_WIDGET,
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
    ENABLE_USDA_GTR_LOGISTICS_WIDGET,
    ENABLE_USDA_MARS_DAILY_TXT,
    EC_AGRI_API_BASE_URL: EC_AGRI_API_BASE_URL ? "present" : "missing",
    FPMA_API_BASE_URL: FPMA_API_BASE_URL ? "present" : "missing",
    FAOSTAT_BASE_URL: FAOSTAT_BASE_URL ? "present" : "missing",
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
    CANADA_RAIL_WDS_BASE_URL: CANADA_RAIL_WDS_BASE_URL ? "present" : "missing",
    FPMA_DATA_PATHS,
    USDA_GTR_DATASET_URLS: USDA_GTR_DATASET_URLS.length ? "present" : "missing",
    USDA_GTR_DATASET_URLS_COUNT: USDA_GTR_DATASET_URLS.length,
    USDA_MARS_BASE_URL: USDA_MARS_BASE_URL ? "present" : "missing",
    USDA_MARS_FILE_URL_TEMPLATES: "present",
    NASDAQ_API_KEY: process.env.NASDAQ_API_KEY ? "present" : "missing",
    NASDAQ_DATASETS,
    NASDAQ_DATASET_PREFIXES: Array.from(new Set(NASDAQ_DATASETS.map((value) => String(value).split("/")[0] || ""))).filter(Boolean),
    ENABLE_NASDAQ_CHRIS,
    NASDAQ_CHRIS_DATASETS,
    ALPHAVANTAGE_API_KEY: process.env.ALPHAVANTAGE_API_KEY ? "present" : "missing",
    GRAIN_WIDGETS_FETCH_TIMEOUT_MS,
    GRAIN_WIDGETS_CACHE_TTL_MS,
  };

  const marsWidget = byKind["USDA_MARS_DAILY_MARKET_RATES_TXT"] as any;
  const marsProvider = providers.find((item: any) => item.providerId === "usda-mars-daily-txt");
  const marsIndexUrl =
    USDA_MARS_PUBLIC_INDEX_URLS[0] ||
    `${USDA_MARS_BASE_URL.replace(/\/+$/, "")}/listPublishedReports`;
  const marsDownloadUrl =
    marsProvider?.downloadUrlUsed ||
    marsWidget?.debug?.downloadUrlUsed ||
    marsIndexUrl;

  const probes = {
    ecCereals: await probeUrl(`${EC_AGRI_API_BASE_URL.replace(/\/+$/, "")}/${EC_CEREALS_API_PATH.replace(/^\/+/, "")}/products`, {
      configMissing: !EC_AGRI_API_BASE_URL,
    }).catch((error: any) => ({
      ok: false,
      elapsedMs: 0,
      errorKind: classifyErrorKind({ message: error?.message }),
      errorMessage: String(error?.message || "probe_failed"),
    })),
    ecOilseeds: await probeUrl(`${EC_AGRI_API_BASE_URL.replace(/\/+$/, "")}/${EC_OILSEEDS_API_PATH.replace(/^\/+/, "")}/products`, {
      configMissing: !EC_AGRI_API_BASE_URL,
    }).catch((error: any) => ({
      ok: false,
      elapsedMs: 0,
      errorKind: classifyErrorKind({ message: error?.message }),
      errorMessage: String(error?.message || "probe_failed"),
    })),
    fpma: await probeUrl(`${FPMA_API_BASE_URL.replace(/\/+$/, "")}/prices?format=json`, {
      configMissing: !FPMA_API_BASE_URL,
    }).catch((error: any) => ({
      ok: false,
      elapsedMs: 0,
      errorKind: classifyErrorKind({ message: error?.message }),
      errorMessage: String(error?.message || "probe_failed"),
    })),
    faostat: await probeUrl(`${FAOSTAT_BASE_URL.replace(/\/+$/, "")}/definitions/types/area`, {
      configMissing: !FAOSTAT_BASE_URL,
      timeoutMs: FAOSTAT_TIMEOUT_MS,
    }).catch((error: any) => ({
      ok: false,
      elapsedMs: 0,
      errorKind: classifyErrorKind({ message: error?.message }),
      errorMessage: String(error?.message || "probe_failed"),
    })),
    usdaGtr: await probeUrl(USDA_GTR_DATASET_URLS[0], {
      configMissing: USDA_GTR_DATASET_URLS.length === 0,
    }).catch((error: any) => ({
      ok: false,
      elapsedMs: 0,
      errorKind: classifyErrorKind({ message: error?.message }),
      errorMessage: String(error?.message || "probe_failed"),
    })),
    usdaMarsDailyTxt: await probeUrl(marsDownloadUrl, {
      configMissing: !USDA_MARS_BASE_URL && !marsDownloadUrl,
    }).catch((error: any) => ({
      ok: false,
      elapsedMs: 0,
      errorKind: classifyErrorKind({ message: error?.message }),
      errorMessage: String(error?.message || "probe_failed"),
    })),
    usdaMars: await probeUrl(marsIndexUrl, {
      configMissing: !USDA_MARS_BASE_URL && USDA_MARS_PUBLIC_INDEX_URLS.length === 0,
    }).catch((error: any) => ({
      ok: false,
      elapsedMs: 0,
      errorKind: classifyErrorKind({ message: error?.message }),
      errorMessage: String(error?.message || "probe_failed"),
    })),
    nasdaq: await probeUrl(
      `${NASDAQ_BASE_URL.replace(/\/+$/, "")}/datasets/${encodeURIComponent((NASDAQ_DATASETS[0] || "FRED/DGS10").split("/")[0] || "FRED")}/${encodeURIComponent((NASDAQ_DATASETS[0] || "FRED/DGS10").split("/").slice(1).join("/") || "DGS10")}.json?rows=1${NASDAQ_API_KEY ? `&api_key=${encodeURIComponent(NASDAQ_API_KEY)}` : ""}`,
      {
        configMissing: !ENABLE_NASDAQ_DATALINK_PROVIDER || !NASDAQ_BASE_URL || NASDAQ_DATASETS.length === 0,
      },
    ).catch((error: any) => ({
      ok: false,
      elapsedMs: 0,
      errorKind: classifyErrorKind({ message: error?.message }),
      errorMessage: String(error?.message || "probe_failed"),
    })),
    usdaNass: await probeUrl(
      `${USDA_NASS_BASE_URL}?commodity_desc=CORN&agg_level_desc=NATIONAL&statisticcat_desc=PRICE%20RECEIVED&format=JSON${USDA_NASS_API_KEY ? `&key=${encodeURIComponent(USDA_NASS_API_KEY)}` : ""}`,
      { configMissing: !USDA_NASS_BASE_URL || !USDA_NASS_API_KEY },
    ).catch((error: any) => ({
      ok: false,
      elapsedMs: 0,
      errorKind: classifyErrorKind({ message: error?.message }),
      errorMessage: String(error?.message || "probe_failed"),
    })),
    wfp: await probeUrl(
      `${WFP_DATABRIDGES_BASE_URL}?limit=1${WFP_DATABRIDGES_TOKEN ? `&app_identifier=${encodeURIComponent(WFP_DATABRIDGES_TOKEN)}` : ""}`,
      { configMissing: !WFP_DATABRIDGES_BASE_URL || !WFP_DATABRIDGES_TOKEN, timeoutMs: WFP_DATABRIDGES_TIMEOUT_MS },
    ).catch((error: any) => ({
      ok: false,
      elapsedMs: 0,
      errorKind: classifyErrorKind({ message: error?.message }),
      errorMessage: String(error?.message || "probe_failed"),
    })),
    worldBank: await probeUrl(WB_MICRODATA_CSV_URL || `${WB_MICRODATA_BASE_URL.replace(/\/+$/, "")}/data-api`, {
      configMissing: !WB_MICRODATA_BASE_URL,
      timeoutMs: WB_MICRODATA_TIMEOUT_MS,
    }).catch((error: any) => ({
      ok: false,
      elapsedMs: 0,
      errorKind: classifyErrorKind({ message: error?.message }),
      errorMessage: String(error?.message || "probe_failed"),
    })),
    eurostat: await probeUrl(`${EUROSTAT_BASE_URL.replace(/\/+$/, "")}/apri_pi20_outq?geo=FR&lang=en&format=JSON`, {
      configMissing: !EUROSTAT_BASE_URL,
      timeoutMs: EUROSTAT_TIMEOUT_MS,
    }).catch((error: any) => ({
      ok: false,
      elapsedMs: 0,
      errorKind: classifyErrorKind({ message: error?.message }),
      errorMessage: String(error?.message || "probe_failed"),
    })),
    usdaPsd: await probeUrl(
      `${USDA_FAS_OPENDATA_BASE_URL.replace(/\/+$/, "")}/psd/world-commodity-balances${USDA_FAS_API_KEY ? `?api_key=${encodeURIComponent(USDA_FAS_API_KEY)}` : ""}`,
      { configMissing: !USDA_FAS_OPENDATA_BASE_URL || !USDA_FAS_API_KEY, timeoutMs: USDA_PSD_TIMEOUT_MS },
    ).catch((error: any) => ({
      ok: false,
      elapsedMs: 0,
      errorKind: classifyErrorKind({ message: error?.message }),
      errorMessage: String(error?.message || "probe_failed"),
    })),
    amis: await probeUrl(AMIS_MARKET_MONITOR_URL, {
      configMissing: !AMIS_MARKET_MONITOR_URL,
      timeoutMs: AMIS_TIMEOUT_MS,
    }).catch((error: any) => ({
      ok: false,
      elapsedMs: 0,
      errorKind: classifyErrorKind({ message: error?.message }),
      errorMessage: String(error?.message || "probe_failed"),
    })),
    imf: await probeUrl(IMF_PCPS_TABLE2_URL, {
      configMissing: !IMF_PCPS_TABLE2_URL,
      timeoutMs: IMF_PCPS_TIMEOUT_MS,
    }).catch((error: any) => ({
      ok: false,
      elapsedMs: 0,
      errorKind: classifyErrorKind({ message: error?.message }),
      errorMessage: String(error?.message || "probe_failed"),
    })),
    oecd: await probeUrl(OECD_AGRICULTURAL_OUTLOOK_CEREALS_URL, {
      configMissing: !OECD_AGRICULTURAL_OUTLOOK_CEREALS_URL,
      timeoutMs: OECD_AGRICULTURAL_OUTLOOK_TIMEOUT_MS,
    }).catch((error: any) => ({
      ok: false,
      elapsedMs: 0,
      errorKind: classifyErrorKind({ message: error?.message }),
      errorMessage: String(error?.message || "probe_failed"),
    })),
    canadaRail: await probeUrl(`${CANADA_RAIL_WDS_BASE_URL.replace(/\/+$/, "")}/getFullTableDownloadCSV/${CANADA_RAIL_PRODUCT_ID}/en`, {
      configMissing: !CANADA_RAIL_WDS_BASE_URL,
    }).catch((error: any) => ({
      ok: false,
      elapsedMs: 0,
      errorKind: classifyErrorKind({ message: error?.message }),
      errorMessage: String(error?.message || "probe_failed"),
    })),
  };

  const providerRows = TARGETS.map(({ providerId, widgetKind, expectedCount }) => {
    const provider = providers.find((item: any) => item.providerId === providerId);
    const widget = byKind[widgetKind] as any;
    const configMissing =
      (providerId === "fpma-market-prices" && !FPMA_API_BASE_URL) ||
      (providerId === "faostat-pp" && !FAOSTAT_BASE_URL) ||
      (providerId === "usda-gtr-logistics" && USDA_GTR_DATASET_URLS.length === 0) ||
      (providerId === "usda-nass-quickstats" && (!USDA_NASS_BASE_URL || !USDA_NASS_API_KEY)) ||
      (providerId === "usda-psd" && (!USDA_FAS_OPENDATA_BASE_URL || !USDA_FAS_API_KEY)) ||
      (providerId === "amis-outlook" && !AMIS_MARKET_MONITOR_URL) ||
      (providerId === "imf-pcps" && !IMF_PCPS_TABLE2_URL) ||
      (providerId === "oecd-agricultural-outlook" && !OECD_AGRICULTURAL_OUTLOOK_CEREALS_URL) ||
      (providerId === "wfp-databridges" && (!WFP_DATABRIDGES_BASE_URL || !WFP_DATABRIDGES_TOKEN)) ||
      (providerId === "worldbank-microdata" && !WB_MICRODATA_BASE_URL) ||
      (providerId === "eurostat-agri-indices" && !EUROSTAT_BASE_URL);
    const probeMatch =
      providerId === "ec-cereals-prices" ? probes.ecCereals :
      providerId === "ec-oilseeds-prices" ? probes.ecOilseeds :
      providerId === "fpma-market-prices" ? probes.fpma :
      providerId === "faostat-pp" ? probes.faostat :
      providerId === "usda-gtr-logistics" ? probes.usdaGtr :
      providerId === "usda-nass-quickstats" ? probes.usdaNass :
      providerId === "usda-psd" ? probes.usdaPsd :
      providerId === "amis-outlook" ? probes.amis :
      providerId === "imf-pcps" ? probes.imf :
      providerId === "oecd-agricultural-outlook" ? probes.oecd :
      providerId === "wfp-databridges" ? probes.wfp :
      providerId === "worldbank-microdata" ? probes.worldBank :
      providerId === "eurostat-agri-indices" ? probes.eurostat :
      providerId === "canada-grain-rail-performance" ? probes.canadaRail :
      providerId === "nasdaq-datalink" ? probes.nasdaq :
      probes.usdaMarsDailyTxt;
    const lastError = normalizeProviderError(
      provider?.error || (provider?.errorKind ? String(provider.errorKind) : undefined) || (!probeMatch.ok ? probeMatch.errorMessage : undefined),
      configMissing,
    );
    const refinedErrorKind = inferProviderErrorKind({
      providerId,
      providerErrorKind: provider?.errorKind,
      providerError: provider?.error,
      probe: probeMatch,
      fpmaDiscovery,
    });
    const errorMessageShort = shortMessage(lastError?.message);
    const sourceUrlUsed = redactUrl(provider?.downloadUrlUsed || provider?.sourceUrlUsed || widget?.debug?.downloadUrlUsed || widget?.debug?.sourceUrlUsed || widget?.sourceUrl);
    const coverage = provider?.coverage || `${provider?.mappedCount ?? 0}/${provider?.expectedCount ?? expectedCount}`;
    const notes = Array.isArray(provider?.notes) ? provider.notes : Array.isArray(widget?.notes) ? widget.notes : [];

    return {
      providerId,
      widgetKind,
      enabled: Boolean(provider?.enabled),
      status: String(widget?.status || provider?.status || "OFFLINE"),
      coverage,
      errorKind: refinedErrorKind,
      errorMessageShort,
      sourceUrlUsed,
      fallbackChainUsed: provider?.fallbackChain || "real->cache->mock",
      lastFetchAt: provider?.lastSuccessAt || provider?.lastAttemptAt,
      suggestedFix: providerSuggestedFix({
        providerId,
        errorKind: refinedErrorKind,
        errorMessage: lastError?.message || probeMatch?.errorMessage,
        sourceUrlUsed,
        downloadUrlUsed: redactUrl(provider?.downloadUrlUsed || widget?.debug?.downloadUrlUsed),
        notes,
        configMissing,
      }),
    };
  });

  const nextActions = providerRows
    .map((row) => ({
      providerId: row.providerId,
      severity: row.suggestedFix.severity,
      envKeys: row.suggestedFix.envKeys || [],
      exampleValues: row.suggestedFix.exampleValues || [],
      why: row.suggestedFix.why || row.suggestedFix.actions[0] || "No action required.",
      verifyUrl: row.suggestedFix.verifyUrl || "/api/monitor/triage-report",
    }))
    .sort((a, b) => {
      const rank = { BLOCKER: 0, WARN: 1, INFO: 2 } as const;
      return rank[a.severity] - rank[b.severity];
    })
    .slice(0, 10);

  return {
    runtime: {
      timestamp: nowIso,
      appVersion: process.env.APP_VERSION || process.env.npm_package_version || "unknown",
      commit:
        process.env.RAILWAY_GIT_COMMIT_SHA ||
        process.env.RAILWAY_GIT_COMMIT ||
        process.env.VERCEL_GIT_COMMIT_SHA ||
        process.env.COMMIT_SHA ||
        "unknown",
      env: envPresence,
    },
    networkProbe: probes,
    providers: providerRows,
    nextActions,
    fpmaDiscovery: fpmaDiscovery
      ? {
          cacheHit: fpmaDiscovery.cacheHit,
          fetchedAt: fpmaDiscovery.fetchedAt,
          endpointsTriedTop3: (fpmaDiscovery.endpointsTried || []).slice(0, 3),
          countriesCount: fpmaDiscovery.countriesCount,
          commoditiesCount: fpmaDiscovery.commoditiesCount,
          priceTypesCount: fpmaDiscovery.priceTypesCount,
          notes: fpmaDiscovery.notes,
        }
      : undefined,
    fpmaResolutionTest,
  };
}
