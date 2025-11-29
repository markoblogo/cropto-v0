import { useQuery } from "@tanstack/react-query";

export type UserTier = "guest" | "user_no_wallet" | "trader_full";

interface UserData {
  user: {
    id: string;
    email: string;
    role: string;
    walletAddress?: string;
    network?: string;
  };
}

/**
 * Hook to determine user tier based on authentication and wallet connection status.
 * 
 * - "guest": User is not logged in
 * - "user_no_wallet": User is logged in but wallet is not connected/attached
 * - "trader_full": User is logged in and wallet is connected/attached to account
 */
export function useUserTier(): UserTier {
  // Check authentication status
  const { data: userData } = useQuery<UserData | null>({
    queryKey: ["/api/auth/me"],
    retry: false,
    enabled: !!localStorage.getItem('cropto_token'),
  });

  const user = userData?.user;

  // If user is not logged in
  if (!user) {
    return "guest";
  }

  // Check if wallet is attached to user account
  // Wallet is considered connected if user has walletAddress in their profile
  const hasWallet = !!user.walletAddress;

  if (!hasWallet) {
    return "user_no_wallet";
  }

  return "trader_full";
}

