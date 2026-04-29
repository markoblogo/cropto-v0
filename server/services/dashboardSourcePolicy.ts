import type { MarketIndexDto } from "./mockMarketData";
import { normalizeCommodity as normalizeCanonicalCommodity } from "../../shared/commodities";

function isMockRow(row: MarketIndexDto): boolean {
  return row.source === "mock" || row.isMockData === true;
}

function statusRank(row: MarketIndexDto): number {
  const status = row.priceStatus || row.dataStatus;
  if (status === "fresh") return 3;
  if (status === "stale") return 2;
  return 1;
}

function sourceTierRank(row: MarketIndexDto): number {
  if (row.sourceTier === "primary") return 4;
  if (row.sourceTier === "secondary") return 3;
  if (row.sourceTier === "last_known") return 2;
  if (row.sourceTier === "synthetic") return 1;
  return 2;
}

function providerPriorityRank(row: MarketIndexDto, providerPriority: string[]): number {
  const provider = String(row.provider || row.source || "").toUpperCase();
  const idx = providerPriority.indexOf(provider);
  return idx >= 0 ? providerPriority.length - idx : 0;
}

function asTimestamp(value?: string | null): number {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function isCommodityConsistent(row: MarketIndexDto): boolean {
  const selected = normalizeCanonicalCommodity(String(row.commodity || "")).commodity;
  const rawValue = String(row.rawCommodity || row.commodity || "").trim();
  if (!rawValue) return true;
  const raw = normalizeCanonicalCommodity(rawValue).commodity;
  return selected === raw;
}

export function selectTruthSeriesPerCommodity(
  rows: MarketIndexDto[],
  options?: { providerPriority?: string[]; debug?: boolean }
): MarketIndexDto[] {
  const providerPriority = (options?.providerPriority || []).map((p) => p.toUpperCase());
  const validRows = rows.filter((row) => !row.needsReview && !row.invalidReason && isCommodityConsistent(row));
  const grouped = new Map<string, MarketIndexDto[]>();

  for (const row of validRows) {
    const canonical = normalizeCanonicalCommodity(row.commodity);
    const normalizedRow: MarketIndexDto = {
      ...row,
      commodity: canonical.commodity,
      rawCommodity: row.rawCommodity || row.commodity,
    };
    if (!grouped.has(canonical.commodity)) grouped.set(canonical.commodity, []);
    grouped.get(canonical.commodity)!.push(normalizedRow);
  }

  const selected: MarketIndexDto[] = [];
  for (const [commodity, group] of grouped.entries()) {
    const sorted = [...group].sort((a, b) => {
      const mockDelta = Number(isMockRow(a)) - Number(isMockRow(b));
      if (mockDelta !== 0) return mockDelta;

      const statusDelta = statusRank(b) - statusRank(a);
      if (statusDelta !== 0) return statusDelta;

      // Pick the freshest valid real row first; provider priority is tie-break only.
      const freshnessDelta = asTimestamp(b.asOf) - asTimestamp(a.asOf);
      if (freshnessDelta !== 0) return freshnessDelta;

      const tierDelta = sourceTierRank(b) - sourceTierRank(a);
      if (tierDelta !== 0) return tierDelta;

      const providerDelta = providerPriorityRank(b, providerPriority) - providerPriorityRank(a, providerPriority);
      if (providerDelta !== 0) return providerDelta;

      return asTimestamp(b.fetchedAt || null) - asTimestamp(a.fetchedAt || null);
    });

    const picked = sorted[0];
    if (!picked) continue;

    if (options?.debug) {
      (picked as MarketIndexDto & {
        alternatives?: Array<{
          provider: string;
          source: string;
          channel?: string;
          asOf: string;
          fetchedAt?: string;
          priceStatus?: string;
          lastFetchStatus?: string;
          sourceTier?: string;
        }>;
      }).alternatives = sorted.slice(1).map((alt) => ({
        provider: String(alt.provider || alt.source || "unknown"),
        source: String(alt.source || "unknown"),
        channel: alt.channel || undefined,
        asOf: alt.asOf,
        fetchedAt: alt.fetchedAt,
        priceStatus: alt.priceStatus || alt.dataStatus,
        lastFetchStatus: alt.lastFetchStatus,
        sourceTier: alt.sourceTier,
      }));
    }

    selected.push({
      ...picked,
      commodity,
    });
  }

  return selected.sort((a, b) => a.commodity.localeCompare(b.commodity));
}

export function selectCountryRows(rows: MarketIndexDto[], allowMockFallback: boolean): {
  selected: MarketIndexDto[];
  usedMock: boolean;
} {
  const realRows = rows.filter((row) => !isMockRow(row));
  if (realRows.length > 0) {
    return { selected: realRows, usedMock: false };
  }

  if (!allowMockFallback) {
    return { selected: [], usedMock: false };
  }

  const mockRows = rows.filter((row) => isMockRow(row));
  return { selected: mockRows, usedMock: mockRows.length > 0 };
}

export function deriveMarketHealth(rows: MarketIndexDto[]): {
  status: "OK" | "WARN" | "FAIL";
  lastSuccessfulUpdate: string | null;
  source: string | null;
} {
  if (!rows.length) {
    return { status: "FAIL", lastSuccessfulUpdate: null, source: null };
  }

  const validRows = rows.filter((item) => {
    const status = item.priceStatus || item.dataStatus;
    return status !== "missing" && status !== "no_recent";
  });
  if (!validRows.length) {
    return { status: "FAIL", lastSuccessfulUpdate: null, source: null };
  }

  const latest = [...validRows].sort((a, b) => new Date(b.asOf).getTime() - new Date(a.asOf).getTime())[0];
  const hasMock = rows.some((item) => isMockRow(item));
  const hasStale = validRows.some((item) => (item.priceStatus || item.dataStatus) === "stale");
  const hasLastFetchFailed = validRows.some((item) => item.lastFetchStatus === "failed");

  const status: "OK" | "WARN" | "FAIL" = hasMock || hasStale || hasLastFetchFailed ? "WARN" : "OK";
  const provider = latest.source === "mock" ? "Demo data" : (latest.provider || latest.source);
  const channel = latest.channel || "HTML_PAGE";

  return {
    status,
    lastSuccessfulUpdate: latest.asOf || null,
    source: `${provider}(${channel})`,
  };
}
