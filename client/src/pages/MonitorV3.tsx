import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Maximize2, Minimize2, Moon, Plus, Sun, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";

type MonitorRole = "all" | "farmer" | "trader" | "broker";
type MonitorTopic = "all" | "markets" | "logistics" | "policy" | "weather";
type Country = "US" | "UA" | "BR" | "AR" | "FR" | "DE" | "RO";

type NewsItem = {
  id: string;
  title: string;
  summary?: string;
  source_name: string;
  published_at: string;
  topic_tags?: string[];
  crop_tags?: string[];
  region_tags?: string[];
  url?: string;
};

type NewsResponse = {
  generatedAt?: string;
  topSignals?: NewsItem[];
  feed?: NewsItem[];
  sidePanels?: { logistics?: NewsItem[]; policy?: NewsItem[] };
};

type GrainWidgetRecord = {
  kind?: string;
  status?: string;
  sourceName?: string;
  updatedAt?: string;
  territory?: { code?: string; label?: string };
  notes?: string[];
  rows?: Array<{ label?: string; price?: { valueCurrent?: number; unit?: string; changePct?: number } }>;
  items?: Array<{ label?: string; value?: number; unit?: string; changePct?: number }>;
  cards?: Array<{ title?: string; value?: number; unit?: string; deltaPct?: number }>;
};

type GrainWidgetsResponse = {
  enabled?: boolean;
  widgets?: {
    byKind?: Record<string, GrainWidgetRecord>;
    order?: string[];
  };
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
  metrics: Array<{ label: string; value: string; delta?: number }>;
};

