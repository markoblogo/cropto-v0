import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { SpotBuyModal } from "./SpotBuyModal";
import { SpotSellModal } from "./SpotSellModal";
import { WalletAuthModal } from "@/components/WalletAuthModal";
import { useTradingGuard } from "@/hooks/useTradingGuard";
import { getTradingPairs, SPOT_ALLOWED_SLUGS } from "@/lib/indexMapping";
import { SpotMiniChart } from "./SpotMiniChart";
import { SpotTradeHistory } from "./SpotTradeHistory";
import { openAuthPrompt } from "@/lib/authPrompt";

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
    timestamp: Date;
  } | null;
}

interface PriceHistoryEntry {
  id: string;
  price: number;
  delta: number | null;
  timestamp: string;
}

interface IndexDataWithHistory {
  id: string;
  name: string;
  slug: string;
  category: string;
  hasVat: boolean;
  priceHistory: PriceHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export function SpotTradingBlock() {
  const { t } = useTranslation();
  const [selectedPairSlug, setSelectedPairSlug] = useState<string | null>(null);
  const [buyModalOpen, setBuyModalOpen] = useState(false);
  const [sellModalOpen, setSellModalOpen] = useState(false);
  const [isWalletAuthModalOpen, setIsWalletAuthModalOpen] = useState(false);

  const guardTradingAction = useTradingGuard({
    onOpenLogin: () => openAuthPrompt(),
    onOpenWalletModal: () => setIsWalletAuthModalOpen(true),
  });

  const { data: indexes, isLoading } = useQuery<CommodityIndex[]>({
    queryKey: ["/api/indexes"],
    refetchInterval: 30000,
  });

  // Get trading pairs from indexes
  const tradingPairsRaw = indexes ? getTradingPairs(indexes) : [];
  const tradingPairsOrdered = tradingPairsRaw
    .filter((p) => SPOT_ALLOWED_SLUGS.includes(p.slug))
    .sort((a, b) => SPOT_ALLOWED_SLUGS.indexOf(a.slug) - SPOT_ALLOWED_SLUGS.indexOf(b.slug));
  const tradingPairs = tradingPairsOrdered.filter((p) => !p.isStale);
  
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

  // Fetch price history for selected index
  const { data: indexDataWithHistory, isLoading: isHistoryLoading, error: historyError } = useQuery<IndexDataWithHistory>({
    queryKey: ["/api/indexes", selectedPairSlug],
    queryFn: async () => {
      if (!selectedPairSlug) return null;
      const response = await fetch(`/api/indexes/${selectedPairSlug}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch index history: ${response.statusText}`);
      }
      return response.json();
    },
    enabled: !!selectedPairSlug,
    refetchInterval: 30000,
  });

  // Prepare chart data from price history (last 20-30 points for mini chart)
  const chartData = useMemo(() => {
    if (!indexDataWithHistory?.priceHistory || indexDataWithHistory.priceHistory.length === 0) {
      return [];
    }
    // Take last 30 points and reverse to show chronologically
    return [...indexDataWithHistory.priceHistory]
      .slice(-30)
      .reverse()
      .map(entry => ({
        timestamp: entry.timestamp,
        price: entry.price,
      }));
  }, [indexDataWithHistory]);

  // Prepare trade history data (last 5 entries)
  const tradeHistoryData = useMemo(() => {
    if (!indexDataWithHistory?.priceHistory || indexDataWithHistory.priceHistory.length === 0) {
      return [];
    }
    return indexDataWithHistory.priceHistory
      .slice(-10) // Take last 10 for better coverage
      .map(entry => ({
        id: entry.id,
        price: entry.price,
        delta: entry.delta,
        timestamp: entry.timestamp,
      }));
  }, [indexDataWithHistory]);
  
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
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-60 w-full" />
          <Skeleton className="h-32 w-full" />
          <div className="flex gap-2">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 flex-1" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!tradingPairs.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('spot.trading.title', 'Spot Trading')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              No trading pairs available
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
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
                {tradingPairsOrdered.map((pair) => (
                  <SelectItem key={pair.slug} value={pair.slug} disabled={!!pair.isStale}>
                    {pair.pairCode} - {pair.name} {pair.isStale ? "(Paused)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Price and Change Display */}
          {selectedPair && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    {selectedPair.pairCode}
                  </p>
                  <p className="text-3xl font-bold font-mono">
                    ${currentPrice.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    / ton
                  </p>
                </div>
                {changePercent !== null && (
                  <div className={`flex flex-col items-end ${trendColor}`}>
                    <div className="flex items-center gap-1">
                      <TrendIcon className="w-5 h-5" />
                      <span className="text-lg font-semibold">
                        {isPositive ? "+" : ""}{changePercent.toFixed(2)}%
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {t('spot.trading.change24h', '24h change')}
                    </span>
                  </div>
                )}
              </div>
              
              {/* Mini Chart */}
              <div className="h-16 w-full">
                {isHistoryLoading ? (
                  <Skeleton className="h-full w-full" />
                ) : historyError ? (
                  <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                    Failed to load chart
                  </div>
                ) : (
                  <SpotMiniChart 
                    data={chartData} 
                    height={64}
                    color={isPositive ? "hsl(142, 76%, 36%)" : isNegative ? "hsl(0, 84%, 60%)" : "hsl(var(--muted-foreground))"}
                  />
                )}
              </div>
            </div>
          )}

          {/* Recent Trades / Price History */}
          {selectedPair && (
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Recent Price Updates
              </label>
              {isHistoryLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : historyError ? (
                <Alert variant="destructive">
                  <AlertDescription>
                    Failed to load price history
                  </AlertDescription>
                </Alert>
              ) : (
                <SpotTradeHistory data={tradeHistoryData} maxRows={5} />
              )}
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
            onOpenLogin={() => openAuthPrompt()}
            onOpenWalletModal={() => setIsWalletAuthModalOpen(true)}
          />
          <SpotSellModal
            isOpen={sellModalOpen}
            onClose={() => setSellModalOpen(false)}
            commoditySlug={selectedPair.slug}
            commodityName={selectedPair.name}
            currentPrice={currentPrice}
            onOpenLogin={() => openAuthPrompt()}
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
