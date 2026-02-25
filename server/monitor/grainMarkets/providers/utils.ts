import type { GrainMarketPoint, GrainMarketStatus } from "../types";

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

export function statusFromSource(opts: { primary: boolean; hasValue: boolean; delayed?: boolean; fallback?: boolean }): GrainMarketStatus {
  if (!opts.hasValue && opts.fallback) return "FALLBACK";
  if (!opts.hasValue) return "OFFLINE";
  if (opts.fallback) return "FALLBACK";
  if (opts.delayed) return "DELAYED";
  return opts.primary ? "REFRESH" : "INDICATIVE";
}

export function deriveSeriesFromLast(last: number, change?: number, points = 12): GrainMarketPoint[] {
  const prev = change != null ? last - change : last;
  const step = points <= 1 ? 0 : (last - prev) / (points - 1);
  return Array.from({ length: points }).map((_, index) => ({
    ts: new Date(Date.now() - (points - 1 - index) * 60 * 60 * 1000).toISOString(),
    value: Number((prev + step * index).toFixed(4)),
  }));
}

export function makeMockSeries(base: number, amplitude = 0.08, points = 12): GrainMarketPoint[] {
  return Array.from({ length: points }).map((_, index) => {
    const rev = points - 1 - index;
    const drift = Math.sin(rev / 2.5) * amplitude + Math.cos(rev / 3.2) * (amplitude * 0.45);
    return {
      ts: new Date(Date.now() - rev * 60 * 60 * 1000).toISOString(),
      value: Number(Math.max(0.0001, base + drift).toFixed(4)),
    };
  });
}
