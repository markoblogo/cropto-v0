import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { LineChart, Line, ResponsiveContainer } from "recharts";

interface IndexData {
  commodity: string;
  price: string;
  timestamp: string;
  change: number;
  history: Array<{
    price: number;
    timestamp: string;
  }>;
}

export function DashboardIndexWidget() {
  const { data: indexData, isLoading, error } = useQuery<IndexData>({
    queryKey: ["/api/index/latest"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <Card data-testid="card-index-widget">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Index Price
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  if (error || !indexData) {
    return (
      <Card data-testid="card-index-widget">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Index Price
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-destructive text-sm">Failed to load index data</p>
        </CardContent>
      </Card>
    );
  }

  const priceValue = parseFloat(indexData.price);
  const changeValue = indexData.change;
  const isPositive = changeValue > 0;
  const isNegative = changeValue < 0;
  const isNeutral = changeValue === 0;

  const TrendIcon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;
  const trendColor = isPositive 
    ? "text-green-600 dark:text-green-400" 
    : isNegative 
    ? "text-red-600 dark:text-red-400" 
    : "text-muted-foreground";

  return (
    <Card data-testid="card-index-widget">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {indexData.commodity} Index
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Price and Change */}
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono" data-testid="text-index-price">
              ${priceValue.toFixed(2)}
            </span>
          </div>
          <div className={`flex items-center gap-1 ${trendColor}`} data-testid="text-index-change">
            <TrendIcon className="w-4 h-4" />
            <span className="text-sm font-medium">
              {isPositive ? "+" : ""}{changeValue.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* Sparkline Chart */}
        {indexData.history.length > 1 && (
          <div className="h-12" data-testid="chart-sparkline">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={indexData.history}>
                <Line 
                  type="monotone" 
                  dataKey="price" 
                  stroke={isPositive ? "#16a34a" : isNegative ? "#dc2626" : "hsl(var(--muted-foreground))"} 
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Last Updated */}
        <p className="text-xs text-muted-foreground" data-testid="text-last-updated">
          Last updated: {new Date(indexData.timestamp).toLocaleTimeString()}
        </p>
      </CardContent>
    </Card>
  );
}
