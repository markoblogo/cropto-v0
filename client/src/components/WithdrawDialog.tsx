import { useState } from "react";
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!web3.address) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your Web3 wallet first",
        variant: "destructive",
      });
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount to withdraw",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await onWithdraw({
        optionId,
        address: web3.address,
        amount,
      });

      setTxHash(result.txHash);
      
      toast({
        title: "Withdrawal Initiated",
        description: "Transaction submitted to blockchain",
      });

      await web3.refreshBalances();
    } catch (error: any) {
      toast({
        title: "Withdrawal Failed",
        description: error.message || "Failed to initiate withdrawal",
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
        title: "Copied",
        description: "Transaction hash copied to clipboard",
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
          Withdraw
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Withdraw On-Chain</DialogTitle>
          <DialogDescription>
            {txHash 
              ? "Withdrawal transaction submitted successfully"
              : "Mint CROPT tokens to your connected wallet"}
          </DialogDescription>
        </DialogHeader>

        {!txHash ? (
          <form onSubmit={handleSubmit} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="withdraw-address">Recipient Address</Label>
              <Input
                id="withdraw-address"
                value={web3.address || "Not connected"}
                disabled
                className="font-mono"
                data-testid="input-withdraw-address"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="withdraw-amount">Amount (CROPT)</Label>
              <Input
                id="withdraw-amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
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
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending || !web3.address}
                data-testid="button-submit-withdraw"
              >
                {isPending ? "Processing..." : "Withdraw"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4 pt-4">
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <Label className="text-sm text-muted-foreground">Transaction Hash</Label>
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
                View on Explorer
              </Button>
              <Button
                onClick={handleClose}
                className="flex-1"
                data-testid="button-close-withdraw"
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
