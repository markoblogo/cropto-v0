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

interface OptionChainTableProps {
  options: Option[];
  isLoading: boolean;
  onView?: (option: Option) => void;
}

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
      return "N/A";
    }
  }
  
  if (!expiry || isNaN(expiry.getTime())) {
    return "N/A";
  }

  try {
    const now = new Date();
    const daysDiff = differenceInDays(expiry, now);

    if (daysDiff < 0) {
      return `Expired ${Math.abs(daysDiff)}d ago`;
    } else if (daysDiff === 0) {
      return "Expires today";
    } else if (daysDiff === 1) {
      return "1d";
    } else if (daysDiff < 7) {
      return `${daysDiff}d`;
    } else if (daysDiff < 30) {
      const weeks = Math.floor(daysDiff / 7);
      return `${weeks}w`;
    } else {
      const months = Math.floor(daysDiff / 30);
      return `${months}m`;
    }
  } catch {
    return "N/A";
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
  return option.indexId || "Unknown";
}

export function OptionChainTable({ options, isLoading, onView }: OptionChainTableProps) {
  if (isLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Loading options...
      </div>
    );
  }

  if (options.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No options found
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Commodity</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Side</TableHead>
            <TableHead>Strike ($/t)</TableHead>
            <TableHead>Qty (t)</TableHead>
            <TableHead>Premium</TableHead>
            <TableHead>Expiry</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {options.map((option) => {
            const strikePerTon = parseFloat(option.strike || "0");
            const quantityTons = parseFloat(option.qty || "0");
            const premiumPerTon = parseFloat(option.premium || "0");
            const totalPremium = premiumPerTon * quantityTons;
            
            // Determine side (LONG if buyer, SHORT if issuer/seller)
            const side = option.buyerId ? "LONG" : option.issuerId ? "SHORT" : "—";
            
            // Format expiration date
            const expiryDate = option.expirationDate 
              ? (typeof option.expirationDate === 'string' 
                  ? new Date(option.expirationDate) 
                  : option.expirationDate)
              : null;
            
            const expiryFormatted = expiryDate 
              ? format(expiryDate, "MMM dd, yyyy")
              : "N/A";
            
            const timeToExpiry = expiryDate 
              ? formatTimeToExpiry(expiryDate)
              : "N/A";

            return (
              <TableRow key={option.id}>
                <TableCell className="font-medium">
                  {getCommodityName(option)}
                </TableCell>
                <TableCell>
                  <OptionTypeBadge type={option.type as "CALL" | "PUT"} />
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">{side}</span>
                </TableCell>
                <TableCell className="font-mono">
                  ${strikePerTon.toFixed(2)}
                </TableCell>
                <TableCell className="font-mono">
                  {quantityTons.toFixed(2)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-mono text-sm">
                      {premiumPerTon.toFixed(2)} CROPT/t
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Total: {totalPremium.toFixed(2)} CROPT
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
                    View
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

