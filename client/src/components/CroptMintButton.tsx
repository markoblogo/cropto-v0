import { WalletSummary } from '@/components/WalletSummary';
import { useWalletSummary } from '@/hooks/useWalletSummary';

interface CroptMintButtonProps {
  walletAddress: string | null;
}

export function CroptMintButton({ walletAddress }: CroptMintButtonProps) {
  const walletData = useWalletSummary(walletAddress);

  if (!walletAddress) {
    return null;
  }

  return <WalletSummary variant="card" {...walletData} />;
}
