import { Button } from "@/components/ui/button";
import { Wallet, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useUserTier } from "@/hooks/useUserTier";
import { useTradingGuard } from "@/hooks/useTradingGuard";
import { useLocation } from "wouter";

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

export function Hero({ onCreateOption, onConnectWallet, walletAddress, onOpenLogin, onOpenWalletModal }: HeroProps) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const userTier = useUserTier();
  const guardTradingAction = useTradingGuard({
    onOpenLogin,
    onOpenWalletModal,
  });
  
  const navigateToSpotTrading = () => {
    setLocation("/spot-trading");
  };

  // Get button text based on user tier
  const getCreateOptionButtonText = () => {
    switch (userTier) {
      case "guest":
        return "Sign up to start trading";
      case "user_no_wallet":
        return "Connect wallet to activate trading";
      case "trader_full":
        return t('button.createOption');
    }
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
        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-8 max-w-7xl">
          {/* Logo - Left Side */}
          <div className="flex-shrink-0">
            <img 
              src="/cropto-logo.png" 
              alt={t('site.logoAlt')}
              className="h-20 sm:h-24 lg:h-32 w-auto"
              data-testid="img-hero-logo"
            />
          </div>

          {/* Headline and CTAs - Right Side */}
          <div className="flex-1">
            {/* Main Headline */}
            <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold text-white mb-6 leading-tight" data-testid="text-hero-headline">
              Cropto — {t('hero.tagline')}
            </h1>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                size="lg"
                className="bg-primary text-primary-foreground font-semibold w-full sm:w-auto"
                onClick={() => guardTradingAction(onCreateOption)}
                data-testid="button-hero-create-option"
              >
                {getCreateOptionButtonText()}
              </Button>

              <Button
                size="lg"
                variant="secondary"
                className="font-semibold w-full sm:w-auto"
                onClick={navigateToSpotTrading}
                data-testid="button-hero-spot-trading"
              >
                <TrendingUp className="mr-2 h-5 w-5" />
                {t('button.spotTrading')}
              </Button>

              <Button
                size="lg"
                variant="outline"
                className="bg-white/10 text-white border-white/30 backdrop-blur-sm font-semibold w-full sm:w-auto font-mono"
                onClick={onConnectWallet}
                data-testid="button-hero-connect-wallet"
              >
                <Wallet className="mr-2 h-5 w-5" />
                {walletAddress ? formatAddress(walletAddress) : t('button.connectWallet')}
              </Button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
