import React, { useMemo, useState } from "react";
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Scatter,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BrokerageEntry } from "../../types";
import { getEntryMidPrice } from "./utils";

interface UniversalChartProps {
  entries: BrokerageEntry[];
}

type PeriodPreset = "1m" | "3m" | "6m" | "custom";

function normalizeLabel(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function isPocLikePlace(value: string) {
  const normalized = value.toUpperCase();
  return (
    normalized.includes("POC") ||
    normalized.includes("ODESA") ||
    normalized.includes("ODESSA") ||
    normalized.includes("PIVDEN") ||
    normalized.includes("CHORNOMORSK") ||
    normalized.includes("UAODS") ||
    normalized.includes("UAYUZ")
  );
}

export function UniversalChart({ entries }: UniversalChartProps) {
  const [showPrice, setShowPrice] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("1m");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const commodityOptions = useMemo(() => {
    const values = Array.from(
      new Set(
        entries
          .map((entry) => normalizeLabel(entry.commodityLabel || entry.commodity))
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b));
    return values;
  }, [entries]);

  const basisOptions = useMemo(() => {
    return Array.from(new Set(entries.map((entry) => normalizeLabel(entry.basis)).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [entries]);

  const deliveryPlaceOptions = useMemo(() => {
    return Array.from(new Set(entries.map((entry) => normalizeLabel(entry.destinationPort)).filter(Boolean))).sort(
      (a, b) => a.localeCompare(b),
    );
  }, [entries]);

  const [selectedCommodity, setSelectedCommodity] = useState<string>("CORN");
  const [selectedBasis, setSelectedBasis] = useState<string>("CPT");
  const [selectedPlaces, setSelectedPlaces] = useState<string[]>([]);

  React.useEffect(() => {
    if (!commodityOptions.length) return;
    const cornOption = commodityOptions.find((item) => item.toUpperCase() === "CORN");
    if (cornOption) {
      setSelectedCommodity((prev) => (prev ? prev : cornOption));
      return;
    }
    setSelectedCommodity((prev) => (prev ? prev : commodityOptions[0]));
  }, [commodityOptions]);

  React.useEffect(() => {
    if (!basisOptions.length) return;
    const hasCpt = basisOptions.some((item) => item.toUpperCase() === "CPT");
    if (hasCpt) {
      setSelectedBasis((prev) => (prev ? prev : "CPT"));
      return;
    }
    setSelectedBasis((prev) => (prev ? prev : basisOptions[0]));
  }, [basisOptions]);

  React.useEffect(() => {
    if (!deliveryPlaceOptions.length) return;
    setSelectedPlaces((prev) => {
      if (prev.length) return prev.filter((item) => deliveryPlaceOptions.includes(item));
      const pocDefaults = deliveryPlaceOptions.filter((item) => isPocLikePlace(item));
      if (pocDefaults.length) return pocDefaults;
      return [deliveryPlaceOptions[0]];
    });
  }, [deliveryPlaceOptions]);

  const filteredEntries = useMemo(() => {
    const now = new Date();
    let fromDate: Date | null = null;
    let toDate: Date | null = now;

    if (periodPreset === "1m") fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (periodPreset === "3m") fromDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    if (periodPreset === "6m") fromDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    if (periodPreset === "custom") {
      fromDate = customFrom ? new Date(customFrom) : null;
      toDate = customTo ? new Date(customTo) : null;
    }

    return entries.filter((entry) => {
      if (entry.type !== "bid" && entry.type !== "offer") return false;

      const commodity = normalizeLabel(entry.commodityLabel || entry.commodity).toUpperCase();
      const basis = normalizeLabel(entry.basis).toUpperCase();
      const place = normalizeLabel(entry.destinationPort);
      const createdAt = new Date(entry.createdAt);

      if (selectedCommodity && commodity !== selectedCommodity.toUpperCase()) return false;
      if (selectedBasis && basis !== selectedBasis.toUpperCase()) return false;
      if (selectedPlaces.length && !selectedPlaces.includes(place)) return false;
      if (!Number.isNaN(createdAt.getTime())) {
        if (fromDate && createdAt < fromDate) return false;
        if (toDate && createdAt > toDate) return false;
      }

      return true;
    });
  }, [entries, periodPreset, customFrom, customTo, selectedCommodity, selectedBasis, selectedPlaces]);

  const chartData = useMemo(() => {
    // Group entries by date
    const grouped = new Map<string, {
      date: string;
      bidPriceSum: number; bidCount: number;
      offerPriceSum: number; offerCount: number;
      bidVolume: number; offerVolume: number;
      scatterPoints: any[];
    }>();

    for (const entry of filteredEntries) {
      if (entry.type !== "bid" && entry.type !== "offer") continue;
      
      const dateKey = new Date(entry.createdAt).toISOString().slice(0, 10);
      let dayData = grouped.get(dateKey);
      if (!dayData) {
        dayData = {
          date: dateKey,
          bidPriceSum: 0, bidCount: 0,
          offerPriceSum: 0, offerCount: 0,
          bidVolume: 0, offerVolume: 0,
          scatterPoints: []
        };
        grouped.set(dateKey, dayData);
      }

      const volume = Number(entry.quantityMt ?? entry.volumeTo ?? entry.volumeFrom ?? 0);
      const price = getEntryMidPrice(entry);

      if (entry.type === "bid") {
        if (Number.isFinite(volume)) dayData.bidVolume += volume;
        if (price !== null && Number.isFinite(price)) {
          dayData.bidPriceSum += price;
          dayData.bidCount += 1;
        }
      } else if (entry.type === "offer") {
        if (Number.isFinite(volume)) dayData.offerVolume += volume;
        if (price !== null && Number.isFinite(price)) {
          dayData.offerPriceSum += price;
          dayData.offerCount += 1;
        }
      }

      if (price !== null && Number.isFinite(price)) {
        dayData.scatterPoints.push({
          x: dateKey,
          y: price,
          type: entry.type,
          basis: entry.basis,
          currency: entry.currency
        });
      }
    }

    return Array.from(grouped.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(day => ({
        ...day,
        avgBid: day.bidCount > 0 ? Number((day.bidPriceSum / day.bidCount).toFixed(2)) : null,
        avgOffer: day.offerCount > 0 ? Number((day.offerPriceSum / day.offerCount).toFixed(2)) : null,
      }));
  }, [filteredEntries]);

  const scatterData = useMemo(() => {
    return chartData.flatMap(day => day.scatterPoints);
  }, [chartData]);

  if (filteredEntries.length === 0) {
    return (
      <Card className="border-border/60">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm">Universal Price & Volume Chart</CardTitle>
          <CardDescription>No data matching chart filters.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-border/60">
      <CardHeader className="space-y-3 py-3 px-4">
        <div className="flex flex-row items-center justify-between gap-3">
          <div>
          <CardTitle className="text-sm">Price & Volume Dynamics</CardTitle>
            <CardDescription className="text-xs">Specific view by commodity/basis/place/period</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant={showPrice ? "secondary" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowPrice(!showPrice)}
            >
              Price VWAP
            </Button>
            <Button
              variant={showVolume ? "secondary" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowVolume(!showVolume)}
            >
              Volume
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Commodity</Label>
            <select
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
              value={selectedCommodity}
              onChange={(event) => setSelectedCommodity(event.target.value)}
            >
              {commodityOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Period</Label>
            <div className="flex gap-1">
              <Button size="sm" variant={periodPreset === "1m" ? "secondary" : "outline"} className="h-8 px-2 text-xs" onClick={() => setPeriodPreset("1m")}>1M</Button>
              <Button size="sm" variant={periodPreset === "3m" ? "secondary" : "outline"} className="h-8 px-2 text-xs" onClick={() => setPeriodPreset("3m")}>3M</Button>
              <Button size="sm" variant={periodPreset === "6m" ? "secondary" : "outline"} className="h-8 px-2 text-xs" onClick={() => setPeriodPreset("6m")}>6M</Button>
              <Button size="sm" variant={periodPreset === "custom" ? "secondary" : "outline"} className="h-8 px-2 text-xs" onClick={() => setPeriodPreset("custom")}>Custom</Button>
            </div>
            {periodPreset === "custom" ? (
              <div className="flex gap-1">
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-8 text-xs" />
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-8 text-xs" />
              </div>
            ) : null}
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Basis</Label>
            <select
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
              value={selectedBasis}
              onChange={(event) => setSelectedBasis(event.target.value)}
            >
              {basisOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Delivery places</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-8 w-full justify-start truncate text-xs">
                  {selectedPlaces.length ? selectedPlaces.join(" / ") : "Select places"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-72 w-64 overflow-y-auto">
                {deliveryPlaceOptions.map((place) => {
                  const checked = selectedPlaces.includes(place);
                  return (
                    <DropdownMenuCheckboxItem
                      key={place}
                      checked={checked}
                      onCheckedChange={(next) =>
                        setSelectedPlaces((prev) =>
                          next ? [...new Set([...prev, place])] : prev.filter((item) => item !== place),
                        )
                      }
                    >
                      {place}
                    </DropdownMenuCheckboxItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-2 pt-0 pb-4">
        <div className="h-[350px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
              <XAxis dataKey="date" tick={{fontSize: 10}} tickLine={false} axisLine={false} />
              
              {showPrice && <YAxis yAxisId="price" orientation="left" tick={{fontSize: 10}} tickLine={false} axisLine={false} width={40} />}
              {showVolume && <YAxis yAxisId="volume" orientation="right" tick={{fontSize: 10}} tickLine={false} axisLine={false} width={50} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />}
              
              <Tooltip 
                contentStyle={{ backgroundColor: "rgba(0,0,0,0.8)", border: "1px solid #333", borderRadius: "6px" }}
                itemStyle={{ fontSize: "12px" }}
                labelStyle={{ fontSize: "12px", color: "#888", marginBottom: "4px" }}
              />
              <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />

              {showVolume && (
                <>
                  <Bar yAxisId="volume" dataKey="bidVolume" name="Bid Volume (MT)" fill="hsl(160 65% 45%)" opacity={0.2} radius={[2,2,0,0]} barSize={20} />
                  <Bar yAxisId="volume" dataKey="offerVolume" name="Offer Volume (MT)" fill="hsl(38 85% 52%)" opacity={0.2} radius={[2,2,0,0]} barSize={20} />
                </>
              )}

              {showPrice && (
                <>
                  <Line yAxisId="price" type="monotone" dataKey="avgBid" name="Avg Bid" stroke="hsl(160 65% 45%)" strokeWidth={2} dot={false} />
                  <Line yAxisId="price" type="monotone" dataKey="avgOffer" name="Avg Offer" stroke="hsl(38 85% 52%)" strokeWidth={2} dot={false} />
                  <Scatter yAxisId="price" data={scatterData} name="Offers" fill="hsl(38 85% 52%)" opacity={0.6} dataKey="y" shape="circle" />
                </>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
