import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Coins, Loader2, ArrowDownToLine } from 'lucide-react';

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
  if (variant === 'bar') {
    return (
      <div className="w-full rounded-xl border bg-card px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        {/* Left: title + description */}
        <div className="flex items-center gap-3">
          <Coins className="w-5 h-5 text-muted-foreground" />
          <div>
            <h3 className="font-semibold">Wallet</h3>
            <p className="text-xs text-muted-foreground">On-chain and internal balances</p>
          </div>
        </div>

        {/* Middle: balances */}
        <div className="flex items-center gap-6 flex-wrap">
          <div>
            <div className="text-xs text-muted-foreground mb-1">On-chain (Blockchain)</div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-mono font-bold">
                {isLoadingBalance ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  onChainBalance.toFixed(2)
                )}
              </span>
              <span className="text-sm text-muted-foreground">CROPT</span>
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-1">Internal (Spot Trading)</div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-mono font-semibold">
                {internalBalance.toFixed(2)}
              </span>
              <span className="text-sm text-muted-foreground">CROPT</span>
            </div>
          </div>

          {hasPendingTx && (
            <Badge variant="secondary" className="gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              {pendingTxsCount} pending transaction{pendingTxsCount > 1 ? 's' : ''}
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
                Minting...
              </>
            ) : (
              <>
                <Coins className="w-4 h-4 mr-2" />
                Request 1 CROPT
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
                Depositing...
              </>
            ) : (
              <>
                <ArrowDownToLine className="w-4 h-4 mr-2" />
                Deposit to Internal
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
          CROPT Balance
        </CardTitle>
        <CardDescription>
          Test CROPT tokens for Polygon Amoy testnet
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {/* On-chain balance */}
          <div>
            <div className="text-xs text-muted-foreground mb-1">On-chain (Blockchain)</div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-mono font-bold" data-testid="text-cropt-balance">
                {isLoadingBalance ? (
                  <Loader2 className="w-8 h-8 animate-spin" />
                ) : (
                  onChainBalance.toFixed(2)
                )}
              </span>
              <span className="text-muted-foreground">CROPT</span>
            </div>
          </div>

          {/* Internal balance */}
          <div>
            <div className="text-xs text-muted-foreground mb-1">Internal (Spot Trading)</div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-mono font-semibold" data-testid="text-internal-balance">
                {internalBalance.toFixed(2)}
              </span>
              <span className="text-sm text-muted-foreground">CROPT</span>
            </div>
          </div>
        </div>

        {hasPendingTx && (
          <Badge variant="secondary" className="gap-1" data-testid="badge-pending-tx">
            <Loader2 className="w-3 h-3 animate-spin" />
            {pendingTxsCount} pending transaction{pendingTxsCount > 1 ? 's' : ''}
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
                Minting...
              </>
            ) : (
              <>
                <Coins className="w-4 h-4 mr-2" />
                Request 1 CROPT
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
                Depositing...
              </>
            ) : (
              <>
                <ArrowDownToLine className="w-4 h-4 mr-2" />
                Deposit to Internal
              </>
            )}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          {!mintEnabled && 'Minting disabled. Set ENABLE_MINT=true'}
          {hasPendingTx && 'Wait for pending transactions to complete'}
          {!hasPendingTx && !canDeposit && onChainBalance === 0 && 'Request CROPT first to deposit'}
          {mintEnabled && !hasPendingTx && canDeposit && 'Deposit on-chain CROPT to internal balance for spot trading'}
        </p>
      </CardContent>
    </Card>
  );
}

