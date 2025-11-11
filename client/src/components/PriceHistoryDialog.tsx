import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface PriceHistoryDialogProps {
  open: boolean;
  onClose: () => void;
  commodity: string;
}

interface HistoryDataPoint {
  date: string;
  price: number;
}

type PeriodOption = '30d' | '90d' | '365d' | 'all';

export function PriceHistoryDialog({ open, onClose, commodity }: PriceHistoryDialogProps) {
  const [period, setPeriod] = useState<PeriodOption>('30d');

  const { data: historyData, isLoading } = useQuery<HistoryDataPoint[]>({
    queryKey: ["/api/index/history", { commodity, period, interval: 'day' }],
    enabled: open, // Only fetch when dialog is open
  });

  const periodOptions: Array<{ value: PeriodOption; label: string }> = [
    { value: '30d', label: '30 дней' },
    { value: '90d', label: '90 дней' },
    { value: '365d', label: '1 год' },
    { value: 'all', label: 'Всё время' },
  ];

  // Calculate min and max for Y-axis domain
  const prices = historyData?.map(d => d.price) || [];
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 100;
  const padding = (maxPrice - minPrice) * 0.1; // 10% padding

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-4xl" data-testid="dialog-price-history">
        <DialogHeader>
          <DialogTitle>История цен — {commodity}</DialogTitle>
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
          ) : historyData && historyData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={historyData}>
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
                  formatter={(value: number) => [`$${value.toFixed(2)}`, 'Цена']}
                  labelFormatter={(label) => {
                    const date = new Date(label);
                    return date.toLocaleDateString('ru-RU', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    });
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ fill: 'hsl(var(--primary))', r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p>Нет данных для отображения</p>
            </div>
          )}
        </div>

        {/* Data Summary */}
        {historyData && historyData.length > 0 && (
          <div className="grid grid-cols-3 gap-4 pt-4 border-t">
            <div>
              <p className="text-sm text-muted-foreground">Точек данных</p>
              <p className="text-lg font-semibold">{historyData.length}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Минимум</p>
              <p className="text-lg font-semibold">${minPrice.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Максимум</p>
              <p className="text-lg font-semibold">${maxPrice.toFixed(2)}</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
