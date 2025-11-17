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
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
}

export function SpotPositionsTable({ positions, isLoading }: SpotPositionsTableProps) {
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
                <TableHead className="text-right">Quantity (kg)</TableHead>
                <TableHead className="text-right">Entry Price ($/kg)</TableHead>
                <TableHead className="text-right">Current Price ($/kg)</TableHead>
                <TableHead className="text-right">Current Value</TableHead>
                <TableHead className="text-right">P&L</TableHead>
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
                      {parseFloat(position.quantityKg).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono" data-testid={`text-entry-price-${position.commoditySlug}`}>
                      ${parseFloat(position.avgEntryPrice).toFixed(6)}
                    </TableCell>
                    <TableCell className="text-right font-mono" data-testid={`text-current-price-${position.commoditySlug}`}>
                      ${parseFloat(position.currentPricePerKg).toFixed(6)}
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
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
