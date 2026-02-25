import {
  DBNOMICS_API_BASE_URL,
  DBNOMICS_SPOT_SERIES_MAP,
  DBNOMICS_TIMEOUT_MS,
  ENABLE_DBNOMICS_SPOT_PROVIDER,
} from "../config";
import type { GrainWidgetGlobalSpotTable, GrainWidgetPoint, GrainWidgetTableRow } from "../types";
import type { GrainWidgetsProvider, GrainWidgetsProviderContext } from "./types";
import { MockGrainWidgetsProvider } from "./mockGrainWidgetsProvider";
import { fetchTextWithTimeout, normalizeRowPrice, parseNumber, statusFromAvailability } from "./utils";

type SpotInstrumentKey = "wheat" | "corn" | "soybeans" | "rapeseed";

type DbnomicsSeriesDoc = {
  series_name?: string;
  period?: Array<string | number>;
  value?: Array<number | string | null>;
};

type InstrumentConfig = {
  id: string;
  key: SpotInstrumentKey;
  label: string;
  region: string;
  commodityGroup: "Grains" | "Oilseeds";
  crop?: "corn" | "wheat" | "soybeans";
  nativeUnitType: "USD_PER_TON";
};

const INSTRUMENTS: InstrumentConfig[] = [
  { id: "spot-wheat", key: "wheat", label: "Wheat", region: "Global", commodityGroup: "Grains", crop: "wheat", nativeUnitType: "USD_PER_TON" },
  { id: "spot-corn", key: "corn", label: "Corn", region: "Global", commodityGroup: "Grains", crop: "corn", nativeUnitType: "USD_PER_TON" },
  { id: "spot-soy", key: "soybeans", label: "Soybeans", region: "Global", commodityGroup: "Oilseeds", crop: "soybeans", nativeUnitType: "USD_PER_TON" },
  { id: "spot-rapeseed", key: "rapeseed", label: "Rapeseed", region: "Global", commodityGroup: "Oilseeds", nativeUnitType: "USD_PER_TON" },
];

function parseSeriesMap(): Record<SpotInstrumentKey, string[]> {
  const fallback: Record<SpotInstrumentKey, string[]> = {
    wheat: ["FWHEAT_US_HRW.1W"],
    corn: ["FMAIZE.1W"],
    soybeans: ["FSOYBEANS.1W"],
    rapeseed: ["FRAPESEED_OIL.1W", "FCANOLA.1W"],
  };

  try {
    const parsed = JSON.parse(DBNOMICS_SPOT_SERIES_MAP);
    const mapped = { ...fallback };
    for (const key of Object.keys(fallback) as SpotInstrumentKey[]) {
      const raw = parsed?.[key];
      if (typeof raw === "string" && raw.trim()) mapped[key] = [raw.trim()];
      if (Array.isArray(raw)) {
        const values = raw.map((v) => String(v || "").trim()).filter(Boolean);
        if (values.length) mapped[key] = values;
      }
    }
    return mapped;
  } catch {
    return fallback;
  }
}

function toIsoFromPeriod(period: string | number): string {
  const raw = String(period || "").trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return `${raw}-01T00:00:00.000Z`;
  if (/^\d{4}$/.test(raw)) return `${raw}-01-01T00:00:00.000Z`;
  const ts = Date.parse(raw);
  return Number.isFinite(ts) ? new Date(ts).toISOString() : new Date().toISOString();
}

function lastObservedIndex(periods: Array<string | number>, now: Date): number {
  const currentYear = now.getUTCFullYear();
  for (let i = periods.length - 1; i >= 0; i--) {
    const value = String(periods[i] || "");
    const year = Number.parseInt(value.slice(0, 4), 10);
    if (Number.isFinite(year) && year <= currentYear) return i;
  }
  return periods.length - 1;
}

function buildSeries(period: Array<string | number>, values: Array<number | string | null>, points: number, now: Date): GrainWidgetPoint[] {
  if (!period.length || !values.length) return [];

  const tuples = period
    .map((p, idx) => ({ period: p, value: parseNumber(values[idx]) }))
    .filter((entry): entry is { period: string | number; value: number } => typeof entry.value === "number");

  if (tuples.length < 2) return [];

  const currentIdx = lastObservedIndex(tuples.map((item) => item.period), now);
  const sliceStart = Math.max(0, currentIdx - (points - 1));
  const subset = tuples.slice(sliceStart, currentIdx + 1);
  return subset.map((entry) => ({ ts: toIsoFromPeriod(entry.period), value: Number(entry.value.toFixed(4)) }));
}

