import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOptionsMarketSnapshot } from "@/hooks/useOptionsMarketSnapshot";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function OptionsMarketStrip() {
  const [, setLocation] = useLocation();
  const hasToken = typeof window !== "undefined" && !!localStorage.getItem("cropto_token");
  const [commodityFilter, setCommodityFilter] = useState<string>("ALL");
  const [windowFilter, setWindowFilter] = useState<"ALL" | "NEAREST" | "NEXT">("ALL");

  const { data, isLoading, error, refetch, isFetching } = useOptionsMarketSnapshot({
    limit: 6,
    commodity: commodityFilter !== "ALL" ? commodityFilter : undefined,
  });

  const rows = useMemo(() => data?.options ?? [], [data]);

  const goToLogin = () => setLocation("/login");
  const goToRegister = () => setLocation("/register");
  const goToOptionChain = (commodity: string | null | undefined, windowLabel: string) => {
    const params = new URLSearchParams();
    if (commodity) params.set("commodity", commodity);
    if (windowLabel && windowLabel !== "TBD") params.set("window", windowLabel);
    setLocation(`/options?${params.toString()}`);
  };

  if (!hasToken) {
    return (
      <Card className="border border-muted-foreground/10 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl">Options Market (top offers)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Login to see live option offers from the marketplace.
          </p>
          <div className="flex gap-3">
            <Button onClick={goToLogin}>Login</Button>
            <Button variant="outline" onClick={goToRegister}>Register</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const availableCommodities = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.commoditySlug) {
        set.add(r.commoditySlug);
      } else if (r.commodity) {
        set.add(r.commodity);
      }
    });
    return Array.from(set);
  }, [rows]);

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const dateA = a.expirationDate ? new Date(a.expirationDate).getTime() : Number.POSITIVE_INFINITY;
      const dateB = b.expirationDate ? new Date(b.expirationDate).getTime() : Number.POSITIVE_INFINITY;
      if (dateA !== dateB) return dateA - dateB;
      if (a.type !== b.type) return a.type === "CALL" ? -1 : 1;
      return (b.premiumPerTon ?? 0) - (a.premiumPerTon ?? 0);
    });
    return copy;
  }, [rows]);

  const filteredByCommodity = useMemo(() => {
    if (commodityFilter === "ALL") return sortedRows;
    return sortedRows.filter(
      (row) => row.commoditySlug === commodityFilter || row.commodity === commodityFilter
    );
  }, [commodityFilter, sortedRows]);

  const filteredRows = useMemo(() => {
    if (windowFilter === "ALL") return filteredByCommodity;
    const dated = filteredByCommodity.filter((r) => r.expirationDate);
    if (dated.length === 0) return filteredByCommodity;
    if (windowFilter === "NEAREST") {
      return dated.slice(0, 6);
    }
    // NEXT: skip the first nearest expiry group
    const nearestTime = dated[0].expirationDate ? new Date(dated[0].expirationDate!).getTime() : null;
    const rest = nearestTime
      ? dated.filter((r) => new Date(r.expirationDate!).getTime() !== nearestTime)
      : dated.slice(1);
    return rest.slice(0, 6);
  }, [filteredByCommodity, windowFilter]);

  const windowLabel = windowFilter === "ALL" ? "All expiries" : "Nearest expiries";

  return (
    <Card className="border border-muted-foreground/10 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="space-y-1">
          <CardTitle className="text-xl">Options Market (top offers)</CardTitle>
          <p className="text-xs text-muted-foreground">{windowLabel}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setLocation("/options")}>
          View all
        </Button>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
          <div className="flex gap-3 flex-1">
            <Select value={commodityFilter} onValueChange={setCommodityFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Commodity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All commodities</SelectItem>
                {availableCommodities.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={windowFilter} onValueChange={(v) => setWindowFilter(v as any)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Expiry window" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All expiries</SelectItem>
                <SelectItem value="NEAREST">Nearest</SelectItem>
                <SelectItem value="NEXT">Next</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="text-xs text-muted-foreground">
            Sorted by nearest expiry, CALLs first, premium desc
          </div>
        </div>

        {isLoading || isFetching ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, idx) => (
              <Skeleton key={idx} className="h-12 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
            <span className="text-sm text-destructive">
              Failed to load options market.
            </span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">No open option offers yet.</p>
        ) : (
          <div className="divide-y divide-border">
            <div className="grid grid-cols-7 gap-2 py-2 text-xs uppercase text-muted-foreground">
              <span>Commodity</span>
              <span>Window</span>
              <span>Type</span>
              <span className="text-right hidden sm:block">Qty (t)</span>
              <span className="text-right">Strike ($/t)</span>
              <span className="text-right hidden sm:block">Premium (CROPT/t)</span>
              <span className="text-right">Action</span>
            </div>
            {filteredRows.map((row) => {
              const strikeFmt = `$${Number(row.strikePerTon ?? 0).toLocaleString()}`;
              const premiumFmt = row.premiumPerTon?.toLocaleString() ?? "-";
              return (
                <div key={row.id} className="grid grid-cols-7 gap-2 py-3 text-sm items-center">
                  <span className="font-medium">{row.commodity}</span>
                  <span className="text-muted-foreground">{row.expiryWindowLabel}</span>
                  <span>{row.type}</span>
                  <span className="text-right hidden sm:block">{row.qtyTons.toLocaleString()}</span>
                  <span className="text-right">{strikeFmt}</span>
                  <span className="text-right hidden sm:block">{premiumFmt}</span>
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => goToOptionChain(row.commoditySlug || row.commodity, row.expiryWindowLabel)}
                    >
                      View
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

