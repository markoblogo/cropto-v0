import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Globe, RefreshCw, Signal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type LiveVisualTile = {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  region: string;
  providerType: "embedded" | "image_refresh" | "external_link";
  renderMode: "embed" | "image" | "external" | "fallback";
  status: "LIVE" | "REFRESH" | "EXTERNAL" | "OFFLINE";
  sourceName: string;
  previewUrl?: string;
  externalUrl: string;
  refreshIntervalSec?: number;
  checkedAt: string;
  updatedAt?: string;
  statusHint?: string;
  attribution?: string;
  tags: string[];
  error?: string;
};

type LiveVisualsResponse = {
  enabled: boolean;
  settings: {
    maxTiles: number;
    autoRefreshEnabled: boolean;
    defaultRefreshSec: number;
  };
  summary: {
    total: number;
    enabled: number;
    active: number;
    disabled: number;
    fallback: number;
    shownSourceIds: string[];
  };
  tiles: LiveVisualTile[];
};

function statusClass(status: LiveVisualTile["status"]) {
  if (status === "LIVE") return "border-emerald-400/45 bg-emerald-500/20 text-emerald-100";
  if (status === "REFRESH") return "border-blue-400/45 bg-blue-500/20 text-blue-100";
  if (status === "EXTERNAL") return "border-amber-400/45 bg-amber-500/20 text-amber-100";
  return "border-red-400/45 bg-red-500/20 text-red-100";
}

function providerLabel(providerType: LiveVisualTile["providerType"]) {
  if (providerType === "embedded") return "Embed";
  if (providerType === "image_refresh") return "Snapshot";
  return "External";
}

