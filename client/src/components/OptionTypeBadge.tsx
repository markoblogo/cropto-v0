import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown } from "lucide-react";

interface OptionTypeBadgeProps {
  type: "CALL" | "PUT";
}

export function OptionTypeBadge({ type }: OptionTypeBadgeProps) {
  const isCall = type === "CALL";

  return (
    <Badge 
      variant="outline"
      className={`inline-flex items-center gap-1 uppercase text-xs font-semibold tracking-wider rounded-full px-3 ${
        isCall 
          ? "bg-accent/15 text-accent-foreground border-accent/30" 
          : "bg-primary/10 text-primary border-primary/20"
      }`}
      data-testid={`badge-type-${type.toLowerCase()}`}
    >
      {isCall ? (
        <TrendingUp className="w-3 h-3" />
      ) : (
        <TrendingDown className="w-3 h-3" />
      )}
      {type}
    </Badge>
  );
}
