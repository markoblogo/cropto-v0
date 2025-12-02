import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { MainLayout } from "@/components/layouts/MainLayout";
import { CommodityIndexCard } from "@/components/CommodityIndexCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
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

export default function MarketData() {
  const [, setLocation] = useLocation();
  const [selectedIndexSlug, setSelectedIndexSlug] = useState<string | null>(null);

  // Fetch all indexes
  const { data: indexes, isLoading, error } = useQuery<CommodityIndex[]>({
    queryKey: ["/api/indexes"],
    refetchInterval: 30000,
  });

  // Set default selected index when indexes load
  const effectiveSelectedSlug = selectedIndexSlug || (indexes && indexes.length > 0 ? indexes[0].slug : null);

  // Fetch price history for selected index (for preview chart)
  const { data: selectedIndexData, isLoading: isHistoryLoading } = useQuery<IndexDataWithHistory>({
    queryKey: ["/api/indexes", effectiveSelectedSlug],
    queryFn: async () => {
      if (!effectiveSelectedSlug) return null;
      const response = await fetch(`/api/indexes/${effectiveSelectedSlug}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch index: ${response.statusText}`);
      }
      return response.json();
    },
    enabled: !!effectiveSelectedSlug,
  });

  // Set default selected index when indexes first load
  if (!selectedIndexSlug && indexes && indexes.length > 0) {
    setSelectedIndexSlug(indexes[0].slug);
  }

  const handleViewDetails = (slug: string) => {
    setLocation(`/index/${slug}`);
  };

  // Prepare chart data for selected index
  const chartData = selectedIndexData?.priceHistory
    ? [...selectedIndexData.priceHistory]
        .reverse()
        .slice(-30) // Last 30 points for preview
        .map(entry => ({
          date: format(new Date(entry.timestamp), "MMM dd HH:mm"),
          price: entry.price,
          timestamp: entry.timestamp,
        }))
    : [];

  // Calculate Y-axis domain for chart
  const allPrices = chartData.map(d => d.price);
  const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : 0;
  const maxPrice = allPrices.length > 0 ? Math.max(...allPrices) : 100;
  const padding = (maxPrice - minPrice) * 0.1 || 10;

  return (
    <MainLayout>
      <div className="space-y-8">
        {/* Header Section */}
        <div className="space-y-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Market Data</h1>
            <p className="text-muted-foreground mt-2 text-lg">
              Commodity index prices, volatility and history for CROPT-linked markets.
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {indexes.map((index) => {
              const hasPrice = index.latestPrice !== null;
              const priceValue = hasPrice && index.latestPrice ? index.latestPrice.price : 0;
              const deltaValue = hasPrice && index.latestPrice && index.latestPrice.delta !== null 
                ? index.latestPrice.delta 
                : 0;
              
              // Calculate 24h change percentage
              const changePercent = deltaValue !== null && priceValue > 0 
                ? ((deltaValue / (priceValue - deltaValue)) * 100) 
                : null;

              const metadata = getIndexMetadata(index.slug, index.category);

              return (
                <CommodityIndexCard
                  key={index.id}
                  index={index}
                  change24hPercent={changePercent}
                  indexType={metadata.type}
                  onViewDetails={handleViewDetails}
                />
              );
            })}
          </div>
        )}

        {/* Volatility & History Preview */}
        <Card>
          <CardHeader>
            <CardTitle>Volatility & History (MVP)</CardTitle>
            <CardDescription>
              Simple historical charts per index. Full volatility surfaces will be available in future updates.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {indexes && indexes.length > 0 ? (
              <Tabs 
                value={effectiveSelectedSlug || indexes[0].slug} 
                onValueChange={setSelectedIndexSlug}
                className="w-full"
              >
                <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
                  {indexes.map((index) => {
                    const metadata = getIndexMetadata(index.slug, index.category);
                    return (
                      <TabsTrigger key={index.id} value={index.slug} className="text-xs">
                        {metadata.pairCode.split('/')[1]}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
                {indexes.map((index) => (
                  <TabsContent key={index.id} value={index.slug} className="mt-4">
                    {isHistoryLoading ? (
                      <Skeleton className="h-64 w-full" />
                    ) : selectedIndexData && chartData.length > 0 ? (
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis 
                              dataKey="date" 
                              tick={{ fontSize: 10 }}
                              className="text-muted-foreground"
                            />
                            <YAxis 
                              domain={[minPrice - padding, maxPrice + padding]}
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
                              formatter={(value: number) => [`$${value.toFixed(2)}`, "Price"]}
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
                    ) : (
                      <div className="h-64 flex items-center justify-center text-muted-foreground">
                        <p className="text-sm">No price history available for this index</p>
                      </div>
                    )}
                  </TabsContent>
                ))}
              </Tabs>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                <p className="text-sm">No indexes available</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}

