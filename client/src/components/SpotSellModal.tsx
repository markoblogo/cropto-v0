import { useState, useEffect } from "react";
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
import { useTradingGuard } from "@/hooks/useTradingGuard";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { kgToTons, tonsToKg, formatTons } from "@/lib/units";
import { Loader2 } from "lucide-react";

const MIN_TRADE_TONS = 0.001;

interface SpotSellModalProps {
  isOpen: boolean;
  onClose: () => void;
  commoditySlug: string;
  commodityName: string;
  currentPrice: number;
  initialQuantity?: number; // Optional initial quantity to pre-fill
  onOpenLogin?: () => void;
  onOpenWalletModal?: () => void;
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
  initialQuantity,
  onOpenLogin,
  onOpenWalletModal,
}: SpotSellModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [quantityTonnes, setQuantityTonnes] = useState("");
  const guardTradingAction = useTradingGuard({
    onOpenLogin,
    onOpenWalletModal,
  });

  const { data: positionData } = useQuery<SpotPosition>({
    queryKey: ["/api/spot", commoditySlug],
    enabled: isOpen,
  });

  // Pre-fill quantity when modal opens or initialQuantity changes
  // Spot quantities are stored in kg; convert to tonnes for display
  useEffect(() => {
    if (isOpen && initialQuantity !== undefined && initialQuantity !== 0) {
      const qtyTonnes = kgToTons(initialQuantity);
      setQuantityTonnes(formatTons(Math.abs(qtyTonnes)));
    } else if (isOpen && initialQuantity === undefined && positionData?.position) {
      // If no initialQuantity provided, use position quantity as default
      // Spot position quantity is in kg; convert to tonnes
      const positionQtyKg = parseFloat(positionData.position.quantityKg);
      if (positionQtyKg !== 0) {
        const qtyTonnes = kgToTons(positionQtyKg);
        // For display, show absolute value (user enters positive quantity to sell)
        setQuantityTonnes(formatTons(Math.abs(qtyTonnes)));
      }
    } else if (!isOpen) {
      // Reset when modal closes
      setQuantityTonnes("");
    }
  }, [isOpen, initialQuantity, positionData]);

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
      const qtyTonnes = parseFloat(quantityTonnes);
      toast({
        title: "Success",
        description: `Successfully sold ${formatTons(qtyTonnes)}t of ${commodityName}`,
      });
      setQuantityTonnes("");
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
  // Spot position quantity is in kg from backend; convert to tonnes for display
  const positionQtyKg = positionData?.position
    ? parseFloat(positionData.position.quantityKg)
    : 0;
  const positionQtyTonnes = kgToTons(positionQtyKg);

  const parsedQtyTonnes = parseFloat(quantityTonnes);
  const qtyTonnesNum = isNaN(parsedQtyTonnes) ? 0 : parsedQtyTonnes;
  const qtyKgNum = tonsToKg(qtyTonnesNum); // Spot API expects kg; convert for validation

  const isLong = positionQtyKg > 0;
  const hasInsufficientPosition = isLong && qtyKgNum > positionQtyKg;
  const invalidQty = qtyTonnesNum < MIN_TRADE_TONS;
  const canSell = !invalidQty && !hasInsufficientPosition;

  // currentPrice is already in price per ton
  const pricePerTon = currentPrice;
  const totalPayout = qtyTonnesNum * pricePerTon || 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const qtyTonnes = parseFloat(quantityTonnes);

    if (!qtyTonnes || qtyTonnes < MIN_TRADE_TONS) {
      toast({
        title: "Invalid quantity",
        description: `Minimum quantity is ${MIN_TRADE_TONS.toFixed(3)} t`,
        variant: "destructive",
      });
      return;
    }

    if (hasInsufficientPosition) {
      toast({
        title: "Insufficient position",
        description: `You are trying to sell ${formatTons(qtyTonnes)}t but only have ${formatTons(positionQtyTonnes)}t`,
        variant: "destructive",
      });
      return;
    }

    // Guard wraps the actual trading action
    guardTradingAction(() => {
      // Convert tonnes to kg for API
      const qtyKg = tonsToKg(qtyTonnes);
      sellMutation.mutate({ quantityKg: qtyKg });
    });
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
                ${pricePerTon.toFixed(2)} / ton
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Your Position:</span>
              <span
                className="font-mono font-medium"
                data-testid="text-your-position"
              >
                {formatTons(positionQtyTonnes)} t
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
            <Label htmlFor="quantity">Quantity (t)</Label>
            <Input
              id="quantity"
              type="number"
              step="0.001"
              min={MIN_TRADE_TONS}
              // ограничиваем max только для лонга; для шорта/нуля — без лимита по UI
              max={isLong ? positionQtyTonnes : undefined}
              placeholder="Enter quantity in tonnes"
              value={quantityTonnes}
              onChange={(e) => setQuantityTonnes(e.target.value)}
              data-testid="input-quantity"
            />
            {invalidQty && quantityTonnes && (
              <p className="text-xs text-destructive">
                Minimum quantity is {MIN_TRADE_TONS.toFixed(3)} t
              </p>
            )}
            {isLong && positionQtyTonnes > 0 && (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground underline"
                onClick={() => setQuantityTonnes(formatTons(positionQtyTonnes))}
                data-testid="link-max-quantity"
              >
                Max: {formatTons(positionQtyTonnes)} t
              </button>
            )}
          </div>

          {qtyTonnesNum > 0 && (
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
                  Insufficient position (available: {formatTons(positionQtyTonnes)} t)
                </p>
              )}

              {!isLong && qtyTonnesNum > 0 && (
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
