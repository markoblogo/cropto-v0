import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { MainLayout } from "@/components/layouts/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { WalletAuthModal } from "@/components/WalletAuthModal";
import { WalletSummary } from "@/components/WalletSummary";
import { useWalletSummary } from "@/hooks/useWalletSummary";
import { useTradingGuard } from "@/hooks/useTradingGuard";
import { getTradingPairs, getIndexMetadata } from "@/lib/indexMapping";
import { SpotMiniChart } from "@/components/SpotMiniChart";
import { SpotTradeHistory } from "@/components/SpotTradeHistory";
import { SpotOrderForm } from "@/components/SpotOrderForm";
import { SpotPositionCard } from "@/components/SpotPositionCard";
import { format } from "date-fns";

interface CommodityIndex {
  id: string;
  name: string;
  slug: string;
  category: string;
  hasVat: boolean;
  latestPrice: {
    price: number;
    delta: number | null;
    timestamp: Date | string;
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

export default function SpotTrading() {
  const { t } = useTranslation();
  const [location, setLocation] = useLocation();
  const [isWalletAuthModalOpen, setIsWalletAuthModalOpen] = useState(false);

  const guardTradingAction = useTradingGuard({
    onOpenLogin: () => setLocation("/login"),
    onOpenWalletModal: () => setIsWalletAuthModalOpen(true),
  });

  // Fetch current user
  const { data: userData } = useQuery<{ 
    user: { 
      id: string; 
      email: string; 
      role: string;
      walletAddress?: string;
    } 
  } | null>({
    queryKey: ["/api/auth/me"],
    retry: false,
    enabled: !!localStorage.getItem('cropto_token'),
  });

  const user = userData?.user;

  // Get wallet summary data
  const walletData = useWalletSummary(user?.walletAddress || null);

  const { data: indexes, isLoading } = useQuery<CommodityIndex[]>({
    queryKey: ["/api/indexes"],
    refetchInterval: 30000,
  });

  // Get trading pairs from indexes
  const tradingPairs = indexes ? getTradingPairs(indexes) : [];
  
  // Get selected pair from query params or default to first pair
  const searchParams = new URLSearchParams(window.location.search);
  const commodityParam = searchParams.get("commodity");
  const indexIdParam = searchParams.get("indexId");
  
  const defaultSlug = useMemo(() => {
    if (commodityParam) {
      const found = tradingPairs.find(p => 
        p.slug.toLowerCase().includes(commodityParam.toLowerCase()) ||
        p.name.toLowerCase().includes(commodityParam.toLowerCase())
      );
      if (found) return found.slug;
    }
    if (indexIdParam) {
      const found = indexes?.find(idx => idx.id === indexIdParam);
      if (found) return found.slug;
    }
    // Default to first pair (prefer Corn if available)
    const corn = tradingPairs.find(p => p.slug.includes("corn"));
    return corn?.slug || tradingPairs[0]?.slug || null;
  }, [commodityParam, indexIdParam, tradingPairs, indexes]);

  const [selectedPairSlug, setSelectedPairSlug] = useState<string | null>(defaultSlug);

  // Update selected pair when default changes
  useEffect(() => {
    if (defaultSlug && !selectedPairSlug) {
      setSelectedPairSlug(defaultSlug);
    }
  }, [defaultSlug, selectedPairSlug]);

  const selectedPair = tradingPairs.find(p => p.slug === selectedPairSlug);
  const selectedIndex = indexes?.find(idx => idx.slug === selectedPairSlug);
  const currentPrice = selectedIndex?.latestPrice?.price || 0;
  const delta = selectedIndex?.latestPrice?.delta || null;
  const lastUpdate = selectedIndex?.latestPrice?.timestamp 
    ? (typeof selectedIndex.latestPrice.timestamp === 'string' 
        ? new Date(selectedIndex.latestPrice.timestamp) 
        : selectedIndex.latestPrice.timestamp)
    : null;
  
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

  // Get index metadata for badge
  const indexMetadata = selectedIndex 
    ? getIndexMetadata(selectedIndex.slug, selectedIndex.category)
    : null;

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

  // Prepare chart data from price history
  const chartData = useMemo(() => {
    if (!indexDataWithHistory?.priceHistory || indexDataWithHistory.priceHistory.length === 0) {
      return [];
    }
    return [...indexDataWithHistory.priceHistory]
      .slice(-30)
      .reverse()
      .map(entry => ({
        timestamp: entry.timestamp,
        price: entry.price,
      }));
  }, [indexDataWithHistory]);

  // Prepare trade history data
  const tradeHistoryData = useMemo(() => {
    if (!indexDataWithHistory?.priceHistory || indexDataWithHistory.priceHistory.length === 0) {
      return [];
    }
    return indexDataWithHistory.priceHistory
      .slice(-10)
      .map(entry => ({
        id: entry.id,
        price: entry.price,
        delta: entry.delta,
        timestamp: entry.timestamp,
      }));
  }, [indexDataWithHistory]);

  const handlePairChange = (slug: string) => {
    setSelectedPairSlug(slug);
    // Update URL without page reload
    const newSearchParams = new URLSearchParams(window.location.search);
    newSearchParams.set("commodity", slug);
    setLocation(`/spot-trading?${newSearchParams.toString()}`);
  };

  const handleWalletAuthSuccess = (token: string, newUser: boolean) => {
    setIsWalletAuthModalOpen(false);
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Spot Trading</h1>
          <p className="text-muted-foreground mt-2">
            Buy and sell grain index tokens using your CROPT balance.
          </p>
        </div>

        {/* Wallet Summary Bar */}
        {user?.walletAddress && (
          <div>
            <WalletSummary variant="bar" {...walletData} />
          </div>
        )}

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-96 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : !tradingPairs.length ? (
          <Card>
            <CardContent className="pt-6">
              <Alert>
                <AlertDescription>
                  No trading pairs available
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Instrument Selector */}
            <Card>
              <CardContent className="pt-6">
                <Tabs value={selectedPairSlug || ""} onValueChange={handlePairChange}>
                  <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2 h-auto">
                    {tradingPairs.map((pair) => (
                      <TabsTrigger 
                        key={pair.slug} 
                        value={pair.slug}
                        className="flex flex-col items-start gap-1 p-3 h-auto data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                      >
                        <span className="text-xs font-mono text-muted-foreground data-[state=active]:text-primary-foreground/80">
                          {pair.pairCode}
                        </span>
                        <span className="text-sm font-semibold truncate w-full">
                          {pair.name}
                        </span>
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </CardContent>
            </Card>

            {/* Instrument Overview */}
            {selectedPair && selectedIndex && (
              <Card>
                <CardContent className="pt-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left: Price Info */}
                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <h2 className="text-2xl font-bold">{selectedPair.name}</h2>
                          {indexMetadata && (
                            <Badge 
                              variant={indexMetadata.type === "export" ? "default" : "secondary"}
                            >
                              {indexMetadata.type === "export" ? "Export" : "Processing"}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm font-mono text-muted-foreground">
                          {selectedPair.pairCode}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-baseline gap-2">
                          <span className="text-4xl font-bold font-mono">
                            ${currentPrice.toFixed(2)}
                          </span>
                          <span className="text-sm text-muted-foreground">/ ton</span>
                        </div>

                        {changePercent !== null && (
                          <div className={`flex items-center gap-2 ${trendColor}`}>
                            <TrendIcon className="w-5 h-5" />
                            <span className="text-lg font-semibold">
                              {isPositive ? "+" : ""}{changePercent.toFixed(2)}%
                            </span>
                            <span className="text-sm text-muted-foreground">24h</span>
                          </div>
                        )}

                        {lastUpdate && (
                          <p className="text-xs text-muted-foreground">
                            Last updated: {format(lastUpdate, "MMM dd, yyyy HH:mm")}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Right: Mini Chart */}
                    <div className="h-48">
                      {isHistoryLoading ? (
                        <Skeleton className="h-full w-full" />
                      ) : historyError ? (
                        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                          Failed to load chart
                        </div>
                      ) : (
                        <SpotMiniChart 
                          data={chartData} 
                          height={192}
                          color={isPositive ? "hsl(142, 76%, 36%)" : isNegative ? "hsl(0, 84%, 60%)" : "hsl(var(--muted-foreground))"}
                        />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Order Form and Recent Updates Grid */}
            {selectedPair && selectedIndex && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Order Form */}
                <SpotOrderForm
                  commoditySlug={selectedPair.slug}
                  commodityName={selectedPair.name}
                  currentPrice={currentPrice}
                  onOpenLogin={() => setLocation("/login")}
                  onOpenWalletModal={() => setIsWalletAuthModalOpen(true)}
                />

                {/* Recent Price Updates */}
                <Card>
                  <CardContent className="pt-6">
                    <h3 className="text-lg font-semibold mb-4">Recent Price Updates</h3>
                    {isHistoryLoading ? (
                      <Skeleton className="h-64 w-full" />
                    ) : historyError ? (
                      <Alert variant="destructive">
                        <AlertDescription>
                          Failed to load price history
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <div className="max-h-64 overflow-y-auto">
                        <SpotTradeHistory data={tradeHistoryData} maxRows={10} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Your Position */}
            {selectedPair && (
              <SpotPositionCard
                commoditySlug={selectedPair.slug}
                commodityName={selectedPair.name}
              />
            )}
          </>
        )}

        <WalletAuthModal
          open={isWalletAuthModalOpen}
          onOpenChange={setIsWalletAuthModalOpen}
          onSuccess={handleWalletAuthSuccess}
        />
      </div>
    </MainLayout>
  );
}
