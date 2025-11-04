import { Badge } from "@/components/ui/badge";

interface StatusBadgeProps {
  status?: string | null;
  className?: string;
}

type Variant = {
  className: string;
  label: string;
};

const STATUS_VARIANTS: Record<string, Variant> = {
  OPEN: { 
    className: "bg-primary/10 text-primary border-primary/20", 
    label: "Open" 
  },
  FILLED: { 
    className: "bg-accent/15 text-accent-foreground border-accent/30", 
    label: "Filled" 
  },
  EXPIRED: { 
    className: "bg-muted text-muted-foreground border-muted-foreground/20", 
    label: "Expired" 
  },
  CANCELLED: { 
    className: "bg-destructive/10 text-destructive border-destructive/20", 
    label: "Cancelled" 
  },
  EXERCISED: {
    className: "bg-green-500/10 text-green-700 border-green-500/20 dark:text-green-400",
    label: "Exercised"
  },
  DEFAULTED: {
    className: "bg-red-500/10 text-red-700 border-red-500/20 dark:text-red-400",
    label: "Defaulted"
  },
  PENDING: {
    className: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20 dark:text-yellow-400",
    label: "Pending"
  },
  LIQUIDATED: {
    className: "bg-orange-500/10 text-orange-700 border-orange-500/20 dark:text-orange-400",
    label: "Liquidated"
  },
  RESOLVED: {
    className: "bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-400",
    label: "Resolved"
  },
  MARGIN_CALL: {
    className: "bg-red-500/10 text-red-700 border-red-500/20 dark:text-red-400",
    label: "Margin Call"
  },
};

const DEFAULT_VARIANT: Variant = {
  className: "bg-muted text-muted-foreground border-muted-foreground/20",
  label: "Unknown"
};

// Track warned statuses to avoid console spam (one-time warnings)
const warnedStatuses = new Set<string>();

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  // Safe normalization: trim and uppercase
  const normalizedStatus = (typeof status === "string" && status.trim()) 
    ? status.trim().toUpperCase() 
    : "UNKNOWN";

  // Fallback guard: use STATUS_VARIANTS with DEFAULT_VARIANT fallback
  const variant = STATUS_VARIANTS[normalizedStatus] ?? DEFAULT_VARIANT;
  
  // One-time console.warn for unknown statuses (debugging)
  if (!STATUS_VARIANTS[normalizedStatus] && !warnedStatuses.has(normalizedStatus)) {
    console.warn(`[StatusBadge] Unknown status variant: "${status}" (normalized: "${normalizedStatus}"). Using default variant.`);
    warnedStatuses.add(normalizedStatus);
  }

  const displayLabel = variant.label === "Unknown" 
    ? (status || "Unknown").replace(/_/g, " ")
    : variant.label;

  return (
    <Badge 
      variant="outline" 
      className={`${variant.className} uppercase text-xs font-semibold tracking-wider rounded-full px-3 ${className}`}
      data-testid={`badge-status-${normalizedStatus.toLowerCase()}`}
    >
      {displayLabel}
    </Badge>
  );
}
