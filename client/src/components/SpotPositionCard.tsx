import { useQuery } from "@tanstack/react-query";
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
import { kgToTons } from "@/lib/units";
import { useTranslation } from "react-i18next";

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

interface SpotPositionCardProps {
  commoditySlug: string;
  commodityName: string;
}

export function SpotPositionCard({ commoditySlug, commodityName }: SpotPositionCardProps) {
  const { t } = useTranslation();
  const { data: positions = [], isLoading } = useQuery<SpotPosition[]>({
    queryKey: ["/api/spot/positions"],
  });

  // Find position for this commodity
  const position = positions.find(p => p.commoditySlug === commoditySlug);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("spot.positionCard.title", { commodity: commodityName })}</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!position) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("spot.positionCard.title", { commodity: commodityName })}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            {t("spot.positionCard.empty")}
          </div>
        </CardContent>
      </Card>
    );
  }

  const quantityTons = kgToTons(parseFloat(position.quantityKg));
  const avgEntryPricePerTon = parseFloat(position.avgEntryPrice) * 1000; // Spot prices are stored per kg; convert to $/ton for UI
  const currentPricePerTon = parseFloat(position.currentPricePerKg) * 1000; // Spot prices are stored per kg; convert to $/ton for UI
  const pnl = parseFloat(position.pnl);
  const pnlPercent = parseFloat(position.pnlPercent);
  const isPositive = pnl >= 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("spot.positionCard.title", { commodity: commodityName })}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("spot.positions.headers.quantity")}</TableHead>
              <TableHead>{t("spot.positionCard.headers.avgEntryPrice")}</TableHead>
              <TableHead>{t("spot.positions.headers.currentPrice")}</TableHead>
              <TableHead>{t("spot.positions.headers.pnl")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-mono">
                {quantityTons.toFixed(2)}
              </TableCell>
              <TableCell className="font-mono">
                ${avgEntryPricePerTon.toFixed(2)}
              </TableCell>
              <TableCell className="font-mono">
                ${currentPricePerTon.toFixed(2)}
              </TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span className={`font-mono font-semibold ${isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                    {isPositive ? "+" : ""}${pnl.toFixed(2)}
                  </span>
                  <span className={`text-xs ${isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                    ({isPositive ? "+" : ""}{pnlPercent.toFixed(2)}%)
                  </span>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
