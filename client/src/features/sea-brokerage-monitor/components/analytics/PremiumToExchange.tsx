import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BrokerageEntry } from "../../types";
import { getEntryMidPrice } from "./utils";
import type { MarketQuote } from "./MarketDashboardQuotes";

interface PremiumToExchangeProps {
  entries: BrokerageEntry[];
}

type PeriodPreset = "1m" | "3m" | "6m" | "custom";
type ChartMode = "daily" | "weekly";

function normalizeLabel(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function isPocLikePlace(value: string) {
  const normalized = value.toUpperCase();
  return (
    normalized.includes("POC") ||
    normalized.includes("ODESA") ||
    normalized.includes("ODESSA") ||
    normalized.includes("PIVDEN") ||
    normalized.includes("CHORNOMORSK") ||
    normalized.includes("UAODS") ||
    normalized.includes("UAYUZ")
  );
}

function getWeekStartIso(date: Date) {
  const current = new Date(date);
  const day = (current.getUTCDay() + 6) % 7; // Monday=0 ... Sunday=6
  current.setUTCDate(current.getUTCDate() - day);
  return current.toISOString().slice(0, 10);
}

function inferCommodityFromQuoteId(quoteId: string): string {
  const id = quoteId.toLowerCase();
  if (id.includes("corn")) return "corn";
  if (id.includes("soy")) return "soybean";
  if (id.includes("wheat")) return "wheat";
  if (id.includes("rape")) return "rapeseed";
  return "";
}

export function PremiumToExchange({ entries }: PremiumToExchangeProps) {
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>("cbot_corn");
  const [selectedCommodity, setSelectedCommodity] = useState<string>("CORN");
  const [selectedBasis, setSelectedBasis] = useState<string>("CPT");
  const [selectedPlaces, setSelectedPlaces] = useState<string[]>([]);
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("1m");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [chartMode, setChartMode] = useState<ChartMode>("daily");

  const { data: quotes = [] } = useQuery<MarketQuote[]>({
    queryKey: ["/api/market-dashboard/quotes"],
    staleTime: Infinity,
  });

  const grainQuotes = quotes.filter(q => q.category === "cbot" || q.category === "matif");

  React.useEffect(() => {
    if (!grainQuotes.length) return;
    const hasCurrent = grainQuotes.some((q) => q.id === selectedQuoteId);
    if (hasCurrent) return;
    setSelectedQuoteId(grainQuotes[0].id);
  }, [grainQuotes, selectedQuoteId]);

  const commodityOptions = useMemo(() => {
    return Array.from(
      new Set(
        entries
          .map((entry) => normalizeLabel(entry.commodityLabel || entry.commodity))
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }, [entries]);

  const basisOptions = useMemo(() => {
    return Array.from(new Set(entries.map((entry) => normalizeLabel(entry.basis)).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [entries]);

  const deliveryPlaceOptions = useMemo(() => {
    return Array.from(new Set(entries.map((entry) => normalizeLabel(entry.destinationPort)).filter(Boolean))).sort(
      (a, b) => a.localeCompare(b),
    );
  }, [entries]);

  React.useEffect(() => {
    if (!commodityOptions.length) return;
    const mappedCommodity = inferCommodityFromQuoteId(selectedQuoteId);
    const mappedOption = commodityOptions.find((item) => item.toUpperCase().includes(mappedCommodity.toUpperCase()));
    const cornOption = commodityOptions.find((item) => item.toUpperCase() === "CORN");

    setSelectedCommodity((prev) => {
      if (prev && commodityOptions.includes(prev)) return prev;
      if (mappedOption) return mappedOption;
      if (cornOption) return cornOption;
      return commodityOptions[0];
    });
  }, [commodityOptions, selectedQuoteId]);

  React.useEffect(() => {
    if (!basisOptions.length) return;
    const hasCpt = basisOptions.some((item) => item.toUpperCase() === "CPT");
    setSelectedBasis((prev) => {
      if (prev && basisOptions.includes(prev)) return prev;
      if (hasCpt) return basisOptions.find((item) => item.toUpperCase() === "CPT") || basisOptions[0];
      return basisOptions[0];
    });
  }, [basisOptions]);

  React.useEffect(() => {
    if (!deliveryPlaceOptions.length) return;
    setSelectedPlaces((prev) => {
      if (prev.length) {
        const filtered = prev.filter((item) => deliveryPlaceOptions.includes(item));
        if (filtered.length) return filtered;
      }
      const pocDefaults = deliveryPlaceOptions.filter((item) => isPocLikePlace(item));
      if (pocDefaults.length) return pocDefaults;
      return [deliveryPlaceOptions[0]];
    });
  }, [deliveryPlaceOptions]);

  const filteredPhysicalEntries = useMemo(() => {
    const now = new Date();
    let fromDate: Date | null = null;
    let toDate: Date | null = now;

    if (periodPreset === "1m") fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (periodPreset === "3m") fromDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    if (periodPreset === "6m") fromDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    if (periodPreset === "custom") {
      fromDate = customFrom ? new Date(customFrom) : null;
      toDate = customTo ? new Date(customTo) : null;
    }

    return entries.filter((entry) => {
      if (entry.type !== "bid" && entry.type !== "offer") return false;

      const commodity = normalizeLabel(entry.commodityLabel || entry.commodity).toUpperCase();
      const basis = normalizeLabel(entry.basis).toUpperCase();
      const place = normalizeLabel(entry.destinationPort);
      const createdAt = new Date(entry.createdAt);

      if (selectedCommodity && commodity !== selectedCommodity.toUpperCase()) return false;
      if (selectedBasis && basis !== selectedBasis.toUpperCase()) return false;
      if (selectedPlaces.length && !selectedPlaces.includes(place)) return false;
      if (!Number.isNaN(createdAt.getTime())) {
        if (fromDate && createdAt < fromDate) return false;
        if (toDate && createdAt > toDate) return false;
      }

      return true;
    });
  }, [entries, selectedCommodity, selectedBasis, selectedPlaces, periodPreset, customFrom, customTo]);

  const chartData = useMemo(() => {
    if (!selectedQuoteId) return [];

    const targetQuote = grainQuotes.find(q => q.id === selectedQuoteId);
    if (!targetQuote) return [];
    if (!Number.isFinite(targetQuote.price)) return [];

    const grouped = new Map<string, { sum: number; count: number }>();
    for (const entry of filteredPhysicalEntries) {
      const createdAt = new Date(entry.createdAt);
      if (Number.isNaN(createdAt.getTime())) continue;
      const bucket =
        chartMode === "weekly" ? getWeekStartIso(createdAt) : createdAt.toISOString().slice(0, 10);
      const price = getEntryMidPrice(entry);
      if (price !== null && Number.isFinite(price)) {
        let slot = grouped.get(bucket);
        if (!slot) {
          slot = { sum: 0, count: 0 };
          grouped.set(bucket, slot);
        }
        slot.sum += price;
        slot.count += 1;
      }
    }

    return Array.from(grouped.entries())
      .map(([bucket, agg]) => {
        const physicalAvg = agg.sum / agg.count;
        const exchangeRef = targetQuote.price;
        const premium = physicalAvg - exchangeRef;
        return {
          date: bucket,
          physicalAvg: Number(physicalAvg.toFixed(2)),
          premium: Number(premium.toFixed(2)),
          exchangeRef: Number(exchangeRef.toFixed(2)),
          points: agg.count,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredPhysicalEntries, selectedQuoteId, grainQuotes, chartMode]);

  const targetQuote = useMemo(() => grainQuotes.find((q) => q.id === selectedQuoteId) || null, [grainQuotes, selectedQuoteId]);
  const hasExchangeReference = Boolean(targetQuote && Number.isFinite(targetQuote.price));
  const hasPhysicalData = filteredPhysicalEntries.length > 0;

  if (grainQuotes.length === 0) {
    return (
      <Card className="border-border/60">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm">Premium to Exchange</CardTitle>
          <CardDescription>Loading exchange quotes...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-border/60">
      <CardHeader className="space-y-3 py-3 px-4">
        <div>
          <CardTitle className="text-sm">Premium to Exchange</CardTitle>
          <CardDescription className="text-xs">
            Physical VWAP vs Barchart exchange reference. Daily uses per-day buckets, Weekly uses weekly averages.
          </CardDescription>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1 lg:col-span-2">
            <Label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Exchange reference</Label>
            <Select value={selectedQuoteId} onValueChange={setSelectedQuoteId}>
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue placeholder="Select exchange contract" />
              </SelectTrigger>
              <SelectContent>
                {grainQuotes.map((q) => (
                  <SelectItem key={q.id} value={q.id} className="text-xs">
                    {q.symbol} ({q.price.toFixed(2)} {q.priceUnit})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Commodity</Label>
            <select
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
              value={selectedCommodity}
              onChange={(event) => setSelectedCommodity(event.target.value)}
            >
              {commodityOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Basis</Label>
            <select
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
              value={selectedBasis}
              onChange={(event) => setSelectedBasis(event.target.value)}
            >
              {basisOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Chart type</Label>
            <Select value={chartMode} onValueChange={(next) => setChartMode(next as ChartMode)}>
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily" className="text-xs">Daily</SelectItem>
                <SelectItem value="weekly" className="text-xs">Weekly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1 lg:col-span-2">
            <Label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Delivery places</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-8 w-full justify-start truncate text-xs">
                  {selectedPlaces.length ? selectedPlaces.join(" / ") : "Select places"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-72 w-64 overflow-y-auto">
                {deliveryPlaceOptions.map((place) => {
                  const checked = selectedPlaces.includes(place);
                  return (
                    <DropdownMenuCheckboxItem
                      key={place}
                      checked={checked}
                      onCheckedChange={(next) =>
                        setSelectedPlaces((prev) =>
                          next ? [...new Set([...prev, place])] : prev.filter((item) => item !== place),
                        )
                      }
                    >
                      {place}
                    </DropdownMenuCheckboxItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="space-y-1 lg:col-span-2">
            <Label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Period</Label>
            <div className="flex flex-wrap gap-1">
              <Button size="sm" variant={periodPreset === "1m" ? "secondary" : "outline"} className="h-8 px-2 text-xs" onClick={() => setPeriodPreset("1m")}>1M</Button>
              <Button size="sm" variant={periodPreset === "3m" ? "secondary" : "outline"} className="h-8 px-2 text-xs" onClick={() => setPeriodPreset("3m")}>3M</Button>
              <Button size="sm" variant={periodPreset === "6m" ? "secondary" : "outline"} className="h-8 px-2 text-xs" onClick={() => setPeriodPreset("6m")}>6M</Button>
              <Button size="sm" variant={periodPreset === "custom" ? "secondary" : "outline"} className="h-8 px-2 text-xs" onClick={() => setPeriodPreset("custom")}>Custom</Button>
            </div>
            {periodPreset === "custom" ? (
              <div className="grid grid-cols-2 gap-1">
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-8 text-xs" />
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-8 text-xs" />
              </div>
            ) : null}
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Reference now</Label>
            <div className="h-8 rounded-md border border-border bg-background px-2 text-xs flex items-center">
              {targetQuote ? `${targetQuote.price.toFixed(2)} ${targetQuote.priceUnit}` : "n/a"}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-2 pt-0 pb-4">
        {!hasExchangeReference ? (
          <div className="h-[280px] flex items-center justify-center rounded-md border border-dashed border-border/60 text-sm text-muted-foreground px-4 text-center">
            No exchange reference available for selected contract. Try another exchange contract.
          </div>
        ) : !hasPhysicalData ? (
          <div className="h-[280px] flex items-center justify-center rounded-md border border-dashed border-border/60 text-sm text-muted-foreground px-4 text-center">
            No physical data for selected commodity/basis/place/period filters.
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-[280px] flex items-center justify-center rounded-md border border-dashed border-border/60 text-sm text-muted-foreground px-4 text-center">
            No overlap between physical buckets and exchange reference for selected chart mode.
          </div>
        ) : (
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis dataKey="date" tick={{fontSize: 10}} tickLine={false} axisLine={false} />
                <YAxis yAxisId="premium" orientation="left" tick={{fontSize: 10}} tickLine={false} axisLine={false} width={40} />
                <YAxis yAxisId="price" orientation="right" tick={{fontSize: 10}} tickLine={false} axisLine={false} width={40} />
                <Tooltip 
                  contentStyle={{ backgroundColor: "rgba(0,0,0,0.8)", border: "1px solid #333", borderRadius: "6px" }}
                  itemStyle={{ fontSize: "12px" }}
                />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Line yAxisId="price" type="monotone" dataKey="physicalAvg" name="Physical VWAP" stroke="hsl(38 85% 52%)" strokeWidth={2} dot={{ r: 3 }} />
                <Line yAxisId="price" type="monotone" dataKey="exchangeRef" name="Exchange reference" stroke="hsl(160 65% 45%)" strokeWidth={2} dot={false} />
                <Line yAxisId="premium" type="monotone" dataKey="premium" name="Premium/Discount" stroke="hsl(200 90% 50%)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
