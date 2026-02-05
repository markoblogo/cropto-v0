import { useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SpotSellModal } from "@/components/SpotSellModal";
import { useTradingGuard } from "@/hooks/useTradingGuard";
import { useUserTier } from "@/hooks/useUserTier";
import { queryClient } from "@/lib/queryClient";
import { kgToTons, formatTons } from "@/lib/units";
import { useTranslation } from "react-i18next";
import { openAuthPrompt } from "@/lib/authPrompt";

interface SpotPosition {
  id: string;
  commoditySlug: string;
  commodityName: string;
  quantityKg: string;
  avgEntryPrice: string;
  currentPricePerKg: string;
  currentValue: string;
  entryValue: string;
  pnl: string;
  pnlPercent: string;
  createdAt: Date;
  updatedAt: Date;
}

interface SpotPositionsTableProps {
  positions: SpotPosition[];
  isLoading: boolean;
  onOpenLogin?: () => void;
  onOpenWalletModal?: () => void;
  optionsByCommodity?: Record<string, number>;
  onShowOptionsForCommodity?: (commoditySlug: string) => void;
}

export function SpotPositionsTable({ 
  positions, 
  isLoading,
  onOpenLogin,
  onOpenWalletModal,
  optionsByCommodity,
  onShowOptionsForCommodity,
}: SpotPositionsTableProps) {
  const { t } = useTranslation();
  const [sellModalOpen, setSellModalOpen] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<SpotPosition | null>(null);
  const userTier = useUserTier();
  const guardTradingAction = useTradingGuard({
    onOpenLogin,
    onOpenWalletModal,
  });

  const handleSellClick = (position: SpotPosition) => {
    guardTradingAction(() => {
      setSelectedPosition(position);
      setSellModalOpen(true);
    });
  };

  const handleSellModalClose = () => {
    setSellModalOpen(false);
    setSelectedPosition(null);
    // Invalidate spot positions query to refresh the table after sell
    queryClient.invalidateQueries({ queryKey: ["/api/spot/positions"] });
  };
  if (isLoading) {
    return (
      <Card data-testid="card-spot-positions">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            {t("spot.positions.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-12 flex-1" />
                <Skeleton className="h-12 flex-1" />
                <Skeleton className="h-12 flex-1" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!positions || positions.length === 0) {
    return (
      <Card data-testid="card-spot-positions">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            {t("spot.positions.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {userTier === "guest" ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm font-medium mb-3">{t("spot.positions.emptyGuestTitle")}</p>
              <Button size="sm" data-testid="button-spot-empty-sign-in" onClick={() => openAuthPrompt()}>
                {t("button.login")}
              </Button>
            </div>
          ) : userTier === "user_no_wallet" ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm font-medium mb-3">{t("spot.positions.emptyNoWalletTitle")}</p>
              {onOpenWalletModal && (
                <Button size="sm" onClick={onOpenWalletModal} data-testid="button-spot-empty-connect-wallet">
                  {t("button.connectWallet")}
                </Button>
              )}
            </div>
          ) : (
            <Alert>
              <AlertDescription>
                {t("spot.positions.emptyDefault")}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-spot-positions">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          {t("spot.positions.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("spot.positions.headers.commodity")}</TableHead>
                <TableHead className="text-right">{t("spot.positions.headers.quantity")}</TableHead>
                <TableHead className="text-right">{t("spot.positions.headers.entryPrice")}</TableHead>
                <TableHead className="text-right">{t("spot.positions.headers.currentPrice")}</TableHead>
                <TableHead className="text-right">{t("spot.positions.headers.currentValue")}</TableHead>
                <TableHead className="text-right">{t("spot.positions.headers.pnl")}</TableHead>
                <TableHead className="text-right">{t("spot.positions.headers.options")}</TableHead>
                <TableHead className="text-right">{t("spot.positions.headers.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {positions.map((position) => {
                const pnl = parseFloat(position.pnl);
                const pnlPercent = parseFloat(position.pnlPercent);
                const isPositive = pnl > 0;
                const isNegative = pnl < 0;
                const isNeutral = pnl === 0;

                const TrendIcon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;
                const pnlColor = isPositive
                  ? "text-green-600 dark:text-green-400"
                  : isNegative
                  ? "text-red-600 dark:text-red-400"
                  : "text-muted-foreground";

                // Spot positions are stored in kg on the backend; convert to tonnes for display
                const quantityKg = parseFloat(position.quantityKg);
                const quantityTonnes = kgToTons(quantityKg);
                const entryPricePerTon = parseFloat(position.avgEntryPrice) * 1000;
                const currentPricePerTon = parseFloat(position.currentPricePerKg) * 1000;
                const isLong = quantityTonnes > 0;
                const isShort = quantityTonnes < 0;

                return (
                  <TableRow key={position.id} data-testid={`row-spot-position-${position.commoditySlug}`}>
                    <TableCell>
                      <div className="flex items-center gap-2" data-testid={`cell-commodity-${position.commoditySlug}`}>
                        <img
                          src={`/commodities/${position.commoditySlug}.png`}
                          alt={position.commodityName}
                          className="w-6 h-6 object-contain"
                          data-testid={`img-commodity-${position.commoditySlug}`}
                        />
                        <span className="font-medium" data-testid={`text-commodity-name-${position.commoditySlug}`}>
                          {position.commodityName}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono" data-testid={`text-quantity-${position.commoditySlug}`}>
                      <div className="flex items-center justify-end gap-2">
                        {formatTons(quantityTonnes)} t
                        {isLong && (
                          <Badge
                            variant="outline"
                            className="text-xs text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950"
                            data-testid={`badge-long-${position.commoditySlug}`}
                          >
                            {t("spot.positions.badge.long")}
                          </Badge>
                        )}
                        {isShort && (
                          <Badge
                            variant="outline"
                            className="text-xs text-red-700 dark:text-red-300 border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950"
                            data-testid={`badge-short-${position.commoditySlug}`}
                          >
                            {t("spot.positions.badge.short")}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono" data-testid={`text-entry-price-${position.commoditySlug}`}>
                      ${entryPricePerTon.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono" data-testid={`text-current-price-${position.commoditySlug}`}>
                      ${currentPricePerTon.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono" data-testid={`text-current-value-${position.commoditySlug}`}>
                      ${parseFloat(position.currentValue).toFixed(2)}
                    </TableCell>
                    <TableCell className={`text-right ${pnlColor}`}>
                      <div className="flex items-center justify-end gap-1" data-testid={`cell-pnl-${position.commoditySlug}`}>
                        <TrendIcon className="h-4 w-4" data-testid={`icon-pnl-trend-${position.commoditySlug}`} />
                        <span className="font-mono font-medium" data-testid={`text-pnl-value-${position.commoditySlug}`}>
                          {isPositive ? "+" : ""}
                          ${pnl.toFixed(2)}
                        </span>
                        <span className="text-xs" data-testid={`text-pnl-percent-${position.commoditySlug}`}>
                          ({isPositive ? "+" : ""}{pnlPercent.toFixed(2)}%)
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {optionsByCommodity?.[position.commoditySlug] ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onShowOptionsForCommodity?.(position.commoditySlug)}
                          data-testid={`button-show-options-${position.commoditySlug}`}
                        >
                          {t("spot.positions.optionsCount", {
                            count: optionsByCommodity[position.commoditySlug],
                          })}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">{t("common.dash")}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {quantityKg > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSellClick(position)}
                          data-testid={`button-sell-${position.commoditySlug}`}
                        >
                          {t("spot.market.sell")}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      {/* Spot Sell Modal */}
      {selectedPosition && (
        <SpotSellModal
          isOpen={sellModalOpen}
          onClose={handleSellModalClose}
          commoditySlug={selectedPosition.commoditySlug}
          commodityName={selectedPosition.commodityName}
          currentPrice={parseFloat(selectedPosition.currentPricePerKg) * 1000} // Spot price is per kg; convert to $/ton for UI
          initialQuantity={Math.abs(parseFloat(selectedPosition.quantityKg))} // Pass kg; modal converts to tonnes for display
          onOpenLogin={onOpenLogin}
          onOpenWalletModal={onOpenWalletModal}
        />
      )}
    </Card>
  );
}
