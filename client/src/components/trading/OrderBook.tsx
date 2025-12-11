import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useSpotOrderBook } from "@/hooks/useSpotOrderBook";
import { useOptionsOrderBook } from "@/hooks/useOptionsOrderBook";

type OrderBookProps = {
  title?: string;
  commodity: string;
  window?: string;
  mode: "spot" | "options";
  depth?: number;
};

export function OrderBook({ title = "Order Book", commodity, window, mode, depth = 5 }: OrderBookProps) {
  const query =
    mode === "spot"
      ? useSpotOrderBook({ commodity, window, depth })
      : useOptionsOrderBook({ commodity, window, depth });

  const { data, isLoading, error, refetch, isFetching } = query;

  const loading = isLoading || isFetching;
  // Ensure proper sorting on the client so that best prices are on top (bids descending, asks ascending).
  const bids = (data?.bids || []).slice().sort((a, b) => b.price - a.price);
  const asks = (data?.asks || []).slice().sort((a, b) => a.price - b.price);

  // Mid and spread (only when both sides exist). Spread % = (ask - bid) / mid * 100.
  const bestBid = bids[0]?.price;
  const bestAsk = asks[0]?.price;
  const mid = bestBid !== undefined && bestAsk !== undefined ? (bestBid + bestAsk) / 2 : undefined;
  const spreadPct =
    mid && bestBid !== undefined && bestAsk !== undefined ? ((bestAsk - bestBid) / mid) * 100 : undefined;

  return (
    <Card className="border border-muted-foreground/10 shadow-sm">
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="text-lg">{title}</CardTitle>
        {data?.windowLabel && <span className="text-xs text-muted-foreground">{data.windowLabel}</span>}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : error ? (
          <div className="space-y-2">
            <Alert variant="destructive">
              <AlertDescription>Failed to load order book.</AlertDescription>
            </Alert>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : bids.length === 0 && asks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active orders yet.</p>
        ) : (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground flex items-center gap-3">
              <span>
                Mid:{" "}
                {mid !== undefined ? mid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
              </span>
              <span>
                Spread:{" "}
                {spreadPct !== undefined
                  ? `${spreadPct.toFixed(2)}%`
                  : "—"}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <OrderBookSide title="Bids" rows={bids} highlight="green" />
              <OrderBookSide title="Asks" rows={asks} highlight="red" />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OrderBookSide({
  title,
  rows,
  highlight,
}: {
  title: string;
  rows: { price: number; quantity: number; type?: string }[];
  highlight: "green" | "red";
}) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground mb-2">{title}</div>
      <div className="text-[11px] text-muted-foreground mb-1 flex justify-between">
        <span>Price ($/t)</span>
        <span>Qty (t)</span>
      </div>
      <div className="space-y-2">
        {rows.map((row, idx) => {
          const priceFormatted = row.price.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
          return (
            <div
              key={`${title}-${idx}-${row.price}`}
              className="flex items-center justify-between rounded border border-border px-2 py-1 text-sm"
            >
              <span className="flex items-center gap-2">
                <span className={highlight === "green" ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}>
                  {priceFormatted}
                </span>
                {row.type && (
                  <span className="text-[11px] px-2 py-0.5 rounded bg-muted text-muted-foreground border">
                    {row.type}
                  </span>
                )}
              </span>
              <span className="text-muted-foreground">{row.quantity.toLocaleString()}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

