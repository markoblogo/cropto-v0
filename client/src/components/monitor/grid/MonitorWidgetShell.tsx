import { ArrowDown, ArrowRight, EyeOff, MoveDown, MoveUp, Shrink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getGridBodyClass, getGridSpanClass, getGridUnitBodyClass, getGridUnitSpanClass } from "@/components/monitor/grid/widgetSpans";
import type { MonitorGridWidgetDescriptor } from "@/components/monitor/grid/types";

export function MonitorWidgetShell({
  widget,
  onHide,
  onGrowRight,
  onGrowDown,
  onResetSize,
  onMoveEarlier,
  onMoveLater,
}: {
  widget: MonitorGridWidgetDescriptor;
  onHide?: (id: string) => void;
  onGrowRight?: (id: string) => void;
  onGrowDown?: (id: string) => void;
  onResetSize?: (id: string) => void;
  onMoveEarlier?: (id: string) => void;
  onMoveLater?: (id: string) => void;
}) {
  const widthUnits = widget.gridWidthUnits ?? null;
  const heightUnits = widget.gridHeightUnits ?? null;
  const spanClass = widthUnits && heightUnits
    ? getGridUnitSpanClass(widthUnits, heightUnits)
    : getGridSpanClass(widget.defaultSpan);
  const bodyClass = heightUnits
    ? getGridUnitBodyClass(heightUnits)
    : getGridBodyClass(widget.defaultSpan);

  return (
    <section
      className={cn(
        "flex min-h-[230px] flex-col overflow-hidden rounded-2xl border border-black/70 bg-gradient-to-b from-card to-muted/25 text-foreground shadow-sm dark:border-white/35",
        spanClass,
      )}
      data-widget-id={widget.id}
    >
      <div className="flex items-start justify-between gap-3 border-b border-black/10 px-4 py-3 dark:border-white/10">
        <div className="min-w-0">
          <h3 className="text-base font-semibold leading-tight">{widget.title}</h3>
          {widget.subtitle ? <p className="mt-1 text-sm text-foreground/72">{widget.subtitle}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {widget.badgeLabel ? (
            <span className={cn("rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]", widget.badgeClassName || "border-black/30 bg-background/70 text-foreground/70 dark:border-white/20")}>{widget.badgeLabel}</span>
          ) : null}
          {onMoveEarlier ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-1.5 text-[10px] uppercase tracking-[0.14em] text-foreground/65"
              onClick={() => onMoveEarlier(widget.id)}
              title="Move earlier"
            >
              <MoveUp className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          {onMoveLater ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-1.5 text-[10px] uppercase tracking-[0.14em] text-foreground/65"
              onClick={() => onMoveLater(widget.id)}
              title="Move later"
            >
              <MoveDown className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          {onGrowRight ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-1.5 text-[10px] uppercase tracking-[0.14em] text-foreground/65"
              onClick={() => onGrowRight(widget.id)}
              title="Grow right"
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          {onGrowDown ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-1.5 text-[10px] uppercase tracking-[0.14em] text-foreground/65"
              onClick={() => onGrowDown(widget.id)}
              title="Grow down"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          {onResetSize ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-1.5 text-[10px] uppercase tracking-[0.14em] text-foreground/65"
              onClick={() => onResetSize(widget.id)}
              title="Reset size"
            >
              <Shrink className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          {widget.allowHide && onHide ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[10px] uppercase tracking-[0.14em] text-foreground/65"
              onClick={() => onHide(widget.id)}
            >
              <EyeOff className="mr-1 h-3.5 w-3.5" />
              Hide
            </Button>
          ) : null}
        </div>
      </div>
      <div className={cn("min-h-0 flex-1 overflow-y-auto px-4 py-3", bodyClass)}>{widget.body}</div>
      {(widget.footer || widget.sourceName || widget.updatedLabel) ? (
        <div className="flex items-center justify-between gap-2 border-t border-black/10 px-4 py-2 text-[11px] text-foreground/65 dark:border-white/10">
          <div className="min-w-0 truncate">{widget.footer || widget.sourceName || ""}</div>
          <div className="shrink-0">{widget.updatedLabel || ""}</div>
        </div>
      ) : null}
    </section>
  );
}
