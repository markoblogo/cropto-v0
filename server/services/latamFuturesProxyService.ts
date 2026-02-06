import type { IgcPrice } from "./igcPriceService";

type ProxyRow = {
  country: "BR" | "AR";
  commodity: "maize" | "wheat" | "soybeans";
  basis: string;
  price: number;
  unit: "usd_per_ton" | "usd_per_bushel" | "brl_per_60kg_bag";
  asOfDate?: string;
};

const BUSHEL_KG: Record<"maize" | "wheat" | "soybeans", number> = {
  maize: 25.40117272,
  wheat: 27.2155422,
  soybeans: 27.2155422,
};

function usdPerBushelToTon(price: number, commodity: "maize" | "wheat" | "soybeans"): number {
  return Number((price * (1000 / BUSHEL_KG[commodity])).toFixed(2));
}

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
    const commodity = (cols[idx("commodity")] || "").toLowerCase();
    const basis = cols[idx("basis")] || "Futures proxy";
    const unit = (cols[idx("unit")] || "").toLowerCase();
    const price = Number.parseFloat(cols[idx("price")] || "0");
    const asOfDate = cols[idx("asofdate")] || cols[idx("as_of_date")] || undefined;
    if (!["BR", "AR"].includes(country)) continue;
    if (!["maize", "wheat", "soybeans"].includes(commodity)) continue;
    if (!Number.isFinite(price) || price <= 0) continue;
    if (!["usd_per_ton", "usd_per_bushel", "brl_per_60kg_bag"].includes(unit)) continue;
    out.push({
      country: country as "BR" | "AR",
      commodity: commodity as "maize" | "wheat" | "soybeans",
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
      commodity: String(row.commodity || "").toLowerCase(),
      basis: String(row.basis || "Futures proxy"),
      unit: String(row.unit || "").toLowerCase(),
      price: Number.parseFloat(String(row.price || "0")),
      asOfDate: row.asOfDate || row.as_of_date || undefined,
    }))
    .filter(
      (r: any) =>
        ["BR", "AR"].includes(r.country) &&
        ["maize", "wheat", "soybeans"].includes(r.commodity) &&
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
    let usdPerTon = 0;
    if (row.unit === "usd_per_ton") {
      usdPerTon = Number(row.price.toFixed(2));
    } else if (row.unit === "usd_per_bushel") {
      usdPerTon = usdPerBushelToTon(row.price, row.commodity);
    } else if (row.unit === "brl_per_60kg_bag") {
      if (!(brlUsd > 0)) continue;
      usdPerTon = brlPer60kgBagToUsdPerTon(row.price, brlUsd);
    }
    if (!(usdPerTon > 0)) continue;
    out.push({
      commodity: row.commodity,
      country: row.country,
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
          brlUsdRate: row.unit === "brl_per_60kg_bag" ? brlUsd : null,
          conversionVersion: "v1",
        },
      },
    });
  }

  console.log(`[FuturesProxy] Parsed ${out.length} rows`);
  return out;
}

