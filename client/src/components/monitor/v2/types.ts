export type MonitorRole = "all" | "farmer" | "trader" | "broker";
export type MonitorTopic =
  | "markets"
  | "logistics"
  | "weather"
  | "policy"
  | "outlook"
  | "signals"
  | "news"
  | "media"
  | "macro";
export type MonitorWidgetType =
  | "kpi"
  | "chart"
  | "composite"
  | "signal-list"
  | "news-feed"
  | "ranking-table"
  | "table"
  | "map"
  | "media"
  | "camera"
  | "logistics"
  | "weather"
  | "outlook";
export type MonitorWidgetMaturity = "live" | "fallback" | "experimental" | "failed";
export type MonitorGridSize = "s" | "m" | "l" | "xl";
export type MonitorGridGrouping = "manual" | "topic" | "source";
export type MonitorGridWidthUnits = 1 | 2 | 3 | 4;
export type MonitorGridHeightUnits = 1 | 2 | 3;

export type MonitorGridLayout = {
  width: MonitorGridWidthUnits;
  height: MonitorGridHeightUnits;
};
export type HeroSlotId =
  | "command-bar"
  | "kpi-strip"
  | "canvas"
  | "feature-left"
  | "feature-right"
  | "media-primary"
  | "media-secondary"
  | "watchlist";
export type HeroSlotKind =
  | "controls"
  | "kpi"
  | "canvas"
  | "feature"
  | "media"
  | "watchlist";
export type MeasurementSystem = "metric" | "imperial";
export type DisplayCurrency = "USD" | "EUR";
export type StandardMassUnit = "t";
export type ConversionConfidence = "direct" | "commodity-standard" | "estimated" | "unknown";

export type MonitorHeroSlot = {
  id: HeroSlotId;
  kind: HeroSlotKind;
  title: string;
  accepts: MonitorWidgetType[];
  fixed: true;
};

export type MonitorCountryOption = {
  code: string;
  label: string;
  short: string;
  signalContext: string[];
};

export type MonitorRoleOption = {
  id: MonitorRole;
  label: string;
  description: string;
};

export type MonitorWidgetCapability = {
  id: string;
  title: string;
  type: MonitorWidgetType;
  topics: MonitorTopic[];
  roles: MonitorRole[];
  countries: string[];
  maturity: MonitorWidgetMaturity;
  defaultGridSize: MonitorGridSize;
  maxGridSize: MonitorGridSize;
  canLiveInGrid: boolean;
  canLiveInHero: boolean;
  heroSlots?: HeroSlotId[];
  videoOnly?: boolean;
};

export type MonitorNormalizationStandard = {
  measurementSystem: MeasurementSystem;
  displayCurrency: DisplayCurrency;
  alternateCurrency: DisplayCurrency;
  standardMassUnit: StandardMassUnit;
  disallowedDisplayUnits: string[];
};

export type MonitorNormalizationIssue = {
  kind: "non-standard-unit" | "non-standard-currency" | "unsupported-conversion";
  rawUnit?: string;
  rawCurrency?: string;
  widgetId?: string;
  notes?: string[];
};
