import type { MonitorGridAudience, MonitorGridWidgetDescriptor } from "@/components/monitor/grid/types";

export function widgetMatchesAudience(widget: MonitorGridWidgetDescriptor, audience: MonitorGridAudience): boolean {
  const supported = widget.audience || ["all"];
  return supported.includes("all") || supported.includes(audience);
}

export function widgetMatchesCountry(widget: MonitorGridWidgetDescriptor, country: string): boolean {
  const geo = widget.geo || ["GLOBAL"];
  return geo.includes("GLOBAL") || geo.includes(country);
}

export function filterVisibleGridWidgets(
  widgets: MonitorGridWidgetDescriptor[],
  audience: MonitorGridAudience,
  country: string,
  hiddenIds: string[],
): MonitorGridWidgetDescriptor[] {
  return widgets.filter((widget) => {
    if (hiddenIds.includes(widget.id)) return false;
    if (!widgetMatchesAudience(widget, audience)) return false;
    if (!widgetMatchesCountry(widget, country)) return false;
    return true;
  });
}
