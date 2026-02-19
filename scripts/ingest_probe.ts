#!/usr/bin/env tsx
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const NOW = new Date();
const TODAY_ISO = NOW.toISOString().slice(0, 10);
const OUTPUT_ROOT = path.resolve(process.cwd(), "tmp/ingest_probe");
const REPORT_PATH = path.resolve(process.cwd(), "report.md");

const SOURCES = [
  { provider: "TESEO_CLAL", market: "AR", commodityHint: "corn", url: "https://teseo.clal.it/en/?section=argentina_mais" },
  { provider: "TESEO_CLAL", market: "AR", commodityHint: "soybeans", url: "https://teseo.clal.it/en/?section=argentina_soia" },
  {
    provider: "CLAL",
    market: "AR",
    commodityHint: "soybeans",
    url: "https://www.clal.it/mini_index.php?locale=en_US&section=storico_prezzi_giornalieri&prodotto=soia_argentina&valuta=ARS&unita=ton&year=2025",
  },
  { provider: "TESEO_CLAL", market: "BR", commodityHint: "mixed", url: "https://teseo.clal.it/en/?section=cereals_brazil_prices" },
  { provider: "TESEO_CLAL", market: "US", commodityHint: "mixed", url: "https://teseo.clal.it/en/?section=cereals_price_usa" },
  { provider: "GRAINSPRICES", market: "GLOBAL", commodityHint: "mixed", url: "https://grainsprices.com/markets/fob" },
  { provider: "FSGRAIN", market: "US", commodityHint: "mixed", url: "https://www.fsgrain.com/pages/usdacash.php" },
  {
    provider: "BCR",
    market: "AR",
    commodityHint: "mixed",
    url: "https://www.bcr.com.ar/es/mercados/mercado-de-granos/cotizaciones/cotizaciones-locales-1",
  },
  {
    provider: "COMMODITY3",
    market: "BR",
    commodityHint: "corn",
    url: "https://www.commodity3.com/instrument/YC20PPF6/corn-brazil-fob-santos",
  },
  {
    provider: "COMMODITY3",
    market: "BR",
    commodityHint: "corn",
    url: "https://www.commodity3.com/instrument/YC2BPPF7/corn-brazil-fob-basis",
  },
] as const;

type ProbeResult = {
  provider: string;
  market: string;
  commodityHint: string;
  sourceUrl: string;
  statusCode: number;
  contentType: string;
  hasPrice: boolean;
  hasDate: boolean;
  hasHistory: boolean;
  dateValue: string | null;
  priceSamples: number[];
  parserConfidence: number;
  updateSignal: "daily_likely" | "weekly_or_irregular" | "unknown";
  notes: string[];
  rawNamesSeen: string[];
};

type CoverageRow = {
  market: string;
  commodityNormalized: string;
  rawNamesSeen: string[];
  hasLatest: boolean;
  hasHistory: boolean;
  primaryProvider: string;
  fallbackProviders: string[];
  notes: string;
};

const DATE_RE = /\b(20\d{2}[-/.](0[1-9]|1[0-2])[-/.](0[1-9]|[12]\d|3[01]))\b/g;
const DATE_RE_DMY = /\b([0-3]?\d)[/.]([01]?\d)[/.](20\d{2})\b/g;
const PRICE_RE = /(?:USD|US\$|ARS|BRL|EUR|R\$|\$)?\s*(-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,4})|\d+(?:[.,]\d{1,4}))/g;

