import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Coins, Loader2, ArrowDownToLine } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useCroptBalance, usePendingTransactions } from '@/hooks/useCroptBalance';

interface CroptMintButtonProps {
  walletAddress: string | null;
}

export function CroptMintButton({ walletAddress }: CroptMintButtonProps) {
  const { toast } = useToast();
  const [mintEnabled, setMintEnabled] = useState(true);

  const { data: balanceData, isLoading: isLoadingBalance } = useCroptBalance(walletAddress);
  const { data: pendingTxs = [] } = usePendingTransactions();

  // Fetch internal balance for spot trading
  interface SpotBalance {
    userId: string;
    balance: string;
    updatedAt: string;
  }
  
  const { data: internalBalanceData } = useQuery<SpotBalance>({
    queryKey: ["/api/spot/balance"],
  });

  const hasPendingTx = pendingTxs.length > 0;

  const mintMutation = useMutation({
    mutationFn: async () => {
      if (!walletAddress) {
        throw new Error('No wallet address connected');
      }

      const response = await apiRequest('POST', '/api/onchain/mint', {
        toAddress: walletAddress,
        amount: "1",
      });

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'CROPT Mint Requested',
        description: `Transaction submitted: ${data.txHash?.substring(0, 10)}...`,
      });

      queryClient.invalidateQueries({ queryKey: ['/api/onchain/balance'] });
      queryClient.invalidateQueries({ queryKey: ['/api/onchain/txs'] });
    },
    onError: (error: any) => {
      const errorMessage = error.message || 'Failed to mint CROPT';
      
      if (errorMessage.includes('Minting is disabled') || errorMessage.includes('403')) {
        setMintEnabled(false);
        toast({
          title: 'Minting Disabled',
          description: 'CROPT minting is currently disabled. Contact admin.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Mint Failed',
          description: errorMessage,
          variant: 'destructive',
        });
      }
    },
  });

  const depositMutation = useMutation({
    mutationFn: async (amount: number) => {
      const response = await apiRequest("POST", "/api/spot/deposit", { amount });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spot/balance"] });
      toast({
        title: "Deposit successful",
        description: "CROPT deposited to internal trading balance",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Deposit failed",
        description: error.message || "Failed to deposit CROPT",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    const checkMintEnabled = async () => {
      try {
        await fetch('/api/health');
        setMintEnabled(true);
      } catch {
        setMintEnabled(false);
      }
    };

    checkMintEnabled();
  }, []);

  if (!walletAddress) {
    return null;
  }

  const balance = balanceData?.balance || '0';
  const internalBalance = internalBalanceData ? parseFloat(internalBalanceData.balance) : 0;
  const onChainBalance = parseFloat(balance);
  const isButtonDisabled = !mintEnabled || hasPendingTx || mintMutation.isPending;
  const canDeposit = onChainBalance > 0 && !depositMutation.isPending;

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
            {pendingTxs.length} pending transaction{pendingTxs.length > 1 ? 's' : ''}
          </Badge>
        )}

        <Separator />

        <div className="space-y-2">
          <Button
            onClick={() => mintMutation.mutate()}
            disabled={isButtonDisabled}
            variant="default"
            className="w-full"
            data-testid="button-request-cropt"
          >
            {mintMutation.isPending ? (
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
            onClick={() => depositMutation.mutate(onChainBalance)}
            disabled={!canDeposit}
            variant="secondary"
            className="w-full"
            data-testid="button-deposit-internal"
          >
            {depositMutation.isPending ? (
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
