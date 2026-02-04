import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Coins, Loader2, ArrowDownToLine } from 'lucide-react';
import { useTranslation } from "react-i18next";

interface WalletSummaryProps {
  variant?: 'card' | 'bar';
  onChainBalance: number;
  internalBalance: number;
  isLoadingBalance: boolean;
  hasPendingTx: boolean;
  pendingTxsCount: number;
  isButtonDisabled: boolean;
  canDeposit: boolean;
  mintEnabled: boolean;
  requestTestCropt: () => void;
  depositToInternal: () => void;
  isRequesting: boolean;
  isDepositing: boolean;
}

export function WalletSummary({
  variant = 'card',
  onChainBalance,
  internalBalance,
  isLoadingBalance,
  hasPendingTx,
  pendingTxsCount,
  isButtonDisabled,
  canDeposit,
  mintEnabled,
  requestTestCropt,
  depositToInternal,
  isRequesting,
  isDepositing,
}: WalletSummaryProps) {
  const { t } = useTranslation();

  const infoMessage = !mintEnabled
    ? t("wallet.summary.info.mintDisabled")
    : hasPendingTx
      ? t("wallet.summary.info.pending")
      : !hasPendingTx && !canDeposit && onChainBalance === 0
        ? t("wallet.summary.info.requestFirst")
        : t("wallet.summary.info.depositToInternal");

  if (variant === 'bar') {
    return (
      <div className="w-full rounded-xl border bg-card px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        {/* Left: title + description */}
        <div className="flex items-center gap-3">
          <Coins className="w-5 h-5 text-muted-foreground" />
          <div>
            <h3 className="font-semibold">{t("wallet.summary.title")}</h3>
            <p className="text-xs text-muted-foreground">{t("wallet.summary.subtitle")}</p>
          </div>
        </div>

        {/* Middle: balances */}
        <div className="flex items-center gap-6 flex-wrap">
          <div>
            <div className="text-xs text-muted-foreground mb-1">{t("wallet.summary.onChain")}</div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-mono font-bold">
                {isLoadingBalance ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  onChainBalance.toFixed(2)
                )}
              </span>
              <span className="text-sm text-muted-foreground">{t("wallet.summary.token")}</span>
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-1">{t("wallet.summary.internal")}</div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-mono font-semibold">
                {internalBalance.toFixed(2)}
              </span>
              <span className="text-sm text-muted-foreground">{t("wallet.summary.token")}</span>
            </div>
          </div>

          {hasPendingTx && (
            <Badge variant="secondary" className="gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              {t("wallet.summary.pendingTx", { count: pendingTxsCount })}
            </Badge>
          )}
        </div>

        {/* Right: buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={requestTestCropt}
            disabled={isButtonDisabled}
            variant="default"
            size="sm"
            data-testid="button-request-cropt"
          >
            {isRequesting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t("wallet.summary.button.minting")}
              </>
            ) : (
              <>
                <Coins className="w-4 h-4 mr-2" />
                {t("wallet.summary.button.request")}
              </>
            )}
          </Button>

          <Button
            onClick={depositToInternal}
            disabled={!canDeposit}
            variant="secondary"
            size="sm"
            data-testid="button-deposit-internal"
          >
            {isDepositing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t("wallet.summary.button.depositing")}
              </>
            ) : (
              <>
                <ArrowDownToLine className="w-4 h-4 mr-2" />
                {t("wallet.summary.button.deposit")}
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // Card variant (default, for Dashboard)
  return (
    <Card className="w-full" data-testid="card-cropt-mint">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Coins className="w-5 h-5" />
          {t("wallet.summary.cardTitle")}
        </CardTitle>
        <CardDescription>
          {t("wallet.summary.cardSubtitle")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {/* On-chain balance */}
          <div>
            <div className="text-xs text-muted-foreground mb-1">{t("wallet.summary.onChain")}</div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-mono font-bold" data-testid="text-cropt-balance">
                {isLoadingBalance ? (
                  <Loader2 className="w-8 h-8 animate-spin" />
                ) : (
                  onChainBalance.toFixed(2)
                )}
              </span>
              <span className="text-muted-foreground">{t("wallet.summary.token")}</span>
            </div>
          </div>

          {/* Internal balance */}
          <div>
            <div className="text-xs text-muted-foreground mb-1">{t("wallet.summary.internal")}</div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-mono font-semibold" data-testid="text-internal-balance">
                {internalBalance.toFixed(2)}
              </span>
              <span className="text-sm text-muted-foreground">{t("wallet.summary.token")}</span>
            </div>
          </div>
        </div>

        {hasPendingTx && (
          <Badge variant="secondary" className="gap-1" data-testid="badge-pending-tx">
            <Loader2 className="w-3 h-3 animate-spin" />
            {t("wallet.summary.pendingTx", { count: pendingTxsCount })}
          </Badge>
        )}

        <Separator />

        <div className="space-y-2">
          <Button
            onClick={requestTestCropt}
            disabled={isButtonDisabled}
            variant="default"
            className="w-full"
            data-testid="button-request-cropt"
          >
            {isRequesting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t("wallet.summary.button.minting")}
              </>
            ) : (
              <>
                <Coins className="w-4 h-4 mr-2" />
                {t("wallet.summary.button.request")}
              </>
            )}
          </Button>

          <Button
            onClick={depositToInternal}
            disabled={!canDeposit}
            variant="secondary"
            className="w-full"
            data-testid="button-deposit-internal"
          >
            {isDepositing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t("wallet.summary.button.depositing")}
              </>
            ) : (
              <>
                <ArrowDownToLine className="w-4 h-4 mr-2" />
                {t("wallet.summary.button.deposit")}
              </>
            )}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          {infoMessage}
        </p>
      </CardContent>
    </Card>
  );
}
