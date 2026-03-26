import { readdir, readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

export type Last30DaysSignal = "bullish" | "bearish" | "neutral";

export type Last30DaysRecord = {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  commodity: string;
  region: string;
  language: string;
  signal: Last30DaysSignal;
  impact: number;
};

type Last30DaysWindow = 1 | 7 | 30;

type Last30DaysSummary = {
  generatedAt: string;
  sourceFile: string | null;
  sourceUpdatedAt: string | null;
  warnings: string[];
  items: Last30DaysRecord[];
};

const WINDOW_JSON_PATHS: Record<Last30DaysWindow, string[]> = {
  1: [
    path.resolve(process.cwd(), "artifacts/last30days/yesterday.json"),
  ],
  7: [
    path.resolve(process.cwd(), "artifacts/last30days/week.json"),
  ],
  30: [
    process.env.LAST30DAYS_JSON_PATH || "",
    path.resolve(process.cwd(), "artifacts/last30days/month.json"),
    path.resolve(process.cwd(), "artifacts/last30days/latest.json"),
    path.resolve(process.cwd(), "artifacts/last30days/last30days.json"),
  ].filter(Boolean),
};

const DEFAULT_PATHS = [
  process.env.LAST30DAYS_JSON_PATH,
  path.resolve(process.cwd(), "artifacts/last30days/latest.json"),
  path.resolve(process.cwd(), "artifacts/last30days/last30days.json"),
].filter(Boolean) as string[];
const SQLITE_PATH = process.env.LAST30DAYS_SQLITE_PATH || "";
const execFileAsync = promisify(execFile);

function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

function normalizeHeadline(value: unknown): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^\s*[-–—:]+\s*/g, "")
    .trim();
}

function normalizeUrl(value: unknown): string {
  const raw = normalizeText(value);
  if (!raw || raw === "#") return "#";
  try {
    const parsed = new URL(raw);
    const dropParams = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "ref", "s"];
    for (const key of dropParams) parsed.searchParams.delete(key);
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.toString();
  } catch {
    return raw;
  }
}

function inferSourceFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("reddit.com")) return "reddit";
    if (host.includes("x.com") || host.includes("twitter.com")) return "x";
    if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube";
    if (host.includes("news.ycombinator.com")) return "hn";
    if (host.includes("bsky.app")) return "bluesky";
    return "web";
  } catch {
    return "last30days";
  }
}

function normalizeSource(sourceRaw: string, url: string, title: string): string {
  const source = sourceRaw.toLowerCase().trim();
  if (!source || source === "?" || source === "last30days") {
    if (url && url !== "#") return inferSourceFromUrl(url);
    const titleLower = title.toLowerCase();
    if (titleLower.includes("reddit") || /\br\/[a-z0-9_]+/i.test(titleLower)) return "reddit";
    if (titleLower.includes("x.com") || titleLower.includes("twitter") || titleLower.startsWith("@")) return "x";
    if (titleLower.includes("youtube") || titleLower.includes("youtu.be")) return "youtube";
    if (titleLower.includes("hacker news") || titleLower.includes("news.ycombinator.com")) return "hn";
    if (titleLower.includes("bluesky") || titleLower.includes("bsky.app")) return "bluesky";
    return "web";
  }
  if (source.includes("reddit")) return "reddit";
  if (source === "x" || source.includes("twitter")) return "x";
  if (source.includes("youtube")) return "youtube";
  if (source.includes("hackernews") || source === "hn") return "hn";
  if (source.includes("bluesky")) return "bluesky";
  if (source.includes("web")) return "web";
  return source;
}

