import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useMarketDashboard, type MarketIndexDto } from "@/hooks/useMarketDashboard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowUp, ArrowDown, Minus, TrendingUp, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { commodityDisplayName } from "@shared/commodities";
import { InvestorDeckCallout } from "@/components/home/InvestorDeckCallout";

interface HistoryDataPoint {
  date: string;
  price: number;
}

type MarketCountryTab = "ua" | "br" | "ar" | "us";

function getDefaultMarketTabForLang(langRaw: string): MarketCountryTab {
  const lang = (langRaw || "en").split("-")[0].toLowerCase();
  if (lang === "uk") return "ua";
  if (lang === "pt") return "br";
  if (lang === "es") return "ar";
  return "us";
}

function MarketCard({ item }: { item: MarketIndexDto }) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  const changeValue = item.change24h;
  const changeColor = changeValue > 0 ? "text-emerald-600" : changeValue < 0 ? "text-red-600" : "text-muted-foreground";
  const ChangeIcon = changeValue > 0 ? ArrowUp : changeValue < 0 ? ArrowDown : Minus;

  const commodityName = commodityDisplayName(item.commodity);
  const commodityLabel = item.grade ? `${commodityName} (${item.grade})` : commodityName;
  const isDebugSources = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debugSources") === "1";
  const countryFlag = item.country === "UA" ? "🇺🇦" : item.country === "BR" ? "🇧🇷" : item.country === "AR" ? "🇦🇷" : "🇺🇸";
  const commoditySlug = item.commodity.toLowerCase().includes("corn") || item.commodity.toLowerCase().includes("maize")
    ? "corn"
    : item.commodity.toLowerCase().includes("sunflower")
      ? "sunflower"
      : item.commodity.toLowerCase().includes("soy")
        ? "soy-gmo"
        : item.commodity.toLowerCase().includes("wheat") && item.commodity.toLowerCase().includes("feed")
          ? "feed-wheat"
          : item.commodity.toLowerCase().includes("wheat")
            ? "wheat-115"
            : item.commodity.toLowerCase().replace(/\\s+/g, "-");

  // Fetch history for sparkline
  const { data: history } = useQuery<HistoryDataPoint[]>({
    queryKey: ["/api/index/history", item.seriesKey || `${item.country}:${item.commodity}:${item.basis}`],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("seriesKey", item.seriesKey || `${item.country}:${item.commodity}:${item.basis}`);
      const response = await apiRequest("GET", `/api/index/history?${params.toString()}`);
      const data = await response.json();
      if (!Array.isArray(data)) {
        return [];
      }
      return data;
    },
  });

  const sparklineData = Array.isArray(history) ? history.slice(-20).map((point) => ({
    date: point.date,
    price: point.price,
  })) : [];

  const handleViewIndexMarket = () => {
    setLocation(`/forward-market?country=${item.country.toLowerCase()}`);
  };

  const handleViewOptionsMarket = () => {
    setLocation(`/options?country=${item.country.toLowerCase()}`);
  };

  const handleSparklineClick = () => {
    // Navigate to Market Data page for this index
    setLocation(`/market-data?country=${item.country.toLowerCase()}&commodity=${item.commodity}`);
  };

  const compactIndexLabel = t("home.market.card.viewIndex")
    .replace(/^View\s+/i, "")
    .replace(/^Переглянути\s+/i, "")
    .replace(/^Ver\s+/i, "")
    .replace(/^Просмотреть\s+/i, "");
  const compactOptionsLabel = t("home.market.card.viewOptions")
    .replace(/^View\s+/i, "")
    .replace(/^Переглянути\s+/i, "")
    .replace(/^Ver\s+/i, "")
    .replace(/^Просмотреть\s+/i, "");

  const asOfText = item.asOf ? new Date(item.asOf).toISOString().slice(0, 10) : "n/a";
  const fetchedValue = item.fetchedAt || item.asOf;
  const fetchedText = fetchedValue ? formatRelative(fetchedValue) : "n/a";
  const priceStatus = item.priceStatus || (item.dataStatus === "no_recent" ? "missing" : item.dataStatus) || "missing";
  const freshnessBadge = priceStatus === "fresh" ? "Fresh" : priceStatus === "stale" ? "Stale" : "Failed";
  const showLastFetchFailedWarning = item.lastFetchStatus === "failed" && priceStatus !== "missing";

  return (
    <Card className="flex flex-col rounded-xl shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <span>{countryFlag}</span>
          <img
            src={`/commodities/${commoditySlug}.png`}
            alt={item.commodity}
            className="h-4 w-4 object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
          <span>{commodityLabel}</span>
        </CardTitle>
        <CardDescription>
          <span className="font-medium">{t('home.market.card.source')}: </span>
          {`${item.provider || item.source}${item.channel ? ` (${item.channel})` : ""}${item.sourceTier ? ` ${item.sourceTier}` : ""}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-2">
        <div className="space-y-2">
          {/* Current Price */}
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold leading-none">{item.price.toFixed(2)}</span>
            <span className="text-sm text-muted-foreground">{item.currency}/t</span>
          </div>

          {/* Change 24h */}
          <div className="flex items-center gap-2">
            <ChangeIcon className={`h-4 w-4 ${changeColor}`} />
            <span className={`text-sm font-medium ${changeColor}`}>
              {changeValue > 0 ? "+" : ""}{changeValue.toFixed(2)}%
            </span>
            <span className="text-xs text-muted-foreground">24h</span>
            <Badge variant="outline" className="ml-auto text-[10px] uppercase">
              {item.basis?.toLowerCase().includes("processing") ? "Processing" : "Export"}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>As of: {asOfText}</span>
            <span>Fetched: {fetchedText}</span>
            <Badge variant={freshnessBadge === "Fresh" ? "default" : freshnessBadge === "Stale" ? "secondary" : "destructive"} className="ml-auto h-5 text-[10px]">
              {freshnessBadge}
            </Badge>
          </div>
          {showLastFetchFailedWarning ? (
            <div className="text-[11px] text-amber-700">Last fetch failed; showing latest successful price</div>
          ) : null}
          {isDebugSources ? (
            <div className="text-[11px] text-muted-foreground leading-tight">
              <div>normalized: {item.commodity}</div>
              <div>raw: {item.rawCommodity || item.commodity}</div>
              <div>category: {item.category || "other"}</div>
              {typeof item.rawPrice === "number" ? (
                <div>
                  raw quote: {item.rawPrice.toFixed(4)} {item.rawUnit || item.rawCurrency || ""}
                </div>
              ) : null}
              {typeof item.rawToUsdFxRate === "number" ? (
                <div>fx: {item.rawCurrency || "N/A"} {"->"} USD = {item.rawToUsdFxRate.toFixed(8)}</div>
              ) : null}
              {item.conversionNotes ? <div>conversion: {item.conversionNotes}</div> : null}
              {item.alternatives && item.alternatives.length > 0 ? (
                <div>alternatives: {item.alternatives.length}</div>
              ) : null}
            </div>
          ) : null}

          {/* Sparkline Chart */}
          {sparklineData.length > 1 && (
            <div 
              className="h-10 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={handleSparklineClick}
              title={t('home.market.card.clickForMarketData')}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sparklineData}>
                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke={changeValue > 0 ? "#16a34a" : changeValue < 0 ? "#dc2626" : "hsl(var(--muted-foreground))"}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="pt-1 pb-3 flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3 text-xs flex-1 min-w-0"
          onClick={handleViewIndexMarket}
          title={compactIndexLabel}
        >
          <span className="truncate">{compactIndexLabel}</span>
          <ExternalLink className="ml-1 h-3 w-3 shrink-0" />
        </Button>
        <Button
          variant="default"
          size="sm"
          className="h-8 px-3 text-xs flex-1 min-w-0"
          onClick={handleViewOptionsMarket}
          title={compactOptionsLabel}
        >
          <span className="truncate">{compactOptionsLabel}</span>
          <ExternalLink className="ml-1 h-3 w-3 shrink-0" />
        </Button>
      </CardFooter>
    </Card>
  );
}

function formatRelative(value: string): string {
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return "n/a";
  const diffMs = Date.now() - ts;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function MarketTab({ 
  items, 
  isLoading, 
  description 
}: { 
  items: MarketIndexDto[]; 
  isLoading: boolean;
  description?: string;
}) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="text-muted-foreground">{t('common.loading')}</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-muted-foreground">{t('common.noData')}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {items.map((item) => (
          <MarketCard key={item.seriesKey || `${item.country}-${item.commodity}-${item.basis}`} item={item} />
        ))}
      </div>
    </div>
  );
}

export function MarketDashboard() {
  const { t, i18n } = useTranslation();
  const [, setLocation] = useLocation();
  const { data, isLoading, error } = useMarketDashboard();
  const computedDefaultTab = useMemo(
    () => getDefaultMarketTabForLang(i18n.resolvedLanguage || i18n.language || "en"),
    [i18n.language, i18n.resolvedLanguage]
  );
  const [selectedTab, setSelectedTab] = useState<MarketCountryTab>(computedDefaultTab);
  const selectedHealth = data?.marketHealth?.[selectedTab];
  const selectedDataAlert =
    selectedTab === "br" ? data?.dataAlerts?.br : selectedTab === "ar" ? data?.dataAlerts?.ar : selectedTab === "us" ? data?.dataAlerts?.us : null;
  const selectedHealthBadgeClass =
    selectedHealth?.status === "OK"
      ? "bg-emerald-100 text-emerald-800"
      : selectedHealth?.status === "WARN"
        ? "bg-amber-100 text-amber-800"
        : "bg-red-100 text-red-800";

  useEffect(() => {
    setSelectedTab(computedDefaultTab);
  }, [computedDefaultTab]);

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-destructive">{t('common.error')}</div>
        <div className="text-sm text-muted-foreground mt-2">
          {error instanceof Error ? error.message : String(error)}
        </div>
      </div>
    );
  }

  return (
    <section className="py-12">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <Tabs value={selectedTab} onValueChange={(v) => setSelectedTab(v as MarketCountryTab)} className="w-full">
          <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] md:gap-4 xl:[grid-template-columns:minmax(0,1.6fr)_minmax(320px,420px)_auto] xl:items-start xl:gap-6">
            <div className="space-y-4 md:min-w-0 xl:col-start-1">
              <div>
                <h2 className="mb-2 text-3xl font-bold tracking-tight">
                  {t('home.market.title')}
                </h2>
                <p className="text-muted-foreground">
                  {t('home.market.subtitle')}
                </p>
              </div>

              {selectedHealth ? (
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>Last successful update: {selectedHealth.lastSuccessfulUpdate || "n/a"}</span>
                  <span>·</span>
                  <span>Source: {selectedHealth.source || "n/a"}</span>
                  <Badge className={selectedHealthBadgeClass}>{selectedHealth.status}</Badge>
                </div>
              ) : null}

              {selectedDataAlert ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {selectedDataAlert}
                </div>
              ) : null}

              <TabsList className="grid w-full max-w-xl grid-cols-4">
                <TabsTrigger value="ua">{t('home.market.tabs.ua')}</TabsTrigger>
                <TabsTrigger value="br">{t('home.market.tabs.br')}</TabsTrigger>
                <TabsTrigger value="ar">{t('home.market.tabs.ar')}</TabsTrigger>
                <TabsTrigger value="us">{t('home.market.tabs.us')}</TabsTrigger>
              </TabsList>
            </div>

            <div className="space-y-3 md:col-start-2 xl:col-start-2">
              <InvestorDeckCallout />
              <Button
                variant="outline"
                className="w-full justify-center md:inline-flex md:w-auto xl:hidden"
                onClick={() => setLocation("/arbitrage")}
              >
                <TrendingUp className="mr-2 h-4 w-4" />
                {t('home.market.compareMarkets')}
              </Button>
            </div>

            <div className="hidden xl:col-start-3 xl:block xl:self-start">
              <Button
                variant="outline"
                onClick={() => setLocation("/arbitrage")}
              >
                <TrendingUp className="mr-2 h-4 w-4" />
                {t('home.market.compareMarkets')}
              </Button>
            </div>
          </div>

          <TabsContent value="ua" className="mt-6">
            <MarketTab 
              items={data?.ua || []} 
              isLoading={isLoading}
              description={t('home.market.tabs.uaDescription')}
            />
          </TabsContent>

          <TabsContent value="br" className="mt-6">
            <MarketTab 
              items={data?.br || []} 
              isLoading={isLoading}
              description={t('home.market.tabs.brDescription')}
            />
          </TabsContent>

          <TabsContent value="ar" className="mt-6">
            <MarketTab 
              items={data?.ar || []} 
              isLoading={isLoading}
              description={t('home.market.tabs.arDescription')}
            />
          </TabsContent>

          <TabsContent value="us" className="mt-6">
            <MarketTab 
              items={data?.us || []} 
              isLoading={isLoading}
              description={t('home.market.tabs.usDescription')}
            />
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}
