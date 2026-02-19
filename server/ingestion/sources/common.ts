import { createHash } from "node:crypto";
import { normalizeCommodity } from "../normalization/commodity";
import type { MarketPricePoint, ProviderDefinition, ProviderParseResult, SourceLayer } from "../types";

const DATE_RE = /\b(20\d{2}[-/.](0[1-9]|1[0-2])[-/.](0[1-9]|[12]\d|3[01]))\b/g;
const DATE_RE_DMY = /\b([0-3]?\d)[/.]([01]?\d)[/.](20\d{2})\b/g;
const PRICE_RE = /(?:USD|US\$|ARS|BRL|EUR|R\$|\$)?\s*(-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,4})|\d+(?:[.,]\d{1,4}))/g;

const LAST_REQUEST_BY_DOMAIN = new Map<string, number>();

function parsePrice(raw: string, numberFormat: "auto" | "thousands_dot_decimal_comma" = "auto"): number | null {
  const cleaned = raw.replace(/\s/g, "");
  if (!cleaned) return null;
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  let normalized = cleaned;
  if (hasComma && hasDot) {
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      normalized = cleaned.replace(/\./g, "").replace(/,/g, ".");
    } else {
      normalized = cleaned.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    normalized = cleaned.replace(/,/g, ".");
  } else if (!hasComma && hasDot && numberFormat === "thousands_dot_decimal_comma") {
    if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
      normalized = cleaned.replace(/\./g, "");
    }
  }
  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value) || value <= 0 || value > 1_000_000) return null;
  return value;
}

