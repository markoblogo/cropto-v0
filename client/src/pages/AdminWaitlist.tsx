import { useMemo, useState } from "react";
import { MainLayout } from "@/components/layouts/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle2, Circle, Filter, RefreshCw, Search } from "lucide-react";
import { useAdminAccess } from "@/hooks/useIsAdminLevelUser";

type WaitlistRole = "trader" | "broker" | "farmer" | "other" | string;

type WaitlistSummary = {
  total: number;
  verified: number;
  byRole: Array<{ role: string; count: number }>;
  byCountry: Array<{ country: string; count: number }>;
};

type WaitlistSignup = {
  id: string;
  createdAt: string | Date;
  userId: string | null;
  name: string;
  email: string;
  country: string;
  role: string;
  company: string;
  linkedinUrl: string | null;
  websiteUrl: string | null;
  source: string;
  verificationToken: string | null;
  verifiedAt: string | Date | null;
};

type WaitlistListResponse = {
  items: WaitlistSignup[];
  page: number;
  pageSize: number;
  total: number;
};

type VerifiedFilter = "all" | "true" | "false";

function roleCount(summary: WaitlistSummary | undefined, role: WaitlistRole): number {
  if (!summary?.byRole) return 0;
  const hit = summary.byRole.find((r) => (r.role || "").toLowerCase() === role.toLowerCase());
  return hit?.count ?? 0;
}

