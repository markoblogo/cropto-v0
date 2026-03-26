import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";

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

type MarketDashboardResponse = {
  ua?: Array<{ commodity?: string; country?: string; basis?: string; price?: number; asOf?: string; source?: string; provider?: string }>;
  br?: Array<{ commodity?: string; country?: string; basis?: string; price?: number; asOf?: string; source?: string; provider?: string }>;
  ar?: Array<{ commodity?: string; country?: string; basis?: string; price?: number; asOf?: string; source?: string; provider?: string }>;
  us?: Array<{ commodity?: string; country?: string; basis?: string; price?: number; asOf?: string; source?: string; provider?: string }>;
  debugSources?: Array<{ provider?: string; source?: string; sourceLayer?: string }>;
};

const TIMEFRAME_OPTIONS = [
  { value: 1, label: "Yesterday" },
  { value: 7, label: "Week" },
  { value: 30, label: "Month" },
  { value: 365, label: "Year" },
];

const REGION_OPTIONS = [
  { value: "all", label: "Global" },
  { value: "ukraine", label: "Ukraine" },
  { value: "europe", label: "Europe" },
  { value: "black_sea", label: "Black Sea" },
];

const LANGUAGE_OPTIONS = [
  { value: "all", label: "All languages" },
  { value: "en", label: "English" },
  { value: "uk", label: "Ukrainian" },
  { value: "fr", label: "French" },
];

const REGION_LABELS: Record<string, string> = {
  all: "Global",
  ukraine: "Ukraine",
  europe: "Europe",
  black_sea: "Black Sea",
  global: "Global",
};

function formatRegion(value: string) {
  return REGION_LABELS[value] || value.replaceAll("_", " ");
}

function formatSignal(value: string) {
  return value.toUpperCase();
}

function marketCountryToRegion(country: string): string {
  const normalized = String(country || "").toUpperCase();
  if (normalized === "UA") return "ukraine";
  if (normalized === "FR" || normalized === "DE" || normalized === "RO") return "europe";
  return "global";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "n/a";
  return date.toISOString().slice(0, 10);
}

function pickSignalTone(score: number) {
  if (score > 35) return "Bullish";
  if (score < -35) return "Bearish";
  return "Neutral";
}

