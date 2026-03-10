import { useEffect, useMemo, useState } from "react";
import type { MonitorGridGrouping, MonitorGridLayout } from "@/components/monitor/v2/types";
import {
  clampGridLayout,
  defaultGrouping,
  defaultLayoutForWidget,
  GRID_GROUPING_STORAGE_KEY,
  GRID_HIDDEN_STORAGE_KEY,
  GRID_LAYOUT_STORAGE_KEY,
  GRID_ORDER_STORAGE_KEY,
  sortWidgetIdsByGrouping,
} from "@/components/monitor/v2/grid";

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(key) || "null");
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function readGrouping(): MonitorGridGrouping {
  if (typeof window === "undefined") return defaultGrouping();
  const saved = window.sessionStorage.getItem(GRID_GROUPING_STORAGE_KEY);
  return saved === "topic" || saved === "source" ? saved : "manual";
}

function sanitizeHidden(hidden: string[], availableIds: string[]): string[] {
  return hidden.filter((id) => availableIds.includes(id));
}

function sanitizeOrder(order: string[], availableIds: string[]): string[] {
  const kept = order.filter((id) => availableIds.includes(id));
  const missing = availableIds.filter((id) => !kept.includes(id));
  return [...kept, ...missing];
}

function sanitizeLayouts(layouts: Record<string, MonitorGridLayout>, availableIds: string[]): Record<string, MonitorGridLayout> {
  return Object.fromEntries(
    availableIds.map((id) => [id, clampGridLayout(id, layouts[id] || defaultLayoutForWidget(id))]),
  );
}

export function useMonitorV2GridState({
  availableWidgetIds,
  sourceNames,
}: {
  availableWidgetIds: string[];
  sourceNames: Record<string, string | undefined>;
}) {
  const [hiddenWidgetIds, setHiddenWidgetIds] = useState<string[]>(() => readJson(GRID_HIDDEN_STORAGE_KEY, []));
  const [layoutByWidgetId, setLayoutByWidgetId] = useState<Record<string, MonitorGridLayout>>(() => readJson(GRID_LAYOUT_STORAGE_KEY, {}));
  const [manualOrder, setManualOrder] = useState<string[]>(() => readJson(GRID_ORDER_STORAGE_KEY, []));
  const [grouping, setGrouping] = useState<MonitorGridGrouping>(() => readGrouping());

  useEffect(() => {
    setHiddenWidgetIds((current) => sanitizeHidden(current, availableWidgetIds));
    setManualOrder((current) => sanitizeOrder(current, availableWidgetIds));
    setLayoutByWidgetId((current) => sanitizeLayouts(current, availableWidgetIds));
  }, [availableWidgetIds]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(GRID_HIDDEN_STORAGE_KEY, JSON.stringify(hiddenWidgetIds));
  }, [hiddenWidgetIds]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(GRID_LAYOUT_STORAGE_KEY, JSON.stringify(layoutByWidgetId));
  }, [layoutByWidgetId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(GRID_ORDER_STORAGE_KEY, JSON.stringify(manualOrder));
  }, [manualOrder]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(GRID_GROUPING_STORAGE_KEY, grouping);
  }, [grouping]);

  const orderedWidgetIds = useMemo(
    () => sortWidgetIdsByGrouping(availableWidgetIds, grouping, sourceNames, sanitizeOrder(manualOrder, availableWidgetIds)),
    [availableWidgetIds, grouping, manualOrder, sourceNames],
  );

  const getLayout = (widgetId: string): MonitorGridLayout => clampGridLayout(widgetId, layoutByWidgetId[widgetId] || defaultLayoutForWidget(widgetId));

  return {
    grouping,
    setGrouping,
    hiddenWidgetIds,
    orderedWidgetIds,
    getLayout,
    hideWidget: (widgetId: string) => setHiddenWidgetIds((current) => (current.includes(widgetId) ? current : [...current, widgetId])),
    restoreWidget: (widgetId: string) => setHiddenWidgetIds((current) => current.filter((id) => id !== widgetId)),
    restoreAllWidgets: () => setHiddenWidgetIds([]),
    growRight: (widgetId: string) =>
      setLayoutByWidgetId((current) => {
        const next = getLayout(widgetId);
        return { ...current, [widgetId]: clampGridLayout(widgetId, { ...next, width: (next.width + 1) as MonitorGridLayout["width"] }) };
      }),
    shrinkRight: (widgetId: string) =>
      setLayoutByWidgetId((current) => {
        const next = getLayout(widgetId);
        return { ...current, [widgetId]: clampGridLayout(widgetId, { ...next, width: Math.max(1, next.width - 1) as MonitorGridLayout["width"] }) };
      }),
    growDown: (widgetId: string) =>
      setLayoutByWidgetId((current) => {
        const next = getLayout(widgetId);
        return { ...current, [widgetId]: clampGridLayout(widgetId, { ...next, height: (next.height + 1) as MonitorGridLayout["height"] }) };
      }),
    shrinkDown: (widgetId: string) =>
      setLayoutByWidgetId((current) => {
        const next = getLayout(widgetId);
        return { ...current, [widgetId]: clampGridLayout(widgetId, { ...next, height: Math.max(1, next.height - 1) as MonitorGridLayout["height"] }) };
      }),
    resetSize: (widgetId: string) => setLayoutByWidgetId((current) => ({ ...current, [widgetId]: defaultLayoutForWidget(widgetId) })),
    moveEarlier: (widgetId: string) =>
      setManualOrder((current) => {
        const order = sanitizeOrder(current, availableWidgetIds);
        const index = order.indexOf(widgetId);
        if (index <= 0) return order;
        const next = order.slice();
        [next[index - 1], next[index]] = [next[index], next[index - 1]];
        return next;
      }),
    moveLater: (widgetId: string) =>
      setManualOrder((current) => {
        const order = sanitizeOrder(current, availableWidgetIds);
        const index = order.indexOf(widgetId);
        if (index === -1 || index >= order.length - 1) return order;
        const next = order.slice();
        [next[index], next[index + 1]] = [next[index + 1], next[index]];
        return next;
      }),
    moveBefore: (sourceWidgetId: string, targetWidgetId: string) =>
      setManualOrder((current) => {
        const order = sanitizeOrder(current, availableWidgetIds);
        const sourceIndex = order.indexOf(sourceWidgetId);
        const targetIndex = order.indexOf(targetWidgetId);
        if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return order;
        const next = order.slice();
        next.splice(sourceIndex, 1);
        const recalculatedTarget = next.indexOf(targetWidgetId);
        next.splice(recalculatedTarget, 0, sourceWidgetId);
        return next;
      }),
  };
}