function dedupeLast30Items(items: Last30DaysRecord[]): Last30DaysRecord[] {
  const byKey = new Map<string, Last30DaysRecord>();
  for (const item of items) {
    const titleKey = normalizeHeadline(item.title).toLowerCase();
    const key = item.url !== "#" ? `url:${item.url}` : `title:${titleKey}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
      continue;
    }
    const existingTs = Date.parse(existing.publishedAt);
    const nextTs = Date.parse(item.publishedAt);
    if (Number.isFinite(nextTs) && (!Number.isFinite(existingTs) || nextTs > existingTs)) {
      byKey.set(key, item);
    }
  }
  return Array.from(byKey.values()).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

const X_MARKET_POSITIVE_PATTERNS = [
  /\bgrain(s)?\b/i,
  /\boilseed(s)?\b/i,
  /\bwheat\b/i,
  /\bcorn\b/i,
  /\bmaize\b/i,
  /\bsoy(bean|beans)?\b/i,
  /\brapeseed\b/i,
  /\bcanola\b/i,
  /\bsunflower\b/i,
  /\bbarley\b/i,
  /\bmeal\b/i,
  /\bcrush\b/i,
  /\bexport(s|ed)?\b/i,
  /\bimport(s|ed)?\b/i,
  /\btender(s)?\b/i,
  /\bport(s)?\b/i,
  /\blogistics?\b/i,
  /\bfreight\b/i,
  /\bvessel(s)?\b/i,
  /\bshipment(s)?\b/i,
  /\bblack sea\b/i,
  /\bdanube\b/i,
  /\bodesa\b/i,
  /\bodessa\b/i,
  /\bfutures?\b/i,
  /\bcbot\b/i,
  /\bmatif\b/i,
  /\bbasis\b/i,
  /\bcpt\b/i,
  /\bfob\b/i,
  /\bfca\b/i,
  /\busd(?:\/t| per ton|\/ton)?\b/i,
  /\beur(?:\/t| per ton|\/ton)?\b/i,
  /\buah(?:\/t| per ton|\/ton)?\b/i,
  /\bton(ne)?s?\b/i,
  /пшениц/i,
  /кукурудз/i,
  /зерн/i,
  /олійн/i,
  /соняшн/i,
  /ріпак/i,
  /соя|соєв/i,
  /шрот/i,
  /експорт/i,
  /імпорт/i,
  /тендер/i,
  /порт/i,
  /одес/i,
  /чорномор/i,
  /дуна[йю]/i,
  /логіст/i,
  /фрахт/i,
  /базис/i,
  /врожай/i,
  /посів/i,
  /котир/i,
  /\bцпт\b/i,
  /\bфоб\b/i,
  /\bфца\b/i,
];

const X_MARKET_STRONG_PATTERNS = [
  /\bcpt\b/i,
  /\bfob\b/i,
  /\bfca\b/i,
  /\bcbot\b/i,
  /\bmatif\b/i,
  /\bexport(s|ed)?\b/i,
  /\bimport(s|ed)?\b/i,
  /\btender(s)?\b/i,
  /\bport(s)?\b/i,
  /\blogistics?\b/i,
  /\bvessel(s)?\b/i,
  /\bbasis\b/i,
  /\bgrain association\b/i,
  /\bglobal grain\b/i,
  /\bgrain market\b/i,
  /експорт/i,
  /імпорт/i,
  /тендер/i,
  /порт/i,
  /логіст/i,
  /фрахт/i,
  /базис/i,
  /зернов(ий|ого|ому)/i,
];

const X_MARKET_CONTEXT_PATTERNS = [
  /\bgrain(s)?\b/i,
  /\boilseed(s)?\b/i,
  /\bwheat\b/i,
  /\bcorn\b/i,
  /\bmaize\b/i,
  /\bsoy(bean|beans)?\b/i,
  /\brapeseed\b/i,
  /\bcanola\b/i,
  /\bsunflower\b/i,
  /\bbarley\b/i,
  /\bmeal\b/i,
  /\bcrush\b/i,
  /\bagri(culture|cultural)?\b/i,
  /\bfarm(er|ing)?\b/i,
  /\bharvest\b/i,
  /\bcrop(s)?\b/i,
  /пшениц/i,
  /кукурудз/i,
  /зерн/i,
  /олійн/i,
  /соняшн/i,
  /ріпак/i,
  /соя|соєв/i,
  /шрот/i,
  /аграр/i,
  /фермер/i,
  /врожай/i,
  /посів/i,
  /елеватор/i,
];

const X_MARKET_NOISE_PATTERNS = [
  /\brecipe\b/i,
  /\bcook(ing)?\b/i,
  /\bcalor/i,
  /\byogurt\b/i,
  /\bdessert\b/i,
  /\bsalad\b/i,
  /\bapartment\b/i,
  /\brent\b/i,
  /\bservice(s)?\b/i,
  /тефлон/i,
  /калор/i,
  /йогурт/i,
  /десерт/i,
  /салат/i,
  /орен(д|д[ау])/i,
  /житл/i,
  /послуг/i,
  /готув/i,
  /сковор/i,
  /меренг/i,
  /варенн/i,
  /шоколад/i,
];

function countPatternHits(text: string, patterns: RegExp[]): number {
  return patterns.filter((pattern) => pattern.test(text)).length;
}

function isRelevantXTitle(title: string): boolean {
  const text = normalizeHeadline(title);
  if (!text) return false;
  const positiveHits = countPatternHits(text, X_MARKET_POSITIVE_PATTERNS);
  const strongHits = countPatternHits(text, X_MARKET_STRONG_PATTERNS);
  const contextHits = countPatternHits(text, X_MARKET_CONTEXT_PATTERNS);
  const noiseHits = countPatternHits(text, X_MARKET_NOISE_PATTERNS);
  const isReplyStyle = text.startsWith("@");
  const hasUrl = /https?:\/\//i.test(text);
  const hasCommodityOnly = /\b(sunflower|soy|soybean|wheat|corn|grain|oilseed)\b/i.test(text) || /соняшн|соя|пшениц|кукурудз|зерн|олійн/i.test(text);

  if (contextHits === 0) return false;
  if (text.length < 48) return false;
  if (contextHits < 2) return false;
  if (isReplyStyle && !hasUrl) return false;
  if (strongHits > 0 && contextHits > 0) return true;
  if (positiveHits < 2) return false;
  if (noiseHits > 0 && positiveHits <= noiseHits + 1) return false;
  if (hasCommodityOnly && noiseHits > 0 && strongHits === 0) return false;
  return true;
}

function isRelevantBlueskyTitle(title: string): boolean {
  const text = normalizeHeadline(title);
  if (!text) return false;
  const positiveHits = countPatternHits(text, X_MARKET_POSITIVE_PATTERNS);
  const strongHits = countPatternHits(text, X_MARKET_STRONG_PATTERNS);
  const contextHits = countPatternHits(text, X_MARKET_CONTEXT_PATTERNS);
  const noiseHits = countPatternHits(text, X_MARKET_NOISE_PATTERNS);
  const hasUrl = /https?:\/\//i.test(text);

  if (contextHits < 2) return false;
  if (text.length < 56) return false;
  if (noiseHits > 0 && positiveHits <= noiseHits + 1) return false;
  if (strongHits > 0) return true;
  if (positiveHits >= 3 && hasUrl) return true;
  return false;
}

function filterSourceNoise(items: Last30DaysRecord[]): Last30DaysRecord[] {
  return items.filter((item) => {
    if (item.source === "x") return isRelevantXTitle(item.title);
    if (item.source === "bluesky") return isRelevantBlueskyTitle(item.title);
    return true;
  });
}

function inferCommodity(text: string): string {
  const lower = text.toLowerCase();
  if (/\bwheat\b/.test(lower)) return "wheat";
  if (/\bcorn\b|\bmaize\b/.test(lower)) return "corn";
  if (/\bsoy\b|\bsoybean/.test(lower)) return "soybeans";
  if (/\bsunflower\b/.test(lower)) return "sunflower";
  if (/\brapeseed\b|\bcanola\b/.test(lower)) return "rapeseed";
  if (/\boilseed/.test(lower)) return "oilseeds";
  return "mixed";
}

function inferRegion(text: string): string {
  const lower = text.toLowerCase();
  if (/\bukraine\b|\bukr\b|\bodesa\b|\bodessa\b/.test(lower)) return "ukraine";
  if (/\beu\b|\beurope\b|\bfrance\b|\bgermany\b|\bromania\b|\bpoland\b/.test(lower)) return "europe";
  if (/\bblack sea\b|\bnovorossiysk\b|\bconstanta\b/.test(lower)) return "black_sea";
  return "global";
}

function inferLanguage(item: any, text: string): string {
  const candidates = [item?.language, item?.lang, item?.locale, item?.source_language]
    .map((v) => normalizeText(v).toLowerCase())
    .filter(Boolean);
  if (candidates.length > 0) {
    const primary = candidates[0];
    if (primary.startsWith("uk")) return "uk";
    if (primary.startsWith("ru")) return "uk";
    if (primary.startsWith("fr")) return "fr";
    return "en";
  }

  const lower = text.toLowerCase();
  if (/[іїєґ]/.test(lower)) return "uk";
  if (/[а-яё]/i.test(lower)) return "uk";
  const urlText = normalizeText(item?.url || item?.link || item?.source_url).toLowerCase();
  if (urlText.includes(".ua/") || urlText.endsWith(".ua")) return "uk";
  return "en";
}

function inferSignal(text: string): Last30DaysSignal {
  const lower = text.toLowerCase();
  const bullishHits = [
    "bullish",
    "rise",
    "rally",
    "tight",
    "shortage",
    "higher",
    "strong demand",
    "support",
  ].filter((token) => lower.includes(token)).length;
  const bearishHits = [
    "bearish",
    "fall",
    "drop",
    "pressure",
    "weak",
    "lower",
    "oversupply",
    "cancel",
  ].filter((token) => lower.includes(token)).length;
  if (bullishHits > bearishHits) return "bullish";
  if (bearishHits > bullishHits) return "bearish";
  return "neutral";
}

function inferImpact(item: any, text: string): number {
  const explicit =
    Number(item?.impact) ||
    Number(item?.score) ||
    Number(item?.relevance_score) ||
    Number(item?.confidence);
  if (Number.isFinite(explicit) && explicit > 0) {
    return Math.max(1, Math.min(5, explicit > 5 ? explicit / 20 : explicit));
  }
  const lower = text.toLowerCase();
  if (/\bcritical\b|\bdisruption\b|\bhalt\b/.test(lower)) return 4.8;
  if (/\bpolicy\b|\btender\b|\bexport\b|\bweather\b/.test(lower)) return 4.1;
  if (/\bupdate\b|\boutlook\b|\bcommentary\b/.test(lower)) return 3.2;
  return 2.7;
}

function normalizeDate(value: unknown): string {
  const parsed = new Date(String(value || ""));
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

function normalizeArrayPayload(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  const candidates = [
    raw?.items,
    raw?.feed,
    raw?.results,
    raw?.records,
    raw?.data?.items,
    raw?.data?.feed,
    raw?.output?.items,
    raw?.report?.items,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

async function findLatestJsonInDir(dirPath: string): Promise<string | null> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const jsonFiles = entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"));
    if (jsonFiles.length === 0) return null;
    const withStats = await Promise.all(
      jsonFiles.map(async (entry) => {
        const fullPath = path.join(dirPath, entry.name);
        const fileStat = await stat(fullPath);
        return { fullPath, mtimeMs: fileStat.mtimeMs };
      }),
    );
    withStats.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return withStats[0]?.fullPath || null;
  } catch {
    return null;
  }
}

async function resolveSourcePath(windowDays: Last30DaysWindow = 30): Promise<string | null> {
  const candidates = [...(WINDOW_JSON_PATHS[windowDays] || []), ...DEFAULT_PATHS];
  for (const candidate of candidates) {
    try {
      const st = await stat(candidate);
      if (st.isFile()) return candidate;
      if (st.isDirectory()) {
        const latest = await findLatestJsonInDir(candidate);
        if (latest) return latest;
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function loadRowsFromSqlite(sqlitePath: string): Promise<any[]> {
  const pythonCode = `
import json
import sqlite3
import sys

db_path = sys.argv[1]
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

preferred_time = ["published_at", "publishedat", "created_at", "updated_at", "timestamp", "date", "as_of"]
preferred_title = ["title", "headline", "text", "summary", "content", "description"]
preferred_source = ["source", "source_name", "provider", "publisher", "channel"]
preferred_url = ["url", "link", "source_url"]

tables = [row[0] for row in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
best = None
for table in tables:
    if table.startswith("sqlite_"):
        continue
    cols = [r[1].lower() for r in cur.execute(f"PRAGMA table_info('{table}')").fetchall()]
    score = 0
    if any(c in cols for c in preferred_title): score += 3
    if any(c in cols for c in preferred_time): score += 2
    if any(c in cols for c in preferred_source): score += 1
    if any(c in cols for c in preferred_url): score += 1
    if score > 0 and (best is None or score > best[0]):
        best = (score, table, cols)

if best is None:
    print("[]")
    sys.exit(0)

_, table, cols = best
time_col = next((c for c in preferred_time if c in cols), None)
order_clause = f"ORDER BY \\"{time_col}\\" DESC" if time_col else ""
query = f'SELECT * FROM "{table}" {order_clause} LIMIT 500'
rows = cur.execute(query).fetchall()
out = [dict(row) for row in rows]
print(json.dumps(out, ensure_ascii=False))
`;

  try {
    const { stdout } = await execFileAsync("python3", ["-c", pythonCode, sqlitePath], {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 15_000,
    });
    const parsed = JSON.parse(String(stdout || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function loadLast30DaysSummary(windowDays: Last30DaysWindow = 30): Promise<Last30DaysSummary> {
  const warnings: string[] = [];
  const sourcePath = await resolveSourcePath(windowDays);
  let sourceStat: { mtimeMs: number } | null = null;
  let rawItems: any[] = [];
  let resolvedSource = sourcePath;

  if (sourcePath) {
    try {
      const content = await readFile(sourcePath, "utf-8");
      const parsed = JSON.parse(content);
      rawItems = normalizeArrayPayload(parsed);
      sourceStat = await stat(sourcePath).catch(() => null);
    } catch (error: any) {
      warnings.push(`failed_to_parse_json: ${error?.message || "unknown_error"}`);
    }
  }

  if (rawItems.length === 0 && SQLITE_PATH) {
    const sqliteRows = await loadRowsFromSqlite(SQLITE_PATH);
    if (sqliteRows.length > 0) {
      rawItems = sqliteRows;
      resolvedSource = SQLITE_PATH;
      sourceStat = await stat(SQLITE_PATH).catch(() => null);
      warnings.push("json_not_found_or_empty: fallback_loaded_from_sqlite");
    } else {
      warnings.push("sqlite_fallback_empty_or_unavailable");
    }
  }

  if (rawItems.length === 0) {
    warnings.push(
      "last30days data not found. Set LAST30DAYS_JSON_PATH (file/dir) or LAST30DAYS_SQLITE_PATH (SQLite from --store).",
    );
    return {
      generatedAt: new Date().toISOString(),
      sourceFile: resolvedSource || null,
      sourceUpdatedAt: sourceStat ? new Date(sourceStat.mtimeMs).toISOString() : null,
      warnings,
      items: [],
    };
  }

  const normalizedItems: Last30DaysRecord[] = rawItems.map((item: any, idx: number) => {
    const title = normalizeHeadline(item?.title || item?.headline || item?.text || item?.summary || `Signal ${idx + 1}`);
    const body = normalizeText(item?.summary || item?.content || item?.description);
    const merged = `${title} ${body}`.trim();
    const sourceRaw = normalizeText(item?.source || item?.source_name || item?.publisher || "last30days");
    const url = normalizeUrl(item?.url || item?.link || item?.source_url || "#");
    const source = normalizeSource(sourceRaw, url, title);
    return {
      id: normalizeText(item?.id || item?.uuid || `${source}-${idx + 1}`),
      title,
      source,
      url,
      publishedAt: normalizeDate(item?.published_at || item?.publishedAt || item?.date || item?.timestamp),
      commodity: inferCommodity(`${merged} ${normalizeText(item?.commodity)}`),
      region: inferRegion(`${merged} ${normalizeText(item?.region)}`),
      language: inferLanguage(item, merged),
      signal: inferSignal(merged),
      impact: inferImpact(item, merged),
    };
  });
  const items = dedupeLast30Items(filterSourceNoise(normalizedItems));

  return {
    generatedAt: new Date().toISOString(),
    sourceFile: resolvedSource || null,
    sourceUpdatedAt: sourceStat ? new Date(sourceStat.mtimeMs).toISOString() : null,
    warnings,
    items,
  };
}
