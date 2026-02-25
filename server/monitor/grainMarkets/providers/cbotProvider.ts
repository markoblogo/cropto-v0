import {
  BARCHART_API_KEY,
  BARCHART_CBOT_SYMBOLS,
  BARCHART_QUOTES_URL,
  ENABLE_CBOT_WIDGETS,
  GRAIN_MARKETS_FETCH_TIMEOUT_MS,
  TRADINGCHARTS_CBOT_URL,
} from "../config";
import type { GrainInstrumentWidget, GrainMarketsProvider } from "../types";
import { deriveSeriesFromLast, fetchTextWithTimeout, makeMockSeries, normalizeDate, parseNumber, statusFromSource } from "./utils";

type ContractConfig = {
  id: string;
  instrumentKey: GrainInstrumentWidget["instrumentKey"];
  symbol: string;
  title: string;
  instrument: string;
  unit: string;
  aliases: string[];
};

const CONTRACTS: ContractConfig[] = [
  {
    id: "cbot-corn",
    instrumentKey: "corn",
    symbol: "ZC*1",
    title: "CBOT Corn",
    instrument: "Corn",
    unit: "USD/bu",
    aliases: ["corn", "zc"],
  },
  {
    id: "cbot-wheat",
    instrumentKey: "wheat",
    symbol: "ZW*1",
    title: "CBOT Wheat",
    instrument: "Wheat",
    unit: "USD/bu",
    aliases: ["wheat", "zw", "srw"],
  },
  {
    id: "cbot-soy",
    instrumentKey: "soy",
    symbol: "ZS*1",
    title: "CBOT Soybeans",
    instrument: "Soybeans",
    unit: "USD/bu",
    aliases: ["soy", "soybeans", "zs"],
  },
];

type QuoteResult = {
  symbol?: string;
  name?: string;
  lastPrice?: number | string;
  close?: number | string;
  netChange?: number | string;
  percentChange?: number | string;
  tradeTimestamp?: string | number;
  serverTimestamp?: string | number;
};

function toWidget(contract: ContractConfig, source: {
  sourceName: string;
  sourceAttribution: string;
  sourceUrl: string;
  lastPrice?: number;
  changeAbs?: number;
  changePct?: number;
  updatedAt?: string;
  primary: boolean;
  fallbackReason?: string;
}): GrainInstrumentWidget {
  const last = source.lastPrice;
  const changeAbs = source.changeAbs;
  const changePct = source.changePct;
  const hasHistory = last != null;
  return {
    id: contract.id,
    instrumentKey: contract.instrumentKey,
    venue: "CBOT/CME",
    instrument: contract.instrument,
    title: contract.title,
    status: statusFromSource(source.primary, hasHistory),
    sourceName: source.sourceName,
    sourceAttribution: source.sourceAttribution,
    sourceUrl: source.sourceUrl,
    updatedAt: source.updatedAt,
    lastPrice: last,
    changeAbs,
    changePct,
    timeframe: hasHistory ? "1d" : "indicative",
    unit: contract.unit,
    series: last != null ? deriveSeriesFromLast(last, changeAbs, 10) : [],
    fallbackReason: source.fallbackReason,
  };
}

async function fetchFromBarchart(): Promise<Map<string, QuoteResult>> {
  if (!BARCHART_API_KEY) throw new Error("barchart_api_key_missing");
  const params = new URLSearchParams({
    apikey: BARCHART_API_KEY,
    symbols: BARCHART_CBOT_SYMBOLS,
    fields: "symbol,name,lastPrice,close,netChange,percentChange,tradeTimestamp,serverTimestamp",
  });
  const text = await fetchTextWithTimeout(`${BARCHART_QUOTES_URL}?${params.toString()}`, GRAIN_MARKETS_FETCH_TIMEOUT_MS);
  const parsed = JSON.parse(text) as { results?: QuoteResult[] };
  const out = new Map<string, QuoteResult>();
  for (const row of parsed.results || []) {
    const symbol = (row.symbol || "").toUpperCase();
    if (!symbol) continue;
    out.set(symbol, row);
  }
  return out;
}

function parseTradingChartsBlock(raw: string, contract: ContractConfig): { last?: number; changeAbs?: number; changePct?: number } {
  const normalized = raw.toLowerCase();
  let bestIdx = -1;
  for (const alias of contract.aliases) {
    const idx = normalized.indexOf(alias.toLowerCase());
    if (idx >= 0 && (bestIdx < 0 || idx < bestIdx)) {
      bestIdx = idx;
    }
  }
  if (bestIdx < 0) return {};

  const window = raw.slice(Math.max(0, bestIdx - 120), Math.min(raw.length, bestIdx + 360));
  const pctMatch = window.match(/([+-]?\d+(?:\.\d+)?)\s*%/);
  const numbers = [...window.matchAll(/([+-]?\d+(?:\.\d+)?)/g)].map((m) => Number.parseFloat(m[1])).filter((n) => Number.isFinite(n));
  if (!numbers.length) return {};

  const last = numbers.find((n) => n > 1);
  const changeAbs = numbers.find((n) => Math.abs(n) < 50 && n !== last);
  const changePct = pctMatch ? Number.parseFloat(pctMatch[1]) : undefined;
  return { last, changeAbs, changePct };
}

