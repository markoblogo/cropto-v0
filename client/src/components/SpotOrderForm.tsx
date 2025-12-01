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
        title: "Success",
        description: `Successfully bought ${quantityTonnes}t of ${commodityName}`,
      });
      setQuantityTonnes("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to buy commodity",
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
        title: "Success",
        description: `Successfully sold ${quantityTonnes}t of ${commodityName}`,
      });
      setQuantityTonnes("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to sell commodity",
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

    if (orderType === "buy" && !canAfford) {
      toast({
        title: "Insufficient balance",
        description: `You need ${estimatedCost.toFixed(2)} CROPT but only have ${availableBalance.toFixed(2)} CROPT`,
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
        <CardTitle>Place Order</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={orderType} onValueChange={(v) => setOrderType(v as "buy" | "sell")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="buy" className={orderType === "buy" ? "bg-green-600 text-white" : ""}>
              Buy
            </TabsTrigger>
            <TabsTrigger value="sell" className={orderType === "sell" ? "bg-red-600 text-white" : ""}>
              Sell
            </TabsTrigger>
          </TabsList>

          <TabsContent value="buy" className="space-y-4 mt-4">
            {availableBalance === 0 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  You need to deposit CROPT from your on-chain balance to your internal trading balance first.
                </AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="buy-quantity">Quantity (t)</Label>
                <Input
                  id="buy-quantity"
                  type="number"
                  step="0.01"
                  min="0"
                  value={quantityTonnes}
                  onChange={(e) => setQuantityTonnes(e.target.value)}
                  placeholder="0.00"
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Price:</span>
                  <span className="font-mono font-medium">
                    ${currentPrice.toFixed(2)} / ton
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Estimated Cost:</span>
                  <span className="font-mono font-medium">
                    {estimatedCost.toFixed(2)} CROPT
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Available CROPT:</span>
                  <span className="font-mono font-medium">
                    {availableBalance.toFixed(2)} CROPT
                  </span>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-green-600 hover:bg-green-700"
                disabled={isPending || !quantity || (orderType === "buy" && !canAfford)}
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  `Buy ${commodityName}`
                )}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="sell" className="space-y-4 mt-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sell-quantity">Quantity (t)</Label>
                <Input
                  id="sell-quantity"
                  type="number"
                  step="0.01"
                  min="0"
                  value={quantityTonnes}
                  onChange={(e) => setQuantityTonnes(e.target.value)}
                  placeholder="0.00"
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Price:</span>
                  <span className="font-mono font-medium">
                    ${currentPrice.toFixed(2)} / ton
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Estimated Payout:</span>
                  <span className="font-mono font-medium">
                    {estimatedCost.toFixed(2)} CROPT
                  </span>
                </div>
              </div>

              <Button
                type="submit"
                variant="destructive"
                className="w-full"
                disabled={isPending || !quantity}
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  `Sell ${commodityName}`
                )}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

