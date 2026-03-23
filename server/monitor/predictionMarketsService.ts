import { createHash } from "crypto";

const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.MONITOR_PREDICTION_TIMEOUT_MS || "8000", 10);
const DEFAULT_CACHE_TTL_MS = Number.parseInt(process.env.MONITOR_PREDICTION_CACHE_TTL_MS || String(5 * 60 * 1000), 10);
const MIN_LIQUIDITY_SCORE = Number.parseFloat(process.env.MONITOR_PREDICTION_MIN_LIQUIDITY || "0.2");

const KALSHI_BASE_URL = process.env.KALSHI_MARKET_DATA_BASE_URL || "https://api.elections.kalshi.com/trade-api/v2";
const POLYMARKET_BASE_URL = process.env.POLYMARKET_GAMMA_BASE_URL || "https://gamma-api.polymarket.com";

const MARKET_CATEGORY_KEYWORDS: Record<string, string[]> = {
  inflation: ["inflation", "cpi", "pce", "core inflation", "headline inflation"],
  rates: ["interest rate", "rate cut", "rate hike", "fomc", "fed", "ecb", "boe", "boj", "policy rate"],
  geopolitics: ["war", "conflict", "invasion", "sanctions", "embargo", "red sea", "black sea", "suez", "panama canal", "shipping"],
  recession: ["recession", "gdp", "unemployment", "soft landing", "hard landing", "stagflation"],
  agriculture: [
    "wheat",
    "corn",
    "maize",
    "barley",
    "rice",
    "soy",
    "soybean",
    "canola",
    "rapeseed",
    "sunflower",
    "grain",
    "harvest",
    "yield",
    "drought",
    "frost",
    "crop",
  ],
};

const REGION_KEYWORDS: Record<string, string[]> = {
  US: ["united states", "u.s.", "usa", "federal reserve", "fomc"],
  EU: ["eurozone", "eu", "european central bank", "ecb", "europe"],
  BR: ["brazil", "brasil"],
  AR: ["argentina"],
  UA: ["ukraine", "black sea", "odessa", "odesa"],
  GLOBAL: ["global", "world"],
};

type CanonicalSource = "kalshi" | "polymarket";
type CanonicalCategory = "inflation" | "rates" | "geopolitics" | "recession" | "agriculture" | "other";

export type CanonicalMarket = {
  id: string;
  source: CanonicalSource;
  question: string;
  description?: string;
  category: CanonicalCategory;
  tags: string[];
  region: string;
  impliedProbability: number;
  yesPrice?: number;
  noPrice?: number;
  volume24h: number;
  openInterest: number;
  liquidityScore: number;
  orderbookSpreadBps?: number;
  qualityScore: number;
  rawOutcomes?: Array<{ name: string; price: number; bid?: number; ask?: number }>;
  status: "open" | "closed" | "resolved";
  closeTime?: string;
  scrapedAt: string;
};

type PredictionRiskIndex = {
  key: "inflation_risk" | "rates_risk" | "geopolitics_risk" | "grain_risk";
  label: string;
  value: number | null;
  contributors: number;
  totalWeight: number;
};

export type PredictionMarketsPayload = {
  generatedAt: string;
  source: string;
  cacheHit: boolean;
  marketCount: number;
  sources: {
    kalshi: { ok: boolean; count: number; error?: string };
    polymarket: { ok: boolean; count: number; error?: string };
  };
  indices: PredictionRiskIndex[];
  directGrainMarkets: Array<{
    id: string;
    source: CanonicalSource;
    question: string;
    impliedProbability: number;
    volume24h: number;
    liquidityScore: number;
    orderbookSpreadBps?: number;
    qualityScore: number;
    closeTime?: string;
    region: string;
    tags: string[];
  }>;
};

type CachedPredictionPayload = {
  generatedAtMs: number;
  payload: PredictionMarketsPayload;
  markets: CanonicalMarket[];
};

let cache: CachedPredictionPayload | null = null;

