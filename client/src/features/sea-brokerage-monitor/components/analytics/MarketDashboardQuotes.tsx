import React from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUp, ArrowDown, ArrowRight, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export interface MarketQuote {
  id: string;
  symbol: string;
  category: "macro" | "cbot" | "matif" | "spike_cpt";
  price: number;
  change: number;
  priceUnit: string;
  trend: "up" | "down" | "flat";
}

export function MarketDashboardQuotes() {
  const { data: quotes, isLoading } = useQuery<MarketQuote[]>({
    queryKey: ["/api/market-dashboard/quotes"],
    refetchInterval: 60000, // Refresh every minute
  });

  const deltaFormatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });

  if (isLoading || !quotes) {
    return (
      <Card className="border-border/60">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Market Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-md" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const renderQuote = (quote: MarketQuote) => {
    const isPositive = quote.change > 0;
    const isNegative = quote.change < 0;
    const TrendIcon = isPositive ? ArrowUp : isNegative ? ArrowDown : ArrowRight;
    const formattedDelta = `${isPositive ? "+" : isNegative ? "-" : ""}${deltaFormatter.format(
      Math.abs(quote.change),
    )}`;

    return (
      <div
        key={quote.id}
        className="flex min-h-[58px] flex-col justify-center rounded-md border border-border/60 bg-muted/10 px-3 py-2 shadow-sm"
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium leading-tight text-muted-foreground">{quote.symbol}</span>
          <div className="flex items-center gap-1">
            <TrendIcon
              className={`h-3 w-3 ${
                isPositive ? "text-emerald-500" : isNegative ? "text-red-500" : "text-muted-foreground"
              }`}
            />
            <span
              className={`text-xs font-semibold ${
                isPositive ? "text-emerald-500" : isNegative ? "text-red-500" : "text-muted-foreground"
              }`}
            >
              {formattedDelta}
            </span>
          </div>
        </div>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-2xl font-bold leading-none">{quote.price.toFixed(2)}</span>
          <span className="text-[10px] text-muted-foreground uppercase">{quote.priceUnit}</span>
        </div>
      </div>
    );
  };

  const quoteById = new Map(quotes.map((quote) => [quote.id, quote] as const));

  const columns: Array<{ title: string; ids: string[] }> = [
    {
      title: "Global",
      ids: ["eurusd", "gold", "wti", "spx", "dow"],
    },
    {
      title: "CBOT (US)",
      ids: ["cbot_corn", "cbot_wheat", "cbot_soy", "cbot_soy_oil", "cbot_soy_meal"],
    },
    {
      title: "MATIF (EU)",
      ids: ["matif_corn", "matif_wheat", "matif_rape"],
    },
    {
      title: "SPIKE CPT (UA)",
      ids: [
        "spike_cpt_corn",
        "spike_cpt_wheat_115",
        "spike_cpt_feed_wheat",
        "spike_cpt_soybean_gmo",
        "spike_cpt_sunflower_seeds",
      ],
    },
  ];

  const renderEmptySlot = (id: string) => (
    <div
      key={id}
      className="flex min-h-[58px] items-center rounded-md border border-dashed border-border/30 px-3 py-2 text-[11px] text-muted-foreground/60"
    >
      No data
    </div>
  );

  return (
    <Card className="border-border/60 overflow-hidden bg-gradient-to-br from-background to-muted/5">
      <CardHeader className="py-3 px-4 border-b border-border/40">
        <CardTitle className="text-xs uppercase tracking-[0.15em] text-muted-foreground flex items-center gap-2">
          <Activity className="h-3.5 w-3.5" />
          Market Dashboard
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {columns.map((column) => (
          <div key={column.title} className="space-y-2">
            <div className="px-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {column.title}
            </div>
            <div className="space-y-2">
              {column.ids.map((id) => {
                const quote = quoteById.get(id);
                return quote ? renderQuote(quote) : renderEmptySlot(id);
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