function detectCadence(period: Array<string | number>): "Daily" | "Weekly" | "Monthly" | "Quarterly" | "Annual" | "Unknown" {
  const sample = period
    .map((value) => String(value || "").trim())
    .find(Boolean);
  if (!sample) return "Unknown";
  if (/^\d{4}-\d{2}-\d{2}$/.test(sample)) return "Daily";
  if (/^\d{4}-W\d{1,2}$/i.test(sample)) return "Weekly";
  if (/^\d{4}-\d{2}$/.test(sample)) return "Monthly";
  if (/^\d{4}-Q[1-4]$/i.test(sample)) return "Quarterly";
  if (/^\d{4}$/.test(sample)) return "Annual";
  return "Unknown";
}

function extractDoc(payload: any): DbnomicsSeriesDoc | undefined {
  const docs = payload?.series?.docs;
  if (!Array.isArray(docs) || !docs.length) return undefined;
  const doc = docs[0] as DbnomicsSeriesDoc;
  if (!Array.isArray(doc.period) || !Array.isArray(doc.value)) return undefined;
  return doc;
}

function normalizeCoverage(rows: GrainWidgetTableRow[]) {
  return {
    ok: rows.filter((row) => row.price?.normalizationStatus === "OK").length,
    partial: rows.filter((row) => row.price?.normalizationStatus === "PARTIAL").length,
    fxMissing: rows.filter((row) => row.price?.normalizationStatus === "FX_MISSING").length,
    unavailable: rows.filter((row) => row.price?.normalizationStatus === "UNAVAILABLE" || !row.price?.normalizationStatus).length,
  };
}

async function fetchSeries(seriesCode: string): Promise<{ doc?: DbnomicsSeriesDoc; sourceUrl: string; error?: string }> {
  const sourceUrl = `${DBNOMICS_API_BASE_URL}/series/WB/commodity_prices/${seriesCode}?observations=true`;
  try {
    const text = await fetchTextWithTimeout(sourceUrl, DBNOMICS_TIMEOUT_MS);
    const payload = JSON.parse(text);
    const doc = extractDoc(payload);
    if (!doc) return { sourceUrl, error: "dbnomics_series_shape_unexpected" };
    return { sourceUrl, doc };
  } catch (error: any) {
    return { sourceUrl, error: error?.message || "dbnomics_fetch_failed" };
  }
}

export class DbNomicsSpotProvider implements GrainWidgetsProvider {
  id = "dbnomics-worldbank";
  kind = "GLOBAL_SPOT_TABLE" as const;
  enabled = ENABLE_DBNOMICS_SPOT_PROVIDER;
  private readonly fallback = new MockGrainWidgetsProvider({ kind: "GLOBAL_SPOT_TABLE" });

