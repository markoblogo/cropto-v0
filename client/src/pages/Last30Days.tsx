import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, ChevronRight, Copy, Download, Printer } from "lucide-react";

type Last30DaysRecord = {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  commodity: string;
  region: string;
  language: string;
  signal: "bullish" | "bearish" | "neutral";
  impact: number;
};

type Last30DaysResponse = {
  generatedAt: string;
  sourceFile: string | null;
  sourceUpdatedAt: string | null;
  warnings?: string[];
  summary: {
    coverageCount: number;
    signalBalancePct: number;
    riskIndex: number;
    topCommodity: string | null;
    commodityShare: Record<string, number>;
    regionalHeat: Record<string, number>;
  };
  items: Last30DaysRecord[];
};

type Last30DaysAiSummaryBlock = {
  language: "en" | "uk";
  scope: string;
  model: string;
  text: string;
  chart?: {
    type?: "bars" | "line" | "weekly_bars" | "event_mix" | "price_overlay_week" | "price_overlay_month";
    title?: string;
    points?: Array<{ label: string; value: number }>;
    series?: Array<{ name: string; points: Array<{ label: string; value: number }> }>;
  } | null;
  inputCounts: {
    last30days: number;
    monitor: number;
  };
};

type Last30DaysAiResponse = {
  generatedAt: string;
  filters: { days: number };
  sourceUpdatedAt: string | null;
  warnings?: string[];
  en: Last30DaysAiSummaryBlock | null;
  uk: Last30DaysAiSummaryBlock | null;
  historyDays?: number;
  windowsReady?: {
    week?: boolean;
    month?: boolean;
  };
};

type MarketDashboardRow = {
  commodity?: string;
  price?: number;
  basis?: string;
  source?: string;
  asOf?: string;
};

type MarketDashboardResponse = {
  ua?: MarketDashboardRow[];
  us?: MarketDashboardRow[];
  ar?: MarketDashboardRow[];
  br?: MarketDashboardRow[];
};

const TIMEFRAME_OPTIONS = [
  { value: 1, label: "Yesterday" },
  { value: 7, label: "Week" },
  { value: 30, label: "30 Days" },
];

const REGION_LABELS: Record<string, string> = {
  all: "Global",
  global: "Global",
  ukraine: "Ukraine",
  europe: "Europe",
  black_sea: "Black Sea",
};

const PIE_COLORS = ["#22d3ee", "#34d399", "#f59e0b", "#60a5fa", "#f472b6", "#a78bfa"];

function formatRegion(value: string) {
  return REGION_LABELS[value] || value.replaceAll("_", " ");
}

function formatSignal(value: string) {
  return value.toUpperCase();
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "n/a";
  return date.toISOString().slice(0, 10);
}

function extractHostnameLabel(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host || "source";
  } catch {
    return "source";
  }
}

