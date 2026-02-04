import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useTradingGuard } from "@/hooks/useTradingGuard";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { tonsToKg } from "@/lib/units";
import { Loader2, AlertCircle } from "lucide-react";

const MIN_TRADE_TONS = 0.001;

interface SpotOrderFormProps {
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

export function SpotOrderForm({
  commoditySlug,
  commodityName,
  currentPrice,
  onOpenLogin,
  onOpenWalletModal,
}: SpotOrderFormProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [orderType, setOrderType] = useState<"buy" | "sell">("buy");
  const [quantityTonnes, setQuantityTonnes] = useState("");
  const guardTradingAction = useTradingGuard({
    onOpenLogin,
    onOpenWalletModal,
  });

  const { data: balanceData } = useQuery<SpotBalance>({
    queryKey: ["/api/spot/balance"],
  });

  const availableBalance = balanceData ? parseFloat(balanceData.balance) : 0;
  const quantity = parseFloat(quantityTonnes) || 0;
  const isQuantityValid = quantity >= MIN_TRADE_TONS;
  const estimatedCost = quantity * currentPrice;
  const canAfford = estimatedCost <= availableBalance;

  const buyMutation = useMutation({
    mutationFn: async (data: { quantityKg: number }) => {
      const response = await apiRequest("POST", `/api/spot/${commoditySlug}/buy`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spot/balance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spot/positions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spot", commoditySlug] });
      toast({
        title: t("common.success"),
        description: t("spot.orderForm.toast.buySuccessDesc", {
          qty: quantityTonnes,
          commodity: commodityName,
        }),
      });
      setQuantityTonnes("");
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description: error.message || t("spot.orderForm.toast.buyFailedDesc"),
        variant: "destructive",
      });
    },
  });

  const sellMutation = useMutation({
    mutationFn: async (data: { quantityKg: number }) => {
      const response = await apiRequest("POST", `/api/spot/${commoditySlug}/sell`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spot/balance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spot/positions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spot", commoditySlug] });
      toast({
        title: t("common.success"),
        description: t("spot.orderForm.toast.sellSuccessDesc", {
          qty: quantityTonnes,
          commodity: commodityName,
        }),
      });
      setQuantityTonnes("");
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description: error.message || t("spot.orderForm.toast.sellFailedDesc"),
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const qtyTonnes = parseFloat(quantityTonnes);
    if (!qtyTonnes || qtyTonnes < MIN_TRADE_TONS) {
      toast({
        title: t("spot.orderForm.validation.invalidQuantityTitle"),
        description: t("spot.orderForm.validation.minQuantityDesc", {
          min: MIN_TRADE_TONS.toFixed(3),
        }),
        variant: "destructive",
      });
      return;
    }

    if (orderType === "buy" && !canAfford) {
      toast({
        title: t("spot.orderForm.validation.insufficientBalanceTitle"),
        description: t("spot.orderForm.validation.insufficientBalanceDesc", {
          needed: estimatedCost.toFixed(2),
          available: availableBalance.toFixed(2),
        }),
        variant: "destructive",
      });
      return;
    }

    guardTradingAction(() => {
      const qtyKg = tonsToKg(qtyTonnes);
      if (orderType === "buy") {
        buyMutation.mutate({ quantityKg: qtyKg });
      } else {
        sellMutation.mutate({ quantityKg: qtyKg });
      }
    });
  };

  const isPending = buyMutation.isPending || sellMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("spot.orderForm.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={orderType} onValueChange={(v) => setOrderType(v as "buy" | "sell")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="buy" className={orderType === "buy" ? "bg-green-600 text-white" : ""}>
              {t("spot.market.buy")}
            </TabsTrigger>
            <TabsTrigger value="sell" className={orderType === "sell" ? "bg-red-600 text-white" : ""}>
              {t("spot.market.sell")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="buy" className="space-y-4 mt-4">
            {availableBalance === 0 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {t("spot.orderForm.depositRequired")}
                </AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="buy-quantity">{t("spot.orderForm.quantityLabel")}</Label>
                <Input
                  id="buy-quantity"
                  type="number"
                  step="0.001"
                  min={MIN_TRADE_TONS}
                  value={quantityTonnes}
                  onChange={(e) => setQuantityTonnes(e.target.value)}
                  placeholder={t("spot.orderForm.quantityPlaceholder")}
                  disabled={isPending}
                />
                {!isQuantityValid && quantityTonnes && (
                  <p className="text-xs text-destructive">
                    {t("spot.orderForm.validation.minQuantityInline", {
                      min: MIN_TRADE_TONS.toFixed(3),
                    })}
                  </p>
                )}
              </div>

              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("spot.orderForm.priceLabel")}</span>
                  <span className="font-mono font-medium">
                    {t("spot.orderForm.priceValue", {
                      price: currentPrice.toFixed(2),
                    })}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("spot.orderForm.estimatedCostLabel")}</span>
                  <span className="font-mono font-medium">
                    {t("spot.orderForm.estimatedCostValue", {
                      total: estimatedCost.toFixed(2),
                    })}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("spot.orderForm.availableBalanceLabel")}</span>
                  <span className="font-mono font-medium">
                    {t("spot.orderForm.availableBalanceValue", {
                      balance: availableBalance.toFixed(2),
                    })}
                  </span>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-green-600 hover:bg-green-700"
                disabled={isPending || !quantity || !isQuantityValid || (orderType === "buy" && !canAfford)}
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("spot.orderForm.processing")}
                  </>
                ) : (
                  t("spot.orderForm.buyCta", { commodity: commodityName })
                )}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="sell" className="space-y-4 mt-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sell-quantity">{t("spot.orderForm.quantityLabel")}</Label>
                <Input
                  id="sell-quantity"
                  type="number"
                  step="0.001"
                  min={MIN_TRADE_TONS}
                  value={quantityTonnes}
                  onChange={(e) => setQuantityTonnes(e.target.value)}
                  placeholder={t("spot.orderForm.quantityPlaceholder")}
                  disabled={isPending}
                />
                {!isQuantityValid && quantityTonnes && (
                  <p className="text-xs text-destructive">
                    {t("spot.orderForm.validation.minQuantityInline", {
                      min: MIN_TRADE_TONS.toFixed(3),
                    })}
                  </p>
                )}
              </div>

              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("spot.orderForm.priceLabel")}</span>
                  <span className="font-mono font-medium">
                    {t("spot.orderForm.priceValue", {
                      price: currentPrice.toFixed(2),
                    })}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("spot.orderForm.estimatedPayoutLabel")}</span>
                  <span className="font-mono font-medium">
                    {t("spot.orderForm.estimatedPayoutValue", {
                      total: estimatedCost.toFixed(2),
                    })}
                  </span>
                </div>
              </div>

              <Button
                type="submit"
                variant="destructive"
                className="w-full"
                disabled={isPending || !quantity || !isQuantityValid}
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("spot.orderForm.processing")}
                  </>
                ) : (
                  t("spot.orderForm.sellCta", { commodity: commodityName })
                )}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
