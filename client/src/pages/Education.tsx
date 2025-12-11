import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { MainLayout } from "@/components/layouts/MainLayout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { MarkdownSection } from "@/components/MarkdownSection";
import { intrinsic, computeNotional, calculatePnLPreview } from "@/lib/optionCalculations";

interface CommodityIndex {
  id: string;
  name: string;
  slug: string;
}

type OptionType = "CALL" | "PUT";

const DOCS = [
  { key: "indexes", label: "Commodity Indexes", src: "/docs/education-indexes.md" },
  { key: "options", label: "Options 101", src: "/docs/education-options101.md" },
  { key: "margin", label: "Margin & Collateral", src: "/docs/education-margin.md" },
  { key: "spot", label: "Spot vs Forward vs Options", src: "/docs/education-spot-vs-forwards.md" },
  { key: "faq", label: "FAQ", src: "/docs/education-faq.md" },
];

export default function Education() {
  const { t } = useTranslation();

  const { data: indexes = [] } = useQuery<CommodityIndex[]>({
    queryKey: ["/api/indexes"],
    refetchInterval: 60000,
  });

  const [calculator, setCalculator] = useState({
    commodity: "",
    type: "CALL" as OptionType,
    qty: "100",
    strike: "400",
    currentPrice: "400",
    premium: "10",
  });

  const selectedIndexSlug = calculator.commodity || (indexes[0]?.slug ?? "");
  const qtyNum = parseFloat(calculator.qty) || 0;
  const strikeNum = parseFloat(calculator.strike) || 0;
  const priceNum = parseFloat(calculator.currentPrice) || 0;
  const premiumNum = parseFloat(calculator.premium) || 0;

  const totalPremium = qtyNum * premiumNum;
  const notional = computeNotional(strikeNum, qtyNum);
  const intrinsicValue = intrinsic(calculator.type, priceNum, strikeNum, qtyNum);

  const scenarios = useMemo(() => {
    const base = priceNum || strikeNum;
    const moves = [
      { label: "-10%", price: base * 0.9 },
      { label: "0%", price: base },
      { label: "+10%", price: base * 1.1 },
    ];
    return moves.map((m) => {
      const sellerView = calculatePnLPreview(calculator.type, strikeNum, qtyNum, premiumNum, m.price);
      const buyerNet = sellerView.intrinsicValue - sellerView.totalPremium;
      return {
        ...m,
        buyerPnL: buyerNet,
        sellerPnL: sellerView.netPnL,
      };
    });
  }, [calculator.type, priceNum, premiumNum, qtyNum, strikeNum]);

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold">
            {t("education.title", "Education & Learn")}
          </h1>
          <p className="text-muted-foreground mt-2">
            {t(
              "education.subtitle",
              "Central hub to learn Cropto: indexes, options, margin, and simple calculators."
            )}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Topics</CardTitle>
            <CardDescription>Side navigation for key topics. Markdown is loaded via /docs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Tabs defaultValue={DOCS[0].key} className="space-y-4">
              <TabsList className="flex flex-wrap gap-2">
                {DOCS.map((doc) => (
                  <TabsTrigger key={doc.key} value={doc.key}>
                    {doc.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {DOCS.map((doc) => (
                <TabsContent key={doc.key} value={doc.key}>
                  <MarkdownSection src={doc.src} />
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Option Calculator</CardTitle>
            <CardDescription>
              Educational-only calculator — does not place trades. Uses optionCalculations helpers.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <Label>Commodity</Label>
                <Select
                  value={selectedIndexSlug}
                  onValueChange={(v) => setCalculator((s) => ({ ...s, commodity: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select commodity" />
                  </SelectTrigger>
                  <SelectContent>
                    {indexes.map((idx) => (
                      <SelectItem key={idx.id} value={idx.slug}>
                        {idx.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select
                      value={calculator.type}
                      onValueChange={(v) => setCalculator((s) => ({ ...s, type: v as OptionType }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CALL">CALL</SelectItem>
                        <SelectItem value="PUT">PUT</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Quantity (t)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={calculator.qty}
                      onChange={(e) => setCalculator((s) => ({ ...s, qty: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Strike ($/t)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={calculator.strike}
                      onChange={(e) => setCalculator((s) => ({ ...s, strike: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Current index price ($/t)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={calculator.currentPrice}
                      onChange={(e) => setCalculator((s) => ({ ...s, currentPrice: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Premium (CROPT/t)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={calculator.premium}
                    onChange={(e) => setCalculator((s) => ({ ...s, premium: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-md border p-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>Total premium</span>
                    <span className="font-mono font-semibold">
                      {isFinite(totalPremium) ? totalPremium.toFixed(2) : "-"} CROPT
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Buyer pays this upfront; seller receives it.</p>
                </div>
                <div className="rounded-md border p-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>Notional</span>
                    <span className="font-mono font-semibold">
                      {isFinite(notional) ? notional.toFixed(2) : "-"} USD
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Strike × quantity; scale of the contract.</p>
                </div>
                <div className="rounded-md border p-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>Intrinsic at current price</span>
                    <span className="font-mono font-semibold">
                      {isFinite(intrinsicValue) ? intrinsicValue.toFixed(2) : "-"} CROPT
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Immediate exercise value (ignores time value).</p>
                </div>

                <Separator />

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Scenario PnL (educational)</h4>
                  <p className="text-xs text-muted-foreground">
                    Buyer PnL = intrinsic − premium; Seller PnL = premium − intrinsic.
                  </p>
                  <div className="space-y-2 text-sm">
                    {scenarios.map((s) => (
                      <div key={s.label} className="flex justify-between rounded-md border p-2">
                        <div className="flex flex-col">
                          <span className="font-medium">{s.label}</span>
                          <span className="text-xs text-muted-foreground">Price: ${s.price.toFixed(2)}</span>
                        </div>
                        <div className="text-right space-y-1">
                          <div className="text-xs text-muted-foreground">Buyer</div>
                          <div className={`font-mono ${s.buyerPnL >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {s.buyerPnL >= 0 ? "+" : ""}{s.buyerPnL.toFixed(2)} CROPT
                          </div>
                          <div className="text-xs text-muted-foreground">Seller</div>
                          <div className={`font-mono ${s.sellerPnL >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {s.sellerPnL >= 0 ? "+" : ""}{s.sellerPnL.toFixed(2)} CROPT
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Educational-only calculator; not a trading tool. Outputs do not include fees or funding.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
