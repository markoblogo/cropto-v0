import React, { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BrokerageEntry } from "../../types";
import { getEntryMidPrice } from "./utils";

interface BasisSpreadChartProps {
  entries: BrokerageEntry[];
}

type PeriodPreset = "1m" | "3m" | "6m" | "custom";
type ChartMode = "daily" | "weekly";
type SpreadMode = "strict" | "asynchronous";

function normalizeLabel(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function getWeekStartIso(date: Date) {
  const current = new Date(date);
  const day = (current.getUTCDay() + 6) % 7; // Monday=0 ... Sunday=6
  current.setUTCDate(current.getUTCDate() - day);
  return current.toISOString().slice(0, 10);
}

export function BasisSpreadChart({ entries }: BasisSpreadChartProps) {
  const [basisA, setBasisA] = useState<string>("");
  const [basisB, setBasisB] = useState<string>("");
  const [selectedCommodity, setSelectedCommodity] = useState<string>("CORN");
  const [selectedTransportType, setSelectedTransportType] = useState<string>("all");
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("3m");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [chartMode, setChartMode] = useState<ChartMode>("daily");
  const [spreadMode, setSpreadMode] = useState<SpreadMode>("strict");

  const commodityOptions = useMemo(() => {
    return Array.from(
      new Set(
        entries
          .map((entry) => normalizeLabel(entry.commodityLabel || entry.commodity))
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }, [entries]);

  const transportOptions = useMemo(() => {
    return Array.from(new Set(entries.map((entry) => normalizeLabel(entry.transportType)).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [entries]);

  React.useEffect(() => {
    if (!commodityOptions.length) return;
    const cornOption = commodityOptions.find((item) => item.toUpperCase() === "CORN");
    if (cornOption) {
      setSelectedCommodity((prev) => (prev ? prev : cornOption));
      return;
    }
    setSelectedCommodity((prev) => (prev ? prev : commodityOptions[0]));
  }, [commodityOptions]);

  const baseFilteredBidEntries = useMemo(() => {
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
      if (entry.type !== "bid") return false;

      const transportType = normalizeLabel(entry.transportType).toUpperCase();
      const createdAt = new Date(entry.createdAt);

      if (selectedTransportType !== "all" && transportType !== selectedTransportType.toUpperCase()) return false;
      if (!Number.isNaN(createdAt.getTime())) {
        if (fromDate && createdAt < fromDate) return false;
        if (toDate && createdAt > toDate) return false;
      }
      return true;
    });
  }, [entries, selectedTransportType, periodPreset, customFrom, customTo]);

  const filteredBidEntries = useMemo(() => {
    return baseFilteredBidEntries.filter((entry) => {
      const commodity = normalizeLabel(entry.commodityLabel || entry.commodity).toUpperCase();
      if (selectedCommodity && commodity !== selectedCommodity.toUpperCase()) return false;
      return true;
    });
  }, [baseFilteredBidEntries, selectedCommodity]);

  const availableBases = useMemo(() => {
    const bases = new Set<string>();
    filteredBidEntries.forEach((entry) => {
      if (entry.basis) bases.add(entry.basis.toUpperCase());
    });
    return Array.from(bases).sort();
  }, [filteredBidEntries]);

  const commodityBasisStats = useMemo(() => {
    const map = new Map<string, { basisByBucket: Map<string, Set<string>>; basisSet: Set<string> }>();
    for (const entry of baseFilteredBidEntries) {
      const commodity = normalizeLabel(entry.commodityLabel || entry.commodity);
      const basis = normalizeLabel(entry.basis).toUpperCase();
      if (!commodity || !basis) continue;
      const createdAt = new Date(entry.createdAt);
      if (Number.isNaN(createdAt.getTime())) continue;
      const bucketKey =
        chartMode === "weekly" ? getWeekStartIso(createdAt) : createdAt.toISOString().slice(0, 10);

      if (!map.has(commodity)) {
        map.set(commodity, {
          basisByBucket: new Map<string, Set<string>>(),
          basisSet: new Set<string>(),
        });
      }
      const slot = map.get(commodity)!;
      slot.basisSet.add(basis);
      if (!slot.basisByBucket.has(bucketKey)) slot.basisByBucket.set(bucketKey, new Set());
      slot.basisByBucket.get(bucketKey)!.add(basis);
    }

    return Array.from(map.entries())
      .map(([commodity, stats]) => {
        let overlapBuckets = 0;
        for (const set of stats.basisByBucket.values()) {
          if (set.size >= 2) overlapBuckets += 1;
        }
        return {
          commodity,
          basisCount: stats.basisSet.size,
          overlapBuckets,
        };
      })
      .sort(
        (a, b) =>
          b.overlapBuckets - a.overlapBuckets ||
          b.basisCount - a.basisCount ||
          a.commodity.localeCompare(b.commodity),
      );
  }, [baseFilteredBidEntries, chartMode]);

  const suggestedCommodity =
    commodityBasisStats.find((item) => item.overlapBuckets > 0)?.commodity ||
    commodityBasisStats.find((item) => item.basisCount >= 2)?.commodity ||
    "";

  React.useEffect(() => {
    if (!availableBases.length) {
      setBasisA("");
      setBasisB("");
      return;
    }
    if (availableBases.length === 1) {
      setBasisA(availableBases[0]);
      setBasisB("");
      return;
    }

    setBasisA((prev) => {
      if (prev && availableBases.includes(prev)) return prev;
      return availableBases[0];
    });
    setBasisB((prev) => {
      if (prev && availableBases.includes(prev) && prev !== availableBases[0]) return prev;
      const fallback = availableBases.find((basis) => basis !== availableBases[0]);
      return fallback || "";
    });
  }, [availableBases]);

  const chartData = useMemo(() => {
    if (!basisA || !basisB) return [];

    const grouped = new Map<
      string,
      {
        date: string;
        aSum: number;
        aCount: number;
        bSum: number;
        bCount: number;
      }
    >();

    for (const entry of filteredBidEntries) {
      if (!entry.basis) continue;
      const currentBasis = entry.basis.toUpperCase();
      if (currentBasis !== basisA && currentBasis !== basisB) continue;

      const createdAt = new Date(entry.createdAt);
      const key = chartMode === "weekly" ? getWeekStartIso(createdAt) : createdAt.toISOString().slice(0, 10);
      const price = getEntryMidPrice(entry);
      if (price === null || !Number.isFinite(price)) continue;

      let slot = grouped.get(key);
      if (!slot) {
        slot = { date: key, aSum: 0, aCount: 0, bSum: 0, bCount: 0 };
        grouped.set(key, slot);
      }
      if (currentBasis === basisA) {
        slot.aSum += price;
        slot.aCount += 1;
      } else {
        slot.bSum += price;
        slot.bCount += 1;
      }
    }

    const baseRows = Array.from(grouped.values())
      .map((slot) => {
        const avgA = slot.aCount > 0 ? slot.aSum / slot.aCount : null;
        const avgB = slot.bCount > 0 ? slot.bSum / slot.bCount : null;
        const spread = avgA !== null && avgB !== null ? avgA - avgB : null;

        return {
          date: slot.date,
          [basisA]: avgA === null ? null : Number(avgA.toFixed(2)),
          [basisB]: avgB === null ? null : Number(avgB.toFixed(2)),
          spread: spread === null ? null : Number(spread.toFixed(2)),
          spreadAsync: null as number | null,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const rowsWithIndex = baseRows.map((row, index) => ({
      row,
      index,
      ts: Date.parse(`${row.date}T00:00:00Z`),
    }));
    const rowsA = rowsWithIndex.filter((item) => item.row[basisA as keyof typeof item.row] !== null);
    const rowsB = rowsWithIndex.filter((item) => item.row[basisB as keyof typeof item.row] !== null);
    if (!rowsA.length || !rowsB.length) return baseRows;

    const findNearestValue = (
      targetTs: number,
      sourceRows: Array<{ row: (typeof baseRows)[number]; index: number; ts: number }>,
      key: string,
    ) => {
      let best: number | null = null;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const candidate of sourceRows) {
        const value = candidate.row[key as keyof typeof candidate.row];
        if (typeof value !== "number") continue;
        const dist = Math.abs(candidate.ts - targetTs);
        if (dist < bestDist) {
          bestDist = dist;
          best = value;
        }
      }
      return best;
    };

    for (const current of rowsWithIndex) {
      const ownA = current.row[basisA as keyof typeof current.row];
      const ownB = current.row[basisB as keyof typeof current.row];
      const valA =
        typeof ownA === "number" ? ownA : findNearestValue(current.ts, rowsA, basisA);
      const valB =
        typeof ownB === "number" ? ownB : findNearestValue(current.ts, rowsB, basisB);
      if (typeof valA === "number" && typeof valB === "number") {
        current.row.spreadAsync = Number((valA - valB).toFixed(2));
      }
    }

    return baseRows;
  }, [filteredBidEntries, basisA, basisB, chartMode]);

  const hasData = chartData.length > 0;
  const overlapPoints = useMemo(
    () =>
      chartData.filter((row) => row[basisA as keyof typeof row] !== null && row[basisB as keyof typeof row] !== null)
        .length,
    [chartData, basisA, basisB],
  );
  const asyncSpreadPoints = useMemo(
    () => chartData.filter((row) => typeof row.spreadAsync === "number").length,
    [chartData],
  );

  return (
    <Card className="border-border/60">
      <CardHeader className="space-y-3 py-3 px-4">
        <div>
          <CardTitle className="text-sm">Spread Between Basis (BIDs)</CardTitle>
          <CardDescription className="text-xs">
            Daily mode includes only days with BID on both basis. Weekly mode compares weekly average BID values.
          </CardDescription>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
            <Label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Transport</Label>
            <select
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
              value={selectedTransportType}
              onChange={(event) => setSelectedTransportType(event.target.value)}
            >
              <option value="all">All transport</option>
              {transportOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
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
        <div className="flex flex-wrap gap-2 items-center">
          <Select value={basisA || "__none"} onValueChange={(next) => setBasisA(next === "__none" ? "" : next)}>
            <SelectTrigger className="h-7 w-[120px] text-xs">
              <SelectValue placeholder="Basis A" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none" disabled className="text-xs">
                Basis A
              </SelectItem>
              {availableBases.map((basis) => (
                <SelectItem key={basis} value={basis} className="text-xs">
                  {basis}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground font-semibold">VS</span>
          <Select value={basisB || "__none"} onValueChange={(next) => setBasisB(next === "__none" ? "" : next)}>
            <SelectTrigger className="h-7 w-[120px] text-xs">
              <SelectValue placeholder="Basis B" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none" disabled className="text-xs">
                Basis B
              </SelectItem>
              {availableBases.map((basis) => (
                <SelectItem key={basis} value={basis} className="text-xs">
                  {basis}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-1">
            <Button
              size="sm"
              variant={spreadMode === "strict" ? "secondary" : "outline"}
              className="h-7 px-2 text-xs"
              onClick={() => setSpreadMode("strict")}
            >
              Strict spread
            </Button>
            <Button
              size="sm"
              variant={spreadMode === "asynchronous" ? "secondary" : "outline"}
              className="h-7 px-2 text-xs"
              onClick={() => setSpreadMode("asynchronous")}
            >
              Asynchronous spread
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-2 pt-0 pb-4">
        {availableBases.length < 2 ? (
          <div className="flex h-[280px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/60 px-4 text-center text-xs text-muted-foreground">
            <div>Need at least 2 different BID basis values for selected commodity and transport.</div>
            {suggestedCommodity && suggestedCommodity !== selectedCommodity ? (
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-3 text-xs"
                onClick={() => setSelectedCommodity(suggestedCommodity)}
              >
                Switch to {suggestedCommodity}
              </Button>
            ) : null}
            {commodityBasisStats.length > 0 ? (
              <div className="text-[11px] text-muted-foreground/80">
                {commodityBasisStats[0].overlapBuckets > 0
                  ? `Best candidate now: ${commodityBasisStats[0].commodity} (${commodityBasisStats[0].overlapBuckets} overlapping ${chartMode} bucket${
                      commodityBasisStats[0].overlapBuckets === 1 ? "" : "s"
                    }).`
                  : `No commodity currently has overlapping BID buckets in ${chartMode} mode for selected filters.`}
              </div>
            ) : null}
          </div>
        ) : !hasData ? (
          <div className="flex h-[280px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 px-4 text-center text-xs text-muted-foreground">
            <div>No BID data overlap for selected basis pair and chart filters.</div>
            <div className="text-[11px] text-muted-foreground/80">
              Spread requires both basis in the same {chartMode === "daily" ? "day" : "week"} bucket.
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {spreadMode === "strict" && overlapPoints === 0 ? (
              <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
                No overlap buckets for spread in {chartMode} mode. Basis lines are shown separately.
              </div>
            ) : null}
            {spreadMode === "asynchronous" && asyncSpreadPoints === 0 ? (
              <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
                Asynchronous spread is unavailable: one of selected basis has no BID values in current filters.
              </div>
            ) : null}
            <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="price" orientation="left" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={40} />
                <YAxis yAxisId="spread" orientation="right" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={40} />
                <Tooltip
                  contentStyle={{ backgroundColor: "rgba(0,0,0,0.8)", border: "1px solid #333", borderRadius: "6px" }}
                  itemStyle={{ fontSize: "12px" }}
                />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Line yAxisId="price" type="monotone" dataKey={basisA} name={basisA} stroke="hsl(160 65% 45%)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                <Line yAxisId="price" type="monotone" dataKey={basisB} name={basisB} stroke="hsl(38 85% 52%)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                <Line
                  yAxisId="spread"
                  type="monotone"
                  dataKey={spreadMode === "strict" ? "spread" : "spreadAsync"}
                  name={spreadMode === "strict" ? "Spread A-B (strict)" : "Spread A-B (async)"}
                  stroke="hsl(280 65% 60%)"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
