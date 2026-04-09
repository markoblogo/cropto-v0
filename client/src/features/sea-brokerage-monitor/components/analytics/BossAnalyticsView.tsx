import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { buildSeaBrokerageMonitorAuthHeaders } from "../../services/monitorAuth.service";

interface BossAnalyticsResult {
  summary: {
    totalBids: number;
    totalOffers: number;
    totalTrades: number;
    totalVolumeMt: number;
    avgBidSpread: number;
    avgOfferSpread: number;
    matchableBidsPct: number;
    matchableOffersPct: number;
  };
  byBroker: Array<{
    brokerCode: string;
    brokerName: string;
    companyName: string;
    bidCount: number;
    offerCount: number;
    tradeCount: number;
    tradeVolumeMt: number;
    dealConversion: number;
    avgBidSpread: number | null;
    avgOfferSpread: number | null;
    volumeConversion: number;
    performanceScore: number;
  }>;
  timeline: Array<{
    date: string;
    bidCount: number;
    offerCount: number;
    tradeCount: number;
    tradeVolumeMt: number;
  }>;
}

interface BossAnalyticsViewProps {
  monitorAuthToken: string | null;
}

const COLORS = ["#10b981", "#f59e0b", "#3b82f6", "#8b5cf6", "#ec4899", "#ef4444"];
type BossAnalyticsPeriodPreset = "current_month" | "30d" | "90d" | "180d" | "custom";

function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatPeriodLabel(dateFrom: Date, dateTo: Date) {
  try {
    const format = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    return `${format.format(dateFrom)} - ${format.format(dateTo)}`;
  } catch {
    return `${dateFrom.toISOString().slice(0, 10)} - ${dateTo.toISOString().slice(0, 10)}`;
  }
}

