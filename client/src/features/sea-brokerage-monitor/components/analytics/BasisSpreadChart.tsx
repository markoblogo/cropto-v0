import React, { useMemo, useState } from "react";
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
import type { BrokerageEntry } from "../../types";
import { getEntryMidPrice } from "./utils";

interface BasisSpreadChartProps {
  entries: BrokerageEntry[];
}

export function BasisSpreadChart({ entries }: BasisSpreadChartProps) {
  const [basisA, setBasisA] = useState<string>("");
  const [basisB, setBasisB] = useState<string>("");

  const availableBases = useMemo(() => {
    const bases = new Set<string>();
    entries.forEach(e => {
        if (e.basis) bases.add(e.basis.toUpperCase());
    });
    const sorted = Array.from(bases).sort();
    
    // Auto-select first two if not yet selected
    if (sorted.length >= 2 && !basisA && !basisB) {
      setBasisA(sorted[0]);
      setBasisB(sorted[1]);
    } else if (sorted.length === 1 && !basisA) {
      setBasisA(sorted[0]);
    }
    return sorted;
  }, [entries, basisA, basisB]);

  const chartData = useMemo(() => {
    if (!basisA || !basisB) return [];

    // Group by Date -> { Date, BasisA_Avg, BasisB_Avg }
    const dailyAgg = new Map<string, {
      date: string;
      aSum: number; aCount: number;
      bSum: number; bCount: number;
    }>();

    for (const entry of entries) {
      if (entry.type !== "bid" && entry.type !== "offer") continue;
      if (!entry.basis) continue;

      const currentBasis = entry.basis.toUpperCase();
      if (currentBasis !== basisA && currentBasis !== basisB) continue;

      const dateKey = new Date(entry.createdAt).toISOString().slice(0, 10);
      const price = getEntryMidPrice(entry);

      if (price !== null && Number.isFinite(price)) {
        let dayData = dailyAgg.get(dateKey);
        if (!dayData) {
          dayData = { date: dateKey, aSum: 0, aCount: 0, bSum: 0, bCount: 0 };
          dailyAgg.set(dateKey, dayData);
        }

        if (currentBasis === basisA) {
          dayData.aSum += price;
          dayData.aCount += 1;
        } else {
          dayData.bSum += price;
          dayData.bCount += 1;
        }
      }
    }

    return Array.from(dailyAgg.values())
      .map(day => {
        const avgA = day.aCount > 0 ? day.aSum / day.aCount : null;
        const avgB = day.bCount > 0 ? day.bSum / day.bCount : null;
        const spread = (avgA !== null && avgB !== null) ? Number((avgA - avgB).toFixed(2)) : null;

        return {
          date: day.date,
          [basisA]: avgA !== null ? Number(avgA.toFixed(2)) : null,
          [basisB]: avgB !== null ? Number(avgB.toFixed(2)) : null,
          spread
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [entries, basisA, basisB]);

  if (availableBases.length < 2) {
    return (
      <Card className="border-border/60">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm">Basis Spread Chart</CardTitle>
          <CardDescription>Need at least 2 different bases in current filter to compare.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-border/60">
      <CardHeader className="py-3 px-4 flex flex-row items-start justify-between flex-wrap gap-4">
        <div>
          <CardTitle className="text-sm">Spread Between Basis</CardTitle>
          <CardDescription className="text-xs">Compare historical average prices</CardDescription>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={basisA} onValueChange={setBasisA}>
            <SelectTrigger className="w-[120px] h-7 text-xs">
              <SelectValue placeholder="Basis A" />
            </SelectTrigger>
            <SelectContent>
              {availableBases.map(b => (
                <SelectItem key={b} value={b} className="text-xs">{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground font-semibold">vs</span>
          <Select value={basisB} onValueChange={setBasisB}>
            <SelectTrigger className="w-[120px] h-7 text-xs">
              <SelectValue placeholder="Basis B" />
            </SelectTrigger>
            <SelectContent>
              {availableBases.map(b => (
                <SelectItem key={b} value={b} className="text-xs">{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="px-2 pt-0 pb-4">
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
              <XAxis dataKey="date" tick={{fontSize: 10}} tickLine={false} axisLine={false} />
              <YAxis yAxisId="price" orientation="left" tick={{fontSize: 10}} tickLine={false} axisLine={false} width={40} />
              <YAxis yAxisId="spread" orientation="right" tick={{fontSize: 10}} tickLine={false} axisLine={false} width={40} />
              <Tooltip 
                contentStyle={{ backgroundColor: "rgba(0,0,0,0.8)", border: "1px solid #333", borderRadius: "6px" }}
                itemStyle={{ fontSize: "12px" }}
              />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              <Line yAxisId="price" type="monotone" dataKey={basisA} name={basisA} stroke="hsl(160 65% 45%)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line yAxisId="price" type="monotone" dataKey={basisB} name={basisB} stroke="hsl(38 85% 52%)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line yAxisId="spread" type="monotone" dataKey="spread" name="Spread A-B" stroke="hsl(280 65% 60%)" strokeWidth={2} strokeDasharray="4 4" dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
