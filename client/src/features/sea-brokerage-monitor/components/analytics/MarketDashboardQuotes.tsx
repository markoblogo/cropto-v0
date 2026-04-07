import React from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUp, ArrowDown, ArrowRight, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export interface MarketQuote {
  id: string;
  symbol: string;
  category: "macro" | "cbot" | "matif";
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

  if (isLoading || !quotes) {
    return (
      <Card className="border-border/60">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Market Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-md" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const renderQuote = (quote: MarketQuote) => {
    const isPositive = quote.change > 0;
    const isNegative = quote.change < 0;
    const TrendIcon = isPositive ? ArrowUp : isNegative ? ArrowDown : ArrowRight;

    return (
      <div
        key={quote.id}
        className="flex flex-col justify-center rounded-md border border-border/60 bg-muted/10 p-3 shadow-sm"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">{quote.symbol}</span>
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
              {isPositive ? "+" : ""}
              {quote.change}
            </span>
          </div>
        </div>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-lg font-bold leading-none">{quote.price.toFixed(2)}</span>
          <span className="text-[10px] text-muted-foreground uppercase">{quote.priceUnit}</span>
        </div>
      </div>
    );
  };

  return (
    <Card className="border-border/60 overflow-hidden bg-gradient-to-br from-background to-muted/5">
      <CardHeader className="py-3 px-4 border-b border-border/40">
        <CardTitle className="text-xs uppercase tracking-[0.15em] text-muted-foreground flex items-center gap-2">
          <Activity className="h-3.5 w-3.5" />
          Market Dashboard
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {quotes.map(renderQuote)}
      </CardContent>
    </Card>
  );
}
