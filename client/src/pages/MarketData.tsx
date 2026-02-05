import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { MainLayout } from "@/components/layouts/MainLayout";
import { CommodityIndexCard } from "@/components/CommodityIndexCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { getIndexMetadata } from "@/lib/indexMapping";
import { apiRequest } from "@/lib/queryClient";
import { useMarketDashboard, type MarketIndexDto } from "@/hooks/useMarketDashboard";
import { Button } from "@/components/ui/button";

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

interface PortfolioData {
  positions: Array<{
    commoditySlug?: string;
    underlying?: string;
  }>;
}

interface SpotPosition {
  commoditySlug: string;
  quantityKg: string;
}

export default function MarketData() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const initialSearchParams = new URLSearchParams(window.location.search);
  const countryParam = initialSearchParams.get("country")?.toLowerCase();
  const [selectedRegion, setSelectedRegion] = useState<"ua" | "br" | "ar" | "us">(
    (countryParam === "ua" || countryParam === "br" || countryParam === "ar" || countryParam === "us")
      ? countryParam
      : "ua"
  );

  useEffect(() => {
    const newSearchParams = new URLSearchParams(window.location.search);
    newSearchParams.set("country", selectedRegion);
    setLocation(`/market-data?${newSearchParams.toString()}`, { replace: true });
  }, [selectedRegion, setLocation]);
  
  // Fetch market dashboard data for regional indexes
  const { data: marketDashboardData, isLoading: isMarketDashboardLoading } = useMarketDashboard();

  // Fetch all indexes (for the Index Overview Grid section)
  const { data: indexes, isLoading, error } = useQuery<CommodityIndex[]>({
    queryKey: ["/api/indexes"],
    refetchInterval: 30000,
  });

  const hasToken = !!localStorage.getItem("cropto_token");

  // Positions to show "Position" badge
  const { data: portfolio } = useQuery<PortfolioData>({
    queryKey: ["/api/portfolio/me"],
    enabled: hasToken,
    retry: false,
  });

  const { data: spotPositions = [] } = useQuery<SpotPosition[]>({
    queryKey: ["/api/spot/positions"],
    enabled: hasToken,
    retry: false,
  });


  const { data: historiesMap = {} } = useQuery<Record<string, PriceHistoryEntry[]>>({
    queryKey: ["/api/indexes/history-map", indexes?.map((i) => i.slug)],
    enabled: !!indexes && indexes.length > 0,
    queryFn: async () => {
      if (!indexes) return {};
      const entries = await Promise.all(
        indexes.map(async (idx) => {
          const res = await apiRequest("GET", `/api/indexes/${idx.slug}`);
          const json = (await res.json()) as IndexDataWithHistory;
          return [idx.slug, json?.priceHistory || []] as const;
        })
      );
      return Object.fromEntries(entries);
    },
    staleTime: 60_000,
  });

  const positionsSlugs = useMemo(() => {
    const set = new Set<string>();
    portfolio?.positions?.forEach((p) => {
      const slug = (p.commoditySlug || p.underlying || "").toLowerCase();
      if (slug) set.add(slug);
    });
    spotPositions.forEach((p) => {
      const slug = p.commoditySlug?.toLowerCase();
      if (slug) set.add(slug);
    });
    return set;
  }, [portfolio?.positions, spotPositions]);

  const computeChangePercent = (history: PriceHistoryEntry[] | undefined, days: number): number | null => {
    if (!history || history.length === 0) return null;
    const sorted = [...history].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const latest = sorted[sorted.length - 1];
    const now = Date.now();
    const cutoff = now - days * 24 * 60 * 60 * 1000;
    const ref = sorted.find((h) => new Date(h.timestamp).getTime() >= cutoff) || sorted[0];
    const refPrice = ref.price;
    if (!refPrice) return null;
    return ((latest.price - refPrice) / refPrice) * 100;
  };

  const getCategoryLabel = (index: CommodityIndex): string => {
    const name = index.name.toLowerCase();
    if (name.includes("soy") || name.includes("rape") || name.includes("sunflower")) return "Oilseeds";
    return "Grains";
  };

  const handleViewDetails = (slug: string) => {
    setLocation(`/index/${slug}`);
  };

  // Get regional indexes for selected region
  const regionalIndexes = useMemo(() => {
    if (!marketDashboardData) return [];
    return marketDashboardData[selectedRegion] || [];
  }, [marketDashboardData, selectedRegion]);

  // Find primary wheat index for selected region
  const primaryWheatIndex = useMemo(() => {
    if (!regionalIndexes || regionalIndexes.length === 0) return null;
    // Find first wheat-related index (commodity contains "wheat" case-insensitive)
    return regionalIndexes.find(item => 
      item.commodity.toLowerCase().includes("wheat")
    ) || regionalIndexes[0]; // Fallback to first index if no wheat found
  }, [regionalIndexes]);

  // Fetch history for primary wheat index
  const { data: primaryWheatHistory, isLoading: isPrimaryWheatHistoryLoading } = useQuery<Array<{ date: string; price: number }>>({
    queryKey: ["/api/index/history", selectedRegion, primaryWheatIndex?.commodity, primaryWheatIndex?.basis],
    queryFn: async () => {
      if (!primaryWheatIndex) return [];
      const params = new URLSearchParams({
        country: selectedRegion.toUpperCase(),
        commodity: primaryWheatIndex.commodity,
        basis: primaryWheatIndex.basis,
      });
      const response = await apiRequest("GET", `/api/index/history?${params.toString()}`);
      const data = await response.json();
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9954e01e-166a-402a-b350-ebd5f6863d16',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MarketData.tsx:queryFn',message:'API response for primaryWheatHistory',data:{region:selectedRegion,commodity:primaryWheatIndex?.commodity,basis:primaryWheatIndex?.basis,dataType:typeof data,isArray:Array.isArray(data),dataValue:JSON.stringify(data).substring(0,200),responseOk:response.ok,responseStatus:response.status},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,B'})}).catch(()=>{});
      // #endregion
      if (!Array.isArray(data)) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/9954e01e-166a-402a-b350-ebd5f6863d16',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MarketData.tsx:queryFn-non-array',message:'API returned non-array data for primaryWheatHistory',data:{region:selectedRegion,commodity:primaryWheatIndex?.commodity,basis:primaryWheatIndex?.basis,dataValue:JSON.stringify(data),dataType:typeof data},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        return [];
      }
      return data;
    },
    enabled: !!primaryWheatIndex,
  });

  // Prepare chart data for primary wheat index
  const volatilityChartData = useMemo(() => {
    // #region agent log
    if (primaryWheatHistory !== undefined) {
      fetch('http://127.0.0.1:7242/ingest/9954e01e-166a-402a-b350-ebd5f6863d16',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MarketData.tsx:useMemo-before-slice',message:'primaryWheatHistory value before slice operation',data:{historyType:typeof primaryWheatHistory,isArray:Array.isArray(primaryWheatHistory),historyLength:Array.isArray(primaryWheatHistory)?primaryWheatHistory.length:null,region:selectedRegion},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,B,C'})}).catch(()=>{});
    }
    // #endregion
    if (!primaryWheatHistory || !Array.isArray(primaryWheatHistory) || primaryWheatHistory.length === 0) return [];
    return primaryWheatHistory.slice(-30).map(entry => ({
      date: format(new Date(entry.date), "MMM dd HH:mm"),
      price: entry.price,
      timestamp: entry.date,
    }));
  }, [primaryWheatHistory, selectedRegion]);

  // Calculate Y-axis domain for volatility chart
  const volatilityPrices = volatilityChartData.map(d => d.price);
  const volatilityMinPrice = volatilityPrices.length > 0 ? Math.min(...volatilityPrices) : 0;
  const volatilityMaxPrice = volatilityPrices.length > 0 ? Math.max(...volatilityPrices) : 100;
  const volatilityPadding = (volatilityMaxPrice - volatilityMinPrice) * 0.1 || 10;

  // Get country flag and label
  const countryFlag =
    selectedRegion === "ua" ? "🇺🇦" :
    selectedRegion === "br" ? "🇧🇷" :
    selectedRegion === "ar" ? "🇦🇷" : "🇺🇸";
  const countryLabel = selectedRegion.toUpperCase();

  const handleViewOptionsMarket = () => {
    setLocation(`/options?country=${selectedRegion}`);
  };

  return (
    <MainLayout>
      <div className="space-y-8">
        {/* Header Section */}
        <div className="space-y-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('page.marketData.title')}</h1>
            <p className="text-muted-foreground mt-2 text-lg">
              {t('page.marketData.subtitle')}
            </p>
          </div>
          <div className="prose prose-sm max-w-none text-muted-foreground">
            <p>
              These indices represent grain commodity prices from Ukrainian export terminals (CPT ODESA) 
              and processing facilities (CPT PARITET ODESA). Export indices track FOB prices without VAT, 
              while processing indices include VAT and reflect domestic processing costs.
            </p>
          </div>
        </div>

        {/* Index Overview Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="space-y-3 p-4 border rounded-lg">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Failed to load commodity index data. Please try again later.
            </AlertDescription>
          </Alert>
        ) : !indexes || indexes.length === 0 ? (
          <Alert>
            <AlertDescription>
              No commodity indexes available at this time.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6">
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-muted-foreground">{t('page.marketData.grains')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {indexes
                  .filter((index) => {
                    const name = index.name.toLowerCase();
                    return (
                      name.includes("corn") ||
                      name.includes("feed wheat") ||
                      name.includes("wheat 11.5") ||
                      name.includes("wheat 11.5%")
                    );
                  })
                  .map((index) => {
                    const hasPrice = index.latestPrice !== null;
                    const priceValue = hasPrice && index.latestPrice ? index.latestPrice.price : 0;
                    const deltaValue =
                      hasPrice && index.latestPrice && index.latestPrice.delta !== null
                        ? index.latestPrice.delta
                        : 0;

                    const changePercent =
                      deltaValue !== null && priceValue > 0
                        ? (deltaValue / (priceValue - deltaValue)) * 100
                        : null;

                    const metadata = getIndexMetadata(index.slug, index.category);
                    const history = historiesMap[index.slug];
                    const change7d = computeChangePercent(history, 7);
                    const change30d = computeChangePercent(history, 30);

                    return (
                      <CommodityIndexCard
                        key={index.id}
                        index={index}
                        change24hPercent={changePercent}
                        indexType={metadata.type}
                        categoryLabel={getCategoryLabel(index)}
                        change7dPercent={change7d}
                        change30dPercent={change30d}
                        hasPosition={positionsSlugs.has(index.slug.toLowerCase())}
                        onViewDetails={handleViewDetails}
                      />
                    );
                  })}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-muted-foreground">{t('page.marketData.oilseeds')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {indexes
                  .filter((index) => {
                    const name = index.name.toLowerCase();
                    return (
                      name.includes("soy") ||
                      name.includes("rapeseed") ||
                      name.includes("sunflower")
                    );
                  })
                  .map((index) => {
                    const hasPrice = index.latestPrice !== null;
                    const priceValue = hasPrice && index.latestPrice ? index.latestPrice.price : 0;
                    const deltaValue =
                      hasPrice && index.latestPrice && index.latestPrice.delta !== null
                        ? index.latestPrice.delta
                        : 0;

                    const changePercent =
                      deltaValue !== null && priceValue > 0
                        ? (deltaValue / (priceValue - deltaValue)) * 100
                        : null;

                    const metadata = getIndexMetadata(index.slug, index.category);
                    const history = historiesMap[index.slug];
                    const change7d = computeChangePercent(history, 7);
                    const change30d = computeChangePercent(history, 30);

                    return (
                      <CommodityIndexCard
                        key={index.id}
                        index={index}
                        change24hPercent={changePercent}
                        indexType={metadata.type}
                        categoryLabel={getCategoryLabel(index)}
                        change7dPercent={change7d}
                        change30dPercent={change30d}
                        hasPosition={positionsSlugs.has(index.slug.toLowerCase())}
                        onViewDetails={handleViewDetails}
                      />
                    );
                  })}
              </div>
            </div>
          </div>
        )}

        {/* Volatility & History Preview */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle className="flex items-center gap-2">
                  <span>{countryFlag}</span>
                  <span>{t('page.marketData.volatilityTitle')} - {countryLabel}</span>
                </CardTitle>
              </div>
              {primaryWheatIndex && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleViewOptionsMarket}
                >
                  {t('page.marketData.viewOptionsMarket')}
                  <ExternalLink className="ml-2 h-3 w-3" />
                </Button>
              )}
            </div>
            <CardDescription>
              {t('page.marketData.volatilityHistoryDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={selectedRegion} onValueChange={(v) => setSelectedRegion(v as "ua" | "br" | "ar" | "us")} className="w-full">
              <TabsList className="grid w-full max-w-md grid-cols-4">
                <TabsTrigger value="ua">{t('home.market.tabs.ua')}</TabsTrigger>
                <TabsTrigger value="br">{t('home.market.tabs.br')}</TabsTrigger>
                <TabsTrigger value="ar">{t('home.market.tabs.ar')}</TabsTrigger>
                <TabsTrigger value="us">{t('home.market.tabs.us')}</TabsTrigger>
              </TabsList>

              <TabsContent value={selectedRegion} className="mt-6">
                {isMarketDashboardLoading || isPrimaryWheatHistoryLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : primaryWheatIndex && volatilityChartData.length > 0 ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{countryFlag}</span>
                      <span>{primaryWheatIndex.commodity} {primaryWheatIndex.grade ? `(${primaryWheatIndex.grade})` : ''} - {primaryWheatIndex.basis}</span>
                    </div>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={volatilityChartData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis 
                            dataKey="date" 
                            tick={{ fontSize: 10 }}
                            className="text-muted-foreground"
                          />
                          <YAxis 
                            domain={[volatilityMinPrice - volatilityPadding, volatilityMaxPrice + volatilityPadding]}
                            tick={{ fontSize: 10 }}
                            className="text-muted-foreground"
                            tickFormatter={(value) => `$${value.toFixed(0)}`}
                          />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: 'hsl(var(--card))',
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '6px',
                            }}
                            labelFormatter={(label, payload) => {
                              if (payload && payload[0]) {
                                return format(new Date(payload[0].payload.timestamp), "MMM dd, yyyy HH:mm");
                              }
                              return label;
                            }}
                            formatter={(value: number) => [`$${value.toFixed(2)}`, t('page.marketData.price')]}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="price" 
                            stroke="hsl(var(--primary))" 
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center text-muted-foreground">
                    <p className="text-sm">{t('page.marketData.noPriceHistory')}</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
