import { useState } from "react";
import { ethers } from "ethers";
import { Wallet, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface WalletAuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (token: string, newUser: boolean) => void;
}

export function WalletAuthModal({ open, onOpenChange, onSuccess }: WalletAuthModalProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualAddress, setManualAddress] = useState("");
  const { toast } = useToast();

  const connectWithMetaMask = async () => {
    setIsConnecting(true);
    try {
      // Check if MetaMask is installed
      if (typeof window.ethereum === 'undefined') {
        toast({
          title: "MetaMask Not Found",
          description: "Please install MetaMask or use manual address input",
        });
        setShowManualInput(true);
        setIsConnecting(false);
        return;
      }

      // Request account access
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();

      // Get nonce from backend
      const nonceRes = await fetch(`/api/auth/nonce?address=${address}`);
      if (!nonceRes.ok) {
        throw new Error('Failed to get nonce');
      }
      const { nonce } = await nonceRes.json();

      // Create message for signing
      const message = `Welcome to Cropto!

Sign this message to authenticate with your wallet. This request will not trigger a blockchain transaction or cost any gas fees.

Wallet address: ${address}
Timestamp: ${new Date().toISOString()}
Nonce: ${nonce}`;

      // Request signature
      const signature = await signer.signMessage(message);

      // Send to backend for verification
      const loginRes = await apiRequest("POST", "/api/auth/wallet-login", {
        address,
        signature,
        message,
      });

      const data = await loginRes.json();

      if (!loginRes.ok) {
        throw new Error(data.error || 'Login failed');
      }

      // Save token and notify parent
      localStorage.setItem('cropto_token', data.token);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });

      toast({
        title: "Wallet Connected",
        description: `Successfully authenticated with ${address.substring(0, 6)}...${address.substring(address.length - 4)}`,
      });

      onSuccess(data.token, data.new_user);
      onOpenChange(false);
    } catch (error: any) {
      console.error('MetaMask connection error:', error);
      
      if (error.code === 4001 || error.code === 'ACTION_REJECTED') {
        toast({
          title: "Connection Rejected",
          description: "You rejected the connection request",
        });
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
    if (!manualAddress.trim()) {
      toast({
        title: "Error",
        description: "Please enter a wallet address",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Manual Mode Not Supported",
      description: "Please use MetaMask to sign a message for authentication",
      variant: "destructive",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Connect Wallet to Continue</DialogTitle>
          <DialogDescription>
            {showManualInput 
              ? "MetaMask is required for wallet signature authentication" 
              : "Sign a message with your wallet to authenticate"}
          </DialogDescription>
        </DialogHeader>
        
        {!showManualInput ? (
          <div className="space-y-4 pt-4">
            {/* MetaMask Connection Button */}
            <Button
              onClick={connectWithMetaMask}
              disabled={isConnecting}
              className="w-full"
              size="lg"
              data-testid="button-connect-metamask"
            >
              <Wallet className="h-5 w-5 mr-2" />
              {isConnecting ? "Connecting..." : "Sign in with MetaMask"}
            </Button>
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Note
                </span>
              </div>
            </div>
            
            {/* Info Message */}
            <div className="flex items-start gap-2 p-3 bg-muted rounded-lg">
              <AlertCircle className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium mb-1">Signature-based authentication</p>
                <p>You'll be asked to sign a message to prove wallet ownership. This is free and does not send a transaction.</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="manual-address">Wallet Address</Label>
              <Input
                id="manual-address"
                placeholder="0x..."
                value={manualAddress}
                onChange={(e) => setManualAddress(e.target.value)}
                className="font-mono"
                data-testid="input-manual-address"
              />
            </div>
            
            <div className="flex items-start gap-2 p-3 bg-muted rounded-lg">
              <AlertCircle className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">
                Manual address input is not supported for authentication. Please install MetaMask to continue.
              </div>
            </div>
            
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowManualInput(false)}
                data-testid="button-back"
              >
                Back
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