function renderRelative(iso?: string) {
  if (!iso) return "n/a";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "n/a";
  const diffMin = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function TilePreview({ tile, large, autoRefreshEnabled, compact }: { tile: LiveVisualTile; large: boolean; autoRefreshEnabled: boolean; compact: boolean }) {
  const [refreshTick, setRefreshTick] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const [embedFailed, setEmbedFailed] = useState(false);
  const previewHeight = large ? (compact ? "h-[170px] lg:h-[185px]" : "h-[210px] lg:h-[230px]") : (compact ? "h-[110px]" : "h-[124px]");

  useEffect(() => {
    setEmbedFailed(false);
    setImageFailed(false);
  }, [tile.id, tile.previewUrl, tile.renderMode]);

  useEffect(() => {
    if (tile.renderMode !== "image") return;
    if (!autoRefreshEnabled) return;
    const intervalSec = tile.refreshIntervalSec || 60;
    const timer = window.setInterval(() => setRefreshTick((value) => value + 1), intervalSec * 1000);
    return () => window.clearInterval(timer);
  }, [tile.renderMode, tile.refreshIntervalSec, autoRefreshEnabled]);

  if (tile.renderMode === "embed" && tile.previewUrl && !embedFailed) {
    return (
      <div className={`relative ${previewHeight} w-full overflow-hidden rounded-md border border-white/12 bg-slate-950/60`}>
        <iframe
          title={tile.title}
          src={tile.previewUrl}
          className="h-full w-full"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          sandbox="allow-scripts allow-same-origin allow-popups"
          onError={() => setEmbedFailed(true)}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-slate-950/80 to-transparent" />
      </div>
    );
  }

  if (tile.renderMode === "embed" && embedFailed) {
    return (
      <div className={`flex ${previewHeight} w-full flex-col justify-between rounded-md border border-white/12 bg-[linear-gradient(160deg,rgba(148,163,184,0.14),rgba(15,23,42,0.85)_38%,rgba(15,23,42,0.92))] p-3`}>
        <div className="flex items-center gap-2 text-slate-200">
          <span className="rounded-full border border-primary/35 bg-primary/12 p-1.5">
            <Globe className="h-3.5 w-3.5 text-primary-foreground" />
          </span>
          <p className="text-xs font-medium">Embed unavailable</p>
        </div>
        <p className="text-xs leading-5 text-slate-300/95 line-clamp-3">
          This media source blocked embedding. Open the official source page.
        </p>
        <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">External fallback mode</p>
      </div>
    );
  }

  if (tile.renderMode === "image" && tile.previewUrl && !imageFailed) {
    const src = autoRefreshEnabled ? `${tile.previewUrl}${tile.previewUrl.includes("?") ? "&" : "?"}t=${refreshTick}` : tile.previewUrl;
    return (
      <div className={`relative ${previewHeight} w-full overflow-hidden rounded-md border border-white/12 bg-slate-950/60`}>
        <img
          src={src}
          alt={tile.title}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-slate-950/80 to-transparent" />
      </div>
    );
  }

  if (tile.renderMode === "external") {
    return (
      <div className={`flex ${previewHeight} w-full flex-col justify-between rounded-md border border-white/12 bg-[linear-gradient(160deg,rgba(148,163,184,0.14),rgba(15,23,42,0.85)_38%,rgba(15,23,42,0.92))] p-3`}>
        <div className="flex items-center gap-2 text-slate-200">
          <span className="rounded-full border border-primary/35 bg-primary/12 p-1.5">
            <Globe className="h-3.5 w-3.5 text-primary-foreground" />
          </span>
          <p className="text-xs font-medium">{tile.category} Visual Source</p>
        </div>
        <p className="text-xs leading-5 text-slate-300/95 line-clamp-3">
          {tile.subtitle || "Open source page for live context and operational visuals."}
        </p>
        <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">External source preview mode</p>
      </div>
    );
  }

  return (
    <div className={`flex ${previewHeight} w-full items-center justify-center rounded-md border border-dashed border-white/20 bg-slate-900/80 px-3 text-center text-xs text-slate-400`}>
      Source preview unavailable. Open source for live feed.
    </div>
  );
}

function LiveVisualTileCard({ tile, large, autoRefreshEnabled, compact }: { tile: LiveVisualTile; large?: boolean; autoRefreshEnabled: boolean; compact: boolean }) {
  return (
    <div className={`flex h-full flex-col rounded-xl border border-white/12 bg-slate-950/78 ${compact ? "p-2.5" : "p-3"}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <Badge className={`text-[10px] uppercase tracking-wide ${statusClass(tile.status)}`}>{tile.status}</Badge>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-400">{tile.category}</span>
          <span className="rounded-full border border-white/20 bg-white/5 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-slate-300">
            {providerLabel(tile.providerType)}
          </span>
        </div>
      </div>

      <div className="mb-2 space-y-1">
        <p className={`font-semibold text-slate-100 line-clamp-1 ${large ? "text-base" : "text-sm"}`}>{tile.title}</p>
        <p className="text-xs text-slate-400 line-clamp-1">{tile.region} • {tile.subtitle}</p>
      </div>

      <TilePreview tile={tile} large={!!large} autoRefreshEnabled={autoRefreshEnabled} compact={compact} />

      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-400">
        <span className="truncate">{tile.sourceName}</span>
        <span>{renderRelative(tile.updatedAt || tile.checkedAt)}</span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {(tile.tags || []).slice(0, 2).map((tag) => (
            <span key={`${tile.id}-${tag}`} className="rounded-full border border-white/20 bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-300">
              {tag}
            </span>
          ))}
        </div>
        <Button asChild size="sm" variant="outline" className="h-7 border-primary/30 text-xs text-slate-100 hover:border-primary/55">
          <a href={tile.externalUrl} target="_blank" rel="noreferrer">
            Open Source
            <ExternalLink className="ml-1 h-3 w-3" />
          </a>
        </Button>
      </div>
    </div>
  );
}

export function LiveVisualsPanel({ debugEnabled = false, compact = false }: { debugEnabled?: boolean; compact?: boolean }) {
  const query = useQuery<LiveVisualsResponse>({
    queryKey: ["monitor-live-visuals"],
    queryFn: async () => {
      const response = await fetch("/api/monitor/live-visuals");
      if (!response.ok) throw new Error("Failed to load live visuals");
      return response.json();
    },
    refetchInterval: 60 * 1000,
  });

  const tiles = query.data?.tiles || [];
  const primary = tiles[0];
  const secondary = tiles.slice(1, 4);
  const summary = query.data?.summary;

  const fallbackCount = useMemo(() => tiles.filter((tile) => tile.renderMode === "fallback").length, [tiles]);

  if (query.data && !query.data.enabled) {
    return null;
  }

  return (
    <Card className="border-primary/30 bg-slate-950/72 text-slate-100 shadow-[0_14px_40px_rgba(0,0,0,0.35)]">
      <CardHeader className={compact ? "pb-3" : undefined}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-lg">Live Logistics & Market Visuals</CardTitle>
            <CardDescription className="text-slate-400">Near-live port, logistics, weather and market media context</CardDescription>
          </div>
          <Badge className="border-primary/40 bg-primary/15 text-[10px] uppercase tracking-[0.16em] text-primary-foreground">
            Live Visuals
          </Badge>
        </div>
      </CardHeader>
      <CardContent className={compact ? "space-y-2" : "space-y-3"}>
        {!primary ? (
          <div className="rounded-lg border border-dashed border-white/20 bg-slate-900/70 p-4 text-sm text-slate-400">
            Live visuals coming soon.
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-12">
            <div className="xl:col-span-7">
              <LiveVisualTileCard tile={primary} large autoRefreshEnabled={!!query.data?.settings.autoRefreshEnabled} compact={compact} />
            </div>
            <div className="xl:col-span-5 grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-2">
              {secondary.map((tile) => (
                <LiveVisualTileCard key={tile.id} tile={tile} autoRefreshEnabled={!!query.data?.settings.autoRefreshEnabled} compact={compact} />
              ))}
              {!secondary.length ? (
                <div className="rounded-xl border border-dashed border-white/20 bg-slate-900/75 p-3 text-sm text-slate-400">No secondary tiles configured.</div>
              ) : null}
            </div>
          </div>
        )}

        <div className={`flex flex-wrap items-center gap-2 text-slate-400 ${compact ? "text-[11px]" : "text-xs"}`}>
          <span className="inline-flex items-center gap-1"><Signal className="h-3 w-3" /> tiles: {tiles.length}</span>
          <span className="inline-flex items-center gap-1"><RefreshCw className="h-3 w-3" /> auto-refresh: {query.data?.settings.autoRefreshEnabled ? "on" : "off"}</span>
          {fallbackCount > 0 ? <span>fallback: {fallbackCount}</span> : null}
        </div>

        {debugEnabled && summary ? (
          <div className="rounded-md border border-amber-500/35 bg-amber-500/10 p-2.5 text-xs text-amber-100">
            <p>sources: {summary.enabled}/{summary.total} enabled, active tiles: {summary.active}, disabled: {summary.disabled}, fallback: {summary.fallback}</p>
            <p>shown ids: {summary.shownSourceIds.join(", ") || "none"}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
