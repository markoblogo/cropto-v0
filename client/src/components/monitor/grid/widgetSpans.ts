import type { MonitorGridSpan } from "@/components/monitor/grid/types";

export function getGridSpanClass(span: MonitorGridSpan): string {
  switch (span) {
    case "compact":
      return "md:col-span-3";
    case "wide":
      return "md:col-span-6";
    case "tall":
      return "md:col-span-4";
    case "feature":
      return "md:col-span-8";
    case "standard":
    default:
      return "md:col-span-4";
  }
}

export function getGridBodyClass(span: MonitorGridSpan): string {
  switch (span) {
    case "compact":
      return "max-h-[240px]";
    case "wide":
      return "max-h-[320px]";
    case "tall":
      return "max-h-[420px]";
    case "feature":
      return "max-h-[420px]";
    case "standard":
    default:
      return "max-h-[320px]";
  }
}


export function getGridUnitSpanClass(width: 1 | 2 | 3 | 4, height: 1 | 2 | 3): string {
  const colClass = width === 4 ? "md:col-span-12" : width === 3 ? "md:col-span-9" : width === 2 ? "md:col-span-6" : "md:col-span-3";
  const rowClass = height === 3 ? "row-span-6" : height === 2 ? "row-span-4" : "row-span-3";
  return `${colClass} ${rowClass}`;
}

export function getGridUnitBodyClass(height: 1 | 2 | 3): string {
  return height === 3 ? "max-h-[620px]" : height === 2 ? "max-h-[420px]" : "max-h-[250px]";
}
