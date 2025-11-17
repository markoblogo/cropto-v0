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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";

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
  const [quantityKg, setQuantityKg] = useState("");

  const { data: balanceData } = useQuery<SpotBalance>({
    queryKey: ["/api/spot/balance"],
    enabled: isOpen,
  });

  const buyMutation = useMutation({
    mutationFn: async (data: { quantityKg: number }) => {
      const response = await apiRequest("POST", `/api/spot/${commoditySlug}/buy`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spot/balance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spot", commoditySlug] });
      toast({
        title: "Success",
        description: `Successfully bought ${quantityKg}kg of ${commodityName}`,
      });
      setQuantityKg("");
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
    const qty = parseFloat(quantityKg);
    if (!qty || qty <= 0) {
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
    buyMutation.mutate({ quantityKg: qty });
  };

  const pricePerKg = currentPrice / 1000;
  const totalCost = parseFloat(quantityKg) * pricePerKg || 0;
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
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Current Price:</span>
              <span className="font-mono font-medium" data-testid="text-current-price">
                ${pricePerKg.toFixed(8)} / kg
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Available Balance:</span>
              <span className="font-mono font-medium" data-testid="text-available-balance">
                {availableBalance.toFixed(2)} CROPT
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quantity">Quantity (kg)</Label>
            <Input
              id="quantity"
              type="number"
              step="0.01"
              min="0"
              placeholder="Enter quantity in kg"
              value={quantityKg}
              onChange={(e) => setQuantityKg(e.target.value)}
              data-testid="input-quantity"
            />
          </div>

          {quantityKg && parseFloat(quantityKg) > 0 && (
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
              disabled={buyMutation.isPending || !canAfford || !quantityKg}
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
