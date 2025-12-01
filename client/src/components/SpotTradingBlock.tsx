import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { SpotBuyModal } from "./SpotBuyModal";
import { SpotSellModal } from "./SpotSellModal";
import { WalletAuthModal } from "@/components/WalletAuthModal";
import { useTradingGuard } from "@/hooks/useTradingGuard";
import { getTradingPairs } from "@/lib/indexMapping";

interface CommodityIndex {
  id: string;
  name: string;
  slug: string;
  category: string;
  hasVat: boolean;
  latestPrice: {
    price: number;
    delta: number | null;
    timestamp: Date;
  } | null;
}

export function SpotTradingBlock() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [selectedPairSlug, setSelectedPairSlug] = useState<string | null>(null);
  const [buyModalOpen, setBuyModalOpen] = useState(false);
  const [sellModalOpen, setSellModalOpen] = useState(false);
  const [isWalletAuthModalOpen, setIsWalletAuthModalOpen] = useState(false);

  const guardTradingAction = useTradingGuard({
    onOpenLogin: () => setLocation("/login"),
    onOpenWalletModal: () => setIsWalletAuthModalOpen(true),
  });

  const { data: indexes, isLoading } = useQuery<CommodityIndex[]>({
    queryKey: ["/api/indexes"],
    refetchInterval: 30000,
  });

  // Get trading pairs from indexes
  const tradingPairs = indexes ? getTradingPairs(indexes) : [];
  
  // Set default selected pair if none selected and pairs are available
  useEffect(() => {
    if (!selectedPairSlug && tradingPairs.length > 0) {
      setSelectedPairSlug(tradingPairs[0].slug);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradingPairs.length]); // Only depend on length to avoid infinite loops

  const selectedPair = tradingPairs.find(p => p.slug === selectedPairSlug);
  const selectedIndex = indexes?.find(idx => idx.slug === selectedPairSlug);
  const currentPrice = selectedIndex?.latestPrice?.price || 0;
  const delta = selectedIndex?.latestPrice?.delta || null;
  
  // Calculate 24h change percentage
  const changePercent = delta !== null && currentPrice > 0 
    ? ((delta / (currentPrice - delta)) * 100) 
    : null;
  
  const isPositive = (delta || 0) > 0;
  const isNegative = (delta || 0) < 0;
  const TrendIcon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;
  const trendColor = isPositive 
    ? "text-green-600 dark:text-green-400" 
    : isNegative 
    ? "text-red-600 dark:text-red-400" 
    : "text-muted-foreground";

  const handleBuy = () => {
    if (!selectedPair || !selectedIndex) return;
    guardTradingAction(() => {
      setBuyModalOpen(true);
    });
  };

  const handleSell = () => {
    if (!selectedPair || !selectedIndex) return;
    guardTradingAction(() => {
      setSellModalOpen(true);
    });
  };

  const handleWalletAuthSuccess = (token: string, newUser: boolean) => {
    setIsWalletAuthModalOpen(false);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('spot.trading.title', 'Spot Trading')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-16 w-full" />
          <div className="flex gap-2">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 flex-1" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!tradingPairs.length) {
    return null;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t('spot.trading.title', 'Spot Trading')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Pair Selector */}
          <div>
            <label className="text-sm font-medium mb-2 block">
              {t('spot.trading.pair', 'Pair')}
            </label>
            <Select
              value={selectedPairSlug || ""}
              onValueChange={setSelectedPairSlug}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('spot.trading.selectPair', 'Select trading pair')} />
              </SelectTrigger>
              <SelectContent>
                {tradingPairs.map((pair) => (
                  <SelectItem key={pair.slug} value={pair.slug}>
                    {pair.pairCode} - {pair.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Price and Change Display */}
          {selectedPair && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    {t('spot.trading.price', 'Price')}
                  </p>
                  <p className="text-2xl font-bold font-mono">
                    ${currentPrice.toFixed(2)}
                  </p>
                </div>
                {changePercent !== null && (
                  <div className={`flex flex-col items-end ${trendColor}`}>
                    <div className="flex items-center gap-1">
                      <TrendIcon className="w-4 h-4" />
                      <span className="text-sm font-semibold">
                        {isPositive ? "+" : ""}{changePercent.toFixed(2)}%
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {t('spot.trading.change24h', '24h change')}
                    </span>
                  </div>
                )}
              </div>
              {/* Mini sparkline placeholder */}
              <div className="h-8 w-full bg-background/50 rounded flex items-center justify-center">
                <span className="text-xs text-muted-foreground">Chart</span>
              </div>
            </div>
          )}

          {/* Buy / Sell Buttons */}
          <div className="flex gap-2">
            <Button
              className="flex-1 bg-green-600 hover:bg-green-700"
              onClick={handleBuy}
              disabled={!selectedPair}
            >
              {t('spot.market.buy', 'Buy')}
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={handleSell}
              disabled={!selectedPair}
            >
              {t('spot.market.sell', 'Sell')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Modals */}
      {selectedPair && selectedIndex && (
        <>
          <SpotBuyModal
            isOpen={buyModalOpen}
            onClose={() => setBuyModalOpen(false)}
            commoditySlug={selectedPair.slug}
            commodityName={selectedPair.name}
            currentPrice={currentPrice}
            onOpenLogin={() => setLocation("/login")}
            onOpenWalletModal={() => setIsWalletAuthModalOpen(true)}
          />
          <SpotSellModal
            isOpen={sellModalOpen}
            onClose={() => setSellModalOpen(false)}
            commoditySlug={selectedPair.slug}
            commodityName={selectedPair.name}
            currentPrice={currentPrice}
            onOpenLogin={() => setLocation("/login")}
            onOpenWalletModal={() => setIsWalletAuthModalOpen(true)}
          />
        </>
      )}

      <WalletAuthModal
        open={isWalletAuthModalOpen}
        onOpenChange={setIsWalletAuthModalOpen}
        onSuccess={handleWalletAuthSuccess}
      />
    </>
  );
}

