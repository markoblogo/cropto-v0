import React, { useMemo } from "react";
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
import type { BrokerageEntry } from "../../types";

interface LiquidityByBasisProps {
  entries: BrokerageEntry[];
}

export function LiquidityByBasis({ entries }: LiquidityByBasisProps) {
  const chartData = useMemo(() => {
    const basisMap = new Map<string, { basis: string; bidVolume: number; offerVolume: number; totalVolume: number }>();

    for (const entry of entries) {
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
  }, [entries]);

  if (chartData.length === 0) {
    return (
      <Card className="border-border/60">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm">Liquidity by Basis</CardTitle>
          <CardDescription>No volume data available.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-border/60">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm">Liquidity by Basis</CardTitle>
        <CardDescription className="text-xs">Accumulated volumes (MT)</CardDescription>
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
