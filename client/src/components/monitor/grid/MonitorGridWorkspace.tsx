import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MonitorWidgetShell } from "@/components/monitor/grid/MonitorWidgetShell";
import type { MonitorGridWidgetDescriptor } from "@/components/monitor/grid/types";

export function MonitorGridWorkspace({
  widgets,
  hiddenWidgets,
  grouping,
  onGroupingChange,
  onHide,
  onRestore,
  onRestoreAll,
  onGrowRight,
  onGrowDown,
  onResetSize,
  onMoveEarlier,
  onMoveLater,
}: {
  widgets: MonitorGridWidgetDescriptor[];
  hiddenWidgets: MonitorGridWidgetDescriptor[];
  grouping: "manual" | "topic" | "source";
  onGroupingChange: (grouping: "manual" | "topic" | "source") => void;
  onHide: (id: string) => void;
  onRestore: (id: string) => void;
  onRestoreAll: () => void;
  onGrowRight: (id: string) => void;
  onGrowDown: (id: string) => void;
  onResetSize: (id: string) => void;
  onMoveEarlier: (id: string) => void;
  onMoveLater: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-foreground/58">Grid Workspace</p>
          <p className="text-sm text-foreground/74">Unified widget grid below hero. Phase 1 scaffolds a common shell for core monitor widgets.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-full border border-black/55 bg-background/75 p-1 dark:border-white/20">
            {(["manual", "topic", "source"] as const).map((mode) => (
              <Button
                key={`grid-mode-${mode}`}
                type="button"
                size="sm"
                variant={grouping === mode ? "default" : "ghost"}
                className="h-7 rounded-full px-3 text-[11px] uppercase tracking-[0.12em]"
                onClick={() => onGroupingChange(mode)}
              >
                {mode}
              </Button>
            ))}
          </div>
          {hiddenWidgets.length ? (
            <Button type="button" size="sm" variant="outline" className="rounded-full border-black/60 px-4 dark:border-white/20" onClick={onRestoreAll}>
              <Eye className="mr-2 h-4 w-4" />
              Restore all ({hiddenWidgets.length})
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-12 auto-rows-min items-start">
        {widgets.map((widget) => (
          <MonitorWidgetShell
            key={widget.id}
            widget={widget}
            onHide={onHide}
            onGrowRight={onGrowRight}
            onGrowDown={onGrowDown}
            onResetSize={onResetSize}
            onMoveEarlier={onMoveEarlier}
            onMoveLater={onMoveLater}
          />
        ))}
      </div>

      {hiddenWidgets.length ? (
        <div className="rounded-2xl border border-dashed border-black/35 bg-background/70 px-4 py-3 dark:border-white/15">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] uppercase tracking-[0.18em] text-foreground/58">Hidden Widgets</p>
            {hiddenWidgets.map((widget) => (
              <Button key={`restore-${widget.id}`} type="button" size="sm" variant="outline" className="h-7 rounded-full border-black/55 px-3 text-[11px] dark:border-white/20" onClick={() => onRestore(widget.id)}>
                {widget.title}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
