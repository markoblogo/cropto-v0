import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getIndexMetadata } from "@/lib/indexMapping";

interface SpotMarketCardProps {
  slug: string;
  name: string;
  pricePerTon: number;
  delta: number | null;
  category?: string;
  onBuy: (slug: string, name: string, pricePerTon: number) => void;
  onSell: (slug: string, name: string, pricePerTon: number) => void;
  index?: number;
}

export function SpotMarketCard({
  slug,
  name,
  pricePerTon,
  delta,
  category = "",
  onBuy,
  onSell,
  index = 0,
}: SpotMarketCardProps) {
  const { t } = useTranslation();
  const deltaValue = delta || 0;
  
  // Calculate 24h change percentage if delta is available
  const changePercent = deltaValue !== null && pricePerTon > 0 
    ? ((deltaValue / (pricePerTon - deltaValue)) * 100) 
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
  const metadata = category ? getIndexMetadata(slug, category) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      <Card 
        data-testid={`card-spot-${slug}`} 
        className="rounded-xl shadow-md hover:shadow-lg hover:scale-[1.01] transition-all duration-200"
      >
        <CardHeader className="pb-3 p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <img 
                src={`/commodities/${slug}.png`}
                alt={name}
                className="w-8 h-8 object-contain flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <CardTitle className="text-lg font-bold leading-tight truncate">
                  {name}
                </CardTitle>
                {metadata && (
                  <div className="flex items-center gap-2 mt-1">
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
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-5 pt-0">
          <div className="flex items-baseline justify-between">
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground mb-1">Price</span>
              <span className="text-2xl font-bold font-mono" data-testid={`text-price-${slug}`}>
                ${pricePerTon.toFixed(2)}
              </span>
            </div>
            {changePercent !== null && (
              <div className={`flex flex-col items-end ${trendColor}`} data-testid={`text-delta-${slug}`}>
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

          {/* Mini sparkline placeholder */}
          <div className="h-8 w-full bg-muted/30 rounded flex items-center justify-center">
            <span className="text-xs text-muted-foreground">Chart</span>
          </div>

          <div className="flex gap-2">
            <Button
              size="default"
              className="flex-1 bg-primary hover:bg-primary/90 transition-colors"
              onClick={() => onBuy(slug, name, pricePerTon)}
              data-testid={`button-buy-${slug}`}
            >
              {t('spot.market.buy')}
            </Button>
            <Button
              size="default"
              variant="secondary"
              className="flex-1 transition-colors"
              onClick={() => onSell(slug, name, pricePerTon)}
              data-testid={`button-sell-${slug}`}
            >
              {t('spot.market.sell')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
