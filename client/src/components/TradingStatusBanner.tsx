import { useUserTier } from "@/hooks/useUserTier";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useTranslation } from "react-i18next";
import { openAuthPrompt } from "@/lib/authPrompt";

interface TradingStatusBannerProps {
  onOpenWalletModal?: () => void;
}

export function TradingStatusBanner({ onOpenWalletModal }: TradingStatusBannerProps) {
  const userTier = useUserTier();
  const { t } = useTranslation();

  // Don't show banner for trader_full
  if (userTier === "trader_full") {
    return null;
  }

  const handleConnectWallet = () => {
    if (onOpenWalletModal) {
      onOpenWalletModal();
    } else {
      console.warn("TradingStatusBanner: onOpenWalletModal not provided");
    }
  };

  if (userTier === "guest") {
    return (
      <Card className="rounded-xl border bg-muted/40 p-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl" role="img" aria-label={t("banner.guest.lockLabel")}>🔒</span>
          <div className="flex-1">
            <p className="text-sm font-medium">
              {t("banner.guest.message")}
            </p>
          </div>
          <Button size="sm" data-testid="button-banner-sign-in" onClick={() => openAuthPrompt()}>
            {t("banner.guest.cta")}
          </Button>
        </div>
      </Card>
    );
  }

  if (userTier === "user_no_wallet") {
    return (
      <Card className="rounded-xl border bg-muted/40 p-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl" role="img" aria-label={t("banner.wallet.plugLabel")}>🔌</span>
          <div className="flex-1">
            <p className="text-sm font-medium">
              {t("banner.wallet.message")}
            </p>
          </div>
          <Button size="sm" onClick={handleConnectWallet} data-testid="button-banner-connect-wallet">
            {t("banner.wallet.cta")}
          </Button>
        </div>
      </Card>
    );
  }

  return null;
}
