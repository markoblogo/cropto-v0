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
import { AlertTriangle, ArrowRight, ShieldAlert, TrendingDown, TrendingUp, Waves, TrainFront, Activity } from "lucide-react";
import { MainLayout } from "@/components/layouts/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LiveVisualsPanel } from "@/components/monitor/LiveVisualsPanel";

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
  liveVisuals?: {
    total: number;
    enabled: number;
    active: number;
    disabled: number;
    fallback: number;
    shownSourceIds: string[];
  };
  logisticsIndicators?: {
    enabled: boolean;
    refreshMs: number;
    cacheTtlMs: number;
    providers: Array<{
      id: string;
      enabled: boolean;
      status: string;
      cacheAgeSec?: number;
      lastSuccessAt?: string;
      fallbackMode: boolean;
      lastError?: string;
    }>;
  };
  grainMarkets?: {
    enabled: boolean;
    refreshMs: number;
    cacheTtlMs: number;
    providers: Array<{
      id: string;
      enabled: boolean;
      status: string;
      cacheAgeSec?: number;
      lastSuccessAt?: string;
      fallbackMode: boolean;
      lastError?: string;
    }>;
  };
};

type LogisticsIndicator = {
  id: string;
  type: "bdi" | "rail_tariff" | "logistics_pressure";
  title: string;
  subtitle: string;
  unit: string;
  valueCurrent?: number;
  valueChange?: number;
  valueChangePct?: number;
  status: "LIVE" | "REFRESH" | "DELAYED" | "FALLBACK" | "OFFLINE";
  sourceName: string;
  sourceAttribution: string;
  sourceUrl: string;
  updatedAt?: string;
  timeframe: string;
  trendLabel: "Rising" | "Building" | "Stable" | "Cooling" | "Easing" | "Elevated";
  level?: "Low" | "Moderate" | "Elevated" | "High" | "Severe";
  explanation?: string;
  components?: {
    eventIntensity: number;
    blackSeaFocus: number;
    frictionFactors: number;
    transportContext: number;
    confidence: number;
  };
  series: Array<{ ts: string; value: number }>;
  notes?: string[];
  fallbackReason?: string;
};

type LogisticsIndicatorsResponse = {
  enabled: boolean;
  widgets: LogisticsIndicator[];
  meta: {
    generatedAt: string;
    cacheAgeSec?: number;
    partialFailure?: boolean;
  };
  message?: string;
};

type GrainWidgetStatus = "LIVE" | "DELAYED" | "INDICATIVE" | "FALLBACK" | "OFFLINE";

type GrainInstrumentWidget = {
  id: string;
  venue: "CBOT/CME" | "Euronext";
  instrument: string;
  title: string;
  status: GrainWidgetStatus;
  sourceName: string;
  sourceAttribution: string;
  sourceUrl: string;
  updatedAt?: string;
  lastPrice?: number;
  changeAbs?: number;
  changePct?: number;
  timeframe: "1d" | "7d" | "indicative";
  unit: string;
  series: Array<{ ts: string; value: number }>;
  fallbackReason?: string;
};

type GrainComparisonWidget = {
  id: string;
  title: string;
  status: GrainWidgetStatus;
  sourceName: string;
  sourceAttribution: string;
  leftLabel: string;
  rightLabel: string;
  leftValue?: number;
  rightValue?: number;
  spread?: number;
  spreadPct?: number;
  note: string;
};

type GrainMarketsResponse = {
  enabled: boolean;
  widgets: GrainInstrumentWidget[];
  comparisons: GrainComparisonWidget[];
  meta: {
    generatedAt: string;
    cacheAgeSec?: number;
    partialFailure?: boolean;
  };
  message?: string;
};
type CompactSignalStatus = "Rising" | "Stable" | "Elevated" | "Cooling";

