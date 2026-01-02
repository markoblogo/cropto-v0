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
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { intrinsic, computeNotional, calculatePnLPreview } from "@/lib/optionCalculations";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Simple component to render markdown content
function MarkdownContent({ content, title }: { content: string; title: string }) {
  return (
    <div className="prose prose-neutral dark:prose-invert max-w-none">
      <h2 className="text-2xl font-bold mb-4">{title}</h2>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

// Import markdown files as strings
import farmerHedgeContent from "./../assets/markdown/farmer-hedge-scenario.md?raw";
import traderSpreadContent from "./../assets/markdown/trader-spread-scenario.md?raw";
import brokerOverviewContent from "./../assets/markdown/broker-overview-scenario.md?raw";

interface CommodityIndex {
  id: string;
  name: string;
  slug: string;
}

type OptionType = "CALL" | "PUT";

// DOCS array will be created dynamically based on currentLang
// This is defined as a function to use currentLang
const getDocs = (currentLang: string) => [
  { key: "indexes", label: "Commodity Indexes", src: `/api/docs/education.indices.${currentLang}.md` },
  { key: "options", label: "Options 101", src: `/api/docs/education.options.${currentLang}.md` },
  { key: "margin", label: "Margin & Collateral", src: `/api/docs/education-margin.md` }, // No localized version yet
  { key: "spot", label: "Spot vs Forward vs Options", src: `/api/docs/education-spot-vs-forwards.md` }, // No localized version yet
  { key: "faq", label: "FAQ", src: `/api/docs/education.faq.${currentLang}.md` },
];

const SCENARIOS = [
  {
    key: "farmer-hedge",
    title: "Farmer Hedge",
    description: "How farmers protect their harvest prices using options and forwards",
    summary: "A corn farmer with 1000 tons secures minimum price while keeping upside potential",
    content: farmerHedgeContent
  },
  {
    key: "trader-spread",
    title: "Trader Spread",
    description: "Calendar and cross-commodity spreads for professional traders",
    summary: "Profiting from price relationships between different time periods or commodities",
    content: traderSpreadContent
  },
  {
    key: "broker-overview",
    title: "Broker Overview",
    description: "How brokers manage client relationships, risk, and fee revenue",
    summary: "Running a successful brokerage business in the Cropto ecosystem",
    content: brokerOverviewContent
  }
];

export default function Education() {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language === 'uk' ? 'uk' : 'en';
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);

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

  const aboutSrc = `/api/docs/about.${currentLang}.md`;
  const faqSrc = `/api/docs/faq.${currentLang}.md`;
  const docs = getDocs(currentLang);

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Hero Section */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {t('page.education.title')}
          </h1>
          <p className="text-muted-foreground mt-2">
            {t('page.education.subtitle')}
          </p>
          <p className="text-muted-foreground mt-4 max-w-3xl">
            {t('page.education.heroDescription')}
          </p>
        </div>

        {/* About Section */}
        <Card>
          <CardHeader>
            <CardTitle>{t('page.education.aboutTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div key={`about-${currentLang}`}>
              <MarkdownSection src={aboutSrc} />
            </div>
          </CardContent>
        </Card>

        {/* FAQ Section */}
        <Card>
          <CardHeader>
            <CardTitle>{t('page.education.faqTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div key={`faq-${currentLang}`}>
              <MarkdownSection src={faqSrc} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('page.education.topicsTitle')}</CardTitle>
            <CardDescription>{t('page.education.topicsDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Tabs defaultValue={docs[0].key} className="space-y-4">
              <TabsList className="flex flex-wrap gap-2">
                {docs.map((doc) => (
                  <TabsTrigger key={doc.key} value={doc.key}>
                    {doc.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {docs.map((doc) => (
                <TabsContent key={doc.key} value={doc.key}>
                  <MarkdownSection src={doc.src} />
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('page.education.scenariosTitle')}</CardTitle>
            <CardDescription>{t('page.education.scenariosDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {SCENARIOS.map((scenario) => (
                <Card key={scenario.key} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <CardTitle className="text-lg">{scenario.title}</CardTitle>
                    <CardDescription>{scenario.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                      {scenario.summary}
                    </p>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" className="w-full">
                          {t('page.education.readScenario')}
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>{scenario.title}</DialogTitle>
                        </DialogHeader>
                        <MarkdownContent content={scenario.content} title={scenario.title} />
                      </DialogContent>
                    </Dialog>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('page.education.calculatorTitle')}</CardTitle>
            <CardDescription>{t('page.education.calculatorDescription')}</CardDescription>
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
