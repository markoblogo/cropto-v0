import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, ArrowRight, ShieldAlert, TrendingDown, TrendingUp } from "lucide-react";
import { MainLayout } from "@/components/layouts/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type MonitorItem = {
  id: string;
  title: string;
  summary?: string;
  url: string;
  source_name: string;
  published_at: string;
  topic_tags: string[];
  crop_tags: string[];
  region_tags: string[];
  relevance_score: number;
};

type MonitorResponse = {
  generatedAt: string;
  filters: {
    threshold?: number;
  };
  topSignals: MonitorItem[];
  feed: MonitorItem[];
  sidePanels: { logistics: MonitorItem[]; policy: MonitorItem[] };
};

type MonitorIndex = {
  slug: string;
  name: string;
  value: number;
  change?: number;
  updatedAt: string;
  source: string;
};

type IndicesResponse = {
  enabled: boolean;
  items: MonitorIndex[];
  note?: string;
};

type FxResponse = {
  enabled: boolean;
  mode: "live" | "coming_soon";
  message?: string;
  asOf?: string;
  source?: string;
  rates: Array<{ currency: string; usdPerUnit: number }>;
};

type DebugResponse = {
  generatedAt: string;
  sourcesTotal: number;
  sourcesEnabled: number;
  itemsFetchedLast24h: number;
  itemsAfterFiltering: number;
  duplicatesRemoved: number;
  topSourcesByRelevantItems: Array<{ sourceId: string; count: number }>;
  noisySources: Array<{ sourceId: string; count: number }>;
};

type SignalType = "Harvest" | "Export" | "Logistics" | "Policy" | "Weather" | "Futures" | "Markets";
type Impact = "High" | "Medium" | "Low";

const CROPS = ["all", "wheat", "corn", "soy", "rapeseed", "sunflower", "barley", "oilseeds"] as const;
const TOPICS = ["all", "markets", "trade", "logistics", "weather", "policy", "harvest"] as const;
const REGIONS = ["all", "black sea", "eu", "us", "latam", "asia"] as const;
const HERO_CROPS = ["wheat", "corn", "soy", "rapeseed", "sunflower"] as const;

type HeroCrop = (typeof HERO_CROPS)[number];

