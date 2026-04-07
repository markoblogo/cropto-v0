import React, { useMemo, useState } from "react";
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Scatter,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { BrokerageEntry } from "../../types";
import { getEntryMidPrice } from "./utils";

interface UniversalChartProps {
  entries: BrokerageEntry[];
}

export function UniversalChart({ entries }: UniversalChartProps) {
  const [showPrice, setShowPrice] = useState(true);
  const [showVolume, setShowVolume] = useState(true);

  const chartData = useMemo(() => {
    // Group entries by date
    const grouped = new Map<string, {
      date: string;
      bidPriceSum: number; bidCount: number;
      offerPriceSum: number; offerCount: number;
      bidVolume: number; offerVolume: number;
      scatterPoints: any[];
    }>();

    for (const entry of entries) {
      if (entry.type !== "bid" && entry.type !== "offer") continue;
      
      const dateKey = new Date(entry.createdAt).toISOString().slice(0, 10);
      let dayData = grouped.get(dateKey);
      if (!dayData) {
        dayData = {
          date: dateKey,
          bidPriceSum: 0, bidCount: 0,
          offerPriceSum: 0, offerCount: 0,
          bidVolume: 0, offerVolume: 0,
          scatterPoints: []
        };
        grouped.set(dateKey, dayData);
      }

      const volume = Number(entry.quantityMt ?? entry.volumeTo ?? entry.volumeFrom ?? 0);
      const price = getEntryMidPrice(entry);

      if (entry.type === "bid") {
        if (Number.isFinite(volume)) dayData.bidVolume += volume;
        if (price !== null && Number.isFinite(price)) {
          dayData.bidPriceSum += price;
          dayData.bidCount += 1;
        }
      } else if (entry.type === "offer") {
        if (Number.isFinite(volume)) dayData.offerVolume += volume;
        if (price !== null && Number.isFinite(price)) {
          dayData.offerPriceSum += price;
          dayData.offerCount += 1;
        }
      }

      if (price !== null && Number.isFinite(price)) {
        dayData.scatterPoints.push({
          x: dateKey,
          y: price,
          type: entry.type,
          basis: entry.basis,
          currency: entry.currency
        });
      }
    }

    return Array.from(grouped.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(day => ({
        ...day,
        avgBid: day.bidCount > 0 ? Number((day.bidPriceSum / day.bidCount).toFixed(2)) : null,
        avgOffer: day.offerCount > 0 ? Number((day.offerPriceSum / day.offerCount).toFixed(2)) : null,
      }));
  }, [entries]);

  const scatterData = useMemo(() => {
    return chartData.flatMap(day => day.scatterPoints);
  }, [chartData]);

  if (entries.length === 0) {
    return (
      <Card className="border-border/60">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm">Universal Price & Volume Chart</CardTitle>
          <CardDescription>No data matching current filters.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-border/60">
      <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm">Price & Volume Dynamics</CardTitle>
          <CardDescription className="text-xs">Based on currently filtered tape</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button 
            variant={showPrice ? "secondary" : "outline"} 
            size="sm" 
            className="h-7 text-xs"
            onClick={() => setShowPrice(!showPrice)}
          >
            Price VWAP
          </Button>
          <Button 
            variant={showVolume ? "secondary" : "outline"} 
            size="sm" 
            className="h-7 text-xs"
            onClick={() => setShowVolume(!showVolume)}
          >
            Volume
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-2 pt-0 pb-4">
        <div className="h-[350px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
              <XAxis dataKey="date" tick={{fontSize: 10}} tickLine={false} axisLine={false} />
              
              {showPrice && <YAxis yAxisId="price" orientation="left" tick={{fontSize: 10}} tickLine={false} axisLine={false} width={40} />}
              {showVolume && <YAxis yAxisId="volume" orientation="right" tick={{fontSize: 10}} tickLine={false} axisLine={false} width={50} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />}
              
              <Tooltip 
                contentStyle={{ backgroundColor: "rgba(0,0,0,0.8)", border: "1px solid #333", borderRadius: "6px" }}
                itemStyle={{ fontSize: "12px" }}
                labelStyle={{ fontSize: "12px", color: "#888", marginBottom: "4px" }}
              />
              <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />

              {showVolume && (
                <>
                  <Bar yAxisId="volume" dataKey="bidVolume" name="Bid Volume (MT)" fill="hsl(160 65% 45%)" opacity={0.2} radius={[2,2,0,0]} barSize={20} />
                  <Bar yAxisId="volume" dataKey="offerVolume" name="Offer Volume (MT)" fill="hsl(38 85% 52%)" opacity={0.2} radius={[2,2,0,0]} barSize={20} />
                </>
              )}

              {showPrice && (
                <>
                  <Line yAxisId="price" type="monotone" dataKey="avgBid" name="Avg Bid" stroke="hsl(160 65% 45%)" strokeWidth={2} dot={false} />
                  <Line yAxisId="price" type="monotone" dataKey="avgOffer" name="Avg Offer" stroke="hsl(38 85% 52%)" strokeWidth={2} dot={false} />
                  <Scatter yAxisId="price" data={scatterData} name="Offers" fill="hsl(38 85% 52%)" opacity={0.6} dataKey="y" shape="circle" />
                </>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
