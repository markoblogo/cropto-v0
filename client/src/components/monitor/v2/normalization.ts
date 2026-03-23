import type { ConversionConfidence, MonitorNormalizationIssue, MonitorNormalizationStandard } from "@/components/monitor/v2/types";

export const MONITOR_NORMALIZATION_STANDARD: MonitorNormalizationStandard = {
  measurementSystem: "metric",
  displayCurrency: "USD",
  alternateCurrency: "EUR",
  standardMassUnit: "t",
  disallowedDisplayUnits: ["kg", "lb", "bushel", "bu", "cwt"],
};

export function normalizeDisplayUnit(rawUnit?: string): string {
  if (!rawUnit) return MONITOR_NORMALIZATION_STANDARD.standardMassUnit;
  const normalized = rawUnit.trim().toLowerCase();
  if (normalized === "t" || normalized === "tonne" || normalized === "tonnes" || normalized === "mt") {
    return MONITOR_NORMALIZATION_STANDARD.standardMassUnit;
  }
  if (normalized === "usd/t" || normalized === "eur/t") return rawUnit;
  return rawUnit;
}

export function evaluateNormalizationIssue({
  rawUnit,
  rawCurrency,
  widgetId,
}: {
  rawUnit?: string;
  rawCurrency?: string;
  widgetId?: string;
}): MonitorNormalizationIssue | null {
  const loweredUnit = rawUnit?.trim().toLowerCase();
  if (loweredUnit && MONITOR_NORMALIZATION_STANDARD.disallowedDisplayUnits.includes(loweredUnit)) {
    return {
      kind: "non-standard-unit",
      rawUnit,
      widgetId,
      notes: ["Incoming unit requires normalization to tonnes before default display."],
    };
  }
  if (rawCurrency && !["USD", "EUR"].includes(rawCurrency.toUpperCase())) {
    return {
      kind: "non-standard-currency",
      rawCurrency,
      widgetId,
      notes: ["Incoming currency is outside the current display standard set (USD/EUR)."],
    };
  }
  return null;
}

export function resolveConversionConfidence(rawUnit?: string): ConversionConfidence {
  if (!rawUnit) return "unknown";
  const loweredUnit = rawUnit.trim().toLowerCase();
  if (["t", "tonne", "tonnes", "mt", "usd/t", "eur/t"].includes(loweredUnit)) return "direct";
  if (["bushel", "bu", "cwt"].includes(loweredUnit)) return "commodity-standard";
  if (["kg", "lb"].includes(loweredUnit)) return "estimated";
  return "unknown";
}