type CompactSignalWidget = {
  id: string;
  title: string;
  status: CompactSignalStatus;
  primary: string;
  secondary: string;
  note: string;
  series: Array<{ label: string; value: number }>;
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

function indicatorStatusClass(status: LogisticsIndicator["status"]) {
  if (status === "LIVE") return "border-emerald-400/45 bg-emerald-500/20 text-emerald-100";
  if (status === "REFRESH") return "border-cyan-400/45 bg-cyan-500/20 text-cyan-100";
  if (status === "DELAYED") return "border-amber-400/45 bg-amber-500/20 text-amber-100";
  if (status === "FALLBACK") return "border-blue-400/45 bg-blue-500/20 text-blue-100";
  return "border-red-400/45 bg-red-500/20 text-red-100";
}

function indicatorStatusLabel(status: LogisticsIndicator["status"]) {
  return status;
}

function grainStatusClass(status: GrainWidgetStatus) {
  if (status === "LIVE") return "border-emerald-400/45 bg-emerald-500/20 text-emerald-100";
  if (status === "DELAYED") return "border-amber-400/45 bg-amber-500/20 text-amber-100";
  if (status === "INDICATIVE") return "border-cyan-400/45 bg-cyan-500/20 text-cyan-100";
  if (status === "FALLBACK") return "border-blue-400/45 bg-blue-500/20 text-blue-100";
  return "border-red-400/45 bg-red-500/20 text-red-100";
}

function GrainInstrumentCard({ widget }: { widget: GrainInstrumentWidget }) {
  const positive = (widget.changeAbs ?? 0) >= 0;
  return (
    <Card className="border-white/12 bg-slate-950/76 text-slate-100">
      <CardContent className="space-y-2 pt-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">{widget.venue}</p>
            <p className="text-sm font-semibold text-white">{widget.title}</p>
          </div>
          <Badge className={`text-[10px] ${grainStatusClass(widget.status)}`}>{widget.status}</Badge>
        </div>

        <div className="flex items-end justify-between gap-2">
          <p className="text-2xl font-bold text-white">
            {widget.lastPrice == null ? "n/a" : widget.lastPrice.toFixed(2)}
            <span className="ml-1 text-[10px] font-medium text-slate-400">{widget.unit}</span>
          </p>
          <p className={`text-xs font-semibold ${positive ? "text-emerald-300" : "text-red-300"}`}>
            {widget.changeAbs == null ? "No delta" : `${positive ? "+" : ""}${widget.changeAbs.toFixed(2)}${widget.changePct != null ? ` (${positive ? "+" : ""}${widget.changePct.toFixed(2)}%)` : ""}`}
          </p>
        </div>

        <div className="h-12">
          {widget.series.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={widget.series}>
                <XAxis dataKey="ts" hide />
                <YAxis hide />
                <Line type="monotone" dataKey="value" stroke="#9AA33A" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center rounded-md border border-dashed border-white/20 bg-slate-900/70 text-[10px] text-slate-400">
              Unavailable
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
          <a href={widget.sourceUrl} target="_blank" rel="noreferrer" className="truncate hover:text-slate-200">
            {widget.sourceName}
          </a>
          <span>{widget.updatedAt ? formatRelative(widget.updatedAt) : widget.timeframe}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function GrainComparisonCard({ widget }: { widget: GrainComparisonWidget }) {
  const positive = (widget.spread ?? 0) >= 0;
  return (
    <Card className="border-white/10 bg-slate-950/68 text-slate-100">
      <CardContent className="space-y-2 pt-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold text-slate-200">{widget.title}</p>
          <Badge className={`text-[10px] ${grainStatusClass(widget.status)}`}>{widget.status}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300">
          <div className="rounded-md border border-white/10 bg-slate-900/70 p-2">
            <p className="text-[10px] text-slate-400">{widget.leftLabel}</p>
            <p className="mt-0.5 font-semibold text-white">{widget.leftValue == null ? "n/a" : widget.leftValue.toFixed(2)}</p>
          </div>
          <div className="rounded-md border border-white/10 bg-slate-900/70 p-2">
            <p className="text-[10px] text-slate-400">{widget.rightLabel}</p>
            <p className="mt-0.5 font-semibold text-white">{widget.rightValue == null ? "n/a" : widget.rightValue.toFixed(2)}</p>
          </div>
        </div>
        <p className={`text-xs font-semibold ${positive ? "text-emerald-300" : "text-red-300"}`}>
          Spread: {widget.spread == null ? "n/a" : `${positive ? "+" : ""}${widget.spread.toFixed(2)}`} {widget.spreadPct != null ? `(${positive ? "+" : ""}${widget.spreadPct.toFixed(2)}%)` : ""}
        </p>
        <p className="text-[10px] text-slate-500 line-clamp-2">{widget.note}</p>
      </CardContent>
    </Card>
  );
}

function IndicatorCard({ indicator }: { indicator: LogisticsIndicator }) {
  const isPositive = (indicator.valueChange ?? 0) >= 0;
  const icon =
    indicator.type === "bdi" ? <Waves className="h-3.5 w-3.5 text-primary-foreground" /> :
      indicator.type === "rail_tariff" ? <TrainFront className="h-3.5 w-3.5 text-primary-foreground" /> :
        <Activity className="h-3.5 w-3.5 text-primary-foreground" />;

  return (
    <Card className="border-white/12 bg-slate-950/72 text-slate-100">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-primary/35 bg-primary/12 p-1.5">{icon}</span>
            <div>
              <CardTitle className="text-sm leading-5">{indicator.title}</CardTitle>
              <CardDescription className="text-[11px] text-slate-400">{indicator.subtitle}</CardDescription>
            </div>
          </div>
          <Badge className={`text-[10px] uppercase tracking-wide ${indicatorStatusClass(indicator.status)}`}>
            {indicatorStatusLabel(indicator.status)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-end justify-between gap-2">
          <p className="text-2xl font-bold text-white">
            {indicator.valueCurrent == null ? "n/a" : indicator.type === "logistics_pressure" ? Math.round(indicator.valueCurrent) : indicator.valueCurrent.toFixed(2)}
            <span className="ml-1 text-xs font-medium text-slate-400">{indicator.unit}</span>
          </p>
          {indicator.valueChange != null ? (
            <p className={`text-xs font-semibold ${isPositive ? "text-emerald-300" : "text-red-300"}`}>
              {isPositive ? "+" : ""}{indicator.valueChange.toFixed(2)}
              {indicator.valueChangePct != null ? ` (${isPositive ? "+" : ""}${indicator.valueChangePct.toFixed(2)}%)` : ""}
            </p>
          ) : (
            <p className="text-xs text-slate-500">No delta</p>
          )}
        </div>

        <div className="h-16">
          {indicator.series.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={indicator.series}>
                <XAxis dataKey="ts" hide />
                <YAxis hide />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke="#9AA33A" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center rounded-md border border-dashed border-white/20 bg-slate-900/70 text-[11px] text-slate-400">
              Snapshot unavailable
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
          <a href={indicator.sourceUrl} target="_blank" rel="noreferrer" className="truncate hover:text-slate-200">
            Source: {indicator.sourceName}
          </a>
          <span>{indicator.updatedAt ? formatRelative(indicator.updatedAt) : indicator.timeframe}</span>
        </div>
        <div className="flex items-center gap-2">
          {indicator.level ? (
            <Badge className="border-primary/35 bg-primary/12 text-[10px] text-primary-foreground">{indicator.level}</Badge>
          ) : null}
          <span className="text-[10px] text-slate-400">{indicator.trendLabel}</span>
        </div>
        {indicator.components ? (
          <div className="flex flex-wrap gap-1">
            <span className="rounded-full border border-white/20 bg-white/5 px-1.5 py-0.5 text-[9px] text-slate-300">Black Sea {indicator.components.blackSeaFocus}</span>
            <span className="rounded-full border border-white/20 bg-white/5 px-1.5 py-0.5 text-[9px] text-slate-300">Friction {indicator.components.frictionFactors}</span>
            <span className="rounded-full border border-white/20 bg-white/5 px-1.5 py-0.5 text-[9px] text-slate-300">Confidence {indicator.components.confidence}</span>
          </div>
        ) : null}
        {indicator.explanation ? <p className="text-[10px] text-slate-300/90 line-clamp-2">{indicator.explanation}</p> : null}
        <p className="text-[10px] text-slate-500 line-clamp-2">{indicator.notes?.[0] || indicator.sourceAttribution}</p>
      </CardContent>
    </Card>
  );
}

function SignalCard({ item, rank }: { item: MonitorItem; rank?: number }) {
  const signalType = classifySignalType(item);
  const impact = classifyImpact(item);
  const isPriority = typeof rank === "number" && rank < 3;

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className={`group block rounded-xl border p-3 transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(154,163,58,0.2)] ${
        isPriority
          ? "border-primary/45 bg-[linear-gradient(160deg,rgba(154,163,58,0.16),rgba(10,14,26,0.86)_36%,rgba(10,14,26,0.92))] shadow-[0_0_0_1px_rgba(154,163,58,0.2)] hover:border-primary/70"
          : "border-white/12 bg-slate-900/75 hover:border-primary/55"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <Badge className={`text-[10px] uppercase tracking-wide ${isPriority ? "border-primary/55 bg-primary/20 text-primary-foreground" : "border-primary/45 bg-primary/15 text-primary-foreground"}`}>
          {signalType}
        </Badge>
        <ImpactBadge impact={impact} />
      </div>
      {isPriority ? (
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/90">Priority Signal #{rank! + 1}</p>
      ) : null}
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

function CompactWidgetCard({ widget }: { widget: CompactSignalWidget }) {
  const statusClass =
    widget.status === "Rising"
      ? "border-red-400/45 bg-red-500/20 text-red-100"
      : widget.status === "Elevated"
        ? "border-amber-400/45 bg-amber-500/20 text-amber-100"
        : widget.status === "Cooling"
          ? "border-emerald-400/45 bg-emerald-500/20 text-emerald-100"
          : "border-blue-400/45 bg-blue-500/20 text-blue-100";

  return (
    <Card className="border-white/12 bg-slate-950/74 text-slate-100">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm">{widget.title}</CardTitle>
          <Badge className={`text-[10px] uppercase tracking-wide ${statusClass}`}>{widget.status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-end justify-between gap-2">
          <p className="text-xl font-bold text-white">{widget.primary}</p>
          <p className="text-xs text-slate-300">{widget.secondary}</p>
        </div>
        <div className="h-10">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={widget.series}>
              <XAxis dataKey="label" hide />
              <YAxis hide />
              <Line type="monotone" dataKey="value" stroke="#9AA33A" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[10px] text-slate-400">{widget.note}</p>
      </CardContent>
    </Card>
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
  const [chartWindow, setChartWindow] = useState<"24h" | "7d">("24h");

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

  const logisticsIndicatorsQuery = useQuery<LogisticsIndicatorsResponse>({
    queryKey: ["monitor-logistics-indicators"],
    queryFn: async () => {
      const response = await fetch("/api/monitor/logistics-indicators");
      if (!response.ok) throw new Error("Failed to load logistics indicators");
      return response.json();
    },
    refetchInterval: 5 * 60 * 1000,
  });

  const grainMarketsQuery = useQuery<GrainMarketsResponse>({
    queryKey: ["monitor-grain-markets-core"],
    queryFn: async () => {
      const response = await fetch("/api/monitor/grain-markets");
      if (!response.ok) throw new Error("Failed to load grain markets core");
      return response.json();
    },
    refetchInterval: 5 * 60 * 1000,
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
  const prioritySignals = topSignals.slice(0, 3);
  const chartFeed = useMemo(() => {
    if (chartWindow === "24h") return feed.filter((item) => inLastHours(item, 24));
    return feed.filter((item) => inLastHours(item, 24 * 7));
  }, [chartWindow, feed]);

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

  const blackSeaSignals = useMemo(() => {
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
      .sort((a, b) => b.relevance_score - a.relevance_score || Date.parse(b.published_at) - Date.parse(a.published_at));
  }, [feed]);
  const blackSeaRisks = useMemo(() => blackSeaSignals.slice(0, 4), [blackSeaSignals]);

  const widgetSeriesFor = useMemo(() => {
    const build = (predicate: (item: MonitorItem) => boolean) => {
      const series: Array<{ label: string; value: number }> = [];
      for (let offset = 6; offset >= 0; offset -= 1) {
        const dayDate = new Date(Date.now() - offset * 24 * 60 * 60 * 1000);
        const day = dayDate.toISOString().slice(5, 10);
        const start = new Date(dayDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(dayDate);
        end.setHours(23, 59, 59, 999);
        const count = feed.filter((item) => {
          const ts = Date.parse(item.published_at);
          return Number.isFinite(ts) && ts >= start.getTime() && ts <= end.getTime() && predicate(item);
        }).length;
        series.push({ label: day, value: count });
      }
      return series;
    };

    return {
      blackSea: build((item) =>
        item.region_tags.some((tag) => ["black sea", "ukraine", "romania", "bulgaria", "poland"].some((needle) => tag.includes(needle))),
      ),
      logistics: build((item) => item.topic_tags.includes("logistics")),
      weather: build((item) => item.topic_tags.includes("weather")),
      policy: build((item) => item.topic_tags.includes("policy") || item.topic_tags.includes("trade")),
    };
  }, [feed]);

  const compactWidgets = useMemo<CompactSignalWidget[]>(() => {
    const blackSea24h = blackSeaSignals.filter((item) => inLastHours(item, 24)).length;
    const blackSea7d = blackSeaSignals.filter((item) => inLastHours(item, 24 * 7)).length;
    const blackSeaStatus: CompactSignalStatus = blackSea24h >= 8 ? "Rising" : blackSea24h >= 4 ? "Elevated" : "Stable";

    const logistics24h = feed.filter((item) => item.topic_tags.includes("logistics") && inLastHours(item, 24)).length;
    const logisticsHigh24h = feed.filter((item) => item.topic_tags.includes("logistics") && inLastHours(item, 24) && classifyImpact(item) === "High").length;
    const logisticsStatus: CompactSignalStatus = logisticsHigh24h >= 3 ? "Elevated" : logistics24h > 6 ? "Rising" : "Stable";

    const weather24h = feed.filter((item) => item.topic_tags.includes("weather") && inLastHours(item, 24)).length;
    const weatherByRegion = ["black sea", "eu", "us", "latam"]
      .map((regionName) => ({ regionName, count: feed.filter((item) => item.topic_tags.includes("weather") && inRegion(item, regionName)).length }))
      .sort((a, b) => b.count - a.count)[0];
    const weatherStatus: CompactSignalStatus = weather24h >= 6 ? "Elevated" : weather24h >= 3 ? "Rising" : "Cooling";

    const policy24h = feed.filter((item) => (item.topic_tags.includes("policy") || item.topic_tags.includes("trade")) && inLastHours(item, 24)).length;
    const policyStatus: CompactSignalStatus = policy24h >= 7 ? "Rising" : policy24h >= 3 ? "Elevated" : "Stable";

    return [
      {
        id: "black-sea-activity",
        title: "Black Sea Activity",
        status: blackSeaStatus,
        primary: `${blackSea24h}`,
        secondary: `7d: ${blackSea7d}`,
        note: "Mentions tagged to Black Sea corridor risk.",
        series: widgetSeriesFor.blackSea,
      },
      {
        id: "logistics-pressure",
        title: "Logistics Pressure",
        status: logisticsStatus,
        primary: `${logisticsHigh24h} high`,
        secondary: `24h logistics: ${logistics24h}`,
        note: "High-impact logistics signals over 24h.",
        series: widgetSeriesFor.logistics,
      },
      {
        id: "weather-risk",
        title: "Weather Risk Pulse",
        status: weatherStatus,
        primary: `${weather24h}`,
        secondary: `Hot region: ${asLabel(weatherByRegion?.regionName || "black sea")}`,
        note: "Weather-tagged signals across active regions.",
        series: widgetSeriesFor.weather,
      },
      {
        id: "policy-pressure",
        title: "Policy / Trade Friction",
        status: policyStatus,
        primary: `${policy24h}`,
        secondary: "24h policy & trade",
        note: "Regulatory and trade-flow pressure monitor.",
        series: widgetSeriesFor.policy,
      },
    ];
  }, [blackSeaSignals, feed, widgetSeriesFor]);

  const marketNarrative = useMemo(() => {
    const logistics24 = feed.filter((item) => item.topic_tags.includes("logistics") && inLastHours(item, 24)).length;
    const policy24 = feed.filter((item) => (item.topic_tags.includes("policy") || item.topic_tags.includes("trade")) && inLastHours(item, 24)).length;
    const weather24 = feed.filter((item) => item.topic_tags.includes("weather") && inLastHours(item, 24)).length;
    const high24 = feed.filter((item) => inLastHours(item, 24) && classifyImpact(item) === "High").length;
    const score = logistics24 * 2 + policy24 * 2 + weather24 + high24 * 3;
    if (score >= 30) {
      return {
        status: "Elevated",
        line: "Risk tone is elevated: logistics and policy signals are driving near-term volatility narratives.",
      };
    }
    if (score >= 18) {
      return {
        status: "Rising",
        line: "Signal flow is building across logistics and weather channels; monitor hedge timing and corridor exposure.",
      };
    }
    return {
      status: "Stable",
      line: "Narrative remains balanced with moderate signal density and no broad stress cluster.",
    };
  }, [feed]);

  const cropVolumeData = useMemo(() => {
    return HERO_CROPS.map((cropName) => ({
      name: asLabel(cropName),
      count: chartFeed.filter((item) => item.crop_tags.includes(cropName)).length,
    }));
  }, [chartFeed]);

  const topicVolumeData = useMemo(() => {
    return TOPICS.filter((v) => v !== "all").map((topicName) => ({
      name: asLabel(topicName),
      count: chartFeed.filter((item) => item.topic_tags.includes(topicName)).length,
    }));
  }, [chartFeed]);

  const regionVolumeData = useMemo(() => {
    return REGIONS.filter((v) => v !== "all").map((regionName) => ({
      name: asLabel(regionName),
      count: chartFeed.filter((item) => inRegion(item, regionName)).length,
    }));
  }, [chartFeed]);

  const mentionsTrendData = useMemo(() => {
    const buckets: Array<{ day: string; count: number }> = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const dayDate = new Date(Date.now() - offset * 24 * 60 * 60 * 1000);
      const day = dayDate.toISOString().slice(5, 10);
      const start = new Date(dayDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(dayDate);
      end.setHours(23, 59, 59, 999);
      const count = chartFeed.filter((item) => {
        const ts = Date.parse(item.published_at);
        return Number.isFinite(ts) && ts >= start.getTime() && ts <= end.getTime();
      }).length;
      buckets.push({ day, count });
    }
    return buckets;
  }, [chartFeed]);

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

          <LiveVisualsPanel debugEnabled={debugEnabled} compact />

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-300">Grain Markets Core</h2>
              <span className="text-[11px] text-slate-500">
                {grainMarketsQuery.data?.enabled ? "CBOT/CME + Euronext (demo-grade)" : "Disabled"}
              </span>
            </div>
            {!grainMarketsQuery.data?.enabled ? (
              <Card className="border-white/12 bg-slate-950/72 text-slate-100">
                <CardContent className="pt-6 text-sm text-slate-400">
                  Grain markets core is disabled by feature flag.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 xl:grid-cols-12">
                <div className="xl:col-span-8 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {(grainMarketsQuery.data?.widgets || []).map((widget) => (
                    <GrainInstrumentCard key={widget.id} widget={widget} />
                  ))}
                </div>
                <div className="xl:col-span-4 grid gap-3">
                  {(grainMarketsQuery.data?.comparisons || []).map((widget) => (
                    <GrainComparisonCard key={widget.id} widget={widget} />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-3 xl:grid-cols-12">
            <Card className="xl:col-span-5 border-red-400/35 bg-[linear-gradient(160deg,rgba(127,29,29,0.24),rgba(10,14,26,0.92)_36%)] text-slate-100 shadow-[0_0_0_1px_rgba(248,113,113,0.14)]">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-red-400" />
                  <CardTitle className="text-base">Black Sea Watch</CardTitle>
                </div>
                <CardDescription className="text-slate-400">Live corridor risk context for logistics, policy and weather</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-3 gap-1.5 rounded-md border border-white/10 bg-slate-950/55 p-1.5 text-[10px]">
                  <div>
                    <p className="text-slate-400">Activity</p>
                    <p className="font-semibold text-white">{blackSeaSignals.filter((item) => inLastHours(item, 24)).length}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">High impact</p>
                    <p className="font-semibold text-red-300">{blackSeaSignals.filter((item) => inLastHours(item, 24) && classifyImpact(item) === "High").length}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">7d total</p>
                    <p className="font-semibold text-amber-300">{blackSeaSignals.filter((item) => inLastHours(item, 24 * 7)).length}</p>
                  </div>
                </div>
                {blackSeaRisks.map((item) => (
                  <a key={`bs-${item.id}`} href={item.url} target="_blank" rel="noreferrer" className="block rounded-md border border-white/10 bg-slate-900/80 p-2 hover:border-red-400/35">
                    <p className="line-clamp-2 text-xs font-medium text-slate-100">{item.title}</p>
                    <p className="mt-1 text-[10px] text-slate-400">{classifySignalType(item)} • {formatRelative(item.published_at)}</p>
                  </a>
                ))}
              </CardContent>
            </Card>

            <div className="xl:col-span-7 grid gap-3 sm:grid-cols-2">
              {compactWidgets.map((widget) => (
                <CompactWidgetCard key={widget.id} widget={widget} />
              ))}
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-12">
            <Card className="xl:col-span-6 border-primary/35 bg-slate-950/76 text-slate-100">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  <CardTitle className="text-base">Top Signals (Priority)</CardTitle>
                </div>
                <CardDescription className="text-slate-400">Top three decision-relevant signals</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                {prioritySignals.map((item, index) => (
                  <SignalCard key={item.id} item={item} rank={index} />
                ))}
              </CardContent>
            </Card>

            <Card className="xl:col-span-3 border-white/12 bg-slate-950/76 text-slate-100">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Market Narrative (24h)</CardTitle>
                <CardDescription className="text-slate-400">Rule-based summary from active signals</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Badge className={`${marketNarrative.status === "Elevated" ? "border-red-400/45 bg-red-500/20 text-red-100" : marketNarrative.status === "Rising" ? "border-amber-400/45 bg-amber-500/20 text-amber-100" : "border-blue-400/45 bg-blue-500/20 text-blue-100"} text-[10px] uppercase tracking-wide`}>
                  {marketNarrative.status}
                </Badge>
                <p className="text-sm leading-6 text-slate-200">{marketNarrative.line}</p>
              </CardContent>
            </Card>

            <div className="xl:col-span-3 grid gap-3">
              {logisticsIndicatorsQuery.data?.enabled ? (
                (logisticsIndicatorsQuery.data?.widgets || []).slice(0, 2).map((indicator) => (
                  <Card key={`mini-${indicator.id}`} className="border-white/12 bg-slate-950/72 text-slate-100">
                    <CardContent className="pt-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-200">{indicator.title}</p>
                        <Badge className={`text-[10px] ${indicatorStatusClass(indicator.status)}`}>{indicatorStatusLabel(indicator.status)}</Badge>
                      </div>
                      <div className="mt-1 flex items-end justify-between">
                        <p className="text-lg font-bold text-white">{indicator.valueCurrent == null ? "n/a" : indicator.valueCurrent.toFixed(2)}</p>
                        <p className="text-[10px] text-slate-400">{indicator.valueChange != null ? `${indicator.valueChange >= 0 ? "+" : ""}${indicator.valueChange.toFixed(2)}` : "no delta"}</p>
                      </div>
                      <p className="mt-1 text-[10px] text-slate-500 line-clamp-2">{indicator.sourceName}</p>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card className="border-white/12 bg-slate-950/72 text-slate-100">
                  <CardContent className="pt-4 text-xs text-slate-400">Logistics indicators disabled.</CardContent>
                </Card>
              )}
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-12">
            <Card className="xl:col-span-5 border-white/12 bg-slate-950/70 text-slate-100">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Market Pulse (Secondary)</CardTitle>
                <CardDescription className="text-slate-400">24h directional intensity by crop</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {pulseByCrop.map((entry) => (
                  <div key={entry.crop} className="rounded-lg border border-white/10 bg-slate-900/80 p-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">{asLabel(entry.crop)}</p>
                      {entry.direction === "up" ? (
                        <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                      ) : entry.direction === "down" ? (
                        <TrendingDown className="h-3.5 w-3.5 text-red-400" />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                      )}
                    </div>
                    <p className="mt-1 text-lg font-semibold text-white">{entry.now24h}</p>
                    <p className="text-[10px] text-slate-400">24h • total {entry.total}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="xl:col-span-5 border-primary/30 bg-slate-950/74 text-slate-100">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">Cropto UA Indices (Secondary)</CardTitle>
                  <Badge className="border-primary/40 bg-primary/15 text-primary-foreground">Internal</Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {!indicesQuery.data?.enabled ? (
                  <p className="text-sm text-slate-400">Coming soon</p>
                ) : indicesQuery.data?.items?.length ? (
                  indicesQuery.data.items.slice(0, 6).map((item) => (
                    <div key={item.slug} className="rounded-lg border border-primary/25 bg-slate-900/82 p-2">
                      <p className="text-[11px] font-semibold text-slate-100 line-clamp-1">{item.name}</p>
                      <div className="mt-1 flex items-end justify-between">
                        <p className="text-lg font-bold text-white">${item.value.toFixed(2)}</p>
                        <p className={`text-[10px] font-semibold ${item.change != null && item.change >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                          {item.change != null ? `${item.change >= 0 ? "+" : ""}${item.change.toFixed(2)}` : "n/a"}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-400">No index snapshots available yet.</p>
                )}
              </CardContent>
            </Card>

            <Card className="xl:col-span-2 border-white/12 bg-slate-950/65 text-slate-100">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Macro / FX</CardTitle>
              </CardHeader>
              <CardContent>
                {fxQuery.data?.mode === "live" && fxQuery.data.rates.length > 0 ? (
                  <div className="grid grid-cols-1 gap-1.5">
                    {fxQuery.data.rates.slice(0, 4).map((rate) => (
                      <div key={rate.currency} className="rounded-md border border-white/10 bg-slate-900/75 p-1.5">
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

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-300">Freight & Logistics Indicators</h2>
              <span className="text-[11px] text-slate-500">
                {logisticsIndicatorsQuery.data?.enabled ? "Demo-grade, fallback-first" : "Disabled"}
              </span>
            </div>
            {!logisticsIndicatorsQuery.data?.enabled ? (
              <Card className="border-white/12 bg-slate-950/72 text-slate-100">
                <CardContent className="pt-6 text-sm text-slate-400">
                  Indicators are disabled by feature flag.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 lg:grid-cols-3">
                {(logisticsIndicatorsQuery.data?.widgets || []).map((indicator) => (
                  <IndicatorCard key={indicator.id} indicator={indicator} />
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Card className="border-white/10 bg-slate-950/70 text-slate-100">
              <CardHeader className="pb-1">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm">Signal Volume by Crop</CardTitle>
                  <span className="text-[10px] text-slate-400">{chartWindow}</span>
                </div>
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
              <div className="px-4 pb-3 text-[10px] text-slate-400">Legend: signal mentions tagged by crop.</div>
            </Card>

            <Card className="border-white/10 bg-slate-950/70 text-slate-100">
              <CardHeader className="pb-1">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm">Signal Volume by Topic</CardTitle>
                  <span className="text-[10px] text-slate-400">{chartWindow}</span>
                </div>
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
              <div className="px-4 pb-3 text-[10px] text-slate-400">Legend: markets/trade/logistics/policy/weather/harvest tags.</div>
            </Card>

            <Card className="border-white/10 bg-slate-950/70 text-slate-100">
              <CardHeader className="pb-1">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm">Region Activity</CardTitle>
                  <span className="text-[10px] text-slate-400">{chartWindow}</span>
                </div>
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
              <div className="px-4 pb-3 text-[10px] text-slate-400">Legend: region-tagged signals by corridor.</div>
            </Card>

            <Card className="border-white/10 bg-slate-950/70 text-slate-100">
              <CardHeader className="pb-1">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm">Mentions Trend ({chartWindow})</CardTitle>
                  <span className="text-[10px] text-slate-400">{chartWindow}</span>
                </div>
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
              <div className="px-4 pb-3 text-[10px] text-slate-400">Legend: total relevant mentions over recent days.</div>
            </Card>
          </div>
          <div className="flex items-center gap-1.5">
            <p className="text-xs uppercase tracking-wide text-slate-400">Micro-widget range</p>
            <Button size="sm" variant={chartWindow === "24h" ? "default" : "outline"} className="h-7 px-2.5 text-xs border-white/20 text-slate-200" onClick={() => setChartWindow("24h")}>
              24h
            </Button>
            <Button size="sm" variant={chartWindow === "7d" ? "default" : "outline"} className="h-7 px-2.5 text-xs border-white/20 text-slate-200" onClick={() => setChartWindow("7d")}>
              7d
            </Button>
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
              {topSignals.slice(0, 8).map((item, index) => (
                <SignalCard key={item.id} item={item} rank={index} />
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
                      <div className="flex items-center gap-1.5">
                        <Badge className="border-white/20 bg-white/5 text-[10px] text-slate-300">{panel.items.length} items</Badge>
                        <Badge className="border-red-400/40 bg-red-500/15 text-[10px] text-red-100">
                          {panel.items.filter((item) => classifyImpact(item) === "High").length} high
                        </Badge>
                        <Badge className="border-amber-400/40 bg-amber-500/15 text-[10px] text-amber-100">
                          {panel.items.filter((item) => inLastHours(item, 24)).length} new
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {visibleItems.map((item) => (
                      <a key={`${panel.id}-${item.id}`} href={item.url} target="_blank" rel="noreferrer" className="block rounded-md border border-white/10 bg-slate-900/75 p-2 hover:border-primary/45">
                        <div className="flex items-start gap-2">
                          <span className={`mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                            classifyImpact(item) === "High" ? "bg-red-400" : classifyImpact(item) === "Medium" ? "bg-amber-300" : "bg-emerald-400"
                          }`} />
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-xs font-medium text-slate-100">{item.title}</p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {item.topic_tags.slice(0, 2).map((tag) => (
                                <span key={`${item.id}-tag-${tag}`} className="rounded-full border border-primary/35 bg-primary/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-primary-foreground/95">
                                  {asLabel(tag)}
                                </span>
                              ))}
                            </div>
                            <p className="mt-1 text-[10px] text-slate-400">{item.source_name} • {formatRelative(item.published_at)}</p>
                          </div>
                        </div>
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
                {debugQuery.data?.liveVisuals ? (
                  <div>
                    <p className="font-medium">Live visuals:</p>
                    <p>
                      {debugQuery.data.liveVisuals.enabled}/{debugQuery.data.liveVisuals.total} enabled • active {debugQuery.data.liveVisuals.active} • fallback {debugQuery.data.liveVisuals.fallback}
                    </p>
                  </div>
                ) : null}
                {debugQuery.data?.logisticsIndicators ? (
                  <div>
                    <p className="font-medium">Logistics indicators:</p>
                    <p>
                      enabled: {String(debugQuery.data.logisticsIndicators.enabled)} • refresh: {Math.round(debugQuery.data.logisticsIndicators.refreshMs / 1000)}s • cacheTTL: {Math.round(debugQuery.data.logisticsIndicators.cacheTtlMs / 1000)}s
                    </p>
                    <ul className="list-disc pl-5">
                      {debugQuery.data.logisticsIndicators.providers.map((provider) => (
                        <li key={`li-${provider.id}`}>
                          {provider.id}: {provider.status} • cacheAge {provider.cacheAgeSec ?? "-"}s • fallback {String(provider.fallbackMode)}
                          {provider.lastError ? ` • err: ${provider.lastError}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {debugQuery.data?.grainMarkets ? (
                  <div>
                    <p className="font-medium">Grain markets core:</p>
                    <p>
                      enabled: {String(debugQuery.data.grainMarkets.enabled)} • refresh: {Math.round(debugQuery.data.grainMarkets.refreshMs / 1000)}s • cacheTTL: {Math.round(debugQuery.data.grainMarkets.cacheTtlMs / 1000)}s
                    </p>
                    <ul className="list-disc pl-5">
                      {debugQuery.data.grainMarkets.providers.map((provider) => (
                        <li key={`gm-${provider.id}`}>
                          {provider.id}: {provider.status} • cacheAge {provider.cacheAgeSec ?? "-"}s • fallback {String(provider.fallbackMode)}
                          {provider.lastError ? ` • err: ${provider.lastError}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </section>
    </MainLayout>
  );
}
