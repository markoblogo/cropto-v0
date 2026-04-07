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
import type { BrokerageEntry } from "../../types";
import { getEntryMidPrice } from "./utils";
import type { MarketQuote } from "./MarketDashboardQuotes";

interface PremiumToExchangeProps {
  entries: BrokerageEntry[];
}

export function PremiumToExchange({ entries }: PremiumToExchangeProps) {
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>("");

  const { data: quotes = [] } = useQuery<MarketQuote[]>({
    queryKey: ["/api/market-dashboard/quotes"],
    staleTime: Infinity,
  });

  const grainQuotes = quotes.filter(q => q.category === "cbot" || q.category === "matif");

  // Auto-select first quote if not set
  if (grainQuotes.length > 0 && !selectedQuoteId) {
    setSelectedQuoteId(grainQuotes[0].id);
  }

  const chartData = useMemo(() => {
    if (!selectedQuoteId) return [];
    
    const targetQuote = grainQuotes.find(q => q.id === selectedQuoteId);
    if (!targetQuote) return [];

    // Group physical prices by Date
    const dailyAgg = new Map<string, { sum: number; count: number }>();
    
    // We try to auto-match commodity type. If cbot_corn, we only look at corn.
    let mappedCommodity = "";
    if (selectedQuoteId.includes("corn")) mappedCommodity = "corn";
    else if (selectedQuoteId.includes("soy")) mappedCommodity = "soybean";
    else if (selectedQuoteId.includes("wheat")) mappedCommodity = "wheat";
    else if (selectedQuoteId.includes("rape")) mappedCommodity = "rapeseed";

    for (const entry of entries) {
      if (entry.type !== "bid" && entry.type !== "offer") continue;
      
      // If we inferred a commodity mapping, filter by it. Otherwise take all.
      if (mappedCommodity && !entry.commodity.toLowerCase().includes(mappedCommodity)) continue;

      const dateKey = new Date(entry.createdAt).toISOString().slice(0, 10);
      const price = getEntryMidPrice(entry);

      if (price !== null && Number.isFinite(price)) {
        let dayData = dailyAgg.get(dateKey);
        if (!dayData) {
          dayData = { sum: 0, count: 0 };
          dailyAgg.set(dateKey, dayData);
        }
        dayData.sum += price;
        dayData.count += 1;
      }
    }

    // Spread = Physical Avg - Futures Current
    return Array.from(dailyAgg.entries())
      .map(([date, agg]) => {
        const physicalAvg = agg.sum / agg.count;
        const premium = physicalAvg - targetQuote.price;
        return {
          date,
          physicalAvg: Number(physicalAvg.toFixed(2)),
          premium: Number(premium.toFixed(2)),
          futuresPrice: targetQuote.price
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [entries, selectedQuoteId, grainQuotes]);

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
      <CardHeader className="py-3 px-4 flex flex-row items-start justify-between flex-wrap gap-4">
        <div>
          <CardTitle className="text-sm">Premium to Exchange (MVP)</CardTitle>
          <CardDescription className="text-xs">Physical VWAP vs Current Futures</CardDescription>
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-xs text-muted-foreground">Exchange:</span>
          <Select value={selectedQuoteId} onValueChange={setSelectedQuoteId}>
            <SelectTrigger className="w-[180px] h-7 text-xs">
              <SelectValue placeholder="Select Exchange" />
            </SelectTrigger>
            <SelectContent>
              {grainQuotes.map(q => (
                <SelectItem key={q.id} value={q.id} className="text-xs">
                  {q.symbol} ({q.price.toFixed(2)} {q.priceUnit})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="px-2 pt-0 pb-4">
        {chartData.length === 0 ? (
          <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
            No matching physical data (check main feed filters).
          </div>
        ) : (
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis dataKey="date" tick={{fontSize: 10}} tickLine={false} axisLine={false} />
                <YAxis yAxisId="premium" orientation="left" tick={{fontSize: 10}} tickLine={false} axisLine={false} width={40} />
                <Tooltip 
                  contentStyle={{ backgroundColor: "rgba(0,0,0,0.8)", border: "1px solid #333", borderRadius: "6px" }}
                  itemStyle={{ fontSize: "12px" }}
                />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Line yAxisId="premium" type="monotone" dataKey="premium" name="Premium/Discount" stroke="hsl(200 90% 50%)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