const COMMODITY_ALIASES: Array<{ re: RegExp; commodity: string; category: "grain" | "oilseed" | "other"; variant?: string }> = [
  { re: /\bmais\b|\bmaize\b|\bcorn\b/i, commodity: "corn", category: "grain" },
  { re: /\bwheat\s*11[.,]?5\b/i, commodity: "wheat", category: "grain", variant: "11.5" },
  { re: /\bwheat\s*12[.,]?5\b/i, commodity: "wheat", category: "grain", variant: "12.5" },
  { re: /\bwheat\b|\bfrumento\b/i, commodity: "wheat", category: "grain" },
  { re: /\bsoybean(s)?\b|\bsoy\b|\bsoia\b/i, commodity: "soybeans", category: "oilseed" },
  { re: /\bsoymeal\b|\bsoybean\s*meal\b/i, commodity: "soymeal", category: "oilseed" },
  { re: /\bsoybean\s*oil\b|\bsoyoil\b/i, commodity: "soybean_oil", category: "oilseed" },
  { re: /\brice\b|\barroz\b|\brise\b/i, commodity: "rice", category: "grain" },
  { re: /\bsunflower\b|\bgirasol\b/i, commodity: "sunflower", category: "oilseed" },
  { re: /\brapeseed\b|\bcolza\b|\bcanola\b/i, commodity: "rapeseed", category: "oilseed" },
  { re: /\bbarley\b/i, commodity: "barley", category: "grain" },
  { re: /\bsorghum\b/i, commodity: "sorghum", category: "grain" },
  { re: /\boats\b/i, commodity: "oats", category: "grain" },
  { re: /\brye\b/i, commodity: "rye", category: "grain" },
];

function normalizeCommodity(rawName: string): { commodity: string; category: "grain" | "oilseed" | "other"; variant?: string } {
  const normalized = String(rawName || "")
    .toLowerCase()
    .replace(/[()%]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const alias of COMMODITY_ALIASES) {
    if (alias.re.test(normalized)) return { commodity: alias.commodity, category: alias.category, variant: alias.variant };
  }

  if (/grain|cereal|ma[ií]s|wheat|barley|oat|rye|sorghum|rice/i.test(normalized)) {
    return { commodity: slugify(normalized), category: "grain" };
  }

  if (/oilseed|soy|sunflower|canola|rapeseed|colza|meal|oil/i.test(normalized)) {
    return { commodity: slugify(normalized), category: "oilseed" };
  }

  return { commodity: slugify(normalized || "unknown"), category: "other" };
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}

function parsePrice(raw: string): number | null {
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
  }

  const num = Number.parseFloat(normalized);
  if (!Number.isFinite(num) || num <= 0) return null;
  if (num > 1_000_000) return null;
  return num;
}

