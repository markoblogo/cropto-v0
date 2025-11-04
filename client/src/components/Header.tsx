import { Button } from "@/components/ui/button";
import { Wallet, Menu, LogOut, User } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ethers } from "ethers";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { NotificationsDropdown } from "./NotificationsDropdown";

interface HeaderProps {
  onCreateOption: () => void;
}

export function Header({ onCreateOption }: HeaderProps) {
  const [, setLocation] = useLocation();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isWalletDialogOpen, setIsWalletDialogOpen] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  const [inputAddress, setInputAddress] = useState("");
  const [inputNetwork, setInputNetwork] = useState("1");
  const { toast } = useToast();

  // Fetch current user
  const { data: userData } = useQuery<{ 
    user: { 
      id: string; 
      email: string; 
      role: string;
      walletAddress?: string;
      network?: string;
    } 
  } | null>({
    queryKey: ["/api/auth/me"],
    retry: false,
    enabled: !!localStorage.getItem('cropto_token'),
  });

  const user = userData?.user;

  // Load wallet from user data if available
  useEffect(() => {
    if (user?.walletAddress) {
      setWalletAddress(user.walletAddress);
      setNetwork(user.network || null);
    }
  }, [user]);

  const connectMetaMask = async () => {
    setIsConnecting(true);
    try {
      // Check if MetaMask is installed
      if (typeof window.ethereum === 'undefined') {
        toast({
          title: "MetaMask Not Found",
          description: "Switching to manual address input",
        });
        setShowManualInput(true);
        setIsConnecting(false);
        return;
      }

      // Request account access
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      const address = accounts[0];

      // Get network info
      const networkInfo = await provider.getNetwork();
      const chainId = networkInfo.chainId.toString();

      // Save to backend
      const response = await apiRequest("POST", "/api/wallet/link", { 
        address, 
        network: chainId 
      });
      const result = await response.json();
      
      setWalletAddress(address);
      setNetwork(chainId);
      setIsWalletDialogOpen(false);
      
      // Invalidate user query to refresh wallet data
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      
      toast({
        title: "Wallet Connected",
        description: `Connected to ${formatAddress(address)} on network ${chainId}`,
      });
    } catch (error: any) {
      console.error("MetaMask connection error:", error);
      
      // If user rejected, show manual input
      if (error.code === 4001 || error.code === 'ACTION_REJECTED') {
        toast({
          title: "Connection Rejected",
          description: "You can enter your address manually instead",
        });
        setShowManualInput(true);
      } else {
        toast({
          title: "Connection Failed",
          description: error.message || "Failed to connect wallet",
          variant: "destructive",
        });
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const connectManually = async () => {
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
      const response = await apiRequest("POST", "/api/wallet/link", { 
        address: inputAddress,
        network: inputNetwork
      });
      const result = await response.json();
      
      setWalletAddress(result.address || result.user?.walletAddress || inputAddress);
      setNetwork(result.network || result.user?.network || inputNetwork);
      setIsWalletDialogOpen(false);
      setInputAddress("");
      setShowManualInput(false);
      
      // Invalidate user query to refresh wallet data
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      
      toast({
        title: "Wallet Connected",
        description: `Connected to ${formatAddress(inputAddress)}`,
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

  const handleConnectWallet = () => {
    setIsWalletDialogOpen(true);
    setShowManualInput(false);
  };

  const formatAddress = (address: string) => {
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  const handleLogout = () => {
    localStorage.removeItem('cropto_token');
    queryClient.clear();
    setLocation('/login');
    toast({
      title: "Logged out",
      description: "You have been logged out successfully",
    });
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

            {user ? (
              <>
                {/* User Role Badge */}
                <Badge variant="secondary" className="capitalize hidden sm:flex" data-testid="badge-user-role">
                  <User className="h-3 w-3 mr-1" />
                  {user.role}
                </Badge>

                {/* Notifications */}
                <NotificationsDropdown />

                {/* Connect Wallet */}
                {!walletAddress ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleConnectWallet}
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
                  className="bg-primary text-primary-foreground font-semibold"
                  data-testid="button-header-create-option"
                >
                  <span className="hidden sm:inline">Create Option</span>
                  <span className="sm:hidden">Create</span>
                </Button>

                {/* Logout Button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLogout}
                  data-testid="button-logout"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Logout</span>
                </Button>
              </>
            ) : (
              <>
                {/* Login/Register Buttons */}
                <Link href="/login">
                  <Button variant="outline" size="sm" data-testid="button-login">
                    Login
                  </Button>
                </Link>
                <Link href="/register">
                  <Button size="sm" data-testid="button-register">
                    Register
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Wallet Connection Dialog */}
      <Dialog open={isWalletDialogOpen} onOpenChange={setIsWalletDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Connect Wallet</DialogTitle>
            <DialogDescription>
              {showManualInput 
                ? "Enter your wallet address manually" 
                : "Connect using MetaMask or enter manually"}
            </DialogDescription>
          </DialogHeader>
          
          {!showManualInput ? (
            <div className="space-y-4 pt-4">
              {/* MetaMask Connection Button */}
              <Button
                onClick={connectMetaMask}
                disabled={isConnecting}
                className="w-full"
                size="lg"
                data-testid="button-connect-metamask"
              >
                <Wallet className="h-5 w-5 mr-2" />
                {isConnecting ? "Connecting..." : "Connect with MetaMask"}
              </Button>
              
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    Or
                  </span>
                </div>
              </div>
              
              {/* Manual Input Option */}
              <Button
                variant="outline"
                onClick={() => setShowManualInput(true)}
                className="w-full"
                data-testid="button-manual-input"
              >
                Enter Address Manually
              </Button>
            </div>
          ) : (
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="wallet-address">Wallet Address</Label>
                <Input
                  id="wallet-address"
                  placeholder="0x..."
                  value={inputAddress}
                  onChange={(e) => setInputAddress(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && connectManually()}
                  className="font-mono"
                  data-testid="input-wallet-address"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="network-id">Network / Chain ID</Label>
                <Input
                  id="network-id"
                  placeholder="1 (Ethereum Mainnet)"
                  value={inputNetwork}
                  onChange={(e) => setInputNetwork(e.target.value)}
                  data-testid="input-network-id"
                />
              </div>
              
              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowManualInput(false);
                    setInputAddress("");
                  }}
                  disabled={isConnecting}
                  data-testid="button-back"
                >
                  Back
                </Button>
                <Button
                  onClick={connectManually}
                  disabled={isConnecting}
                  data-testid="button-submit-wallet"
                >
                  {isConnecting ? "Connecting..." : "Save Mock Address"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </header>
  );
}
