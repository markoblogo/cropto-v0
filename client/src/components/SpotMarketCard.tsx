import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface SpotMarketCardProps {
  slug: string;
  name: string;
  pricePerTon: number;
  delta: number | null;
  onBuy: (slug: string, name: string, pricePerTon: number) => void;
  onSell: (slug: string, name: string, pricePerTon: number) => void;
  index?: number;
}

export function SpotMarketCard({
  slug,
  name,
  pricePerTon,
  delta,
  onBuy,
  onSell,
  index = 0,
}: SpotMarketCardProps) {
  const { t } = useTranslation();
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
          <div className="flex items-start gap-3 min-h-[56px]">
            <img 
              src={`/commodities/${slug}.png`}
              alt={name}
              className="w-8 h-8 object-contain flex-shrink-0"
            />
            <CardTitle className="text-lg font-bold leading-tight">
              {name}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-5 pt-0">
          <div className="flex items-baseline justify-between">
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground mb-1">{t('spot.market.pricePerKg')}</span>
              <span className="text-2xl font-bold font-mono" data-testid={`text-price-${slug}`}>
                ${pricePerKg.toFixed(4)}
              </span>
            </div>
            {delta !== null && (
              <div className={`flex items-center gap-1 ${trendColor}`} data-testid={`text-delta-${slug}`}>
                <TrendIcon className="w-4 h-4" />
                <span className="text-sm font-semibold">
                  {isPositive ? "+" : ""}{deltaValue.toFixed(2)}
                </span>
              </div>
            )}
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
