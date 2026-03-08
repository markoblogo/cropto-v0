import { USDA_GTR_USER_AGENT } from "../config";
import { normalizeGrainPriceToUsdTon } from "../../grainMarkets/normalization";
import type { GrainWidgetPoint, GrainWidgetStatus, GrainWidgetTableRow } from "../types";

export async function fetchWithHeaders(
  url: string,
  opts: {
    timeoutMs: number;
    headers?: HeadersInit;
    retryOnStatuses?: number[];
    retryDelayMs?: number;
    redirect?: RequestRedirect;
    cache?: RequestCache;
  },
): Promise<Response> {
  const retryOnStatuses = opts.retryOnStatuses || [];
  const retryDelayMs = opts.retryDelayMs ?? 400;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: opts.redirect || "follow",
        cache: opts.cache || "no-store",
        headers: {
          "user-agent": USDA_GTR_USER_AGENT,
          accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,application/json,text/plain,text/html,*/*",
          "accept-language": "en-US,en;q=0.9",
          referer: "https://www.ams.usda.gov/",
          pragma: "no-cache",
          "cache-control": "no-cache",
          ...opts.headers,
        },
      });
      if (response.ok || attempt > 0 || !retryOnStatuses.includes(response.status)) {
        return response;
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("fetch_failed");
}

function attachHttpDebug(error: Error, response: Response): Error {
  const pickedHeaders: Record<string, string> = {};
  for (const key of ["server", "via", "cf-ray", "content-type", "location", "x-cache", "x-served-by"]) {
    const value = response.headers.get(key);
    if (value) pickedHeaders[key] = value;
  }
  Object.assign(error, {
    httpStatus: response.status,
    finalUrl: response.url,
    responseHeaders: pickedHeaders,
  });
  return error;
}

export async function fetchTextWithTimeout(url: string, timeoutMs: number, headers?: HeadersInit): Promise<string> {
  const response = await fetchWithHeaders(url, {
    timeoutMs,
    headers,
    retryOnStatuses: [403, 429],
  });
  if (!response.ok) throw attachHttpDebug(new Error(`HTTP ${response.status}`), response);
  return await response.text();
}

export async function fetchTextResponseWithTimeout(
  url: string,
  timeoutMs: number,
  headers?: HeadersInit,
): Promise<{ text: string; contentType: string | null; finalUrl: string; status: number }> {
  const response = await fetchWithHeaders(url, {
    timeoutMs,
    headers,
    retryOnStatuses: [403, 429],
  });
  const text = await response.text();
  if (!response.ok) throw attachHttpDebug(new Error(`HTTP ${response.status}`), response);
  return {
    text,
    contentType: response.headers.get("content-type"),
    finalUrl: response.url || url,
    status: response.status,
  };
}

export async function fetchBufferWithTimeout(url: string, timeoutMs: number, headers?: HeadersInit): Promise<{
  buffer: Buffer;
  contentType: string | null;
  finalUrl: string;
}> {
  const response = await fetchWithHeaders(url, {
    timeoutMs,
    headers,
    retryOnStatuses: [403, 429],
  });
  if (!response.ok) throw attachHttpDebug(new Error(`HTTP ${response.status}`), response);
  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: response.headers.get("content-type"),
    finalUrl: response.url || url,
  };
}

export function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const parsed = Number.parseFloat(value.replace(/[, ]/g, "").replace(/%$/, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function deriveSeries(last: number, change?: number, points = 7): GrainWidgetPoint[] {
  const prev = change == null ? last : last - change;
  const step = points <= 1 ? 0 : (last - prev) / (points - 1);
  return Array.from({ length: points }).map((_, index) => ({
    ts: new Date(Date.now() - (points - 1 - index) * 24 * 60 * 60 * 1000).toISOString(),
    value: Number((prev + step * index).toFixed(4)),
  }));
}

export function normalizeDate(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value > 1e12 ? value : value * 1000).toISOString();
  }
  if (typeof value === "string") {
    const ts = Date.parse(value);
    if (Number.isFinite(ts)) return new Date(ts).toISOString();
  }
  return undefined;
}

export function normalizeRowPrice(args: {
  row: GrainWidgetTableRow;
  eurUsd: number | null;
  crop?: "corn" | "wheat" | "soybeans";
  nativeUnitType?: "CENTS_PER_BUSHEL" | "USD_PER_BUSHEL" | "USD_PER_TON" | "EUR_PER_TON" | "UNKNOWN";
}): GrainWidgetTableRow {
  const current = args.row.price?.nativeValueCurrent;
  const change = args.row.price?.nativeValueChange;
  const changePct = args.row.price?.nativeValueChangePct;
  const currency = args.row.price?.nativeCurrency;
  const unit = args.row.price?.nativeUnit;

  const normalization = normalizeGrainPriceToUsdTon({
    quote: {
      valueCurrent: current,
      valueChange: change,
      valueChangePct: changePct,
      currency,
      unit,
      nativeUnitType: args.nativeUnitType || "UNKNOWN",
      crop: args.crop,
    },
    fx: { eurUsd: args.eurUsd ?? undefined },
  });

  return {
    ...args.row,
    price: {
      ...args.row.price,
      nativeValueCurrent: normalization.native.valueCurrent,
      nativeValueChange: normalization.native.valueChange,
      nativeValueChangePct: normalization.native.valueChangePct,
      nativeCurrency: normalization.native.currency,
      nativeUnit: normalization.native.unit,
      normalizedValueCurrent: normalization.normalized?.valueCurrent,
      normalizedValueChange: normalization.normalized?.valueChange,
      normalizedValueChangePct: normalization.normalized?.valueChangePct,
      normalizedCurrency: normalization.normalized?.currency,
      normalizedUnit: normalization.normalized?.unit,
      normalizationStatus: normalization.status,
      normalizationMethod: normalization.meta.method,
      normalizationMeta: {
        fxRateUsed: normalization.meta.fxRateUsed,
        bushelsPerTon: normalization.meta.bushelsPerTon,
        cropFactor: normalization.meta.cropFactor,
        notes: normalization.meta.notes,
      },
    },
  };
}

export function statusFromAvailability(opts: {
  hasValue: boolean;
  fallback?: boolean;
  delayed?: boolean;
  indicative?: boolean;
}): GrainWidgetStatus {
  if (!opts.hasValue && opts.fallback) return "FALLBACK";
  if (!opts.hasValue) return "OFFLINE";
  if (opts.fallback) return "FALLBACK";
  if (opts.delayed) return "DELAYED";
  if (opts.indicative) return "INDICATIVE";
  return "REFRESH";
}
