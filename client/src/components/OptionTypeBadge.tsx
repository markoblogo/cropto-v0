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
      className={`inline-flex items-center gap-1 uppercase text-xs font-semibold tracking-wider ${
        isCall 
          ? "bg-chart-2/10 text-chart-2 border-chart-2/20" 
          : "bg-chart-5/10 text-chart-5 border-chart-5/20"
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
