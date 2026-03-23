import {
  ENABLE_FAO_FFPI_PROVIDER,
  FAO_FFPI_PAGE_URL,
  FAO_FFPI_PARSER_MODE,
  FAO_FFPI_TIMEOUT_MS,
  FAO_FFPI_URL,
} from "../config";
import type { GrainWidgetCropPriceIndex, GrainWidgetPoint, GrainWidgetStatCard } from "../types";
import type { GrainWidgetsProvider, GrainWidgetsProviderContext } from "./types";
import { MockGrainWidgetsProvider } from "./mockGrainWidgetsProvider";
import { fetchTextWithTimeout, parseNumber } from "./utils";

type FaoRow = {
  date: string;
  food?: number;
  cereals?: number;
  oils?: number;
};

function toMonthIso(monthKey: string): string {
  if (/^\d{4}-\d{2}$/.test(monthKey)) return `${monthKey}-01T00:00:00.000Z`;
  return new Date().toISOString();
}

function pctDelta(current?: number, previous?: number): number | undefined {
  if (current == null || previous == null || previous === 0) return undefined;
  return Number((((current - previous) / previous) * 100).toFixed(2));
}

function absDelta(current?: number, previous?: number): number | undefined {
  if (current == null || previous == null) return undefined;
  return Number((current - previous).toFixed(2));
}

function parseCsvRows(csv: string): FaoRow[] {
  const lines = csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const headerIndex = lines.findIndex((line) => /^Date,/.test(line));
  if (headerIndex < 0 || headerIndex + 1 >= lines.length) return [];

  const rows: FaoRow[] = [];
  for (const line of lines.slice(headerIndex + 1)) {
    if (!/^\d{4}-\d{2},/.test(line)) continue;
    const parts = line.split(",");
    const date = parts[0];
    rows.push({
      date,
      food: parseNumber(parts[1]),
      cereals: parseNumber(parts[4]),
      oils: parseNumber(parts[5]),
    });
  }

  return rows;
}

function extractCsvUrlFromPage(html: string): string | undefined {
  const match = html.match(/https:\/\/www\.fao\.org\/media\/docs\/worldfoodsituationlibraries\/default-document-library\/[^"\s]+food_price_indices_data[^"\s]+\.csv[^"\s]*/i);
  if (!match?.[0]) return undefined;
  return match[0].replace(/&amp;/g, "&");
}

function buildSeries(rows: FaoRow[], selector: (row: FaoRow) => number | undefined, points: number): GrainWidgetPoint[] {
  const values = rows
    .map((row) => ({ ts: toMonthIso(row.date), value: selector(row) }))
    .filter((row): row is { ts: string; value: number } => typeof row.value === "number");

  if (values.length < 2) return [];
  return values.slice(-Math.max(points, 3)).map((entry) => ({ ts: entry.ts, value: Number(entry.value.toFixed(2)) }));
}

function buildCard(args: {
  id: string;
  label: string;
  rows: FaoRow[];
  selector: (row: FaoRow) => number | undefined;
  status: GrainWidgetCropPriceIndex["status"];
  points: number;
}): GrainWidgetStatCard {
  const series = buildSeries(args.rows, args.selector, args.points);
  const current = series.length ? series[series.length - 1].value : undefined;
  const previous = series.length > 1 ? series[series.length - 2].value : undefined;
  return {
    id: args.id,
    label: args.label,
    value: current,
    delta: absDelta(current, previous),
    deltaPct: pctDelta(current, previous),
    status: args.status,
    series,
    notes: ["Unit: index pts"],
  };
}

async function fetchCsvFromSource(): Promise<{ csv?: string; sourceUrlUsed: string; notes: string[] }> {
  const notes: string[] = [];

  const direct = await fetchTextWithTimeout(FAO_FFPI_URL, FAO_FFPI_TIMEOUT_MS).catch(() => "");
  if (direct && direct.includes("Date,Food Price Index")) {
    return { csv: direct, sourceUrlUsed: FAO_FFPI_URL, notes };
  }

  notes.push("Direct CSV unavailable, falling back to FAO page discovery");
  if (FAO_FFPI_PARSER_MODE === "csv") {
    return { sourceUrlUsed: FAO_FFPI_URL, notes: [...notes, "Parser mode csv-only"] };
  }

  const page = await fetchTextWithTimeout(FAO_FFPI_PAGE_URL, FAO_FFPI_TIMEOUT_MS);
  const discovered = extractCsvUrlFromPage(page);
  if (!discovered) {
    return { sourceUrlUsed: FAO_FFPI_PAGE_URL, notes: [...notes, "CSV link not found in FAO page"] };
  }

  const csv = await fetchTextWithTimeout(discovered, FAO_FFPI_TIMEOUT_MS);
  return { csv, sourceUrlUsed: discovered, notes: [...notes, "CSV discovered from FAO page"] };
}

export class FaoFfpiProvider implements GrainWidgetsProvider {
  id = "fao-ffpi";
  kind = "CROP_PRICE_INDEX" as const;
  enabled = ENABLE_FAO_FFPI_PROVIDER;
  private readonly fallback = new MockGrainWidgetsProvider({ kind: "CROP_PRICE_INDEX" });

  async getWidget(ctx: GrainWidgetsProviderContext): Promise<GrainWidgetCropPriceIndex> {
    const fetched = await fetchCsvFromSource();
    if (!fetched.csv) throw new Error("fao_ffpi_csv_unavailable");

    const rows = parseCsvRows(fetched.csv);
    const status: GrainWidgetCropPriceIndex["status"] = rows.length >= 2 ? "REFRESH" : rows.length > 0 ? "INDICATIVE" : "OFFLINE";

    const cards: GrainWidgetStatCard[] = [
      buildCard({ id: "ffpi-headline", label: "FAO Food Price Index", rows, selector: (row) => row.food, status, points: ctx.seriesPoints }),
      buildCard({ id: "ffpi-cereals", label: "Cereals Index", rows, selector: (row) => row.cereals, status, points: ctx.seriesPoints }),
      buildCard({ id: "ffpi-oils", label: "Vegetable Oils Index", rows, selector: (row) => row.oils, status, points: ctx.seriesPoints }),
    ];

    const available = cards.filter((card) => typeof card.value === "number").length;

    return {
      id: "grain-crop-price-index",
      kind: "CROP_PRICE_INDEX",
      title: "Index (Composite)",
      subtitle: "FAO Food Price Index (monthly)",
      status: available >= 2 ? status : available > 0 ? "INDICATIVE" : "OFFLINE",
      sourceName: "FAO FFPI",
      sourceAttribution: "Data: FAO Food Price Index",
      sourceUrl: fetched.sourceUrlUsed,
      updatedAt: ctx.now.toISOString(),
      timeframe: ctx.timeframe,
      cards,
      rows: [],
      notes: [
        "Index points (2014-2016=100); not normalized to USD/t",
        ...(fetched.notes || []),
      ],
      fallbackReason: available > 0 ? undefined : "coverage_empty",
    };
  }

  mockFallback(reason: string, ctx: GrainWidgetsProviderContext): GrainWidgetCropPriceIndex {
    return this.fallback.mockFallback(reason, ctx) as GrainWidgetCropPriceIndex;
  }
}