async function fetchFromTradingCharts(): Promise<Map<string, { last?: number; changeAbs?: number; changePct?: number }>> {
  const html = await fetchTextWithTimeout(TRADINGCHARTS_CBOT_URL, GRAIN_MARKETS_FETCH_TIMEOUT_MS);
  const map = new Map<string, { last?: number; changeAbs?: number; changePct?: number }>();
  for (const contract of CONTRACTS) {
    map.set(contract.symbol, parseTradingChartsBlock(html, contract));
  }
  return map;
}

export class CbotProvider implements GrainMarketsProvider {
  readonly id = "cbot" as const;
  readonly enabled = ENABLE_CBOT_WIDGETS;

  async getWidgets(): Promise<GrainInstrumentWidget[]> {
    let barchartData: Map<string, QuoteResult> | null = null;
    let tradingChartsData: Map<string, { last?: number; changeAbs?: number; changePct?: number }> | null = null;

    try {
      barchartData = await fetchFromBarchart();
    } catch {
      barchartData = null;
    }

    if (!barchartData || barchartData.size === 0) {
      try {
        tradingChartsData = await fetchFromTradingCharts();
      } catch {
        tradingChartsData = null;
      }
    }

    const widgets = CONTRACTS.map((contract) => {
      const fromBarchart = barchartData?.get(contract.symbol.toUpperCase());
      if (fromBarchart) {
        const lastPrice = parseNumber(fromBarchart.lastPrice) ?? parseNumber(fromBarchart.close);
        const changeAbs = parseNumber(fromBarchart.netChange);
        const changePct = parseNumber(fromBarchart.percentChange);
        return toWidget(contract, {
          sourceName: "Barchart OnDemand",
          sourceAttribution: "Barchart OnDemand API (demo polling)",
          sourceUrl: "https://www.barchart.com/ondemand/api/getQuote",
          lastPrice,
          changeAbs,
          changePct,
          updatedAt: normalizeDate(fromBarchart.tradeTimestamp) || normalizeDate(fromBarchart.serverTimestamp),
          primary: true,
        });
      }

      const fromTradingCharts = tradingChartsData?.get(contract.symbol);
      if (fromTradingCharts?.last != null) {
        return toWidget(contract, {
          sourceName: "TradingCharts",
          sourceAttribution: "TradingCharts HTML indicative scrape fallback",
          sourceUrl: TRADINGCHARTS_CBOT_URL,
          lastPrice: fromTradingCharts.last,
          changeAbs: fromTradingCharts.changeAbs,
          changePct: fromTradingCharts.changePct,
          updatedAt: new Date().toISOString(),
          primary: false,
          fallbackReason: "barchart_unavailable",
        });
      }

      return {
        ...this.mockFallback("cbot_source_unavailable").find((item) => item.id === contract.id)!,
      };
    });

    return widgets;
  }

  mockFallback(reason: string): GrainInstrumentWidget[] {
    return [
      {
        id: "cbot-corn",
        instrumentKey: "corn",
        venue: "CBOT/CME",
        instrument: "Corn",
        title: "CBOT Corn",
        status: "FALLBACK",
        sourceName: "Fallback sample",
        sourceAttribution: "Demo sample while CBOT sources are unavailable",
        sourceUrl: "https://www.cmegroup.com/markets/agriculture/grains/corn.html",
        updatedAt: new Date().toISOString(),
        lastPrice: 4.62,
        changeAbs: 0.06,
        changePct: 1.32,
        timeframe: "indicative",
        unit: "USD/bu",
        series: makeMockSeries(4.58, 0.08, 10),
        fallbackReason: reason,
      },
      {
        id: "cbot-wheat",
        instrumentKey: "wheat",
        venue: "CBOT/CME",
        instrument: "Wheat",
        title: "CBOT Wheat",
        status: "FALLBACK",
        sourceName: "Fallback sample",
        sourceAttribution: "Demo sample while CBOT sources are unavailable",
        sourceUrl: "https://www.cmegroup.com/markets/agriculture/grains/wheat.html",
        updatedAt: new Date().toISOString(),
        lastPrice: 5.78,
        changeAbs: -0.05,
        changePct: -0.86,
        timeframe: "indicative",
        unit: "USD/bu",
        series: makeMockSeries(5.82, 0.09, 10),
        fallbackReason: reason,
      },
      {
        id: "cbot-soy",
        instrumentKey: "soy",
        venue: "CBOT/CME",
        instrument: "Soybeans",
        title: "CBOT Soybeans",
        status: "FALLBACK",
        sourceName: "Fallback sample",
        sourceAttribution: "Demo sample while CBOT sources are unavailable",
        sourceUrl: "https://www.cmegroup.com/markets/agriculture/grains/soybean.html",
        updatedAt: new Date().toISOString(),
        lastPrice: 11.25,
        changeAbs: 0.12,
        changePct: 1.08,
        timeframe: "indicative",
        unit: "USD/bu",
        series: makeMockSeries(11.18, 0.16, 10),
        fallbackReason: reason,
      },
    ];
  }
}
