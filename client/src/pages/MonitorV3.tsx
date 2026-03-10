import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Maximize2, Minimize2, Moon, Plus, Sun, X } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

type MonitorRole = "all" | "farmer" | "trader" | "broker";
type MonitorTopic = "all" | "markets" | "logistics" | "policy" | "weather";
type Country = "US" | "UA" | "BR" | "AR" | "FR" | "DE" | "RO";
type GridGrouping = "manual" | "topic" | "source";

type NewsItem = {
  id: string;
  title: string;
  summary?: string;
  source_name: string;
  published_at: string;
  topic_tags?: string[];
  url?: string;
};

type NewsResponse = {
  topSignals?: NewsItem[];
  feed?: NewsItem[];
  sidePanels?: { logistics?: NewsItem[]; policy?: NewsItem[] };
};

type GrainWidgetRecord = {
  status?: string;
  sourceName?: string;
  sourceUrl?: string;
  territory?: { code?: string; label?: string };
  notes?: string[];
  rows?: Array<{ label?: string; price?: { valueCurrent?: number; unit?: string; changePct?: number } }>;
  items?: Array<{ label?: string; value?: number; unit?: string; changePct?: number }>;
  cards?: Array<{ title?: string; value?: number; unit?: string; deltaPct?: number }>;
};

type GrainWidgetsResponse = {
  widgets?: {
    byKind?: Record<string, GrainWidgetRecord>;
    order?: string[];
  };
};

type GrainMarketWidgetItem = {
  instrumentKey: string;
  title: string;
  subtitle?: string;
  status: string;
  sourceName?: string;
  sourceUrl?: string;
  valueCurrent?: number;
  valueChangePct?: number;
  currency?: string;
  unit?: string;
};

type GrainMarketsResponse = {
  widgets?: {
    cbot?: GrainMarketWidgetItem[];
    euronext?: GrainMarketWidgetItem[];
  };
};

type LogisticsIndicator = {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  sourceName: string;
  sourceUrl?: string;
  valueCurrent?: number;
  valueChangePct?: number;
  unit: string;
};

type LogisticsIndicatorsResponse = {
  widgets?: LogisticsIndicator[];
};

type MonitorIndex = {
  slug: string;
  name: string;
  source: string;
  value: number;
  change?: number;
};

type IndicesResponse = {
  items?: MonitorIndex[];
};

type GridWidget = {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  source: string;
  topic: Exclude<MonitorTopic, "all">;
  roles: Array<Exclude<MonitorRole, "all">>;
  territory: string;
  metrics: Array<{ label: string; value: string; delta?: number; href?: string }>;
};

type GridLayout = { w: 1 | 2 | 3; h: 1 | 2 };
type CustomWidgetDraft = {
  title: string;
  subtitle: string;
  source: string;
  topic: Exclude<MonitorTopic, "all">;
};

const STORAGE_PREFIX = "monitor_v3_";
const STORAGE_KEYS = {
  role: `${STORAGE_PREFIX}role`,
  topic: `${STORAGE_PREFIX}topic`,
  country: `${STORAGE_PREFIX}country`,
  grouping: `${STORAGE_PREFIX}grouping`,
  order: `${STORAGE_PREFIX}order`,
  hidden: `${STORAGE_PREFIX}hidden`,
  layout: `${STORAGE_PREFIX}layout`,
  custom: `${STORAGE_PREFIX}custom`,
};

const ROLE_OPTIONS: Array<{ id: MonitorRole; label: string }> = [
  { id: "all", label: "Show All" },
  { id: "farmer", label: "Farmer" },
  { id: "trader", label: "Trader" },
  { id: "broker", label: "Broker" },
];

const TOPIC_OPTIONS: Array<{ id: MonitorTopic; label: string }> = [
  { id: "all", label: "All" },
  { id: "markets", label: "Markets" },
  { id: "logistics", label: "Logistics" },
  { id: "policy", label: "Policy" },
  { id: "weather", label: "Weather" },
];

const COUNTRY_OPTIONS: Array<{ id: Country; label: string }> = [
  { id: "US", label: "United States" },
  { id: "UA", label: "Ukraine" },
  { id: "BR", label: "Brazil" },
  { id: "AR", label: "Argentina" },
  { id: "FR", label: "France" },
  { id: "DE", label: "Germany" },
  { id: "RO", label: "Romania" },
];

