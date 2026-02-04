import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";

interface PriceHistoryDialogProps {
  open: boolean;
  onClose: () => void;
  commodity: string;
}

interface HistoryDataPoint {
  date: string;
  price: number;
}

interface HistoryResponse {
  current: HistoryDataPoint[];
  previous: HistoryDataPoint[];
  hasPreviousYear: boolean;
}

type PeriodOption = '30d' | '90d' | '365d' | 'all';

export function PriceHistoryDialog({ open, onClose, commodity }: PriceHistoryDialogProps) {
  const [period, setPeriod] = useState<PeriodOption>('30d');
  const { t } = useTranslation();

  const { data: historyData, isLoading } = useQuery<HistoryResponse>({
    queryKey: [`/api/index/history?commodity=${commodity}&period=${period}&interval=day&comparison=true`],
    enabled: open, // Only fetch when dialog is open
  });

  const periodOptions: Array<{ value: PeriodOption; label: string }> = [
    { value: '30d', label: t("dialog.priceHistory.period.30d") },
    { value: '90d', label: t("dialog.priceHistory.period.90d") },
    { value: '365d', label: t("dialog.priceHistory.period.365d") },
    { value: 'all', label: t("dialog.priceHistory.period.all") },
  ];

  // Prepare chart data by normalizing dates for comparison
  const chartData = historyData?.current.map((point, index) => {
    const currentYear = new Date(point.date);
    const monthDay = `${currentYear.getMonth() + 1}/${currentYear.getDate()}`;
    
    const dataPoint: any = {
      date: point.date,
      displayDate: monthDay,
      currentYear: point.price,
    };
    
    // Only include previousYear field if we have comparison data
    if (historyData.hasPreviousYear && historyData.previous) {
      const prevPoint = historyData.previous.find(p => {
        const prevDate = new Date(p.date);
        return prevDate.getMonth() === currentYear.getMonth() && 
               prevDate.getDate() === currentYear.getDate();
      });
      if (prevPoint) {
        dataPoint.previousYear = prevPoint.price;
      }
    }
    
    return dataPoint;
  }) || [];

  // Calculate min and max for Y-axis domain (including both series)
  const allPrices = chartData.flatMap(d => 
    [d.currentYear, d.previousYear].filter((p): p is number => p !== null && p !== undefined && !isNaN(p))
  );
  const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : 0;
  const maxPrice = allPrices.length > 0 ? Math.max(...allPrices) : 100;
  const padding = (maxPrice - minPrice) * 0.1 || 10; // 10% padding or default 10

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-4xl" data-testid="dialog-price-history">
        <DialogHeader>
          <DialogTitle>{t("dialog.priceHistory.titleWithCommodity", { commodity })}</DialogTitle>
        </DialogHeader>

        {/* Period Selector */}
        <div className="flex gap-2 mb-4">
          {periodOptions.map((option) => (
            <Button
              key={option.value}
              variant={period === option.value ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriod(option.value)}
              data-testid={`button-period-${option.value}`}
            >
              {option.label}
            </Button>
          ))}
        </div>

        {/* Chart */}
        <div className="w-full" style={{ height: 400 }}>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : chartData && chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return `${date.getMonth() + 1}/${date.getDate()}`;
                  }}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 12 }}
                  domain={[minPrice - padding, maxPrice + padding]}
                  tickFormatter={(value) => `$${value.toFixed(0)}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                    color: 'hsl(var(--card-foreground))',
                  }}
                  formatter={(value: number, name: string) => {
                    if (value === null) return null;
                    const label = name === 'currentYear'
                      ? t("dialog.priceHistory.labels.thisYear")
                      : t("dialog.priceHistory.labels.lastYear");
                    return [`$${value.toFixed(2)}`, label];
                  }}
                  labelFormatter={(label) => {
                    const date = new Date(label);
                    return date.toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    });
                  }}
                />
                {historyData?.hasPreviousYear && (
                  <Legend 
                    wrapperStyle={{ paddingTop: '10px' }}
                    formatter={(value) => value === 'currentYear'
                      ? t("dialog.priceHistory.labels.thisYear")
                      : t("dialog.priceHistory.labels.lastYear")}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="currentYear"
                  name={t("dialog.priceHistory.labels.thisYear")}
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ fill: 'hsl(var(--primary))', r: 3 }}
                  activeDot={{ r: 5 }}
                />
                {historyData?.hasPreviousYear && (
                  <Line
                    type="monotone"
                    dataKey="previousYear"
                    name={t("dialog.priceHistory.labels.lastYear")}
                    stroke="hsl(var(--muted-foreground))"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ fill: 'hsl(var(--muted-foreground))', r: 3 }}
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p>{t("dialog.priceHistory.empty")}</p>
            </div>
          )}
        </div>

        {/* Data Summary */}
        {chartData && chartData.length > 0 && (
          <div className="space-y-3 pt-4 border-t">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">{t("dialog.priceHistory.summary.points")}</p>
                <p className="text-lg font-semibold">{chartData.length}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("dialog.priceHistory.summary.min")}</p>
                <p className="text-lg font-semibold">${minPrice.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("dialog.priceHistory.summary.max")}</p>
                <p className="text-lg font-semibold">${maxPrice.toFixed(2)}</p>
              </div>
            </div>
            {historyData?.hasPreviousYear && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <div className="w-4 h-0.5 bg-primary"></div>
                  <span>{t("dialog.priceHistory.labels.thisYear")}</span>
                </div>
                <span>•</span>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-0.5 bg-muted-foreground" style={{ borderTop: '2px dashed' }}></div>
                  <span>{t("dialog.priceHistory.labels.lastYearComparison")}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
