import {
  ENABLE_EURONEXT_WIDGETS,
  EURONEXT_SOURCE_URL,
  EURONEXT_WEBSERVICES_URL,
  GRAIN_MARKETS_FETCH_TIMEOUT_MS,
} from "../config";
import type { GrainInstrumentWidget, GrainMarketsProvider } from "../types";
import { deriveSeriesFromLast, fetchTextWithTimeout, makeMockSeries, normalizeDate, parseNumber, statusFromSource } from "./utils";

type ContractConfig = {
  id: string;
  instrumentKey: GrainInstrumentWidget["instrumentKey"];
  code: string;
  title: string;
  instrument: string;
  unit: string;
  aliases: string[];
};

const CONTRACTS: ContractConfig[] = [
  {
    id: "euronext-wheat",
    instrumentKey: "milling_wheat",
    code: "EBM",
    title: "Euronext Milling Wheat",
    instrument: "Milling Wheat",
    unit: "EUR/t",
    aliases: ["milling wheat", "wheat", "ebm"],
  },
  {
    id: "euronext-corn",
    instrumentKey: "euronext_corn",
    code: "EMA",
    title: "Euronext Corn",
    instrument: "Corn",
    unit: "EUR/t",
    aliases: ["corn", "maize", "ema"],
  },
  {
    id: "euronext-rapeseed",
    instrumentKey: "rapeseed",
    code: "ECO",
    title: "Euronext Rapeseed",
    instrument: "Rapeseed",
    unit: "EUR/t",
    aliases: ["rapeseed", "canola", "eco"],
  },
];

type EuronextQuote = {
  code: string;
  last?: number;
  changeAbs?: number;
  changePct?: number;
  updatedAt?: string;
};

function toWidget(contract: ContractConfig, quote: EuronextQuote | undefined, reason?: string): GrainInstrumentWidget {
  const lastPrice = quote?.last;
  const changeAbs = quote?.changeAbs;
  const changePct = quote?.changePct;
  return {
    id: contract.id,
    instrumentKey: contract.instrumentKey,
    venue: "Euronext",
    instrument: contract.instrument,
    title: contract.title,
    status: statusFromSource(Boolean(quote && !reason), Boolean(lastPrice != null)),
    sourceName: "Euronext Web Services",
    sourceAttribution: "Euronext web JSON polling (demo, no websocket)",
    sourceUrl: EURONEXT_SOURCE_URL,
    updatedAt: quote?.updatedAt,
    lastPrice,
    changeAbs,
    changePct,
    timeframe: lastPrice != null ? "1d" : "indicative",
    unit: contract.unit,
    series: lastPrice != null ? deriveSeriesFromLast(lastPrice, changeAbs, 10) : [],
    fallbackReason: reason,
  };
}

function flattenCandidates(input: any): any[] {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.results)) return input.results;
  if (Array.isArray(input?.data)) return input.data;
  if (Array.isArray(input?.instruments)) return input.instruments;
  return [input];
}

function parseEuronextPayload(raw: string): Map<string, EuronextQuote> {
  const out = new Map<string, EuronextQuote>();
  let json: any;
  try {
    json = JSON.parse(raw);
  } catch {
    return out;
  }

  const rows = flattenCandidates(json);
  for (const row of rows) {
    const symbol = String(row?.symbol || row?.code || row?.isin || row?.mnemo || row?.instrument || "").toUpperCase();
    if (!symbol) continue;
    const payload = {
      code: symbol,
      last: parseNumber(row?.last ?? row?.lastPrice ?? row?.price ?? row?.close),
      changeAbs: parseNumber(row?.change ?? row?.netChange ?? row?.delta),
      changePct: parseNumber(row?.changePercent ?? row?.pctChange ?? row?.percentChange),
      updatedAt: normalizeDate(row?.updatedAt ?? row?.timestamp ?? row?.time),
    };
    out.set(symbol, payload);
  }

  return out;
}

function pickQuote(map: Map<string, EuronextQuote>, contract: ContractConfig): EuronextQuote | undefined {
  for (const [symbol, quote] of map.entries()) {
    const norm = symbol.toLowerCase();
    if (contract.aliases.some((alias) => norm.includes(alias.toLowerCase()))) {
      return quote;
    }
  }
  return map.get(contract.code);
}

export class EuronextProvider implements GrainMarketsProvider {
  readonly id = "euronext" as const;
  readonly enabled = ENABLE_EURONEXT_WIDGETS;

  async getWidgets(): Promise<GrainInstrumentWidget[]> {
    if (!EURONEXT_WEBSERVICES_URL) {
      return this.mockFallback("euronext_webservices_url_missing");
    }

    const text = await fetchTextWithTimeout(EURONEXT_WEBSERVICES_URL, GRAIN_MARKETS_FETCH_TIMEOUT_MS);
    const parsed = parseEuronextPayload(text);

    if (!parsed.size) {
      return this.mockFallback("euronext_payload_parse_failed");
    }

    const updatedAt = new Date().toISOString();

    return CONTRACTS.map((contract) => {
      const quote = pickQuote(parsed, contract);
      const widget = toWidget(contract, quote, quote ? undefined : "euronext_quote_missing");
      if (!widget.updatedAt) {
        widget.updatedAt = updatedAt;
      }
      return widget;
    });
  }

  mockFallback(reason: string): GrainInstrumentWidget[] {
    return [
      {
        id: "euronext-wheat",
        instrumentKey: "milling_wheat",
        venue: "Euronext",
        instrument: "Milling Wheat",
        title: "Euronext Milling Wheat",
        status: "FALLBACK",
        sourceName: "Euronext Web Services",
        sourceAttribution: "Fallback sample while Euronext JSON polling is unavailable",
        sourceUrl: EURONEXT_SOURCE_URL,
        updatedAt: new Date().toISOString(),
        lastPrice: 232.5,
        changeAbs: 2.1,
        changePct: 0.91,
        timeframe: "indicative",
        unit: "EUR/t",
        series: makeMockSeries(231.2, 2.2, 10),
        fallbackReason: reason,
      },
      {
        id: "euronext-corn",
        instrumentKey: "euronext_corn",
        venue: "Euronext",
        instrument: "Corn",
        title: "Euronext Corn",
        status: "FALLBACK",
        sourceName: "Euronext Web Services",
        sourceAttribution: "Fallback sample while Euronext JSON polling is unavailable",
        sourceUrl: EURONEXT_SOURCE_URL,
        updatedAt: new Date().toISOString(),
        lastPrice: 218.7,
        changeAbs: -1.5,
        changePct: -0.68,
        timeframe: "indicative",
        unit: "EUR/t",
        series: makeMockSeries(220.1, 1.9, 10),
        fallbackReason: reason,
      },
      {
        id: "euronext-rapeseed",
        instrumentKey: "rapeseed",
        venue: "Euronext",
        instrument: "Rapeseed",
        title: "Euronext Rapeseed",
        status: "FALLBACK",
        sourceName: "Euronext Web Services",
        sourceAttribution: "Fallback sample while Euronext JSON polling is unavailable",
        sourceUrl: EURONEXT_SOURCE_URL,
        updatedAt: new Date().toISOString(),
        lastPrice: 473.2,
        changeAbs: 3.8,
        changePct: 0.81,
        timeframe: "indicative",
        unit: "EUR/t",
        series: makeMockSeries(470.8, 3.5, 10),
        fallbackReason: reason,
      },
    ];
  }
}
