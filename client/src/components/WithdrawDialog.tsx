import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowDownToLine, Copy, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useWeb3 } from "@/contexts/Web3Context";
import { useTranslation } from "react-i18next";

interface WithdrawDialogProps {
  optionId: string;
  onWithdraw: (data: { optionId: string; address: string; amount: string }) => Promise<{ txHash: string }>;
  isPending: boolean;
}

export function WithdrawDialog({ optionId, onWithdraw, isPending }: WithdrawDialogProps) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [txHash, setTxHash] = useState<string | null>(null);
  const { toast } = useToast();
  const web3 = useWeb3();
  const { t } = useTranslation();

  // Fetch user's linked wallet from server as fallback
  const { data: walletData } = useQuery<{ walletAddress?: string } | null>({
    queryKey: ["/api/wallet/me"],
    retry: false,
  });

  // Use Web3 wallet if available, otherwise fall back to server-linked wallet
  const walletAddress = web3.address || walletData?.walletAddress;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!walletAddress) {
      toast({
        title: t("withdraw.toast.walletNotConnected.title"),
        description: t("withdraw.toast.walletNotConnected.desc"),
        variant: "destructive",
      });
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      toast({
        title: t("withdraw.toast.invalidAmount.title"),
        description: t("withdraw.toast.invalidAmount.desc"),
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await onWithdraw({
        optionId,
        address: walletAddress,
        amount,
      });

      setTxHash(result.txHash);
      
      toast({
        title: t("withdraw.toast.initiated.title"),
        description: t("withdraw.toast.initiated.desc"),
      });

      await web3.refreshBalances();
    } catch (error: any) {
      toast({
        title: t("withdraw.toast.failed.title"),
        description: error.message || t("withdraw.toast.failed.desc"),
        variant: "destructive",
      });
    }
  };

  const handleClose = () => {
    setOpen(false);
    setAmount("");
    setTxHash(null);
  };

  const copyTxHash = () => {
    if (txHash) {
      navigator.clipboard.writeText(txHash);
      toast({
        title: t("withdraw.toast.copied.title"),
        description: t("withdraw.toast.copied.desc"),
      });
    }
  };

  const viewOnExplorer = () => {
    if (txHash) {
      window.open(`https://mumbai.polygonscan.com/tx/${txHash}`, '_blank');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          data-testid={`button-withdraw-${optionId}`}
        >
          <ArrowDownToLine className="h-4 w-4 mr-1" />
          {t("withdraw.button.trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t("withdraw.title")}</DialogTitle>
          <DialogDescription>
            {txHash
              ? t("withdraw.desc.submitted")
              : t("withdraw.desc.default")}
          </DialogDescription>
        </DialogHeader>

        {!txHash ? (
          <form onSubmit={handleSubmit} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="withdraw-address">{t("withdraw.label.recipient")}</Label>
              <Input
                id="withdraw-address"
                value={walletAddress || t("withdraw.value.notConnected")}
                disabled
                className="font-mono"
                data-testid="input-withdraw-address"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="withdraw-amount">{t("withdraw.label.amount")}</Label>
              <Input
                id="withdraw-amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder={t("withdraw.placeholder.amount")}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isPending}
                required
                data-testid="input-withdraw-amount"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isPending}
                data-testid="button-cancel-withdraw"
              >
                {t("button.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={isPending || !walletAddress}
                data-testid="button-submit-withdraw"
              >
                {isPending ? t("withdraw.button.processing") : t("withdraw.button.submit")}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4 pt-4">
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <Label className="text-sm text-muted-foreground">{t("withdraw.label.txHash")}</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono break-all">
                  {txHash}
                </code>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={copyTxHash}
                  data-testid="button-copy-txhash"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={viewOnExplorer}
                className="flex-1"
                data-testid="button-view-explorer"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                {t("withdraw.button.viewExplorer")}
              </Button>
              <Button
                onClick={handleClose}
                className="flex-1"
                data-testid="button-close-withdraw"
              >
                {t("withdraw.button.close")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
