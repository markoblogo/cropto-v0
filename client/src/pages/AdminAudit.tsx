import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MainLayout } from "@/components/layouts/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Download, Filter, ShieldAlert } from "lucide-react";

type AuditInstrument = "all" | "spot" | "options" | "forward";
type AuditEntity = "all" | "trades" | "settlements" | "marginCalls" | "fees";

type AuditRecord = {
  timestamp: string;
  type: string;
  instrumentType: "SPOT" | "OPTION" | "FORWARD";
  userIds: string[];
  price?: number;
  qty?: number;
  fee?: number;
  status?: string;
  entityId?: string;
  details?: Record<string, any>;
};

function toDateInputValue(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fmtMoney(n: unknown) {
  const v = typeof n === "number" ? n : typeof n === "string" ? Number(n) : NaN;
  return Number.isFinite(v) ? v.toFixed(2) : "—";
}

function fmtNum(n: unknown) {
  const v = typeof n === "number" ? n : typeof n === "string" ? Number(n) : NaN;
  return Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: 4 }) : "—";
}

export default function AdminAudit() {
  const [instrument, setInstrument] = useState<AuditInstrument>("all");
  const [entity, setEntity] = useState<AuditEntity>("all");
  const [from, setFrom] = useState(() => toDateInputValue(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));
  const [to, setTo] = useState(() => toDateInputValue(new Date()));

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (from) params.set("from", new Date(`${from}T00:00:00.000Z`).toISOString());
    if (to) params.set("to", new Date(`${to}T23:59:59.999Z`).toISOString());
    if (instrument && instrument !== "all") params.set("instrument", instrument);
    if (entity && entity !== "all") params.set("entity", entity);
    params.set("limit", "1000");
    return params.toString();
  }, [from, to, instrument, entity]);

  const { data, isLoading, error } = useQuery<AuditRecord[]>({
    queryKey: ["/api/admin/audit", queryString],
    queryFn: async () => {
      const url = queryString ? `/api/admin/audit?${queryString}` : "/api/admin/audit";
      const resp = await apiRequest("GET", url);
      return resp.json();
    },
  });

  const onExport = async () => {
    const url = queryString ? `/api/admin/audit/export?${queryString}` : "/api/admin/audit/export";
    const resp = await apiRequest("GET", url);
    const blob = await resp.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = `audit_export_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  };

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Audit & Export</h1>
            <p className="text-muted-foreground">
              Compliance-grade feed of trades, settlements, margin calls, and fees.
            </p>
          </div>
          <Button onClick={onExport} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-4 w-4" /> Filters
            </CardTitle>
            <CardDescription>Choose a time window and event scope.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="from">From</Label>
                <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="to">To</Label>
                <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Instrument</Label>
                <Select value={instrument} onValueChange={(v) => setInstrument(v as AuditInstrument)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="options">Options</SelectItem>
                    <SelectItem value="forward">Forwards</SelectItem>
                    <SelectItem value="spot">Spot</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Entity</Label>
                <Select value={entity} onValueChange={(v) => setEntity(v as AuditEntity)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="trades">Trades</SelectItem>
                    <SelectItem value="settlements">Settlements</SelectItem>
                    <SelectItem value="marginCalls">Margin Calls</SelectItem>
                    <SelectItem value="fees">Fees</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-4 text-xs text-muted-foreground flex flex-wrap gap-2">
              <Badge variant="outline">Scope: {entity}</Badge>
              <Badge variant="outline">Instrument: {instrument}</Badge>
              <Badge variant="outline">Limit: 1000</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Audit feed</CardTitle>
            <CardDescription>
              Timestamped events suitable for reconciliation, partner reporting, and investor diligence.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : error ? (
              <Alert variant="destructive">
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>
                  Failed to load audit feed. Please ensure you are logged in with broker permissions.
                </AlertDescription>
              </Alert>
            ) : (data?.length || 0) === 0 ? (
              <div className="py-10 text-center text-muted-foreground">No records for the selected filters.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Instrument</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Users</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Fee</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data!.map((r) => (
                      <TableRow key={`${r.timestamp}-${r.entityId || ""}-${r.type}`}
                        className="hover:bg-muted/30">
                        <TableCell className="font-mono text-xs">
                          {new Date(r.timestamp).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{r.instrumentType}</Badge>
                        </TableCell>
                        <TableCell className="font-medium">{r.type}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {(r.userIds || []).join(", ") || "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono">{fmtNum(r.price)}</TableCell>
                        <TableCell className="text-right font-mono">{fmtNum(r.qty)}</TableCell>
                        <TableCell className="text-right font-mono">{fmtMoney(r.fee)}</TableCell>
                        <TableCell>
                          {r.status ? <Badge variant="secondary">{r.status}</Badge> : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
