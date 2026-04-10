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

import { MonitorEmptyState } from "./MonitorEmptyState";
import { UniversalChart } from "./analytics/UniversalChart";
import { PremiumToExchange } from "./analytics/PremiumToExchange";
import { LiquidityByBasis } from "./analytics/LiquidityByBasis";
import { MarketDashboardQuotes } from "./analytics/MarketDashboardQuotes";
import { BasisSpreadChart } from "./analytics/BasisSpreadChart";
import { BossAnalyticsView } from "./analytics/BossAnalyticsView";
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
  onSelectEntry?: (entry: BrokerageEntry) => void;
  showBossAnalytics?: boolean;
  monitorAuthToken?: string | null;
}

type FeedSecondaryView =
  | "tape"
  | "archive"
  | "markets"
  | "price_volume"
  | "liquidity"
  | "spreads"
  | "premiums"
  | "boss";
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
  const normalized = String(currency || "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/\s+INCL\.\s+VAT$/i, "")
    .replace(/\s+\+\s+VAT$/i, "")
    .trim();
  const rate = FX_TO_USD[normalized];
  if (!rate) return null;
  return value * rate;
}

function shouldIncludeEntryByCurrency(entry: BrokerageEntry, mode: AnalyticsCurrencyMode) {
  if (mode === "all") return true;
  const normalized = String(entry.currency || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s+incl\.\s+vat$/i, "")
    .replace(/\s+\+\s+vat$/i, "")
    .trim();
  return normalized === mode;
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

function TapeTypeBadge({ entry }: { entry: BrokerageEntry }) {
  if (entry.isMarketTrade) {
    return (
      <span className="shrink-0 rounded-full border border-slate-500/30 bg-slate-500/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700">
        MARKET TRADE
      </span>
    );
  }

  if (entry.type === "trade") {
    return (
      <span className="shrink-0 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">
        TRADE IDEA
      </span>
    );
  }

  return (
    <span
      className={
        entry.type === "bid"
          ? "shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700"
          : "shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700"
      }
    >
      {entry.type === "bid" ? "BID IDEA" : "OFFER IDEA"}
    </span>
  );
}

function SecondaryCriteriaPanel({ title, lines }: { title: string; lines: string[] }) {
  return (
    <Card className="border-border/60 bg-card/70">
      <CardHeader className="px-4 py-3">
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription className="text-xs">Criteria</CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <ul className="space-y-2">
          {lines.map((line) => (
            <li key={line} className="text-xs text-muted-foreground">
              {line}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function StandardizedFeedCard({
  entries,
  onOpenReport,
  onSelectEntry,
  showBossAnalytics = false,
  monitorAuthToken = null,
}: StandardizedFeedCardProps) {
  const [view, setView] = useState<FeedSecondaryView>("markets");
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
      <Card className="flex h-full min-h-0 flex-col overflow-hidden border-border/70 bg-card/95 shadow-sm">
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
                  variant={view === "markets" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8"
                  onClick={() => setView("markets")}
                >
                  Markets
                </Button>
                <Button
                  variant={view === "price_volume" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8"
                  onClick={() => setView("price_volume")}
                >
                  Price & Volume
                </Button>
                <Button
                  variant={view === "liquidity" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8"
                  onClick={() => setView("liquidity")}
                >
                  Liquidity
                </Button>
                <Button
                  variant={view === "spreads" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8"
                  onClick={() => setView("spreads")}
                >
                  Spreads
                </Button>
                <Button
                  variant={view === "premiums" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8"
                  onClick={() => setView("premiums")}
                >
                  Premiums
                </Button>
                {showBossAnalytics ? (
                  <Button
                    variant={view === "boss" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-8"
                    onClick={() => setView("boss")}
                  >
                    Boss
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex min-h-0 flex-1 p-0">
          {view === "tape" ? (
            entries.length === 0 ? (
              <div className="p-6">
                <MonitorEmptyState
                  title="No tape entries"
                  description="Adjust filters or create a new BID, OFFER, or TRADE to populate the broker tape."
                />
              </div>
            ) : (
              <ScrollArea className="h-full min-h-0 flex-1">
                <div className="divide-y divide-border/60">
                  {entries.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => onSelectEntry?.(entry)}
                      className="w-full min-w-0 px-4 py-1.5 text-left transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex items-start gap-3">
                        <TapeTypeBadge entry={entry} />
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
              <ScrollArea className="h-full min-h-0 flex-1">
                <div className="p-3">
                  <div className="space-y-2 sm:hidden">
                    {entries.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => onSelectEntry?.(entry)}
                        className="w-full rounded-lg border border-border/60 px-3 py-2 text-left transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="mb-1 flex items-center gap-2">
                          <TapeTypeBadge entry={entry} />
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
                            onClick={() => onSelectEntry?.(entry)}
                          >
                            <TableCell>{formatEntryDateTime(entry.createdAt)}</TableCell>
                            <TableCell>
                              <TapeTypeBadge entry={entry} />
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
          ) : view === "markets" ? (
            <ScrollArea className="h-full min-h-0 flex-1">
              <div className="p-4">
                <MarketDashboardQuotes />
              </div>
            </ScrollArea>
          ) : view === "price_volume" ? (
            <ScrollArea className="h-full min-h-0 flex-1">
              <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                <UniversalChart entries={entries} />
                <SecondaryCriteriaPanel
                  title="Price & Volume"
                  lines={[
                    "Commodity: default Corn",
                    "Period: 1M / 3M / 6M / custom",
                    "Basis: selectable",
                    "Delivery places: multi-select",
                    "Mode: Price VWAP / Volume",
                  ]}
                />
              </div>
            </ScrollArea>
          ) : view === "liquidity" ? (
            <ScrollArea className="h-full min-h-0 flex-1">
              <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                <LiquidityByBasis entries={entries} />
                <SecondaryCriteriaPanel
                  title="Liquidity"
                  lines={[
                    "Commodity: selectable",
                    "Period: 1M / 3M / 6M / custom",
                    "Aggregates BID and OFFER volumes by basis",
                  ]}
                />
              </div>
            </ScrollArea>
          ) : view === "spreads" ? (
            <ScrollArea className="h-full min-h-0 flex-1">
              <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                <BasisSpreadChart entries={entries} />
                <SecondaryCriteriaPanel
                  title="Spreads"
                  lines={[
                    "BIDs only",
                    "Commodity + transport + period filters",
                    "Pair basis A vs basis B",
                    "Mode: strict / asynchronous",
                    "Chart: daily / weekly",
                  ]}
                />
              </div>
            </ScrollArea>
          ) : view === "premiums" ? (
            <ScrollArea className="h-full min-h-0 flex-1">
              <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                <PremiumToExchange entries={entries} />
                <SecondaryCriteriaPanel
                  title="Premiums"
                  lines={[
                    "Exchange reference: Barchart",
                    "Physical filters: commodity / basis / place",
                    "Period: 1M / 3M / 6M / custom",
                    "Chart: daily / weekly averages",
                  ]}
                />
              </div>
            </ScrollArea>
          ) : view === "boss" && showBossAnalytics ? (
            <ScrollArea className="h-full min-h-0 flex-1">
              <div className="p-4">
                <BossAnalyticsView monitorAuthToken={monitorAuthToken} />
              </div>
            </ScrollArea>
          ) : (
            <ScrollArea className="h-full min-h-0 flex-1">
              <div className="p-4">
                <MarketDashboardQuotes />
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </>
  );
}
