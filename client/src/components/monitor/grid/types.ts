import type { ReactNode } from "react";

export type MonitorGridSpan = "compact" | "standard" | "wide" | "tall" | "feature";
export type MonitorGridAudience = "all" | "farmer" | "trader" | "broker";
export type MonitorGridMaturity = "live" | "fallback" | "experimental" | "failed";

export type MonitorGridWidgetMeta = {
  id: string;
  title: string;
  audience?: MonitorGridAudience[];
  geo?: string[];
  priority?: "hero" | "secondary" | "deep";
  maturity?: MonitorGridMaturity;
  defaultSpan: MonitorGridSpan;
  allowHide?: boolean;
};

export type MonitorGridWidgetDescriptor = MonitorGridWidgetMeta & {
  subtitle?: string;
  badgeLabel?: string;
  badgeClassName?: string;
  sourceName?: string;
  updatedLabel?: string;
  hidden?: boolean;
  body: ReactNode;
  footer?: ReactNode;
};
