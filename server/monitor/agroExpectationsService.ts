import { fetchTextWithTimeout } from "./grainWidgets/providers/utils";

const FETCH_TIMEOUT_MS = Number.parseInt(process.env.MONITOR_AGRO_EXPECT_TIMEOUT_MS || "7000", 10);
const CACHE_TTL_MS = Number.parseInt(process.env.MONITOR_AGRO_EXPECT_CACHE_TTL_MS || String(10 * 60 * 1000), 10);

const PURDUE_BAROMETER_URL = process.env.PURDUE_BAROMETER_URL || "https://ag.purdue.edu/commercialag/ageconomybarometer/";
const STOOQ_SYMBOLS = ["corn.us", "weat.us", "soyb.us", "dba.us", "tags.us"] as const;

type SeriesPoint = { ts: string; value: number };

export type AgroExpectationStatus = "REFRESH" | "INDICATIVE" | "CONSTRAINED";

export type EtfRow = {
  symbol: string;
  label: string;
  price: number | null;
  dayChangePct: number | null;
  d30ChangePct: number | null;
  series: number[];
  status: AgroExpectationStatus;
};

export type AgroExpectationsPayload = {
  generatedAt: string;
  cacheHit: boolean;
  barometer: {
    status: AgroExpectationStatus;
    source: string;
    updatedAt?: string;
    agEconomy: number | null;
    currentConditions: number | null;
    futureExpectations: number | null;
    note?: string;
  };
  etfProxies: {
    status: AgroExpectationStatus;
    rows: EtfRow[];
    cgoComposite: {
      value: number | null;
      dayChangePct: number | null;
      d30ChangePct: number | null;
      weights: Record<string, number>;
      series: number[];
      note: string;
    };
  };
};

let cache: { generatedAtMs: number; payload: AgroExpectationsPayload } | null = null;

function parsePurdue(html: string) {
  const normalized = html.replace(/\s+/g, " ");
  const extract = (label: string): number | null => {
    const regex = new RegExp(`${label}[^\\d]{0,80}(\\d{2,3})`, "i");
    const match = normalized.match(regex);
    if (!match?.[1]) return null;
    const parsed = Number.parseInt(match[1], 10);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const ag = extract("Ag Economy Barometer");
  const current = extract("Current Conditions Index");
  const future = extract("Future Expectations Index");

  const monthMatch = normalized.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/i);
  const updatedAt = monthMatch?.[0];

  return {
    agEconomy: ag,
    currentConditions: current,
    futureExpectations: future,
    updatedAt,
  };
}

function parseStooqCsv(csv: string): SeriesPoint[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length <= 1) return [];
  const rows: SeriesPoint[] = [];
  for (const rawLine of lines.slice(1)) {
    const parts = rawLine.split(",");
    if (parts.length < 5) continue;
    const date = parts[0];
    const close = Number.parseFloat(parts[4]);
    if (!Number.isFinite(close)) continue;
    const ts = Date.parse(`${date}T00:00:00Z`);
    if (!Number.isFinite(ts)) continue;
    rows.push({ ts: new Date(ts).toISOString(), value: close });
  }
  return rows;
}

function pct(current: number, past: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(past) || past === 0) return null;
  return Number((((current - past) / past) * 100).toFixed(2));
}

function toSeries(values: SeriesPoint[], limit = 14): number[] {
  if (!values.length) return [];
  return values.slice(-limit).map((point) => Number(point.value.toFixed(4)));
}

function statusForRows(rows: EtfRow[]): AgroExpectationStatus {
  const live = rows.filter((row) => row.status === "REFRESH").length;
  if (live >= 3) return "REFRESH";
  if (rows.some((row) => row.status !== "CONSTRAINED")) return "INDICATIVE";
  return "CONSTRAINED";
}

