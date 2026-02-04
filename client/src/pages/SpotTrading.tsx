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
import { getTradingPairs, getIndexMetadata, SPOT_ALLOWED_SLUGS } from "@/lib/indexMapping";
import { SpotMiniChart } from "@/components/SpotMiniChart";
import { SpotTradeHistory } from "@/components/SpotTradeHistory";
import { SpotOrderForm } from "@/components/SpotOrderForm";
import { SpotPositionCard } from "@/components/SpotPositionCard";
import { OrderBook } from "@/components/trading/OrderBook";
import { format } from "date-fns";
import { TabsContent } from "@/components/ui/tabs";

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
    timestamp: Date | string;
  } | null;
}

interface PriceHistoryEntry {
  id: string;
  price: number;
  delta: number | null;
  timestamp: string;
}

interface TradeEntry {
  id: string;
  optionId?: string | null;
  commodity?: string | null;
  price: number;
  qty: number;
  type: string;
  createdAt: string;
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

  // Read country query param
  const initialSearchParams = new URLSearchParams(window.location.search);
  const countryParam = initialSearchParams.get("country")?.toLowerCase();
  const [selectedRegion, setSelectedRegion] = useState<"ua" | "br" | "ar">(
    (countryParam === "ua" || countryParam === "br" || countryParam === "ar") ? countryParam : "ua"
  );

  // Update URL when region changes
  useEffect(() => {
    const newSearchParams = new URLSearchParams(window.location.search);
    newSearchParams.set("country", selectedRegion);
    setLocation(`/spot-trading?${newSearchParams.toString()}`, { replace: true });
  }, [selectedRegion, setLocation]);

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

  const [chartRange, setChartRange] = useState<"7d" | "30d">("7d");

  // Get trading pairs from indexes (only allowed spot commodities, ordered)
  const tradingPairsRaw = indexes ? getTradingPairs(indexes) : [];
  const tradingPairsOrdered = tradingPairsRaw
    .filter((p) => SPOT_ALLOWED_SLUGS.includes(p.slug))
    .sort((a, b) => SPOT_ALLOWED_SLUGS.indexOf(a.slug) - SPOT_ALLOWED_SLUGS.indexOf(b.slug));
  
  // Filter by region: UA = CPT ODESA/PARITET ODESA, BR/AR = coming soon (empty for now)
  const tradingPairsFiltered = tradingPairsOrdered.filter((p) => {
    if (selectedRegion === "ua") {
      const index = indexes?.find(idx => idx.slug === p.slug);
      return index && (index.category.includes("CPT ODESA") || index.category.includes("CPT PARITET ODESA"));
    }
    // BR/AR don't have indexes yet, will be filtered out
    return false;
  });
  
