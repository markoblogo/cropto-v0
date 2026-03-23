import type { LogisticsIndicatorPoint, LogisticsIndicatorWidgetData } from "../types";

export type NumericSeriesPoint = {
  date: string;
  value: number;
};

export async function fetchTextWithTimeout(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "CroptoMonitor/1.1 (+https://cropto.abvx.xyz)",
        accept: "text/csv,text/plain,application/json,*/*",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export function parseCsvSeries(raw: string): NumericSeriesPoint[] {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((value) => value.trim().replace(/^"|"$/g, "").toLowerCase());
  const dateIndex = headers.findIndex((value) => ["date", "week", "month", "period"].some((token) => value.includes(token)));
  const valueIndex = headers.findIndex((value) =>
    ["value", "index", "rate", "tariff", "bdi", "cost"].some((token) => value.includes(token)),
  );
  if (dateIndex < 0 || valueIndex < 0) return [];

  const series: NumericSeriesPoint[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(",").map((value) => value.trim().replace(/^"|"$/g, ""));
    const date = cols[dateIndex];
    const value = Number.parseFloat(cols[valueIndex] || "");
    if (!date || !Number.isFinite(value)) continue;
    series.push({ date, value });
  }

  return series;
}

export function toIndicatorSeries(points: NumericSeriesPoint[], size = 10): LogisticsIndicatorPoint[] {
  return points.slice(-size).map((point) => ({
    ts: point.date,
    value: Number(point.value.toFixed(2)),
  }));
}

export function computeDelta(points: NumericSeriesPoint[]) {
  const latest = points[points.length - 1];
  const previous = points[points.length - 2];
  if (!latest) return { current: undefined, delta: undefined, deltaPct: undefined };
  if (!previous || previous.value === 0) {
    return { current: latest.value, delta: undefined, deltaPct: undefined };
  }
  const delta = latest.value - previous.value;
  return {
    current: Number(latest.value.toFixed(2)),
    delta: Number(delta.toFixed(2)),
    deltaPct: Number(((delta / previous.value) * 100).toFixed(2)),
  };
}

export function trendLabel(delta?: number): LogisticsIndicatorWidgetData["trendLabel"] {
  if (delta == null) return "Stable";
  if (delta >= 1) return "Rising";
  if (delta <= -1) return "Cooling";
  return "Stable";
}

export function makeMockSeries(base: number, volatility = 2, days = 10): LogisticsIndicatorPoint[] {
  const out: LogisticsIndicatorPoint[] = [];
  let value = base;
  for (let i = days - 1; i >= 0; i -= 1) {
    value += (Math.random() - 0.5) * volatility;
    out.push({
      ts: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
      value: Number(Math.max(0, value).toFixed(2)),
    });
  }
  return out;
}
