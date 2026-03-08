import { lookup } from "node:dns/promises";
import {
  ENABLE_FAOSTAT_PP_WIDGET,
  ENABLE_FPMA_MARKET_PRICES_WIDGET,
  ENABLE_USDA_GTR_LOGISTICS_WIDGET,
  ENABLE_USDA_MARS_DAILY_TXT,
  FAOSTAT_BASE_URL,
  FPMA_API_BASE_URL,
  GRAIN_WIDGETS_CACHE_TTL_MS,
  GRAIN_WIDGETS_FETCH_TIMEOUT_MS,
  USDA_GTR_DATASET_URLS,
  USDA_MARS_BASE_URL,
} from "../grainWidgets/config";
import { fetchFpmaDiscoverySnapshot, getFpmaDiscoveryDebug, runFpmaDiscoveryResolutionTest } from "../grainWidgets/providers/fpmaDiscovery";

type TriageErrorKind =
  | "CONFIG_MISSING"
  | "DNS"
  | "TIMEOUT"
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

async function probeUrl(url: string | undefined, options?: { configMissing?: boolean }): Promise<ProbeResult> {
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
      errorKind: "CONFIG_MISSING",
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    let response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      headers: {
        accept: "application/json,text/csv,text/plain,*/*",
        "user-agent": "CroptoMonitor/triage-report",
      },
    });
    if (response.status === 405 || response.status === 501) {
      response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: {
          accept: "application/json,text/csv,text/plain,*/*",
          "user-agent": "CroptoMonitor/triage-report",
        },
      });
    }
    clearTimeout(timeout);
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
    clearTimeout(timeout);
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
    case "HTTP_5XX":
      severity = "WARN";
      type = "NO_ACTION";
      why = "The upstream is currently failing server-side; the safest action is to keep fallback enabled.";
      actions.push("Upstream server error; retry later and keep cache/mock fallback.");
      break;
    case "PARSE":
      severity = "WARN";
      type = "CODE_FIX";
      why = "Data arrived but the parser assumptions did not match the live payload shape.";
      actions.push("Log a sample payload in debug mode and update parser assumptions for the live shape.");
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

  if (!actions.length) {
    actions.push(args.errorKind ? "No safe automatic fix beyond the current fallback chain." : "No action required.");
  }

  return { severity, type, actions, envKeys, exampleValues, why, verifyUrl };
}

type TargetProviderId =
  | "fpma-market-prices"
  | "faostat-pp"
  | "usda-gtr-logistics"
  | "usda-mars-daily-txt";

const TARGETS: Array<{ providerId: TargetProviderId; widgetKind: string; expectedCount: number }> = [
  { providerId: "fpma-market-prices", widgetKind: "FPMA_MARKET_PRICES_MULTI_COUNTRY", expectedCount: 5 },
  { providerId: "faostat-pp", widgetKind: "FAOSTAT_PP_MULTI_COUNTRY", expectedCount: 5 },
  { providerId: "usda-gtr-logistics", widgetKind: "USDA_GTR_LOGISTICS_SNAPSHOT", expectedCount: 2 },
  { providerId: "usda-mars-daily-txt", widgetKind: "USDA_MARS_DAILY_MARKET_RATES_TXT", expectedCount: 3 },
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
    ENABLE_USDA_GTR_LOGISTICS_WIDGET,
    ENABLE_USDA_MARS_DAILY_TXT,
    FPMA_API_BASE_URL: process.env.FPMA_API_BASE_URL ? "present" : "missing",
    FAOSTAT_BASE_URL: process.env.FAOSTAT_BASE_URL ? "present" : "missing",
    USDA_GTR_DATASET_URLS: process.env.USDA_GTR_DATASET_URLS ? "present" : "missing",
    USDA_GTR_DATASET_URLS_COUNT: process.env.USDA_GTR_DATASET_URLS
      ? process.env.USDA_GTR_DATASET_URLS.split(",").map((value) => value.trim()).filter(Boolean).length
      : 0,
    USDA_MARS_BASE_URL: process.env.USDA_MARS_BASE_URL ? "present" : "missing",
    USDA_MARS_FILE_URL_TEMPLATES: process.env.USDA_MARS_FILE_URL_TEMPLATES ? "present" : "missing",
    NASDAQ_API_KEY: process.env.NASDAQ_API_KEY ? "present" : "missing",
    ALPHAVANTAGE_API_KEY: process.env.ALPHAVANTAGE_API_KEY ? "present" : "missing",
    GRAIN_WIDGETS_FETCH_TIMEOUT_MS,
    GRAIN_WIDGETS_CACHE_TTL_MS,
  };

  const marsWidget = byKind["USDA_MARS_DAILY_MARKET_RATES_TXT"] as any;
  const marsProvider = providers.find((item: any) => item.providerId === "usda-mars-daily-txt");
  const marsDownloadUrl =
    marsProvider?.downloadUrlUsed ||
    marsWidget?.debug?.downloadUrlUsed ||
    `${USDA_MARS_BASE_URL.replace(/\/+$/, "")}/listPublishedReports?format=json`;

  const probes = {
    fpma: await probeUrl(`${FPMA_API_BASE_URL.replace(/\/+$/, "")}/prices?format=json`, {
      configMissing: !process.env.FPMA_API_BASE_URL,
    }).catch((error: any) => ({
      ok: false,
      elapsedMs: 0,
      errorKind: classifyErrorKind({ message: error?.message }),
      errorMessage: String(error?.message || "probe_failed"),
    })),
    faostat: await probeUrl(`${FAOSTAT_BASE_URL.replace(/\/+$/, "")}/definitions/types/area?datasource=production`, {
      configMissing: !process.env.FAOSTAT_BASE_URL,
    }).catch((error: any) => ({
      ok: false,
      elapsedMs: 0,
      errorKind: classifyErrorKind({ message: error?.message }),
      errorMessage: String(error?.message || "probe_failed"),
    })),
    usdaGtr: await probeUrl(USDA_GTR_DATASET_URLS[0], {
      configMissing: !process.env.USDA_GTR_DATASET_URLS,
    }).catch((error: any) => ({
      ok: false,
      elapsedMs: 0,
      errorKind: classifyErrorKind({ message: error?.message }),
      errorMessage: String(error?.message || "probe_failed"),
    })),
    usdaMarsDailyTxt: await probeUrl(marsDownloadUrl, {
      configMissing: !process.env.USDA_MARS_BASE_URL && !process.env.USDA_MARS_FILE_URL_TEMPLATES,
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
      (providerId === "fpma-market-prices" && !process.env.FPMA_API_BASE_URL) ||
      (providerId === "faostat-pp" && !process.env.FAOSTAT_BASE_URL) ||
      (providerId === "usda-gtr-logistics" && !process.env.USDA_GTR_DATASET_URLS);
    const lastError = normalizeProviderError(provider?.error, configMissing);
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
      errorKind: lastError?.errorKind,
      errorMessageShort,
      sourceUrlUsed,
      fallbackChainUsed: provider?.fallbackChain || "real->cache->mock",
      lastFetchAt: provider?.lastSuccessAt || provider?.lastAttemptAt,
      suggestedFix: providerSuggestedFix({
        providerId,
        errorKind: lastError?.errorKind,
        errorMessage: lastError?.message,
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
