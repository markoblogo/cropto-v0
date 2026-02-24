import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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

const CROPS = ["all", "wheat", "corn", "soy", "rapeseed", "sunflower", "barley", "oilseeds"] as const;
const TOPICS = ["all", "markets", "trade", "logistics", "weather", "policy", "harvest"] as const;
const REGIONS = ["all", "black sea", "eu", "us", "latam", "asia"];

function TopicTag({ value, kind }: { value: string; kind: "crop" | "topic" | "region" }) {
  const classes =
    kind === "crop"
      ? "border-primary/35 bg-primary/10 text-foreground"
      : kind === "region"
        ? "border-blue-500/35 bg-blue-500/10 text-foreground"
        : "border-border/70 bg-muted/65 text-foreground";
  return (
    <Badge variant="secondary" className={`text-[11px] capitalize ${classes}`}>
      {value}
    </Badge>
  );
}

export default function MonitorPage() {
  const [crop, setCrop] = useState("all");
  const [topic, setTopic] = useState("all");
  const [region, setRegion] = useState("all");
  const [time, setTime] = useState<"24h" | "7d">("24h");
  const [search, setSearch] = useState("");
  const [threshold, setThreshold] = useState(3);

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

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="secondary" className="border border-primary/30 bg-primary/10 text-[11px] uppercase tracking-[0.16em]">
            Cropto Monitor
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Commodity Signals Monitor</h1>
          <p className="max-w-3xl text-base text-muted-foreground">
            Thematic monitoring for grains and oilseeds: markets, logistics, weather, and policy context with Cropto internal indices.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-primary/45 bg-gradient-to-br from-primary/14 via-card to-muted/20 shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-xl">Cropto Indices / Ukraine</CardTitle>
                <Badge className="border-primary/35 bg-primary/15 text-foreground">Core signal layer</Badge>
              </div>
              <CardDescription>Internal index feed adapter</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!indicesQuery.data?.enabled ? (
                <p className="text-sm text-muted-foreground">Coming soon</p>
              ) : indicesQuery.data?.items?.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {indicesQuery.data.items.slice(0, 8).map((item) => (
                    <div key={item.slug} className="rounded-lg border border-black/80 bg-background/80 p-3 dark:border-white/80">
                      <p className="text-sm font-semibold tracking-tight text-foreground">{item.name}</p>
                      <div className="mt-1 flex items-end justify-between">
                        <p className="text-2xl font-bold leading-none">${item.value.toFixed(2)}</p>
                        <p className={`text-xs font-semibold ${item.change != null && item.change >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {item.change != null ? `${item.change >= 0 ? "+" : ""}${item.change.toFixed(2)}` : "n/a"}
                        </p>
                      </div>
                      <p className="mt-2 text-[11px] text-muted-foreground">{new Date(item.updatedAt).toLocaleString()}</p>
                      <p className="text-[11px] text-muted-foreground">{item.source}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No index snapshots available yet.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-card/90 shadow-md">
            <CardHeader>
              <CardTitle className="text-xl">Macro / FX Snapshot</CardTitle>
              <CardDescription>Lightweight cross-currency context</CardDescription>
            </CardHeader>
            <CardContent>
              {fxQuery.data?.mode === "live" && fxQuery.data.rates.length > 0 ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {fxQuery.data.rates.map((rate) => (
                      <div key={rate.currency} className="rounded-lg border border-black/80 bg-background/70 p-2.5 dark:border-white/80">
                        <p className="text-xs text-muted-foreground">{rate.currency}</p>
                        <p className="text-base font-semibold">{rate.usdPerUnit.toFixed(4)}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {fxQuery.data.source || "FX"} • {fxQuery.data.asOf ? new Date(fxQuery.data.asOf).toLocaleString() : "n/a"}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Coming soon. {fxQuery.data?.message || "Macro widget is temporarily unavailable."}</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/80 bg-card/90 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Filters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-5">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Crop</p>
                <div className="flex flex-wrap gap-1.5">
                  {CROPS.map((item) => (
                    <Button key={item} size="sm" variant={crop === item ? "default" : "outline"} onClick={() => setCrop(item)} className="h-7 px-2.5 text-xs capitalize">
                      {item}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Topic</p>
                <div className="flex flex-wrap gap-1.5">
                  {TOPICS.map((item) => (
                    <Button key={item} size="sm" variant={topic === item ? "default" : "outline"} onClick={() => setTopic(item)} className="h-7 px-2.5 text-xs capitalize">
                      {item}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Region</p>
                <div className="flex flex-wrap gap-1.5">
                  {REGIONS.map((item) => (
                    <Button key={item} size="sm" variant={region === item ? "default" : "outline"} onClick={() => setRegion(item)} className="h-7 px-2.5 text-xs capitalize">
                      {item}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Time</p>
                <div className="flex gap-1.5">
                  <Button size="sm" variant={time === "24h" ? "default" : "outline"} onClick={() => setTime("24h")} className="h-7 px-3 text-xs">
                    24h
                  </Button>
                  <Button size="sm" variant={time === "7d" ? "default" : "outline"} onClick={() => setTime("7d")} className="h-7 px-3 text-xs">
                    7d
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Search</p>
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Keyword" className="h-8" />
              </div>
            </div>
            {debugEnabled ? (
              <div className="flex items-center gap-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Threshold</p>
                {[2, 3, 4, 5].map((value) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={threshold === value ? "default" : "outline"}
                    className="h-7 px-2.5 text-xs"
                    onClick={() => setThreshold(value)}
                  >
                    {value}
                  </Button>
                ))}
                <p className="text-xs text-muted-foreground">Use `?debug=1` to tune signal strictness.</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <Card className="border-primary/35 bg-gradient-to-br from-primary/10 via-card to-card shadow-md">
              <CardHeader>
                <CardTitle>Top Signals</CardTitle>
                <CardDescription>Highest relevance items in current filter scope</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(monitorQuery.data?.topSignals || []).slice(0, 8).map((item, idx) => (
                  <a key={`signal-${item.id}`} href={item.url} target="_blank" rel="noreferrer" className="block rounded-lg border border-black/80 bg-background/75 p-3 transition-all hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-md dark:border-white/80">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold leading-6 text-foreground">{item.title}</p>
                      <Badge className="border-primary/35 bg-primary/15 text-[10px]">#{idx + 1}</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.crop_tags.slice(0, 2).map((tag) => (
                        <TopicTag key={`crop-${item.id}-${tag}`} value={tag} kind="crop" />
                      ))}
                      {item.topic_tags.slice(0, 2).map((tag) => (
                        <TopicTag key={`topic-${item.id}-${tag}`} value={tag} kind="topic" />
                      ))}
                      {item.region_tags.slice(0, 1).map((tag) => (
                        <TopicTag key={`region-${item.id}-${tag}`} value={tag} kind="region" />
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {item.source_name} • score {item.relevance_score} • {new Date(item.published_at).toLocaleString()}
                    </p>
                  </a>
                ))}
              </CardContent>
            </Card>

            <Card className="border-border/80 bg-card/95 shadow-sm">
              <CardHeader>
                <CardTitle>News Feed</CardTitle>
                <CardDescription>Rule-based thematic filtering with dedup</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {feed.map((item) => (
                  <article key={item.id} className="rounded-lg border border-black/80 bg-background/75 p-3 dark:border-white/80">
                    <a href={item.url} target="_blank" rel="noreferrer" className="text-sm font-semibold leading-6 text-foreground hover:text-primary">
                      {item.title}
                    </a>
                    {item.summary ? <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{item.summary}</p> : null}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.crop_tags.slice(0, 2).map((tag) => (
                        <TopicTag key={`feed-crop-${item.id}-${tag}`} value={tag} kind="crop" />
                      ))}
                      {item.topic_tags.slice(0, 3).map((tag) => (
                        <TopicTag key={`feed-topic-${item.id}-${tag}`} value={tag} kind="topic" />
                      ))}
                      {item.region_tags.slice(0, 2).map((tag) => (
                        <TopicTag key={`feed-region-${item.id}-${tag}`} value={tag} kind="region" />
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {item.source_name} • score {item.relevance_score} • {new Date(item.published_at).toLocaleString()}
                    </p>
                  </article>
                ))}
                {!feed.length ? <p className="text-sm text-muted-foreground">No items found for current filters.</p> : null}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="border-border/80 bg-card/95 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Logistics / Shipping</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(monitorQuery.data?.sidePanels.logistics || []).slice(0, 8).map((item) => (
                  <a key={`log-${item.id}`} href={item.url} target="_blank" rel="noreferrer" className="block rounded-md border border-border/70 bg-background/70 p-2.5 text-sm hover:border-primary/35">
                    <p className="line-clamp-2 font-medium">{item.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.source_name}</p>
                  </a>
                ))}
                {!(monitorQuery.data?.sidePanels.logistics || []).length ? (
                  <p className="text-sm text-muted-foreground">No logistics items in current scope.</p>
                ) : null}
              </CardContent>
            </Card>

            <Card className="border-border/80 bg-card/95 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Policy & Trade</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(monitorQuery.data?.sidePanels.policy || []).slice(0, 8).map((item) => (
                  <a key={`pol-${item.id}`} href={item.url} target="_blank" rel="noreferrer" className="block rounded-md border border-border/70 bg-background/70 p-2.5 text-sm hover:border-primary/35">
                    <p className="line-clamp-2 font-medium">{item.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.source_name}</p>
                  </a>
                ))}
                {!(monitorQuery.data?.sidePanels.policy || []).length ? (
                  <p className="text-sm text-muted-foreground">No policy/trade items in current scope.</p>
                ) : null}
              </CardContent>
            </Card>

            <Card className="border-dashed border-border/70 bg-muted/25">
              <CardHeader>
                <CardTitle className="text-base">Weather Risk</CardTitle>
                <CardDescription>Coming soon</CardDescription>
              </CardHeader>
            </Card>

            {debugEnabled ? (
              <Card className="border-amber-500/45 bg-amber-500/5">
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
        </div>
      </div>
    </MainLayout>
  );
}