function buildComposite(rows: EtfRow[]) {
  const bySymbol = Object.fromEntries(rows.map((row) => [row.symbol, row]));
  const weights = { CORN: 0.4, WEAT: 0.3, SOYB: 0.3 };
  const corn = bySymbol.CORN;
  const weat = bySymbol.WEAT;
  const soyb = bySymbol.SOYB;

  if (!corn?.series?.length || !weat?.series?.length || !soyb?.series?.length) {
    return {
      value: null,
      dayChangePct: null,
      d30ChangePct: null,
      weights,
      series: [],
      note: "Composite unavailable: insufficient CORN/WEAT/SOYB history",
    };
  }

  const minLen = Math.min(corn.series.length, weat.series.length, soyb.series.length);
  const c = corn.series.slice(-minLen);
  const w = weat.series.slice(-minLen);
  const s = soyb.series.slice(-minLen);

  const c0 = c[0] || 1;
  const w0 = w[0] || 1;
  const s0 = s[0] || 1;

  const composite = c.map((_: number, idx: number) => {
    const cRel = c[idx] / c0;
    const wRel = w[idx] / w0;
    const sRel = s[idx] / s0;
    return Number((100 * (weights.CORN * cRel + weights.WEAT * wRel + weights.SOYB * sRel)).toFixed(4));
  });

  const latest = composite[composite.length - 1] || null;
  const prev = composite.length >= 2 ? composite[composite.length - 2] : null;
  const past30 = composite.length >= 10 ? composite[Math.max(0, composite.length - 10)] : composite[0];

  return {
    value: latest,
    dayChangePct: latest != null && prev != null ? pct(latest, prev) : null,
    d30ChangePct: latest != null && past30 != null ? pct(latest, past30) : null,
    weights,
    series: composite,
    note: "CGO (40/30/30) from CORN/WEAT/SOYB normalized series",
  };
}

async function loadStooq(symbol: string): Promise<SeriesPoint[]> {
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=d`;
  const csv = await fetchTextWithTimeout(url, FETCH_TIMEOUT_MS);
  return parseStooqCsv(csv);
}

export async function getAgroExpectationsSnapshot(forceRefresh = false): Promise<AgroExpectationsPayload> {
  const now = Date.now();
  if (!forceRefresh && cache && now - cache.generatedAtMs < CACHE_TTL_MS) {
    return { ...cache.payload, cacheHit: true };
  }

  const generatedAt = new Date(now).toISOString();

  let barometer: AgroExpectationsPayload["barometer"] = {
    status: "CONSTRAINED",
    source: "Purdue/CME Ag Economy Barometer",
    agEconomy: null,
    currentConditions: null,
    futureExpectations: null,
    note: "Barometer parsing constrained",
  };

  try {
    const html = await fetchTextWithTimeout(PURDUE_BAROMETER_URL, FETCH_TIMEOUT_MS);
    const parsed = parsePurdue(html);
    const hasAny = [parsed.agEconomy, parsed.currentConditions, parsed.futureExpectations].some((value) => value != null);
    barometer = {
      status: hasAny ? "INDICATIVE" : "CONSTRAINED",
      source: "Purdue/CME Ag Economy Barometer",
      updatedAt: parsed.updatedAt,
      agEconomy: parsed.agEconomy,
      currentConditions: parsed.currentConditions,
      futureExpectations: parsed.futureExpectations,
      note: hasAny ? "Parsed from latest public Purdue page" : "No numeric fields matched current HTML",
    };
  } catch (error: any) {
    barometer = {
      ...barometer,
      note: `Barometer unavailable: ${String(error?.message || "fetch_failed")}`,
    };
  }

  const rows: EtfRow[] = [];
  await Promise.all(
    STOOQ_SYMBOLS.map(async (symbol) => {
      const upper = symbol.replace(".us", "").toUpperCase();
      try {
        const points = await loadStooq(symbol);
        if (points.length === 0) {
          rows.push({
            symbol: upper,
            label: upper,
            price: null,
            dayChangePct: null,
            d30ChangePct: null,
            series: [],
            status: "CONSTRAINED",
          });
          return;
        }
        const latest = points[points.length - 1]?.value;
        const prev = points.length >= 2 ? points[points.length - 2]?.value : points[0]?.value;
        const past30 = points.length >= 30 ? points[points.length - 30]?.value : points[0]?.value;
        rows.push({
          symbol: upper,
          label: upper,
          price: latest ?? null,
          dayChangePct: latest != null && prev != null ? pct(latest, prev) : null,
          d30ChangePct: latest != null && past30 != null ? pct(latest, past30) : null,
          series: toSeries(points, 14),
          status: "REFRESH",
        });
      } catch {
        rows.push({
          symbol: upper,
          label: upper,
          price: null,
          dayChangePct: null,
          d30ChangePct: null,
          series: [],
          status: "CONSTRAINED",
        });
      }
    }),
  );

  rows.sort((a, b) => a.symbol.localeCompare(b.symbol));
  const composite = buildComposite(rows);

  const payload: AgroExpectationsPayload = {
    generatedAt,
    cacheHit: false,
    barometer,
    etfProxies: {
      status: statusForRows(rows),
      rows,
      cgoComposite: composite,
    },
  };

  cache = { generatedAtMs: now, payload };
  return payload;
}
