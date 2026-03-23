import { MONITOR_V2_WIDGET_CAPABILITIES } from "@/components/monitor/v2/config";
import type {
  MonitorGridGrouping,
  MonitorGridHeightUnits,
  MonitorGridLayout,
  MonitorGridSize,
  MonitorGridWidthUnits,
  MonitorWidgetCapability,
} from "@/components/monitor/v2/types";

export const GRID_HIDDEN_STORAGE_KEY = "monitor_v2_grid_hidden";
export const GRID_LAYOUT_STORAGE_KEY = "monitor_v2_grid_layout";
export const GRID_ORDER_STORAGE_KEY = "monitor_v2_grid_order";
export const GRID_GROUPING_STORAGE_KEY = "monitor_v2_grid_grouping";

export function capabilityById(widgetId: string): MonitorWidgetCapability | undefined {
  return MONITOR_V2_WIDGET_CAPABILITIES.find((item) => item.id === widgetId);
}

export function defaultLayoutForSize(size: MonitorGridSize): MonitorGridLayout {
  switch (size) {
    case "s":
      return { width: 1, height: 1 };
    case "l":
      return { width: 2, height: 1 };
    case "xl":
      return { width: 3, height: 2 };
    case "m":
    default:
      return { width: 1, height: 1 };
  }
}

export function defaultLayoutForWidget(widgetId: string): MonitorGridLayout {
  return defaultLayoutForSize(capabilityById(widgetId)?.defaultGridSize || "m");
}

export function maxLayoutForWidget(widgetId: string): MonitorGridLayout {
  return defaultLayoutForSize(capabilityById(widgetId)?.maxGridSize || "xl");
}

export function clampGridLayout(widgetId: string, layout: MonitorGridLayout): MonitorGridLayout {
  const max = maxLayoutForWidget(widgetId);
  return {
    width: Math.max(1, Math.min(max.width, layout.width)) as MonitorGridWidthUnits,
    height: Math.max(1, Math.min(max.height, layout.height)) as MonitorGridHeightUnits,
  };
}

export function gridColumnClass(width: MonitorGridWidthUnits): string {
  switch (width) {
    case 4:
      return "md:col-span-12";
    case 3:
      return "md:col-span-9";
    case 2:
      return "md:col-span-6";
    case 1:
    default:
      return "md:col-span-3";
  }
}

export function gridRowClass(height: MonitorGridHeightUnits): string {
  switch (height) {
    case 3:
      return "row-span-6";
    case 2:
      return "row-span-4";
    case 1:
    default:
      return "row-span-3";
  }
}

export function gridBodyHeightClass(height: MonitorGridHeightUnits): string {
  switch (height) {
    case 3:
      return "max-h-[620px]";
    case 2:
      return "max-h-[420px]";
    case 1:
    default:
      return "max-h-[250px]";
  }
}

export function defaultGrouping(): MonitorGridGrouping {
  return "manual";
}

export function groupKeyForWidget(widgetId: string, sourceName?: string): string {
  const capability = capabilityById(widgetId);
  if (!capability) return "other";
  const primaryTopic = capability.topics[0] || "other";
  return primaryTopic || sourceName || "other";
}

export function sortWidgetIdsByGrouping(
  widgetIds: string[],
  grouping: MonitorGridGrouping,
  sourceNames: Record<string, string | undefined>,
  manualOrder: string[],
): string[] {
  const base = Array.from(new Set([...manualOrder.filter((id) => widgetIds.includes(id)), ...widgetIds]));
  if (grouping === "manual") return base;

  return base.sort((left, right) => {
    const leftKey = grouping === "source" ? sourceNames[left] || "Unknown" : groupKeyForWidget(left, sourceNames[left]);
    const rightKey = grouping === "source" ? sourceNames[right] || "Unknown" : groupKeyForWidget(right, sourceNames[right]);
    if (leftKey !== rightKey) return leftKey.localeCompare(rightKey);
    return base.indexOf(left) - base.indexOf(right);
  });
}
