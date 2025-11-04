import { Badge } from "@/components/ui/badge";

type OptionStatus = "OPEN" | "FILLED" | "EXPIRED" | "CANCELLED";

interface StatusBadgeProps {
  status: OptionStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const variants = {
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
  };

  const variant = variants[status];

  return (
    <Badge 
      variant="outline" 
      className={`${variant.className} uppercase text-xs font-semibold tracking-wider rounded-full px-3`}
      data-testid={`badge-status-${status.toLowerCase()}`}
    >
      {variant.label}
    </Badge>
  );
}