const KIND_TO_TOPIC: Record<string, Exclude<MonitorTopic, "all">> = {
  GLOBAL_SPOT_TABLE: "markets",
  CROP_PRICE_INDEX: "markets",
  USDA_MARS_REPORTS: "policy",
  US_CASH_EXPORT_CONTEXT: "logistics",
  USDA_MARS_DAILY_MARKET_RATES_TXT: "markets",
  ALPHAVANTAGE_GRAIN_BENCHMARKS: "markets",
  NASDAQ_DATA_LINK_SNAPSHOT: "markets",
  EC_CEREALS_MULTI_COUNTRY: "markets",
  EC_OILSEEDS_MULTI_COUNTRY: "markets",
  USDA_NASS_PRODUCER_PRICES: "markets",
  WFP_MARKET_PRICES_MULTI_COUNTRY: "markets",
  WB_MICRODATA_MARKET_PRICES: "markets",
  EUROSTAT_AGRI_PRICE_INDICES: "markets",
  USDA_PSD_BALANCES: "policy",
  AMIS_GLOBAL_BALANCE: "policy",
  IMF_COMMODITY_BENCHMARKS: "markets",
  OECD_AGRICULTURAL_OUTLOOK: "policy",
  USDA_GTR_LOGISTICS_SNAPSHOT: "logistics",
  CANADA_GRAIN_RAIL_PERFORMANCE: "logistics",
  FAOSTAT_PP_MULTI_COUNTRY: "markets",
  FPMA_MARKET_PRICES_MULTI_COUNTRY: "markets",
};

const KIND_TO_ROLES: Record<string, Array<Exclude<MonitorRole, "all">>> = {
  USDA_GTR_LOGISTICS_SNAPSHOT: ["trader", "broker"],
  CANADA_GRAIN_RAIL_PERFORMANCE: ["trader", "broker"],
  USDA_PSD_BALANCES: ["farmer", "trader", "broker"],
  AMIS_GLOBAL_BALANCE: ["farmer", "trader", "broker"],
  USDA_NASS_PRODUCER_PRICES: ["farmer", "trader"],
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // noop
  }
}

