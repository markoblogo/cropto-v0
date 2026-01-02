import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useMarketDashboard, type MarketIndexDto } from "@/hooks/useMarketDashboard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowUp, ArrowDown, Minus, TrendingUp, ExternalLink, LineChart as LineChartIcon } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

interface HistoryDataPoint {
  date: string;
  price: number;
}

function MarketHistoryDialog({
  open,
  onClose,
  item,
}: {
  open: boolean;
  onClose: () => void;
  item: MarketIndexDto;
}) {
  const { t } = useTranslation();

  const { data: history, isLoading } = useQuery<HistoryDataPoint[]>({
    queryKey: ["/api/index/history", item.country, item.commodity, item.basis],
    queryFn: async () => {
      const params = new URLSearchParams({
        country: item.country,
        commodity: item.commodity,
        basis: item.basis,
      });
      const response = await apiRequest("GET", `/api/index/history?${params.toString()}`);
      return response.json();
    },
    enabled: open,
  });

  const chartData = history?.map((point) => ({
    date: new Date(point.date).toLocaleDateString(),
    price: point.price,
  })) || [];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {item.country} {item.commodity} {item.grade ? `(${item.grade})` : ""} - {item.basis}
          </DialogTitle>
          <DialogDescription>Price history chart</DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : chartData.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No history data available</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip
                  formatter={(value: number) => [`$${value.toFixed(2)}/t`, "Price"]}
                  labelFormatter={(label) => `Date: ${label}`}
                />
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MarketCard({ item }: { item: MarketIndexDto }) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [showHistory, setShowHistory] = useState(false);

  const changeValue = item.change24h;
  const changeColor = changeValue > 0 ? "text-emerald-600" : changeValue < 0 ? "text-red-600" : "text-muted-foreground";
  const ChangeIcon = changeValue > 0 ? ArrowUp : changeValue < 0 ? ArrowDown : Minus;

  const commodityLabel = item.grade ? `${item.commodity} (${item.grade})` : item.commodity;
  const countryFlag = item.country === "UA" ? "🇺🇦" : item.country === "BR" ? "🇧🇷" : "🇦🇷";

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <span>{countryFlag}</span>
          <span>{commodityLabel}</span>
        </CardTitle>
        <CardDescription>{item.basis}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="space-y-3">
          <div>
            <div className="text-3xl font-bold">{item.price.toFixed(2)}</div>
            <div className="text-sm text-muted-foreground">{item.currency}/t</div>
          </div>
          <div className="flex items-center gap-2">
            <ChangeIcon className={`h-4 w-4 ${changeColor}`} />
            <span className={`text-sm font-medium ${changeColor}`}>
              {changeValue > 0 ? "+" : ""}{changeValue.toFixed(2)}%
            </span>
            <span className="text-xs text-muted-foreground">24h</span>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => setShowHistory(true)}
        >
          <LineChartIcon className="mr-2 h-3 w-3" />
          {t('home.market.card.viewHistory')}
        </Button>
        <Button
          variant="default"
          size="sm"
          className="flex-1"
          onClick={() => setLocation("/options")}
        >
          {t('home.market.card.viewOptions')}
          <ExternalLink className="ml-2 h-3 w-3" />
        </Button>
      </CardFooter>
      <MarketHistoryDialog
        open={showHistory}
        onClose={() => setShowHistory(false)}
        item={item}
      />
    </Card>
  );
}

function MarketTab({ items, isLoading }: { items: MarketIndexDto[]; isLoading: boolean }) {
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
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {items.map((item, index) => (
        <MarketCard key={`${item.country}-${item.commodity}-${index}`} item={item} />
      ))}
    </div>
  );
}

export function MarketDashboard() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { data, isLoading, error } = useMarketDashboard();

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
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight mb-2">
              {t('home.market.title')}
            </h2>
            <p className="text-muted-foreground">
              {t('home.market.subtitle')}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => setLocation("/arbitrage")}
          >
            <TrendingUp className="mr-2 h-4 w-4" />
            {t('home.market.compareMarkets')}
          </Button>
        </div>

        <Tabs defaultValue="ua" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="ua">{t('home.market.tabs.ua')}</TabsTrigger>
            <TabsTrigger value="br">{t('home.market.tabs.br')}</TabsTrigger>
            <TabsTrigger value="ar">{t('home.market.tabs.ar')}</TabsTrigger>
          </TabsList>

          <TabsContent value="ua" className="mt-6">
            <MarketTab items={data?.ua || []} isLoading={isLoading} />
          </TabsContent>

          <TabsContent value="br" className="mt-6">
            <MarketTab items={data?.br || []} isLoading={isLoading} />
          </TabsContent>

          <TabsContent value="ar" className="mt-6">
            <MarketTab items={data?.ar || []} isLoading={isLoading} />
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}