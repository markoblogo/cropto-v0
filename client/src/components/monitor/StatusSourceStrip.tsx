import { Badge } from "@/components/ui/badge";
import { MetricChip } from "@/components/monitor/MetricChip";

export function StatusSourceStrip({
  status,
  statusClassName,
  sourceName,
  sourceUrl,
  updatedLabel,
  fallbackReason,
  compact = false,
}: {
  status: string;
  statusClassName?: string;
  sourceName?: string;
  sourceUrl?: string;
  updatedLabel?: string;
  fallbackReason?: string;
  compact?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-2 ${compact ? "text-[10px]" : "text-[11px]"} text-foreground/68`}>
      <div className="flex min-w-0 items-center gap-1.5">
        <Badge className={`${compact ? "h-4 px-1.5 text-[9px]" : "h-5 px-2 text-[10px]"} ${statusClassName || ""}`}>{status}</Badge>
        {sourceName ? (
          sourceUrl ? (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="truncate hover:text-foreground"
              title={sourceName}
            >
              {sourceName}
            </a>
          ) : (
            <span className="truncate" title={sourceName}>{sourceName}</span>
          )
        ) : (
          <span className="truncate">Source n/a</span>
        )}
        {fallbackReason ? <MetricChip label="fallback" variant="type" tone="muted" /> : null}
      </div>
      <span className="shrink-0">{updatedLabel || "n/a"}</span>
    </div>
  );
}
