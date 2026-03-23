type IntensityLevel = "low" | "medium" | "high";
type IntensityDirection = "up" | "down" | "flat";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function IntensityBar({
  value,
  level,
  direction = "flat",
  compact = false,
  className,
}: {
  value?: number;
  level?: IntensityLevel;
  direction?: IntensityDirection;
  compact?: boolean;
  className?: string;
}) {
  const levelValue = level === "high" ? 82 : level === "medium" ? 55 : level === "low" ? 28 : undefined;
  const resolvedValue = typeof value === "number" && Number.isFinite(value) ? clamp(value, 0, 100) : levelValue;

  if (typeof resolvedValue !== "number") {
    return <div className={`h-1.5 w-full rounded bg-muted/55 ${className || ""}`.trim()} />;
  }

  const barTone =
    direction === "up"
      ? "bg-emerald-600/75 dark:bg-emerald-400/80"
      : direction === "down"
        ? "bg-red-600/75 dark:bg-red-400/80"
        : "bg-slate-600/70 dark:bg-slate-300/75";

  return (
    <div className={`flex items-center gap-1.5 ${className || ""}`.trim()}>
      <div className={`relative w-full overflow-hidden rounded ${compact ? "h-1.5" : "h-2"} bg-muted/60 dark:bg-slate-800/70`}>
        <span className={`block h-full rounded ${barTone}`} style={{ width: `${resolvedValue}%` }} />
      </div>
      {!compact ? <span className="text-[9px] text-foreground/62">{Math.round(resolvedValue)}</span> : null}
    </div>
  );
}
