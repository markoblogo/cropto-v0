import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface SpotMarketCardProps {
  slug: string;
  name: string;
  pricePerTon: number;
  delta: number | null;
  onBuy: (slug: string, name: string, pricePerTon: number) => void;
  onSell: (slug: string, name: string, pricePerTon: number) => void;
}

export function SpotMarketCard({
  slug,
  name,
  pricePerTon,
  delta,
  onBuy,
  onSell,
}: SpotMarketCardProps) {
  const pricePerKg = pricePerTon / 1000;
  const deltaValue = delta || 0;
  
  const isPositive = deltaValue > 0;
  const isNegative = deltaValue < 0;
  const isNeutral = deltaValue === 0;

  const TrendIcon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;
  const trendColor = isPositive 
    ? "text-green-600 dark:text-green-400" 
    : isNegative 
    ? "text-red-600 dark:text-red-400" 
    : "text-muted-foreground";

  return (
    <Card data-testid={`card-spot-${slug}`} className="hover-elevate">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <img 
            src={`/commodities/${slug}.png`}
            alt={name}
            className="w-8 h-8 object-contain flex-shrink-0"
          />
          <CardTitle className="text-base font-semibold">
            {name}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline justify-between">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground mb-1">Price per kg</span>
            <span className="text-xl font-bold font-mono" data-testid={`text-price-${slug}`}>
              ${pricePerKg.toFixed(4)}
            </span>
          </div>
          {delta !== null && (
            <div className={`flex items-center gap-1 ${trendColor}`} data-testid={`text-delta-${slug}`}>
              <TrendIcon className="w-4 h-4" />
              <span className="text-sm font-medium">
                {isPositive ? "+" : ""}{deltaValue.toFixed(2)}
              </span>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1"
            onClick={() => onBuy(slug, name, pricePerTon)}
            data-testid={`button-buy-${slug}`}
          >
            Buy
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => onSell(slug, name, pricePerTon)}
            data-testid={`button-sell-${slug}`}
          >
            Sell
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
