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

interface SpotSellModalProps {
  isOpen: boolean;
  onClose: () => void;
  commoditySlug: string;
  commodityName: string;
  currentPrice: number;
}

interface SpotPosition {
  position: {
    quantityKg: string;
    avgEntryPrice: string;
    currentValue: string;
    bookValue: string;
    unrealizedPnL: string;
    unrealizedPnLPercent: string;
  } | null;
  currentPrice: string;
  balance: {
    cropt: string;
  };
}

export function SpotSellModal({
  isOpen,
  onClose,
  commoditySlug,
  commodityName,
  currentPrice,
}: SpotSellModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [quantityKg, setQuantityKg] = useState("");

  const { data: positionData } = useQuery<SpotPosition>({
    queryKey: ["/api/spot", commoditySlug],
    enabled: isOpen,
  });

  const sellMutation = useMutation({
    mutationFn: async (data: { quantityKg: number }) => {
      const response = await apiRequest(
        "POST",
        `/api/spot/${commoditySlug}/sell`,
        data,
      );
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spot/balance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spot", commoditySlug] });
      toast({
        title: "Success",
        description: `Successfully sold ${quantityKg}kg of ${commodityName}`,
      });
      setQuantityKg("");
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to sell commodity",
        variant: "destructive",
      });
    },
  });

  // ---- количественная логика ----
  const positionQty = positionData?.position
    ? parseFloat(positionData.position.quantityKg)
    : 0;

  const parsedQty = parseFloat(quantityKg);
  const qtyNum = isNaN(parsedQty) ? 0 : parsedQty;

  const isLong = positionQty > 0;
  const hasInsufficientPosition = isLong && qtyNum > positionQty;
  const invalidQty = qtyNum <= 0;
  const canSell = !invalidQty && !hasInsufficientPosition;

  const pricePerKg = currentPrice / 1000;
  const totalPayout = qtyNum * pricePerKg || 0;

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

    if (hasInsufficientPosition) {
      toast({
        title: "Insufficient position",
        description: `You are trying to sell ${qty.toFixed(
          2,
        )} kg but only have ${positionQty.toFixed(2)} kg`,
        variant: "destructive",
      });
      return;
    }

    sellMutation.mutate({ quantityKg: qty });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-testid="dialog-spot-sell">
        <DialogHeader>
          <DialogTitle>Sell {commodityName}</DialogTitle>
          <DialogDescription>
            Sell your commodity position and receive CROPT
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Current Price:</span>
              <span
                className="font-mono font-medium"
                data-testid="text-current-price"
              >
                ${pricePerKg.toFixed(8)} / kg
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Your Position:</span>
              <span
                className="font-mono font-medium"
                data-testid="text-your-position"
              >
                {positionQty.toFixed(2)} kg
              </span>
            </div>
            {positionData?.position && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Unrealized P&L:</span>
                <span
                  className={`font-mono font-medium ${
                    parseFloat(positionData.position.unrealizedPnL) >= 0
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                  data-testid="text-unrealized-pnl"
                >
                  {parseFloat(positionData.position.unrealizedPnL) >= 0
                    ? "+"
                    : ""}
                  {parseFloat(
                    positionData.position.unrealizedPnL,
                  ).toFixed(2)}{" "}
                  CROPT ({positionData.position.unrealizedPnLPercent}%)
                </span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="quantity">Quantity (kg)</Label>
            <Input
              id="quantity"
              type="number"
              step="0.01"
              min="0"
              // ограничиваем max только для лонга; для шорта/нуля — без лимита по UI
              max={isLong ? positionQty : undefined}
              placeholder="Enter quantity in kg"
              value={quantityKg}
              onChange={(e) => setQuantityKg(e.target.value)}
              data-testid="input-quantity"
            />
            {isLong && positionQty > 0 && (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground underline"
                onClick={() => setQuantityKg(positionQty.toString())}
                data-testid="link-max-quantity"
              >
                Max: {positionQty.toFixed(2)} kg
              </button>
            )}
          </div>

          {qtyNum > 0 && (
            <div className="space-y-2 p-3 bg-muted rounded-lg">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Payout:</span>
                <span
                  className="font-mono font-medium"
                  data-testid="text-total-payout"
                >
                  {totalPayout.toFixed(2)} CROPT
                </span>
              </div>

              {hasInsufficientPosition && (
                <p
                  className="text-sm text-destructive"
                  data-testid="text-insufficient-position"
                >
                  Insufficient position (available: {positionQty.toFixed(2)} kg)
                </p>
              )}

              {!isLong && qtyNum > 0 && (
                <p
                  className="text-sm text-amber-700 dark:text-amber-400"
                  data-testid="text-short-info"
                >
                  You don&apos;t own this commodity yet — this order will open
                  or increase a short position.
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={sellMutation.isPending}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={sellMutation.isPending || !canSell}
              data-testid="button-sell"
            >
              {sellMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Sell
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}