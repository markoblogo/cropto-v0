import { useLocation } from "wouter";
import { useUserTier } from "./useUserTier";
import { useWeb3 } from "@/contexts/Web3Context";

export interface TradingGuardOptions {
  onOpenLogin?: () => void;        // вызывается, если userTier === "guest"
  onOpenWalletModal?: () => void;  // вызывается, если userTier === "user_no_wallet"
}

/**
 * Hook that provides a guard function for trading actions.
 * 
 * Returns a function that:
 * - Executes the action immediately if userTier === "trader_full"
 * - Opens login flow if userTier === "guest"
 * - Opens wallet connect flow if userTier === "user_no_wallet"
 * 
 * @param options - Optional callbacks for opening login/wallet modals
 * @returns A guard function that wraps trading actions
 */
export function useTradingGuard(
  options?: TradingGuardOptions,
): (action: () => void | Promise<void>) => void {
  const userTier = useUserTier();
  const [, setLocation] = useLocation();
  const { connectWallet } = useWeb3();

  return (action: () => void | Promise<void>) => {
    // If user has full trading access, execute action immediately
    if (userTier === "trader_full") {
      action();
      return;
    }

    // If user is not logged in, open login flow
    if (userTier === "guest") {
      if (options?.onOpenLogin) {
        options.onOpenLogin();
      } else {
        // Fallback: navigate to login page
        console.warn("useTradingGuard: onOpenLogin callback not provided, falling back to navigation");
        setLocation("/login");
      }
      return;
    }

    // If user is logged in but wallet is not connected, open wallet modal
    if (userTier === "user_no_wallet") {
      if (options?.onOpenWalletModal) {
        options.onOpenWalletModal();
      } else {
        // Fallback: try to connect wallet via Web3 context
        console.warn("useTradingGuard: onOpenWalletModal callback not provided, falling back to Web3 connectWallet");
        connectWallet().catch((error) => {
          console.error("Failed to connect wallet:", error);
        });
      }
      return;
    }
  };
}