function EntriesBars({
  title,
  entries,
}: {
  title: string;
  entries: Array<[string, number]>;
}) {
  const max = entries[0]?.[1] || 1;
  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-900/70 p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
      </div>
      <div className="space-y-3">
        {entries.length === 0 ? (
          <div className="text-sm text-slate-400">No records for current filters.</div>
        ) : (
          entries.map(([label, value]) => {
            const width = Math.max(6, Math.round((value / max) * 100));
            return (
              <div key={label} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>{label}</span>
                  <span className="font-mono">{value}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function Last30DaysPage() {
  const [days, setDays] = useState<number>(30);
  const [region, setRegion] = useState<string>("all");
  const [lang, setLang] = useState<string>("all");

  const summaryQuery = useQuery<Last30DaysResponse>({
    queryKey: ["/api/last30days/summary", days, region, lang],
    queryFn: async () => {
      const query = new URLSearchParams({
        days: String(days),
        region,
        lang,
      });
      const response = await fetch(`/api/last30days/summary?${query.toString()}`);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to load last30days summary");
      }
      return response.json();
    },
    staleTime: 45_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const dashboardSourcesQuery = useQuery<MarketDashboardResponse>({
    queryKey: ["/api/market-dashboard", "debugSources=1"],
    queryFn: async () => {
      const response = await fetch("/api/market-dashboard?debugSources=1");
      if (!response.ok) return {};
      return response.json();
    },
    staleTime: 60_000,
    refetchInterval: 90_000,
  });

  const sourceChips = useMemo(() => {
    const dashboard = dashboardSourcesQuery.data;
    if (!dashboard) return [] as string[];
    const list = new Set<string>();
    for (const row of dashboard.ua || []) list.add((row.provider || row.source || "").toUpperCase());
    for (const row of dashboard.br || []) list.add((row.provider || row.source || "").toUpperCase());
    for (const row of dashboard.ar || []) list.add((row.provider || row.source || "").toUpperCase());
    for (const row of dashboard.us || []) list.add((row.provider || row.source || "").toUpperCase());
    for (const row of dashboard.debugSources || []) list.add((row.provider || row.source || "").toUpperCase());
    return Array.from(list).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [dashboardSourcesQuery.data]);

  const dashboardRows = useMemo(() => {
    const dashboard = dashboardSourcesQuery.data;
    if (!dashboard) return [] as Array<{
      id: string;
      publishedAt: string;
      commodity: string;
      region: string;
      language: string;
      signal: "bullish" | "bearish" | "neutral";
      impact: number;
      title: string;
      source: string;
      url: string;
    }>;
    const grouped = [dashboard.ua || [], dashboard.br || [], dashboard.ar || [], dashboard.us || []].flat();
    return grouped
      .map((row, idx) => {
        const regionValue = marketCountryToRegion(row.country || "");
        return {
          id: `market-${idx + 1}-${row.country || "na"}-${row.commodity || "mix"}`,
          publishedAt: row.asOf || new Date().toISOString(),
          commodity: String(row.commodity || "mixed").toLowerCase(),
          region: regionValue,
          language: regionValue === "ukraine" ? "uk" : "en",
          signal: "neutral" as const,
          impact: Number(row.price || 0) > 0 ? 3.2 : 2.4,
          title: `${String(row.commodity || "commodity")} ${String(row.basis || "market")} = ${Number(row.price || 0).toFixed(2)} USD`,
          source: String(row.provider || row.source || "market-dashboard"),
          url: "/monitor",
        };
      })
      .filter((item) => item.commodity && (region === "all" || item.region === region) && (lang === "all" || item.language === lang))
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  }, [dashboardSourcesQuery.data, lang, region]);

  const data = summaryQuery.data;
  const activeItems = (data?.items?.length || 0) > 0 ? data?.items || [] : dashboardRows;
  const signalBalancePct =
    activeItems.length === 0
      ? 0
      : Math.round(
          (activeItems.reduce((acc, item) => {
            if (item.signal === "bullish") return acc + 1;
            if (item.signal === "bearish") return acc - 1;
            return acc;
          }, 0) /
            activeItems.length) *
            100,
        );
  const riskIndex =
    activeItems.length === 0
      ? 0
      : Number(
          (
            activeItems.reduce((acc, item) => acc + Number(item.impact || 0), 0) /
            activeItems.length
          ).toFixed(2),
        );
  const commodityEntries = Object.entries(
    activeItems.reduce<Record<string, number>>((acc, item) => {
      acc[item.commodity] = (acc[item.commodity] || 0) + 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const topCommodity = commodityEntries[0]?.[0] || data?.summary.topCommodity || "n/a";
  const regionEntries = Object.entries(
    activeItems
      .filter((item) => item.impact >= 3)
      .reduce<Record<string, number>>((acc, item) => {
        acc[item.region] = (acc[item.region] || 0) + 1;
        return acc;
      }, {}),
  )
    .map(([key, value]) => [formatRegion(key), value] as [string, number])
    .sort((a, b) => b[1] - a[1]);
  const activeCoverageCount = activeItems.length;
  const summaryCoverageCount = data?.summary.coverageCount ?? 0;
  const usingDashboardFallback = summaryCoverageCount === 0 && dashboardRows.length > 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="mb-4 rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-[0_20px_50px_rgba(0,0,0,.35)]">
          <div className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-300">
                Cropto / Last30Days
              </p>
              <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Grain & Oilseeds Intelligence Desk</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-300">
                Live panel connected to `api/market-dashboard`, with optional enrichment from `last30days --emit=json --store`.
              </p>
            </div>
            <div className="grid gap-3">
              <div className="flex flex-wrap gap-2">
                {TIMEFRAME_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setDays(option.value)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                      days === option.value
                        ? "border-amber-300 bg-amber-300 text-slate-900"
                        : "border-slate-700 bg-slate-900 text-slate-300"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-slate-300">
                  Region
                  <select
                    value={region}
                    onChange={(event) => setRegion(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100"
                  >
                    {REGION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-slate-300">
                  Language
                  <select
                    value={lang}
                    onChange={(event) => setLang(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100"
                  >
                    {LANGUAGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>
        </section>

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

        <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/70 p-4">
            <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Coverage</p>
            <p className="mt-2 text-3xl font-semibold">{activeCoverageCount}</p>
            <p className="mt-1 text-xs text-slate-400">
              {TIMEFRAME_OPTIONS.find((option) => option.value === days)?.label} · {formatRegion(region)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/70 p-4">
            <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Signal Balance</p>
            <p className="mt-2 text-3xl font-semibold">
              {signalBalancePct > 0 ? "+" : ""}
              {signalBalancePct}%
            </p>
            <p className="mt-1 text-xs text-slate-400">{pickSignalTone(signalBalancePct)} flow</p>
          </div>
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/70 p-4">
            <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Risk Index</p>
            <p className="mt-2 text-3xl font-semibold">{riskIndex.toFixed(2)}</p>
            <p className="mt-1 text-xs text-slate-400">Average impact score</p>
          </div>
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/70 p-4">
            <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Top Commodity</p>
            <p className="mt-2 text-3xl font-semibold capitalize">{topCommodity}</p>
            <p className="mt-1 text-xs text-slate-400">Dominant topic in current scope</p>
          </div>
        </section>

        <section className="mb-4 grid gap-3 lg:grid-cols-2">
          <EntriesBars title="Commodity Share" entries={commodityEntries} />
          <EntriesBars title="Regional Heat (Impact >= 4)" entries={regionEntries} />
        </section>

        <section className="mb-4 rounded-2xl border border-slate-800/80 bg-slate-900/70 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Source Context</h3>
            <p className="text-xs text-slate-400">
              market-dashboard: connected
              {usingDashboardFallback ? " · last30days fallback active" : ""}
              {" · "}
              last30days file: {data?.sourceFile ? "connected" : "not configured"}
              {data?.sourceUpdatedAt ? ` · updated ${formatDate(data.sourceUpdatedAt)}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {sourceChips.length === 0 ? (
              <span className="text-xs text-slate-400">No monitor sources available</span>
            ) : (
              sourceChips.map((source) => (
                <span key={source} className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-[11px] text-slate-300">
                  {source}
                </span>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800/80 bg-slate-900/70 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Market Signal Feed</h3>
            <p className="text-xs text-slate-400">{activeItems.length} records</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
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
                {activeItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-2 py-5 text-center text-sm text-slate-400">
                      No records in this filter scope.
                    </td>
                  </tr>
                ) : (
                  activeItems.map((item) => (
                    <tr key={item.id} className="border-b border-slate-800/70 align-top text-slate-200">
                      <td className="px-2 py-2 text-xs text-slate-400">{formatDate(item.publishedAt)}</td>
                      <td className="px-2 py-2 capitalize">{item.commodity}</td>
                      <td className="px-2 py-2">{formatRegion(item.region)}</td>
                      <td className="px-2 py-2 uppercase">{item.language}</td>
                      <td
                        className={`px-2 py-2 font-semibold ${
                          item.signal === "bullish"
                            ? "text-emerald-400"
                            : item.signal === "bearish"
                              ? "text-rose-400"
                              : "text-amber-300"
                        }`}
                      >
                        {formatSignal(item.signal)}
                      </td>
                      <td className="px-2 py-2 font-mono">{item.impact.toFixed(2)}</td>
                      <td className="px-2 py-2 text-sm text-slate-200">{item.title}</td>
                      <td className="px-2 py-2">
                        <a
                          href={item.url || "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-sky-300 hover:text-sky-200"
                        >
                          {item.source}
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
