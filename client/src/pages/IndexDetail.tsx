import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MainLayout } from "@/components/layouts/MainLayout";
import { CreateOptionDialog } from "@/components/CreateOptionDialog";
import { TrendingUp, TrendingDown, Minus, Plus, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import type { InsertOption } from "@shared/schema";
import { getIndexMetadata } from "@/lib/indexMapping";
import { Badge } from "@/components/ui/badge";

interface PriceHistoryEntry {
  id: string;
  price: number;
  delta: number | null;
  timestamp: string;
}

interface IndexData {
  id: string;
  name: string;
  slug: string;
  category: string;
  hasVat: boolean;
  priceHistory: PriceHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export default function IndexDetail() {
  const { toast } = useToast();
  const [, params] = useRoute("/index/:slug");
  const slug = params?.slug || "";
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const { data: indexData, isLoading, error } = useQuery<IndexData>({
    queryKey: ["/api/indexes", slug],
    queryFn: async () => {
      const response = await fetch(`/api/indexes/${slug}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch index: ${response.statusText}`);
      }
      return response.json();
    },
    enabled: !!slug,
  });

  const createOptionMutation = useMutation({
    mutationFn: async (data: InsertOption) => {
      const response = await apiRequest("POST", "/api/options", data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/options"] });
      toast({
        title: "Success",
        description: "Option created successfully",
      });
      setIsCreateDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create option",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <MainLayout>
        <div className="space-y-8">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </MainLayout>
    );
  }

  if (error || !indexData) {
    return (
      <MainLayout>
        <div className="space-y-8">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Failed to load index data. The index "{slug}" may not exist.
            </AlertDescription>
          </Alert>
        </div>
      </MainLayout>
    );
  }

  const latestPrice = indexData.priceHistory && indexData.priceHistory.length > 0 
    ? indexData.priceHistory[0] 
    : null;
  const previousPrice = indexData.priceHistory && indexData.priceHistory.length > 1 
    ? indexData.priceHistory[1] 
    : null;
  const priceChange = latestPrice && previousPrice 
    ? latestPrice.price - previousPrice.price 
    : latestPrice?.delta || 0;
  
  // Calculate 24h change percentage
  const changePercent = latestPrice && previousPrice && previousPrice.price > 0
    ? ((priceChange / previousPrice.price) * 100)
    : null;
  
  const isPositive = priceChange > 0;
  const isNegative = priceChange < 0;
  const TrendIcon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;
  const trendColor = isPositive 
    ? "text-green-600 dark:text-green-400" 
    : isNegative 
    ? "text-red-600 dark:text-red-400" 
    : "text-muted-foreground";

  // Get index metadata
  const metadata = getIndexMetadata(indexData.slug, indexData.category);

  // Prepare chart data (reverse to show chronologically)
  const chartData = [...indexData.priceHistory]
    .reverse()
    .map(entry => ({
      date: format(new Date(entry.timestamp), "MMM dd HH:mm"),
      price: entry.price,
      timestamp: entry.timestamp,
    }));

  // Calculate Y-axis domain
  const allPrices = chartData.map(d => d.price);
  const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : 0;
  const maxPrice = allPrices.length > 0 ? Math.max(...allPrices) : 100;
  const padding = (maxPrice - minPrice) * 0.1 || 10;

  return (
    <MainLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <img 
                  src={`/commodities/${indexData.slug}.png`}
                  alt={indexData.name}
                  className="w-8 h-8 object-contain"
                />
                <div>
                  <h1 className="text-3xl font-bold" data-testid="heading-index-name">
                    {indexData.name}
                  </h1>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm font-mono text-muted-foreground">
                      {metadata.pairCode}
                    </span>
                    <Badge 
                      variant={metadata.type === "export" ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {metadata.type === "export" ? "Export" : "Processing"}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-muted-foreground px-3 py-1 bg-muted rounded-md" data-testid="text-category">
                  {indexData.category}
                </span>
                {indexData.hasVat && (
                  <span className="text-xs text-muted-foreground px-2 py-1 border rounded-md">
                    VAT Included
                  </span>
                )}
              </div>
              {latestPrice && (
                <div className="mt-2">
                  <div className="flex items-baseline gap-3">
                    <span className="text-2xl font-bold font-mono">
                      ${latestPrice.price.toFixed(2)} / t
                    </span>
                    {changePercent !== null && (
                      <div className={`flex items-center gap-1 ${trendColor}`}>
                        <TrendIcon className="w-4 h-4" />
                        <span className="text-sm font-semibold">
                          {isPositive ? "+" : ""}{changePercent.toFixed(2)}%
                        </span>
                        <span className="text-xs text-muted-foreground">24h</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <Button
            onClick={() => setIsCreateDialogOpen(true)}
            size="lg"
            data-testid="button-create-option"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Option
          </Button>
        </div>

        {/* Stats Card */}
        <Card data-testid="card-current-price">
          <CardHeader>
            <CardTitle>Index Statistics</CardTitle>
            <CardDescription>
              Current price and index information
            </CardDescription>
          </CardHeader>
          <CardContent>
            {latestPrice ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Current Price</p>
                  <p className="text-2xl font-bold font-mono" data-testid="text-current-price">
                    ${latestPrice.price.toFixed(2)} / t
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">24h Change</p>
                  <div className={`flex items-center gap-1 ${trendColor}`} data-testid="text-price-change">
                    <TrendIcon className="w-4 h-4" />
                    <span className="text-xl font-semibold">
                      {changePercent !== null 
                        ? `${isPositive ? "+" : ""}${changePercent.toFixed(2)}%`
                        : `${isPositive ? "+" : ""}${priceChange.toFixed(2)}`}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Last Updated</p>
                  <p className="text-sm font-medium" data-testid="text-last-updated">
                    {format(new Date(latestPrice.timestamp), "MMM dd, yyyy HH:mm:ss")}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">No price data available</p>
            )}
            <div className="mt-4 pt-4 border-t">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground mb-1">Base Currency</p>
                  <p className="font-medium">USD</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Unit</p>
                  <p className="font-medium">Ton (t)</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Index Type</p>
                  <p className="font-medium">
                    {metadata.type === "export" 
                      ? "Export Index (FOB, no VAT)" 
                      : "Processing Index (with VAT)"}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Price History Chart */}
        {chartData.length > 0 && (
          <Card data-testid="card-price-chart">
            <CardHeader>
              <CardTitle>Price History</CardTitle>
              <CardDescription>
                Historical price trend over time ({chartData.length} data points)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 12 }}
                      className="text-muted-foreground"
                    />
                    <YAxis 
                      domain={[minPrice - padding, maxPrice + padding]}
                      tick={{ fontSize: 12 }}
                      className="text-muted-foreground"
                      tickFormatter={(value) => `$${value.toFixed(2)}`}
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
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="price" 
                      name="Price ($)"
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      dot={{ fill: 'hsl(var(--primary))' }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Price History Table */}
        <Card data-testid="card-price-history">
          <CardHeader>
            <CardTitle>Historical Price Entries</CardTitle>
            <CardDescription>
              All recorded price updates for {indexData.name}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {indexData.priceHistory.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">No price history yet</p>
                <p className="text-sm">Price data will appear here once available</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date & Time</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Change</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {indexData.priceHistory.map((entry) => (
                      <TableRow key={entry.id} data-testid={`row-price-${entry.id}`}>
                        <TableCell data-testid={`text-timestamp-${entry.id}`}>
                          {format(new Date(entry.timestamp), "MMM dd, yyyy HH:mm:ss")}
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium" data-testid={`text-price-${entry.id}`}>
                          ${entry.price.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right" data-testid={`text-delta-${entry.id}`}>
                          {entry.delta !== null ? (
                            <span className={entry.delta > 0 ? "text-green-600 dark:text-green-400" : entry.delta < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}>
                              {entry.delta > 0 ? "+" : ""}{entry.delta.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create Option Dialog */}
        <CreateOptionDialog 
          open={isCreateDialogOpen}
          onOpenChange={setIsCreateDialogOpen}
          onSubmit={async (data) => {
            try {
              await createOptionMutation.mutateAsync(data);
            } catch (error) {
              // Error is already handled by mutation's onError callback
              // This catch prevents unhandled promise rejection and Vite ErrorOverlay issues
              console.error("Create option error:", error);
            }
          }}
          isPending={createOptionMutation.isPending}
          defaultIndexId={indexData.id}
        />
      </div>
    </MainLayout>
  );
}
