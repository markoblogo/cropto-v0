export function MiniTrendMarker({
  change,
  changePct,
  className,
}: {
  change?: number;
  changePct?: number;
  className?: string;
}) {
  const base = typeof changePct === "number" ? changePct : change;
  if (typeof base !== "number" || Number.isNaN(base)) {
    return (
      <div className={className || "h-full w-full rounded border border-dashed border-black/40 dark:border-white/30"} />
    );
  }

  const direction = base > 0 ? "up" : base < 0 ? "down" : "flat";
  const intensity = Math.min(100, Math.max(10, Math.round(Math.abs(base) * 12)));

  const tone =
    direction === "up"
      ? "bg-emerald-600/70 dark:bg-emerald-400/70"
      : direction === "down"
        ? "bg-red-600/70 dark:bg-red-400/70"
        : "bg-slate-500/60 dark:bg-slate-300/60";

  return (
    <div className={className || "h-full w-full"}>
      <div className="flex h-full items-center gap-2">
        <span className={`h-2 ${tone} rounded-sm`} style={{ width: `${intensity}%` }} />
        <span className="text-[10px] text-foreground/55">
          {direction === "up" ? "▲" : direction === "down" ? "▼" : "■"}
        </span>
      </div>
    </div>
  );
}