function parseDates(content: string, customDateRegex?: string): string[] {
  const out = new Set<string>();
  const dateRe = customDateRegex ? new RegExp(customDateRegex, "g") : DATE_RE;
  for (const m of content.matchAll(dateRe)) {
    const candidate = String(m[1] || m[0]).replace(/\./g, "-").replace(/\//g, "-");
    const ts = new Date(`${candidate}T00:00:00.000Z`).getTime();
    if (Number.isFinite(ts)) out.add(candidate);
  }
  for (const m of content.matchAll(DATE_RE_DMY)) {
    const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    const ts = new Date(`${iso}T00:00:00.000Z`).getTime();
    if (Number.isFinite(ts)) out.add(iso);
  }
  return [...out].sort();
}

function pickAsOfDate(dates: string[]): string | null {
  if (dates.length === 0) return null;
  const cutoff = Date.now() + 24 * 60 * 60 * 1000;
  const eligible = dates.filter((date) => {
    const ts = new Date(`${date}T00:00:00.000Z`).getTime();
    return Number.isFinite(ts) && ts <= cutoff;
  });
  return (eligible.length > 0 ? eligible : dates).slice(-1)[0] || null;
}

function updateSignal(dates: string[]): "daily_likely" | "weekly_or_irregular" | "unknown" {
  if (dates.length === 0) return "unknown";
  const today = new Date().setHours(0, 0, 0, 0);
  const last7 = dates.filter((date) => {
    const ts = new Date(`${date}T00:00:00.000Z`).getTime();
    if (!Number.isFinite(ts)) return false;
    const diff = Math.floor((today - ts) / (24 * 60 * 60 * 1000));
    return diff >= 0 && diff <= 7;
  });
  if (last7.length >= 4) return "daily_likely";
  if (last7.length >= 1) return "weekly_or_irregular";
  return "unknown";
}

function confidence(args: { statusCode: number; hasPrice: boolean; hasDate: boolean; hasHistory: boolean }): number {
  let score = 0;
  if (args.statusCode >= 200 && args.statusCode < 300) score += 0.25;
  if (args.hasPrice) score += 0.3;
  if (args.hasDate) score += 0.2;
  if (args.hasHistory) score += 0.15;
  return Number(Math.min(score, 0.95).toFixed(2));
}

function inferRawCurrency(body: string, hint?: "USD" | "ARS" | "BRL" | "EUR"): "USD" | "ARS" | "BRL" | "EUR" | "UNKNOWN" {
  if (hint) return hint;
  if (/\bARS\b|argentine peso/i.test(body)) return "ARS";
  if (/\bBRL\b|R\$/i.test(body)) return "BRL";
  if (/\bEUR\b|€/i.test(body)) return "EUR";
  if (/\bUSD\b|US\$|\$/i.test(body)) return "USD";
  return "UNKNOWN";
}

function inferRawUnit(body: string, currency: string, hint?: "t" | "kg" | "bu" | "cwt" | "bag60kg" | "qq100kg"): string {
  const normalizedHint = hint || null;
  if (normalizedHint === "bu" || /USD\s*\/\s*bu|\busd\/bu\b|bushel/i.test(body)) return "USD/bu";
  if (normalizedHint === "kg" || /\b\/\s*kg\b|\bper\s+kg\b/i.test(body)) return `${currency}/kg`;
  if (normalizedHint === "cwt" || /\b\/\s*cwt\b|\bcentum\b|\bhundredweight\b/i.test(body)) return `${currency}/cwt`;
  if (normalizedHint === "bag60kg" || /\b(bag|sack)\b.{0,8}\b60\s?kg\b/i.test(body)) return `${currency}/bag60kg`;
  if (normalizedHint === "qq100kg" || /\bqq\b|\bquintal\b|\b100\s?kg\b/i.test(body)) return `${currency}/qq100kg`;
  if (normalizedHint === "t" || /\b\/\s*t\b|\b\/\s*ton\b|\bper\s+ton\b|\bmetric\s+ton\b/i.test(body)) return `${currency}/t`;
  return "UNKNOWN";
}

function extractFailureSnippet(body: string, keywords: string[] = []): string {
  const probe = keywords.find((k) => body.toLowerCase().includes(k.toLowerCase()));
  if (!probe) return sanitizeSnippet(body.slice(0, 2000));
  const idx = body.toLowerCase().indexOf(probe.toLowerCase());
  const start = Math.max(0, idx - 600);
  return sanitizeSnippet(body.slice(start, start + 2400));
}

function sanitizeSnippet(input: string): string {
  return input
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "postgresql://[redacted]")
    .replace(/\b[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}\b/g, "[redacted-jwt]")
    .replace(/\b(SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|SESSION_SECRET|JWT_SECRET)\b\s*[:=]\s*["']?[^"'\s<]+/gi, "$1=[redacted]")
    .replace(/\b(authorization|token)\b\s*[:=]\s*["']?bearer\s+[A-Za-z0-9._\-+/=]+/gi, "$1=Bearer [redacted]");
}

function extractDatePricePairs(
  body: string,
  opts?: { customPriceRegex?: string; commodityKeywords?: string[]; numberFormat?: "auto" | "thousands_dot_decimal_comma" }
): Array<{ asOf: string; price: number }> {
  const pairs: Array<{ asOf: string; price: number }> = [];
  const priceRe = opts?.customPriceRegex ? new RegExp(opts.customPriceRegex, "g") : PRICE_RE;
  const commodityKeywords = (opts?.commodityKeywords || []).map((k) => k.toLowerCase());
  const numberFormat = opts?.numberFormat || "auto";
  const lines = body.split(/\n|<tr|<li|<p|<div/gi);
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    if (commodityKeywords.length > 0 && !commodityKeywords.some((kw) => lowerLine.includes(kw))) {
      continue;
    }
    const ds = parseDates(line);
    if (ds.length === 0) continue;
    const prices = [...line.matchAll(priceRe)]
      .map((m) => parsePrice(String(m[1] || m[0] || ""), numberFormat))
      .filter((n): n is number => Number.isFinite(n))
      .filter((n) => n > 0.0001 && n < 2_000_000);
    if (prices.length === 0) continue;
    pairs.push({ asOf: ds[0], price: prices[0] });
  }
  const dedup = new Map<string, number>();
  for (const p of pairs) {
    if (!dedup.has(p.asOf)) dedup.set(p.asOf, p.price);
  }
  return [...dedup.entries()].map(([asOf, price]) => ({ asOf, price })).sort((a, b) => b.asOf.localeCompare(a.asOf));
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function rateLimitByDomain(url: string, rateMs = Number.parseInt(process.env.INGEST_RATE_LIMIT_MS || "1000", 10)) {
  const domain = new URL(url).hostname;
  const last = LAST_REQUEST_BY_DOMAIN.get(domain) || 0;
  const now = Date.now();
  const wait = rateMs - (now - last);
  if (wait > 0) await sleep(wait);
  LAST_REQUEST_BY_DOMAIN.set(domain, Date.now());
}

async function fetchWithRetry(url: string): Promise<Response> {
  const delays = [1000, 3000, 9000];
  let lastErr: unknown;
  for (let i = 0; i <= delays.length; i++) {
    try {
      await rateLimitByDomain(url);
      return await fetch(url, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
          accept: "text/html,application/json;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9,es;q=0.8,pt;q=0.7",
        },
      });
    } catch (error) {
      lastErr = error;
      if (i < delays.length) await sleep(delays[i]);
    }
  }
  throw lastErr;
}

async function maybeRender(url: string): Promise<string | null> {
  if (process.env.INGEST_USE_PLAYWRIGHT !== "true") return null;
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(2000);
      return await page.content();
    } finally {
      await browser.close();
    }
  } catch {
    return null;
  }
}

