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
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();

  const connectWithMetaMask = async () => {
    setIsConnecting(true);
    try {
      // Check if MetaMask is installed
      if (typeof window.ethereum === 'undefined') {
        toast({
          title: t("walletAuth.toast.metaMaskNotFound.title"),
          description: t("walletAuth.toast.metaMaskNotFound.desc"),
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
        throw new Error(t("walletAuth.errors.nonce"));
      }
      const { nonce } = await nonceRes.json();

      // Create message for signing
      const message = [
        t("walletAuth.signMessage.title"),
        "",
        t("walletAuth.signMessage.body"),
        "",
        t("walletAuth.signMessage.walletAddress", { address }),
        t("walletAuth.signMessage.timestamp", { timestamp: new Date().toISOString() }),
        t("walletAuth.signMessage.nonce", { nonce }),
      ].join("\n");

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
        throw new Error(data.error || t("walletAuth.errors.loginFailed"));
      }

      // Save token and notify parent
      localStorage.setItem('cropto_token', data.token);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });

      toast({
        title: t("walletAuth.toast.connected.title"),
        description: t("walletAuth.toast.connected.desc", {
          address: `${address.substring(0, 6)}...${address.substring(address.length - 4)}`,
        }),
      });

      onSuccess(data.token, data.new_user);
      onOpenChange(false);
    } catch (error: any) {
      console.error('MetaMask connection error:', error);
      
      if (error.code === 4001 || error.code === 'ACTION_REJECTED') {
        toast({
          title: t("walletAuth.toast.rejected.title"),
          description: t("walletAuth.toast.rejected.desc"),
        });
      } else {
        toast({
          title: t("walletAuth.toast.failed.title"),
          description: error.message || t("walletAuth.toast.failed.desc"),
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
        title: t("walletAuth.toast.manualMissing.title"),
        description: t("walletAuth.toast.manualMissing.desc"),
        variant: "destructive",
      });
      return;
    }

    toast({
      title: t("walletAuth.toast.manualNotSupported.title"),
      description: t("walletAuth.toast.manualNotSupported.desc"),
      variant: "destructive",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t("walletAuth.title")}</DialogTitle>
          <DialogDescription>
            {showManualInput
              ? t("walletAuth.description.manual")
              : t("walletAuth.description.default")}
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
              {isConnecting ? t("walletAuth.button.connecting") : t("walletAuth.button.signIn")}
            </Button>
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  {t("walletAuth.note")}
                </span>
              </div>
            </div>
            
            {/* Info Message */}
            <div className="flex items-start gap-2 p-3 bg-muted rounded-lg">
              <AlertCircle className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium mb-1">{t("walletAuth.signature.title")}</p>
                <p>{t("walletAuth.signature.desc")}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="manual-address">{t("walletAuth.manual.addressLabel")}</Label>
              <Input
                id="manual-address"
                placeholder={t("walletAuth.manual.addressPlaceholder")}
                value={manualAddress}
                onChange={(e) => setManualAddress(e.target.value)}
                className="font-mono"
                data-testid="input-manual-address"
              />
            </div>
            
            <div className="flex items-start gap-2 p-3 bg-muted rounded-lg">
              <AlertCircle className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">
                {t("walletAuth.manual.notSupported")}
              </div>
            </div>
            
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowManualInput(false)}
                data-testid="button-back"
              >
                {t("walletAuth.button.back")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
