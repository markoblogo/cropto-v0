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
        title: t("toast.success"),
        description: t("spot.sellModal.successDesc", {
          qty: formatTons(qtyTonnes),
          commodity: commodityName,
        }),
      });
      setQuantityTonnes("");
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: t("toast.error"),
        description: error.message || t("spot.sellModal.errorDesc"),
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
        title: t("spot.sellModal.invalidQuantityTitle"),
        description: t("spot.sellModal.invalidQuantityDesc", {
          min: MIN_TRADE_TONS.toFixed(3),
        }),
        variant: "destructive",
      });
      return;
    }

    if (hasInsufficientPosition) {
      toast({
        title: t("spot.sellModal.insufficientPositionTitle"),
        description: t("spot.sellModal.insufficientPositionDesc", {
          sell: formatTons(qtyTonnes),
          available: formatTons(positionQtyTonnes),
        }),
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
          <DialogTitle>{t("spot.sellModal.title", { commodity: commodityName })}</DialogTitle>
          <DialogDescription>
            {t("spot.sellModal.description")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("spot.sellModal.currentPriceLabel")}</span>
              <span
                className="font-mono font-medium"
                data-testid="text-current-price"
              >
                {t("spot.sellModal.pricePerTon", { price: pricePerTon.toFixed(2) })}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("spot.sellModal.yourPositionLabel")}</span>
              <span
                className="font-mono font-medium"
                data-testid="text-your-position"
              >
                {t("spot.sellModal.yourPositionValue", { qty: formatTons(positionQtyTonnes) })}
              </span>
            </div>
            {positionData?.position && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("spot.sellModal.unrealizedPnlLabel")}</span>
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
                  {t("spot.sellModal.unrealizedPnlValue", {
                    value: parseFloat(positionData.position.unrealizedPnL).toFixed(2),
                    percent: positionData.position.unrealizedPnLPercent,
                  })}
                </span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="quantity">{t("spot.sellModal.quantityLabel")}</Label>
            <Input
              id="quantity"
              type="number"
              step="0.001"
              min={MIN_TRADE_TONS}
              // ограничиваем max только для лонга; для шорта/нуля — без лимита по UI
              max={isLong ? positionQtyTonnes : undefined}
              placeholder={t("spot.sellModal.quantityPlaceholder")}
              value={quantityTonnes}
              onChange={(e) => setQuantityTonnes(e.target.value)}
              data-testid="input-quantity"
            />
            {invalidQty && quantityTonnes && (
              <p className="text-xs text-destructive">
                {t("spot.sellModal.minimumQuantity", { min: MIN_TRADE_TONS.toFixed(3) })}
              </p>
            )}
            {isLong && positionQtyTonnes > 0 && (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground underline"
                onClick={() => setQuantityTonnes(formatTons(positionQtyTonnes))}
                data-testid="link-max-quantity"
              >
                {t("spot.sellModal.maxQuantity", { qty: formatTons(positionQtyTonnes) })}
              </button>
            )}
          </div>

          {qtyTonnesNum > 0 && (
            <div className="space-y-2 p-3 bg-muted rounded-lg">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("spot.sellModal.totalPayoutLabel")}</span>
                <span
                  className="font-mono font-medium"
                  data-testid="text-total-payout"
                >
                  {t("spot.sellModal.totalPayoutValue", { total: totalPayout.toFixed(2) })}
                </span>
              </div>

              {hasInsufficientPosition && (
                <p
                  className="text-sm text-destructive"
                  data-testid="text-insufficient-position"
                >
                  {t("spot.sellModal.insufficientPositionInline", {
                    available: formatTons(positionQtyTonnes),
                  })}
                </p>
              )}

              {!isLong && qtyTonnesNum > 0 && (
                <p
                  className="text-sm text-amber-700 dark:text-amber-400"
                  data-testid="text-short-info"
                >
                  {t("spot.sellModal.shortInfo")}
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
              {t("button.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={sellMutation.isPending || !canSell}
              data-testid="button-sell"
            >
              {sellMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t("spot.market.sell")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
