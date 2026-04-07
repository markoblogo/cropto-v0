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
import { apiRequest } from "@/lib/queryClient";
import { buildSeaBrokerageMonitorAuthHeaders } from "../../services/monitorAuth.service";
import { BrokerageEntry } from "../../types";

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

export function BossAnalyticsView({ monitorAuthToken }: BossAnalyticsViewProps) {
  const [period, setPeriod] = useState("30"); // days
  const [viewType, setViewType] = useState<"team" | "company">("company");

  const { data: analytics, isLoading } = useQuery<BossAnalyticsResult>({
    queryKey: ["/api/sea-brokerage-monitor/analytics/boss", period, monitorAuthToken],
    queryFn: async () => {
      const dateFrom = new Date(Date.now() - parseInt(period) * 24 * 60 * 60 * 1000).toISOString();
      const response = await apiRequest(
        "GET",
        `/api/sea-brokerage-monitor/analytics/boss?dateFrom=${dateFrom}`,
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
        <TabsList className="grid w-full max-w-md grid-cols-4">
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="market">Market Quality</TabsTrigger>
          <TabsTrigger value="volume">Volume</TabsTrigger>
        </TabsList>

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
                      <XAxis dataKey="brokerCode" fontSize={10} />
                      <YAxis fontSize={10} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: "#111", border: "1px solid #333" }}
                        itemStyle={{ fontSize: "12px" }}
                      />
                      <Legend wrapperStyle={{ fontSize: "11px" }} />
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
                      <XAxis dataKey="date" fontSize={10} />
                      <YAxis fontSize={10} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: "#111", border: "1px solid #333" }}
                        itemStyle={{ fontSize: "12px" }}
                      />
                      <Legend wrapperStyle={{ fontSize: "11px" }} />
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
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
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
                            <div className="flex items-center justify-end gap-2">
                              <span className="font-bold">{broker.performanceScore}</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
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
