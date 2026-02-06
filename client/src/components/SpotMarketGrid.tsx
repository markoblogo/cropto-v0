import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle } from "lucide-react";
import { SpotBuyModal } from "./SpotBuyModal";
import { SpotSellModal } from "./SpotSellModal";
import { WalletAuthModal } from "@/components/WalletAuthModal";
import { useTradingGuard } from "@/hooks/useTradingGuard";
import { useMarketDashboard } from "@/hooks/useMarketDashboard";
import { openAuthPrompt } from "@/lib/authPrompt";

type CountryCode = "UA" | "BR" | "AR" | "US";

interface SelectedCommodity {
  slug: string;
  name: string;
  pricePerTon: number;
}

function toSlug(commodity: string): string {
  const c = commodity.toLowerCase();
  if (c.includes("corn") || c.includes("maize")) return "corn";
  if (c.includes("feed") && c.includes("wheat")) return "feed-wheat";
  if (c.includes("wheat") && c.includes("11")) return "wheat-115";
  if (c.includes("wheat")) return "wheat";
  if (c.includes("sunflower")) return "sunflower";
  if (c.includes("rape")) return "rapeseed";
  if (c.includes("soy") && c.includes("processing")) return "soy-processing";
  if (c.includes("soy")) return "soy-gmo";
  return c.replace(/\s+/g, "-");
}

function normalizeToSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function countryLabel(country: CountryCode): string {
  if (country === "UA") return "Ukraine";
  if (country === "BR") return "Brazil";
  if (country === "AR") return "Argentina";
  return "USA";
}

function countryFlag(country: CountryCode): string {
  if (country === "UA") return "🇺🇦";
  if (country === "BR") return "🇧🇷";
  if (country === "AR") return "🇦🇷";
  return "🇺🇸";
}

export function SpotMarketGrid() {
  const { t } = useTranslation();
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>("UA");
  const [buyModalOpen, setBuyModalOpen] = useState(false);
  const [sellModalOpen, setSellModalOpen] = useState(false);
  const [selectedCommodity, setSelectedCommodity] = useState<SelectedCommodity | null>(null);
  const [isWalletAuthModalOpen, setIsWalletAuthModalOpen] = useState(false);

  const guardTradingAction = useTradingGuard({
    onOpenLogin: () => openAuthPrompt(),
    onOpenWalletModal: () => setIsWalletAuthModalOpen(true),
  });

  const { data, isLoading, error } = useMarketDashboard();

  const rows = useMemo(() => {
    if (!data) return [];
    const map: Record<CountryCode, typeof data.ua> = {
      UA: data.ua || [],
      BR: data.br || [],
      AR: data.ar || [],
      US: data.us || [],
    };
    return map[selectedCountry] || [];
  }, [data, selectedCountry]);

  const handleBuy = (slug: string, name: string, pricePerTon: number) => {
    guardTradingAction(() => {
      setSelectedCommodity({ slug, name, pricePerTon });
      setBuyModalOpen(true);
    });
  };

  const handleSell = (slug: string, name: string, pricePerTon: number) => {
    guardTradingAction(() => {
      setSelectedCommodity({ slug, name, pricePerTon });
      setSellModalOpen(true);
    });
  };

  if (isLoading) {
    return (
      <section className="py-8" id="spot-market-section">
        <h2 className="text-3xl font-bold mb-2">{t("spot.market.title")}</h2>
        <p className="text-muted-foreground">{t("spot.market.subtitle")}</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="py-8" id="spot-market-section">
        <h2 className="text-3xl font-bold mb-2">{t("spot.market.title")}</h2>
        <p className="text-muted-foreground mb-4">{t("spot.market.subtitle")}</p>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{t("spot.market.error")}</AlertDescription>
        </Alert>
      </section>
    );
  }

  return (
    <>
      <section className="py-8" id="spot-market-section" data-testid="spot-market-grid">
        <div className="space-y-4">
          <div>
            <h2 className="text-3xl font-bold mb-2">{t("spot.market.title")}</h2>
            <p className="text-muted-foreground">{t("spot.market.subtitle")}</p>
          </div>

          <Tabs value={selectedCountry} onValueChange={(v) => setSelectedCountry(v as CountryCode)}>
            <TabsList className="grid w-full grid-cols-4 max-w-xl">
              <TabsTrigger value="UA">UA</TabsTrigger>
              <TabsTrigger value="BR">BR</TabsTrigger>
              <TabsTrigger value="AR">AR</TabsTrigger>
              <TabsTrigger value="US">US</TabsTrigger>
            </TabsList>
          </Tabs>

          {rows.length === 0 ? (
            <Alert>
              <AlertDescription>{t("spot.market.noData")}</AlertDescription>
            </Alert>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {rows.map((row, i) => {
                const slug = selectedCountry === "UA"
                  ? toSlug(row.commodity)
                  : `${selectedCountry.toLowerCase()}-${normalizeToSlug(row.commodity)}-${normalizeToSlug(row.basis || "default")}`;
                const changeClass = row.change24h > 0 ? "text-green-600" : row.change24h < 0 ? "text-red-600" : "text-muted-foreground";
                return (
                  <Card key={`${selectedCountry}:${row.commodity}:${row.basis}:${i}`} className="rounded-xl shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <span>{countryFlag(selectedCountry)}</span>
                        <span className="truncate">{row.commodity}</span>
                      </CardTitle>
                      <div className="text-xs text-muted-foreground">{countryLabel(selectedCountry)} • {row.basis}</div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={`/commodities/${slug}.png`}
                          alt={row.commodity}
                          className="w-8 h-8 object-contain"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                          }}
                        />
                        <div>
                          <div className="text-2xl font-bold font-mono">${row.price.toFixed(2)}</div>
                          <div className="text-xs text-muted-foreground">USD / ton</div>
                        </div>
                      </div>
                      <div className={`text-sm font-medium ${changeClass}`}>{row.change24h > 0 ? "+" : ""}{row.change24h.toFixed(2)}% 24h</div>
                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1" onClick={() => handleBuy(slug, row.commodity, row.price)}>
                          {t("spot.market.buy")}
                        </Button>
                        <Button size="sm" variant="secondary" className="flex-1" onClick={() => handleSell(slug, row.commodity, row.price)}>
                          {t("spot.market.sell")}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {selectedCommodity && (
        <>
          <SpotBuyModal
            isOpen={buyModalOpen}
            onClose={() => setBuyModalOpen(false)}
            commoditySlug={selectedCommodity.slug}
            commodityName={selectedCommodity.name}
            currentPrice={selectedCommodity.pricePerTon}
            onOpenLogin={() => openAuthPrompt()}
            onOpenWalletModal={() => setIsWalletAuthModalOpen(true)}
          />
          <SpotSellModal
            isOpen={sellModalOpen}
            onClose={() => setSellModalOpen(false)}
            commoditySlug={selectedCommodity.slug}
            commodityName={selectedCommodity.name}
            currentPrice={selectedCommodity.pricePerTon}
            onOpenLogin={() => openAuthPrompt()}
            onOpenWalletModal={() => setIsWalletAuthModalOpen(true)}
          />
        </>
      )}

      <WalletAuthModal
        open={isWalletAuthModalOpen}
        onOpenChange={setIsWalletAuthModalOpen}
        onSuccess={() => setIsWalletAuthModalOpen(false)}
      />
    </>
  );
}