export default function AdminWaitlist() {
  const { isAdminLevel, isLoading: isAuthLoading } = useAdminAccess();

  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<"createdAt" | "country" | "role" | "name">("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Draft filters (editable)
  const [draftRole, setDraftRole] = useState<WaitlistRole | "all">("all");
  const [draftCountry, setDraftCountry] = useState("");
  const [draftVerified, setDraftVerified] = useState<VerifiedFilter>("all");
  const [draftQ, setDraftQ] = useState("");

  // Applied filters (drive query)
  const [role, setRole] = useState<WaitlistRole | "all">("all");
  const [country, setCountry] = useState("");
  const [verified, setVerified] = useState<VerifiedFilter>("all");
  const [q, setQ] = useState("");

  const summaryQuery = useQuery<WaitlistSummary>({
    queryKey: ["/api/admin/waitlist/summary"],
    enabled: isAdminLevel,
  });

  const listUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "50");
    params.set("sortBy", sortBy);
    params.set("sortDir", sortDir);
    if (role !== "all") params.set("role", role);
    if (country.trim()) params.set("country", country.trim());
    if (verified !== "all") params.set("verified", verified);
    if (q.trim()) params.set("q", q.trim());
    return `/api/admin/waitlist?${params.toString()}`;
  }, [page, sortBy, sortDir, role, country, verified, q]);

  const listQuery = useQuery<WaitlistListResponse>({
    queryKey: [listUrl],
    enabled: isAdminLevel,
    placeholderData: (previousData) => previousData,
  });

  const isForbidden = (summaryQuery.error as any)?.status === 403 || (listQuery.error as any)?.status === 403;
  const isUnauthorized = (summaryQuery.error as any)?.status === 401 || (listQuery.error as any)?.status === 401;

  if (isAuthLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Loading…</p>
        </div>
      </MainLayout>
    );
  }

  if (!isAdminLevel || isUnauthorized || isForbidden) {
    return (
      <MainLayout>
        <div className="max-w-3xl mx-auto py-10">
          <Card>
            <CardHeader>
              <CardTitle>Admin access required</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground">
              You don&apos;t have permission to view the waitlist dashboard. Please log in with a broker/admin account.
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    );
  }

  const summary = summaryQuery.data;
  const list = listQuery.data;

  const totalPages = list ? Math.max(1, Math.ceil((list.total || 0) / (list.pageSize || 50))) : 1;
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const applyFilters = () => {
    setPage(1);
    setRole(draftRole);
    setCountry(draftCountry);
    setVerified(draftVerified);
    setQ(draftQ);
  };

  const resetFilters = () => {
    setPage(1);
    setDraftRole("all");
    setDraftCountry("");
    setDraftVerified("all");
    setDraftQ("");
    setRole("all");
    setCountry("");
    setVerified("all");
    setQ("");
    setSortBy("createdAt");
    setSortDir("desc");
  };

  const toggleSort = (field: typeof sortBy) => {
    setPage(1);
    if (sortBy === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir(field === "createdAt" ? "desc" : "asc");
    }
  };

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Waitlist (Early Access)</h1>
          <p className="text-muted-foreground">Summary, filters, and detailed signups.</p>
        </div>

        {/* Summary cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total waitlist</CardTitle>
              <Filter className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summaryQuery.isLoading ? "—" : summary?.total ?? 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Verified emails</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summaryQuery.isLoading ? "—" : summary?.verified ?? 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">By role</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Badge variant="outline">Traders: {summaryQuery.isLoading ? "—" : roleCount(summary, "trader")}</Badge>
              <Badge variant="outline">Brokers: {summaryQuery.isLoading ? "—" : roleCount(summary, "broker")}</Badge>
              <Badge variant="outline">Farmers: {summaryQuery.isLoading ? "—" : roleCount(summary, "farmer")}</Badge>
              <Badge variant="outline">Other: {summaryQuery.isLoading ? "—" : roleCount(summary, "other")}</Badge>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Top countries</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {summaryQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : (
                (summary?.byCountry || [])
                  .slice()
                  .sort((a, b) => (b.count || 0) - (a.count || 0))
                  .slice(0, 4)
                  .map((c) => (
                    <div key={c.country} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground truncate">{c.country}</span>
                      <span className="font-medium">{c.count}</span>
                    </div>
                  ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={draftRole} onValueChange={(v) => setDraftRole(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All roles" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="trader">Trader</SelectItem>
                    <SelectItem value="broker">Broker</SelectItem>
                    <SelectItem value="farmer">Farmer</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Country</Label>
                <Input value={draftCountry} onChange={(e) => setDraftCountry(e.target.value)} placeholder="e.g. Ukraine" />
              </div>

              <div className="space-y-2">
                <Label>Verified</Label>
                <Select value={draftVerified} onValueChange={(v) => setDraftVerified(v as VerifiedFilter)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="true">Verified only</SelectItem>
                    <SelectItem value="false">Not verified</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Search</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    value={draftQ}
                    onChange={(e) => setDraftQ(e.target.value)}
                    placeholder="Name / email / company"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
              <Button variant="outline" onClick={resetFilters}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Reset
              </Button>
              <Button onClick={applyFilters}>
                <Filter className="mr-2 h-4 w-4" />
                Apply
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Signups</CardTitle>
          </CardHeader>
          <CardContent>
            {listQuery.isLoading && !list ? (
              <p className="text-muted-foreground py-10 text-center">Loading waitlist…</p>
            ) : listQuery.isError ? (
              <p className="text-destructive py-10 text-center">
                {(listQuery.error as any)?.message || "Failed to load waitlist."}
              </p>
            ) : (list?.items?.length || 0) === 0 ? (
              <p className="text-muted-foreground py-10 text-center">No waitlist signups found.</p>
            ) : (
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <button className="font-medium hover:underline" onClick={() => toggleSort("name")}>
                          Name
                        </button>
                      </TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>
                        <button className="font-medium hover:underline" onClick={() => toggleSort("country")}>
                          Country
                        </button>
                      </TableHead>
                      <TableHead>
                        <button className="font-medium hover:underline" onClick={() => toggleSort("role")}>
                          Role
                        </button>
                      </TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>
                        <button className="font-medium hover:underline" onClick={() => toggleSort("createdAt")}>
                          Created at
                        </button>
                      </TableHead>
                      <TableHead>Verified</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list?.items?.map((row) => {
                      const createdAt = row.createdAt ? new Date(row.createdAt) : null;
                      const isVerified = !!row.verifiedAt;
                      return (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">{row.name}</TableCell>
                          <TableCell className="text-muted-foreground">{row.email}</TableCell>
                          <TableCell>{row.country}</TableCell>
                          <TableCell className="capitalize">{row.role}</TableCell>
                          <TableCell>{row.company}</TableCell>
                          <TableCell className="text-muted-foreground">{row.source}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {createdAt ? format(createdAt, "MMM d, yyyy") : "—"}
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center gap-2">
                              {isVerified ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                              ) : (
                                <Circle className="h-4 w-4 text-muted-foreground" />
                              )}
                              <span className="text-sm text-muted-foreground">{isVerified ? "Yes" : "No"}</span>
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Pagination */}
            <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-sm text-muted-foreground">
                {list ? (
                  <>
                    Page <span className="font-medium">{list.page}</span> of{" "}
                    <span className="font-medium">{totalPages}</span> —{" "}
                    <span className="font-medium">{list.total}</span> total
                  </>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" disabled={!canPrev} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Previous
                </Button>
                <Button variant="outline" disabled={!canNext} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}


