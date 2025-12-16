import { Button } from "@/components/ui/button";
import { Wallet, TrendingUp, ArrowRightCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useWaitlist } from "@/contexts/WaitlistContext";

interface HeroProps {
  onCreateOption: () => void;
  onConnectWallet?: () => void;
  walletAddress?: string | null;
  onOpenLogin?: () => void;
  onOpenWalletModal?: () => void;
}

const formatAddress = (address: string) => {
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
};

export function Hero({
  onCreateOption: _onCreateOption,
  onConnectWallet,
  walletAddress,
  onOpenLogin: _onOpenLogin,
  onOpenWalletModal: _onOpenWalletModal,
}: HeroProps) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { openWaitlist } = useWaitlist();

  const isDemoMode =
    (import.meta.env.VITE_MOCK_ONCHAIN || "").toLowerCase() === "true" ||
    (import.meta.env.VITE_ENABLE_MINT || "").toLowerCase() !== "true";
  
  const navigateToSpotTrading = () => {
    setLocation("/spot-trading");
  };

  const navigateToOptions = () => {
    setLocation("/options");
  };

  return (
    <div className="relative overflow-hidden bg-background">
      {/* Background Image with Semi-Transparent Overlay */}
      <div 
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: 'url(/assets/designs/cropto-cover.png)' }}
      >
        <div className="absolute inset-0 bg-black/60" />
      </div>

      {/* Content */}
      <div className="relative container mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-28">
        <div className="flex flex-col gap-8 max-w-7xl">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
            <div className="flex flex-col gap-4 flex-1">
              <div className="flex flex-col md:flex-row items-center md:items-center gap-6">
                <img
                  src="/CroptoBlackLogo-removebg-preview.png"
                  alt="Cropto logo"
                  className="h-20 w-auto md:h-24"
                  data-testid="img-hero-logo"
                />
                <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold text-white leading-tight text-center md:text-left" data-testid="text-hero-headline">
                  CROPTO – Trade Commodities. On-Chain.
                </h1>
              </div>
              <p className="text-base sm:text-lg text-white/80 max-w-3xl">
                Where physical grain markets meet digital trading infrastructure.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-4">
            {/* Unified hero actions palette: light amber -> deep green */}
            <Button
              size="lg"
              className="w-full sm:w-auto font-semibold bg-amber-200 text-amber-950 hover:bg-amber-300 shadow-sm"
              onClick={() => navigateToOptions()}
              data-testid="button-hero-option-trading"
            >
              <ArrowRightCircle className="mr-2 h-5 w-5" />
              Option Trading
            </Button>

            <Button
              size="lg"
              className="w-full sm:w-auto font-semibold bg-amber-300 text-amber-950 hover:bg-amber-400 shadow-sm"
              onClick={navigateToSpotTrading}
              data-testid="button-hero-spot-trading"
            >
              <TrendingUp className="mr-2 h-5 w-5" />
              Spot Trading
            </Button>

            <Button
              size="lg"
              className="w-full sm:w-auto font-semibold bg-lime-400 text-emerald-950 hover:bg-lime-500 shadow-sm"
              onClick={() => openWaitlist("hero")}
              data-testid="button-hero-join-waitlist"
            >
              Join waitlist
            </Button>

            {walletAddress ? (
              <Button
                size="lg"
                className="w-full sm:w-auto font-semibold font-mono bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
                onClick={onConnectWallet}
                data-testid="badge-hero-wallet-connected"
              >
                <Wallet className="mr-2 h-5 w-5" />
                Wallet: Connected
              </Button>
            ) : (
              <Button
                size="lg"
                className="w-full sm:w-auto font-semibold font-mono bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm"
                onClick={onConnectWallet}
                data-testid="button-hero-connect-wallet"
              >
                <Wallet className="mr-2 h-5 w-5" />
                {t('button.connectWallet')}
              </Button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
