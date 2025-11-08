import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Coins, Loader2 } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useCroptBalance, usePendingTransactions } from '@/hooks/useCroptBalance';

interface CroptMintButtonProps {
  walletAddress: string | null;
}

export function CroptMintButton({ walletAddress }: CroptMintButtonProps) {
  const { toast } = useToast();
  const [mintEnabled, setMintEnabled] = useState(false);

  const { data: balanceData, isLoading: isLoadingBalance } = useCroptBalance(walletAddress);
  const { data: pendingTxs = [] } = usePendingTransactions();

  const hasPendingTx = pendingTxs.length > 0;

  const mintMutation = useMutation({
    mutationFn: async () => {
      if (!walletAddress) {
        throw new Error('No wallet address connected');
      }

      const response = await apiRequest('POST', '/api/onchain/mint', {
        address: walletAddress,
        amount: 1,
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

  const checkMintEnabled = async () => {
    try {
      const response = await fetch('/api/health');
      setMintEnabled(true);
    } catch {
      setMintEnabled(false);
    }
  };

  if (!checkMintEnabled()) {
    checkMintEnabled();
  }

  if (!walletAddress) {
    return null;
  }

  const balance = balanceData?.balance || '0';
  const isButtonDisabled = !mintEnabled || hasPendingTx || mintMutation.isPending;

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
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-mono font-bold" data-testid="text-cropt-balance">
            {isLoadingBalance ? (
              <Loader2 className="w-8 h-8 animate-spin" />
            ) : (
              parseFloat(balance).toFixed(2)
            )}
          </span>
          <span className="text-muted-foreground">CROPT</span>
        </div>

        {hasPendingTx && (
          <Badge variant="secondary" className="gap-1" data-testid="badge-pending-tx">
            <Loader2 className="w-3 h-3 animate-spin" />
            {pendingTxs.length} pending transaction{pendingTxs.length > 1 ? 's' : ''}
          </Badge>
        )}

        <Button
          onClick={() => mintMutation.mutate()}
          disabled={isButtonDisabled}
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

        <p className="text-xs text-muted-foreground">
          {!mintEnabled && 'Minting disabled. Set ENABLE_MINT=true'}
          {hasPendingTx && 'Wait for pending transactions to complete'}
          {mintEnabled && !hasPendingTx && 'Click to receive 1 test CROPT token'}
        </p>
      </CardContent>
    </Card>
  );
}
