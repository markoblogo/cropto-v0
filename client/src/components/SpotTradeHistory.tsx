import { format, formatDistanceToNow } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTranslation } from "react-i18next";

interface PriceEntry {
  id?: string;
  price: number;
  delta?: number | null;
  timestamp: string | Date;
}

interface SpotTradeHistoryProps {
  data: PriceEntry[];
  maxRows?: number;
}

/**
 * Mini table showing recent price history / trades
 * Displays last N price updates as "quotes" if no actual trade data is available
 */
export function SpotTradeHistory({ data, maxRows = 5 }: SpotTradeHistoryProps) {
  const { t } = useTranslation();
  // Sort by timestamp (newest first) and limit rows
  const sortedData = [...data]
    .sort((a, b) => {
      const timeA = typeof a.timestamp === 'string' 
        ? new Date(a.timestamp).getTime() 
        : a.timestamp instanceof Date
        ? a.timestamp.getTime()
        : 0;
      const timeB = typeof b.timestamp === 'string'
        ? new Date(b.timestamp).getTime()
        : b.timestamp instanceof Date
        ? b.timestamp.getTime()
        : 0;
      return timeB - timeA;
    })
    .slice(0, maxRows);

  if (sortedData.length === 0) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        {t("spot.tradeHistory.empty")}
      </div>
    );
  }

  const formatTime = (timestamp: string | Date): string => {
    try {
      const date = typeof timestamp === 'string' 
        ? new Date(timestamp) 
        : timestamp;
      
      if (isNaN(date.getTime())) return t("spot.tradeHistory.na");
      
      // If less than 1 hour ago, show "X min ago", otherwise show time
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      
      if (diffMins < 60) {
        return diffMins <= 0
          ? t("spot.tradeHistory.justNow")
          : t("spot.tradeHistory.minutesAgo", { count: diffMins });
      } else {
        return format(date, "HH:mm");
      }
    } catch {
      return t("spot.tradeHistory.na");
    }
  };

  const getDirection = (delta: number | null | undefined): "up" | "down" | "flat" => {
    if (delta === null || delta === undefined) return "flat";
    if (delta > 0) return "up";
    if (delta < 0) return "down";
    return "flat";
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="h-8 text-xs">{t("spot.tradeHistory.headers.time")}</TableHead>
            <TableHead className="h-8 text-xs">{t("spot.tradeHistory.headers.price")}</TableHead>
            <TableHead className="h-8 text-xs">{t("spot.tradeHistory.headers.change")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedData.map((entry, index) => {
            const direction = getDirection(entry.delta);
            const directionColor = 
              direction === "up" ? "text-green-600 dark:text-green-400" :
              direction === "down" ? "text-red-600 dark:text-red-400" :
              "text-muted-foreground";
            
            return (
              <TableRow key={entry.id || `entry-${index}`} className="h-8">
                <TableCell className="text-xs py-1">
                  {formatTime(entry.timestamp)}
                </TableCell>
                <TableCell className="text-xs font-mono py-1">
                  ${entry.price.toFixed(2)}
                </TableCell>
                <TableCell className="text-xs py-1">
                  {entry.delta !== null && entry.delta !== undefined ? (
                    <span className={directionColor}>
                      {entry.delta > 0 ? "+" : ""}{entry.delta.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{t("common.dash")}</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
