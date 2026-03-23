import { useMemo, useState } from "react";
import { Download, Eye, FileSpreadsheet } from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
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
import {
  formatEntryCommodityCompact,
  formatEntryDateTime,
  formatEntryDestination,
  formatEntryDestinationCompact,
  formatEntryPeriodCompact,
  formatEntryPriceRange,
} from "../services/entryFormatting.service";
import type { BrokerageEntry } from "../types";

interface StandardizedFeedCardProps {
  entries: BrokerageEntry[];
}

type FeedSecondaryView = "tape" | "archive" | "analytics";

function TapeTypeBadge({ type }: { type: BrokerageEntry["type"] }) {
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

export function StandardizedFeedCard({ entries }: StandardizedFeedCardProps) {
  const [selectedEntry, setSelectedEntry] = useState<BrokerageEntry | null>(null);
  const [view, setView] = useState<FeedSecondaryView>("tape");

  const analyticsData = useMemo(() => buildFeedAnalyticsSeries(entries), [entries]);
  const bidCount = entries.filter((entry) => entry.type === "bid").length;
  const offerCount = entries.length - bidCount;

  return (
    <>
      <Card className="border-border/70 bg-card/95 shadow-sm">
        <CardHeader className="space-y-4 border-b border-border/60 pb-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <CardTitle className="text-lg">Broker Tape</CardTitle>
              <CardDescription>
                Unified chronological tape of standardized BID and OFFER ideas.
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{entries.length} visible</Badge>
              <Button variant="ghost" size="sm" onClick={() => exportEntriesToCsv(entries)} disabled={entries.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                CSV
              </Button>
              <Button variant="ghost" size="sm" onClick={() => exportEntriesToXlsx(entries)} disabled={entries.length === 0}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                XLSX
              </Button>
              <Button variant={view === "tape" ? "secondary" : "ghost"} size="sm" onClick={() => setView("tape")}>
                Tape
              </Button>
              <Button variant={view === "archive" ? "ghost" : "ghost"} size="sm" onClick={() => setView("archive")}>
                Archive
              </Button>
              <Button variant={view === "analytics" ? "ghost" : "ghost"} size="sm" onClick={() => setView("analytics")}>
                Analytics
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {view === "tape" ? (
            entries.length === 0 ? (
              <div className="p-6">
                <MonitorEmptyState
                  title="No tape entries"
                  description="Adjust filters, reseed demo data, or create a new BID or OFFER to populate the broker tape."
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
                      className="w-full px-4 py-2.5 text-left transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex items-start gap-3">
                        <TapeTypeBadge type={entry.type} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium leading-5 text-foreground">
                            {entry.canonicalView}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground/80">
                            <span>{formatEntryDateTime(entry.createdAt)}</span>
                            <span>·</span>
                            <span>{entry.brokerCode}</span>
                            <span>·</span>
                            <span>
                              {formatEntryDestinationCompact(entry)}
                            </span>
                            <span>·</span>
                            <span>{formatEntryPeriodCompact(entry)}</span>
                          </div>
                        </div>
                        <div className="hidden shrink-0 text-muted-foreground lg:block">
                          <Eye className="h-3.5 w-3.5" />
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
            <div className="p-4">
              <div className="mb-4 text-sm text-muted-foreground">
                Secondary analytics view derived from the currently visible tape entries.
              </div>
              <ChartContainer
                config={{
                  averagePrice: {
                    label: "Average price",
                    color: "hsl(var(--primary))",
                  },
                }}
                className="h-[520px] w-full"
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
