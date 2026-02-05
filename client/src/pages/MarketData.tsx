import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { MainLayout } from "@/components/layouts/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useMarketDashboard } from "@/hooks/useMarketDashboard";
import { Button } from "@/components/ui/button";

export default function MarketData() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  const initialSearchParams = new URLSearchParams(window.location.search);
  const countryParam = initialSearchParams.get("country")?.toLowerCase();
  const [selectedRegion, setSelectedRegion] = useState<"ua" | "br" | "ar" | "us">(
    countryParam === "ua" || countryParam === "br" || countryParam === "ar" || countryParam === "us"
      ? countryParam
      : "ua"
  );

  useEffect(() => {
    const newSearchParams = new URLSearchParams(window.location.search);
    newSearchParams.set("country", selectedRegion);
    setLocation(`/market-data?${newSearchParams.toString()}`, { replace: true });
  }, [selectedRegion, setLocation]);

  const { data: marketDashboardData, isLoading: isMarketDashboardLoading } = useMarketDashboard();

  const regionalIndexes = useMemo(() => {
    if (!marketDashboardData) return [];
    return marketDashboardData[selectedRegion] || [];
  }, [marketDashboardData, selectedRegion]);

  const primaryWheatIndex = useMemo(() => {
    if (!regionalIndexes.length) return null;
    return regionalIndexes.find((item) => item.commodity.toLowerCase().includes("wheat")) || regionalIndexes[0];
  }, [regionalIndexes]);

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
      return Array.isArray(data) ? data : [];
    },
    enabled: !!primaryWheatIndex,
  });

  const volatilityChartData = useMemo(() => {
    if (!primaryWheatHistory || !primaryWheatHistory.length) return [];
    return primaryWheatHistory.slice(-30).map((entry) => ({
      date: format(new Date(entry.date), "MMM dd HH:mm"),
      price: entry.price,
      timestamp: entry.date,
    }));
  }, [primaryWheatHistory]);

  const volatilityPrices = volatilityChartData.map((d) => d.price);
  const volatilityMinPrice = volatilityPrices.length > 0 ? Math.min(...volatilityPrices) : 0;
  const volatilityMaxPrice = volatilityPrices.length > 0 ? Math.max(...volatilityPrices) : 100;
  const volatilityPadding = (volatilityMaxPrice - volatilityMinPrice) * 0.1 || 10;

  const countryFlag =
    selectedRegion === "ua" ? "🇺🇦" : selectedRegion === "br" ? "🇧🇷" : selectedRegion === "ar" ? "🇦🇷" : "🇺🇸";
  const countryLabel = selectedRegion.toUpperCase();

  const handleViewOptionsMarket = () => {
    setLocation(`/options?country=${selectedRegion}`);
  };

  const classifyCommodity = (commodity: string): "grains" | "oilseeds" | "other" => {
    const c = commodity.toLowerCase();
    if (
      c.includes("corn") ||
      c.includes("maize") ||
      c.includes("wheat") ||
      c.includes("barley")
    ) {
      return "grains";
    }
    if (
      c.includes("soy") ||
      c.includes("soymeal") ||
      c.includes("rapeseed") ||
      c.includes("sunflower")
    ) {
      return "oilseeds";
    }
    return "other";
  };

  const grains = regionalIndexes.filter((index) => classifyCommodity(index.commodity) === "grains");
  const oilseeds = regionalIndexes.filter((index) => classifyCommodity(index.commodity) === "oilseeds");
  const otherCommodities = regionalIndexes.filter((index) => classifyCommodity(index.commodity) === "other");

  return (
    <MainLayout>
      <div className="space-y-8">
        <div className="space-y-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("page.marketData.title")}</h1>
            <p className="text-muted-foreground mt-2 text-lg">{t("page.marketData.subtitle")}</p>
          </div>
          <div className="prose prose-sm max-w-none text-muted-foreground">
            <p>
              These indices represent selected market quotes by country. Choose region from the header dropdown and this
              page will display the corresponding index cards and history chart.
            </p>
          </div>
        </div>

        {isMarketDashboardLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="space-y-3 p-4 border rounded-lg">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </div>
        ) : !marketDashboardData ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>Failed to load market dashboard data. Please try again later.</AlertDescription>
          </Alert>
        ) : regionalIndexes.length === 0 ? (
          <Alert>
            <AlertDescription>No market indexes available for {selectedRegion.toUpperCase()}.</AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6">
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-muted-foreground">{t("page.marketData.grains")}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {grains.map((index) => (
                  <Card key={`${index.country}-${index.commodity}-${index.basis}`}>
                    <CardHeader>
                      <CardTitle className="text-lg">
                        {index.commodity}
                        {index.grade ? ` (${index.grade})` : ""}
                      </CardTitle>
                      <CardDescription>{index.basis}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">${index.price.toFixed(2)} / t</div>
                      <div className="text-sm text-muted-foreground mt-1">
                        24h: {index.change24h > 0 ? "+" : ""}
                        {index.change24h.toFixed(2)}%
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-muted-foreground">{t("page.marketData.oilseeds")}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {oilseeds.map((index) => (
                  <Card key={`${index.country}-${index.commodity}-${index.basis}`}>
                    <CardHeader>
                      <CardTitle className="text-lg">
                        {index.commodity}
                        {index.grade ? ` (${index.grade})` : ""}
                      </CardTitle>
                      <CardDescription>{index.basis}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">${index.price.toFixed(2)} / t</div>
                      <div className="text-sm text-muted-foreground mt-1">
                        24h: {index.change24h > 0 ? "+" : ""}
                        {index.change24h.toFixed(2)}%
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {otherCommodities.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-muted-foreground">Other</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {otherCommodities.map((index) => (
                    <Card key={`${index.country}-${index.commodity}-${index.basis}`}>
                      <CardHeader>
                        <CardTitle className="text-lg">
                          {index.commodity}
                          {index.grade ? ` (${index.grade})` : ""}
                        </CardTitle>
                        <CardDescription>{index.basis}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold">${index.price.toFixed(2)} / t</div>
                        <div className="text-sm text-muted-foreground mt-1">
                          24h: {index.change24h > 0 ? "+" : ""}
                          {index.change24h.toFixed(2)}%
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle className="flex items-center gap-2">
                  <span>{countryFlag}</span>
                  <span>
                    {t("page.marketData.volatilityTitle")} - {countryLabel}
                  </span>
                </CardTitle>
              </div>
              {primaryWheatIndex && (
                <Button variant="outline" size="sm" onClick={handleViewOptionsMarket}>
                  {t("page.marketData.viewOptionsMarket")}
                  <ExternalLink className="ml-2 h-3 w-3" />
                </Button>
              )}
            </div>
            <CardDescription>{t("page.marketData.volatilityHistoryDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {isMarketDashboardLoading || isPrimaryWheatHistoryLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : primaryWheatIndex && volatilityChartData.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{countryFlag}</span>
                  <span>
                    {primaryWheatIndex.commodity}
                    {primaryWheatIndex.grade ? ` (${primaryWheatIndex.grade})` : ""} - {primaryWheatIndex.basis}
                  </span>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={volatilityChartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" className="text-xs" tick={{ fontSize: 12 }} />
                      <YAxis
                        className="text-xs"
                        tick={{ fontSize: 12 }}
                        domain={[volatilityMinPrice - volatilityPadding, volatilityMaxPrice + volatilityPadding]}
                        tickFormatter={(value) => `$${value.toFixed(0)}`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                        formatter={(value: number) => [`$${value.toFixed(2)}`, t("page.marketData.price")]}
                        labelFormatter={(label) => `Date: ${label}`}
                      />
                      <Line
                        type="monotone"
                        dataKey="price"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={{ fill: "hsl(var(--primary))", strokeWidth: 2, r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-sm">{t("page.marketData.noPriceHistory")}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