function parseDates(content: string): string[] {
  const result = new Set<string>();

  for (const m of content.matchAll(DATE_RE)) {
    const iso = m[1].replace(/\./g, "-").replace(/\//g, "-");
    result.add(iso);
  }

  for (const m of content.matchAll(DATE_RE_DMY)) {
    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    const y = m[3];
    result.add(`${y}-${mo}-${d}`);
  }

  return [...result].sort();
}

function extractRawCommodityNames(content: string): string[] {
  const names = new Set<string>();
  const candidates = content.match(/\b(corn|maize|mais|wheat(?:\s*11[.,]?5|\s*12[.,]?5)?|soybeans?|soy|soia|rice|arroz|rise|sunflower|girasol|rapeseed|colza|canola|barley|sorghum|oats|rye|soymeal|soybean meal|soybean oil)\b/gi) || [];
  for (const name of candidates) names.add(name.toLowerCase());
  return [...names].slice(0, 20);
}

function deriveUpdateSignal(dates: string[]): ProbeResult["updateSignal"] {
  const unique = [...new Set(dates)].sort();
  if (unique.length === 0) return "unknown";

  const now = new Date(`${TODAY_ISO}T00:00:00.000Z`).getTime();
  const inLast7 = unique.filter((iso) => {
    const ts = new Date(`${iso}T00:00:00.000Z`).getTime();
    if (!Number.isFinite(ts)) return false;
    const diffDays = Math.floor((now - ts) / (24 * 60 * 60 * 1000));
    return diffDays >= 0 && diffDays <= 7;
  });

  if (inLast7.length >= 4) return "daily_likely";
  if (inLast7.length >= 1) return "weekly_or_irregular";
  return "unknown";
}

function pickAsOfDate(dates: string[]): string | null {
  if (dates.length === 0) return null;
  const sorted = [...dates].sort();
  const futureCutoff = new Date(`${TODAY_ISO}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000;
  const eligible = sorted.filter((iso) => {
    const ts = new Date(`${iso}T00:00:00.000Z`).getTime();
    return Number.isFinite(ts) && ts <= futureCutoff;
  });
  return eligible.length > 0 ? eligible[eligible.length - 1] : sorted[sorted.length - 1];
}

async function maybeRenderWithPlaywright(url: string): Promise<string | null> {
  if (process.env.INGEST_PROBE_USE_PLAYWRIGHT !== "true") return null;
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(2500);
      return await page.content();
    } finally {
      await browser.close();
    }
  } catch {
    return null;
  }
}

async function fetchWithRetry(url: string): Promise<{ statusCode: number; contentType: string; body: string; notes: string[] }> {
  const notes: string[] = [];
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const started = Date.now();
      const res = await fetch(url, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
          accept: "text/html,application/json;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9,es;q=0.8,pt;q=0.7",
        },
      });
      const body = await res.text();
      const latency = Date.now() - started;
      notes.push(`attempt=${attempt} latencyMs=${latency}`);
      return {
        statusCode: res.status,
        contentType: res.headers.get("content-type") || "unknown",
        body,
        notes,
      };
    } catch (error: any) {
      notes.push(`attempt=${attempt} error=${error?.message || String(error)}`);
      if (attempt < maxAttempts) {
        const backoff = 400 * attempt;
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
  }

  return { statusCode: 0, contentType: "unknown", body: "", notes };
}

function extractJsonCandidates(html: string): string[] {
  const urls = new Set<string>();
  const patterns = [
    /https?:\/\/[^"'\s)]+(?:\.json|\/api\/[^"'\s)]+)/gi,
    /["'](\/[^"']*(?:\.json|\/api\/[^"']+))["']/gi,
  ];
  for (const pattern of patterns) {
    for (const m of html.matchAll(pattern)) {
      const candidate = (m[1] || m[0] || "").trim();
      if (candidate.length > 2) urls.add(candidate);
    }
  }
  return [...urls].slice(0, 20);
}

function computeConfidence(args: {
  statusCode: number;
  hasPrice: boolean;
  hasDate: boolean;
  hasHistory: boolean;
  updateSignal: ProbeResult["updateSignal"];
}): number {
  let score = 0;
  if (args.statusCode >= 200 && args.statusCode < 300) score += 0.25;
  if (args.hasPrice) score += 0.3;
  if (args.hasDate) score += 0.2;
  if (args.hasHistory) score += 0.15;
  if (args.updateSignal === "daily_likely") score += 0.1;
  return Number(Math.min(score, 0.98).toFixed(2));
}

async function runProbe(): Promise<void> {
  await mkdir(OUTPUT_ROOT, { recursive: true });
  const rows: ProbeResult[] = [];

  for (const source of SOURCES) {
    const domain = new URL(source.url).hostname.replace(/^www\./, "");
    const domainDir = path.join(OUTPUT_ROOT, domain);
    await mkdir(domainDir, { recursive: true });

    const fetched = await fetchWithRetry(source.url);
    let body = fetched.body;

    const dates = parseDates(body);
    const priceSamples = Array.from(
      new Set(
        [...body.matchAll(PRICE_RE)]
          .map((m) => parsePrice(m[1] || ""))
          .filter((v): v is number => Number.isFinite(v))
      )
    )
      .filter((v) => v > 5 && v < 5000)
      .slice(0, 8);

    if (priceSamples.length === 0 || dates.length === 0) {
      const rendered = await maybeRenderWithPlaywright(source.url);
      if (rendered) {
        body = rendered;
      }
    }

    const finalDates = parseDates(body);
    const finalPriceSamples = Array.from(
      new Set(
        [...body.matchAll(PRICE_RE)]
          .map((m) => parsePrice(m[1] || ""))
          .filter((v): v is number => Number.isFinite(v))
      )
    )
      .filter((v) => v > 5 && v < 5000)
      .slice(0, 8);

    const asOf = pickAsOfDate(finalDates);
    const hasHistory = new Set(finalDates).size >= 5;
    const updateSignal = deriveUpdateSignal(finalDates);
    const hasDate = Boolean(asOf);
    const hasPrice = finalPriceSamples.length > 0;
    const parserConfidence = computeConfidence({
      statusCode: fetched.statusCode,
      hasPrice,
      hasDate,
      hasHistory,
      updateSignal,
    });

    const jsonCandidates = extractJsonCandidates(body);
    const rawNamesSeen = extractRawCommodityNames(body);

    const sha = createHash("sha256").update(body).digest("hex").slice(0, 12);
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${ts}-${sha}.html`;
    await writeFile(path.join(domainDir, filename), body, "utf8");

    const notes = [...fetched.notes];
    if (jsonCandidates.length > 0) notes.push(`jsonCandidates=${jsonCandidates.slice(0, 5).join(",")}`);
    if (process.env.INGEST_PROBE_USE_PLAYWRIGHT === "true") notes.push("playwright=enabled");

    rows.push({
      provider: source.provider,
      market: source.market,
      commodityHint: source.commodityHint,
      sourceUrl: source.url,
      statusCode: fetched.statusCode,
      contentType: fetched.contentType,
      hasPrice,
      hasDate,
      hasHistory,
      dateValue: asOf,
      priceSamples: finalPriceSamples,
      parserConfidence,
      updateSignal,
      notes,
      rawNamesSeen,
    });
  }

  const coverage = buildCoverage(rows);
  const markdown = renderReport(rows, coverage);
  await writeFile(REPORT_PATH, markdown, "utf8");

  const summaryRows = rows.map((r) => ({
    source_url: r.sourceUrl,
    status_code: r.statusCode,
    content_type: r.contentType,
    has_price: r.hasPrice,
    has_date: r.hasDate,
    has_history: r.hasHistory,
    date_value: r.dateValue,
    price_samples: r.priceSamples,
    parser_confidence: r.parserConfidence,
  }));

  console.table(summaryRows);
  console.log(`\nReport saved: ${REPORT_PATH}`);
}

function buildCoverage(rows: ProbeResult[]): CoverageRow[] {
  const map = new Map<string, CoverageRow>();

  for (const row of rows) {
    const names = row.rawNamesSeen.length > 0 ? row.rawNamesSeen : [row.commodityHint];

    for (const rawName of names) {
      const normalized = normalizeCommodity(rawName);
      if (normalized.category === "other") continue;
      const key = `${row.market}:${normalized.commodity}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          market: row.market,
          commodityNormalized: normalized.commodity,
          rawNamesSeen: [rawName],
          hasLatest: row.hasDate && (row.dateValue === TODAY_ISO || isYesterday(row.dateValue)),
          hasHistory: row.hasHistory,
          primaryProvider: row.provider,
          fallbackProviders: [],
          notes: row.updateSignal,
        });
      } else {
        if (!existing.rawNamesSeen.includes(rawName)) existing.rawNamesSeen.push(rawName);
        existing.hasLatest = existing.hasLatest || (row.hasDate && (row.dateValue === TODAY_ISO || isYesterday(row.dateValue)));
        existing.hasHistory = existing.hasHistory || row.hasHistory;
        if (!existing.fallbackProviders.includes(row.provider) && existing.primaryProvider !== row.provider) {
          existing.fallbackProviders.push(row.provider);
        }
      }
    }
  }

  return [...map.values()].sort((a, b) => `${a.market}:${a.commodityNormalized}`.localeCompare(`${b.market}:${b.commodityNormalized}`));
}

function isYesterday(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return false;
  const diffDays = Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000));
  return diffDays === 1;
}

function renderReport(rows: ProbeResult[], coverage: CoverageRow[]): string {
  const goodRows = rows.filter((r) => r.statusCode >= 200 && r.statusCode < 300 && r.hasPrice && r.hasDate);

  const byMarketProvider = new Map<string, { primary: string | null; fallback: string[] }>();
  for (const market of ["US", "AR", "BR"]) {
    const marketRows = goodRows.filter((r) => r.market === market);
    marketRows.sort((a, b) => b.parserConfidence - a.parserConfidence);
    const primary = marketRows[0]?.provider || null;
    const fallback = [...new Set(marketRows.filter((r) => r.provider !== primary).map((r) => r.provider))];
    byMarketProvider.set(market, { primary, fallback });
  }

  const lines: string[] = [];
  lines.push("# Ingest Probe Report");
  lines.push("");
  lines.push(`Generated at: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Source Probe Results");
  lines.push("");
  lines.push("| source_url | status_code | content_type | has_price | has_date | has_history | date_value | price_samples | parser_confidence |");
  lines.push("|---|---:|---|:---:|:---:|:---:|---|---|---:|");
  for (const row of rows) {
    lines.push(
      `| ${row.sourceUrl} | ${row.statusCode} | ${row.contentType.replace(/\|/g, "\\|")} | ${row.hasPrice ? "yes" : "no"} | ${row.hasDate ? "yes" : "no"} | ${row.hasHistory ? "yes" : "no"} | ${row.dateValue || "-"} | ${row.priceSamples.join(", ") || "-"} | ${row.parserConfidence} |`
    );
  }

  lines.push("");
  lines.push("## Coverage Table");
  lines.push("");
  lines.push("| market | commodity_normalized | raw_names_seen | has_latest | has_history | primary_provider | fallback_providers | notes |");
  lines.push("|---|---|---|:---:|:---:|---|---|---|");
  for (const row of coverage) {
    lines.push(
      `| ${row.market} | ${row.commodityNormalized} | ${row.rawNamesSeen.join(", ")} | ${row.hasLatest ? "yes" : "no"} | ${row.hasHistory ? "yes" : "no"} | ${row.primaryProvider} | ${row.fallbackProviders.join(", ") || "-"} | ${row.notes} |`
    );
  }

  lines.push("");
  lines.push("## Recommended Provider Topology");
  lines.push("");
  for (const market of ["US", "AR", "BR"]) {
    const cfg = byMarketProvider.get(market)!;
    lines.push(`- ${market}: primary=${cfg.primary || "none"}; fallback=${cfg.fallback.join(", ") || "none"}`);
  }

  lines.push("");
  lines.push("## Risks");
  lines.push("");
  for (const row of rows) {
    const risks: string[] = [];
    if (!(row.statusCode >= 200 && row.statusCode < 300)) risks.push("non-200 status");
    if (!row.hasPrice) risks.push("price not detected");
    if (!row.hasDate) risks.push("as-of date not detected");
    if (row.updateSignal === "weekly_or_irregular") risks.push("update cadence unclear");
    if (row.updateSignal === "unknown") risks.push("history/update signal missing");
    if (risks.length > 0) lines.push(`- ${row.provider} (${row.sourceUrl}): ${risks.join("; ")}`);
  }
  if (!rows.some((r) => !(r.statusCode >= 200 && r.statusCode < 300) || !r.hasPrice || !r.hasDate)) {
    lines.push("- No critical probe failures detected.");
  }

  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- Raw responses were saved to `tmp/ingest_probe/<domain>/<timestamp>-<sha>.html`.");
  lines.push("- Daily-update heuristic: at least 4 unique dates in the last 7 days.");
  lines.push("- If source history is sparse, internal history accumulation is required.");

  return lines.join("\n");
}

runProbe().catch((error) => {
  console.error(error);
  process.exit(1);
});
