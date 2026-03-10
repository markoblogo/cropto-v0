import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MonitorWidgetShell } from "@/components/monitor/grid/MonitorWidgetShell";
import type { MonitorGridWidgetDescriptor } from "@/components/monitor/grid/types";

export function MonitorGridWorkspace({
  widgets,
  hiddenWidgets,
  onHide,
  onRestore,
  onRestoreAll,
}: {
  widgets: MonitorGridWidgetDescriptor[];
  hiddenWidgets: MonitorGridWidgetDescriptor[];
  onHide: (id: string) => void;
  onRestore: (id: string) => void;
  onRestoreAll: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-foreground/58">Grid Workspace</p>
          <p className="text-sm text-foreground/74">Unified widget grid below hero. Phase 1 scaffolds a common shell for core monitor widgets.</p>
        </div>
        {hiddenWidgets.length ? (
          <Button type="button" size="sm" variant="outline" className="rounded-full border-black/60 px-4 dark:border-white/20" onClick={onRestoreAll}>
            <Eye className="mr-2 h-4 w-4" />
            Restore all ({hiddenWidgets.length})
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-12 auto-rows-min items-start">
        {widgets.map((widget) => (
          <MonitorWidgetShell key={widget.id} widget={widget} onHide={onHide} />
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
