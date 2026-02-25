import type { GrainWidget, GrainWidgetKind, GrainWidgetsTimeframe } from "../types";

export interface GrainWidgetsProviderContext {
  now: Date;
  timeframe: GrainWidgetsTimeframe;
  seriesPoints: number;
  eurUsd: number | null;
  country?: string;
  getCachedWidget?: (kind: GrainWidgetKind) => GrainWidget | undefined;
}

export interface GrainWidgetsProvider {
  id: string;
  kind: GrainWidgetKind;
  enabled: boolean;
  getWidget(ctx: GrainWidgetsProviderContext): Promise<GrainWidget>;
  mockFallback(reason: string, ctx: GrainWidgetsProviderContext): GrainWidget;
}
