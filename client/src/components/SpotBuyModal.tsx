import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { tonsToKg, formatTons } from "@/lib/units";
import { Loader2, AlertCircle, ArrowDownToLine } from "lucide-react";

interface SpotBuyModalProps {
  isOpen: boolean;
  onClose: () => void;
  commoditySlug: string;
  commodityName: string;
  currentPrice: number;
}

interface SpotBalance {
  userId: string;
  balance: string;
  updatedAt: string;
}

export function SpotBuyModal({
  isOpen,
  onClose,
  commoditySlug,
  commodityName,
  currentPrice,
}: SpotBuyModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [quantityTonnes, setQuantityTonnes] = useState("");

  const { data: balanceData } = useQuery<SpotBalance>({
    queryKey: ["/api/spot/balance"],
    enabled: isOpen,
  });

  const depositMutation = useMutation({
    mutationFn: async (amount: number) => {
      const response = await apiRequest("POST", "/api/spot/deposit", { amount });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spot/balance"] });
      toast({
        title: "Deposit successful",
        description: "CROPT deposited to internal balance",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Deposit failed",
        description: error.message || "Failed to deposit CROPT",
        variant: "destructive",
      });
    },
  });

  const handleDeposit = () => {
    // For now, deposit 3 CROPT (user's on-chain balance)
    // In production, this would check actual on-chain balance
    depositMutation.mutate(3);
  };

  const buyMutation = useMutation({
    mutationFn: async (data: { quantityKg: number }) => {
      const response = await apiRequest("POST", `/api/spot/${commoditySlug}/buy`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spot/balance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spot", commoditySlug] });
      const qtyTonnes = parseFloat(quantityTonnes);
      toast({
        title: "Success",
        description: `Successfully bought ${formatTons(qtyTonnes)}t of ${commodityName}`,
      });
      setQuantityTonnes("");
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to buy commodity",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const qtyTonnes = parseFloat(quantityTonnes);
    if (!qtyTonnes || qtyTonnes <= 0) {
      toast({
        title: "Invalid quantity",
        description: "Please enter a valid quantity",
        variant: "destructive",
      });
      return;
    }
    if (!canAfford) {
      toast({
        title: "Insufficient balance",
        description: `You need ${totalCost.toFixed(2)} CROPT but only have ${availableBalance.toFixed(2)} CROPT`,
        variant: "destructive",
      });
      return;
    }
    // Convert tonnes to kg for API
    const qtyKg = tonsToKg(qtyTonnes);
    buyMutation.mutate({ quantityKg: qtyKg });
  };

  // currentPrice is already in price per ton
  const pricePerTon = currentPrice;
  const totalCost = parseFloat(quantityTonnes) * pricePerTon || 0;
  const availableBalance = balanceData ? parseFloat(balanceData.balance) : 0;
  const canAfford = totalCost <= availableBalance;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-testid="dialog-spot-buy">
        <DialogHeader>
          <DialogTitle>Buy {commodityName}</DialogTitle>
          <DialogDescription>
            Purchase commodity using your internal CROPT balance
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {availableBalance === 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex flex-col gap-2">
                <span>You need to deposit CROPT from your on-chain balance to your internal trading balance first.</span>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleDeposit}
                  disabled={depositMutation.isPending}
                  data-testid="button-deposit"
                  className="w-fit"
                >
                  {depositMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Depositing...
                    </>
                  ) : (
                    <>
                      <ArrowDownToLine className="mr-2 h-4 w-4" />
                      Deposit 3 CROPT
                    </>
                  )}
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Current Price:</span>
              <span className="font-mono font-medium" data-testid="text-current-price">
                ${pricePerTon.toFixed(2)} / ton
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Internal Balance:</span>
              <span className="font-mono font-medium" data-testid="text-available-balance">
                {availableBalance.toFixed(2)} CROPT
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quantity">Quantity (t)</Label>
            <Input
              id="quantity"
              type="number"
              step="0.01"
              min="0"
              placeholder="Enter quantity in tonnes"
              value={quantityTonnes}
              onChange={(e) => setQuantityTonnes(e.target.value)}
              data-testid="input-quantity"
            />
          </div>

          {quantityTonnes && parseFloat(quantityTonnes) > 0 && (
            <div className="space-y-2 p-3 bg-muted rounded-lg">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Cost:</span>
                <span className="font-mono font-medium" data-testid="text-total-cost">
                  {totalCost.toFixed(2)} CROPT
                </span>
              </div>
              {!canAfford && (
                <p className="text-sm text-destructive" data-testid="text-insufficient-balance">
                  Insufficient balance
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={buyMutation.isPending}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={buyMutation.isPending || !canAfford || !quantityTonnes}
              data-testid="button-buy"
            >
              {buyMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Buy
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
