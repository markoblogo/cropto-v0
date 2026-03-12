import { fetchTextResponseWithTimeout, parseNumber } from "./utils";

export type DbnomicsCoreSeriesDef = {
  id: string;
  label: string;
  providerCode: "IMF" | "WB";
  datasetCode: "PCPS" | "commodity_prices";
  seriesCode: string;
  unit: "INDEX" | "USD_PER_TON";
  group: "grains" | "oilseeds" | "inputs";
};

export type DbnomicsCoreSeriesStatus = "READY" | "EMPTY" | "ERROR";

export type DbnomicsCoreSeriesProbe = {
  id: string;
  label: string;
  sourceUrl: string;
  status: DbnomicsCoreSeriesStatus;
  points: number;
  lastPeriod?: string;
  lastValue?: number;
  errorKind?: "HTTP_4XX" | "HTTP_5XX" | "TIMEOUT" | "DNS" | "PARSE_ERROR" | "EMPTY_DATA" | "UNKNOWN";
  errorMessage?: string;
};

export const DBNOMICS_CORE10_SERIES: DbnomicsCoreSeriesDef[] = [
  // IMF PCPS index layer
  { id: "imf-wheat-index", label: "IMF Wheat index", providerCode: "IMF", datasetCode: "PCPS", seriesCode: "M.W00.PWHEAMT.IX", unit: "INDEX", group: "grains" },
  { id: "imf-maize-index", label: "IMF Maize index", providerCode: "IMF", datasetCode: "PCPS", seriesCode: "M.W00.PMAIZMT.IX", unit: "INDEX", group: "grains" },
  { id: "imf-soybeans-index", label: "IMF Soybeans index", providerCode: "IMF", datasetCode: "PCPS", seriesCode: "M.W00.PSOYB.IX", unit: "INDEX", group: "oilseeds" },
  { id: "imf-rice-index", label: "IMF Rice index", providerCode: "IMF", datasetCode: "PCPS", seriesCode: "M.W00.PRICENPQ.IX", unit: "INDEX", group: "grains" },
  { id: "imf-barley-index", label: "IMF Barley index", providerCode: "IMF", datasetCode: "PCPS", seriesCode: "M.W00.PBARL.IX", unit: "INDEX", group: "grains" },
  // WB commodity prices USD/t layer
  { id: "wb-wheat-us-hrw", label: "WB Wheat US HRW", providerCode: "WB", datasetCode: "commodity_prices", seriesCode: "FWHEAT_US_HRW.1W", unit: "USD_PER_TON", group: "grains" },
  { id: "wb-maize", label: "WB Maize", providerCode: "WB", datasetCode: "commodity_prices", seriesCode: "FMAIZE.1W", unit: "USD_PER_TON", group: "grains" },
  { id: "wb-soybeans", label: "WB Soybeans", providerCode: "WB", datasetCode: "commodity_prices", seriesCode: "FSOYBEANS.1W", unit: "USD_PER_TON", group: "oilseeds" },
  { id: "wb-rice-thai-5", label: "WB Rice Thai 5%", providerCode: "WB", datasetCode: "commodity_prices", seriesCode: "FRICE_05.1W", unit: "USD_PER_TON", group: "grains" },
  { id: "wb-urea", label: "WB Urea", providerCode: "WB", datasetCode: "commodity_prices", seriesCode: "FUREA_EE_BULK.1W", unit: "USD_PER_TON", group: "inputs" },
];

function classifyErrorKind(message?: string, httpStatus?: number): DbnomicsCoreSeriesProbe["errorKind"] {
  const text = String(message || "").toLowerCase();
  if (httpStatus != null && httpStatus >= 400 && httpStatus < 500) return "HTTP_4XX";
  if (httpStatus != null && httpStatus >= 500) return "HTTP_5XX";
  if (text.includes("timed out") || text.includes("aborted")) return "TIMEOUT";
  if (text.includes("enotfound") || text.includes("could not resolve host")) return "DNS";
  if (text.includes("parse")) return "PARSE_ERROR";
  if (text.includes("empty")) return "EMPTY_DATA";
  return "UNKNOWN";
}

function buildSeriesUrl(baseUrl: string, series: DbnomicsCoreSeriesDef): string {
  const root = String(baseUrl || "").replace(/\/+$/, "");
  return `${root}/series/${series.providerCode}/${series.datasetCode}/${series.seriesCode}?observations=true`;
}

export async function probeDbnomicsCore10(args: {
  baseUrl: string;
  timeoutMs: number;
}): Promise<{
  items: DbnomicsCoreSeriesProbe[];
  summary: {
    total: number;
    ready: number;
    coverage: string;
    status: "REFRESH" | "INDICATIVE" | "CONSTRAINED";
    errorKind?: DbnomicsCoreSeriesProbe["errorKind"];
  };
}> {
  const items = await Promise.all(
    DBNOMICS_CORE10_SERIES.map(async (series): Promise<DbnomicsCoreSeriesProbe> => {
      const sourceUrl = buildSeriesUrl(args.baseUrl, series);
      try {
        const response = await fetchTextResponseWithTimeout(sourceUrl, args.timeoutMs);
        const payload = JSON.parse(response.text);
        const doc = payload?.series?.docs?.[0];
        const period = Array.isArray(doc?.period) ? doc.period : [];
        const value = Array.isArray(doc?.value) ? doc.value : [];
        const tuples = period
          .map((p: string | number, idx: number) => ({
            period: String(p || ""),
            value: parseNumber(value[idx]),
          }))
          .filter((entry: { period: string; value: number | undefined }): entry is { period: string; value: number } => entry.value != null);

        if (tuples.length < 1) {
          return {
            id: series.id,
            label: series.label,
            sourceUrl,
            status: "EMPTY",
            points: 0,
            errorKind: "EMPTY_DATA",
            errorMessage: "no_observations",
          };
        }

        const latest = tuples[tuples.length - 1];
        return {
          id: series.id,
          label: series.label,
          sourceUrl,
          status: "READY",
          points: tuples.length,
          lastPeriod: latest.period,
          lastValue: latest.value,
        };
      } catch (error: any) {
        const message = String(error?.message || "dbnomics_core_probe_failed");
        const httpStatus = Number.isFinite(error?.httpStatus) ? Number(error.httpStatus) : undefined;
        return {
          id: series.id,
          label: series.label,
          sourceUrl,
          status: "ERROR",
          points: 0,
          errorKind: classifyErrorKind(message, httpStatus),
          errorMessage: message,
        };
      }
    }),
  );

  const total = items.length;
  const ready = items.filter((item) => item.status === "READY").length;
  const coverage = `${ready}/${total}`;
  const status: "REFRESH" | "INDICATIVE" | "CONSTRAINED" =
    ready >= total ? "REFRESH" : ready >= Math.ceil(total * 0.6) ? "INDICATIVE" : "CONSTRAINED";
  const firstFailure = items.find((item) => item.status !== "READY");

  return {
    items,
    summary: {
      total,
      ready,
      coverage,
      status,
      errorKind: firstFailure?.errorKind,
    },
  };
}
