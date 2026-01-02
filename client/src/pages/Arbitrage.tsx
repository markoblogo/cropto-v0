import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MainLayout } from "@/components/layouts/MainLayout";
import { apiRequest } from "@/lib/queryClient";
import { ArrowUp, ArrowDown, TrendingUp, Loader2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface ArbitrageResponse {
  commodity: string;
  base: {
    country: string;
    price: number;
    basis: string;
    asOf: string;
  };
  target: {
    country: string;
    price: number;
    basis: string;
    asOf: string;
  };
  spreadAbs: number;
  spreadPct: number;
  history?: Array<{
    date: string;
    basePrice: number;
    targetPrice: number;
    spreadAbs: number;
    spreadPct: number;
  }>;
}

const COMMODITIES = ["corn", "wheat", "soybeans", "sunflower", "rapeseed", "sugar"];

export default function Arbitrage() {
  const { t } = useTranslation();
  const [baseCountry, setBaseCountry] = useState<"UA" | "BR" | "AR">("UA");
  const [targetCountry, setTargetCountry] = useState<"UA" | "BR" | "AR">("BR");
  const [commodity, setCommodity] = useState("corn");
  const [includeHistory, setIncludeHistory] = useState(false);
  const [shouldFetch, setShouldFetch] = useState(false);

  const { data: arbitrageData, isLoading, error } = useQuery<ArbitrageResponse>({
    queryKey: ["/api/arbitrage/index", baseCountry, targetCountry, commodity, includeHistory],
    queryFn: async () => {
      const params = new URLSearchParams({
        baseCountry,
        targetCountry,
        commodity,
        ...(includeHistory ? { includeHistory: "true" } : {}),
      });
      const response = await apiRequest("GET", `/api/arbitrage/index?${params.toString()}`);
      return response.json();
    },
    enabled: shouldFetch,
    retry: false,
  });

  const handleCompare = () => {
    setShouldFetch(true);
  };

  const spreadAbs = arbitrageData?.spreadAbs || 0;
  const spreadPct = arbitrageData?.spreadPct || 0;
  const isPositive = spreadAbs > 0;
  const SpreadIcon = isPositive ? ArrowUp : ArrowDown;
  const spreadColor = isPositive ? "text-emerald-600" : "text-red-600";

  return (
    <MainLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold mb-2">{t('arbitrage.title')}</h1>
          <p className="text-muted-foreground">{t('arbitrage.subtitle')}</p>
        </div>

        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle>{t('arbitrage.form.title')}</CardTitle>
            <CardDescription>{t('arbitrage.form.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="base-country">{t('arbitrage.form.baseCountry')}</Label>
                <Select
                  value={baseCountry}
                  onValueChange={(value: "UA" | "BR" | "AR") => {
                    setBaseCountry(value);
                    setShouldFetch(false);
                  }}
                >
                  <SelectTrigger id="base-country">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UA">{t('arbitrage.countries.ua')}</SelectItem>
                    <SelectItem value="BR">{t('arbitrage.countries.br')}</SelectItem>
                    <SelectItem value="AR">{t('arbitrage.countries.ar')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="target-country">{t('arbitrage.form.targetCountry')}</Label>
                <Select
                  value={targetCountry}
                  onValueChange={(value: "UA" | "BR" | "AR") => {
                    setTargetCountry(value);
                    setShouldFetch(false);
                  }}
                >
                  <SelectTrigger id="target-country">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UA">{t('arbitrage.countries.ua')}</SelectItem>
                    <SelectItem value="BR">{t('arbitrage.countries.br')}</SelectItem>
                    <SelectItem value="AR">{t('arbitrage.countries.ar')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="commodity">{t('arbitrage.form.commodity')}</Label>
                <Select
                  value={commodity}
                  onValueChange={(value) => {
                    setCommodity(value);
                    setShouldFetch(false);
                  }}
                >
                  <SelectTrigger id="commodity">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMODITIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c.charAt(0).toUpperCase() + c.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 flex flex-col justify-end">
                <Button onClick={handleCompare} disabled={isLoading} className="w-full">
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('common.loading')}
                    </>
                  ) : (
                    <>
                      <TrendingUp className="mr-2 h-4 w-4" />
                      {t('arbitrage.form.compare')}
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="mt-4">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={includeHistory}
                  onChange={(e) => {
                    setIncludeHistory(e.target.checked);
                    setShouldFetch(false);
                  }}
                  className="rounded"
                />
                <span className="text-sm text-muted-foreground">
                  {t('arbitrage.form.includeHistory')}
                </span>
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Error Display */}
        {error && shouldFetch && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <div className="text-destructive">
                {error instanceof Error
                  ? error.message
                  : typeof error === "object" && error !== null && "error" in error
                  ? String((error as any).error)
                  : t('arbitrage.error.generic')}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {arbitrageData && shouldFetch && (
          <>
            {/* Spread Summary */}
            <Card>
              <CardHeader>
                <CardTitle>{t('arbitrage.results.title')}</CardTitle>
                <CardDescription>
                  {t('arbitrage.results.description', {
                    commodity: arbitrageData.commodity,
                    base: arbitrageData.base.country,
                    target: arbitrageData.target.country,
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Base Country */}
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">
                      {t('arbitrage.results.base')}
                    </Label>
                    <div className="space-y-1">
                      <div className="text-2xl font-bold">
                        {arbitrageData.base.country} - ${arbitrageData.base.price.toFixed(2)}/t
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {arbitrageData.base.basis}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t('arbitrage.results.asOf')}: {new Date(arbitrageData.base.asOf).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  {/* Target Country */}
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">
                      {t('arbitrage.results.target')}
                    </Label>
                    <div className="space-y-1">
                      <div className="text-2xl font-bold">
                        {arbitrageData.target.country} - ${arbitrageData.target.price.toFixed(2)}/t
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {arbitrageData.target.basis}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t('arbitrage.results.asOf')}: {new Date(arbitrageData.target.asOf).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Spread */}
                <div className="mt-6 pt-6 border-t">
                  <div className="flex items-center gap-4">
                    <div>
                      <Label className="text-sm text-muted-foreground">
                        {t('arbitrage.results.spread')}
                      </Label>
                      <div className="flex items-center gap-2 mt-1">
                        <SpreadIcon className={`h-5 w-5 ${spreadColor}`} />
                        <span className={`text-3xl font-bold ${spreadColor}`}>
                          ${Math.abs(spreadAbs).toFixed(2)}
                        </span>
                        <span className={`text-2xl font-semibold ${spreadColor}`}>
                          ({isPositive ? "+" : ""}{spreadPct.toFixed(2)}%)
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    {t('arbitrage.results.spreadDescription', {
                      base: arbitrageData.base.country,
                      target: arbitrageData.target.country,
                    })}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* History Chart */}
            {includeHistory && arbitrageData.history && arbitrageData.history.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>{t('arbitrage.history.title')}</CardTitle>
                  <CardDescription>{t('arbitrage.history.description')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={arbitrageData.history.map((h) => ({
                      date: new Date(h.date).toLocaleDateString(),
                      spread: h.spreadAbs,
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip
                        formatter={(value: number) => [`$${value.toFixed(2)}`, t('arbitrage.history.spread')]}
                        labelFormatter={(label) => `Date: ${label}`}
                      />
                      <Line
                        type="monotone"
                        dataKey="spread"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Empty State */}
        {!shouldFetch && !arbitrageData && (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-12 text-muted-foreground">
                <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">{t('arbitrage.empty.title')}</p>
                <p className="text-sm">{t('arbitrage.empty.description')}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}