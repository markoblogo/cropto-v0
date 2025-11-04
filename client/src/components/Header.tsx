import { Button } from "@/components/ui/button";
import { Wallet, Menu } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";

interface HeaderProps {
  onCreateOption: () => void;
}

export function Header({ onCreateOption }: HeaderProps) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const connectWallet = async () => {
    setIsConnecting(true);
    try {
      // Mock wallet connection - in production, integrate with Web3 provider
      const mockAddress = "0x" + Math.random().toString(16).substring(2, 42);
      setWalletAddress(mockAddress);
      
      // Send to backend (mock endpoint for now)
      // In production: await apiRequest("POST", "/api/wallet/link", { address: mockAddress });
      console.log("Wallet connected:", mockAddress);
    } catch (error) {
      console.error("Failed to connect wallet:", error);
    } finally {
      setIsConnecting(false);
    }
  };

  const formatAddress = (address: string) => {
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 hover-elevate rounded-lg px-2 py-1 -ml-2">
            <img 
              src="/cropto-logo.png" 
              alt="Cropto" 
              className="h-8 w-auto"
              data-testid="img-header-logo"
            />
            <span className="font-bold text-lg hidden sm:inline">Cropto</span>
          </Link>

          {/* Navigation - Hidden on mobile, shown on md+ */}
          <nav className="hidden md:flex items-center gap-1">
            <Link href="/">
              <Button variant="ghost" size="sm" data-testid="button-nav-dashboard">
                Dashboard
              </Button>
            </Link>
            <Link href="/design-architecture">
              <Button variant="ghost" size="sm" data-testid="button-nav-gallery">
                Gallery
              </Button>
            </Link>
            <Link href="/docs">
              <Button variant="ghost" size="sm" data-testid="button-nav-docs">
                Docs
              </Button>
            </Link>
            <Link href="/partners-contracts">
              <Button variant="ghost" size="sm" data-testid="button-nav-partners">
                Partners
              </Button>
            </Link>
            <Link href="/onchain-tx">
              <Button variant="ghost" size="sm" data-testid="button-nav-transactions">
                Transactions
              </Button>
            </Link>
          </nav>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Mobile Menu Button */}
            <Button 
              variant="ghost" 
              size="icon"
              className="md:hidden"
              data-testid="button-mobile-menu"
            >
              <Menu className="h-5 w-5" />
            </Button>

            {/* Connect Wallet */}
            {!walletAddress ? (
              <Button
                variant="outline"
                size="sm"
                onClick={connectWallet}
                disabled={isConnecting}
                data-testid="button-connect-wallet"
              >
                <Wallet className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">
                  {isConnecting ? "Connecting..." : "Connect Wallet"}
                </span>
                <span className="sm:hidden">Connect</span>
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="font-mono"
                data-testid="button-wallet-address"
              >
                <Wallet className="h-4 w-4 mr-2" />
                {formatAddress(walletAddress)}
              </Button>
            )}

            {/* Create Option CTA */}
            <Button
              size="sm"
              onClick={onCreateOption}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              data-testid="button-header-create-option"
            >
              <span className="hidden sm:inline">Create Option</span>
              <span className="sm:hidden">Create</span>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
