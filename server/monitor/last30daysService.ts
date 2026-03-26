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

type Last30DaysSummary = {
  generatedAt: string;
  sourceFile: string | null;
  sourceUpdatedAt: string | null;
  warnings: string[];
  items: Last30DaysRecord[];
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
    if (primary.startsWith("fr")) return "fr";
    return "en";
  }

  const lower = text.toLowerCase();
  if (/[іїєґ]/.test(lower)) return "uk";
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

async function resolveSourcePath(): Promise<string | null> {
  for (const candidate of DEFAULT_PATHS) {
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

export async function loadLast30DaysSummary(): Promise<Last30DaysSummary> {
  const warnings: string[] = [];
  const sourcePath = await resolveSourcePath();
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

  const items: Last30DaysRecord[] = rawItems.map((item: any, idx: number) => {
    const title = normalizeText(item?.title || item?.headline || item?.text || item?.summary || `Signal ${idx + 1}`);
    const body = normalizeText(item?.summary || item?.content || item?.description);
    const merged = `${title} ${body}`.trim();
    const source = normalizeText(item?.source || item?.source_name || item?.publisher || "last30days");
    const url = normalizeText(item?.url || item?.link || item?.source_url || "#") || "#";
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

  return {
    generatedAt: new Date().toISOString(),
    sourceFile: resolvedSource || null,
    sourceUpdatedAt: sourceStat ? new Date(sourceStat.mtimeMs).toISOString() : null,
    warnings,
    items,
  };
}
