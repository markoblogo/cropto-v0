import { useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getGridBodyClass, getGridSpanClass, getGridUnitBodyClass, getGridUnitSpanClass } from "@/components/monitor/grid/widgetSpans";
import type { MonitorGridWidgetDescriptor } from "@/components/monitor/grid/types";

export function MonitorWidgetShell({
  widget,
  onHide,
  onGrowRight,
  onShrinkRight,
  onGrowDown,
  onShrinkDown,
  onResetSize,
}: {
  widget: MonitorGridWidgetDescriptor;
  onHide?: (id: string) => void;
  onGrowRight?: (id: string) => void;
  onShrinkRight?: (id: string) => void;
  onGrowDown?: (id: string) => void;
  onShrinkDown?: (id: string) => void;
  onResetSize?: (id: string) => void;
}) {
  const widthUnits = widget.gridWidthUnits ?? null;
  const heightUnits = widget.gridHeightUnits ?? null;
  const spanClass = widthUnits && heightUnits
    ? getGridUnitSpanClass(widthUnits, heightUnits)
    : getGridSpanClass(widget.defaultSpan);
  const bodyClass = heightUnits
    ? getGridUnitBodyClass(heightUnits)
    : getGridBodyClass(widget.defaultSpan);

  const rightStartRef = useRef<number | null>(null);
  const bottomStartRef = useRef<number | null>(null);

  const attachHorizontalResize = (startX: number) => {
    rightStartRef.current = startX;
    const threshold = 48;

    const onMove = (event: MouseEvent) => {
      if (rightStartRef.current == null) return;
      const delta = event.clientX - rightStartRef.current;
      if (delta >= threshold) {
        onGrowRight?.(widget.id);
        rightStartRef.current = event.clientX;
      } else if (delta <= -threshold) {
        onShrinkRight?.(widget.id);
        rightStartRef.current = event.clientX;
      }
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      rightStartRef.current = null;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const attachVerticalResize = (startY: number) => {
    bottomStartRef.current = startY;
    const threshold = 48;

    const onMove = (event: MouseEvent) => {
      if (bottomStartRef.current == null) return;
      const delta = event.clientY - bottomStartRef.current;
      if (delta >= threshold) {
        onGrowDown?.(widget.id);
        bottomStartRef.current = event.clientY;
      } else if (delta <= -threshold) {
        onShrinkDown?.(widget.id);
        bottomStartRef.current = event.clientY;
      }
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      bottomStartRef.current = null;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <section
      className={cn(
        "group relative flex min-h-[220px] cursor-grab flex-col overflow-hidden rounded-2xl border border-black/70 bg-gradient-to-b from-card to-muted/25 text-foreground shadow-sm active:cursor-grabbing dark:border-white/35",
        spanClass,
      )}
      data-widget-id={widget.id}
      title="Drag to move. Resize from right or bottom edge."
    >
      <div className="flex items-start justify-between gap-3 border-b border-black/10 px-4 py-2.5 dark:border-white/10">
        <div className="min-w-0">
          <h3 className="text-base font-semibold leading-tight">{widget.title}</h3>
          {widget.subtitle ? <p className="mt-0.5 text-sm text-foreground/72">{widget.subtitle}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {widget.badgeLabel ? (
            <span className={cn("rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]", widget.badgeClassName || "border-black/30 bg-background/70 text-foreground/70 dark:border-white/20")}>{widget.badgeLabel}</span>
          ) : null}
          {onResetSize ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px] uppercase tracking-[0.14em] text-foreground/60"
              onClick={() => onResetSize(widget.id)}
              title="Reset size"
            >
              reset
            </Button>
          ) : null}
          {widget.allowHide && onHide ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-foreground/65"
              onClick={() => onHide(widget.id)}
              title="Hide widget"
            >
              <X className="h-3.5 w-3.5" />
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

      <button
        type="button"
        aria-label="Resize width"
        className="absolute right-0 top-6 z-10 h-[calc(100%-36px)] w-2 cursor-ew-resize rounded-l-sm bg-transparent opacity-0 transition-opacity group-hover:opacity-100"
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          attachHorizontalResize(event.clientX);
        }}
      />

      <button
        type="button"
        aria-label="Resize height"
        className="absolute bottom-0 left-6 z-10 h-2 w-[calc(100%-36px)] cursor-ns-resize rounded-t-sm bg-transparent opacity-0 transition-opacity group-hover:opacity-100"
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          attachVerticalResize(event.clientY);
        }}
      />
    </section>
  );
}
