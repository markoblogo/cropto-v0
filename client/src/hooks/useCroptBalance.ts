import { useQuery } from '@tanstack/react-query';

interface BalanceResponse {
  address: string;
  balance: string;
  symbol: string;
}

interface Transaction {
  id: string;
  type: string;
  toAddress: string;
  amount: string;
  txHash: string | null;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED';
  createdAt: string;
}

export function useCroptBalance(address: string | null) {
  return useQuery<BalanceResponse>({
    queryKey: ['/api/onchain/balance', address],
    enabled: !!address,
    refetchInterval: 30000,
    retry: 1,
  });
}

export function usePendingTransactions() {
  return useQuery<Transaction[]>({
    queryKey: ['/api/onchain/txs'],
    select: (data: Transaction[]) => data?.filter(tx => tx.status === 'PENDING') || [],
    refetchInterval: 5000,
    retry: 1,
  });
}