export async function fetchAndParseProvider(def: ProviderDefinition, layer: SourceLayer): Promise<ProviderParseResult> {
  const started = Date.now();
  const response = await fetchWithRetry(def.url);

  let body = await response.text();
  let dates = parseDates(body, def.parserSpec?.dateRegex);
  let prices = [...body.matchAll(def.parserSpec?.priceRegex ? new RegExp(def.parserSpec.priceRegex, "g") : PRICE_RE)]
    .map((m) => parsePrice(String(m[1] || m[0] || ""), def.parserSpec?.numberFormat || "auto"))
    .filter((n): n is number => Number.isFinite(n))
    .filter((n) => n > 0.0001 && n < 2_000_000);

  if ((prices.length === 0 || dates.length === 0) && process.env.INGEST_USE_PLAYWRIGHT === "true") {
    const rendered = await maybeRender(def.url);
    if (rendered) {
      body = rendered;
      dates = parseDates(body, def.parserSpec?.dateRegex);
      prices = [...body.matchAll(def.parserSpec?.priceRegex ? new RegExp(def.parserSpec.priceRegex, "g") : PRICE_RE)]
        .map((m) => parsePrice(String(m[1] || m[0] || ""), def.parserSpec?.numberFormat || "auto"))
        .filter((n): n is number => Number.isFinite(n))
        .filter((n) => n > 0.0001 && n < 2_000_000);
    }
  }

  const dedupPrices = [...new Set(prices)].slice(0, 120);
  const asOf = pickAsOfDate(dates);
  const hasHistory = new Set(dates).size >= 5;
  const rawCurrency = inferRawCurrency(body, def.parserSpec?.currencyHint);
  const rawUnit = inferRawUnit(body, rawCurrency, def.parserSpec?.unitHint);
  const rawTextSnippet = sanitizeSnippet(body.slice(0, 700));

  const commodityNorm = normalizeCommodity(def.commodityHint);
  const points: MarketPricePoint[] = [];

  const historyLimit = Math.min(Math.max(Number.parseInt(process.env.INGEST_HISTORY_DAYS || "60", 10), 1), 730);
  const pairs = extractDatePricePairs(body, {
    customPriceRegex: def.parserSpec?.priceRegex,
    commodityKeywords: def.parserSpec?.commodityKeywords,
    numberFormat: def.parserSpec?.numberFormat,
  }).slice(0, historyLimit);

  if (pairs.length > 0) {
    for (const pair of pairs) {
      const htmlSha = createHash("sha256").update(body).digest("hex").slice(0, 16);
      points.push({
        market: def.market,
        commodity: commodityNorm.commodity,
        category: commodityNorm.category,
        variant: commodityNorm.variant,
        rawCommodity: def.commodityHint,
        basis: def.basis,
        unit: "USD/t",
        price: pair.price,
        priceRaw: pair.price,
        rawUnit,
        rawCurrency,
        asOf: pair.asOf,
        fetchedAt: new Date().toISOString(),
        source: {
          vendor: def.vendor,
          channel: def.channel,
          url: def.url,
          layer,
          confidence: confidence({
            statusCode: response.status,
            hasPrice: dedupPrices.length > 0,
            hasDate: Boolean(asOf),
            hasHistory,
          }),
        },
        raw: { htmlSha, parser: "heuristic", rawTextSnippet },
      });
    }
  } else if (asOf && dedupPrices.length > 0) {
    const price = dedupPrices[0];
    const htmlSha = createHash("sha256").update(body).digest("hex").slice(0, 16);
    points.push({
      market: def.market,
      commodity: commodityNorm.commodity,
      category: commodityNorm.category,
      variant: commodityNorm.variant,
      rawCommodity: def.commodityHint,
      basis: def.basis,
      unit: "USD/t",
      price,
      priceRaw: price,
      rawUnit,
      rawCurrency,
      asOf,
      fetchedAt: new Date().toISOString(),
      source: {
        vendor: def.vendor,
        channel: def.channel,
        url: def.url,
        layer,
        confidence: confidence({
          statusCode: response.status,
          hasPrice: dedupPrices.length > 0,
          hasDate: Boolean(asOf),
          hasHistory,
        }),
      },
      raw: { htmlSha, parser: "heuristic", rawTextSnippet },
    });
  }

  const failureSnippet = points.length === 0
    ? extractFailureSnippet(body, [...(def.parserSpec?.dateKeywords || []), ...(def.parserSpec?.priceKeywords || [])])
    : null;

  return {
    vendor: def.vendor,
    channel: def.channel,
    url: def.url,
    market: def.market,
    commodityHint: def.commodityHint,
    points,
    statusCode: response.status,
    contentType: response.headers.get("content-type") || "unknown",
    hasDate: Boolean(asOf),
    hasHistory,
    updateSignal: updateSignal(dates),
    confidence: confidence({
      statusCode: response.status,
      hasPrice: dedupPrices.length > 0,
      hasDate: Boolean(asOf),
      hasHistory,
    }),
    notes: [
      `pricesDetected=${dedupPrices.length}`,
      `datesDetected=${new Set(dates).size}`,
      ...(failureSnippet ? [`failureSnippet=${failureSnippet.slice(0, 2200)}`] : []),
    ],
    latencyMs: Date.now() - started,
  };
}