function labelFromKind(kind: string) {
  return kind
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function formatMetric(current?: number, unit?: string) {
  if (typeof current !== "number") return "n/a";
  return `${current.toFixed(2)} ${unit || ""}`.trim();
}

function pickMetrics(widget?: GrainWidgetRecord): Array<{ label: string; value: string; delta?: number }> {
  const metrics: Array<{ label: string; value: string; delta?: number }> = [];
  (widget?.rows || []).slice(0, 3).forEach((row) => {
    const current = row.price?.valueCurrent;
    if (typeof current === "number") {
      metrics.push({
        label: row.label || "Value",
        value: formatMetric(current, row.price?.unit),
        delta: row.price?.changePct,
      });
    }
  });
  if (metrics.length) return metrics;
  (widget?.items || []).slice(0, 3).forEach((row) => {
    if (typeof row.value === "number") {
      metrics.push({ label: row.label || "Value", value: formatMetric(row.value, row.unit), delta: row.changePct });
    }
  });
  if (metrics.length) return metrics;
  (widget?.cards || []).slice(0, 3).forEach((row) => {
    if (typeof row.value === "number") {
      metrics.push({ label: row.title || "Value", value: formatMetric(row.value, row.unit), delta: row.deltaPct });
    }
  });
  return metrics;
}

function getStatusTone(status: string) {
  const key = status.toUpperCase();
  if (key === "REFRESH" || key === "LIVE") return "border-emerald-500/60 text-emerald-300";
  if (key === "INDICATIVE") return "border-cyan-500/60 text-cyan-300";
  if (key === "FALLBACK") return "border-blue-500/60 text-blue-300";
  if (key === "CUSTOM") return "border-violet-500/60 text-violet-300";
  return "border-red-500/60 text-red-300";
}

export default function MonitorV3Page() {
  const { theme, setTheme } = useTheme();

  const [role, setRole] = useState<MonitorRole>(() => readJson<MonitorRole>(STORAGE_KEYS.role, "all"));
  const [topic, setTopic] = useState<MonitorTopic>(() => readJson<MonitorTopic>(STORAGE_KEYS.topic, "all"));
  const [country, setCountry] = useState<Country>(() => readJson<Country>(STORAGE_KEYS.country, "US"));
  const [grouping, setGrouping] = useState<GridGrouping>(() => readJson<GridGrouping>(STORAGE_KEYS.grouping, "manual"));
  const [showHidden, setShowHidden] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isAddWidgetOpen, setIsAddWidgetOpen] = useState(false);

  const [order, setOrder] = useState<string[]>(() => readJson<string[]>(STORAGE_KEYS.order, []));
  const [layoutById, setLayoutById] = useState<Record<string, GridLayout>>(() => readJson<Record<string, GridLayout>>(STORAGE_KEYS.layout, {}));
  const [hiddenIds, setHiddenIds] = useState<string[]>(() => readJson<string[]>(STORAGE_KEYS.hidden, []));
  const [customWidgets, setCustomWidgets] = useState<GridWidget[]>(() => readJson<GridWidget[]>(STORAGE_KEYS.custom, []));

  const [draft, setDraft] = useState<CustomWidgetDraft>({ title: "", subtitle: "", source: "", topic: "markets" });

  useEffect(() => writeJson(STORAGE_KEYS.role, role), [role]);
  useEffect(() => writeJson(STORAGE_KEYS.topic, topic), [topic]);
  useEffect(() => writeJson(STORAGE_KEYS.country, country), [country]);
  useEffect(() => writeJson(STORAGE_KEYS.grouping, grouping), [grouping]);
  useEffect(() => writeJson(STORAGE_KEYS.order, order), [order]);
  useEffect(() => writeJson(STORAGE_KEYS.layout, layoutById), [layoutById]);
  useEffect(() => writeJson(STORAGE_KEYS.hidden, hiddenIds), [hiddenIds]);
  useEffect(() => writeJson(STORAGE_KEYS.custom, customWidgets), [customWidgets]);

  const newsQuery = useQuery<NewsResponse>({
    queryKey: ["monitor-v3-news"],
    staleTime: 60_000,
    queryFn: async () => {
      const response = await fetch("/api/monitor/news?crop=all&topic=all&region=all&time=24h&threshold=3");
      if (!response.ok) throw new Error("Failed to load monitor news");
      return response.json();
    },
  });

  const grainWidgetsQuery = useQuery<GrainWidgetsResponse>({
    queryKey: ["monitor-v3-grain-widgets", country],
    staleTime: 90_000,
    queryFn: async () => {
      const response = await fetch(`/api/monitor/grain-widgets?country=${country}`);
      if (!response.ok) throw new Error("Failed to load grain widgets");
      return response.json();
    },
  });

  const grainMarketsQuery = useQuery<GrainMarketsResponse>({
    queryKey: ["monitor-v3-grain-markets"],
    staleTime: 90_000,
    queryFn: async () => {
      const response = await fetch("/api/monitor/grain-markets");
      if (!response.ok) throw new Error("Failed to load grain markets");
      return response.json();
    },
  });

  const logisticsQuery = useQuery<LogisticsIndicatorsResponse>({
    queryKey: ["monitor-v3-logistics-indicators"],
    staleTime: 90_000,
    queryFn: async () => {
      const response = await fetch("/api/monitor/logistics-indicators");
      if (!response.ok) throw new Error("Failed to load logistics indicators");
      return response.json();
    },
  });

  const indicesQuery = useQuery<IndicesResponse>({
    queryKey: ["monitor-v3-indices"],
    staleTime: 90_000,
    queryFn: async () => {
      const response = await fetch("/api/monitor/indices");
      if (!response.ok) throw new Error("Failed to load monitor indices");
      return response.json();
    },
  });

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const coreWidgets = useMemo<GridWidget[]>(() => {
    const byKind = grainWidgetsQuery.data?.widgets?.byKind || {};
    const orderFromResponse = grainWidgetsQuery.data?.widgets?.order || Object.keys(byKind);

    const widgetsFromExpansion: GridWidget[] = orderFromResponse
      .map((kind) => {
        const widget = byKind[kind];
        if (!widget) return null;
        return {
          id: `GW_${kind}`,
          title: labelFromKind(kind),
          subtitle: widget.notes?.[0] || "Expansion widget",
          status: widget.status || "OFFLINE",
          source: widget.sourceName || "Unknown",
          topic: KIND_TO_TOPIC[kind] || "markets",
          roles: KIND_TO_ROLES[kind] || ["farmer", "trader", "broker"],
          territory: widget.territory?.code || "GLOBAL",
          metrics: pickMetrics(widget).map((m) => ({ ...m, href: widget.sourceUrl })),
        } as GridWidget;
      })
      .filter((item): item is GridWidget => Boolean(item));

    const marketRows = [...(grainMarketsQuery.data?.widgets?.cbot || []), ...(grainMarketsQuery.data?.widgets?.euronext || [])];
    const widgetsFromMarkets: GridWidget[] = marketRows.map((row) => ({
      id: `GM_${row.instrumentKey}`,
      title: row.title,
      subtitle: row.subtitle || "Core market instrument",
      status: row.status || "OFFLINE",
      source: row.sourceName || "Unknown",
      topic: "markets",
      roles: ["farmer", "trader", "broker"],
      territory: "GLOBAL",
      metrics: [{ label: "Price", value: formatMetric(row.valueCurrent, `${row.currency || ""}/${row.unit || ""}`), delta: row.valueChangePct, href: row.sourceUrl }],
    }));

    const widgetsFromLogistics: GridWidget[] = (logisticsQuery.data?.widgets || []).map((row) => ({
      id: `LG_${row.id}`,
      title: row.title,
      subtitle: row.subtitle,
      status: row.status || "OFFLINE",
      source: row.sourceName,
      topic: "logistics",
      roles: ["trader", "broker", "farmer"],
      territory: "GLOBAL",
      metrics: [{ label: "Current", value: formatMetric(row.valueCurrent, row.unit), delta: row.valueChangePct, href: row.sourceUrl }],
    }));

    const widgetsFromIndices: GridWidget[] = (indicesQuery.data?.items || []).slice(0, 6).map((row) => ({
      id: `IDX_${row.slug}`,
      title: row.name,
      subtitle: "Composite index",
      status: "REFRESH",
      source: row.source || "Index source",
      topic: "markets",
      roles: ["farmer", "trader", "broker"],
      territory: "GLOBAL",
      metrics: [{ label: "Index", value: formatMetric(row.value, "pts"), delta: row.change }],
    }));

    return [...widgetsFromExpansion, ...widgetsFromMarkets, ...widgetsFromLogistics, ...widgetsFromIndices];
  }, [grainWidgetsQuery.data, grainMarketsQuery.data, logisticsQuery.data, indicesQuery.data]);

  const allWidgets = useMemo(() => [...coreWidgets, ...customWidgets], [coreWidgets, customWidgets]);
  const widgetMap = useMemo(() => Object.fromEntries(allWidgets.map((w) => [w.id, w])), [allWidgets]);

  const groupedOrder = useMemo(() => {
    const allIds = allWidgets.map((w) => w.id);
    if (grouping === "manual") {
      const known = order.filter((id) => allIds.includes(id));
      const appended = allIds.filter((id) => !known.includes(id));
      return [...known, ...appended];
    }
    if (grouping === "topic") {
      const byTopic = [...allWidgets].sort((a, b) => a.topic.localeCompare(b.topic) || a.title.localeCompare(b.title));
      return byTopic.map((w) => w.id);
    }
    const bySource = [...allWidgets].sort((a, b) => a.source.localeCompare(b.source) || a.title.localeCompare(b.title));
    return bySource.map((w) => w.id);
  }, [allWidgets, order, grouping]);

  const visibleWidgets = useMemo(() => {
    return groupedOrder
      .map((id) => widgetMap[id])
      .filter((widget): widget is GridWidget => Boolean(widget))
      .filter((widget) => {
        if (hiddenIds.includes(widget.id) && !showHidden) return false;
        if (role !== "all" && !widget.roles.includes(role)) return false;
        if (topic !== "all" && widget.topic !== topic) return false;
        if (widget.territory !== "GLOBAL" && widget.territory !== country) return false;
        return true;
      });
  }, [groupedOrder, widgetMap, hiddenIds, showHidden, role, topic, country]);

  const topSignals = newsQuery.data?.topSignals || [];
  const feed = newsQuery.data?.feed || [];

  const filteredSignals = useMemo(() => {
    return topSignals.filter((item) => {
      if (topic === "all") return true;
      const tags = (item.topic_tags || []).map((tag) => tag.toLowerCase());
      return tags.includes(topic);
    });
  }, [topSignals, topic]);

  const resizeWidget = (id: string, axis: "w" | "h", delta: 1 | -1) => {
    setLayoutById((current) => {
      const prev = current[id] || ({ w: 1, h: 1 } as GridLayout);
      if (axis === "w") {
        const nextW = Math.max(1, Math.min(3, prev.w + delta)) as 1 | 2 | 3;
        return { ...current, [id]: { ...prev, w: nextW } };
      }
      const nextH = Math.max(1, Math.min(2, prev.h + delta)) as 1 | 2;
      return { ...current, [id]: { ...prev, h: nextH } };
    });
  };

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      return;
    }
    await document.exitFullscreen();
  };

  const addCustomWidget = () => {
    if (!draft.title.trim()) return;
    const id = `CUSTOM_${Date.now()}`;
    const widget: GridWidget = {
      id,
      title: draft.title.trim(),
      subtitle: draft.subtitle.trim() || "Custom widget",
      source: draft.source.trim() || "Manual",
      status: "CUSTOM",
      topic: draft.topic,
      roles: ["farmer", "trader", "broker"],
      territory: country,
      metrics: [],
    };
    setCustomWidgets((current) => [...current, widget]);
    setOrder((current) => [...current, id]);
    setDraft({ title: "", subtitle: "", source: "", topic: draft.topic });
    setIsAddWidgetOpen(false);
    setGrouping("manual");
  };

  const hiddenCount = hiddenIds.length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1800px] items-center justify-between px-3 py-2">
          <div className="flex items-center gap-3">
            <div className="text-base font-semibold tracking-wide">Cropto Monitor</div>
            <span className="rounded border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">v3 sprint ping</span>
          </div>

          <div className="hidden items-center gap-2 lg:flex">
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="rounded border border-border px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
              title="Toggle theme"
            >
              {theme === "dark" ? <Sun size={14} className="inline" /> : <Moon size={14} className="inline" />}
            </button>
            <button
              onClick={toggleFullscreen}
              className="rounded border border-border px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
              title="Toggle fullscreen"
            >
              {isFullscreen ? <Minimize2 size={14} className="inline" /> : <Maximize2 size={14} className="inline" />}
            </button>
            <button
              onClick={() => setIsAddWidgetOpen(true)}
              className="rounded border border-primary/60 bg-primary/15 px-2 py-1 text-sm text-primary"
            >
              <Plus size={13} className="mr-1 inline" />
              Add widget
            </button>
          </div>
        </div>
      </header>

      <section className="sticky top-[44px] z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1800px] flex-wrap items-center gap-2 px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Control</div>
          <div className="h-4 w-px bg-border" />

          {ROLE_OPTIONS.map((option) => (
            <button
              key={option.id}
              onClick={() => setRole(option.id)}
              className={cn(
                "rounded border px-2.5 py-1 text-xs",
                role === option.id ? "border-primary/70 bg-primary/15 text-primary" : "border-border text-muted-foreground",
              )}
            >
              {option.label}
            </button>
          ))}

          <div className="h-4 w-px bg-border" />

          {TOPIC_OPTIONS.map((option) => (
            <button
              key={option.id}
              onClick={() => setTopic(option.id)}
              className={cn(
                "rounded border px-2 py-1 text-[11px] uppercase tracking-[0.12em]",
                topic === option.id ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-300" : "border-border text-muted-foreground",
              )}
            >
              {option.label}
            </button>
          ))}

          <div className="h-4 w-px bg-border" />

          <select
            value={country}
            onChange={(event) => setCountry(event.target.value as Country)}
            className="rounded border border-border bg-card px-2 py-1 text-xs"
          >
            {COUNTRY_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={grouping}
            onChange={(event) => setGrouping(event.target.value as GridGrouping)}
            className="rounded border border-border bg-card px-2 py-1 text-xs uppercase tracking-[0.12em]"
          >
            <option value="manual">Manual</option>
            <option value="topic">Topic</option>
            <option value="source">Source</option>
          </select>

          <button
            onClick={() => setShowHidden((current) => !current)}
            className={cn(
              "rounded border px-2 py-1 text-xs",
              showHidden ? "border-amber-500/60 bg-amber-500/10 text-amber-300" : "border-border text-muted-foreground",
            )}
          >
            Hidden {hiddenCount}
          </button>
        </div>
      </section>

      <main className="mx-auto flex w-full max-w-[1800px] flex-col gap-3 px-3 py-3">
        <section className="grid gap-2 xl:grid-cols-[2fr_1fr_1fr]">
          <div className="rounded border border-border bg-card p-2">
            <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Global Situation</div>
            <div className="h-[230px] rounded border border-border bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 dark:from-slate-950 dark:to-black" />
          </div>
          <div className="rounded border border-border bg-card p-2">
            <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Live Feed</div>
            <div className="space-y-1.5">
              {feed.slice(0, 5).map((item) => (
                <div key={item.id} className="rounded border border-border p-1.5 text-xs">
                  <div className="line-clamp-2 font-medium">{item.title}</div>
                  <div className="mt-1 text-[10px] text-muted-foreground">{item.source_name}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded border border-border bg-card p-2">
            <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Video Rail</div>
            <div className="grid grid-cols-2 gap-1.5">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div key={idx} className="aspect-video rounded border border-dashed border-border bg-muted/20 p-1 text-[10px] text-muted-foreground">
                  Stream {idx + 1}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-2 md:grid-cols-3">
          {filteredSignals.slice(0, 3).map((item, idx) => (
            <article key={item.id} className="rounded border border-border bg-card p-2">
              <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <span>Priority #{idx + 1}</span>
                <span>{item.source_name}</span>
              </div>
              <h3 className="line-clamp-2 text-sm font-semibold">{item.title}</h3>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.summary || "Signal summary unavailable."}</p>
            </article>
          ))}
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Main Widget Grid</h2>
            <div className="text-xs text-muted-foreground">{visibleWidgets.length} active widgets</div>
          </div>

          <div className="grid auto-rows-[168px] grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
            {visibleWidgets.map((widget) => {
              const layout = layoutById[widget.id] || ({ w: 1, h: 1 } as GridLayout);
              return (
                <article
                  key={widget.id}
                  draggable={grouping === "manual"}
                  onDragStart={() => setDraggedId(widget.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (!draggedId || draggedId === widget.id || grouping !== "manual") return;
                    setOrder((current) => {
                      const base = current.length > 0 ? current : groupedOrder;
                      const next = base.filter((id) => id !== draggedId);
                      const targetIndex = next.indexOf(widget.id);
                      next.splice(targetIndex < 0 ? next.length : targetIndex, 0, draggedId);
                      return next;
                    });
                    setDraggedId(null);
                  }}
                  className="group relative overflow-hidden rounded border border-border bg-card p-2"
                  style={{
                    gridColumn: `span ${layout.w} / span ${layout.w}`,
                    gridRow: `span ${layout.h} / span ${layout.h}`,
                    cursor: grouping === "manual" ? "grab" : "default",
                  }}
                >
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="line-clamp-2 text-base font-semibold leading-tight">{widget.title}</h3>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{widget.subtitle}</p>
                    </div>
                    <button
                      onClick={() => {
                        setHiddenIds((current) => (current.includes(widget.id) ? current : [...current, widget.id]));
                        if (widget.id.startsWith("CUSTOM_")) {
                          setCustomWidgets((current) => current.filter((item) => item.id !== widget.id));
                        }
                      }}
                      className="rounded border border-border px-1.5 py-0.5 text-muted-foreground hover:border-red-400 hover:text-red-300"
                      aria-label="Hide widget"
                    >
                      <X size={12} />
                    </button>
                  </div>

                  <div className="mb-1 flex items-center gap-1.5 text-[10px]">
                    <span className={cn("rounded border px-1.5 py-0 uppercase tracking-[0.12em]", getStatusTone(widget.status))}>{widget.status}</span>
                    <span className="max-w-[48%] truncate rounded border border-border px-1.5 py-0 text-muted-foreground">{widget.source}</span>
                  </div>

                  <div className="space-y-1">
                    {widget.metrics.slice(0, layout.h === 2 ? 4 : 2).map((metric) => {
                      const metricNode = (
                        <>
                          <div className="truncate text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{metric.label}</div>
                          <div className="text-sm font-semibold">{metric.value}</div>
                          {typeof metric.delta === "number" ? (
                            <div className={cn("text-[11px]", metric.delta >= 0 ? "text-emerald-400" : "text-red-400")}>
                              {metric.delta >= 0 ? "+" : ""}
                              {metric.delta.toFixed(2)}%
                            </div>
                          ) : null}
                        </>
                      );
                      return metric.href ? (
                        <a
                          key={`${widget.id}-${metric.label}`}
                          href={metric.href}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded border border-border bg-muted/10 p-1.5 hover:border-primary/50"
                        >
                          {metricNode}
                        </a>
                      ) : (
                        <div key={`${widget.id}-${metric.label}`} className="rounded border border-border bg-muted/10 p-1.5">
                          {metricNode}
                        </div>
                      );
                    })}
                  </div>

                  <button
                    className="absolute right-0 top-0 h-full w-2 cursor-ew-resize opacity-0 transition-opacity group-hover:opacity-100"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      const startX = event.clientX;
                      const onMove = (moveEvent: MouseEvent) => {
                        const delta = moveEvent.clientX - startX;
                        if (Math.abs(delta) < 42) return;
                        resizeWidget(widget.id, "w", delta > 0 ? 1 : -1);
                        cleanup();
                      };
                      const cleanup = () => {
                        window.removeEventListener("mousemove", onMove);
                        window.removeEventListener("mouseup", cleanup);
                      };
                      window.addEventListener("mousemove", onMove);
                      window.addEventListener("mouseup", cleanup);
                    }}
                  />
                  <button
                    className="absolute bottom-0 left-0 h-2 w-full cursor-ns-resize opacity-0 transition-opacity group-hover:opacity-100"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      const startY = event.clientY;
                      const onMove = (moveEvent: MouseEvent) => {
                        const delta = moveEvent.clientY - startY;
                        if (Math.abs(delta) < 42) return;
                        resizeWidget(widget.id, "h", delta > 0 ? 1 : -1);
                        cleanup();
                      };
                      const cleanup = () => {
                        window.removeEventListener("mousemove", onMove);
                        window.removeEventListener("mouseup", cleanup);
                      };
                      window.addEventListener("mousemove", onMove);
                      window.addEventListener("mouseup", cleanup);
                    }}
                  />
                </article>
              );
            })}
          </div>

          {showHidden && hiddenIds.length > 0 ? (
            <div className="mt-2 rounded border border-border bg-card p-2">
              <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Hidden widgets</div>
              <div className="flex flex-wrap gap-1.5">
                {hiddenIds.map((id) => (
                  <button
                    key={id}
                    onClick={() => setHiddenIds((current) => current.filter((item) => item !== id))}
                    className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Restore {widgetMap[id]?.title || id}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </main>

      {isAddWidgetOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-xl rounded border border-border bg-card p-3">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold">Add custom widget</h3>
              <button
                onClick={() => setIsAddWidgetOpen(false)}
                className="rounded border border-border px-1.5 py-1 text-muted-foreground hover:text-foreground"
              >
                <X size={12} />
              </button>
            </div>

            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Title</label>
                <input
                  value={draft.title}
                  onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                  className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                  placeholder="Widget title"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Subtitle</label>
                <input
                  value={draft.subtitle}
                  onChange={(event) => setDraft((current) => ({ ...current, subtitle: event.target.value }))}
                  className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                  placeholder="What this widget tracks"
                />
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Source</label>
                  <input
                    value={draft.source}
                    onChange={(event) => setDraft((current) => ({ ...current, source: event.target.value }))}
                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                    placeholder="API / RSS / Manual"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Topic</label>
                  <select
                    value={draft.topic}
                    onChange={(event) => setDraft((current) => ({ ...current, topic: event.target.value as CustomWidgetDraft["topic"] }))}
                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                  >
                    <option value="markets">Markets</option>
                    <option value="logistics">Logistics</option>
                    <option value="policy">Policy</option>
                    <option value="weather">Weather</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setIsAddWidgetOpen(false)} className="rounded border border-border px-3 py-1 text-sm text-muted-foreground">
                Cancel
              </button>
              <button onClick={addCustomWidget} className="rounded border border-primary/60 bg-primary/15 px-3 py-1 text-sm text-primary">
                Add widget
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