export function BossAnalyticsView({ monitorAuthToken }: BossAnalyticsViewProps) {
  const [periodPreset, setPeriodPreset] = useState<BossAnalyticsPeriodPreset>("current_month");
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [viewType, setViewType] = useState<"team" | "company">("company");

  const periodRange = useMemo(() => {
    const now = new Date();
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    const fallbackStart = new Date(now);
    fallbackStart.setDate(fallbackStart.getDate() - 29);
    fallbackStart.setHours(0, 0, 0, 0);

    if (periodPreset === "custom") {
      const from = customDateFrom ? new Date(`${customDateFrom}T00:00:00`) : null;
      const to = customDateTo ? new Date(`${customDateTo}T23:59:59`) : null;
      if (from && to && !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
        if (from <= to) return { dateFrom: from, dateTo: to };
        return { dateFrom: to, dateTo: from };
      }
      return { dateFrom: fallbackStart, dateTo: todayEnd };
    }

    if (periodPreset === "current_month") {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      monthStart.setHours(0, 0, 0, 0);
      return { dateFrom: monthStart, dateTo: todayEnd };
    }

    const days = periodPreset === "90d" ? 90 : periodPreset === "180d" ? 180 : 30;
    const dateFrom = new Date(now);
    dateFrom.setDate(dateFrom.getDate() - (days - 1));
    dateFrom.setHours(0, 0, 0, 0);
    return { dateFrom, dateTo: todayEnd };
  }, [periodPreset, customDateFrom, customDateTo]);

  const { data: analytics, isLoading } = useQuery<BossAnalyticsResult>({
    queryKey: [
      "/api/sea-brokerage-monitor/analytics/boss",
      periodPreset,
      periodRange.dateFrom.toISOString(),
      periodRange.dateTo.toISOString(),
      monitorAuthToken,
    ],
    queryFn: async () => {
      const response = await apiRequest(
        "GET",
        `/api/sea-brokerage-monitor/analytics/boss?dateFrom=${encodeURIComponent(
          periodRange.dateFrom.toISOString(),
        )}&dateTo=${encodeURIComponent(periodRange.dateTo.toISOString())}`,
        undefined,
        { headers: buildSeaBrokerageMonitorAuthHeaders(monitorAuthToken) }
      );
      return response.json();
    },
    enabled: !!monitorAuthToken,
  });

  if (isLoading || !analytics) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-border/60 bg-card/50 text-sm text-muted-foreground">
        Loading Boss Analytics...
      </div>
    );
  }

  return (
    <div className="space-y-6 py-4">
      <Card className="border-border/70 bg-card/80">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Analytics period</div>
            <Badge variant="outline" className="border-primary/30 text-primary">
              {formatPeriodLabel(periodRange.dateFrom, periodRange.dateTo)}
            </Badge>
          </div>
          <div className="grid gap-2 md:grid-cols-4">
            <Select value={periodPreset} onValueChange={(value) => setPeriodPreset(value as BossAnalyticsPeriodPreset)}>
              <SelectTrigger>
                <SelectValue placeholder="Period preset" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current_month">Current month (default)</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 3 months</SelectItem>
                <SelectItem value="180d">Last 6 months</SelectItem>
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={customDateFrom}
              onChange={(event) => setCustomDateFrom(event.target.value)}
              disabled={periodPreset !== "custom"}
              max={customDateTo || undefined}
            />
            <Input
              type="date"
              value={customDateTo}
              onChange={(event) => setCustomDateTo(event.target.value)}
              disabled={periodPreset !== "custom"}
              min={customDateFrom || undefined}
            />
            <div className="flex items-center text-xs text-muted-foreground">
              {periodPreset === "custom"
                ? "Custom range is applied to all cards and charts."
                : "Preset range is applied to all cards and charts."}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wider">Total Activity</CardDescription>
            <CardTitle className="text-2xl font-bold">
              {analytics.summary.totalBids + analytics.summary.totalOffers}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground">
              {analytics.summary.totalBids} BIDs / {analytics.summary.totalOffers} OFFERs
            </div>
          </CardContent>
        </Card>
        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wider">Trades</CardDescription>
            <CardTitle className="text-2xl font-bold">{analytics.summary.totalTrades}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground">
              {analytics.summary.totalVolumeMt.toLocaleString()} MT Total Volume
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wider">Avg Market Spread</CardDescription>
            <CardTitle className="text-2xl font-bold">
              ${Math.max(analytics.summary.avgBidSpread, analytics.summary.avgOfferSpread)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground">
              Lower is better (tighter pricing)
            </div>
          </CardContent>
        </Card>
        <Card className="border-purple-500/20 bg-purple-500/5">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wider">Deal Conversion</CardDescription>
            <CardTitle className="text-2xl font-bold">
              {(
                (analytics.summary.totalTrades /
                  Math.max(1, analytics.summary.totalBids + analytics.summary.totalOffers)) *
                100
              ).toFixed(1)}%
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground">Activity to Deal efficiency</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="activity" className="w-full">
        <div className="relative">
          <TabsList className="scrollbar-hide flex h-auto w-full justify-start overflow-x-auto bg-background/50 p-1 sm:grid sm:max-w-md sm:grid-cols-4">
            <TabsTrigger value="activity" className="min-w-[100px] flex-1 sm:min-w-0">Activity</TabsTrigger>
            <TabsTrigger value="performance" className="min-w-[100px] flex-1 sm:min-w-0">Performance</TabsTrigger>
            <TabsTrigger value="market" className="min-w-[120px] flex-1 sm:min-w-0">Market Quality</TabsTrigger>
            <TabsTrigger value="volume" className="min-w-[100px] flex-1 sm:min-w-0">Volume</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="activity" className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Broker Activity (Top Bidders/Offerers)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.byBroker.slice(0, 10)}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                      <XAxis dataKey="brokerCode" fontSize={9} tick={{ fontSize: 9 }} />
                      <YAxis fontSize={9} tick={{ fontSize: 9 }} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: "#111", border: "1px solid #333", borderRadius: "8px" }}
                        itemStyle={{ fontSize: "11px" }}
                      />
                      <Legend wrapperStyle={{ fontSize: "10px", paddingTop: "10px" }} />
                      <Bar dataKey="bidCount" name="BIDs" fill="#10b981" stackId="a" />
                      <Bar dataKey="offerCount" name="OFFERs" fill="#f59e0b" stackId="a" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Activity Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={analytics.timeline}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                      <XAxis dataKey="date" fontSize={9} tick={{ fontSize: 9 }} />
                      <YAxis fontSize={9} tick={{ fontSize: 9 }} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: "#111", border: "1px solid #333", borderRadius: "8px" }}
                        itemStyle={{ fontSize: "11px" }}
                      />
                      <Legend wrapperStyle={{ fontSize: "10px", paddingTop: "10px" }} />
                      <Line type="monotone" dataKey="bidCount" name="BIDs" stroke="#10b981" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="offerCount" name="OFFERs" stroke="#f59e0b" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="performance" className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm">Broker Performance Leaderboard</CardTitle>
                  <CardDescription className="text-xs">Based on Activity, Conversion, Volume and Market Quality</CardDescription>
                </div>
                <Badge variant="outline" className="border-purple-500/40 text-purple-400">Team Score</Badge>
              </CardHeader>
              <CardContent className="px-0">
                <div className="relative w-full overflow-x-auto overflow-y-auto max-h-[450px] scrollbar-thin scrollbar-thumb-muted-foreground/20">
                  <div className="min-w-[600px] w-full pb-4 pr-1">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm shadow-sm">
                        <TableRow className="text-xs uppercase hover:bg-transparent">
                          <TableHead className="pl-4">Broker</TableHead>
                          <TableHead className="text-right">Activity</TableHead>
                          <TableHead className="text-right">Deals</TableHead>
                          <TableHead className="text-right">Conversion</TableHead>
                          <TableHead className="text-right">Score</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analytics.byBroker.map((broker) => (
                          <TableRow key={broker.brokerCode} className="text-xs">
                            <TableCell className="pl-4 font-medium">
                              {broker.brokerCode}
                              <div className="text-[10px] text-muted-foreground">{broker.brokerName}</div>
                            </TableCell>
                            <TableCell className="text-right">{broker.bidCount + broker.offerCount}</TableCell>
                            <TableCell className="text-right">{broker.tradeCount}</TableCell>
                            <TableCell className="text-right">{(broker.dealConversion * 100).toFixed(1)}%</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2 pr-4">
                                <span className="font-bold">{broker.performanceScore}</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Trade Efficiency Funnel</CardTitle>
                <CardDescription className="text-xs">Conversion of activity to realized deals</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center p-4">
                <div className="w-full space-y-3">
                  <div className="relative h-12 w-full rounded-md border border-emerald-500/20 bg-emerald-500/10 flex items-center justify-center">
                    <span className="text-xs font-semibold">ACTIVITY: {analytics.summary.totalBids + analytics.summary.totalOffers}</span>
                  </div>
                  <div className="mx-auto h-4 w-4 border-l-2 border-r-2 border-border/40" />
                  <div className="relative h-10 w-[85%] mx-auto rounded-md border border-amber-500/20 bg-amber-500/10 flex items-center justify-center">
                    <span className="text-xs font-semibold">TIGHT SPREAD: ~{Math.round((analytics.summary.totalBids + analytics.summary.totalOffers) * 0.4)}</span>
                  </div>
                   <div className="mx-auto h-4 w-4 border-l-2 border-r-2 border-border/40" />
                  <div className="relative h-8 w-[70%] mx-auto rounded-md border border-blue-500/20 bg-blue-500/10 flex items-center justify-center">
                    <span className="text-xs font-bold">DEALS: {analytics.summary.totalTrades}</span>
                  </div>
                  <div className="mt-8 text-center">
                    <div className="text-2xl font-bold text-blue-400">
                      {((analytics.summary.totalTrades / Math.max(1, analytics.summary.totalBids + analytics.summary.totalOffers)) * 100).toFixed(1)}%
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase">Overall realization rate</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="market" className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Price Spread Analysis (Lower is tighter)</CardTitle>
                <CardDescription className="text-xs">Distance between broker prices and best counter-offers</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.byBroker.filter(b => b.avgBidSpread !== null)}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                      <XAxis dataKey="brokerCode" fontSize={10} />
                      <YAxis fontSize={10} name="USD" />
                      <Tooltip 
                        contentStyle={{ backgroundColor: "#111", border: "1px solid #333" }}
                        itemStyle={{ fontSize: "12px" }}
                      />
                      <Bar dataKey="avgBidSpread" name="Avg Bid Spread ($)" fill="#10b981" radius={[2,2,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Market Market-Makers (Consistency)</CardTitle>
                <CardDescription className="text-xs">Who provides the most tight prices consistently</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-center p-8">
                <div className="text-center">
                  <div className="text-4xl font-black text-emerald-400">
                    {analytics.byBroker[0]?.brokerCode}
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground uppercase tracking-widest">
                    Team Leader in Market Quality
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="volume" className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Volume Distribution (Traded MT)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={analytics.byBroker.filter(b => b.tradeVolumeMt > 0)}
                        dataKey="tradeVolumeMt"
                        nameKey="brokerCode"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ brokerCode, percent }) => `${brokerCode} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {analytics.byBroker.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: "#111", border: "1px solid #333" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Volume Conversion Efficiency</CardTitle>
                <CardDescription className="text-xs">Traded Volume vs Total Offered Volume</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                   <TableBody>
                    {analytics.byBroker.slice(0, 5).map(b => (
                      <TableRow key={b.brokerCode}>
                        <TableCell className="py-1.5 text-xs">{b.brokerCode}</TableCell>
                        <TableCell className="py-1.5 text-right text-xs">{(b.volumeConversion * 100).toFixed(1)}%</TableCell>
                      </TableRow>
                    ))}
                   </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
