import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { SPOT_ALLOWED_SLUGS } from "@/lib/indexMapping";
import { useLocation } from "wouter";
import { SpotMarketCard } from "./SpotMarketCard";
import { SpotBuyModal } from "./SpotBuyModal";
import { SpotSellModal } from "./SpotSellModal";
import { WalletAuthModal } from "@/components/WalletAuthModal";
import { useTradingGuard } from "@/hooks/useTradingGuard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle } from "lucide-react";

interface CommodityIndex {
  id: string;
  name: string;
  slug: string;
  category: string;
  hasVat: boolean;
  latestPrice: {
    price: number;
    delta: number | null;
    timestamp: Date;
  } | null;
  isStale?: boolean;
}

interface SelectedCommodity {
  slug: string;
  name: string;
  pricePerTon: number;
}

export function SpotMarketGrid() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [buyModalOpen, setBuyModalOpen] = useState(false);
  const [sellModalOpen, setSellModalOpen] = useState(false);
  const [selectedCommodity, setSelectedCommodity] = useState<SelectedCommodity | null>(null);
  const [isWalletAuthModalOpen, setIsWalletAuthModalOpen] = useState(false);

  const guardTradingAction = useTradingGuard({
    onOpenLogin: () => setLocation("/login"),
    onOpenWalletModal: () => setIsWalletAuthModalOpen(true),
  });

  const { data: indexes, isLoading, error } = useQuery<CommodityIndex[]>({
    queryKey: ["/api/indexes"],
    refetchInterval: 30000,
  });

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

  const handleWalletAuthSuccess = (token: string, newUser: boolean) => {
    setIsWalletAuthModalOpen(false);
  };

  if (isLoading) {
    return (
      <div className="py-12" id="spot-market-section">
        <div className="space-y-6">
          <div>
            <h2 className="text-3xl font-bold mb-2">{t('spot.market.title')}</h2>
            <p className="text-muted-foreground">
              {t('spot.market.subtitle')}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="space-y-3 p-5 border rounded-xl shadow-md">
                <Skeleton className="h-8 w-8" />
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-8 w-full" />
                <div className="flex gap-2">
                  <Skeleton className="h-9 flex-1" />
                  <Skeleton className="h-9 flex-1" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-12" id="spot-market-section">
        <div className="space-y-6">
          <div>
            <h2 className="text-3xl font-bold mb-2">{t('spot.market.title')}</h2>
            <p className="text-muted-foreground">
              {t('spot.market.subtitle')}
            </p>
          </div>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {t('spot.market.error')}
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  const spotIndexes = indexes?.filter(index => 
    SPOT_ALLOWED_SLUGS.includes(index.slug) && !index.isStale
  ).sort((a, b) => SPOT_ALLOWED_SLUGS.indexOf(a.slug) - SPOT_ALLOWED_SLUGS.indexOf(b.slug)) || [];

  if (spotIndexes.length === 0) {
    return (
      <div className="py-12" id="spot-market-section">
        <div className="space-y-6">
          <div>
            <h2 className="text-3xl font-bold mb-2">{t('spot.market.title')}</h2>
            <p className="text-muted-foreground">
              {t('spot.market.subtitle')}
            </p>
          </div>
          <Alert>
            <AlertDescription>
              {t('spot.market.noData')}
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="py-12" id="spot-market-section" data-testid="spot-market-grid">
        <div className="space-y-6">
          <div>
            <h2 className="text-3xl font-bold mb-2">{t('spot.market.title')}</h2>
            <p className="text-muted-foreground">
              {t('spot.market.subtitle')}
            </p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {spotIndexes.map((index, i) => (
              <SpotMarketCard
                key={index.id}
                slug={index.slug}
                name={index.name}
                pricePerTon={index.latestPrice?.price || 0}
                delta={index.latestPrice?.delta || null}
                category={index.category}
                onBuy={handleBuy}
                onSell={handleSell}
                index={i}
              />
            ))}
          </div>
        </div>
      </div>

      {selectedCommodity && (
        <>
          <SpotBuyModal
            isOpen={buyModalOpen}
            onClose={() => setBuyModalOpen(false)}
            commoditySlug={selectedCommodity.slug}
            commodityName={selectedCommodity.name}
            currentPrice={selectedCommodity.pricePerTon}
            onOpenLogin={() => setLocation("/login")}
            onOpenWalletModal={() => setIsWalletAuthModalOpen(true)}
          />
          <SpotSellModal
            isOpen={sellModalOpen}
            onClose={() => setSellModalOpen(false)}
            commoditySlug={selectedCommodity.slug}
            commodityName={selectedCommodity.name}
            currentPrice={selectedCommodity.pricePerTon}
            onOpenLogin={() => setLocation("/login")}
            onOpenWalletModal={() => setIsWalletAuthModalOpen(true)}
          />
        </>
      )}

      <WalletAuthModal
        open={isWalletAuthModalOpen}
        onOpenChange={setIsWalletAuthModalOpen}
        onSuccess={handleWalletAuthSuccess}
      />
    </>
  );
}