function normalizeFeedTitle(item: Last30DaysRecord) {
  const raw = String(item.title || "")
    .replace(/\r/g, " ")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const withoutUrls = raw.replace(/https?:\/\/\S+/gi, "").replace(/\s+/g, " ").trim();
  const replacementCount = (withoutUrls.match(/�/g) || []).length;
  const cleaned = withoutUrls.replace(/�+/g, " ").replace(/\s+/g, " ").trim();

  if (replacementCount >= 6 || (cleaned.length > 0 && replacementCount / Math.max(withoutUrls.length, 1) > 0.12)) {
    return `Headline unavailable • ${extractHostnameLabel(item.url)}`;
  }

  if (!cleaned) {
    return `Headline unavailable • ${extractHostnameLabel(item.url)}`;
  }

  if (normalizeSource(item.source) === "x") {
    const compact = cleaned
      .replace(/^@\w+\s+/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return compact;
  }

  return cleaned;
}

function normalizeSource(source: string) {
  const val = String(source || "web").toLowerCase();
  if (val.includes("reddit")) return "reddit";
  if (val.includes("youtube")) return "youtube";
  if (val === "x" || val.includes("twitter")) return "x";
  if (val.includes("bluesky")) return "bluesky";
  if (val.includes("hn") || val.includes("hacker")) return "hn";
  if (val.includes("web")) return "web";
  return val;
}

function sourceBadgeMeta(source: string) {
  const normalized = normalizeSource(source);
  const meta: Record<string, { label: string; className: string }> = {
    web: {
      label: "WEB",
      className: "border-slate-700 bg-slate-900 text-sky-300",
    },
    x: {
      label: "X",
      className: "border-slate-700 bg-slate-900 text-slate-100",
    },
    bluesky: {
      label: "BSKY",
      className: "border-sky-900/70 bg-sky-950/60 text-sky-300",
    },
    reddit: {
      label: "RDT",
      className: "border-orange-900/70 bg-orange-950/40 text-orange-300",
    },
    youtube: {
      label: "YT",
      className: "border-rose-900/70 bg-rose-950/40 text-rose-300",
    },
    hn: {
      label: "HN",
      className: "border-amber-900/70 bg-amber-950/40 text-amber-300",
    },
  };
  return meta[normalized] || {
    label: normalized.toUpperCase(),
    className: "border-slate-700 bg-slate-900 text-slate-300",
  };
}

function shortLegendLabel(mode: "sources" | "commodities" | "regions" | "languages", label: string): string {
  const normalized = label.toLowerCase();
  if (mode === "languages") return label.toUpperCase();
  if (mode === "sources") {
    const map: Record<string, string> = {
      web: "WEB",
      reddit: "RDT",
      x: "X",
      bluesky: "BSKY",
      youtube: "YT",
      hn: "HN",
    };
    return map[normalized] || label.toUpperCase();
  }
  if (mode === "regions") {
    const map: Record<string, string> = {
      global: "GBL",
      ukraine: "UKR",
      europe: "EUR",
      black_sea: "BLS",
      "black sea": "BLS",
    };
    return map[normalized] || label.slice(0, 3).toUpperCase();
  }
  const map: Record<string, string> = {
    mixed: "MIX",
    wheat: "WHT",
    soybeans: "SYB",
    corn: "CRN",
    oilseeds: "OIL",
    sunflower: "SFL",
    rapeseed: "RPS",
    barley: "BRL",
    rice: "RCE",
  };
  return map[normalized] || label.slice(0, 3).toUpperCase();
}

function shortModeLabel(mode: "sources" | "commodities" | "regions" | "languages"): string {
  const map = {
    sources: "SRC",
    commodities: "CMD",
    regions: "REG",
    languages: "LAN",
  } as const;
  return map[mode];
}

function buildDistribution(items: Last30DaysRecord[], mode: "sources" | "commodities" | "regions" | "languages"): Array<[string, number]> {
  const map = items.reduce<Record<string, number>>((acc, item) => {
    let key = "mixed";
    if (mode === "sources") key = normalizeSource(item.source || "web");
    if (mode === "commodities") key = (item.commodity || "mixed").toLowerCase();
    if (mode === "regions") key = formatRegion(item.region || "global");
    if (mode === "languages") key = (item.language || "en").toUpperCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

function buildDailyTrend(items: Last30DaysRecord[], days: number): number[] {
  const now = new Date();
  const dayKeys: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setUTCDate(now.getUTCDate() - i);
    dayKeys.push(d.toISOString().slice(0, 10));
  }
  const counts = new Map<string, number>();
  dayKeys.forEach((key) => counts.set(key, 0));
  for (const item of items) {
    const key = formatDate(item.publishedAt);
    if (counts.has(key)) counts.set(key, (counts.get(key) || 0) + 1);
  }
  return dayKeys.map((key) => counts.get(key) || 0);
}

function TrendSparkline({ values }: { values: number[] }) {
  const width = 220;
  const height = 88;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const points = values
    .map((value, idx) => {
      const x = (idx / Math.max(values.length - 1, 1)) * width;
      const y = height - ((value - min) / range) * (height - 8) - 4;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-24 w-full">
      <polyline fill="none" stroke="#22d3ee" strokeWidth="2.5" points={points} />
    </svg>
  );
}

type SummarySection = {
  heading: string;
  body: string[];
};

type SummarySectionKind = "general" | "change" | "action" | "facts" | "other";

type PriceQuote = {
  commodity: string;
  value: number;
  currency: string;
  region: string;
  basis?: string;
  title: string;
  publishedAt: string;
};

type PulseDriver = {
  label: string;
  score: number;
  note: string;
};

function formatCommodityLabel(value: string) {
  const map: Record<string, string> = {
    corn: "Corn",
    wheat: "Wheat",
    soybeans: "Soybeans",
    soybean: "Soybeans",
    sunflower: "Sunflower",
    rapeseed: "Rapeseed",
    barley: "Barley",
    rice: "Rice",
    mixed: "Mixed",
  };
  return map[String(value || "mixed").toLowerCase()] || value;
}

function extractPriceQuotes(items: Last30DaysRecord[]): PriceQuote[] {
  const byCommodity = new Map<string, PriceQuote>();
  const sorted = [...items].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  for (const item of sorted) {
    const text = `${item.title} ${item.source}`.replace(/,/g, "");
    const priceMatch = text.match(/(\d+(?:\.\d+)?)\s*(usd|eur|uah)/i);
    if (!priceMatch) continue;
    const commodity = String(item.commodity || "mixed").toLowerCase();
    if (byCommodity.has(commodity)) continue;
    byCommodity.set(commodity, {
      commodity,
      value: Number(priceMatch[1]),
      currency: String(priceMatch[2] || "USD").toUpperCase(),
      region: formatRegion(item.region || "global"),
      basis: undefined,
      title: item.title,
      publishedAt: item.publishedAt,
    });
  }
  return Array.from(byCommodity.values()).slice(0, 5);
}

function buildDashboardQuotes(payload: MarketDashboardResponse | undefined, language: "en" | "uk"): PriceQuote[] {
  const regions = language === "uk" ? [{ key: "ua", label: "Ukraine" as const }] : [{ key: "us", label: "US" as const }, { key: "ar", label: "Argentina" as const }, { key: "br", label: "Brazil" as const }];
  const out: PriceQuote[] = [];
  for (const region of regions) {
    const rows = (payload?.[region.key as keyof MarketDashboardResponse] || []) as MarketDashboardRow[];
    for (const row of rows) {
      if (!row || !Number.isFinite(row.price)) continue;
      out.push({
        commodity: String(row.commodity || "mixed").toLowerCase(),
        value: Number(row.price || 0),
        currency: "USD",
        region: region.label,
        basis: String(row.basis || "").trim(),
        title: `${row.commodity || "Commodity"} ${row.basis || ""}`.trim(),
        publishedAt: String(row.asOf || ""),
      });
    }
  }
  const seen = new Set<string>();
  return out.filter((quote) => {
    const key = `${quote.region}:${quote.commodity}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);
}

function buildPulseDrivers(items: Last30DaysRecord[], language: "en" | "uk"): PulseDriver[] {
  const buckets = [
    {
      key: "logistics",
      label: language === "uk" ? "Логістика" : "Logistics",
      patterns: /\blogistics\b|\bport\b|\bfreight\b|\bshipment\b|\bexport\b|\bodesa\b|\bodessa\b|\bдуна[йю]\b|\bпорт/i,
      note: language === "uk" ? "Маршрути та виконання" : "Routes and execution",
    },
    {
      key: "pricing",
      label: language === "uk" ? "Ціни" : "Pricing",
      patterns: /\bprice\b|\bpriced\b|\bcpt\b|\bfob\b|\bfca\b|\busd\b|\beur\b|ціна|ціни|котирув/i,
      note: language === "uk" ? "Рівні та базиси" : "Levels and basis",
    },
    {
      key: "demand",
      label: language === "uk" ? "Попит" : "Demand",
      patterns: /\bdemand\b|\bimport\b|\bbuying\b|\btender\b|попит|імпорт|закуп/i,
      note: language === "uk" ? "Покупець та споживання" : "Buyer and consumption",
    },
    {
      key: "policy",
      label: language === "uk" ? "Політика" : "Policy",
      patterns: /\bpolicy\b|\bquota\b|\bsanction\b|\bregulation\b|мито|квот|санкц|регул/i,
      note: language === "uk" ? "Регуляторний фон" : "Regulatory backdrop",
    },
    {
      key: "risk",
      label: language === "uk" ? "Ризик" : "Risk",
      patterns: /\brisk\b|\battack\b|\bwar\b|\bdisruption\b|ризик|атак|війн|загроз/i,
      note: language === "uk" ? "Події та волатильність" : "Events and volatility",
    },
  ];

  const scored = buckets.map((bucket) => {
    const matches = items.filter((item) => bucket.patterns.test(item.title));
    const score = matches.reduce((acc, item) => acc + Math.max(1, item.impact || 0), 0);
    return { label: bucket.label, score, note: bucket.note };
  });

  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function splitSummaryIntoSections(text: string): SummarySection[] {
  const normalized = String(text || "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!normalized) return [];

  const isUk = /[іїєґІЇЄҐ]/.test(normalized) || /[а-яА-Я]/.test(normalized);
  const sectionLabels: Record<Exclude<SummarySectionKind, "other">, string> = isUk
    ? {
        general: "Загальна ситуація",
        change: "Що змінилося",
        action: "Практичні наслідки для трейдингу та брокерських операцій",
        facts: "Ключові факти",
      }
    : {
        general: "General situation",
        change: "What changed vs previous comparable period",
        action: "Actionable implications for trading/brokerage",
        facts: "Key facts",
      };

  const classifyBlock = (value: string): SummarySectionKind => {
    const low = value.toLowerCase();
    if (
      /^(general situation:|загальна ситуація:)/i.test(value) ||
      /ринку|market/.test(low)
    ) {
      if (!/key facts|ключові факти|actionable implications|практичні наслідки|що змінилося|what changed/i.test(low)) {
        return "general";
      }
    }
    if (
      /^(what changed vs previous comparable period:|що змінилося:?|що змінилося у порівнянні)/i.test(value) ||
      /compared to|порівняно з/.test(low)
    ) {
      return "change";
    }
    if (
      /^(actionable implications for trading\/brokerage:|практичні наслідки для трейдингу та брокерських операцій:|торгівельні та брокерські рекомендації:|імплікації для торгівлі:)/i.test(value) ||
      /traders should|для трейдерів|рекомендується/.test(low)
    ) {
      return "action";
    }
    if (/^(key facts:|ключові факти:)/i.test(value) || /(^|\n)- /.test(value) || /\n• /.test(value)) {
      return "facts";
    }
    return "other";
  };

  const headingPatterns = [
    "General situation:",
    "What changed vs previous comparable period:",
    "Actionable implications for trading/brokerage:",
    "Key facts:",
    "Загальна ситуація:",
    "Що змінилося:",
    "Що змінилося у порівнянні з попереднім тижнем:",
    "Практичні наслідки для трейдингу та брокерських операцій:",
    "Торгівельні та брокерські рекомендації:",
    "Імплікації для торгівлі:",
    "Ключові факти:",
  ];

  let decorated = normalized;
  for (const pattern of headingPatterns) {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    decorated = decorated.replace(new RegExp(`\\s*${escaped}`, "g"), `\n\n${pattern}`);
  }

  decorated = decorated
    .replace(/\s+(Порівняно з попереднім днем[, ]|Порівняно з попереднім тижнем[, ]|Порівняно з попереднім місяцем[, ])/g, "\n\n$1")
    .replace(/\s+(Для трейдерів[^.]*\.)/g, "\n\n$1")
    .replace(/\s+(Рекомендується[^.]*\.)/g, "\n\n$1")
    .replace(/\s+(Compared to the previous day[^.]*\.)/g, "\n\n$1")
    .replace(/\s+(Traders should[^.]*\.)/g, "\n\n$1")
    .replace(/\s+[•\-]\s+/g, "\n- ")
    .trim();

  const blocks = decorated
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const sections: SummarySection[] = [];
  let current: SummarySection | null = null;

  for (const block of blocks) {
    const headingMatch = block.match(
      /^(General situation:|What changed vs previous comparable period:|Actionable implications for trading\/brokerage:|Key facts:|Загальна ситуація:|Що змінилося:?|Що змінилося у порівнянні з попереднім тижнем:|Практичні наслідки для трейдингу та брокерських операцій:|Торгівельні та брокерські рекомендації:|Імплікації для торгівлі:|Ключові факти:)\s*/i,
    );
    if (headingMatch) {
      const heading = headingMatch[1].trim();
      const rest = block.slice(headingMatch[0].length).trim();
      current = { heading, body: rest ? [rest] : [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { heading: "Summary", body: [block] };
      sections.push(current);
    } else {
      current.body.push(block);
    }
  }

  const hasCanonicalHeadings = sections.some((section) =>
    /^(General situation|What changed|Actionable implications|Key facts|Загальна ситуація|Що змінилося|Практичні наслідки|Торгівельні та брокерські рекомендації|Імплікації для торгівлі|Ключові факти)/i.test(
      section.heading,
    ),
  );

  if (hasCanonicalHeadings) {
    return sections;
  }

  const canonicalBuckets: Record<SummarySectionKind, string[]> = {
    general: [],
    change: [],
    action: [],
    facts: [],
    other: [],
  };

  for (const block of blocks) {
    canonicalBuckets[classifyBlock(block)].push(block);
  }

  if (canonicalBuckets.general.length === 0 && blocks[0]) {
    canonicalBuckets.general.push(blocks[0]);
  }
  if (canonicalBuckets.action.length === 0 && blocks.length > 1) {
    const actionCandidate = blocks.find((block, index) => index > 0 && classifyBlock(block) === "other");
    if (actionCandidate) canonicalBuckets.action.push(actionCandidate);
  }
  if (canonicalBuckets.change.length === 0) {
    const changeCandidate = blocks.find((block) => /compared to|порівняно з|зміни|changed/i.test(block));
    if (changeCandidate) canonicalBuckets.change.push(changeCandidate);
  }
  if (canonicalBuckets.facts.length === 0) {
    const factCandidates = blocks.filter((block) => /(\d{4}-\d{2}-\d{2}|\d+\s?(usd|eur|uah|грн))/i.test(block));
    if (factCandidates.length) {
      canonicalBuckets.facts.push(...factCandidates.slice(-2));
    }
  }

  const ordered: SummarySection[] = [];
  (["general", "change", "action", "facts"] as const).forEach((kind) => {
    const body = canonicalBuckets[kind]
      .map((entry) =>
        entry
          .replace(/^(General situation:|What changed vs previous comparable period:|Actionable implications for trading\/brokerage:|Key facts:|Загальна ситуація:|Що змінилося:?|Що змінилося у порівнянні з попереднім тижнем:|Практичні наслідки для трейдингу та брокерських операцій:|Торгівельні та брокерські рекомендації:|Імплікації для торгівлі:|Ключові факти:)\s*/i, "")
          .trim(),
      )
      .filter(Boolean);
    if (body.length) {
      ordered.push({ heading: sectionLabels[kind], body });
    }
  });

  if (ordered.length) {
    return ordered;
  }

  return sections;
}

function DeskSnapshotPulse({
  items,
  language,
  dashboardQuotes,
}: {
  items: Last30DaysRecord[];
  language: "en" | "uk";
  dashboardQuotes: PriceQuote[];
}) {
  const quotes = dashboardQuotes.length ? dashboardQuotes : extractPriceQuotes(items);
  const drivers = buildPulseDrivers(items, language);
  if (!quotes.length && !drivers.length) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
        <p className="mb-2 text-xs uppercase tracking-[0.12em] text-slate-400">{language === "uk" ? "Desk Snapshot + Pulse" : "Desk Snapshot + Pulse"}</p>
        <p className="text-sm text-slate-400">{language === "uk" ? "Недостатньо денних ринкових опорних точок." : "Not enough daily market anchors in current scope."}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
      <div className="grid max-h-72 gap-3 overflow-y-auto pr-1 md:grid-cols-[1.15fr_0.85fr]">
        <div>
          <p className="mb-3 text-xs uppercase tracking-[0.12em] text-slate-400">Desk Snapshot</p>
          <div className="space-y-2">
            {quotes.slice(0, 5).map((quote) => (
              <div key={`${quote.region}-${quote.commodity}-${quote.currency}`} className="rounded-lg border border-slate-800 bg-slate-900/75 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13px] font-semibold text-slate-100">{formatCommodityLabel(quote.commodity)}</span>
                  <span className="text-[13px] font-mono text-cyan-300">
                    {quote.value.toFixed(quote.value % 1 === 0 ? 0 : 1)} {quote.currency}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-slate-400">
                  <span>{quote.basis ? `${quote.region} • ${quote.basis}` : quote.region}</span>
                  <span>{formatDate(quote.publishedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-3 text-xs uppercase tracking-[0.12em] text-slate-400">Pulse</p>
          <div className="space-y-2">
            {drivers.length ? drivers.map((driver, idx) => {
              const max = Math.max(...drivers.map((entry) => entry.score), 1);
              return (
                <div key={driver.label} className="rounded-lg border border-slate-800 bg-slate-900/75 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13px] font-semibold text-slate-100">{driver.label}</span>
                    <span className="text-xs font-mono text-slate-300">{driver.score.toFixed(0)}</span>
                  </div>
                  <div className="mt-2 h-2 rounded bg-slate-800">
                    <div className="h-2 rounded" style={{ width: `${Math.max(12, Math.round((driver.score / max) * 100))}%`, backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">{driver.note}</p>
                </div>
              );
            }) : (
              <div className="rounded-lg border border-slate-800 bg-slate-900/75 px-3 py-2 text-sm text-slate-400">
                {language === "uk" ? "Драйвери дня ще не выделяются явно." : "Daily drivers are not strongly differentiated yet."}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AIPeriodChart({
  chart,
  fallbackValues,
  items,
  language,
  days,
  dashboardQuotes,
}: {
  chart?:
    | {
        type?: "bars" | "line" | "weekly_bars" | "event_mix" | "price_overlay_week" | "price_overlay_month";
        title?: string;
        points?: Array<{ label: string; value: number }>;
        series?: Array<{ name: string; points: Array<{ label: string; value: number }> }>;
      }
    | null;
  fallbackValues: number[];
  items: Last30DaysRecord[];
  language: "en" | "uk";
  days: number;
  dashboardQuotes: PriceQuote[];
}) {
  if (days === 1) {
    return <DeskSnapshotPulse items={items} language={language} dashboardQuotes={dashboardQuotes} />;
  }

  const points = Array.isArray(chart?.points) ? chart!.points!.filter((p) => Number.isFinite(p?.value)) : [];
  const series = Array.isArray(chart?.series)
    ? chart.series
        .map((s) => ({
          name: String(s?.name || "Series"),
          points: Array.isArray(s?.points) ? s.points.filter((p) => Number.isFinite(p?.value)) : [],
        }))
        .filter((s) => s.points.length >= 2)
    : [];

  if (series.length) {
    const width = 240;
    const height = 110;
    const flatValues = series.flatMap((s) => s.points.map((p) => Number(p.value || 0)));
    const max = Math.max(...flatValues, 1);
    const min = Math.min(...flatValues, 0);
    const range = Math.max(max - min, 1);
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
        <p className="mb-2 text-xs uppercase tracking-[0.12em] text-slate-400">{chart?.title || "Price Overlay"}</p>
        <div className="space-y-2">
          <svg viewBox={`0 0 ${width} ${height}`} className="h-28 w-full">
            {series.slice(0, 4).map((s, idx) => {
              const color = PIE_COLORS[idx % PIE_COLORS.length];
              const poly = s.points
                .map((p, i) => {
                  const x = (i / Math.max(s.points.length - 1, 1)) * width;
                  const y = height - ((Number(p.value || 0) - min) / range) * (height - 8) - 4;
                  return `${x},${y}`;
                })
                .join(" ");
              return <polyline key={s.name} fill="none" stroke={color} strokeWidth="2.1" points={poly} />;
            })}
          </svg>
          <div className="flex flex-wrap gap-2 text-[10px] text-slate-300">
            {series.slice(0, 4).map((s, idx) => (
              <span key={s.name} className="inline-flex items-center gap-1 rounded border border-slate-700 px-1.5 py-0.5">
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                {s.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!points.length) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
        <p className="mb-2 text-xs uppercase tracking-[0.12em] text-slate-400">{chart?.title || "Trend"}</p>
        <TrendSparkline values={fallbackValues} />
      </div>
    );
  }

  if (chart?.type === "line") {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
        <p className="mb-2 text-xs uppercase tracking-[0.12em] text-slate-400">{chart?.title || "Trend"}</p>
        <TrendSparkline values={points.map((p) => Number(p.value || 0))} />
      </div>
    );
  }

  const max = Math.max(...points.map((p) => Number(p.value || 0)), 1);
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
      <p className="mb-2 text-xs uppercase tracking-[0.12em] text-slate-400">{chart?.title || "Market View"}</p>
      <div className="space-y-2">
        {points.slice(0, 8).map((point) => {
          const width = Math.max(8, Math.round((Number(point.value || 0) / max) * 100));
          return (
            <div key={point.label} className="grid grid-cols-[52px_1fr_30px] items-center gap-2 text-xs text-slate-300">
              <span className="truncate">{point.label}</span>
              <div className="h-2 rounded bg-slate-800">
                <div className="h-2 rounded bg-cyan-400" style={{ width: `${width}%` }} />
              </div>
              <span className="text-right font-mono">{Number(point.value || 0).toFixed(0)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DistributionPanel({
  entries,
  mode,
}: {
  entries: Array<[string, number]>;
  mode: "sources" | "commodities" | "regions" | "languages";
}) {
  const trimmed = entries.slice(0, 6);
  const total = trimmed.reduce((acc, [, value]) => acc + value, 0);
  const stops: string[] = [];
  let cursor = 0;
  for (let i = 0; i < trimmed.length; i += 1) {
    const pct = total > 0 ? (trimmed[i][1] / total) * 100 : 0;
    const next = cursor + pct;
    stops.push(`${PIE_COLORS[i % PIE_COLORS.length]} ${cursor}% ${next}%`);
    cursor = next;
  }
  const conic = stops.length ? `conic-gradient(${stops.join(", ")})` : "conic-gradient(#1e293b 0 100%)";

  if (trimmed.length === 0) {
    return <div className="text-sm text-slate-400">No records for current scope.</div>;
  }

  return (
    <div className="grid min-h-[182px] gap-4 md:grid-cols-[236px_112px] md:items-start">
      <div className="flex justify-center pt-0">
        <div className="relative h-[214px] w-[214px] rounded-full" style={{ background: conic }}>
          <div className="absolute inset-7 rounded-full bg-slate-950/95" />
        </div>
      </div>
      <div className="max-h-[168px] space-y-4 overflow-y-auto pr-1 pt-2">
        {trimmed.map(([label], idx) => (
          <div key={label} className="flex items-center text-sm">
            <div className="flex items-center gap-2 text-slate-300">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
              <span>{shortLegendLabel(mode, label)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function makeAnalyticSummary(items: Last30DaysRecord[], periodLabel: string, languageLabel: "EN" | "UK") {
  if (items.length === 0) {
    return `No ${languageLabel} records found for ${periodLabel.toLowerCase()} in the selected scope.`;
  }

  const signal = items.reduce(
    (acc, item) => {
      if (item.signal === "bullish") acc.bullish += 1;
      if (item.signal === "bearish") acc.bearish += 1;
      if (item.signal === "neutral") acc.neutral += 1;
      return acc;
    },
    { bullish: 0, bearish: 0, neutral: 0 },
  );

  const commodityTop = Object.entries(
    items.reduce<Record<string, number>>((acc, item) => {
      const key = (item.commodity || "mixed").toLowerCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => `${name} (${count})`)
    .join(", ");

  const regionTop = Object.entries(
    items.reduce<Record<string, number>>((acc, item) => {
      const key = formatRegion(item.region || "global");
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([name]) => name)
    .join(", ");

  const keyHeadlines = items
    .slice(0, 4)
    .map((item, idx) => `${idx + 1}. ${item.title}`)
    .join("\n");

  const flowText =
    signal.bullish > signal.bearish
      ? "Market tone is mildly constructive with more upside-oriented triggers than downside pressure."
      : signal.bearish > signal.bullish
        ? "Market tone is cautious, with downside risks slightly dominating the current flow."
        : "Market tone is balanced, with no strong directional dominance in the signal flow.";

  return [
    `General situation (${periodLabel.toLowerCase()}, ${languageLabel}):`,
    flowText,
    `Attention is concentrated around ${commodityTop || "mixed commodities"}${regionTop ? `, with most pressure points in ${regionTop}.` : "."}`,
    "",
    "Key facts:",
    keyHeadlines,
  ].join("\n");
}

function normalizeSummaryText(text: string): string {
  const raw = String(text || "").trim();
  if (!raw) return raw;
  const withBreaks = raw
    .replace(/\s+(General situation:|Загальна ситуація:)/gi, "\n$1")
    .replace(/\s+(What changed[^:]*:|Що змінилося[^:]*:)/gi, "\n\n$1")
    .replace(/\s+(Actionable implications[^:]*:|Практичні наслідки[^:]*:|Торгівельні та брокерські рекомендації:|Імплікації для торгівлі:)/gi, "\n\n$1")
    .replace(/\s+(Key facts:|Ключові факти:)/gi, "\n\n$1")
    .replace(/\s+[•\-]\s+/g, "\n- ");
  return withBreaks.replace(/\n{3,}/g, "\n\n").trim();
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(href);
}

function printText(title: string, text: string) {
  const win = window.open("", "_blank", "noopener,noreferrer,width=960,height=720");
  if (!win) return;
  const doc = win.document;
  doc.title = title;
  doc.head.innerHTML = '<style>body{font-family:Arial,sans-serif;padding:24px;line-height:1.45;}pre{white-space:pre-wrap;}</style>';
  doc.body.innerHTML = "";
  const h2 = doc.createElement("h2");
  h2.textContent = title;
  const pre = doc.createElement("pre");
  pre.textContent = text;
  doc.body.appendChild(h2);
  doc.body.appendChild(pre);
  win.focus();
  win.print();
}

function SummaryCard({
  title,
  summary,
  trend,
  aiChart,
  filename,
  items,
  language,
  days,
  dashboardQuotes,
}: {
  title: string;
  summary: string;
  trend: number[];
  aiChart?: {
    type?: "bars" | "line" | "weekly_bars" | "event_mix" | "price_overlay_week" | "price_overlay_month";
    title?: string;
    points?: Array<{ label: string; value: number }>;
    series?: Array<{ name: string; points: Array<{ label: string; value: number }> }>;
  } | null;
  filename: string;
  items: Last30DaysRecord[];
  language: "en" | "uk";
  days: number;
  dashboardQuotes: PriceQuote[];
}) {
  const sections = splitSummaryIntoSections(summary);
  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-900/70 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="flex items-center gap-2">
          <button onClick={() => navigator.clipboard.writeText(summary)} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 hover:border-cyan-400">
            <Copy className="mr-1 inline h-3 w-3" />Copy
          </button>
          <button onClick={() => downloadText(filename, summary)} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 hover:border-cyan-400">
            <Download className="mr-1 inline h-3 w-3" />TXT
          </button>
          <button onClick={() => printText(title, summary)} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 hover:border-cyan-400">
            <Printer className="mr-1 inline h-3 w-3" />Print
          </button>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-sm text-slate-200 select-text">
          <div className="space-y-4">
            {(sections.length ? sections : [{ heading: "", body: [summary] }]).map((section, idx) => (
              <div key={`${section.heading}-${idx}`} className="space-y-2">
                {section.heading ? <p className="text-sm font-semibold text-slate-100">{section.heading}</p> : null}
                {section.body.map((paragraph, bodyIdx) => {
                  const lines = paragraph
                    .split("\n")
                    .map((line) => line.trim())
                    .filter(Boolean);
                  const bulletLines = lines.filter((line) => line.startsWith("- "));
                  if (bulletLines.length === lines.length && bulletLines.length > 0) {
                    return (
                      <div key={bodyIdx} className="space-y-1.5">
                        {bulletLines.map((line) => (
                          <div key={line} className="flex gap-2 text-slate-200">
                            <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-cyan-300" />
                            <span>{line.slice(2)}</span>
                          </div>
                        ))}
                      </div>
                    );
                  }
                  return (
                    <p key={bodyIdx} className="leading-6 text-slate-200">
                      {paragraph}
                    </p>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <AIPeriodChart chart={aiChart} fallbackValues={trend} items={items} language={language} days={days} dashboardQuotes={dashboardQuotes} />
      </div>
    </div>
  );
}

export default function Last30DaysPage() {
  const [days, setDays] = useState<number>(30);
  const [analyticsTab, setAnalyticsTab] = useState<"sources" | "commodities" | "regions" | "languages">("sources");

  const [feedOpen, setFeedOpen] = useState<boolean>(false);
  const [feedRegion, setFeedRegion] = useState<string>("all");
  const [feedLang, setFeedLang] = useState<string>("all");
  const [feedCommodity, setFeedCommodity] = useState<string>("all");
  const [feedSource, setFeedSource] = useState<string>("all");
  const [feedSearch, setFeedSearch] = useState<string>("");

  const summaryQuery = useQuery({
    queryKey: ["/api/last30days/summary", days],
    queryFn: async () => {
      const query = new URLSearchParams({ days: String(days), region: "all", lang: "all" });
      const response = await fetch(`/api/last30days/summary?${query.toString()}`);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to load last30days summary");
      }
      return (await response.json()) as Last30DaysResponse;
    },
    staleTime: 45_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const capabilityQuery = useQuery({
    queryKey: ["/api/last30days/ai-summary", "capabilities"],
    queryFn: async () => {
      const response = await fetch("/api/last30days/ai-summary?days=1");
      if (!response.ok) throw new Error("Failed to load last30days capabilities");
      return (await response.json()) as Last30DaysAiResponse;
    },
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });

  const marketDashboardQuery = useQuery({
    queryKey: ["/api/market-dashboard", "last30days"],
    queryFn: async () => {
      const response = await fetch("/api/market-dashboard");
      if (!response.ok) throw new Error("Failed to load market dashboard context");
      return (await response.json()) as MarketDashboardResponse;
    },
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });

  const aiSummaryQuery = useQuery({
    queryKey: ["/api/last30days/ai-summary", days],
    queryFn: async () => {
      const query = new URLSearchParams({ days: String(days) });
      const response = await fetch(`/api/last30days/ai-summary?${query.toString()}`);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to load AI summaries");
      }
      return (await response.json()) as Last30DaysAiResponse;
    },
    staleTime: 24 * 60 * 60_000,
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });

  const data = summaryQuery.data;
  const activeItems = data?.items || [];

  const infographicEntries = useMemo(() => buildDistribution(activeItems, analyticsTab), [activeItems, analyticsTab]);

  const periodLabel = TIMEFRAME_OPTIONS.find((x) => x.value === days)?.label || `${days} days`;

  const enItems = useMemo(() => activeItems.filter((item) => item.language === "en"), [activeItems]);
  const ukItems = useMemo(() => activeItems.filter((item) => item.language === "uk"), [activeItems]);

  const enSummaryFallback = useMemo(() => makeAnalyticSummary(enItems, periodLabel, "EN"), [enItems, periodLabel]);
  const ukSummaryFallback = useMemo(() => makeAnalyticSummary(ukItems, periodLabel, "UK"), [ukItems, periodLabel]);
  const enAi = aiSummaryQuery.data?.en?.text?.trim() || "";
  const ukAi = aiSummaryQuery.data?.uk?.text?.trim() || "";
  const enSummary = normalizeSummaryText(enAi || enSummaryFallback);
  const ukSummary = normalizeSummaryText(ukAi || ukSummaryFallback);

  const enTrend = useMemo(() => buildDailyTrend(enItems, days), [enItems, days]);
  const ukTrend = useMemo(() => buildDailyTrend(ukItems, days), [ukItems, days]);
  const enDashboardQuotes = useMemo(() => buildDashboardQuotes(marketDashboardQuery.data, "en"), [marketDashboardQuery.data]);
  const ukDashboardQuotes = useMemo(() => buildDashboardQuotes(marketDashboardQuery.data, "uk"), [marketDashboardQuery.data]);

  const feedRegions = useMemo(
    () => ["all", ...Array.from(new Set(activeItems.map((item) => item.region || "global"))).sort((a, b) => a.localeCompare(b))],
    [activeItems],
  );
  const feedLangs = useMemo(
    () => ["all", ...Array.from(new Set(activeItems.map((item) => item.language || "en"))).sort((a, b) => a.localeCompare(b))],
    [activeItems],
  );
  const feedCommodities = useMemo(
    () => ["all", ...Array.from(new Set(activeItems.map((item) => (item.commodity || "mixed").toLowerCase()))).sort((a, b) => a.localeCompare(b))],
    [activeItems],
  );
  const feedSources = useMemo(
    () => ["all", ...Array.from(new Set(activeItems.map((item) => normalizeSource(item.source || "web")))).sort((a, b) => a.localeCompare(b))],
    [activeItems],
  );

  const filteredFeed = useMemo(
    () =>
      activeItems.filter((item) => {
        const regionOk = feedRegion === "all" || item.region === feedRegion;
        const langOk = feedLang === "all" || item.language === feedLang;
        const commodityOk = feedCommodity === "all" || item.commodity.toLowerCase() === feedCommodity;
        const sourceOk = feedSource === "all" || normalizeSource(item.source) === feedSource;
        const searchOk = !feedSearch.trim() || `${item.title} ${item.source} ${item.commodity} ${item.region}`.toLowerCase().includes(feedSearch.toLowerCase());
        return regionOk && langOk && commodityOk && sourceOk && searchOk;
      }),
    [activeItems, feedRegion, feedLang, feedCommodity, feedSource, feedSearch],
  );

  const historyDays = capabilityQuery.data?.historyDays || 0;
  const timeframeOptions = useMemo(
    () =>
      TIMEFRAME_OPTIONS.map((option) => {
        const required = option.value === 7 ? 7 : option.value === 30 ? 30 : 1;
        const ready = option.value === 1 || (option.value === 7 ? Boolean(capabilityQuery.data?.windowsReady?.week) : Boolean(capabilityQuery.data?.windowsReady?.month));
        const progress = option.value === 1 ? 1 : Math.max(0, Math.min(1, historyDays / required));
        return { ...option, required, ready, progress, progressLabel: option.value === 1 ? "Live" : `${Math.min(historyDays, required)}/${required}` };
      }),
    [capabilityQuery.data, historyDays],
  );

  useEffect(() => {
    const current = timeframeOptions.find((option) => option.value === days);
    if (current && !current.ready && current.value !== 1) {
      setDays(1);
    }
  }, [days, timeframeOptions]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {summaryQuery.error ? (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-700/60 bg-rose-950/40 p-3 text-sm text-rose-200">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <p>{(summaryQuery.error as Error).message}</p>
          </div>
        ) : null}

        {data?.warnings?.length ? (
          <div className="mb-4 rounded-xl border border-amber-700/60 bg-amber-950/40 p-3 text-xs text-amber-200">
            {data.warnings.join(" ")}
          </div>
        ) : null}

        {aiSummaryQuery.data?.warnings?.length ? (
          <div className="mb-4 rounded-xl border border-amber-700/60 bg-amber-950/40 p-3 text-xs text-amber-200">
            {aiSummaryQuery.data.warnings.join(" ")}
          </div>
        ) : null}

        {aiSummaryQuery.error ? (
          <div className="mb-4 rounded-xl border border-rose-700/60 bg-rose-950/40 p-3 text-xs text-rose-200">
            AI summary request failed: {(aiSummaryQuery.error as Error).message}
          </div>
        ) : null}

        <section className="mb-4 rounded-3xl border border-slate-800 bg-slate-900/80 px-5 py-4 shadow-[0_20px_50px_rgba(0,0,0,.35)]">
          <div className="grid items-start gap-10 lg:grid-cols-[1.02fr_0.98fr]">
            <div className="pr-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-300">Cropto / Last30Days</p>
              <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Grain & Oilseeds Intelligence Desk</h1>
              <p className="mt-2 text-sm text-slate-300">Priority mode: synthesized analytics first, raw feed second.</p>
              <p className="mt-2 max-w-2xl text-sm text-slate-400">
                This panel is built for fast interpretation: tight period focus, visual distribution context, and narrative summary first.
              </p>

              <div className="mt-6 flex max-w-[620px] items-center gap-6">
                {timeframeOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      if (option.ready) setDays(option.value);
                    }}
                    className={`relative overflow-hidden w-[180px] rounded-full border px-3 py-2.5 text-xs font-semibold ${days === option.value ? "border-amber-300 bg-amber-300 text-slate-900" : option.ready ? "border-slate-700 bg-slate-900 text-slate-300" : "border-slate-800 bg-slate-950 text-slate-400"}`}
                    disabled={!option.ready}
                  >
                    {!option.ready ? (
                      <span className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-300/75 to-orange-400/75" style={{ width: `${Math.max(10, Math.round(option.progress * 100))}%` }} />
                    ) : null}
                    <span className={`relative flex items-center gap-2 ${option.ready || days === option.value ? "justify-center" : "justify-between"}`}>
                      <span>{option.label}</span>
                      {option.value !== 1 ? <span className="text-[10px] uppercase tracking-[0.08em]">{option.progressLabel}</span> : null}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-0 lg:border-l lg:border-slate-800/70 lg:pl-10">
              <div className="grid gap-4 md:grid-cols-[92px_1fr] md:items-start">
                <div>
                  <div className="mb-2">
                    <p className="text-sm font-semibold text-slate-100">Distribution</p>
                    <p className="mt-1 text-xl font-semibold text-slate-100">
                      {shortModeLabel(analyticsTab)}
                    </p>
                  </div>
                  <div className="grid gap-2">
                    {(["sources", "commodities", "regions", "languages"] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setAnalyticsTab(tab)}
                        className={`w-[86px] rounded-xl border px-2 py-1.5 text-xs font-semibold ${analyticsTab === tab ? "border-cyan-300 bg-cyan-300 text-slate-900" : "border-slate-700 bg-slate-950 text-slate-300"}`}
                      >
                        {shortModeLabel(tab)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="-mt-2">
                  <DistributionPanel entries={infographicEntries} mode={analyticsTab} />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-4 grid gap-3">
          <SummaryCard
            title={`Summary EN - ${periodLabel}`}
            summary={enSummary}
            trend={enTrend}
            aiChart={aiSummaryQuery.data?.en?.chart}
            filename={`summary-en-${days}d.txt`}
            items={enItems}
            language="en"
            days={days}
            dashboardQuotes={enDashboardQuotes}
          />
          <SummaryCard
            title={`Summary UK - ${periodLabel}`}
            summary={ukSummary}
            trend={ukTrend}
            aiChart={aiSummaryQuery.data?.uk?.chart}
            filename={`summary-uk-${days}d.txt`}
            items={ukItems}
            language="uk"
            days={days}
            dashboardQuotes={ukDashboardQuotes}
          />
        </section>

        <section className="rounded-2xl border border-slate-800/80 bg-slate-900/70 p-4">
          <button
            onClick={() => setFeedOpen((prev) => !prev)}
            className="mb-3 flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-left"
          >
            <span className="text-sm font-semibold">Market Signal Feed</span>
            <span className="text-xs text-slate-400">
              {filteredFeed.length} records {feedOpen ? <ChevronDown className="ml-1 inline h-4 w-4" /> : <ChevronRight className="ml-1 inline h-4 w-4" />}
            </span>
          </button>

          {feedOpen ? (
            <>
              <div className="mb-3 grid gap-2 md:grid-cols-5">
                <label className="text-xs text-slate-300">Region
                  <select value={feedRegion} onChange={(e) => setFeedRegion(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100">
                    {feedRegions.map((opt) => <option key={opt} value={opt}>{formatRegion(opt)}</option>)}
                  </select>
                </label>
                <label className="text-xs text-slate-300">Language
                  <select value={feedLang} onChange={(e) => setFeedLang(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100">
                    {feedLangs.map((opt) => <option key={opt} value={opt}>{opt.toUpperCase()}</option>)}
                  </select>
                </label>
                <label className="text-xs text-slate-300">Commodity
                  <select value={feedCommodity} onChange={(e) => setFeedCommodity(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100">
                    {feedCommodities.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </label>
                <label className="text-xs text-slate-300">Source
                  <select value={feedSource} onChange={(e) => setFeedSource(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100">
                    {feedSources.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </label>
                <label className="text-xs text-slate-300">Search
                  <input value={feedSearch} onChange={(e) => setFeedSearch(e.target.value)} placeholder="headline/source" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100" />
                </label>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-left text-[11px] uppercase tracking-[0.12em] text-slate-400">
                      <th className="px-2 py-2">Date</th>
                      <th className="px-2 py-2">Commodity</th>
                      <th className="px-2 py-2">Region</th>
                      <th className="px-2 py-2">Lang</th>
                      <th className="px-2 py-2">Signal</th>
                      <th className="px-2 py-2">Impact</th>
                      <th className="px-2 py-2">Headline</th>
                      <th className="px-2 py-2">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFeed.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-2 py-5 text-center text-sm text-slate-400">No records in this filter scope.</td>
                      </tr>
                    ) : (
                      filteredFeed.map((item) => (
                        <tr key={item.id} className="border-b border-slate-800/70 align-top text-slate-200">
                          <td className="px-2 py-2 text-xs text-slate-400">{formatDate(item.publishedAt)}</td>
                          <td className="px-2 py-2 capitalize">{item.commodity}</td>
                          <td className="px-2 py-2">{formatRegion(item.region)}</td>
                          <td className="px-2 py-2 uppercase">{item.language}</td>
                          <td className={`px-2 py-2 font-semibold ${item.signal === "bullish" ? "text-emerald-400" : item.signal === "bearish" ? "text-rose-400" : "text-amber-300"}`}>
                            {formatSignal(item.signal)}
                          </td>
                          <td className="px-2 py-2 font-mono">{item.impact.toFixed(2)}</td>
                          <td className="px-2 py-2 text-sm text-slate-200">
                            <div className="group relative max-w-[900px]">
                              <div
                                className="line-clamp-2 leading-6 text-slate-200"
                                title={normalizeFeedTitle(item)}
                              >
                                {normalizeFeedTitle(item)}
                              </div>
                              <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-[min(680px,calc(100vw-8rem))] rounded-xl border border-slate-700 bg-slate-950/98 p-3 text-sm leading-6 text-slate-100 shadow-[0_16px_44px_rgba(0,0,0,.48)] group-hover:block">
                                <div className="mb-2 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.12em] text-slate-400">
                                  <span>Full headline</span>
                                  <span>{extractHostnameLabel(item.url)}</span>
                                </div>
                                <div className="text-sm leading-6 text-slate-100">{normalizeFeedTitle(item)}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            <a
                              href={item.url || "#"}
                              target="_blank"
                              rel="noreferrer"
                              className={`inline-flex min-w-[48px] items-center justify-center rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors hover:border-cyan-400 ${sourceBadgeMeta(item.source).className}`}
                            >
                              {sourceBadgeMeta(item.source).label}
                            </a>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
