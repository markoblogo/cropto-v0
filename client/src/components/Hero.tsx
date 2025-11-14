import { Button } from "@/components/ui/button";
import { Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";

interface HeroProps {
  onCreateOption: () => void;
  onConnectWallet?: () => void;
  walletAddress?: string | null;
}

const formatAddress = (address: string) => {
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
};

export function Hero({ onCreateOption, onConnectWallet, walletAddress }: HeroProps) {
  const { t } = useTranslation();
  
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
              alt="Cropto Logo" 
              className="h-20 sm:h-24 lg:h-32 w-auto"
              data-testid="img-hero-logo"
            />
          </div>

          {/* Headline and CTAs - Right Side */}
          <div className="flex-1">
            {/* Main Headline */}
            <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold text-white mb-6 leading-tight" data-testid="text-hero-headline">
              {t('hero.headline')}
            </h1>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                size="lg"
                className="bg-primary text-primary-foreground font-semibold w-full sm:w-auto"
                onClick={onCreateOption}
                data-testid="button-hero-create-option"
              >
                {t('button.createOption')}
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
