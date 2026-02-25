import type { GrainSeriesPoint, GrainWidgetStatus } from "../types";

export async function fetchTextWithTimeout(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "CroptoMonitor/1.1 (+https://cropto.abvx.xyz)",
        accept: "application/json,text/plain,text/html,*/*",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/[, ]/g, "").replace(/%$/, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function normalizeDate(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value > 1e12 ? value : value * 1000).toISOString();
  }
  if (typeof value === "string") {
    const ts = Date.parse(value);
    if (Number.isFinite(ts)) return new Date(ts).toISOString();
  }
  return undefined;
}

export function statusFromSource(primary: boolean, hasHistory: boolean): GrainWidgetStatus {
  if (primary && hasHistory) return "LIVE";
  if (primary) return "INDICATIVE";
  if (hasHistory) return "DELAYED";
  return "FALLBACK";
}

export function makeMockSeries(base: number, amplitude = 4, points = 12): GrainSeriesPoint[] {
  const out: GrainSeriesPoint[] = [];
  for (let i = points - 1; i >= 0; i -= 1) {
    const drift = Math.sin((points - i) / 2.4) * amplitude + Math.cos((points - i) / 3.6) * (amplitude * 0.5);
    const value = Math.max(0.01, base + drift);
    out.push({
      ts: new Date(Date.now() - i * 60 * 60 * 1000).toISOString(),
      value: Number(value.toFixed(2)),
    });
  }
  return out;
}

export function deriveSeriesFromLast(last: number, changeAbs?: number, points = 10): GrainSeriesPoint[] {
  const prev = changeAbs != null ? last - changeAbs : last;
  const step = points <= 1 ? 0 : (last - prev) / (points - 1);
  const now = Date.now();
  return Array.from({ length: points }).map((_, index) => ({
    ts: new Date(now - (points - 1 - index) * 60 * 60 * 1000).toISOString(),
    value: Number((prev + step * index).toFixed(2)),
  }));
}

export function rankStatus(statuses: GrainWidgetStatus[]): GrainWidgetStatus {
  if (statuses.includes("LIVE")) return "LIVE";
  if (statuses.includes("DELAYED")) return "DELAYED";
  if (statuses.includes("INDICATIVE")) return "INDICATIVE";
  if (statuses.includes("FALLBACK")) return "FALLBACK";
  return "OFFLINE";
}
