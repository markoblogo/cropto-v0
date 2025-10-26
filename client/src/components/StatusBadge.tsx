import { Badge } from "@/components/ui/badge";

type OptionStatus = "OPEN" | "FILLED" | "EXPIRED" | "CANCELLED";

interface StatusBadgeProps {
  status: OptionStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const variants = {
    OPEN: { className: "bg-chart-1/10 text-chart-1 border-chart-1/20", label: "Open" },
    FILLED: { className: "bg-chart-2/10 text-chart-2 border-chart-2/20", label: "Filled" },
    EXPIRED: { className: "bg-muted text-muted-foreground border-muted-foreground/20", label: "Expired" },
    CANCELLED: { className: "bg-destructive/10 text-destructive border-destructive/20", label: "Cancelled" },
  };

  const variant = variants[status];

  return (
    <Badge 
      variant="outline" 
      className={`${variant.className} uppercase text-xs font-semibold tracking-wider`}
      data-testid={`badge-status-${status.toLowerCase()}`}
    >
      {variant.label}
    </Badge>
  );
}
