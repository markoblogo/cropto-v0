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
  isStale?: boolean;
  staleReason?: string | null;
  latestPrice: {
    price: number;
    delta: number | null;
    timestamp: string;
  } | null;
}

interface CommodityIndexCardProps {
  index: CommodityIndex;
  change24hPercent?: number | null;
  change7dPercent?: number | null;
  change30dPercent?: number | null;
  indexType?: 'export' | 'processing' | 'other';
  categoryLabel?: string;
  hasPosition?: boolean;
  onViewDetails?: (slug: string) => void;
  onTrade?: (slug: string) => void;
}

export function CommodityIndexCard({ 
  index, 
  change24hPercent: propChange24hPercent,
  change7dPercent,
  change30dPercent,
  indexType: propIndexType,
  categoryLabel,
  hasPosition = false,
  onViewDetails,
  onTrade
}: CommodityIndexCardProps) {
  const hasPrice = index.latestPrice !== null;
  const priceValue = hasPrice && index.latestPrice ? index.latestPrice.price : 0;
  const deltaValue = hasPrice && index.latestPrice && index.latestPrice.delta !== null ? index.latestPrice.delta : 0;
  
  // Use provided change24hPercent or calculate from delta
  const changePercent = propChange24hPercent !== undefined 
    ? propChange24hPercent
    : (deltaValue !== null && priceValue > 0 
      ? ((deltaValue / (priceValue - deltaValue)) * 100) 
      : null);
  
  const isPositive = changePercent !== null && changePercent > 0;
  const isNegative = changePercent !== null && changePercent < 0;
  const isNeutral = changePercent === null || changePercent === 0;

  const TrendIcon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;
  const trendColor = isPositive 
    ? "text-green-600 dark:text-green-400" 
    : isNegative 
    ? "text-red-600 dark:text-red-400" 
    : "text-muted-foreground";
  const isStale = !!index.isStale;

  // Get index metadata (pair code and type) - use prop if provided, otherwise calculate
  const metadata = getIndexMetadata(index.slug, index.category);
  const indexType = propIndexType || metadata.type;

  return (
    <Card data-testid={`card-index-${index.slug}`} className={isStale ? "opacity-60" : ""}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <img 
                src={`/commodities/${index.slug}.png`}
                alt={index.name}
                className="w-6 h-6 object-contain flex-shrink-0"
              />
              <CardTitle className="text-sm font-semibold truncate">
                {index.name}
              </CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[11px] font-mono text-muted-foreground">
                {metadata.pairCode}
              </span>
              {categoryLabel && (
                <Badge variant="outline" className="text-[11px]">
                  {categoryLabel}
                </Badge>
              )}
              <Badge 
                variant={indexType === "export" ? "default" : "secondary"}
                className="text-[11px]"
              >
                {indexType === "export" ? "Export" : indexType === "processing" ? "Processing" : "Other"}
              </Badge>
              {isStale && (
                <Badge variant="outline" className="text-[11px] border-amber-500 text-amber-600 bg-amber-50">
                  Paused
                </Badge>
              )}
            </div>
          </div>
          {hasPosition && (
            <Badge variant="outline" className="text-[11px] border-emerald-500 text-emerald-600 bg-emerald-50 self-start">
              Position
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isStale ? (
          <p className="text-sm text-muted-foreground">
            No recent quotes. Trading temporarily disabled.
          </p>
        ) : hasPrice ? (
          <>
            {/* Price and Change */}
                <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground mb-0.5">Price</span>
                <span className="text-2xl font-bold font-mono whitespace-nowrap" data-testid={`text-price-${index.slug}`}>
                  ${priceValue.toFixed(2)} / t
                </span>
              </div>
                  <div className="flex flex-col items-end gap-1 text-xs">
                    {changePercent !== null && (
                      <div className={`flex items-center gap-1 ${trendColor}`} data-testid={`text-delta-${index.slug}`}>
                        <TrendIcon className="w-3 h-3" />
                        <span className="font-semibold">
                          {isPositive ? "+" : ""}{changePercent.toFixed(2)}%
                        </span>
                        <span className="text-muted-foreground">24h</span>
                      </div>
                    )}
                    {change7dPercent !== undefined && change7dPercent !== null && (
                      <div className={`flex items-center gap-1 ${change7dPercent > 0 ? "text-green-600" : change7dPercent < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                        <span className="font-semibold">
                          {change7dPercent > 0 ? "+" : ""}{change7dPercent.toFixed(2)}%
                        </span>
                        <span className="text-muted-foreground">7d</span>
                      </div>
                    )}
                    {change30dPercent !== undefined && change30dPercent !== null && (
                      <div className={`flex items-center gap-1 ${change30dPercent > 0 ? "text-green-600" : change30dPercent < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                        <span className="font-semibold">
                          {change30dPercent > 0 ? "+" : ""}{change30dPercent.toFixed(2)}%
                        </span>
                        <span className="text-muted-foreground">30d</span>
                      </div>
                    )}
                  </div>
            </div>

            {/* Mini sparkline placeholder */}
            <div className="h-8 w-full bg-muted/30 rounded flex items-center justify-center">
              <span className="text-xs text-muted-foreground">Chart</span>
            </div>

            {/* Last Updated and View Button */}
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground" data-testid={`text-updated-${index.slug}`}>
                {hasPrice && index.latestPrice ? new Date(index.latestPrice.timestamp).toLocaleTimeString() : 'N/A'}
              </p>
              <div className="flex gap-1">
                {onTrade && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onTrade(index.slug)}
                    className="h-7 gap-1 text-xs"
                    data-testid={`button-trade-${index.slug}`}
                  >
                    Trade
                  </Button>
                )}
                {!onTrade && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.location.href = `/spot-trading?commodity=${index.slug}`}
                    className="h-7 gap-1 text-xs"
                    data-testid={`button-trade-${index.slug}`}
                  >
                    Trade
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onViewDetails?.(index.slug)}
                  className="h-7 gap-1 text-xs"
                  data-testid={`button-view-${index.slug}`}
                >
                  <LineChartIcon className="w-3 h-3" />
                  View details
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
