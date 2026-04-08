import React, { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BrokerageEntry } from "../../types";

interface LiquidityByBasisProps {
  entries: BrokerageEntry[];
}

type PeriodPreset = "1m" | "3m" | "6m" | "custom";

function normalizeLabel(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

export function LiquidityByBasis({ entries }: LiquidityByBasisProps) {
  const [selectedCommodity, setSelectedCommodity] = useState<string>("CORN");
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("1m");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const commodityOptions = useMemo(() => {
    return Array.from(
      new Set(
        entries
          .map((entry) => normalizeLabel(entry.commodityLabel || entry.commodity))
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b));
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

  const filteredEntries = useMemo(() => {
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
      const createdAt = new Date(entry.createdAt);

      if (selectedCommodity && commodity !== selectedCommodity.toUpperCase()) return false;
      if (!Number.isNaN(createdAt.getTime())) {
        if (fromDate && createdAt < fromDate) return false;
        if (toDate && createdAt > toDate) return false;
      }
      return true;
    });
  }, [entries, selectedCommodity, periodPreset, customFrom, customTo]);

  const chartData = useMemo(() => {
    const basisMap = new Map<string, { basis: string; bidVolume: number; offerVolume: number; totalVolume: number }>();

    for (const entry of filteredEntries) {
      if (entry.type !== "bid" && entry.type !== "offer") continue;
      
      const basis = entry.basis || "Unknown";
      const volume = Number(entry.quantityMt ?? entry.volumeTo ?? entry.volumeFrom ?? 0);
      
      if (!Number.isFinite(volume)) continue;

      let bDat = basisMap.get(basis);
      if (!bDat) {
        bDat = { basis, bidVolume: 0, offerVolume: 0, totalVolume: 0 };
        basisMap.set(basis, bDat);
      }

      if (entry.type === "bid") {
        bDat.bidVolume += volume;
      } else {
        bDat.offerVolume += volume;
      }
      bDat.totalVolume += volume;
    }

    return Array.from(basisMap.values()).sort((a, b) => b.totalVolume - a.totalVolume);
  }, [filteredEntries]);

  if (chartData.length === 0) {
    return (
      <Card className="border-border/60">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm">Liquidity by Basis</CardTitle>
          <CardDescription>No volume data for selected commodity/period.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-border/60">
      <CardHeader className="space-y-3 py-3 px-4">
        <div>
          <CardTitle className="text-sm">Liquidity by Basis</CardTitle>
          <CardDescription className="text-xs">Accumulated volumes (MT)</CardDescription>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
            <Label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Period</Label>
            <div className="flex gap-1">
              <Button size="sm" variant={periodPreset === "1m" ? "secondary" : "outline"} className="h-8 px-2 text-xs" onClick={() => setPeriodPreset("1m")}>1M</Button>
              <Button size="sm" variant={periodPreset === "3m" ? "secondary" : "outline"} className="h-8 px-2 text-xs" onClick={() => setPeriodPreset("3m")}>3M</Button>
              <Button size="sm" variant={periodPreset === "6m" ? "secondary" : "outline"} className="h-8 px-2 text-xs" onClick={() => setPeriodPreset("6m")}>6M</Button>
              <Button size="sm" variant={periodPreset === "custom" ? "secondary" : "outline"} className="h-8 px-2 text-xs" onClick={() => setPeriodPreset("custom")}>Custom</Button>
            </div>
            {periodPreset === "custom" ? (
              <div className="flex gap-1">
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-8 text-xs" />
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-8 text-xs" />
              </div>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-2 pt-0 pb-4">
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.3} />
              <XAxis type="number" tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} tick={{fontSize: 10}} tickLine={false} axisLine={false} />
              <YAxis dataKey="basis" type="category" width={80} tick={{fontSize: 11}} tickLine={false} axisLine={false} />
              <Tooltip 
                cursor={{fill: 'rgba(255,255,255,0.05)'}}
                contentStyle={{ backgroundColor: "rgba(0,0,0,0.8)", border: "1px solid #333", borderRadius: "6px" }}
                itemStyle={{ fontSize: "12px" }}
              />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              <Bar dataKey="bidVolume" name="Bid Volume" stackId="a" fill="hsl(160 65% 45%)" radius={[0, 0, 0, 0]} barSize={20} />
              <Bar dataKey="offerVolume" name="Offer Volume" stackId="a" fill="hsl(38 85% 52%)" radius={[0, 2, 2, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
