import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, LineChart as LineChartIcon } from "lucide-react";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { getIndexMetadata } from "@/lib/indexMapping";

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
  
  // Calculate 24h change percentage if delta is available
  const changePercent = deltaValue !== null && priceValue > 0 
    ? ((deltaValue / (priceValue - deltaValue)) * 100) 
    : null;
  
  const isPositive = deltaValue > 0;
  const isNegative = deltaValue < 0;
  const isNeutral = deltaValue === 0;

  const TrendIcon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;
  const trendColor = isPositive 
    ? "text-green-600 dark:text-green-400" 
    : isNegative 
    ? "text-red-600 dark:text-red-400" 
    : "text-muted-foreground";

  // Get index metadata (pair code and type)
  const metadata = getIndexMetadata(index.slug, index.category);

  return (
    <Card data-testid={`card-index-${index.slug}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <img 
                src={`/commodities/${index.slug}.png`}
                alt={index.name}
                className="w-6 h-6 object-contain flex-shrink-0"
              />
              <CardTitle className="text-sm font-semibold truncate">
                {index.name}
              </CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground">
                {metadata.pairCode}
              </span>
              <Badge 
                variant={metadata.type === "export" ? "default" : "secondary"}
                className="text-xs"
              >
                {metadata.type === "export" ? "Export" : "Processing"}
              </Badge>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasPrice ? (
          <>
            {/* Price and Change */}
            <div className="flex items-baseline justify-between">
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground mb-0.5">Price</span>
                <span className="text-2xl font-bold font-mono" data-testid={`text-price-${index.slug}`}>
                  ${priceValue.toFixed(2)}
                </span>
              </div>
              {changePercent !== null && (
                <div className={`flex flex-col items-end ${trendColor}`} data-testid={`text-delta-${index.slug}`}>
                  <div className="flex items-center gap-1">
                    <TrendIcon className="w-4 h-4" />
                    <span className="text-sm font-semibold">
                      {isPositive ? "+" : ""}{changePercent.toFixed(2)}%
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">24h</span>
                </div>
              )}
            </div>

            {/* Mini sparkline placeholder - will be implemented when history is available */}
            <div className="h-8 w-full bg-muted/30 rounded flex items-center justify-center">
              <span className="text-xs text-muted-foreground">Chart</span>
            </div>

            {/* Last Updated and View Button */}
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground" data-testid={`text-updated-${index.slug}`}>
                {hasPrice && index.latestPrice ? new Date(index.latestPrice.timestamp).toLocaleTimeString() : 'N/A'}
              </p>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.location.href = `/spot-trading?commodity=${index.slug}`}
                  className="h-7 gap-1 text-xs"
                  data-testid={`button-trade-${index.slug}`}
                >
                  Trade
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onViewDetails?.(index.slug)}
                  className="h-7 gap-1 text-xs"
                  data-testid={`button-view-${index.slug}`}
                >
                  <LineChartIcon className="w-3 h-3" />
                  Details
                </Button>
              </div>
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