function hashId(seed: string) {
  return createHash("sha1").update(seed).digest("hex").slice(0, 20);
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/[^\d.-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function clampProbability(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value > 1) return Math.max(0, Math.min(1, value / 100));
  return Math.max(0, Math.min(1, value));
}

function computeSpreadBps(bid?: number, ask?: number): number | undefined {
  if (bid == null || ask == null) return undefined;
  if (!Number.isFinite(bid) || !Number.isFinite(ask)) return undefined;
  if (ask <= 0 || bid < 0 || ask < bid) return undefined;
  const mid = (bid + ask) / 2;
  if (mid <= 0) return undefined;
  return Number((((ask - bid) / mid) * 10_000).toFixed(2));
}

function computeQualityScore(args: { liquidityScore: number; spreadBps?: number; volume24h: number; openInterest: number }): number {
  const liquidityPart = Math.max(0, Math.min(1, args.liquidityScore));
  const depthPart = Math.max(0, Math.min(1, (Math.log10(1 + Math.max(args.volume24h, 0) + Math.max(args.openInterest, 0))) / 6));
  const spreadPenalty = args.spreadBps == null
    ? 0.12
    : Math.max(0, Math.min(0.45, args.spreadBps / 10_000));
  const score = Math.max(0, Math.min(1, liquidityPart * 0.5 + depthPart * 0.5 - spreadPenalty));
  return Number(score.toFixed(4));
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function inferCategoryAndTags(text: string): { category: CanonicalCategory; tags: string[] } {
  const normalized = normalizeText(text);
  const tags = new Set<string>();
  let detected: CanonicalCategory = "other";

  (Object.keys(MARKET_CATEGORY_KEYWORDS) as CanonicalCategory[]).forEach((category) => {
    const words = MARKET_CATEGORY_KEYWORDS[category] || [];
    for (const word of words) {
      if (normalized.includes(word)) {
        tags.add(word);
        if (detected === "other") detected = category;
      }
    }
  });

  return { category: detected, tags: [...tags].slice(0, 10) };
}

function inferRegion(text: string): string {
  const normalized = normalizeText(text);
  for (const [region, hints] of Object.entries(REGION_KEYWORDS)) {
    if (hints.some((hint) => normalized.includes(hint))) return region;
  }
  return "GLOBAL";
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "CroptoMonitor/prediction-markets",
        accept: "application/json,text/plain,*/*",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeKalshi(raw: unknown, nowIso: string): CanonicalMarket[] {
  const body = raw as { markets?: unknown[] };
  const markets = Array.isArray(body?.markets) ? body.markets : [];
  const normalized: CanonicalMarket[] = [];
  for (const entry of markets) {
    const item = entry as Record<string, unknown>;
    const question = String(item.title || item.subtitle || item.question || "").trim();
    if (!question) continue;
    const description = String(item.rules_primary || item.rules || "").trim() || undefined;
    const textBlob = `${question} ${description || ""}`;
    const { category, tags } = inferCategoryAndTags(textBlob);
    const yesBid = clampProbability(toNumber(item.yes_bid));
    const yesAsk = clampProbability(toNumber(item.yes_ask));
    const yesPrice = clampProbability(yesBid || yesAsk || toNumber(item.yes_price));
    const noBid = clampProbability(toNumber(item.no_bid));
    const noAsk = clampProbability(toNumber(item.no_ask));
    const noPrice = clampProbability(noBid || noAsk || toNumber(item.no_price));
    const impliedProbability = yesPrice > 0 ? yesPrice : (1 - noPrice > 0 ? 1 - noPrice : 0);
    const volume24h = toNumber(item.volume_24h) || toNumber(item.volume);
    const openInterest = toNumber(item.open_interest);
    const liquidityScore = Math.max(
      0,
      Math.min(1, (Math.log10(1 + Math.max(volume24h, 0)) / 5) + (Math.log10(1 + Math.max(openInterest, 0)) / 6)),
    );
    const spreadBps = computeSpreadBps(yesBid || undefined, yesAsk || undefined);
    const qualityScore = computeQualityScore({ liquidityScore, spreadBps, volume24h, openInterest });
    const statusRaw = String(item.status || "open").toLowerCase();
    const status: CanonicalMarket["status"] =
      statusRaw.includes("open") ? "open" : statusRaw.includes("resolved") ? "resolved" : "closed";
    normalized.push({
      id: `kalshi:${String(item.ticker || hashId(`kalshi:${question}`))}`,
      source: "kalshi",
      question,
      description,
      category,
      tags,
      region: inferRegion(textBlob),
      impliedProbability,
      yesPrice: yesPrice || undefined,
      noPrice: noPrice || undefined,
      volume24h,
      openInterest,
      liquidityScore,
      orderbookSpreadBps: spreadBps,
      qualityScore,
      rawOutcomes: [
        { name: "yes", price: yesPrice, bid: yesBid || undefined, ask: yesAsk || undefined },
        { name: "no", price: noPrice, bid: noBid || undefined, ask: noAsk || undefined },
      ],
      status,
      closeTime: typeof item.close_time === "string" ? item.close_time : undefined,
      scrapedAt: nowIso,
    });
  }
  return normalized;
}

function normalizePolymarket(raw: unknown, nowIso: string): CanonicalMarket[] {
  const markets = Array.isArray(raw) ? raw : [];
  const normalized: CanonicalMarket[] = [];
  for (const entry of markets) {
    const item = entry as Record<string, unknown>;
    const question = String(item.question || item.title || "").trim();
    if (!question) continue;
    const description = String(item.description || "").trim() || undefined;
    const categoryRaw = String(item.category || "").toLowerCase();
    const rawTags = Array.isArray(item.tags) ? item.tags.map((tag) => String((tag as Record<string, unknown>)?.label || tag)).filter(Boolean) : [];
    const textBlob = `${question} ${description || ""} ${categoryRaw} ${rawTags.join(" ")}`;
    const inferred = inferCategoryAndTags(textBlob);
    const category = categoryRaw.includes("inflation")
      ? "inflation"
      : categoryRaw.includes("rate") || categoryRaw.includes("fed") || categoryRaw.includes("macro")
        ? "rates"
        : categoryRaw.includes("geopolit") || categoryRaw.includes("war")
          ? "geopolitics"
          : categoryRaw.includes("commodit") || categoryRaw.includes("agri")
            ? "agriculture"
            : inferred.category;

    const outcomesRaw = Array.isArray(item.outcomes) ? item.outcomes : [];
    const normalizedOutcomes: Array<{ name: string; price: number; bid?: number; ask?: number }> = [];
    let yesPrice = 0;
    let noPrice = 0;
    if (outcomesRaw.length > 0) {
      for (const out of outcomesRaw) {
        const o = out as Record<string, unknown>;
        const name = String(o.name || "").toLowerCase();
        const price = clampProbability(toNumber(o.price));
        const bid = clampProbability(toNumber(o.bestBid || o.bid));
        const ask = clampProbability(toNumber(o.bestAsk || o.ask));
        normalizedOutcomes.push({ name: name || "outcome", price, bid: bid || undefined, ask: ask || undefined });
        if (name === "yes") yesPrice = price;
        if (name === "no") noPrice = price;
      }
    }
    if (yesPrice === 0 && typeof item.outcomePrices === "string") {
      try {
        const parsed = JSON.parse(item.outcomePrices) as number[];
        if (Array.isArray(parsed) && parsed.length > 0) yesPrice = clampProbability(toNumber(parsed[0]));
      } catch {
        // ignore
      }
    }
    const impliedProbability = yesPrice > 0 ? yesPrice : (1 - noPrice > 0 ? 1 - noPrice : 0);
    const volume24h = toNumber(item.volume24hr) || toNumber(item.volume24h) || toNumber(item.volume);
    const openInterest = toNumber(item.openInterest) || toNumber(item.liquidity);
    const liquidityScore = Math.max(
      0,
      Math.min(1, (Math.log10(1 + Math.max(volume24h, 0)) / 5) + (Math.log10(1 + Math.max(openInterest, 0)) / 6)),
    );
    const bestYes = normalizedOutcomes.find((outcome) => outcome.name === "yes");
    const spreadBps = computeSpreadBps(bestYes?.bid, bestYes?.ask);
    const qualityScore = computeQualityScore({ liquidityScore, spreadBps, volume24h, openInterest });
    const active = item.active === true || String(item.active).toLowerCase() === "true";
    const closed = item.closed === true || String(item.closed).toLowerCase() === "true";
    const status: CanonicalMarket["status"] = active && !closed ? "open" : closed ? "closed" : "open";

    normalized.push({
      id: `polymarket:${String(item.id || hashId(`poly:${question}`))}`,
      source: "polymarket",
      question,
      description,
      category,
      tags: [...new Set([...inferred.tags, ...rawTags.map((tag) => normalizeText(tag)).filter(Boolean)])].slice(0, 12),
      region: inferRegion(textBlob),
      impliedProbability,
      yesPrice: yesPrice || undefined,
      noPrice: noPrice || undefined,
      volume24h,
      openInterest,
      liquidityScore,
      orderbookSpreadBps: spreadBps,
      qualityScore,
      rawOutcomes: normalizedOutcomes,
      status,
      closeTime: typeof item.endDate === "string" ? item.endDate : typeof item.end_date_iso === "string" ? item.end_date_iso : undefined,
      scrapedAt: nowIso,
    });
  }
  return normalized;
}

function weightedIndex(markets: CanonicalMarket[], key: PredictionRiskIndex["key"], label: string): PredictionRiskIndex {
  const filtered = markets.filter((market) => market.status === "open" && market.liquidityScore >= MIN_LIQUIDITY_SCORE);
  let weightedSum = 0;
  let weightTotal = 0;
  for (const market of filtered) {
    const weight = Math.max(0.05, (market.volume24h || 0) + (market.openInterest || 0)) * Math.max(0.1, market.liquidityScore);
    weightedSum += market.impliedProbability * weight;
    weightTotal += weight;
  }
  return {
    key,
    label,
    value: weightTotal > 0 ? Number((weightedSum / weightTotal).toFixed(4)) : null,
    contributors: filtered.length,
    totalWeight: Number(weightTotal.toFixed(2)),
  };
}

export async function getPredictionMarketsSnapshot(forceRefresh = false): Promise<PredictionMarketsPayload> {
  return (await getPredictionMarketsDetailedSnapshot(forceRefresh)).payload;
}

export async function getPredictionMarketsDetailedSnapshot(forceRefresh = false): Promise<{
  payload: PredictionMarketsPayload;
  markets: CanonicalMarket[];
}> {
  const now = Date.now();
  if (!forceRefresh && cache && now - cache.generatedAtMs < DEFAULT_CACHE_TTL_MS) {
    return { payload: { ...cache.payload, cacheHit: true }, markets: cache.markets };
  }

  const generatedAt = new Date(now).toISOString();
  const sourceState: PredictionMarketsPayload["sources"] = {
    kalshi: { ok: false, count: 0 },
    polymarket: { ok: false, count: 0 },
  };

  let kalshiMarkets: CanonicalMarket[] = [];
  let polyMarkets: CanonicalMarket[] = [];

  try {
    const kalshiRaw = await fetchJson(`${KALSHI_BASE_URL}/markets?status=open&limit=200`);
    kalshiMarkets = normalizeKalshi(kalshiRaw, generatedAt);
    sourceState.kalshi = { ok: true, count: kalshiMarkets.length };
  } catch (error: any) {
    sourceState.kalshi = { ok: false, count: 0, error: String(error?.message || "fetch_failed") };
  }

  try {
    const polyRaw = await fetchJson(`${POLYMARKET_BASE_URL}/markets?active=true&closed=false&limit=200`);
    polyMarkets = normalizePolymarket(polyRaw, generatedAt);
    sourceState.polymarket = { ok: true, count: polyMarkets.length };
  } catch (error: any) {
    sourceState.polymarket = { ok: false, count: 0, error: String(error?.message || "fetch_failed") };
  }

  const allMarkets = [...kalshiMarkets, ...polyMarkets];
  const inflation = weightedIndex(allMarkets.filter((market) => market.category === "inflation"), "inflation_risk", "Inflation Risk");
  const rates = weightedIndex(allMarkets.filter((market) => market.category === "rates"), "rates_risk", "Rates Risk");
  const geo = weightedIndex(allMarkets.filter((market) => market.category === "geopolitics"), "geopolitics_risk", "Geopolitics Risk");
  const grain = weightedIndex(allMarkets.filter((market) => market.category === "agriculture"), "grain_risk", "Grain Prediction Risk");

  const directGrainMarkets = allMarkets
    .filter((market) => market.category === "agriculture" && market.status === "open")
    .sort((a, b) => {
      const aScore = (a.volume24h + a.openInterest) * Math.max(0.1, a.liquidityScore);
      const bScore = (b.volume24h + b.openInterest) * Math.max(0.1, b.liquidityScore);
      return bScore - aScore;
    })
    .slice(0, 20)
    .map((market) => ({
      id: market.id,
      source: market.source,
      question: market.question,
      impliedProbability: Number((market.impliedProbability * 100).toFixed(1)),
      volume24h: Number((market.volume24h || 0).toFixed(2)),
      liquidityScore: Number(market.liquidityScore.toFixed(2)),
      orderbookSpreadBps: market.orderbookSpreadBps,
      qualityScore: Number(market.qualityScore.toFixed(2)),
      closeTime: market.closeTime,
      region: market.region,
      tags: market.tags,
    }));

  const payload: PredictionMarketsPayload = {
    generatedAt,
    source: "kalshi+polymarket",
    cacheHit: false,
    marketCount: allMarkets.length,
    sources: sourceState,
    indices: [inflation, rates, geo, grain],
    directGrainMarkets,
  };

  cache = {
    generatedAtMs: now,
    payload,
    markets: allMarkets,
  };

  return { payload, markets: allMarkets };
}
