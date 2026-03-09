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
