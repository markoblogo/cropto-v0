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
import { useTradingGuard } from "@/hooks/useTradingGuard";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { tonsToKg, formatTons } from "@/lib/units";
import { Loader2, AlertCircle, ArrowDownToLine } from "lucide-react";

const MIN_TRADE_TONS = 0.001;

interface SpotBuyModalProps {
  isOpen: boolean;
  onClose: () => void;
  commoditySlug: string;
  commodityName: string;
  currentPrice: number;
  onOpenLogin?: () => void;
  onOpenWalletModal?: () => void;
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
  onOpenLogin,
  onOpenWalletModal,
}: SpotBuyModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [quantityTonnes, setQuantityTonnes] = useState("");
  const guardTradingAction = useTradingGuard({
    onOpenLogin,
    onOpenWalletModal,
  });

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
        title: t("spot.buyModal.depositSuccessTitle"),
        description: t("spot.buyModal.depositSuccessDesc"),
      });
    },
    onError: (error: any) => {
      toast({
        title: t("spot.buyModal.depositFailedTitle"),
        description: error.message || t("spot.buyModal.depositFailedDesc"),
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
        title: t("toast.success"),
        description: t("spot.buyModal.successDesc", {
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
        description: error.message || t("spot.buyModal.errorDesc"),
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const qtyTonnes = parseFloat(quantityTonnes);
    if (!qtyTonnes || qtyTonnes < MIN_TRADE_TONS) {
      toast({
        title: t("spot.buyModal.invalidQuantityTitle"),
        description: t("spot.buyModal.invalidQuantityDesc", {
          min: MIN_TRADE_TONS.toFixed(3),
        }),
        variant: "destructive",
      });
      return;
    }
    if (!canAfford) {
      toast({
        title: t("spot.buyModal.insufficientBalanceTitle"),
        description: t("spot.buyModal.insufficientBalanceDesc", {
          needed: totalCost.toFixed(2),
          available: availableBalance.toFixed(2),
        }),
        variant: "destructive",
      });
      return;
    }
    // Guard wraps the actual trading action
    guardTradingAction(() => {
      // Spot API expects kg; convert tonnes to kg
      const qtyKg = tonsToKg(qtyTonnes);
      buyMutation.mutate({ quantityKg: qtyKg });
    });
  };

  // currentPrice is already in price per ton
  const pricePerTon = currentPrice;
  const qtyTonnesNum = parseFloat(quantityTonnes) || 0;
  const isQuantityValid = qtyTonnesNum >= MIN_TRADE_TONS;
  const totalCost = qtyTonnesNum * pricePerTon || 0;
  const availableBalance = balanceData ? parseFloat(balanceData.balance) : 0;
  const canAfford = totalCost <= availableBalance;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-testid="dialog-spot-buy">
        <DialogHeader>
          <DialogTitle>{t("spot.buyModal.title", { commodity: commodityName })}</DialogTitle>
          <DialogDescription>
            {t("spot.buyModal.description")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {availableBalance === 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex flex-col gap-2">
                <span>{t("spot.buyModal.depositNotice")}</span>
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
                      {t("spot.buyModal.depositing")}
                    </>
                  ) : (
                    <>
                      <ArrowDownToLine className="mr-2 h-4 w-4" />
                      {t("spot.buyModal.depositButton", { amount: 3 })}
                    </>
                  )}
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("spot.buyModal.currentPriceLabel")}</span>
              <span className="font-mono font-medium" data-testid="text-current-price">
                {t("spot.buyModal.pricePerTon", { price: pricePerTon.toFixed(2) })}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("spot.buyModal.internalBalanceLabel")}</span>
              <span className="font-mono font-medium" data-testid="text-available-balance">
                {t("spot.buyModal.internalBalanceValue", { balance: availableBalance.toFixed(2) })}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quantity">{t("spot.buyModal.quantityLabel")}</Label>
            <Input
              id="quantity"
              type="number"
              step="0.001"
              min={MIN_TRADE_TONS}
              placeholder={t("spot.buyModal.quantityPlaceholder")}
              value={quantityTonnes}
              onChange={(e) => setQuantityTonnes(e.target.value)}
              data-testid="input-quantity"
            />
            {!isQuantityValid && quantityTonnes && (
              <p className="text-xs text-destructive">
                {t("spot.buyModal.minimumQuantity", { min: MIN_TRADE_TONS.toFixed(3) })}
              </p>
            )}
          </div>

          {quantityTonnes && parseFloat(quantityTonnes) > 0 && (
            <div className="space-y-2 p-3 bg-muted rounded-lg">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("spot.buyModal.totalCostLabel")}</span>
                <span className="font-mono font-medium" data-testid="text-total-cost">
                  {t("spot.buyModal.totalCostValue", { total: totalCost.toFixed(2) })}
                </span>
              </div>
              {!canAfford && (
                <p className="text-sm text-destructive" data-testid="text-insufficient-balance">
                  {t("spot.buyModal.insufficientBalanceInline")}
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
              {t("button.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={buyMutation.isPending || !canAfford || !quantityTonnes || !isQuantityValid}
              data-testid="button-buy"
            >
              {buyMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t("spot.market.buy")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
