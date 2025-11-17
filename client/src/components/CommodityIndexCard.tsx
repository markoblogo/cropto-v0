import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Minus, LineChart as LineChartIcon } from "lucide-react";
import { LineChart, Line, ResponsiveContainer } from "recharts";

interface CommodityIndex {
  id: string;
  name: string;
  slug: string;
  category: string;
  hasVat: boolean;
  latestPrice: {
    price: number;
    delta: number | null;
    timestamp: string;
  } | null;
}

interface CommodityIndexCardProps {
  index: CommodityIndex;
  onViewDetails?: (slug: string) => void;
}

export function CommodityIndexCard({ index, onViewDetails }: CommodityIndexCardProps) {
  const hasPrice = index.latestPrice !== null;
  const priceValue = hasPrice && index.latestPrice ? index.latestPrice.price : 0;
  const deltaValue = hasPrice && index.latestPrice && index.latestPrice.delta !== null ? index.latestPrice.delta : 0;
  
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
    <Card data-testid={`card-index-${index.slug}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <img 
              src={`/commodities/${index.slug}.png`}
              alt={index.name}
              className="w-6 h-6 object-contain flex-shrink-0"
            />
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {index.name}
            </CardTitle>
          </div>
          <span className="text-xs text-muted-foreground px-2 py-0.5 bg-muted rounded">
            {index.category}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasPrice ? (
          <>
            {/* Price and Change */}
            <div className="flex items-baseline justify-between">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono" data-testid={`text-price-${index.slug}`}>
                  ${priceValue.toFixed(2)}
                </span>
              </div>
              {hasPrice && index.latestPrice && index.latestPrice.delta !== null && (
                <div className={`flex items-center gap-1 ${trendColor}`} data-testid={`text-delta-${index.slug}`}>
                  <TrendIcon className="w-4 h-4" />
                  <span className="text-sm font-medium">
                    {isPositive ? "+" : ""}{deltaValue.toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            {/* Last Updated and View Button */}
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground" data-testid={`text-updated-${index.slug}`}>
                {hasPrice && index.latestPrice ? new Date(index.latestPrice.timestamp).toLocaleTimeString() : 'N/A'}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onViewDetails?.(index.slug)}
                className="h-7 gap-1 text-xs"
                data-testid={`button-view-${index.slug}`}
              >
                <LineChartIcon className="w-3 h-3" />
                View Details
              </Button>
            </div>
          </>
        ) : (
          <div className="py-4">
            <p className="text-sm text-muted-foreground text-center">
              No price data available
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onViewDetails?.(index.slug)}
              className="h-7 gap-1 text-xs w-full mt-2"
              data-testid={`button-view-${index.slug}`}
            >
              <LineChartIcon className="w-3 h-3" />
              View Details
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
