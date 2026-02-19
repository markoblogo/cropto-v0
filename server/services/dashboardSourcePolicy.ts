import type { MarketIndexDto } from "./mockMarketData";

function isMockRow(row: MarketIndexDto): boolean {
  return row.source === "mock" || row.isMockData === true;
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
