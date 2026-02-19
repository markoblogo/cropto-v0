import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { MainLayout } from "@/components/layouts/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useMarketDashboard } from "@/hooks/useMarketDashboard";
import { Button } from "@/components/ui/button";
import { commodityDisplayName } from "@shared/commodities";

export default function MarketData() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  const initialSearchParams = new URLSearchParams(window.location.search);
  const debugSources = initialSearchParams.get("debugSources") === "1";
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
  const [selectedChartSeriesKey, setSelectedChartSeriesKey] = useState<string | null>(null);

  const regionalIndexes = useMemo(() => {
    if (!marketDashboardData) return [];
    return marketDashboardData[selectedRegion] || [];
  }, [marketDashboardData, selectedRegion]);

  const regionalSeriesStatus = useMemo(() => {
    if (!marketDashboardData?.seriesStatus) return [];
    return marketDashboardData.seriesStatus[selectedRegion] || [];
  }, [marketDashboardData, selectedRegion]);

  const seriesStatusByKey = useMemo(() => {
    const map = new Map<string, "fresh" | "stale" | "no_recent">();
    for (const row of regionalSeriesStatus) {
      map.set(`${row.country}:${row.commodity}:${row.basis}`, row.status);
    }
    return map;
  }, [regionalSeriesStatus]);

  const primaryWheatIndex = useMemo(() => {
    if (!regionalIndexes.length) return null;
    return regionalIndexes.find((item) => item.commodity.toLowerCase().includes("wheat")) || regionalIndexes[0];
  }, [regionalIndexes]);

  useEffect(() => {
    if (!regionalIndexes.length) {
      setSelectedChartSeriesKey(null);
      return;
    }
    const preferred = primaryWheatIndex || regionalIndexes[0];
    setSelectedChartSeriesKey(`${preferred.country}:${preferred.commodity}:${preferred.basis}`);
  }, [selectedRegion, regionalIndexes, primaryWheatIndex]);

  const selectedChartIndex = useMemo(() => {
    if (!selectedChartSeriesKey) return primaryWheatIndex;
    return (
      regionalIndexes.find(
        (item) => `${item.country}:${item.commodity}:${item.basis}` === selectedChartSeriesKey
      ) || primaryWheatIndex
    );
  }, [selectedChartSeriesKey, regionalIndexes, primaryWheatIndex]);

  const { data: primaryWheatHistory, isLoading: isPrimaryWheatHistoryLoading } = useQuery<Array<{ date: string; price: number }>>({
    queryKey: ["/api/index/history", selectedRegion, selectedChartIndex?.commodity, selectedChartIndex?.basis],
    queryFn: async () => {
      if (!selectedChartIndex) return [];
      const params = new URLSearchParams({
        country: selectedRegion.toUpperCase(),
        commodity: selectedChartIndex.commodity,
        basis: selectedChartIndex.basis,
      });
      const response = await apiRequest("GET", `/api/index/history?${params.toString()}`);
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!selectedChartIndex,
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
  const marketHealth = marketDashboardData?.marketHealth?.[selectedRegion];
  const selectedDataAlert =
    selectedRegion === "br"
      ? marketDashboardData?.dataAlerts?.br
      : selectedRegion === "ar"
        ? marketDashboardData?.dataAlerts?.ar
        : selectedRegion === "us"
          ? marketDashboardData?.dataAlerts?.us
          : null;
  const marketHealthClass =
    marketHealth?.status === "OK"
      ? "bg-emerald-100 text-emerald-800"
      : marketHealth?.status === "WARN"
        ? "bg-amber-100 text-amber-800"
        : "bg-red-100 text-red-800";

  const handleViewOptionsMarket = () => {
    setLocation(`/options?country=${selectedRegion}`);
  };

  const classifyCommodity = (commodity: string): "grains" | "oilseeds" | "other" => {
    const c = commodity.toLowerCase();
    if (
      c.includes("corn") ||
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

  const getSeriesStatus = (index: { country: string; commodity: string; basis: string }) =>
    seriesStatusByKey.get(`${index.country}:${index.commodity}:${index.basis}`) || "no_recent";

  const getDisplayStatus = (index: {
    country: string;
    commodity: string;
    basis: string;
    priceStatus?: "fresh" | "stale" | "missing";
    dataStatus?: "fresh" | "stale" | "no_recent";
  }): "fresh" | "stale" | "no_recent" => {
    if (index.priceStatus === "fresh" || index.priceStatus === "stale") return index.priceStatus;
    if (index.priceStatus === "missing") return "no_recent";
    if (index.dataStatus === "fresh" || index.dataStatus === "stale") return index.dataStatus;
    if (index.dataStatus === "no_recent") return "no_recent";
    return getSeriesStatus(index);
  };

  const getStatusBadgeClass = (status: "fresh" | "stale" | "no_recent") => {
    if (status === "fresh") return "bg-emerald-100 text-emerald-800 border-emerald-200";
    if (status === "stale") return "bg-amber-100 text-amber-800 border-amber-200";
    return "bg-red-100 text-red-800 border-red-200";
  };

  const formatRelative = (value: string) => {
    const ts = new Date(value).getTime();
    if (!Number.isFinite(ts)) return "n/a";
    const minutes = Math.floor((Date.now() - ts) / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

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
            <AlertDescription>
              {selectedDataAlert || t("page.marketData.noIndexesForCountry", { country: selectedRegion.toUpperCase() })}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6">
            {marketHealth ? (
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>Last successful update: {marketHealth.lastSuccessfulUpdate || "n/a"}</span>
                <span>·</span>
                <span>Source: {marketHealth.source || "n/a"}</span>
                <Badge className={marketHealthClass}>{marketHealth.status}</Badge>
              </div>
            ) : null}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-muted-foreground">{t("page.marketData.grains")}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {grains.map((index) => (
                  <Card key={`${index.country}-${index.commodity}-${index.basis}`}>
                    <CardHeader>
                      <CardTitle className="text-lg">
                        {commodityDisplayName(index.commodity)}
                        {index.grade ? ` (${index.grade})` : ""}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-2">
                        <span>{index.basis}</span>
                        <Badge variant="outline" className={getStatusBadgeClass(getDisplayStatus(index))}>
                          {getDisplayStatus(index)}
                        </Badge>
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">${index.price.toFixed(2)} / t</div>
                      <div className="text-sm text-muted-foreground mt-1">
                        24h: {index.change24h > 0 ? "+" : ""}
                        {index.change24h.toFixed(2)}%
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        As of: {new Date(index.asOf).toISOString().slice(0, 10)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Fetched: {formatRelative(index.fetchedAt || index.asOf)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Source: {(index.provider || index.source) + (index.channel ? ` (${index.channel})` : "")}
                      </div>
                      {index.lastFetchStatus === "failed" && getDisplayStatus(index) !== "no_recent" ? (
                        <div className="text-xs text-amber-700">Last fetch failed; showing latest successful price</div>
                      ) : null}
                      {debugSources ? (
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          <div>raw={index.rawCommodity || index.commodity}; category={index.category || "other"}</div>
                          <div>raw quote: {typeof index.rawPrice === "number" ? index.rawPrice : "n/a"} {index.rawUnit || index.rawCurrency || ""}</div>
                          <div>fx: {typeof index.rawToUsdFxRate === "number" ? index.rawToUsdFxRate.toFixed(8) : "n/a"}</div>
                        </div>
                      ) : null}
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
                        {commodityDisplayName(index.commodity)}
                        {index.grade ? ` (${index.grade})` : ""}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-2">
                        <span>{index.basis}</span>
                        <Badge variant="outline" className={getStatusBadgeClass(getDisplayStatus(index))}>
                          {getDisplayStatus(index)}
                        </Badge>
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">${index.price.toFixed(2)} / t</div>
                      <div className="text-sm text-muted-foreground mt-1">
                        24h: {index.change24h > 0 ? "+" : ""}
                        {index.change24h.toFixed(2)}%
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        As of: {new Date(index.asOf).toISOString().slice(0, 10)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Fetched: {formatRelative(index.fetchedAt || index.asOf)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Source: {(index.provider || index.source) + (index.channel ? ` (${index.channel})` : "")}
                      </div>
                      {index.lastFetchStatus === "failed" && getDisplayStatus(index) !== "no_recent" ? (
                        <div className="text-xs text-amber-700">Last fetch failed; showing latest successful price</div>
                      ) : null}
                      {debugSources ? (
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          <div>raw={index.rawCommodity || index.commodity}; category={index.category || "other"}</div>
                          <div>raw quote: {typeof index.rawPrice === "number" ? index.rawPrice : "n/a"} {index.rawUnit || index.rawCurrency || ""}</div>
                          <div>fx: {typeof index.rawToUsdFxRate === "number" ? index.rawToUsdFxRate.toFixed(8) : "n/a"}</div>
                        </div>
                      ) : null}
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
                          {commodityDisplayName(index.commodity)}
                          {index.grade ? ` (${index.grade})` : ""}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-2">
                          <span>{index.basis}</span>
                          <Badge variant="outline" className={getStatusBadgeClass(getDisplayStatus(index))}>
                            {getDisplayStatus(index)}
                          </Badge>
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold">${index.price.toFixed(2)} / t</div>
                        <div className="text-sm text-muted-foreground mt-1">
                          24h: {index.change24h > 0 ? "+" : ""}
                          {index.change24h.toFixed(2)}%
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          As of: {new Date(index.asOf).toISOString().slice(0, 10)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Fetched: {formatRelative(index.fetchedAt || index.asOf)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Source: {(index.provider || index.source) + (index.channel ? ` (${index.channel})` : "")}
                        </div>
                        {index.lastFetchStatus === "failed" && getDisplayStatus(index) !== "no_recent" ? (
                          <div className="text-xs text-amber-700">Last fetch failed; showing latest successful price</div>
                        ) : null}
                        {debugSources ? (
                          <div className="text-xs text-muted-foreground space-y-0.5">
                            <div>raw={index.rawCommodity || index.commodity}; category={index.category || "other"}</div>
                            <div>raw quote: {typeof index.rawPrice === "number" ? index.rawPrice : "n/a"} {index.rawUnit || index.rawCurrency || ""}</div>
                            <div>fx: {typeof index.rawToUsdFxRate === "number" ? index.rawToUsdFxRate.toFixed(8) : "n/a"}</div>
                          </div>
                        ) : null}
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
                    {t("page.marketData.countryHeader", { country: countryLabel })}
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
            {regionalIndexes.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {regionalIndexes.map((idx) => {
                  const key = `${idx.country}:${idx.commodity}:${idx.basis}`;
                  const selected = key === selectedChartSeriesKey;
                  return (
                    <Button
                      key={key}
                      type="button"
                      variant={selected ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedChartSeriesKey(key)}
                    >
                      {idx.commodity}
                      {idx.grade ? ` (${idx.grade})` : ""}
                    </Button>
                  );
                })}
              </div>
            )}
            {isMarketDashboardLoading || isPrimaryWheatHistoryLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : selectedChartIndex && volatilityChartData.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{countryFlag}</span>
                  <span>
                    {selectedChartIndex.commodity}
                    {selectedChartIndex.grade ? ` (${selectedChartIndex.grade})` : ""} - {selectedChartIndex.basis}
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
