import { format } from "date-fns";
import { differenceInDays } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./StatusBadge";
import { OptionTypeBadge } from "./OptionTypeBadge";
import type { Option } from "@shared/schema";
import { Eye } from "lucide-react";
import { useTranslation } from "react-i18next";

interface OptionChainTableProps {
  options: Option[];
  isLoading: boolean;
  onView?: (option: Option) => void;
}

export function OptionChainTable({ options, isLoading, onView }: OptionChainTableProps) {
  const { t } = useTranslation();

  /**
   * Calculate time to expiry and format it nicely
   */
  function formatTimeToExpiry(expirationDate: string | Date | undefined | null): string {
    let expiry: Date | null = null;
    
    if (expirationDate instanceof Date) {
      expiry = expirationDate;
    } else if (typeof expirationDate === 'string') {
      try {
        expiry = new Date(expirationDate);
      } catch {
        return t("page.portfolio.timeToExpiry.na");
      }
    }
    
    if (!expiry || isNaN(expiry.getTime())) {
      return t("page.portfolio.timeToExpiry.na");
    }

    try {
      const now = new Date();
      const daysDiff = differenceInDays(expiry, now);

      if (daysDiff < 0) {
        return t("page.portfolio.timeToExpiry.expiredAgo", { count: Math.abs(daysDiff), days: Math.abs(daysDiff) });
      } else if (daysDiff === 0) {
        return t("page.portfolio.timeToExpiry.expiresToday");
      } else if (daysDiff === 1) {
        return t("component.optionChainTable.time.oneDay");
      } else if (daysDiff < 7) {
        return t("component.optionChainTable.time.days", { days: daysDiff });
      } else if (daysDiff < 30) {
        const weeks = Math.floor(daysDiff / 7);
        return t("component.optionChainTable.time.weeks", { weeks });
      } else {
        const months = Math.floor(daysDiff / 30);
        return t("component.optionChainTable.time.months", { months });
      }
    } catch {
      return t("page.portfolio.timeToExpiry.na");
    }
  }

  /**
   * Extract commodity name from option title or use indexId
   */
  function getCommodityName(option: Option): string {
    // Try to extract from title (format: COMMODITY-QTY-CREATED-EXPIRES-VOLUME-ID)
    if (option.title) {
      const parts = option.title.split('-');
      if (parts.length > 0 && parts[0]) {
        return parts[0].replace(/_/g, ' ');
      }
    }
    // Fallback to indexId or a default
    return option.indexId || t("component.optionChainTable.values.unknown");
  }

  if (isLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {t("component.optionChainTable.loading")}
      </div>
    );
  }

  if (options.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {t("component.optionChainTable.empty")}
      </div>
    );
  }

  return (
    <div className="rounded-md border text-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("component.optionChainTable.headers.commodity")}</TableHead>
            <TableHead>Mkt</TableHead>
            <TableHead>{t("component.optionChainTable.headers.type")}</TableHead>
            <TableHead>{t("component.optionChainTable.headers.side")}</TableHead>
            <TableHead>{t("component.optionChainTable.headers.strike")}</TableHead>
            <TableHead>{t("component.optionChainTable.headers.qty")}</TableHead>
            <TableHead>{t("component.optionChainTable.headers.premium")}</TableHead>
            <TableHead>{t("component.optionChainTable.headers.expiry")}</TableHead>
            <TableHead>{t("component.optionChainTable.headers.status")}</TableHead>
            <TableHead className="text-right">{t("component.optionChainTable.headers.action")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {options.map((option) => {
            const strikePerTon = parseFloat(option.strike || "0");
            const quantityTons = parseFloat(option.qty || "0");
            const premiumPerTon = parseFloat(option.premium || "0");
            const totalPremium = premiumPerTon * quantityTons;
            
            // Determine side (LONG if buyer, SHORT if issuer/seller)
            const side = option.buyerId
              ? t("component.optionChainTable.side.long")
              : option.issuerId
              ? t("component.optionChainTable.side.short")
              : t("component.optionChainTable.values.dash");
            
            // Format expiration date
            const expiryDate = option.expirationDate 
              ? (typeof option.expirationDate === 'string' 
                  ? new Date(option.expirationDate) 
                  : option.expirationDate)
              : null;
            
            const expiryFormatted = expiryDate 
              ? format(expiryDate, "MMM dd, yyyy")
              : t("page.portfolio.timeToExpiry.na");
            
            const timeToExpiry = expiryDate 
              ? formatTimeToExpiry(expiryDate)
              : t("page.portfolio.timeToExpiry.na");

            return (
              <TableRow key={option.id}>
                <TableCell className="font-medium">
                  {getCommodityName(option)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {(option as any).country || "N/A"}
                </TableCell>
                <TableCell>
                  <OptionTypeBadge type={option.type as "CALL" | "PUT"} />
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">{side}</span>
                </TableCell>
                <TableCell className="font-mono text-sm">
                  ${strikePerTon.toFixed(2)}
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {quantityTons.toFixed(2)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-mono text-xs">
                      {t("component.optionChainTable.values.premiumPerTon", { premium: premiumPerTon.toFixed(2) })}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {t("component.optionChainTable.values.premiumTotal", { total: totalPremium.toFixed(2) })}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-sm">{expiryFormatted}</span>
                    <span className="text-xs text-muted-foreground">
                      {timeToExpiry}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={option.status || "UNKNOWN"} />
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onView?.(option)}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    {t("component.optionChainTable.action.view")}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
