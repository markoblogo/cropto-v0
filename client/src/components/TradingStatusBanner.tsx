import { useUserTier } from "@/hooks/useUserTier";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "wouter";

interface TradingStatusBannerProps {
  onOpenWalletModal?: () => void;
}

export function TradingStatusBanner({ onOpenWalletModal }: TradingStatusBannerProps) {
  const userTier = useUserTier();

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
          <span className="text-2xl" role="img" aria-label="Lock">🔒</span>
          <div className="flex-1">
            <p className="text-sm font-medium">
              You're not signed in. Sign in or create an account to start trading.
            </p>
          </div>
          <Link href="/login">
            <Button size="sm" data-testid="button-banner-sign-in">
              Sign in or create account
            </Button>
          </Link>
        </div>
      </Card>
    );
  }

  if (userTier === "user_no_wallet") {
    return (
      <Card className="rounded-xl border bg-muted/40 p-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl" role="img" aria-label="Plug">🔌</span>
          <div className="flex-1">
            <p className="text-sm font-medium">
              Your account is ready, but you need to connect your wallet to start trading.
            </p>
          </div>
          <Button size="sm" onClick={handleConnectWallet} data-testid="button-banner-connect-wallet">
            Connect wallet
          </Button>
        </div>
      </Card>
    );
  }

  return null;
}

