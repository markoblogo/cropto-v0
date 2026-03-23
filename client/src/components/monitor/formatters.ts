export type MetricKind = "price" | "index" | "percent" | "score" | "temperature" | "fx" | "count";

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function formatNumber(value?: number, digits = 2): string {
  if (!isNum(value)) return "n/a";
  return value.toFixed(digits);
}

export function formatSigned(value?: number, digits = 2): string {
  if (!isNum(value)) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

export function formatPercent(value?: number, digits = 2): string {
  if (!isNum(value)) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

export function formatPriceWithUnit(value?: number, unit?: string): string {
  const safeUnit = unit || "unit unknown";
  if (!isNum(value)) return `n/a ${safeUnit}`.trim();
  return `${value.toFixed(2)} ${safeUnit}`.trim();
}

export function formatChangeWithUnit(args: {
  change?: number;
  unit?: string;
  pct?: number;
  digits?: number;
}): string {
  const digits = args.digits ?? 2;
  const unit = args.unit || "unit";
  if (!isNum(args.change)) return "n/a";
  const abs = `${args.change >= 0 ? "+" : ""}${args.change.toFixed(digits)} ${unit}`;
  if (isNum(args.pct)) return `${abs} (${formatPercent(args.pct, digits)})`;
  return abs;
}

export function formatIndexPoints(value?: number): string {
  if (!isNum(value)) return "n/a pts";
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} pts`;
}

export function formatScore(value?: number, max = 100): string {
  if (!isNum(value)) return `n/a / ${max} score`;
  return `${Math.round(value)} / ${max} score`;
}

export function formatTemperature(value?: number, mode: "C" | "F" = "C"): string {
  if (!isNum(value)) return `n/a °${mode}`;
  return `${value.toFixed(1)} °${mode}`;
}

export function formatFxRate(pairBase: string, pairQuote: string, value?: number): string {
  const pair = `${pairBase.toUpperCase()}/${pairQuote.toUpperCase()}`;
  if (!isNum(value)) return `${pair} n/a`;
  return `${pair} ${value.toFixed(4)}`;
}

export function formatMetricValue(args: {
  kind: MetricKind;
  value?: number;
  unit?: string;
  pct?: number;
  scoreMax?: number;
  tempMode?: "C" | "F";
  fxBase?: string;
  fxQuote?: string;
}): string {
  if (args.kind === "price") return formatPriceWithUnit(args.value, args.unit);
  if (args.kind === "index") return formatIndexPoints(args.value);
  if (args.kind === "percent") return formatPercent(args.value);
  if (args.kind === "score") return formatScore(args.value, args.scoreMax ?? 100);
  if (args.kind === "temperature") return formatTemperature(args.value, args.tempMode ?? "C");
  if (args.kind === "fx") return formatFxRate(args.fxBase || "BASE", args.fxQuote || "QUOTE", args.value);
  if (args.kind === "count") return `${isNum(args.value) ? Math.round(args.value) : "n/a"} ${args.unit || "count"}`;
  return formatNumber(args.value);
}
