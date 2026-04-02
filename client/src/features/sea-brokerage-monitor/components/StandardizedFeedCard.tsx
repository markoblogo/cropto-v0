import { useMemo, useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EntryDetailSheet } from "./EntryDetailSheet";
import { MonitorEmptyState } from "./MonitorEmptyState";
import { exportEntriesToCsv, exportEntriesToXlsx } from "../services/export.service";
import {
  buildFeedAnalyticsSeries,
} from "../services/feedFilters.service";
import { generateMatchSuggestions } from "../services/matchingEngine.service";
import {
  formatEntryCommodityCompact,
  formatEntryDateTime,
  formatEntryDestinationCompact,
  formatEntryPeriodCompact,
  formatEntryPriceRange,
} from "../services/entryFormatting.service";
import type { BrokerageEntry } from "../types";

interface StandardizedFeedCardProps {
  entries: BrokerageEntry[];
  onOpenReport?: () => void;
}

type FeedSecondaryView = "tape" | "archive" | "analytics";
type AnalyticsCurrencyMode = "all" | "usd" | "eur";

const FX_TO_USD: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  UAH: 0.024,
};

const ANALYTICS_PIVOT_BROKER_LIMIT = 6;
const ANALYTICS_TOP_COMMODITY_LIMIT = 8;
const ANALYTICS_TOP_DESTINATIONS = 8;

function getEntryMidPrice(entry: BrokerageEntry) {
  if (typeof entry.price === "number") return entry.price;
  if (typeof entry.priceFrom === "number" && typeof entry.priceTo === "number") {
    return (entry.priceFrom + entry.priceTo) / 2;
  }
  if (typeof entry.priceFrom === "number") return entry.priceFrom;
  if (typeof entry.priceTo === "number") return entry.priceTo;
  return null;
}

function toUsd(value: number, currency: string) {
  const rate = FX_TO_USD[String(currency || "").toUpperCase()];
  if (!rate) return null;
  return value * rate;
}

function shouldIncludeEntryByCurrency(entry: BrokerageEntry, mode: AnalyticsCurrencyMode) {
  if (mode === "all") return true;
  return String(entry.currency || "").toLowerCase() === mode;
}

function minuteDiffAbs(aIso: string, bIso: string) {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.abs(Math.round((a - b) / (1000 * 60)));
}

