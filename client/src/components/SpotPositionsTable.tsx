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
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SpotSellModal } from "@/components/SpotSellModal";
import { useTradingGuard } from "@/hooks/useTradingGuard";
import { queryClient } from "@/lib/queryClient";
import { kgToTons, formatTons } from "@/lib/units";

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
}

export function SpotPositionsTable({ 
  positions, 
  isLoading,
  onOpenLogin,
  onOpenWalletModal,
}: SpotPositionsTableProps) {
  const [sellModalOpen, setSellModalOpen] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<SpotPosition | null>(null);
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
            Spot Positions
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
            Spot Positions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              No spot positions yet. Visit the Spot Market on the homepage to start trading.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-spot-positions">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Spot Positions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Commodity</TableHead>
                <TableHead className="text-right">Quantity (t)</TableHead>
                <TableHead className="text-right">Entry Price ($/t)</TableHead>
                <TableHead className="text-right">Current Price ($/t)</TableHead>
                <TableHead className="text-right">Current Value</TableHead>
                <TableHead className="text-right">P&L</TableHead>
                <TableHead className="text-right">Actions</TableHead>
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

                // Convert from kg to tonnes for display
                const quantityTonnes = kgToTons(parseFloat(position.quantityKg));
                const entryPricePerTon = parseFloat(position.avgEntryPrice) * 1000;
                const currentPricePerTon = parseFloat(position.currentPricePerKg) * 1000;

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
                      {formatTons(quantityTonnes)} t
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
                      {parseFloat(position.quantityKg) !== 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSellClick(position)}
                          data-testid={`button-sell-${position.commoditySlug}`}
                        >
                          Sell
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
          currentPrice={parseFloat(selectedPosition.currentPricePerKg) * 1000} // Convert kg to ton (price per ton)
          initialQuantity={parseFloat(selectedPosition.quantityKg)} // Pass in kg, modal will convert to tonnes for display
        />
      )}
    </Card>
  );
}
