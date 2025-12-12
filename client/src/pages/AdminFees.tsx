import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MainLayout } from "@/components/layouts/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest } from "@/lib/queryClient";
import { DollarSign, TrendingUp, Layers, AlertTriangle } from "lucide-react";
import { Link } from "wouter";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { format } from "date-fns";

type RevenueResponse = {
  totalFees: number;
  byInstrument: { OPTION: number; FORWARD: number };
  byType: Record<string, number>;
  byRole: Record<string, number>;
  period: { from: string; to: string };
  series?: Array<{ date: string; totalFees: number; byInstrument: { OPTION: number; FORWARD: number } }>;
  platformShare?: number;
  partnerShares?: Array<{ id: string; name: string; feeSharePercent: number; partnerShare: number }>;
};

function toNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function money(v: unknown) {
  const n = toNumber(v);
  if (n === null) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function normalizeFeesPayload(raw: any): RevenueResponse {
  const now = new Date();
  const defaultTo = now.toISOString();
  const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const totalFees = toNumber(raw?.totalFees) ?? 0;
  const byType: Record<string, number> = Object.fromEntries(
    Object.entries(raw?.byType || {}).map(([k, v]) => [k, toNumber(v) ?? 0]),
  );
  const byRole: Record<string, number> = Object.fromEntries(
    Object.entries(raw?.byRole || {}).map(([k, v]) => [k, toNumber(v) ?? 0]),
  );

  const legacyByInstrument = raw?.byInstrument || {};
  const optionFees = toNumber(legacyByInstrument?.OPTION) ?? 0;
  const forwardFees = toNumber(legacyByInstrument?.FORWARD) ?? 0;

  const byInstrument = {
    OPTION: toNumber(raw?.byInstrument?.OPTION) ?? optionFees,
    FORWARD: toNumber(raw?.byInstrument?.FORWARD) ?? forwardFees,
  };

  const seriesRaw = Array.isArray(raw?.series) ? raw.series : [];
  const series = seriesRaw
    .map((p: any) => ({
      date: String(p?.date || ""),
      totalFees: toNumber(p?.totalFees) ?? 0,
      byInstrument: {
        OPTION: toNumber(p?.byInstrument?.OPTION) ?? 0,
        FORWARD: toNumber(p?.byInstrument?.FORWARD) ?? 0,
      },
    }))
    .filter((p: any) => p.date);

  const period = {
    from: String(raw?.period?.from || defaultFrom),
    to: String(raw?.period?.to || defaultTo),
  };

  return {
    totalFees,
    byInstrument,
    byType,
    byRole,
    period,
    series,
    platformShare: toNumber(raw?.platformShare) ?? undefined,
    partnerShares: Array.isArray(raw?.partnerShares)
      ? raw.partnerShares.map((p: any) => ({
          id: String(p?.id || ""),
          name: String(p?.name || ""),
          feeSharePercent: toNumber(p?.feeSharePercent) ?? 0,
          partnerShare: toNumber(p?.partnerShare) ?? 0,
        }))
      : undefined,
  };
}

export default function AdminFees() {
  const { data, isLoading, error } = useQuery<RevenueResponse>({
    queryKey: ["/api/admin/fees"],
    queryFn: async () => {
      const resp = await apiRequest("GET", "/api/admin/fees");
      const raw = await resp.json();
      return normalizeFeesPayload(raw);
    },
  });

  const periodLabel = useMemo(() => {
    if (!data?.period) return null;
    try {
      const from = new Date(data.period.from);
      const to = new Date(data.period.to);
      return `${format(from, "MMM dd")}-${format(to, "MMM dd, yyyy")}`;
    } catch {
      return null;
    }
  }, [data?.period]);

  const series = data?.series || [];
  const chartData = useMemo(() => {
    return series.map((p) => ({
      date: p.date,
      totalFees: p.totalFees,
      optionFees: p.byInstrument.OPTION,
      forwardFees: p.byInstrument.FORWARD,
    }));
  }, [series]);

  const typeRows = useMemo(() => {
    const entries = Object.entries(data?.byType || {});
    entries.sort((a, b) => b[1] - a[1]);
    return entries;
  }, [data?.byType]);

  const roleRows = useMemo(() => {
    const entries = Object.entries(data?.byRole || {});
    entries.sort((a, b) => b[1] - a[1]);
    return entries;
  }, [data?.byRole]);

  if (isLoading) {
    return (
      <MainLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-72" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      </MainLayout>
    );
  }

  if (error || !data) {
    return (
      <MainLayout>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load revenue dashboard. Please make sure you are logged in with broker permissions.
          </AlertDescription>
        </Alert>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Revenue Dashboard</h1>
            <p className="text-muted-foreground">
              Platform fees, revenue mix, and growth signals.
            </p>
            {periodLabel && (
              <div className="mt-2">
                <Badge variant="outline">Period: {periodLabel}</Badge>
              </div>
            )}
          </div>
          <Button variant="outline" asChild>
            <Link href="/admin">Back to Admin</Link>
          </Button>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Fees</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{money(data.totalFees)} CROPT</div>
              <p className="text-xs text-muted-foreground">All fee types · options + forwards</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Fees (Options)</CardTitle>
              <Layers className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{money(data.byInstrument.OPTION)} CROPT</div>
              <p className="text-xs text-muted-foreground">Instrument mix · OPTION</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Fees (Forwards)</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{money(data.byInstrument.FORWARD)} CROPT</div>
              <p className="text-xs text-muted-foreground">Instrument mix · FORWARD</p>
            </CardContent>
          </Card>
        </div>

        {/* Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Fees over time</CardTitle>
            <CardDescription>Daily totals (OPTION vs FORWARD)</CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                No fee events in the selected period.
              </div>
            ) : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="totalFees" name="Total" stroke="hsl(222, 84%, 55%)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="optionFees" name="OPTION" stroke="hsl(142, 76%, 36%)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="forwardFees" name="FORWARD" stroke="hsl(0, 84%, 60%)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* By type */}
          <Card>
            <CardHeader>
              <CardTitle>Breakdown by fee type</CardTitle>
              <CardDescription>matching / settlement / exercise etc.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Fees</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {typeRows.map(([type, amt]) => {
                    const pct = data.totalFees > 0 ? (amt / data.totalFees) * 100 : 0;
                    return (
                      <TableRow key={type}>
                        <TableCell className="font-medium">{type}</TableCell>
                        <TableCell className="text-right font-mono">{money(amt)}</TableCell>
                        <TableCell className="text-right font-mono">{pct.toFixed(1)}%</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* By role / partners */}
          <Card>
            <CardHeader>
              <CardTitle>Breakdown by role</CardTitle>
              <CardDescription>Operational view (admin/broker/user attribution is TODO)</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Fees</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roleRows.map(([role, amt]) => {
                    const pct = data.totalFees > 0 ? (amt / data.totalFees) * 100 : 0;
                    return (
                      <TableRow key={role}>
                        <TableCell className="font-medium">{role}</TableCell>
                        <TableCell className="text-right font-mono">{money(amt)}</TableCell>
                        <TableCell className="text-right font-mono">{pct.toFixed(1)}%</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <div className="mt-4 rounded-md border p-3 bg-muted/20">
                <div className="text-sm font-semibold mb-2">Revenue sharing model</div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {typeof data.platformShare === "number" && (
                    <Badge variant="outline">Platform: {money(data.platformShare)}</Badge>
                  )}
                  {data.partnerShares?.map((p) => (
                    <Badge key={p.id} variant="secondary">
                      {p.name}: {money(p.partnerShare)} ({p.feeSharePercent}%)
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  TODO: partner-level attribution requires fee → partner mapping (e.g. orgId on fees).
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
