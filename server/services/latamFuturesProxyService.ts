import type { IgcPrice } from "./igcPriceService";
import { normalizeExternalCommodityName, usdPerBushelToTon } from "./externalCommodity";

type ProxyRow = {
  country: string;
  commodity: string;
  basis: string;
  price: number;
  unit: "usd_per_ton" | "usd_per_bushel" | "brl_per_60kg_bag";
  asOfDate?: string;
};

function brlPer60kgBagToUsdPerTon(price: number, brlUsd: number): number {
  const usdPerBag = price * brlUsd;
  return Number((usdPerBag * (1000 / 60)).toFixed(2));
}

async function resolveBrlUsdRate(): Promise<number> {
  const env = Number.parseFloat(process.env.BRL_USD_RATE || "");
  if (Number.isFinite(env) && env > 0) return env;
  try {
    const resp = await fetch("https://api.exchangerate.host/latest?base=BRL&symbols=USD", {
      headers: { accept: "application/json" },
    });
    if (!resp.ok) return 0;
    const data = await resp.json() as any;
    const rate = Number.parseFloat(String(data?.rates?.USD || "0"));
    return Number.isFinite(rate) && rate > 0 ? rate : 0;
  } catch {
    return 0;
  }
}

function parseCsv(content: string): ProxyRow[] {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = (name: string) => headers.findIndex((h) => h === name);
  const out: ProxyRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(",").map((c) => c.trim());
    const country = (cols[idx("country")] || "").toUpperCase();
    const commodity = normalizeExternalCommodityName(cols[idx("commodity")] || "");
    const basis = cols[idx("basis")] || "Futures proxy";
    const unit = (cols[idx("unit")] || "").toLowerCase();
    const price = Number.parseFloat(cols[idx("price")] || "0");
    const asOfDate = cols[idx("asofdate")] || cols[idx("as_of_date")] || undefined;
    // Accept any 2-letter country code; UI will filter by region.
    if (!/^[A-Z]{2}$/.test(country)) continue;
    if (!commodity || commodity === "unknown") continue;
    if (!Number.isFinite(price) || price <= 0) continue;
    if (!["usd_per_ton", "usd_per_bushel", "brl_per_60kg_bag"].includes(unit)) continue;
    out.push({
      country,
      commodity,
      basis,
      unit: unit as ProxyRow["unit"],
      price,
      asOfDate,
    });
  }
  return out;
}

function parseJson(content: any): ProxyRow[] {
  const arr = Array.isArray(content) ? content : Array.isArray(content?.rows) ? content.rows : [];
  return arr
    .map((row: any) => ({
      country: String(row.country || "").toUpperCase(),
      commodity: normalizeExternalCommodityName(String(row.commodity || "")),
      basis: String(row.basis || "Futures proxy"),
      unit: String(row.unit || "").toLowerCase(),
      price: Number.parseFloat(String(row.price || "0")),
      asOfDate: row.asOfDate || row.as_of_date || undefined,
    }))
    .filter(
      (r: any) =>
        /^[A-Z]{2}$/.test(r.country) &&
        !!r.commodity &&
        r.commodity !== "unknown" &&
        ["usd_per_ton", "usd_per_bushel", "brl_per_60kg_bag"].includes(r.unit) &&
        Number.isFinite(r.price) &&
        r.price > 0
    ) as ProxyRow[];
}

async function fetchRowsFromUrl(url: string): Promise<ProxyRow[]> {
  const resp = await fetch(url, { headers: { accept: "application/json,text/csv,text/plain,*/*;q=0.8" } });
  if (!resp.ok) return [];
  const text = await resp.text();
  if (text.trim().startsWith("{") || text.trim().startsWith("[")) {
    try {
      return parseJson(JSON.parse(text));
    } catch {
      return [];
    }
  }
  return parseCsv(text);
}

export async function fetchLatamFuturesProxyPrices(): Promise<IgcPrice[]> {
  const urls = [process.env.BR_FUTURES_PROXY_FEED_URL, process.env.AR_FUTURES_PROXY_FEED_URL].filter(Boolean) as string[];
  const staticPayload = process.env.LATAM_FUTURES_PROXY_STATIC;

  let rows: ProxyRow[] = [];
  for (const url of urls) {
    try {
      const fromUrl = await fetchRowsFromUrl(url);
      rows.push(...fromUrl);
    } catch (error: any) {
      console.error(`[FuturesProxy] Failed to fetch ${url}:`, error?.message || error);
    }
  }

  if (rows.length === 0 && staticPayload) {
    try {
      rows = parseJson(JSON.parse(staticPayload));
    } catch {
      rows = [];
    }
  }

  if (rows.length === 0) {
    console.log("[FuturesProxy] No proxy rows configured");
    return [];
  }

  const brlUsd = await resolveBrlUsdRate();
  const asOfDefault = new Date().toISOString().slice(0, 10);
  const out: IgcPrice[] = [];
  for (const row of rows) {
    if (!["US", "BR", "AR"].includes(row.country)) continue;
    const country = row.country as IgcPrice["country"];
    let usdPerTon = 0;
    if (row.unit === "usd_per_ton") {
      usdPerTon = Number(row.price.toFixed(2));
    } else if (row.unit === "usd_per_bushel") {
      const converted = usdPerBushelToTon(row.price, row.commodity);
      if (!converted) continue;
      usdPerTon = converted.value;
    } else if (row.unit === "brl_per_60kg_bag") {
      if (!(brlUsd > 0)) continue;
      usdPerTon = brlPer60kgBagToUsdPerTon(row.price, brlUsd);
    }
    if (!(usdPerTon > 0)) continue;
    out.push({
      commodity: row.commodity,
      country,
      label: row.basis,
      asOfDate: row.asOfDate || asOfDefault,
      priceUsdPerTon: usdPerTon,
      confidence: "medium",
      rawRow: {
        unit: row.unit,
        originalPrice: String(row.price),
      },
      meta: {
        sourceUrl: urls.length > 0 ? urls.join(",") : "LATAM_FUTURES_PROXY_STATIC",
        quoteUnitOriginal: row.unit,
        conversionApplied: {
          kgPerBushel: row.unit === "usd_per_bushel" ? usdPerBushelToTon(row.price, row.commodity)?.kgPerBushel ?? null : null,
          approximate:
            row.unit === "usd_per_bushel" ? usdPerBushelToTon(row.price, row.commodity)?.approximate ?? null : null,
          brlUsdRate: row.unit === "brl_per_60kg_bag" ? brlUsd : null,
          conversionVersion: "v2",
        },
      },
    });
  }

  console.log(`[FuturesProxy] Parsed ${out.length} rows`);
  return out;
}