function formatHourLabel(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function mapMatchCommodityKey(entry: BrokerageEntry) {
  return (entry.commodityLabel || entry.commodity || "").trim().toUpperCase() || "OTHER";
}

function formatSigned(value: number) {
  if (value > 0) return `+${value}`;
  return `${value}`;
}

function TapeTypeBadge({ type }: { type: BrokerageEntry["type"] }) {
  if (type === "trade") {
    return (
      <span className="shrink-0 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">
        TRADE IDEA
      </span>
    );
  }

  return (
    <span
      className={
        type === "bid"
          ? "shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700"
          : "shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700"
      }
    >
      {type === "bid" ? "BID IDEA" : "OFFER IDEA"}
    </span>
  );
}

export function StandardizedFeedCard({ entries, onOpenReport }: StandardizedFeedCardProps) {
  const [selectedEntry, setSelectedEntry] = useState<BrokerageEntry | null>(null);
  const [view, setView] = useState<FeedSecondaryView>("tape");
  const [analyticsCurrency, setAnalyticsCurrency] = useState<AnalyticsCurrencyMode>("all");

  const analyticsData = useMemo(() => buildFeedAnalyticsSeries(entries), [entries]);
  const bidCount = entries.filter((entry) => entry.type === "bid").length;
  const offerCount = entries.filter((entry) => entry.type === "offer").length;
  const tradeCount = entries.filter((entry) => entry.type === "trade").length;
  const matches = useMemo(() => generateMatchSuggestions(entries), [entries]);

  const { kpis, hourlySeries, priceDots, spreadByBasis, destinationVolume, pivot, matchAnalytics, timelineMarkers } =
    useMemo(() => {
      const now = new Date();
      const todayKey = now.toISOString().slice(0, 10);
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayKey = yesterday.toISOString().slice(0, 10);

      const filteredForCurrency = entries.filter((entry) =>
        shouldIncludeEntryByCurrency(entry, analyticsCurrency),
      );

      const hourlyBuckets = Array.from({ length: 24 }, (_, hour) => ({
        hour,
        label: formatHourLabel(hour),
        bids: 0,
        offers: 0,
        trades: 0,
      }));

      const commodityVolume = new Map<string, number>();
      const destinationAgg = new Map<string, number>();
      const priceDotsRaw: Array<{
        commodity: string;
        basis: string;
        currency: string;
        price: number;
        priceUsd: number | null;
      }> = [];
      const basisSpreadAgg = new Map<string, { spreadSum: number; count: number }>();

      const brokerTotals = new Map<string, number>();
      const commodityByBroker = new Map<string, Map<string, number>>();

      let todayActivity = 0;
      let yesterdayActivity = 0;

      for (const entry of filteredForCurrency) {
        const createdAt = new Date(entry.createdAt);
        if (!Number.isNaN(createdAt.getTime())) {
          const hour = createdAt.getHours();
          if (entry.type === "bid") hourlyBuckets[hour].bids += 1;
          if (entry.type === "offer") hourlyBuckets[hour].offers += 1;
          if (entry.type === "trade") hourlyBuckets[hour].trades += 1;
        }

        const dayKey = entry.createdAt.slice(0, 10);
        if (dayKey === todayKey) todayActivity += 1;
        if (dayKey === yesterdayKey) yesterdayActivity += 1;

        if (entry.type === "bid" || entry.type === "offer") {
          const commodityKey = mapMatchCommodityKey(entry);
          const quantity = Number(entry.quantityMt ?? entry.volumeTo ?? entry.volumeFrom ?? 0);
          commodityVolume.set(commodityKey, (commodityVolume.get(commodityKey) || 0) + (Number.isFinite(quantity) ? quantity : 0));

          const destinationKey = `${entry.basis} ${formatEntryDestinationCompact(entry)}`.trim();
          destinationAgg.set(destinationKey, (destinationAgg.get(destinationKey) || 0) + (Number.isFinite(quantity) ? quantity : 0));

          const midPrice = getEntryMidPrice(entry);
          if (midPrice !== null && Number.isFinite(midPrice)) {
            priceDotsRaw.push({
              commodity: commodityKey,
              basis: entry.basis,
              currency: entry.currency,
              price: midPrice,
              priceUsd: toUsd(midPrice, entry.currency),
            });
          }
        }

        const broker = entry.brokerCode || "N/A";
        brokerTotals.set(broker, (brokerTotals.get(broker) || 0) + 1);
        const commodityKey = mapMatchCommodityKey(entry);
        const byCommodity = commodityByBroker.get(commodityKey) || new Map<string, number>();
        byCommodity.set(broker, (byCommodity.get(broker) || 0) + 1);
        commodityByBroker.set(commodityKey, byCommodity);
      }

      for (const match of matches) {
        const basis = String(match.offerEntry.basis || match.bidEntry.basis || "N/A");
        if (typeof match.priceDelta === "number" && Number.isFinite(match.priceDelta)) {
          const current = basisSpreadAgg.get(basis) || { spreadSum: 0, count: 0 };
          current.spreadSum += Math.abs(match.priceDelta);
          current.count += 1;
          basisSpreadAgg.set(basis, current);
        }
      }

      const avgSpread = (() => {
        const deltas = matches
          .map((match) => (typeof match.priceDelta === "number" ? Math.abs(match.priceDelta) : null))
          .filter((value): value is number => value !== null && Number.isFinite(value));
        if (!deltas.length) return null;
        return deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
      })();

      const topCommodityByVolume = Array.from(commodityVolume.entries())
        .sort((a, b) => b[1] - a[1])[0] || null;

      const matchRate = bidCount + offerCount > 0 ? (matches.length / (bidCount + offerCount)) * 100 : 0;
      const activityDelta = todayActivity - yesterdayActivity;

      const spreadByBasisRows = Array.from(basisSpreadAgg.entries())
        .map(([basis, agg]) => ({
          basis,
          avgSpread: agg.count > 0 ? Number((agg.spreadSum / agg.count).toFixed(2)) : 0,
          count: agg.count,
        }))
        .sort((a, b) => a.basis.localeCompare(b.basis));

      const destinationRows = Array.from(destinationAgg.entries())
        .map(([destination, volume]) => ({ destination, volume: Math.round(volume) }))
        .sort((a, b) => b.volume - a.volume)
        .slice(0, ANALYTICS_TOP_DESTINATIONS);

      const topBrokers = Array.from(brokerTotals.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, ANALYTICS_PIVOT_BROKER_LIMIT)
        .map(([code]) => code);

      const pivotRows = Array.from(commodityByBroker.entries())
        .sort((a, b) => {
          const aTotal = Array.from(a[1].values()).reduce((sum, value) => sum + value, 0);
          const bTotal = Array.from(b[1].values()).reduce((sum, value) => sum + value, 0);
          return bTotal - aTotal;
        })
        .slice(0, ANALYTICS_TOP_COMMODITY_LIMIT)
        .map(([commodity, byBroker]) => {
          const row: Record<string, string | number> = { commodity };
          let total = 0;
          for (const broker of topBrokers) {
            const value = byBroker.get(broker) || 0;
            row[broker] = value;
            total += value;
          }
          row.total = total;
          return row;
        });

      const matchedEntryIds = new Set<string>();
      for (const match of matches) {
        matchedEntryIds.add(match.bidEntryId);
        matchedEntryIds.add(match.offerEntryId);
      }

      const commodityMatchAgg = new Map<string, { matched: number; unmatched: number }>();
      for (const entry of filteredForCurrency.filter((item) => item.type === "bid" || item.type === "offer")) {
        const key = mapMatchCommodityKey(entry);
        const current = commodityMatchAgg.get(key) || { matched: 0, unmatched: 0 };
        if (matchedEntryIds.has(entry.id)) current.matched += 1;
        else current.unmatched += 1;
        commodityMatchAgg.set(key, current);
      }

      const matchToCloseMinutes = matches
        .map((match) => minuteDiffAbs(match.bidEntry.createdAt, match.offerEntry.createdAt))
        .filter((value): value is number => value !== null);

      const firstTrade = filteredForCurrency
        .filter((entry) => entry.type === "trade")
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
      const firstMatch = matches
        .map((match) => {
          const time = Math.max(
            new Date(match.bidEntry.createdAt).getTime(),
            new Date(match.offerEntry.createdAt).getTime(),
          );
          return Number.isNaN(time) ? null : time;
        })
        .filter((value): value is number => value !== null)
        .sort((a, b) => a - b)[0];

      const timeline = [
        firstTrade
          ? {
              label: "First trade",
              x: formatHourLabel(new Date(firstTrade.createdAt).getHours()),
            }
          : null,
        firstMatch
          ? {
              label: "First match",
              x: formatHourLabel(new Date(firstMatch).getHours()),
            }
          : null,
      ].filter(Boolean) as Array<{ label: string; x: string }>;

      const matchSpreadTrend = matches
        .map((match) => {
          const delta = typeof match.priceDelta === "number" ? Math.abs(match.priceDelta) : null;
          if (delta === null) return null;
          const createdAt = new Date(
            Math.max(
              new Date(match.bidEntry.createdAt).getTime(),
              new Date(match.offerEntry.createdAt).getTime(),
            ),
          );
          if (Number.isNaN(createdAt.getTime())) return null;
          return {
            label: `${String(createdAt.getHours()).padStart(2, "0")}:${String(
              createdAt.getMinutes(),
            ).padStart(2, "0")}`,
            delta: Number(delta.toFixed(2)),
          };
        })
        .filter((item): item is { label: string; delta: number } => !!item)
        .slice(-24);

      return {
        kpis: {
          matchRate: Number(matchRate.toFixed(1)),
          avgSpread: avgSpread === null ? null : Number(avgSpread.toFixed(2)),
          topCommodityByVolume,
          todayActivity,
          yesterdayActivity,
          activityDelta,
        },
        hourlySeries: hourlyBuckets,
        priceDots: priceDotsRaw.slice(0, 500),
        spreadByBasis: spreadByBasisRows,
        destinationVolume: destinationRows,
        pivot: {
          brokers: topBrokers,
          rows: pivotRows,
        },
        matchAnalytics: {
          spreadTrend: matchSpreadTrend,
          avgTimeToCloseMin:
            matchToCloseMinutes.length > 0
              ? Number(
                  (
                    matchToCloseMinutes.reduce((sum, value) => sum + value, 0) /
                    matchToCloseMinutes.length
                  ).toFixed(1),
                )
              : null,
          byCommodity: Array.from(commodityMatchAgg.entries())
            .map(([commodity, value]) => ({ commodity, ...value }))
            .sort((a, b) => b.matched + b.unmatched - (a.matched + a.unmatched))
            .slice(0, ANALYTICS_TOP_COMMODITY_LIMIT),
        },
        timelineMarkers: timeline,
      };
    }, [entries, analyticsCurrency, bidCount, offerCount, matches]);

  return (
    <>
      <Card className="overflow-hidden border-border/70 bg-card/95 shadow-sm">
        <CardHeader className="space-y-4 border-b border-border/60 pb-4">
          <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <CardTitle className="text-lg">Broker Tape</CardTitle>
              <CardDescription>
                Unified chronological tape of standardized BID, OFFER, and TRADE ideas.
              </CardDescription>
            </div>

            <div className="flex min-w-0 flex-wrap items-stretch gap-2">
              <div className="flex min-h-[40px] flex-wrap items-center gap-1.5 rounded-md border border-border/60 px-2 py-1">
                <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Stats</span>
                <Badge variant="outline">{entries.length} visible</Badge>
                <Badge variant="outline">BIDs {bidCount}</Badge>
                <Badge variant="outline">OFFERS {offerCount}</Badge>
                <Badge variant="outline">TRADES {tradeCount}</Badge>
              </div>

              <div className="flex min-h-[40px] flex-wrap items-center gap-1.5 rounded-md border border-border/60 px-2 py-1">
                <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Export</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8"
                  onClick={() => exportEntriesToCsv(entries)}
                  disabled={entries.length === 0}
                >
                  <Download className="mr-2 h-4 w-4" />
                  CSV
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8"
                  onClick={() => exportEntriesToXlsx(entries)}
                  disabled={entries.length === 0}
                >
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  XLSX
                </Button>
              </div>

              {onOpenReport ? (
                <div className="flex min-h-[40px] items-center rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1">
                  <span className="mr-2 text-[10px] uppercase tracking-[0.14em] text-emerald-200/80">Report</span>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="h-8 bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-500"
                    onClick={onOpenReport}
                  >
                    Report
                  </Button>
                </div>
              ) : null}

              <div className="flex min-h-[40px] flex-wrap items-center gap-1.5 rounded-md border border-border/60 px-2 py-1">
                <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">View</span>
                <Button
                  variant={view === "tape" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8"
                  onClick={() => setView("tape")}
                >
                  Tape
                </Button>
                <Button
                  variant={view === "archive" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8"
                  onClick={() => setView("archive")}
                >
                  Archive
                </Button>
                <Button
                  variant={view === "analytics" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8"
                  onClick={() => setView("analytics")}
                >
                  Analytics
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {view === "tape" ? (
            entries.length === 0 ? (
              <div className="p-6">
                <MonitorEmptyState
                  title="No tape entries"
                  description="Adjust filters or create a new BID, OFFER, or TRADE to populate the broker tape."
                />
              </div>
            ) : (
              <ScrollArea className="h-[620px]">
                <div className="divide-y divide-border/60">
                  {entries.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setSelectedEntry(entry)}
                      className="w-full min-w-0 px-4 py-1.5 text-left transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex items-start gap-3">
                        <TapeTypeBadge type={entry.type} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium leading-5 text-foreground">
                            {entry.canonicalView}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )
          ) : view === "archive" ? (
            entries.length === 0 ? (
              <div className="p-6">
                <MonitorEmptyState
                  title="No archived rows"
                  description="The archive view uses the same filtered dataset as the tape."
                />
              </div>
            ) : (
              <ScrollArea className="h-[620px]">
                <div className="p-3">
                  <div className="space-y-2 sm:hidden">
                    {entries.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => setSelectedEntry(entry)}
                        className="w-full rounded-lg border border-border/60 px-3 py-2 text-left transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="mb-1 flex items-center gap-2">
                          <TapeTypeBadge type={entry.type} />
                          <span className="text-xs text-muted-foreground">{entry.brokerCode}</span>
                        </div>
                        <div className="truncate text-sm font-medium text-foreground">
                          {formatEntryCommodityCompact(entry)} {formatEntryPriceRange(entry)} {entry.currency}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {entry.basis} {formatEntryDestinationCompact(entry)} / {formatEntryPeriodCompact(entry)}
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          {formatEntryDateTime(entry.createdAt)}
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="hidden sm:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Broker</TableHead>
                          <TableHead>Commodity</TableHead>
                          <TableHead>Basis</TableHead>
                          <TableHead>Destination</TableHead>
                          <TableHead>Period</TableHead>
                          <TableHead>Price</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {entries.map((entry) => (
                          <TableRow
                            key={entry.id}
                            className="cursor-pointer"
                            onClick={() => setSelectedEntry(entry)}
                          >
                            <TableCell>{formatEntryDateTime(entry.createdAt)}</TableCell>
                            <TableCell>
                              <TapeTypeBadge type={entry.type} />
                            </TableCell>
                            <TableCell>{entry.brokerCode}</TableCell>
                            <TableCell>{formatEntryCommodityCompact(entry)}</TableCell>
                            <TableCell>{entry.basis}</TableCell>
                            <TableCell>{formatEntryDestinationCompact(entry)}</TableCell>
                            <TableCell>{formatEntryPeriodCompact(entry)}</TableCell>
                            <TableCell>
                              {formatEntryPriceRange(entry)} {entry.currency}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </ScrollArea>
            )
          ) : analyticsData.length === 0 ? (
            <div className="p-6">
              <MonitorEmptyState
                title="No analytics data"
                description="Analytics are derived from the current filtered tape."
              />
            </div>
          ) : (
            <div className="space-y-4 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-muted-foreground">
                  Analytics derived from the currently visible tape (7-day main window + active filters).
                </div>
                <div className="inline-flex items-center gap-1 rounded-md border border-border/60 p-1">
                  <Button
                    size="sm"
                    variant={analyticsCurrency === "all" ? "secondary" : "ghost"}
                    className="h-7 px-2 text-xs"
                    onClick={() => setAnalyticsCurrency("all")}
                  >
                    All
                  </Button>
                  <Button
                    size="sm"
                    variant={analyticsCurrency === "usd" ? "secondary" : "ghost"}
                    className="h-7 px-2 text-xs"
                    onClick={() => setAnalyticsCurrency("usd")}
                  >
                    USD
                  </Button>
                  <Button
                    size="sm"
                    variant={analyticsCurrency === "eur" ? "secondary" : "ghost"}
                    className="h-7 px-2 text-xs"
                    onClick={() => setAnalyticsCurrency("eur")}
                  >
                    EUR
                  </Button>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-md border border-border/60 p-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Match rate</div>
                  <div className="mt-1 text-xl font-semibold">{kpis.matchRate}%</div>
                </div>
                <div className="rounded-md border border-border/60 p-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Avg spread</div>
                  <div className="mt-1 text-xl font-semibold">
                    {kpis.avgSpread !== null ? `${kpis.avgSpread}` : "n/a"}
                  </div>
                </div>
                <div className="rounded-md border border-border/60 p-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Top commodity by volume</div>
                  <div className="mt-1 text-base font-semibold truncate">
                    {kpis.topCommodityByVolume
                      ? `${kpis.topCommodityByVolume[0]} (${Math.round(kpis.topCommodityByVolume[1]).toLocaleString()} MT)`
                      : "n/a"}
                  </div>
                </div>
                <div className="rounded-md border border-border/60 p-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Activity today</div>
                  <div className="mt-1 text-xl font-semibold">{kpis.todayActivity}</div>
                </div>
                <div className="rounded-md border border-border/60 p-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">vs yesterday</div>
                  <div className="mt-1 text-xl font-semibold">{formatSigned(kpis.activityDelta)}</div>
                  <div className="text-xs text-muted-foreground">yesterday: {kpis.yesterdayActivity}</div>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-md border border-border/60 p-3">
                  <div className="mb-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    Activity by hour (BIDs / OFFERS / TRADES)
                  </div>
                  <ChartContainer
                    config={{
                      bids: { label: "Bids", color: "hsl(160 65% 45%)" },
                      offers: { label: "Offers", color: "hsl(38 85% 52%)" },
                      trades: { label: "Trades", color: "hsl(188 72% 46%)" },
                    }}
                    className="h-[260px] w-full"
                  >
                    <BarChart data={hourlySeries} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} interval={2} />
                      <YAxis tickLine={false} axisLine={false} width={36} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      {timelineMarkers.map((marker) => (
                        <ReferenceLine
                          key={`${marker.label}-${marker.x}`}
                          x={marker.x}
                          stroke="hsl(var(--muted-foreground))"
                          strokeDasharray="4 3"
                          label={{ value: marker.label, fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                        />
                      ))}
                      <Bar dataKey="bids" stackId="activity" fill="var(--color-bids)" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="offers" stackId="activity" fill="var(--color-offers)" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="trades" stackId="activity" fill="var(--color-trades)" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                </div>

                <div className="rounded-md border border-border/60 p-3">
                  <div className="mb-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    Spread trend (matched pairs)
                  </div>
                  {matchAnalytics.spreadTrend.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No spread trend data yet.</div>
                  ) : (
                    <ChartContainer
                      config={{
                        delta: { label: "Spread", color: "hsl(var(--primary))" },
                      }}
                      className="h-[260px] w-full"
                    >
                      <LineChart
                        data={matchAnalytics.spreadTrend}
                        margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={20} />
                        <YAxis tickLine={false} axisLine={false} width={36} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Line
                          type="monotone"
                          dataKey="delta"
                          stroke="var(--color-delta)"
                          strokeWidth={2}
                          dot={{ r: 2 }}
                          activeDot={{ r: 4 }}
                        />
                      </LineChart>
                    </ChartContainer>
                  )}
                  <div className="mt-2 text-xs text-muted-foreground">
                    Avg time-to-close:{" "}
                    {matchAnalytics.avgTimeToCloseMin !== null
                      ? `${matchAnalytics.avgTimeToCloseMin} min`
                      : "n/a"}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-md border border-border/60 p-3">
                  <div className="mb-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    Price distribution by commodity
                  </div>
                  {priceDots.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No price points in current filter.</div>
                  ) : (
                    <ChartContainer
                      config={{
                        points: { label: "Prices", color: "hsl(var(--primary))" },
                      }}
                      className="h-[280px] w-full"
                    >
                      <ScatterChart margin={{ top: 4, right: 8, left: 0, bottom: 12 }}>
                        <CartesianGrid />
                        <XAxis
                          type="category"
                          dataKey="commodity"
                          tickLine={false}
                          axisLine={false}
                          interval={0}
                          angle={-20}
                          height={60}
                          textAnchor="end"
                        />
                        <YAxis
                          type="number"
                          dataKey="price"
                          tickLine={false}
                          axisLine={false}
                          width={44}
                        />
                        <Tooltip
                          formatter={(value: number, _name, item: any) => {
                            const payload = item?.payload;
                            const usd =
                              typeof payload?.priceUsd === "number"
                                ? ` (~${payload.priceUsd.toFixed(2)} USD)`
                                : "";
                            return [`${value} ${payload?.currency}${usd}`, payload?.basis];
                          }}
                        />
                        <Scatter data={priceDots} fill="hsl(var(--primary))" />
                      </ScatterChart>
                    </ChartContainer>
                  )}
                </div>

                <div className="rounded-md border border-border/60 p-3">
                  <div className="mb-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    Volume by destination
                  </div>
                  {destinationVolume.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No destination volume data.</div>
                  ) : (
                    <ChartContainer
                      config={{
                        volume: { label: "Volume", color: "hsl(198 80% 48%)" },
                      }}
                      className="h-[280px] w-full"
                    >
                      <BarChart data={destinationVolume} layout="vertical" margin={{ top: 2, right: 8, left: 0, bottom: 2 }}>
                        <CartesianGrid horizontal={false} />
                        <XAxis type="number" hide />
                        <YAxis
                          type="category"
                          dataKey="destination"
                          width={210}
                          tickLine={false}
                          axisLine={false}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="volume" fill="var(--color-volume)" radius={[2, 2, 2, 2]} />
                      </BarChart>
                    </ChartContainer>
                  )}
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-md border border-border/60 p-3">
                  <div className="mb-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    Spread heatmap by basis
                  </div>
                  {spreadByBasis.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No spread data yet.</div>
                  ) : (
                    <div className="grid gap-1">
                      {spreadByBasis.map((row) => {
                        const intensity = Math.min(1, row.avgSpread / 20);
                        return (
                          <div
                            key={row.basis}
                            className="flex items-center justify-between rounded px-2 py-1 text-sm"
                            style={{
                              backgroundColor: `rgba(245, 158, 11, ${0.12 + intensity * 0.28})`,
                            }}
                          >
                            <span className="font-medium">{row.basis}</span>
                            <span className="text-xs">
                              Δ {row.avgSpread} ({row.count})
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded-md border border-border/60 p-3">
                  <div className="mb-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    Matched vs unmatched by commodity
                  </div>
                  {matchAnalytics.byCommodity.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No commodity match breakdown yet.</div>
                  ) : (
                    <ChartContainer
                      config={{
                        matched: { label: "Matched", color: "hsl(160 65% 45%)" },
                        unmatched: { label: "Unmatched", color: "hsl(0 0% 45%)" },
                      }}
                      className="h-[280px] w-full"
                    >
                      <BarChart
                        data={matchAnalytics.byCommodity}
                        layout="vertical"
                        margin={{ top: 2, right: 8, left: 0, bottom: 2 }}
                      >
                        <CartesianGrid horizontal={false} />
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="commodity" width={140} tickLine={false} axisLine={false} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="matched" stackId="ratio" fill="var(--color-matched)" />
                        <Bar dataKey="unmatched" stackId="ratio" fill="var(--color-unmatched)" />
                      </BarChart>
                    </ChartContainer>
                  )}
                </div>
              </div>

              <div className="rounded-md border border-border/60 p-3">
                <div className="mb-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  Commodity / broker pivot
                </div>
                {pivot.rows.length === 0 || pivot.brokers.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No pivot data available.</div>
                ) : (
                  <div className="overflow-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/60 text-left text-xs uppercase tracking-[0.08em] text-muted-foreground">
                          <th className="px-2 py-1">Commodity</th>
                          {pivot.brokers.map((broker) => (
                            <th key={broker} className="px-2 py-1">
                              {broker}
                            </th>
                          ))}
                          <th className="px-2 py-1">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pivot.rows.map((row) => (
                          <tr key={String(row.commodity)} className="border-b border-border/40">
                            <td className="px-2 py-1 font-medium">{row.commodity}</td>
                            {pivot.brokers.map((broker) => (
                              <td key={`${row.commodity}-${broker}`} className="px-2 py-1">
                                {Number(row[broker] || 0)}
                              </td>
                            ))}
                            <td className="px-2 py-1 font-semibold">{Number(row.total || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="rounded-md border border-border/60 p-3">
                <div className="mb-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  Daily trend (legacy line)
                </div>
                <ChartContainer
                  config={{
                    averagePrice: {
                      label: "Average price",
                      color: "hsl(var(--primary))",
                    },
                  }}
                  className="h-[260px] w-full"
                >
                  <LineChart data={analyticsData} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(value) => `${value}`} />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          labelKey="label"
                          formatter={(value) => [`${value} avg`, "Average price"]}
                        />
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="averagePrice"
                      stroke="var(--color-averagePrice)"
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ChartContainer>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <EntryDetailSheet
        entry={selectedEntry}
        open={!!selectedEntry}
        onOpenChange={(open) => {
          if (!open) setSelectedEntry(null);
        }}
      />
    </>
  );
}
