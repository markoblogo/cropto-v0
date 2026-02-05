import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useCroptBalance, usePendingTransactions } from '@/hooks/useCroptBalance';

interface SpotBalance {
  userId: string;
  balance: string;
  updatedAt: string;
}

export function useWalletSummary(walletAddress: string | null) {
  const { toast } = useToast();
  const [mintEnabled, setMintEnabled] = useState(true);

  const { data: balanceData, isLoading: isLoadingBalance } = useCroptBalance(walletAddress);
  const { data: pendingTxs = [] } = usePendingTransactions();

  // Fetch internal balance for spot trading
  const { data: internalBalanceData } = useQuery<SpotBalance>({
    queryKey: ["/api/spot/balance"],
  });

  const hasPendingTx = pendingTxs.length > 0;
  const balance = balanceData?.balance || '0';
  const internalBalance = internalBalanceData ? parseFloat(internalBalanceData.balance) : 0;
  const onChainBalance = parseFloat(balance);

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
      queryClient.invalidateQueries({ queryKey: ['/api/onchain/transactions'] });
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

  const isButtonDisabled = !mintEnabled || hasPendingTx || mintMutation.isPending;
  const canDeposit = onChainBalance > 0 && !depositMutation.isPending;

  return {
    onChainBalance,
    internalBalance,
    isLoadingBalance,
    hasPendingTx,
    pendingTxsCount: pendingTxs.length,
    isButtonDisabled,
    canDeposit,
    mintEnabled,
    requestTestCropt: () => mintMutation.mutate(),
    depositToInternal: () => depositMutation.mutate(onChainBalance),
    isRequesting: mintMutation.isPending,
    isDepositing: depositMutation.isPending,
  };
}
