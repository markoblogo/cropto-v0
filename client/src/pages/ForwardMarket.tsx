import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MainLayout } from "@/components/layouts/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AVAILABLE_COMMODITIES, COMMODITY_MAP, BASIS_CPT_ODESA, type CommoditySlug } from "@shared/commodities";

interface ForwardOrder {
  id: string;
  userId: string;
  side: "BUY" | "SELL";
  indexId?: string | null;
  commodity?: string | null;
  price: string;
  qtyTon: string;
  window?: string | null;
  status: string;
  windowStart?: string | null;
  windowEnd?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

type GroupKey = string;

interface ForwardContract {
  id: string;
  commodity?: string | null;
  contractPrice: string;
  qtyTon: string;
  window?: string | null;
  windowStart?: string | null;
  windowEnd?: string | null;
  settlementDate?: string | null;
  status: string;
  contractHash?: string | null;
  onchainTxHash?: string | null;
}

interface ForwardSpread {
  id: string;
  spreadType: "CALENDAR" | "CROSS_COMMODITY";
  leg1IndexId?: string | null;
  leg2IndexId?: string | null;
  leg1Window?: string | null;
  leg2Window?: string | null;
  spreadPrice: string;
  baseContractId?: string | null;
  hedgeContractId?: string | null;
  status: string;
}

interface CalendarSpread {
  leg1: {
    commodity: string;
    window: string;
    windowStart: Date | null;
    windowEnd: Date | null;
  };
  leg2: {
    commodity: string;
    window: string;
    windowStart: Date | null;
    windowEnd: Date | null;
  };
  spreadPrice: number;
  contractCount: number;
  lastUpdated: Date;
}

interface CrossCommoditySpread {
  leg1: {
    commodity: string;
    window: string;
    windowStart: Date | null;
    windowEnd: Date | null;
  };
  leg2: {
    commodity: string;
    window: string;
    windowStart: Date | null;
    windowEnd: Date | null;
  };
  spreadPrice: number;
  contractCount: number;
  lastUpdated: Date;
}

interface SpreadsData {
  calendar: CalendarSpread[];
  crossCommodity: CrossCommoditySpread[];
}

export default function ForwardMarket() {
  const [commodityFilter, setCommodityFilter] = useState<string>("ALL");
  const [windowFilter, setWindowFilter] = useState<string>("ALL");
  const [orderSide, setOrderSide] = useState<"BUY" | "SELL">("BUY");
  const [orderCommodity, setOrderCommodity] = useState<string>("");
  const [orderWindow, setOrderWindow] = useState<string>("");
  const [orderPrice, setOrderPrice] = useState<string>("");
  const [orderQty, setOrderQty] = useState<string>("");

  useEffect(() => {
    if (!orderCommodity && AVAILABLE_COMMODITIES.length > 0) {
      setOrderCommodity(AVAILABLE_COMMODITIES[0].slug);
    }
  }, []);

  const { data: orders = [], isLoading, error } = useQuery<ForwardOrder[]>({
    queryKey: ["/api/forward/orders", { status: "OPEN" }],
    queryFn: async () => {
      const resp = await apiRequest("GET", "/api/forward/orders?status=OPEN");
      return resp.json();
    },
    refetchInterval: 15000,
  });

  const createOrder = useMutation({
    mutationFn: async () => {
      const payload = {
        side: orderSide,
        indexId: orderCommodity, // assuming slug maps to indexId on backend; if not, backend validates
        commodity: orderCommodity,
        price: parseFloat(orderPrice),
        qtyTon: parseFloat(orderQty),
        window: orderWindow || undefined,
      };
      const resp = await apiRequest("POST", "/api/forward/orders", payload);
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || "Failed to create order");
      }
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forward/orders"] });
      setOrderPrice("");
      setOrderQty("");
    },
  });

  const windows = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) => {
      if (o.window) set.add(o.window);
    });
    return Array.from(set).sort();
  }, [orders]);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (o.status !== "OPEN") return false;
      if (commodityFilter !== "ALL" && o.commodity !== commodityFilter) return false;
      if (windowFilter !== "ALL" && o.window !== windowFilter) return false;
      return true;
    });
  }, [orders, commodityFilter, windowFilter]);

  const grouped = useMemo(() => {
    const map = new Map<GroupKey, { commodity: string; window: string; bids: ForwardOrder[]; asks: ForwardOrder[] }>();
    filtered.forEach((o) => {
      const key = `${o.commodity || "unknown"}|${o.window || "TBD"}`;
      if (!map.has(key)) {
        map.set(key, { commodity: o.commodity || "unknown", window: o.window || "TBD", bids: [], asks: [] });
      }
      const g = map.get(key)!;
      if (o.side === "BUY") g.bids.push(o);
      else g.asks.push(o);
    });
    map.forEach((g) => {
      g.bids.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
      g.asks.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
    });
    return Array.from(map.values());
  }, [filtered]);

  const fillFromBest = (side: "BUY" | "SELL", orders: ForwardOrder[]) => {
    if (!orders.length) return;
    const best = orders[0];
    // If user clicks best bid, default to SELL at that price; if best ask, BUY at that price
    setOrderSide(side === "BUY" ? "SELL" : "BUY");
    setOrderCommodity(best.commodity || "");
    setOrderWindow(best.window || "");
    setOrderPrice(best.price);
    setOrderQty(best.qtyTon);
  };

  const selectedCommodity = orderCommodity && COMMODITY_MAP[orderCommodity as CommoditySlug];

  // Forward contracts (soft proof)
  const { data: contracts = [], isLoading: contractsLoading } = useQuery<ForwardContract[]>({
    queryKey: ["/api/forward/contracts"],
    queryFn: async () => {
      const resp = await apiRequest("GET", "/api/forward/contracts");
      return resp.json();
    },
    refetchInterval: 30000,
  });

  // Forward spreads (analytics)
  const { data: spreadsData } = useQuery<SpreadsData>({
    queryKey: ["/api/forward/spreads"],
    queryFn: async () => {
      const resp = await apiRequest("GET", "/api/forward/spreads");
      return resp.json();
    },
    refetchInterval: 30000,
  });

  const calendarSpreads = useMemo(
    () => spreadsData?.calendar || [],
    [spreadsData]
  );
  const crossSpreads = useMemo(
    () => spreadsData?.crossCommodity || [],
    [spreadsData]
  );

  // Forward curve data from grouped mid prices for selected commodity (or all if "ALL")
  const curvePoints = useMemo(() => {
    const byCommodity = grouped.filter((g) => commodityFilter === "ALL" || g.commodity === commodityFilter);
    return byCommodity
      .map((g) => {
        const bestBid = g.bids[0] ? parseFloat(g.bids[0].price) : null;
        const bestAsk = g.asks[0] ? parseFloat(g.asks[0].price) : null;
        const mid = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;
        return {
          x: g.window,
          y: mid,
        };
      })
      .filter((p) => p.y !== null) as { x: string; y: number }[];
  }, [grouped, commodityFilter]);

  const curveChartData = useMemo(() => {
    return curvePoints.map((p) => ({
      label: p.x,
      value: p.y,
    }));
  }, [curvePoints]);

  return (
    <MainLayout>
      <div className="space-y-6 max-w-6xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold">Forward Market</h1>
          <p className="text-muted-foreground">
            Browse forward orders by commodity and delivery window. Click best bid/ask to prefill an order.
          </p>
          {selectedCommodity && (
            <div className="text-sm text-muted-foreground mt-2">
              Index: {selectedCommodity.indexName} · Basis: {BASIS_CPT_ODESA}
            </div>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Select commodity and window</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Commodity</Label>
              <Select value={commodityFilter} onValueChange={setCommodityFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All commodities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All</SelectItem>
                  {AVAILABLE_COMMODITIES.map((c) => (
                    <SelectItem key={c.slug} value={c.slug}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Window</Label>
              <Select value={windowFilter} onValueChange={setWindowFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All windows" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All</SelectItem>
                  {windows.map((w) => (
                    <SelectItem key={w} value={w}>
                      {w}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Order Book</CardTitle>
            <CardDescription>Aggregated by commodity and window (open orders only)</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : error ? (
              <Alert variant="destructive" className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>Failed to load orders</AlertDescription>
              </Alert>
            ) : grouped.length === 0 ? (
              <p className="text-muted-foreground">No open forward orders.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Commodity</TableHead>
                    <TableHead>Window</TableHead>
                    <TableHead>Bids (BUY)</TableHead>
                    <TableHead>Asks (SELL)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grouped.map((g) => {
                    const bestBid = g.bids[0];
                    const bestAsk = g.asks[0];
                    const totalBidQty = g.bids.reduce((s, o) => s + parseFloat(o.qtyTon), 0);
                    const totalAskQty = g.asks.reduce((s, o) => s + parseFloat(o.qtyTon), 0);
                    const bestBidPrice = bestBid ? parseFloat(bestBid.price) : null;
                    const bestAskPrice = bestAsk ? parseFloat(bestAsk.price) : null;
                    const mid = bestBidPrice !== null && bestAskPrice !== null ? (bestBidPrice + bestAskPrice) / 2 : null;
                    // mid computed locally
                    return (
                      <TableRow key={`${g.commodity}-${g.window}`}>
                        <TableCell>
                          <div className="font-medium">{COMMODITY_MAP[g.commodity as CommoditySlug]?.name || g.commodity}</div>
                          <div className="text-xs text-muted-foreground">
                            {COMMODITY_MAP[g.commodity as CommoditySlug]?.indexName || "Index"} · {BASIS_CPT_ODESA}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{g.window}</TableCell>
                        <TableCell>
                          {bestBid ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-semibold">
                                  {bestBidPrice?.toFixed(2)} CROPT/t
                                </span>
                                <Badge variant="secondary" className="cursor-pointer" onClick={() => fillFromBest("BUY", g.bids)}>
                                  Best bid
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Vol: {totalBidQty.toFixed(2)} t · Orders: {g.bids.length}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">No bids</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {bestAsk ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-semibold">
                                  {bestAskPrice?.toFixed(2)} CROPT/t
                                </span>
                                <Badge variant="outline" className="cursor-pointer" onClick={() => fillFromBest("SELL", g.asks)}>
                                  Best ask
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Vol: {totalAskQty.toFixed(2)} t · Orders: {g.asks.length}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">No asks</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Create Forward Order</CardTitle>
            <CardDescription>Use a best bid/ask to prefill or set your own terms</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Tabs value={orderSide} onValueChange={(v) => setOrderSide(v as "BUY" | "SELL")}>
              <TabsList>
                <TabsTrigger value="BUY">Buy (Bid)</TabsTrigger>
                <TabsTrigger value="SELL">Sell (Ask)</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Commodity</Label>
                <Select value={orderCommodity} onValueChange={setOrderCommodity}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select commodity" />
                  </SelectTrigger>
                  <SelectContent>
                    {AVAILABLE_COMMODITIES.map((c) => (
                      <SelectItem key={c.slug} value={c.slug}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Window</Label>
                <Input
                  placeholder="e.g., 1H Dec 2025"
                  value={orderWindow}
                  onChange={(e) => setOrderWindow(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Price (CROPT per ton)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={orderPrice}
                  onChange={(e) => setOrderPrice(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Quantity (tons)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={orderQty}
                  onChange={(e) => setOrderQty(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => createOrder.mutate()} disabled={createOrder.isPending}>
                {createOrder.isPending ? "Submitting..." : "Submit Order"}
              </Button>
              {createOrder.isError && (
                <p className="text-destructive text-sm">{(createOrder.error as Error)?.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Forward Contracts (soft proof)</CardTitle>
            <CardDescription>Contract hash is a soft audit proof; not cryptographic.</CardDescription>
          </CardHeader>
          <CardContent>
            {contractsLoading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : contracts.length === 0 ? (
              <p className="text-muted-foreground">No contracts yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Price / Qty</TableHead>
                    <TableHead>Window</TableHead>
                    <TableHead>Contract hash</TableHead>
                    <TableHead>Proof</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contracts.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{c.id}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{c.status}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {parseFloat(c.contractPrice).toFixed(2)} CROPT/t · {parseFloat(c.qtyTon).toFixed(2)} t
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{c.window || "TBD"}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {c.contractHash ? `${c.contractHash.slice(0, 10)}…` : "—"}
                      </TableCell>
                      <TableCell>
                        {c.onchainTxHash ? (
                          <Button
                            variant="ghost"
                            className="px-0"
                            asChild
                          >
                            <a
                              href={`https://amoy.polygonscan.com/tx/${c.onchainTxHash}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              View on chain
                            </a>
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-xs">No on-chain record</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Analytics: Spreads</CardTitle>
            <CardDescription>Real-time calendar and cross-commodity spreads calculated from active forward contracts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs defaultValue="calendar">
              <TabsList>
                <TabsTrigger value="calendar">Calendar</TabsTrigger>
                <TabsTrigger value="cross">Cross-commodity</TabsTrigger>
              </TabsList>
              <TabsContent value="calendar">
                {calendarSpreads.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No calendar spreads available.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Commodity</TableHead>
                        <TableHead>Leg 1 Window</TableHead>
                        <TableHead>Leg 2 Window</TableHead>
                        <TableHead>Spread Price</TableHead>
                        <TableHead>Contracts</TableHead>
                        <TableHead>Last Updated</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {calendarSpreads.map((s, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{s.leg1.commodity}</TableCell>
                          <TableCell>{s.leg1.window}</TableCell>
                          <TableCell>{s.leg2.window}</TableCell>
                          <TableCell className="font-mono">
                            <span className={s.spreadPrice >= 0 ? "text-green-600" : "text-red-600"}>
                              {s.spreadPrice >= 0 ? "+" : ""}{s.spreadPrice.toFixed(2)}
                            </span> CROPT/t
                          </TableCell>
                          <TableCell>{s.contractCount}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(s.lastUpdated).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
              <TabsContent value="cross">
                {crossSpreads.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No cross-commodity spreads available.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Window</TableHead>
                        <TableHead>Leg 1 Commodity</TableHead>
                        <TableHead>Leg 2 Commodity</TableHead>
                        <TableHead>Spread Price</TableHead>
                        <TableHead>Contracts</TableHead>
                        <TableHead>Last Updated</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {crossSpreads.map((s, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{s.leg1.window}</TableCell>
                          <TableCell>{s.leg1.commodity}</TableCell>
                          <TableCell>{s.leg2.commodity}</TableCell>
                          <TableCell className="font-mono">
                            <span className={s.spreadPrice >= 0 ? "text-green-600" : "text-red-600"}>
                              {s.spreadPrice >= 0 ? "+" : ""}{s.spreadPrice.toFixed(2)}
                            </span> CROPT/t
                          </TableCell>
                          <TableCell>{s.contractCount}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(s.lastUpdated).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {curvePoints.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Forward Curve</CardTitle>
              <CardDescription>Mid prices per window</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2 text-sm">
                {curveChartData.map((p) => (
                  <div key={p.label} className="flex items-center gap-2">
                    <span className="w-28 text-muted-foreground">{p.label}</span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary"
                        style={{
                          width: `${Math.min(100, Math.max(5, (p.value || 0) / (curveChartData[0]?.value || 1) * 100))}%`,
                        }}
                      />
                    </div>
                    <span className="font-mono">{p.value?.toFixed(2)} CROPT/t</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}