  const tradingPairs = tradingPairsFiltered.filter((p) => !p.isStale);
  
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
      const found = indexes?.find(idx => idx.id === indexIdParam && !idx.isStale);
      if (found) return found.slug;
    }
    // Default to first non-stale pair (prefer Corn if available)
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

  // Executed trades (separate from index updates)
  const { data: trades = [], isLoading: isTradesLoading, error: tradesError } = useQuery<TradeEntry[]>({
    queryKey: ["/api/trades", selectedPairSlug],
    enabled: !!selectedPairSlug,
    queryFn: async () => {
      const res = await fetch(`/api/trades?commodity=${selectedPairSlug}`);
      if (!res.ok) {
        throw new Error(t('page.spot.failedToLoadTrades'));
      }
      const raw = await res.json();
      if (!Array.isArray(raw)) return [];
      const mapped = raw.map((t) => {
        const strikeRaw = typeof t.strike === "string" ? parseFloat(t.strike) : Number(t.strike);
        const priceField = typeof t.price === "string" ? parseFloat(t.price) : Number(t.price);
        // Trades API returns option trades with strike; fall back to strike if price is missing.
        const price = Number.isFinite(priceField)
          ? priceField
          : Number.isFinite(strikeRaw)
            ? strikeRaw // strike is already in $/ton
            : 0;
        const qty = typeof t.qty === "string" ? parseFloat(t.qty) : Number(t.qty || t.quantity || 0);
        return {
          id: t.id,
          optionId: t.optionId,
          commodity: t.commodity,
          price: Number.isFinite(price) ? price : 0,
          qty: Number.isFinite(qty) ? qty : 0,
          // No explicit side in payload; display aggregated trade direction
          type: t.type || t.side || t('page.spot.tradeTypeFallback'),
          createdAt: t.createdAt || t.timestamp || new Date().toISOString(),
        };
      });
      const hasUnknown = mapped.some((m) => !m.type || m.type === "UNKNOWN");
      if (hasUnknown) {
      }
      return mapped;
    },
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

  const priceChartData = useMemo(() => {
    if (!indexDataWithHistory?.priceHistory || indexDataWithHistory.priceHistory.length === 0) {
      return [];
    }
    const now = Date.now();
    const days = chartRange === "7d" ? 7 : 30;
    const cutoff = now - days * 24 * 60 * 60 * 1000;
    // Reuse Market Data history transform: priceHistory -> {timestamp, price}
    return indexDataWithHistory.priceHistory
      .filter((entry) => new Date(entry.timestamp).getTime() >= cutoff)
      .map((entry) => ({
        timestamp: entry.timestamp,
        price: entry.price,
      }));
  }, [indexDataWithHistory, chartRange]);

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
        <div className="space-y-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('page.spot.title')}</h1>
            <p className="text-muted-foreground mt-2">
              {t('page.spot.subtitle')}
            </p>
          </div>
          
          {/* Region Selector */}
          <Tabs value={selectedRegion} onValueChange={(v) => setSelectedRegion(v as "ua" | "br" | "ar")} className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-3">
              <TabsTrigger value="ua">{t('home.market.tabs.ua')}</TabsTrigger>
              <TabsTrigger value="br">{t('home.market.tabs.br')}</TabsTrigger>
              <TabsTrigger value="ar">{t('home.market.tabs.ar')}</TabsTrigger>
            </TabsList>
          </Tabs>
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
        ) : selectedRegion !== "ua" ? (
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="text-4xl mb-4">
                  {selectedRegion === "br" ? "🇧🇷" : "🇦🇷"}
                </div>
                <h3 className="text-lg font-semibold mb-2">{t('page.spot.comingSoon')}</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  {t('page.spot.comingSoonDesc')}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : !tradingPairs.length ? (
          <Card>
            <CardContent className="pt-6">
              <Alert>
                <AlertDescription>
                  {t('page.spot.noTradingPairs')}
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Instrument Selector near header */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="text-sm font-medium text-muted-foreground">{t('page.spot.spotMarkets')}</span>
                <div className="w-full md:w-auto overflow-x-auto">
                  <Tabs value={selectedPairSlug || ""} onValueChange={handlePairChange}>
                    <TabsList className="flex w-full md:w-auto flex-wrap gap-2 bg-muted p-1 rounded-lg h-auto">
                      {tradingPairs.map((pair) => (
                        <TabsTrigger 
                          key={pair.slug} 
                          value={pair.slug}
                          className="flex flex-col items-start gap-1 px-3 py-2 h-auto data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md"
                        >
                          <span className="text-[11px] font-mono text-muted-foreground data-[state=active]:text-primary-foreground/80">
                            {pair.pairCode}
                          </span>
                          <span className="text-sm font-semibold truncate w-full">
                            {pair.name}
                          </span>
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                </div>
              </div>
            </div>

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
                              {indexMetadata.type === "export" ? t('page.spot.export') : t('page.spot.processing')}
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
                          <span className="text-sm text-muted-foreground">{t('page.spot.perTon')}</span>
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
                            {t('page.spot.lastUpdated')} {format(lastUpdate, "MMM dd, yyyy HH:mm")}
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
                          {t('page.spot.failedToLoadChart')}
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
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Order Form */}
                <SpotOrderForm
                  commoditySlug={selectedPair.slug}
                  commodityName={selectedPair.name}
                  currentPrice={currentPrice}
                  onOpenLogin={() => setLocation("/login")}
                  onOpenWalletModal={() => setIsWalletAuthModalOpen(true)}
                />

                {/* Recent Price Updates (index quotes, not trades) */}
                <Card>
                  <CardContent className="pt-6">
                    <h3 className="text-lg font-semibold mb-4">{t('page.spot.recentPriceUpdates')}</h3>
                    {/* Index updates from commodity index history */}
                    {isHistoryLoading ? (
                      <Skeleton className="h-64 w-full" />
                    ) : historyError ? (
                      <Alert variant="destructive">
                        <AlertDescription>
                          {t('page.spot.failedToLoadPriceHistory')}
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <div className="space-y-4">
                        <div className="max-h-64 overflow-y-auto">
                          <SpotTradeHistory data={tradeHistoryData} maxRows={10} />
                        </div>
                        <div className="border-t pt-4 space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <h4 className="text-sm font-semibold">{t('page.spot.priceChart')}</h4>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant={chartRange === "7d" ? "default" : "outline"}
                                onClick={() => setChartRange("7d")}
                              >
                                {t('page.spot.chartRange.7d')}
                              </Button>
                              <Button
                                size="sm"
                                variant={chartRange === "30d" ? "default" : "outline"}
                                onClick={() => setChartRange("30d")}
                              >
                                {t('page.spot.chartRange.30d')}
                              </Button>
                            </div>
                          </div>
                          {isHistoryLoading ? (
                            <Skeleton className="h-32 w-full" />
                          ) : historyError ? (
                            <Alert variant="destructive">
                              <AlertDescription>{t('page.spot.failedToLoadPriceChart')}</AlertDescription>
                            </Alert>
                          ) : priceChartData.length === 0 ? (
                            <p className="text-sm text-muted-foreground">{t('page.spot.noPriceData')}</p>
                          ) : (
                            <div className="h-32">
                              {/* Reuse Market Data chart logic via SpotMiniChart with the same data shape */}
                              <SpotMiniChart
                                data={priceChartData}
                                height={128}
                                color={
                                  isPositive
                                    ? "hsl(142, 76%, 36%)"
                                    : isNegative
                                    ? "hsl(0, 84%, 60%)"
                                    : "hsl(var(--muted-foreground))"
                                }
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Trade History (executed trades) */}
                <Card>
                  <CardContent className="pt-6">
                    <h3 className="text-lg font-semibold mb-4">{t('page.spot.tradeHistory')}</h3>
                    {/* Executed trades from /api/trades filtered by commodity */}
                    {isTradesLoading ? (
                      <Skeleton className="h-64 w-full" />
                    ) : tradesError ? (
                      <Alert variant="destructive">
                        <AlertDescription>{t('common.error')}</AlertDescription>
                      </Alert>
                    ) : trades.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t('page.spot.noTrades')}</p>
                    ) : (
                      <div className="max-h-64 overflow-y-auto text-sm">
                        <table className="w-full">
                          <thead className="text-xs uppercase text-muted-foreground">
                            <tr className="text-left">
                              <th className="py-1">{t('page.spot.tradeTable.time')}</th>
                              <th className="py-1">{t('page.spot.tradeTable.price')}</th>
                              <th className="py-1">{t('page.spot.tradeTable.qty')}</th>
                              <th className="py-1">{t('page.spot.tradeTable.side')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {trades.slice(0, 20).map((trade) => {
                              const priceSafe = Number.isFinite(trade.price) ? trade.price : 0;
                              const qtySafe = Number.isFinite(trade.qty) ? trade.qty : 0;
                              return (
                                <tr key={trade.id || `${priceSafe}-${trade.createdAt}`} className="text-sm">
                                  <td className="py-1">
                                    {format(new Date(trade.createdAt), "HH:mm:ss")}
                                  </td>
                                  <td className="py-1 font-mono text-right pr-2">
                                    ${priceSafe.toFixed(2)}
                                  </td>
                                  <td className="py-1 font-mono text-right pr-2">
                                    {qtySafe.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                                  </td>
                                  <td className="py-1">
                                    <span className={trade.type === "SELL" ? "text-destructive" : "text-emerald-600"}>
                                      {trade.type === "SELL" ? t('page.spot.tradeTable.sell') : trade.type === "BUY" ? t('page.spot.tradeTable.buy') : trade.type}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Order Book */}
                <div className="lg:col-span-1">
                  <OrderBook
                    title={t('page.spot.orderBook')}
                    commodity={selectedPair.slug}
                    mode="spot"
                    depth={5}
                  />
                </div>
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
