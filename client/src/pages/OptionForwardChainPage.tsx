import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MainLayout } from "@/components/layouts/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { AVAILABLE_COMMODITIES, COMMODITY_MAP, BASIS_CPT_ODESA } from "@shared/commodities";

type ChainOption = {
  id: string;
  type: "CALL" | "PUT";
  strike: number;
  premium: number;
  qtyTon: number;
  status: string;
  side: "LONG" | "SHORT" | null;
  volume: number | null;
  iv: number | null;
};

type ChainForward = {
  id: string;
  contractPrice: number;
  qtyTon: number;
  status: string;
  side: "LONG" | "SHORT" | null;
};

type ChainResponse = {
  index: { id: string; name: string; slug: string; basis: string };
  window: string;
  options: ChainOption[];
  forwards: ChainForward[];
};

const commodityOptions = AVAILABLE_COMMODITIES.map((c) => c.slug);
const defaultWindows = ["2025-02 1H", "2025-02 2H", "2025-03 1H"];

export default function OptionForwardChainPage() {
  const [commodity, setCommodity] = useState<string>(commodityOptions[0]);
  const [windowVal, setWindowVal] = useState<string>(defaultWindows[0]);

  const { data, isLoading, error, refetch, isFetching } = useQuery<ChainResponse>({
    queryKey: ["/api/markets/chain", { commodity, windowVal }],
    enabled: !!commodity && !!windowVal,
    queryFn: async () => {
      const resp = await apiRequest(
        "GET",
        `/api/markets/chain?commodity=${encodeURIComponent(commodity)}&window=${encodeURIComponent(
          windowVal
        )}`
      );
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load chain");
      }
      return resp.json();
    },
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (commodity && windowVal) {
      refetch();
    }
  }, [commodity, windowVal, refetch]);

  const groupedByStrike = useMemo(() => {
    if (!data?.options) return [];
    const map = new Map<number, { call?: ChainOption; put?: ChainOption }>();
    for (const opt of data.options) {
      const entry = map.get(opt.strike) || {};
      if (opt.type === "CALL") entry.call = opt;
      if (opt.type === "PUT") entry.put = opt;
      map.set(opt.strike, entry);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([strike, entry]) => ({ strike, ...entry }));
  }, [data]);

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto space-y-6 px-4 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Option & Forward Chain</h1>
            <p className="text-muted-foreground">
              Chain view by commodity and delivery window.
            </p>
          </div>
          <div className="flex gap-3 items-center">
            <div className="space-y-1 w-48">
              <div className="text-xs text-muted-foreground">Commodity</div>
              <Select value={commodity} onValueChange={setCommodity}>
                <SelectTrigger>
                  <SelectValue placeholder="Select commodity" />
                </SelectTrigger>
                <SelectContent>
                  {commodityOptions.map((slug) => (
                    <SelectItem key={slug} value={slug}>
                      {COMMODITY_MAP[slug as any]?.name || slug}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 w-40">
              <div className="text-xs text-muted-foreground">Window</div>
              <Select value={windowVal} onValueChange={setWindowVal}>
                <SelectTrigger>
                  <SelectValue placeholder="Select window" />
                </SelectTrigger>
                <SelectContent>
                  {defaultWindows.map((w) => (
                    <SelectItem key={w} value={w}>
                      {w}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 w-40">
              <div className="text-xs text-muted-foreground">Custom window</div>
              <Input
                value={windowVal}
                onChange={(e) => setWindowVal(e.target.value)}
                placeholder="2025-02 1H"
              />
            </div>
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              Refresh
            </Button>
          </div>
        </div>

        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : error ? (
          <Card>
            <CardContent className="p-6 text-destructive">
              {(error as Error).message || "Failed to load chain"}
            </CardContent>
          </Card>
        ) : data ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{data.index?.name || commodity.toUpperCase()}</CardTitle>
                <CardDescription>
                  Index: {data.index?.name || "—"} · Basis: {data.index?.basis || BASIS_CPT_ODESA} ·
                  Window: {data.window}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Strike</TableHead>
                      <TableHead>Call Bid</TableHead>
                      <TableHead>Call Ask</TableHead>
                      <TableHead>Put Bid</TableHead>
                      <TableHead>Put Ask</TableHead>
                      <TableHead>Volume / OI</TableHead>
                      <TableHead>Margin Profile</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupedByStrike.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                          No options for this window.
                        </TableCell>
                      </TableRow>
                    )}
                    {groupedByStrike.map((row) => (
                      <TableRow
                        key={row.strike}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => {
                          const first = row.call || row.put;
                          if (first) {
                            window.location.href = `/options?optionId=${first.id}`;
                          }
                        }}
                      >
                        <TableCell className="font-mono">{row.strike.toFixed(2)}</TableCell>
                        <ChainCell opt={row.call} kind="call" />
                        <ChainCell opt={row.call} kind="call" isAsk />
                        <ChainCell opt={row.put} kind="put" />
                        <ChainCell opt={row.put} kind="put" isAsk />
                        <TableCell className="text-xs text-muted-foreground">— / —</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          Standard / Premium as margin
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Separator />

            <Card>
              <CardHeader>
                <CardTitle>Forward line</CardTitle>
                <CardDescription>
                  Forwards for the same index/window. Mini line shows relative price.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {data.forwards.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No forwards for this window.</div>
                ) : (
                  <>
                    <div className="flex gap-3 flex-wrap">
                      {data.forwards.map((f) => (
                        <Card key={f.id} className="w-56">
                          <CardContent className="p-3 space-y-1">
                            <div className="flex items-center justify-between">
                              <div className="font-semibold">{f.contractPrice.toFixed(2)} CROPT/t</div>
                              <Badge variant="outline">{f.status}</Badge>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Qty: {f.qtyTon.toFixed(2)} t · Side: {f.side || "—"}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                    <MiniForwardLine forwards={data.forwards} />
                  </>
                )}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </MainLayout>
  );
}

function ChainCell({ opt, kind, isAsk }: { opt?: ChainOption; kind: "call" | "put"; isAsk?: boolean }) {
  if (!opt) return <TableCell className="text-muted-foreground text-xs">—</TableCell>;
  const tone = kind === "call" ? "text-emerald-600" : "text-amber-600";
  return (
    <TableCell className="text-sm">
      <div className={`font-mono ${tone}`}>{opt.premium?.toFixed(2) ?? "—"}</div>
      <div className="text-xs text-muted-foreground">
        Qty {opt.qtyTon?.toFixed(2) ?? "—"} · {opt.side || "—"}
      </div>
    </TableCell>
  );
}

function MiniForwardLine({ forwards }: { forwards: ChainForward[] }) {
  if (!forwards.length) return null;
  const prices = forwards.map((f) => f.contractPrice);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = Math.max(1, max - min);
  return (
    <div className="w-full h-24 bg-muted rounded-md px-3 py-2 flex items-end gap-2">
      {forwards.map((f) => {
        const height = 20 + ((f.contractPrice - min) / range) * 60;
        return (
          <div key={f.id} className="flex flex-col items-center justify-end text-xs text-muted-foreground">
            <div
              className="w-6 rounded-sm bg-primary/80"
              style={{ height }}
              title={`${f.contractPrice.toFixed(2)} CROPT/t`}
            />
            <div>{f.contractPrice.toFixed(1)}</div>
          </div>
        );
      })}
    </div>
  );
}