type GridLayout = { w: 1 | 2; h: 1 | 2 };
type CustomWidgetDraft = {
  title: string;
  subtitle: string;
  source: string;
  topic: Exclude<MonitorTopic, "all">;
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

const CUSTOM_WIDGETS_STORAGE_KEY = "monitor_v3_custom_widgets";

function labelFromKind(kind: string) {
  return kind
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function pickMetrics(widget?: GrainWidgetRecord): Array<{ label: string; value: string; delta?: number }> {
  const metrics: Array<{ label: string; value: string; delta?: number }> = [];
  (widget?.rows || []).slice(0, 2).forEach((row) => {
    const current = row.price?.valueCurrent;
    const unit = row.price?.unit || "";
    if (typeof current === "number") {
      metrics.push({
        label: row.label || "Value",
        value: `${current.toFixed(2)} ${unit}`.trim(),
        delta: row.price?.changePct,
      });
    }
  });
  if (metrics.length > 0) return metrics;
  (widget?.items || []).slice(0, 2).forEach((row) => {
    if (typeof row.value === "number") {
      metrics.push({
        label: row.label || "Value",
        value: `${row.value.toFixed(2)} ${row.unit || ""}`.trim(),
        delta: row.changePct,
      });
    }
  });
  if (metrics.length > 0) return metrics;
  (widget?.cards || []).slice(0, 2).forEach((row) => {
    if (typeof row.value === "number") {
      metrics.push({
        label: row.title || "Value",
        value: `${row.value.toFixed(2)} ${row.unit || ""}`.trim(),
        delta: row.deltaPct,
      });
    }
  });
  return metrics;
}

function getStatusTone(status: string) {
  const key = status.toUpperCase();
  if (key === "REFRESH" || key === "LIVE") return "border-emerald-500/50 text-emerald-300";
  if (key === "INDICATIVE") return "border-cyan-500/50 text-cyan-300";
  if (key === "FALLBACK") return "border-blue-500/50 text-blue-300";
  return "border-red-500/50 text-red-300";
}

export default function MonitorV3Page() {
  const { theme, setTheme } = useTheme();
  const [role, setRole] = useState<MonitorRole>("all");
  const [topic, setTopic] = useState<MonitorTopic>("all");
  const [country, setCountry] = useState<Country>("US");
  const [showHidden, setShowHidden] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isAddWidgetOpen, setIsAddWidgetOpen] = useState(false);
  const [customWidgets, setCustomWidgets] = useState<GridWidget[]>([]);
  const [draft, setDraft] = useState<CustomWidgetDraft>({
    title: "",
    subtitle: "",
    source: "",
    topic: "markets",
  });

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

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CUSTOM_WIDGETS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as GridWidget[];
      if (!Array.isArray(parsed)) return;
      setCustomWidgets(parsed);
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(CUSTOM_WIDGETS_STORAGE_KEY, JSON.stringify(customWidgets));
    } catch {
      // noop
    }
  }, [customWidgets]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const coreWidgets = useMemo<GridWidget[]>(() => {
    const byKind = grainWidgetsQuery.data?.widgets?.byKind || {};
    const order = grainWidgetsQuery.data?.widgets?.order || Object.keys(byKind);
    return order
      .map((kind) => {
        const widget = byKind[kind];
        if (!widget) return null;
        return {
          id: kind,
          title: labelFromKind(kind),
          subtitle: widget.notes?.[0] || "Monitor widget",
          status: widget.status || "OFFLINE",
          source: widget.sourceName || "Unknown source",
          topic: KIND_TO_TOPIC[kind] || "markets",
          roles: KIND_TO_ROLES[kind] || ["farmer", "trader", "broker"],
          territory: widget.territory?.code || "GLOBAL",
          metrics: pickMetrics(widget),
        } satisfies GridWidget;
      })
      .filter((item): item is GridWidget => Boolean(item));
  }, [grainWidgetsQuery.data]);

  const widgets = useMemo(() => [...coreWidgets, ...customWidgets], [coreWidgets, customWidgets]);

  const [order, setOrder] = useState<string[]>([]);
  const [layoutById, setLayoutById] = useState<Record<string, GridLayout>>({});
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);

  const normalizedOrder = useMemo(() => {
    const current = widgets.map((widget) => widget.id);
    const known = order.filter((id) => current.includes(id));
    const appended = current.filter((id) => !known.includes(id));
    return [...known, ...appended];
  }, [order, widgets]);

  const widgetsById = useMemo(() => Object.fromEntries(widgets.map((widget) => [widget.id, widget])), [widgets]);

  const visibleWidgets = useMemo(() => {
    return normalizedOrder
      .map((id) => widgetsById[id])
      .filter((widget): widget is GridWidget => Boolean(widget))
      .filter((widget) => {
        if (hiddenIds.includes(widget.id) && !showHidden) return false;
        if (role !== "all" && !widget.roles.includes(role)) return false;
        if (topic !== "all" && widget.topic !== topic) return false;
        if (widget.territory !== "GLOBAL" && widget.territory !== country) return false;
        return true;
      });
  }, [normalizedOrder, widgetsById, hiddenIds, showHidden, role, topic, country]);

  const hiddenCount = hiddenIds.length;
  const feed = newsQuery.data?.feed || [];
  const topSignals = newsQuery.data?.topSignals || [];
  const filteredSignals = topSignals.filter((item) => {
    if (topic !== "all") {
      const tags = (item.topic_tags || []).map((tag) => tag.toLowerCase());
      if (!tags.includes(topic)) return false;
    }
    return true;
  });

  const resizeWidget = (id: string, axis: "w" | "h", delta: 1 | -1) => {
    setLayoutById((current) => {
      const prev = current[id] || { w: 1 as const, h: 1 as const };
      if (axis === "w") {
        const nextW = Math.max(1, Math.min(2, prev.w + delta)) as 1 | 2;
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
  };

  return (
    <div className="min-h-screen bg-[#05070d] text-[#e5ecff]">
      <header className="sticky top-0 z-40 border-b border-[#1b2438] bg-[#05070d]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1700px] items-center justify-between px-4 py-3">
          <div className="text-lg font-semibold tracking-wide">Cropto Monitor</div>
          <div className="hidden items-center gap-3 text-sm lg:flex">
            <span className="rounded border border-[#2a354f] px-3 py-1 text-[#9fb3de]">Global</span>
            <span className="rounded border border-[#2a354f] px-3 py-1 text-[#9fb3de]">Live</span>
            <span className="rounded border border-[#2a354f] px-3 py-1 text-[#9fb3de]">Commodity</span>
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="rounded border border-[#2a354f] px-3 py-1 text-[#9fb3de] hover:border-[#4c6ba0]"
              title="Toggle theme"
            >
              {theme === "dark" ? <Sun size={14} className="inline" /> : <Moon size={14} className="inline" />}
            </button>
            <button
              onClick={toggleFullscreen}
              className="rounded border border-[#2a354f] px-3 py-1 text-[#9fb3de] hover:border-[#4c6ba0]"
              title="Toggle fullscreen"
            >
              {isFullscreen ? <Minimize2 size={14} className="inline" /> : <Maximize2 size={14} className="inline" />}
            </button>
            <button
              onClick={() => setIsAddWidgetOpen(true)}
              className="rounded border border-[#7ca52f] bg-[#7ca52f]/20 px-3 py-1 text-[#d3ef9f] hover:bg-[#7ca52f]/30"
            >
              <Plus size={14} className="mr-1 inline" />
              Add widget
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-[1700px] flex-col gap-4 px-4 py-4">
        <section className="grid gap-3 xl:grid-cols-[2fr_1fr_1fr]">
          <div className="rounded border border-[#223150] bg-gradient-to-b from-[#0b1220] to-[#070b14] p-3">
            <div className="mb-2 text-xs uppercase tracking-[0.2em] text-[#7f93bf]">Global Situation</div>
            <div className="h-[280px] rounded border border-[#24314a] bg-[radial-gradient(circle_at_30%_20%,rgba(38,66,112,0.25),transparent_45%),radial-gradient(circle_at_75%_60%,rgba(134,40,40,0.2),transparent_40%),#05070d]" />
          </div>
          <div className="rounded border border-[#223150] bg-[#0a111d] p-3">
            <div className="mb-2 text-xs uppercase tracking-[0.2em] text-[#7f93bf]">Live Feed</div>
            <div className="space-y-2">
              {feed.slice(0, 4).map((item) => (
                <div key={item.id} className="rounded border border-[#24314a] p-2 text-sm">
                  <div className="line-clamp-2">{item.title}</div>
                  <div className="mt-1 text-xs text-[#8c9fc7]">{item.source_name}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded border border-[#223150] bg-[#0a111d] p-3">
            <div className="mb-2 text-xs uppercase tracking-[0.2em] text-[#7f93bf]">Video Rail</div>
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div key={idx} className="aspect-video rounded border border-dashed border-[#2d3e61] bg-[#07101c] p-2 text-xs text-[#7f93bf]">
                  Stream slot {idx + 1}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded border border-[#223150] bg-[#0a111d] p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-xs uppercase tracking-[0.2em] text-[#7f93bf]">Control Strip</div>
            <div className="h-4 w-px bg-[#2b3a56]" />
            <div className="flex flex-wrap gap-2">
              {ROLE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  onClick={() => setRole(option.id)}
                  className={cn(
                    "rounded border px-3 py-1 text-sm",
                    role === option.id
                      ? "border-[#7ca52f] bg-[#7ca52f]/20 text-[#d3ef9f]"
                      : "border-[#334769] text-[#b4c5ea]",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="h-4 w-px bg-[#2b3a56]" />
            <div className="flex flex-wrap gap-2">
              {TOPIC_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  onClick={() => setTopic(option.id)}
                  className={cn(
                    "rounded border px-3 py-1 text-xs uppercase tracking-[0.12em]",
                    topic === option.id
                      ? "border-[#58a6ff] bg-[#58a6ff]/15 text-[#a6ceff]"
                      : "border-[#334769] text-[#9bb1dd]",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="h-4 w-px bg-[#2b3a56]" />
            <select
              value={country}
              onChange={(event) => setCountry(event.target.value as Country)}
              className="rounded border border-[#334769] bg-[#07101c] px-3 py-1 text-sm text-[#dbe7ff]"
            >
              {COUNTRY_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowHidden((current) => !current)}
              className={cn(
                "rounded border px-3 py-1 text-sm",
                showHidden ? "border-[#d7b04b] bg-[#d7b04b]/15 text-[#f1d99f]" : "border-[#334769] text-[#9bb1dd]",
              )}
            >
              Hidden {hiddenCount}
            </button>
          </div>
        </section>

        <section className="grid gap-2 md:grid-cols-3">
          {filteredSignals.slice(0, 3).map((item, idx) => (
            <article key={item.id} className="rounded border border-[#2d3d5b] bg-[#0a111d] p-3">
              <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.15em] text-[#8aa2d1]">
                <span>Priority Signal #{idx + 1}</span>
                <span>{item.source_name}</span>
              </div>
              <h3 className="text-base font-semibold">{item.title}</h3>
              <p className="mt-1 line-clamp-2 text-sm text-[#a8b9dd]">{item.summary || "Signal summary unavailable."}</p>
            </article>
          ))}
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm uppercase tracking-[0.2em] text-[#7f93bf]">Main Widget Grid</h2>
            <div className="text-xs text-[#8aa2d1]">{visibleWidgets.length} active widgets</div>
          </div>
          <div className="grid auto-rows-[230px] grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
            {visibleWidgets.map((widget) => {
              const layout = layoutById[widget.id] || { w: 1 as const, h: 1 as const };
              return (
                <article
                  key={widget.id}
                  draggable
                  onDragStart={() => setDraggedId(widget.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (!draggedId || draggedId === widget.id) return;
                    setOrder((current) => {
                      const base = current.length > 0 ? current : normalizedOrder;
                      const next = base.filter((id) => id !== draggedId);
                      const targetIndex = next.indexOf(widget.id);
                      next.splice(targetIndex < 0 ? next.length : targetIndex, 0, draggedId);
                      return next;
                    });
                    setDraggedId(null);
                  }}
                  className="group relative overflow-hidden rounded border border-[#2c3d5f] bg-gradient-to-b from-[#0d1422] to-[#090e17] p-3"
                  style={{
                    gridColumn: `span ${layout.w} / span ${layout.w}`,
                    gridRow: `span ${layout.h} / span ${layout.h}`,
                    cursor: "grab",
                  }}
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="line-clamp-2 text-xl font-semibold leading-tight">{widget.title}</h3>
                      <p className="mt-1 line-clamp-2 text-sm text-[#9ab0dc]">{widget.subtitle}</p>
                    </div>
                    <button
                      onClick={() => {
                        setHiddenIds((current) => (current.includes(widget.id) ? current : [...current, widget.id]));
                        if (widget.id.startsWith("CUSTOM_")) {
                          setCustomWidgets((current) => current.filter((item) => item.id !== widget.id));
                        }
                      }}
                      className="rounded border border-[#364a72] px-2 py-1 text-[#a8bddf] hover:border-red-400 hover:text-red-300"
                      aria-label="Hide widget"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  <div className="mb-2 flex items-center gap-2 text-xs">
                    <span className={cn("rounded border px-2 py-0.5 uppercase tracking-[0.14em]", getStatusTone(widget.status))}>{widget.status}</span>
                    <span className="rounded border border-[#364a72] px-2 py-0.5 text-[#9db1d8]">{widget.source}</span>
                  </div>

                  <div className="space-y-2">
                    {widget.metrics.slice(0, layout.h === 2 ? 4 : 2).map((metric) => (
                      <div key={`${widget.id}-${metric.label}`} className="rounded border border-[#2f405f] bg-[#0a111d] p-2">
                        <div className="text-xs uppercase tracking-[0.15em] text-[#8ba0cb]">{metric.label}</div>
                        <div className="mt-1 text-lg font-semibold">{metric.value}</div>
                        {typeof metric.delta === "number" ? (
                          <div className={cn("text-xs", metric.delta >= 0 ? "text-emerald-300" : "text-red-300")}>
                            {metric.delta >= 0 ? "+" : ""}
                            {metric.delta.toFixed(2)}%
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  <button
                    className="absolute right-0 top-0 h-full w-2 cursor-ew-resize opacity-0 group-hover:opacity-100"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      const startX = event.clientX;
                      const onMove = (moveEvent: MouseEvent) => {
                        const delta = moveEvent.clientX - startX;
                        if (Math.abs(delta) < 48) return;
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
                    className="absolute bottom-0 left-0 h-2 w-full cursor-ns-resize opacity-0 group-hover:opacity-100"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      const startY = event.clientY;
                      const onMove = (moveEvent: MouseEvent) => {
                        const delta = moveEvent.clientY - startY;
                        if (Math.abs(delta) < 48) return;
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
        </section>
      </main>

      {isAddWidgetOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-xl rounded border border-[#2c3d5f] bg-[#0a111d] p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Add custom widget</h3>
              <button
                onClick={() => setIsAddWidgetOpen(false)}
                className="rounded border border-[#364a72] px-2 py-1 text-[#a8bddf] hover:border-red-400 hover:text-red-300"
              >
                <X size={14} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.15em] text-[#88a0ce]">Title</label>
                <input
                  value={draft.title}
                  onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                  className="w-full rounded border border-[#334769] bg-[#07101c] px-3 py-2 text-sm text-[#dbe7ff]"
                  placeholder="Widget title"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.15em] text-[#88a0ce]">Subtitle</label>
                <input
                  value={draft.subtitle}
                  onChange={(event) => setDraft((current) => ({ ...current, subtitle: event.target.value }))}
                  className="w-full rounded border border-[#334769] bg-[#07101c] px-3 py-2 text-sm text-[#dbe7ff]"
                  placeholder="What this widget tracks"
                />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-[0.15em] text-[#88a0ce]">Source</label>
                  <input
                    value={draft.source}
                    onChange={(event) => setDraft((current) => ({ ...current, source: event.target.value }))}
                    className="w-full rounded border border-[#334769] bg-[#07101c] px-3 py-2 text-sm text-[#dbe7ff]"
                    placeholder="API / RSS / Manual"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-[0.15em] text-[#88a0ce]">Topic</label>
                  <select
                    value={draft.topic}
                    onChange={(event) => setDraft((current) => ({ ...current, topic: event.target.value as CustomWidgetDraft["topic"] }))}
                    className="w-full rounded border border-[#334769] bg-[#07101c] px-3 py-2 text-sm text-[#dbe7ff]"
                  >
                    <option value="markets">Markets</option>
                    <option value="logistics">Logistics</option>
                    <option value="policy">Policy</option>
                    <option value="weather">Weather</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setIsAddWidgetOpen(false)}
                className="rounded border border-[#334769] px-3 py-1.5 text-sm text-[#b4c5ea]"
              >
                Cancel
              </button>
              <button
                onClick={addCustomWidget}
                className="rounded border border-[#7ca52f] bg-[#7ca52f]/20 px-3 py-1.5 text-sm text-[#d3ef9f]"
              >
                Add widget
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
