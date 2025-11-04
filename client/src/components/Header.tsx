import { Button } from "@/components/ui/button";
import { Wallet, Menu } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface HeaderProps {
  onCreateOption: () => void;
}

export function Header({ onCreateOption }: HeaderProps) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isWalletDialogOpen, setIsWalletDialogOpen] = useState(false);
  const [inputAddress, setInputAddress] = useState("");
  const { toast } = useToast();

  const connectWallet = async () => {
    if (!inputAddress.trim()) {
      toast({
        title: "Error",
        description: "Please enter a wallet address",
        variant: "destructive",
      });
      return;
    }

    setIsConnecting(true);
    try {
      const response = await apiRequest("POST", "/api/wallet/link", { address: inputAddress });
      const wallet = await response.json();
      
      setWalletAddress(wallet.address);
      setIsWalletDialogOpen(false);
      setInputAddress("");
      
      toast({
        title: "Wallet Connected",
        description: `Connected to ${formatAddress(wallet.address)}`,
      });
    } catch (error: any) {
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to connect wallet",
        variant: "destructive",
      });
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
                onClick={() => setIsWalletDialogOpen(true)}
                data-testid="button-connect-wallet"
              >
                <Wallet className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Connect Wallet</span>
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

      {/* Wallet Connection Dialog */}
      <Dialog open={isWalletDialogOpen} onOpenChange={setIsWalletDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Connect Wallet</DialogTitle>
            <DialogDescription>
              Enter your wallet address to link it to your account
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="wallet-address">Wallet Address</Label>
              <Input
                id="wallet-address"
                placeholder="0x..."
                value={inputAddress}
                onChange={(e) => setInputAddress(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && connectWallet()}
                className="font-mono"
                data-testid="input-wallet-address"
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setIsWalletDialogOpen(false)}
                disabled={isConnecting}
                data-testid="button-cancel-wallet"
              >
                Cancel
              </Button>
              <Button
                onClick={connectWallet}
                disabled={isConnecting}
                data-testid="button-submit-wallet"
              >
                {isConnecting ? "Connecting..." : "Connect"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}
