import { useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { MainLayout } from "@/components/layouts/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { useIsAdminLevelUser } from "@/hooks/useIsAdminLevelUser";
import { format } from "date-fns";
import { 
  BarChart3, 
  TrendingUp, 
  AlertCircle, 
  DollarSign, 
  FileText,
  Settings,
  MoreVertical,
  Search
} from "lucide-react";
import type { Option } from "@shared/schema";
import { getIndexMetadata } from "@/lib/indexMapping";

interface CommodityIndex {
  id: string;
  name: string;
  slug: string;
  category: string;
  hasVat: boolean;
  isStale?: boolean;
  latestPrice: {
    price: number;
    delta: number | null;
    timestamp: string;
  } | null;
}

interface MarginCall {
  id: string;
  optionId: string;
  userId: string;
  amountRequired: string;
  intrinsicValue: string;
  collateralAmount: string;
  reservedCollateral: string;
  status: string;
  deadline: string | null;
  createdAt: string;
}

export default function Admin() {
  const [, setLocation] = useLocation();
  const isAdminLevelUser = useIsAdminLevelUser();
  const { data: userData, isLoading: isAuthLoading } = useQuery<{
    user: {
      id: string;
      email: string;
      role: string;
    };
  } | null>({
    queryKey: ["/api/auth/me"],
    retry: false,
    enabled: !!localStorage.getItem("cropto_token"),
  });

  // Filters
  const [commodityFilter, setCommodityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [marginCallStatusFilter, setMarginCallStatusFilter] = useState<string>("all");

  // Redirect if not admin-level
  useEffect(() => {
    if (!isAuthLoading && (!userData?.user || !isAdminLevelUser)) {
      setLocation("/");
    }
  }, [isAuthLoading, userData, isAdminLevelUser, setLocation]);

  // Fetch data
  const { data: options = [], isLoading: isLoadingOptions } = useQuery<Option[]>({
    queryKey: ["/api/options"],
    enabled: !!isAdminLevelUser,
  });

  const { data: indexes = [], isLoading: isLoadingIndexes } = useQuery<CommodityIndex[]>({
    queryKey: ["/api/indexes"],
    enabled: !!isAdminLevelUser,
  });

  const { data: marginCalls = [], isLoading: isLoadingMarginCalls } = useQuery<MarginCall[]>({
    queryKey: ["/api/admin/reconciliation/margincalls"],
    enabled: !!isAdminLevelUser,
  });

type FeeType = "matching_fee" | "settlement_fee" | "exercise_fee" | string;
interface FeesSummary {
  totalFees: string;
  byType: Record<FeeType, string>;
  byRole: Record<string, string>;
  platformShare?: string;
  partnerShares?: Array<{ id: string; name: string; feeSharePercent: number; partnerShare: string }>;
}

const { data: feesSummary } = useQuery<FeesSummary>({
  queryKey: ["/api/admin/fees"],
  enabled: !!isAdminLevelUser,
});

  // Calculate overview stats (always computed at top level, never conditionally)
  const overviewStats = useMemo(() => {
    if (!options || options.length === 0) {
      return {
        totalOptions: 0,
        openOptions: 0,
        filledOptions: 0,
        expiredOptions: 0,
        cancelledOptions: 0,
        avgPremium: null as number | null,
        avgStrike: null as number | null,
        // Existing admin metrics
        openMarginCalls: marginCalls.filter((mc) => mc.status === "PENDING").length,
        totalNotional: 0,
        totalLockedCollateral: 0,
      };
    }

    const totalOptions = options.length;
    const openOptions = options.filter(
      (o) => o.status === "OPEN" || o.status === "FILLED"
    ).length;
    const filledOptions = options.filter((o) => o.status === "FILLED").length;
    const expiredOptions = options.filter(
      (o) => o.status === "EXPIRED" || o.status === "EXERCISED"
    ).length;
    const cancelledOptions = options.filter(
      (o) => o.status === "CANCELLED"
    ).length;

    // Our schema uses premium/strike fields directly, not *_amount / *_usd_per_ton
    const premiums = options
      .map((o) => Number(o.premium || 0))
      .filter((v) => Number.isFinite(v));
    const strikes = options
      .map((o) => Number(o.strike || 0))
      .filter((v) => Number.isFinite(v));

    const avgPremium =
      premiums.length > 0
        ? premiums.reduce((s, v) => s + v, 0) / premiums.length
        : null;
    const avgStrike =
      strikes.length > 0
        ? strikes.reduce((s, v) => s + v, 0) / strikes.length
        : null;

    const openMarginCalls = marginCalls.filter(
      (mc) => mc.status === "PENDING"
    ).length;

    const totalNotional = options
      .filter((o) => o.status === "OPEN" || o.status === "FILLED")
      .reduce((sum, o) => {
        const strike = parseFloat(o.strike || "0");
        const qty = parseFloat(o.qty || "0");
        return sum + strike * qty;
      }, 0);

    const totalLockedCollateral = options
      .filter((o) => o.status === "OPEN" || o.status === "FILLED")
      .reduce((sum, o) => {
        return sum + parseFloat(o.collateralAmount || "0");
      }, 0);

    return {
      totalOptions,
      openOptions,
      filledOptions,
      expiredOptions,
      cancelledOptions,
      avgPremium,
      avgStrike,
      openMarginCalls,
      totalNotional,
      totalLockedCollateral,
    };
  }, [options, marginCalls]);

  // Filter options
  const filteredOptions = useMemo(() => {
    let filtered = [...options];

    if (commodityFilter !== "all") {
      filtered = filtered.filter(o => o.commodity === commodityFilter);
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter(o => o.status === statusFilter);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(o => 
        o.id.toLowerCase().includes(query) ||
        o.title?.toLowerCase().includes(query) ||
        o.commodity?.toLowerCase().includes(query) ||
        o.buyerId?.toLowerCase().includes(query) ||
        o.seller?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [options, commodityFilter, statusFilter, searchQuery]);

  // Filter indexes
  const filteredIndexes = useMemo(() => {
    if (commodityFilter === "all") return indexes;
    return indexes.filter(idx => idx.name === commodityFilter || idx.slug === commodityFilter);
  }, [indexes, commodityFilter]);

  // Filter margin calls
  const filteredMarginCalls = useMemo(() => {
    let filtered = [...marginCalls];

    if (marginCallStatusFilter !== "all") {
      filtered = filtered.filter(mc => mc.status === marginCallStatusFilter);
    }

    return filtered;
  }, [marginCalls, marginCallStatusFilter]);

  // Get unique commodities for filter
  const uniqueCommodities = useMemo(() => {
    const commodities = new Set<string>();
    options.forEach(o => {
      if (o.commodity) commodities.add(o.commodity);
    });
    return Array.from(commodities).sort();
  }, [options]);

  // Show loading while checking auth
  if (isAuthLoading || !userData?.user) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </MainLayout>
    );
  }

  // Don't render if not admin (redirect will happen via useEffect)
  if (!isAdminLevelUser) {
    return null;
  }

  // Calculate 24h change for index
  const get24hChange = (index: CommodityIndex): number | null => {
    if (!index.latestPrice || !index.latestPrice.delta || !index.latestPrice.price) return null;
    const price = index.latestPrice.price;
    const delta = index.latestPrice.delta;
    if (price - delta === 0) return null;
    return ((delta / (price - delta)) * 100);
  };

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Admin Monitoring</h1>
          <p className="text-muted-foreground">
            Platform overview, markets, options, and risk monitoring
          </p>
          <div className="mt-3">
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/risk">Open Risk Dashboard</Link>
            </Button>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="markets">Markets</TabsTrigger>
            <TabsTrigger value="options">Options</TabsTrigger>
            <TabsTrigger value="risk">Risk & Margin</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Options</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{overviewStats.totalOptions}</div>
                  <p className="text-xs text-muted-foreground">All options in system</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Open Options</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{overviewStats.openOptions}</div>
                  <p className="text-xs text-muted-foreground">Active positions</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Expired Options</CardTitle>
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{overviewStats.expiredOptions}</div>
                  <p className="text-xs text-muted-foreground">EXPIRED + EXERCISED</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Open Margin Calls</CardTitle>
                  <AlertCircle className="h-4 w-4 text-destructive" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{overviewStats.openMarginCalls}</div>
                  <p className="text-xs text-muted-foreground">Requiring attention</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Notional</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">${overviewStats.totalNotional.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                  <p className="text-xs text-muted-foreground">Open positions value</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Locked Collateral</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{overviewStats.totalLockedCollateral.toLocaleString(undefined, { maximumFractionDigits: 2 })} CROPT</div>
                  <p className="text-xs text-muted-foreground">Reserved for positions</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Markets Tab */}
          <TabsContent value="markets" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Commodity Indexes</CardTitle>
                    <CardDescription>Current index prices and market data</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={commodityFilter} onValueChange={setCommodityFilter}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="All Commodities" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Commodities</SelectItem>
                        {uniqueCommodities.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {isLoadingIndexes ? (
                  <p className="text-center py-8 text-muted-foreground">Loading indexes...</p>
                ) : filteredIndexes.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No indexes found</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Commodity</TableHead>
                          <TableHead>Index Pair</TableHead>
                          <TableHead className="text-right">Last Price ($/t)</TableHead>
                          <TableHead className="text-right">24h Change (%)</TableHead>
                          <TableHead>Last Update</TableHead>
                          <TableHead>Source</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredIndexes.map((index) => {
                          const metadata = getIndexMetadata(index.slug, index.category);
                          const change24h = get24hChange(index);
                          const price = index.latestPrice?.price || 0;
                          
                          return (
                            <TableRow key={index.id}>
                              <TableCell className="font-medium">{index.name}</TableCell>
                              <TableCell>
                                <code className="text-xs bg-muted px-2 py-1 rounded">
                                  {metadata.pairCode}
                                </code>
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                ${price.toFixed(2)}
                              </TableCell>
                              <TableCell className={`text-right font-mono ${change24h !== null && change24h >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {change24h !== null ? `${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%` : '-'}
                              </TableCell>
                              <TableCell className="text-sm">
                                {index.latestPrice?.timestamp 
                                  ? format(new Date(index.latestPrice.timestamp), "MMM dd, yyyy HH:mm")
                                  : '-'}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">
                                  {index.category === "export" ? "Export" : index.category === "processing" ? "Processing" : index.category}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Spot Positions / Market Snapshot</CardTitle>
                <CardDescription>Spot monitoring to be extended</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Comprehensive spot position monitoring and market snapshot will be available in a future update.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Options Tab */}
          <TabsContent value="options" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>All Options</CardTitle>
                <CardDescription>Complete options monitoring and management</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Filters */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>Commodity</Label>
                    <Select value={commodityFilter} onValueChange={setCommodityFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {uniqueCommodities.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="OPEN">Open</SelectItem>
                        <SelectItem value="FILLED">Filled</SelectItem>
                        <SelectItem value="MATCHED">Matched</SelectItem>
                        <SelectItem value="EXERCISED">Exercised</SelectItem>
                        <SelectItem value="EXPIRED">Expired</SelectItem>
                        <SelectItem value="CANCELLED">Cancelled</SelectItem>
                        <SelectItem value="MARGIN_CALL">Margin Call</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Search</Label>
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by ID, title, commodity, owner..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-8"
                      />
                    </div>
                  </div>
                </div>

                {/* Options Table */}
                {isLoadingOptions ? (
                  <p className="text-center py-8 text-muted-foreground">Loading options...</p>
                ) : filteredOptions.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No options found matching filters</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ID</TableHead>
                          <TableHead>Commodity</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Strike ($/t)</TableHead>
                          <TableHead>Qty (t)</TableHead>
                          <TableHead>Premium (CROPT)</TableHead>
                          <TableHead>Notional ($)</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Expiry</TableHead>
                          <TableHead>Owner</TableHead>
                          <TableHead>Admin Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredOptions.map((option) => {
                          const strike = parseFloat(option.strike || "0");
                          const qty = parseFloat(option.qty || "0");
                          const premium = parseFloat(option.premium || "0");
                          const notional = strike * qty;
                          const owner = option.buyerId || option.issuerId || option.seller || "-";

                          return (
                            <TableRow key={option.id}>
                              <TableCell className="font-mono text-xs">{option.id.slice(0, 8)}...</TableCell>
                              <TableCell>{option.commodity || "-"}</TableCell>
                              <TableCell>
                                <Badge variant={option.type === "CALL" ? "default" : "secondary"}>
                                  {option.type}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-mono">${strike.toFixed(2)}</TableCell>
                              <TableCell className="font-mono">{qty.toFixed(2)}</TableCell>
                              <TableCell className="font-mono">{premium.toFixed(2)}</TableCell>
                              <TableCell className="font-mono">${notional.toLocaleString(undefined, { maximumFractionDigits: 0 })}</TableCell>
                              <TableCell>
                                <Badge 
                                  variant={
                                    option.status === "OPEN" || option.status === "FILLED" ? "default" :
                                    option.status === "EXERCISED" ? "secondary" :
                                    "destructive"
                                  }
                                >
                                  {option.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm">
                                {option.expirationDate 
                                  ? format(new Date(option.expirationDate), "MMM dd, yyyy")
                                  : "-"}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground truncate max-w-[120px]">
                                {owner}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  {/* TODO: implement force settle for matched/expired options (admin-only) */}
                                  <Button variant="ghost" size="sm" disabled title="Force settle (coming soon)">
                                    <Settings className="h-4 w-4" />
                                  </Button>
                                  {/* TODO: implement manual status update (e.g. mark as cancelled) */}
                                  <Button variant="ghost" size="sm" disabled title="Change status (coming soon)">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Risk & Margin Tab */}
          <TabsContent value="risk" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Locked Collateral</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {overviewStats.totalLockedCollateral.toLocaleString(undefined, { maximumFractionDigits: 2 })} CROPT
                  </div>
                  <p className="text-xs text-muted-foreground">Reserved for positions</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Margin Calls</CardTitle>
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{marginCalls.length}</div>
                  <p className="text-xs text-muted-foreground">All margin calls</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Options at Risk</CardTitle>
                  <AlertCircle className="h-4 w-4 text-destructive" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{overviewStats.openMarginCalls}</div>
                  <p className="text-xs text-muted-foreground">Pending margin calls</p>
                </CardContent>
              </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Platform Fees</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-2xl font-bold">
                  {feesSummary ? `${parseFloat(feesSummary.totalFees).toFixed(2)} CROPT` : "—"}
                </div>
                <div className="text-xs text-muted-foreground">Grouped by type</div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {feesSummary &&
                    Object.entries(feesSummary.byType || {}).map(([type, amt]) => (
                      <Badge key={type} variant="outline">
                        {type}: {parseFloat(amt).toFixed(2)}
                      </Badge>
                    ))}
                </div>
                <div className="text-xs text-muted-foreground">By role</div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {feesSummary &&
                    Object.entries(feesSummary.byRole || {}).map(([role, amt]) => (
                      <Badge key={role} variant="secondary">
                        {role}: {parseFloat(amt).toFixed(2)}
                      </Badge>
                    ))}
                </div>
                <div className="text-xs text-muted-foreground">Platform vs partners</div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {feesSummary?.platformShare && (
                    <Badge variant="outline">Platform: {parseFloat(feesSummary.platformShare).toFixed(2)}</Badge>
                  )}
                  {feesSummary?.partnerShares &&
                    feesSummary.partnerShares.map((p) => (
                      <Badge key={p.id} variant="secondary">
                        {p.name}: {parseFloat(p.partnerShare).toFixed(2)} ({p.feeSharePercent}%)
                      </Badge>
                    ))}
                </div>
              </CardContent>
            </Card>
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Margin Calls</CardTitle>
                    <CardDescription>Active and resolved margin call monitoring</CardDescription>
                  </div>
                  <Select value={marginCallStatusFilter} onValueChange={setMarginCallStatusFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="PENDING">Active</SelectItem>
                      <SelectItem value="RESOLVED">Resolved</SelectItem>
                      <SelectItem value="LIQUIDATED">Liquidated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {isLoadingMarginCalls ? (
                  <p className="text-center py-8 text-muted-foreground">Loading margin calls...</p>
                ) : filteredMarginCalls.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No margin calls found</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Option ID</TableHead>
                          <TableHead>User</TableHead>
                          <TableHead className="text-right">Required</TableHead>
                          <TableHead className="text-right">Current</TableHead>
                          <TableHead className="text-right">Health (%)</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Deadline</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredMarginCalls.map((mc) => {
                          const required = parseFloat(mc.amountRequired);
                          const current = parseFloat(mc.collateralAmount) + parseFloat(mc.reservedCollateral);
                          const health = required > 0 ? (current / required) * 100 : 100;

                          return (
                            <TableRow key={mc.id}>
                              <TableCell className="font-mono text-xs">{mc.optionId.slice(0, 8)}...</TableCell>
                              <TableCell className="text-sm text-muted-foreground truncate max-w-[120px]">
                                {mc.userId}
                              </TableCell>
                              <TableCell className="text-right font-mono">${required.toFixed(2)}</TableCell>
                              <TableCell className="text-right font-mono">${current.toFixed(2)}</TableCell>
                              <TableCell className={`text-right font-mono ${health < 100 ? 'text-destructive' : 'text-green-600'}`}>
                                {health.toFixed(1)}%
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    mc.status === "PENDING" ? "destructive" :
                                    mc.status === "RESOLVED" ? "secondary" :
                                    "outline"
                                  }
                                >
                                  {mc.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm">
                                {mc.deadline 
                                  ? format(new Date(mc.deadline), "MMM dd, yyyy HH:mm")
                                  : "-"}
                              </TableCell>
                              <TableCell className="text-sm">
                                {format(new Date(mc.createdAt), "MMM dd, yyyy")}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  {/* TODO: implement resolve margin call (admin-only) */}
                                  <Button variant="ghost" size="sm" disabled title="Resolve (coming soon)">
                                    <Settings className="h-4 w-4" />
                                  </Button>
                                  {/* TODO: implement force liquidate (admin-only) */}
                                  <Button variant="ghost" size="sm" disabled title="Force liquidate (coming soon)">
                                    <AlertCircle className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
