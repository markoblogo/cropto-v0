import type { ReactNode } from "react";

interface MonitorEmptyStateProps {
  title: string;
  description: string;
  icon?: ReactNode;
}

export function MonitorEmptyState({ title, description, icon }: MonitorEmptyStateProps) {
  return (
    <div className="rounded-xl border border-dashed border-border/80 bg-background/70 px-4 py-10 text-center">
      {icon ? <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-background shadow-sm">{icon}</div> : null}
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-2 text-sm text-muted-foreground">{description}</div>
    </div>
  );
}