function asLabel(value: string): string {
  if (value === "black sea") return "Black Sea";
  if (value === "latam") return "LatAm";
  if (value === "us") return "US";
  if (value === "eu") return "EU";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatRelative(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "n/a";
  const diffMinutes = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const hours = Math.floor(diffMinutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function inLastHours(item: MonitorItem, hours: number): boolean {
  const ts = Date.parse(item.published_at);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts <= hours * 60 * 60 * 1000;
}

function inRegion(item: MonitorItem, region: string): boolean {
  const tags = item.region_tags.join(" ");
  if (region === "latam") return tags.includes("brazil") || tags.includes("argentina");
  if (region === "asia") return tags.includes("china") || tags.includes("india");
  return tags.includes(region);
}

function classifySignalType(item: MonitorItem): SignalType {
  const text = `${item.title} ${item.summary || ""}`.toLowerCase();
  const topics = new Set(item.topic_tags.map((t) => t.toLowerCase()));

  if (topics.has("harvest")) return "Harvest";
  if (topics.has("logistics")) return "Logistics";
  if (topics.has("policy")) return "Policy";
  if (topics.has("weather")) return "Weather";
  if (text.includes("futures") || text.includes("basis")) return "Futures";
  if (text.includes("export") || text.includes("import") || text.includes("tender") || topics.has("trade")) return "Export";
  return "Markets";
}

function classifyImpact(item: MonitorItem): Impact {
  const score = item.relevance_score;
  if (score >= 10) return "High";
  if (score >= 6) return "Medium";
  return "Low";
}

function whyItMatters(item: MonitorItem, signalType: SignalType): string {
  const crop = item.crop_tags[0] ? asLabel(item.crop_tags[0]) : "grain markets";
  const region = item.region_tags[0] ? asLabel(item.region_tags[0]) : "key corridors";

  switch (signalType) {
    case "Harvest":
      return `Harvest flow changes can shift near-term ${crop} availability and basis behavior.`;
    case "Export":
      return `Trade flow updates can reprice ${crop} routes and export competitiveness in ${region}.`;
    case "Logistics":
      return `Logistics friction can widen spreads and alter delivery assumptions for ${crop}.`;
    case "Policy":
      return `Policy changes can re-route risk and liquidity across ${region} markets.`;
    case "Weather":
      return `Weather stress may affect production expectations and risk premiums in ${region}.`;
    case "Futures":
      return `Futures/basis shifts can change hedge efficiency for ${crop} exposures.`;
    default:
      return `This signal can influence short-term pricing and hedge decisions for ${crop}.`;
  }
}

function SignalTag({ value, kind }: { value: string; kind: "crop" | "topic" | "region" }) {
  const base = "text-[10px] font-medium px-2 py-0.5 rounded-full border";
  const classes =
    kind === "crop"
      ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
      : kind === "region"
        ? "border-blue-400/40 bg-blue-400/10 text-blue-100"
        : "border-amber-400/40 bg-amber-400/10 text-amber-100";

  return <span className={`${base} ${classes}`}>{asLabel(value)}</span>;
}

function ImpactBadge({ impact }: { impact: Impact }) {
  const styles =
    impact === "High"
      ? "border-red-400/55 bg-red-500/20 text-red-100"
      : impact === "Medium"
        ? "border-amber-400/55 bg-amber-500/20 text-amber-100"
        : "border-emerald-400/55 bg-emerald-500/20 text-emerald-100";
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles}`}>{impact}</span>;
}

function SignalCard({ item }: { item: MonitorItem }) {
  const signalType = classifySignalType(item);
  const impact = classifyImpact(item);

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className="group block rounded-xl border border-white/12 bg-slate-900/75 p-3 transition-all hover:-translate-y-0.5 hover:border-primary/55 hover:shadow-[0_8px_24px_rgba(154,163,58,0.2)]"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <Badge className="border-primary/45 bg-primary/15 text-[10px] uppercase tracking-wide text-primary-foreground">
          {signalType}
        </Badge>
        <ImpactBadge impact={impact} />
      </div>
      <p className="text-sm font-semibold leading-6 text-slate-100">{item.title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-300/90 line-clamp-2">{whyItMatters(item, signalType)}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {item.crop_tags.slice(0, 2).map((tag) => (
          <SignalTag key={`crop-${item.id}-${tag}`} value={tag} kind="crop" />
        ))}
        {item.topic_tags.slice(0, 2).map((tag) => (
          <SignalTag key={`topic-${item.id}-${tag}`} value={tag} kind="topic" />
        ))}
        {item.region_tags.slice(0, 1).map((tag) => (
          <SignalTag key={`region-${item.id}-${tag}`} value={tag} kind="region" />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
        <span className="truncate">{item.source_name}</span>
        <span>{formatRelative(item.published_at)}</span>
      </div>
    </a>
  );
}

export default function MonitorPage() {
  const [crop, setCrop] = useState("all");
  const [topic, setTopic] = useState("all");
  const [region, setRegion] = useState("all");
  const [time, setTime] = useState<"24h" | "7d">("24h");
  const [search, setSearch] = useState("");
  const [threshold, setThreshold] = useState(3);
  const [expandedPanel, setExpandedPanel] = useState<string | null>(null);

  const debugEnabled = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("debug") === "1";
  }, []);

  const monitorQuery = useQuery<MonitorResponse>({
    queryKey: ["monitor-news", crop, topic, region, time, search, threshold],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("crop", crop);
      params.set("topic", topic);
      params.set("region", region);
      params.set("time", time);
      params.set("threshold", String(threshold));
      if (search.trim()) params.set("search", search.trim());
      const response = await fetch(`/api/monitor/news?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to load monitor feed");
      return response.json();
    },
    refetchInterval: 2 * 60 * 1000,
  });

  const indicesQuery = useQuery<IndicesResponse>({
    queryKey: ["monitor-indices"],
    queryFn: async () => {
      const response = await fetch("/api/monitor/indices");
      if (!response.ok) throw new Error("Failed to load indices");
      return response.json();
    },
    refetchInterval: 60 * 1000,
  });

  const fxQuery = useQuery<FxResponse>({
    queryKey: ["monitor-fx"],
    queryFn: async () => {
      const response = await fetch("/api/monitor/macro-fx");
      if (!response.ok) throw new Error("Failed to load macro snapshot");
      return response.json();
    },
    refetchInterval: 10 * 60 * 1000,
  });

  const debugQuery = useQuery<DebugResponse>({
    queryKey: ["monitor-debug"],
    enabled: debugEnabled,
    queryFn: async () => {
      const response = await fetch("/api/monitor/debug");
      if (!response.ok) throw new Error("Failed to load debug stats");
      return response.json();
    },
    refetchInterval: 2 * 60 * 1000,
  });

  const feed = monitorQuery.data?.feed || [];
  const topSignals = monitorQuery.data?.topSignals || [];

  const pulseByCrop = useMemo(() => {
    return HERO_CROPS.map((cropName) => {
      const total = feed.filter((item) => item.crop_tags.includes(cropName)).length;
      const now24h = feed.filter((item) => item.crop_tags.includes(cropName) && inLastHours(item, 24)).length;
      const prev24h = feed.filter((item) => {
        if (!item.crop_tags.includes(cropName)) return false;
        const ts = Date.parse(item.published_at);
        if (!Number.isFinite(ts)) return false;
        const diff = Date.now() - ts;
        return diff > 24 * 60 * 60 * 1000 && diff <= 48 * 60 * 60 * 1000;
      }).length;
      const delta = now24h - prev24h;
      const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
      return { crop: cropName, total, now24h, delta, direction };
    });
  }, [feed]);

  const blackSeaRisks = useMemo(() => {
    return [...feed]
      .filter((item) => {
        const txt = `${item.title} ${item.summary || ""}`.toLowerCase();
        const regionHit =
          item.region_tags.some((tag) =>
            ["black sea", "ukraine", "russia", "romania", "bulgaria", "poland"].some((needle) =>
              tag.includes(needle),
            ),
          ) || ["black sea", "ukraine", "russia", "romania", "bulgaria", "poland"].some((needle) => txt.includes(needle));
        const riskTopic = item.topic_tags.some((tag) => ["logistics", "policy", "weather", "trade"].includes(tag));
        return regionHit && riskTopic;
      })
      .sort((a, b) => b.relevance_score - a.relevance_score || Date.parse(b.published_at) - Date.parse(a.published_at))
      .slice(0, 6);
  }, [feed]);

  const cropVolumeData = useMemo(() => {
    return HERO_CROPS.map((cropName) => ({
      name: asLabel(cropName),
      count: feed.filter((item) => item.crop_tags.includes(cropName)).length,
    }));
  }, [feed]);

  const topicVolumeData = useMemo(() => {
    return TOPICS.filter((v) => v !== "all").map((topicName) => ({
      name: asLabel(topicName),
      count: feed.filter((item) => item.topic_tags.includes(topicName)).length,
    }));
  }, [feed]);

  const regionVolumeData = useMemo(() => {
    return REGIONS.filter((v) => v !== "all").map((regionName) => ({
      name: asLabel(regionName),
      count: feed.filter((item) => inRegion(item, regionName)).length,
    }));
  }, [feed]);

  const mentionsTrendData = useMemo(() => {
    const buckets: Array<{ day: string; count: number }> = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const dayDate = new Date(Date.now() - offset * 24 * 60 * 60 * 1000);
      const day = dayDate.toISOString().slice(5, 10);
      const start = new Date(dayDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(dayDate);
      end.setHours(23, 59, 59, 999);
      const count = feed.filter((item) => {
        const ts = Date.parse(item.published_at);
        return Number.isFinite(ts) && ts >= start.getTime() && ts <= end.getTime();
      }).length;
      buckets.push({ day, count });
    }
    return buckets;
  }, [feed]);

  const panelItems = useMemo(() => {
    const markets = feed.filter((item) => item.topic_tags.some((tag) => ["markets", "trade", "harvest"].includes(tag)));
    const logistics = feed.filter((item) => item.topic_tags.includes("logistics"));
    const policy = feed.filter((item) => item.topic_tags.some((tag) => ["policy", "trade"].includes(tag)));
    const weather = feed.filter((item) => item.topic_tags.includes("weather"));
    const blackSea = feed.filter((item) => inRegion(item, "black sea") || inRegion(item, "eu") || inRegion(item, "latam") === false && inRegion(item, "us") === false);
    const oilseedsBiofuels = feed.filter((item) => {
      const txt = `${item.title} ${item.summary || ""}`.toLowerCase();
      return item.crop_tags.some((tag) => ["soy", "rapeseed", "sunflower", "oilseeds"].includes(tag)) || txt.includes("biofuel");
    });

    return {
      markets,
      logistics,
      policy,
      weather,
      blackSea,
      oilseedsBiofuels,
    };
  }, [feed]);

  const panels = [
    { id: "markets", title: "Markets", items: panelItems.markets },
    { id: "logistics", title: "Logistics", items: panelItems.logistics },
    { id: "policy", title: "Policy & Trade", items: panelItems.policy },
    { id: "weather", title: "Weather Watch", items: panelItems.weather },
    { id: "blackSea", title: "Black Sea", items: panelItems.blackSea },
    { id: "oilseedsBiofuels", title: "Oilseeds / Biofuels", items: panelItems.oilseedsBiofuels },
  ] as const;

  return (
    <MainLayout>
      <section className="rounded-2xl border border-primary/30 bg-[radial-gradient(circle_at_top_left,rgba(154,163,58,0.18),rgba(10,14,26,0.95)_45%)] p-4 text-slate-100 shadow-[0_24px_50px_rgba(0,0,0,0.45)] sm:p-6">
        <div className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-2">
              <Badge className="border-primary/40 bg-primary/12 text-[10px] uppercase tracking-[0.18em] text-primary-foreground">Cropto Monitor</Badge>
              <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Commodity Signals Terminal</h1>
              <p className="max-w-3xl text-sm text-slate-300 sm:text-base">
                Operational signal view for grains and oilseeds across markets, logistics, policy, and Black Sea risk corridors.
              </p>
            </div>
            <div className="text-xs text-slate-400">
              Updated: {monitorQuery.data?.generatedAt ? new Date(monitorQuery.data.generatedAt).toLocaleString() : "loading"}
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-12">
            <Card className="xl:col-span-5 border-white/12 bg-slate-950/70 text-slate-100">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Market Pulse</CardTitle>
                <CardDescription className="text-slate-400">24h directional intensity by crop</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-2">
                {pulseByCrop.map((entry) => (
                  <div key={entry.crop} className="rounded-lg border border-white/10 bg-slate-900/80 p-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">{asLabel(entry.crop)}</p>
                      {entry.direction === "up" ? (
                        <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                      ) : entry.direction === "down" ? (
                        <TrendingDown className="h-3.5 w-3.5 text-red-400" />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                      )}
                    </div>
                    <p className="mt-1 text-xl font-semibold text-white">{entry.now24h}</p>
                    <p className="text-[11px] text-slate-400">Signals 24h • total {entry.total}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="xl:col-span-4 border-primary/40 bg-slate-950/80 text-slate-100 shadow-[0_0_0_1px_rgba(154,163,58,0.25)]">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-lg">Cropto UA Indices</CardTitle>
                  <Badge className="border-primary/40 bg-primary/15 text-primary-foreground">Core</Badge>
                </div>
                <CardDescription className="text-slate-400">Internal index feed</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2">
                {!indicesQuery.data?.enabled ? (
                  <p className="text-sm text-slate-400">Coming soon</p>
                ) : indicesQuery.data?.items?.length ? (
                  indicesQuery.data.items.slice(0, 6).map((item) => (
                    <div key={item.slug} className="rounded-lg border border-white/12 bg-slate-900/85 p-2.5">
                      <p className="text-xs font-semibold text-slate-200 line-clamp-1">{item.name}</p>
                      <div className="mt-1 flex items-end justify-between">
                        <p className="text-xl font-bold text-white">${item.value.toFixed(2)}</p>
                        <p className={`text-xs font-semibold ${item.change != null && item.change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {item.change != null ? `${item.change >= 0 ? "+" : ""}${item.change.toFixed(2)}` : "n/a"}
                        </p>
                      </div>
                      <p className="mt-1 text-[10px] text-slate-400">{formatRelative(item.updatedAt)} • {item.source}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-400">No index snapshots available yet.</p>
                )}
              </CardContent>
            </Card>

            <div className="xl:col-span-3 grid gap-4">
              <Card className="border-red-400/30 bg-slate-950/75 text-slate-100">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-red-400" />
                    <CardTitle className="text-base">Black Sea Watch</CardTitle>
                  </div>
                  <CardDescription className="text-slate-400">Top logistics/policy/weather risks</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {blackSeaRisks.slice(0, 4).map((item) => (
                    <a key={`bs-${item.id}`} href={item.url} target="_blank" rel="noreferrer" className="block rounded-md border border-white/10 bg-slate-900/80 p-2 hover:border-red-400/35">
                      <p className="line-clamp-2 text-xs font-medium text-slate-100">{item.title}</p>
                      <p className="mt-1 text-[10px] text-slate-400">{classifySignalType(item)} • {formatRelative(item.published_at)}</p>
                    </a>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-white/12 bg-slate-950/65 text-slate-100">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Macro / FX Snapshot</CardTitle>
                </CardHeader>
                <CardContent>
                  {fxQuery.data?.mode === "live" && fxQuery.data.rates.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {fxQuery.data.rates.slice(0, 4).map((rate) => (
                        <div key={rate.currency} className="rounded-md border border-white/10 bg-slate-900/75 p-2">
                          <p className="text-[10px] text-slate-400">{rate.currency}</p>
                          <p className="text-sm font-semibold text-white">{rate.usdPerUnit.toFixed(4)}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">Coming soon</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Card className="border-white/10 bg-slate-950/70 text-slate-100">
              <CardHeader className="pb-1">
                <CardTitle className="text-sm">Signal Volume by Crop</CardTitle>
              </CardHeader>
              <CardContent className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cropVolumeData}>
                    <XAxis dataKey="name" hide />
                    <YAxis hide />
                    <Tooltip />
                    <Bar dataKey="count" fill="#9AA33A" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-slate-950/70 text-slate-100">
              <CardHeader className="pb-1">
                <CardTitle className="text-sm">Signal Volume by Topic</CardTitle>
              </CardHeader>
              <CardContent className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topicVolumeData}>
                    <XAxis dataKey="name" hide />
                    <YAxis hide />
                    <Tooltip />
                    <Bar dataKey="count" fill="#F2C94C" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-slate-950/70 text-slate-100">
              <CardHeader className="pb-1">
                <CardTitle className="text-sm">Region Activity</CardTitle>
              </CardHeader>
              <CardContent className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={regionVolumeData}>
                    <XAxis dataKey="name" hide />
                    <YAxis hide />
                    <Tooltip />
                    <Bar dataKey="count" fill="#38BDF8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-slate-950/70 text-slate-100">
              <CardHeader className="pb-1">
                <CardTitle className="text-sm">Mentions Trend (7d)</CardTitle>
              </CardHeader>
              <CardContent className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={mentionsTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis dataKey="day" tick={{ fill: "#94A3B8", fontSize: 10 }} />
                    <YAxis hide />
                    <Tooltip />
                    <Line type="monotone" dataKey="count" stroke="#9AA33A" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card className="border-white/12 bg-slate-950/72 text-slate-100">
            <CardHeader>
              <CardTitle className="text-lg">Filters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-5">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Crop</p>
                  <div className="flex flex-wrap gap-1.5">
                    {CROPS.map((item) => (
                      <Button key={item} size="sm" variant={crop === item ? "default" : "outline"} onClick={() => setCrop(item)} className="h-7 px-2.5 text-xs capitalize border-white/20 text-slate-200">
                        {item}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Topic</p>
                  <div className="flex flex-wrap gap-1.5">
                    {TOPICS.map((item) => (
                      <Button key={item} size="sm" variant={topic === item ? "default" : "outline"} onClick={() => setTopic(item)} className="h-7 px-2.5 text-xs capitalize border-white/20 text-slate-200">
                        {item}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Region</p>
                  <div className="flex flex-wrap gap-1.5">
                    {REGIONS.map((item) => (
                      <Button key={item} size="sm" variant={region === item ? "default" : "outline"} onClick={() => setRegion(item)} className="h-7 px-2.5 text-xs capitalize border-white/20 text-slate-200">
                        {item}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Time</p>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant={time === "24h" ? "default" : "outline"} onClick={() => setTime("24h")} className="h-7 px-3 text-xs border-white/20 text-slate-200">
                      24h
                    </Button>
                    <Button size="sm" variant={time === "7d" ? "default" : "outline"} onClick={() => setTime("7d")} className="h-7 px-3 text-xs border-white/20 text-slate-200">
                      7d
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Search</p>
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Keyword" className="h-8 border-white/20 bg-slate-900/70 text-slate-100" />
                </div>
              </div>

              {debugEnabled ? (
                <div className="flex items-center gap-2">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Threshold</p>
                  {[2, 3, 4, 5].map((value) => (
                    <Button key={value} size="sm" variant={threshold === value ? "default" : "outline"} className="h-7 px-2.5 text-xs border-white/20 text-slate-200" onClick={() => setThreshold(value)}>
                      {value}
                    </Button>
                  ))}
                  <p className="text-xs text-slate-400">Current: {monitorQuery.data?.filters.threshold ?? threshold}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <h2 className="text-lg font-semibold text-slate-100">Top Signals</h2>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {topSignals.slice(0, 8).map((item) => (
                <SignalCard key={item.id} item={item} />
              ))}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {panels.map((panel) => {
              const expanded = expandedPanel === panel.id;
              const visibleItems = expanded ? panel.items.slice(0, 12) : panel.items.slice(0, 6);

              return (
                <Card key={panel.id} className="border-white/12 bg-slate-950/70 text-slate-100">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-sm">{panel.title}</CardTitle>
                      <Badge className="border-white/20 bg-white/5 text-[10px] text-slate-300">{panel.items.length}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {visibleItems.map((item) => (
                      <a key={`${panel.id}-${item.id}`} href={item.url} target="_blank" rel="noreferrer" className="block rounded-md border border-white/10 bg-slate-900/75 p-2 hover:border-primary/45">
                        <p className="line-clamp-2 text-xs font-medium text-slate-100">{item.title}</p>
                        <p className="mt-1 text-[10px] text-slate-400">{item.source_name} • {formatRelative(item.published_at)}</p>
                      </a>
                    ))}
                    {!panel.items.length ? <p className="text-xs text-slate-400">No items in this module for current filters.</p> : null}
                    {panel.items.length > 6 ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-primary hover:text-primary"
                        onClick={() => setExpandedPanel(expanded ? null : panel.id)}
                      >
                        {expanded ? "Collapse" : "View all"}
                      </Button>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {debugEnabled ? (
            <Card className="border-amber-500/40 bg-amber-500/10 text-slate-100">
              <CardHeader>
                <CardTitle className="text-base">Debug Dashboard</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>Sources: {debugQuery.data?.sourcesEnabled ?? "-"} / {debugQuery.data?.sourcesTotal ?? "-"}</p>
                <p>Fetched (24h): {debugQuery.data?.itemsFetchedLast24h ?? "-"}</p>
                <p>After filtering: {debugQuery.data?.itemsAfterFiltering ?? "-"}</p>
                <p>Duplicates removed: {debugQuery.data?.duplicatesRemoved ?? "-"}</p>
                <div>
                  <p className="font-medium">Top sources:</p>
                  <ul className="list-disc pl-5">
                    {(debugQuery.data?.topSourcesByRelevantItems || []).slice(0, 5).map((row) => (
                      <li key={`top-${row.sourceId}`}>{row.sourceId}: {row.count}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-medium">Noisy sources:</p>
                  <ul className="list-disc pl-5">
                    {(debugQuery.data?.noisySources || []).slice(0, 5).map((row) => (
                      <li key={`noise-${row.sourceId}`}>{row.sourceId}: {row.count}</li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </section>
    </MainLayout>
  );
}