  async getWidget(ctx: GrainWidgetsProviderContext): Promise<GrainWidgetGlobalSpotTable> {
    const map = parseSeriesMap();
    const notes: string[] = ["World Bank commodity_prices via DBnomics"];
    const rows: GrainWidgetTableRow[] = [];
    const sourceUrlsUsed: string[] = [];

    for (const instrument of INSTRUMENTS) {
      const candidates = map[instrument.key] || [];
      let selectedDoc: DbnomicsSeriesDoc | undefined;
      let selectedSourceUrl: string | undefined;
      const instrumentErrors: string[] = [];

      for (const code of candidates) {
        const result = await fetchSeries(code);
        sourceUrlsUsed.push(result.sourceUrl);
        if (result.doc) {
          selectedDoc = result.doc;
          selectedSourceUrl = result.sourceUrl;
          break;
        }
        if (result.error) instrumentErrors.push(`${code}:${result.error}`);
      }

      if (!selectedDoc) {
        notes.push(`${instrument.label}: source unavailable (${instrumentErrors[0] || "no_series"})`);
        rows.push({
          id: instrument.id,
          label: instrument.label,
          region: instrument.region,
          commodityGroup: instrument.commodityGroup,
          status: "OFFLINE",
          sourceName: "DBnomics",
          sourceAttribution: "Data: DBnomics (World Bank commodity_prices)",
          updatedAt: ctx.now.toISOString(),
          price: {
            nativeValueCurrent: undefined,
            nativeUnit: "USD/t",
            nativeCurrency: "USD",
            normalizationStatus: "UNAVAILABLE",
          },
          notes: instrumentErrors.length ? [instrumentErrors.join(" | ")] : ["series not found"],
        });
        continue;
      }

      const values = selectedDoc.value || [];
      const periods = selectedDoc.period || [];
      const pairs = periods
        .map((period, idx) => ({ period, value: parseNumber(values[idx]) }))
        .filter((entry): entry is { period: string | number; value: number } => typeof entry.value === "number");

      const latestObservedIdx = pairs.length ? lastObservedIndex(pairs.map((p) => p.period), ctx.now) : -1;
      const current = latestObservedIdx >= 0 ? pairs[latestObservedIdx].value : undefined;
      const prev = latestObservedIdx > 0 ? pairs[latestObservedIdx - 1].value : undefined;
      const change = current != null && prev != null ? Number((current - prev).toFixed(2)) : undefined;
      const changePct = current != null && prev != null && prev !== 0 ? Number((((current - prev) / prev) * 100).toFixed(2)) : undefined;

      const normalized = normalizeRowPrice({
        row: {
          id: instrument.id,
          label: instrument.label,
          region: instrument.region,
          commodityGroup: instrument.commodityGroup,
          status: statusFromAvailability({ hasValue: current != null, indicative: true }),
          sourceName: "DBnomics",
          sourceAttribution: "Data: DBnomics (World Bank commodity_prices)",
          updatedAt: ctx.now.toISOString(),
          notes: selectedSourceUrl ? [selectedSourceUrl] : undefined,
          price: {
            nativeValueCurrent: current,
            nativeValueChange: change,
            nativeValueChangePct: changePct,
            nativeCurrency: "USD",
            nativeUnit: "USD/t",
            normalizationStatus: "UNAVAILABLE",
            series: buildSeries(periods, values, ctx.seriesPoints, ctx.now),
          },
        },
        eurUsd: ctx.eurUsd,
        crop: instrument.crop,
        nativeUnitType: instrument.nativeUnitType,
      });

      rows.push(normalized);
      const cadence = detectCadence(periods);
      notes.push(`${instrument.label}: cadence=${cadence}`);
    }

    const available = rows.filter((row) => row.price?.nativeValueCurrent != null || row.price?.normalizedValueCurrent != null).length;
    const expected = INSTRUMENTS.length;
    const meanChange = rows
      .map((row) => row.price?.normalizedValueChangePct ?? row.price?.nativeValueChangePct)
      .filter((v): v is number => typeof v === "number");
    const avg = meanChange.length ? meanChange.reduce((sum, value) => sum + value, 0) / meanChange.length : 0;
    const momentumLabel = avg > 0.4 ? "Firm" : avg < -0.4 ? "Soft" : Math.abs(avg) < 0.2 ? "Flat" : "Mixed";

    return {
      id: "grain-global-spot",
      kind: "GLOBAL_SPOT_TABLE",
      title: "Spot (Global)",
      subtitle: "World Bank commodity benchmark prices",
      status: available >= 3 ? "REFRESH" : available > 0 ? "INDICATIVE" : "OFFLINE",
      sourceName: "DBnomics",
      sourceAttribution: "Data: DBnomics (World Bank commodity_prices)",
      sourceUrl: sourceUrlsUsed[0] || `${DBNOMICS_API_BASE_URL}/datasets/WB/commodity_prices`,
      updatedAt: ctx.now.toISOString(),
      timeframe: ctx.timeframe,
      rows,
      summary: {
        rowCount: rows.length,
        momentumLabel,
        normalizedCoverage: normalizeCoverage(rows),
      },
      notes: notes.length ? notes : undefined,
      fallbackReason: available > 0 ? undefined : "coverage_empty",
    };
  }

  mockFallback(reason: string, ctx: GrainWidgetsProviderContext): GrainWidgetGlobalSpotTable {
    return this.fallback.mockFallback(reason, ctx) as GrainWidgetGlobalSpotTable;
  }
}
