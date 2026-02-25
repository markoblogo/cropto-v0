type MetricChipVariant = "unit" | "type" | "provider";
type MetricChipTone = "neutral" | "accent" | "muted";

export function MetricChip({
  label,
  variant = "unit",
  tone = "neutral",
  className,
}: {
  label: string;
  variant?: MetricChipVariant;
  tone?: MetricChipTone;
  className?: string;
}) {
  const variantClass =
    variant === "type"
      ? "uppercase tracking-wide"
      : variant === "provider"
        ? "tracking-[0.08em]"
        : "";
  const toneClass =
    tone === "accent"
      ? "border-primary/45 bg-primary/15 text-foreground dark:text-primary-foreground"
      : tone === "muted"
        ? "border-black/55 bg-muted/60 text-foreground/70 dark:border-white/35 dark:text-slate-300"
        : "border-black/70 bg-muted/65 text-foreground dark:border-white/45 dark:text-slate-200";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${variantClass} ${toneClass} ${className || ""}`.trim()}
    >
      {label}
    </span>
  );
}
