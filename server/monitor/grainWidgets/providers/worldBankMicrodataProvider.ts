import {
  ENABLE_WB_MICRODATA_WIDGET,
  WB_MICRODATA_BASE_URL,
  WB_MICRODATA_CACHE_TTL_MS,
  WB_MICRODATA_COUNTRIES,
  WB_MICRODATA_CSV_URL,
  WB_MICRODATA_TIMEOUT_MS,
} from "../config";
import type {
  GrainWidgetCountryMarketPriceRow,
  GrainWidgetPoint,
  GrainWidgetWorldBankMicrodataMarketPrices,
} from "../types";
import type { GrainWidgetsProvider, GrainWidgetsProviderContext } from "./types";
import { MockGrainWidgetsProvider } from "./mockGrainWidgetsProvider";
import { fetchTextResponseWithTimeout, parseNumber } from "./utils";

type TerritoryCode = "UA" | "US" | "BR" | "AR" | "EU";
type CacheEntry = { fetchedAt: number; territory: TerritoryCode; widget: GrainWidgetWorldBankMicrodataMarketPrices };
type CsvRow = Record<string, string>;

let cacheEntry: CacheEntry | null = null;

const territoryLabels: Record<TerritoryCode, string> = {
  UA: "Ukraine",
  US: "United States",
  BR: "Brazil",
  AR: "Argentina",
  EU: "European Union",
};

const countryPatterns = [
  { code: "UA" as const, match: /ukraine|^ua$/i },
  { code: "US" as const, match: /united states|^us$/i },
  { code: "BR" as const, match: /brazil|^br$/i },
  { code: "AR" as const, match: /argentina|^ar$/i },
];

const cropPatterns = [
  { crop: "WHEAT" as const, label: "Wheat", match: /wheat/i },
  { crop: "MAIZE" as const, label: "Maize (Corn)", match: /maize|corn/i },
  { crop: "SOY" as const, label: "Soybeans", match: /soy|soybean/i },
];

function territoryFromCountry(raw?: string): { code: TerritoryCode; label: string } {
  const code = String(raw || "UA").toUpperCase() as TerritoryCode;
  if (code in territoryLabels) return { code, label: territoryLabels[code] };
  return { code: "UA", label: territoryLabels.UA };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      out.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  out.push(current);
  return out.map((value) => value.trim());
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row: CsvRow = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });
    return row;
  });
}

function detectCsvUrl(html: string): string | undefined {
  const explicit = html.match(/https:\/\/microdata\.worldbank\.org\/index\.php\/catalog\/\d+\/data-api\/[^"' ]+\.csv/ig);
  if (explicit?.[0]) return explicit[0];
  const relative = html.match(/\/index\.php\/catalog\/\d+\/data-api\/[^"' ]+\.csv/ig);
  return relative?.[0] ? `https://microdata.worldbank.org${relative[0]}` : undefined;
}

function cadenceFromSeries(series: GrainWidgetPoint[]): GrainWidgetCountryMarketPriceRow["cadence"] {
  if (series.length < 3) return "unknown";
  const points = series.map((point) => Date.parse(point.ts)).filter(Number.isFinite).sort((a, b) => a - b);
  const diffs = points.slice(1).map((value, index) => Math.round((value - points[index]) / 86_400_000)).filter((value) => value > 0);
  const median = diffs.sort((a, b) => a - b)[Math.floor(diffs.length / 2)] || 0;
  if (median <= 10) return "weekly";
  if (median <= 40) return "monthly";
  return "annual";
}

function mapRows(rows: CsvRow[], territory: { code: TerritoryCode; label: string }): GrainWidgetCountryMarketPriceRow[] {
  const filtered = rows.filter((row) => {
    const country = `${row.country || ""} ${row.adm0_name || ""} ${row.location || ""}`;
    return countryPatterns.find((entry) => entry.code === territory.code)?.match.test(country);
  });
  const grouped = new Map<string, Array<{ ts: string; value: number; unit: string }>>();
  for (const row of filtered) {
    const commodity = String(row.commodity || row.item || row.product || row.cm_name || "").trim();
    const crop = cropPatterns.find((entry) => entry.match.test(commodity));
    if (!crop) continue;
    const value = parseNumber(row.price || row.value || row.mp_price);
    const dateRaw = String(row.date || row.period_date || row.month || row.reference_period || "").trim();
    const ts = dateRaw ? (Number.isFinite(Date.parse(dateRaw)) ? new Date(Date.parse(dateRaw)).toISOString() : /^\d{4}-\d{2}$/.test(dateRaw) ? `${dateRaw}-01T00:00:00.000Z` : undefined) : undefined;
    if (value == null || !ts) continue;
    const unit = String(row.unit || row.price_unit || row.currency || "native").trim() || "native";
    const key = `${crop.crop}::${unit}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push({ ts, value, unit });
  }

  return [...grouped.entries()].map(([key, entries]) => {
    const [crop] = key.split("::");
    const cropMeta = cropPatterns.find((entry) => entry.crop === crop)!;
    const series = entries.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts)).slice(-12).map((entry) => ({ ts: entry.ts, value: Number(entry.value.toFixed(4)) }));
    const latest = series[series.length - 1];
    const previous = series[series.length - 2];
    return {
      crop: cropMeta.crop,
      label: cropMeta.label,
      current: latest?.value || 0,
      unit: entries[entries.length - 1]?.unit || "native",
      cadence: cadenceFromSeries(series),
      changeAbs: latest && previous ? Number((latest.value - previous.value).toFixed(4)) : undefined,
      changePct: latest && previous && previous.value !== 0 ? Number((((latest.value - previous.value) / previous.value) * 100).toFixed(2)) : undefined,
      series,
      confidence: series.length >= 6 ? "HIGH" : "MED",
      territory: { code: territory.code, label: territory.label },
    } satisfies GrainWidgetCountryMarketPriceRow;
  }).filter((row) => row.current !== 0);
}

export class WorldBankMicrodataProvider implements GrainWidgetsProvider {
  id = "worldbank-microdata";
  kind = "WB_MICRODATA_MARKET_PRICES" as const;
  enabled = ENABLE_WB_MICRODATA_WIDGET;
  private readonly fallback = new MockGrainWidgetsProvider({ kind: "WB_MICRODATA_MARKET_PRICES" as any });

  async getWidget(ctx: GrainWidgetsProviderContext): Promise<GrainWidgetWorldBankMicrodataMarketPrices> {
    const territory = territoryFromCountry(ctx.country);
    if (territory.code === "EU") throw new Error("wb_microdata_eu_not_supported");
    const now = Date.now();
    if (cacheEntry && cacheEntry.territory === territory.code && now - cacheEntry.fetchedAt <= WB_MICRODATA_CACHE_TTL_MS) {
      return { ...cacheEntry.widget, updatedAt: ctx.now.toISOString(), notes: [...(cacheEntry.widget.notes || []), "cache_hit"] };
    }

    const dataApiUrl = `${WB_MICRODATA_BASE_URL}/data-api`;
    const csvUrl = WB_MICRODATA_CSV_URL
      || detectCsvUrl((await fetchTextResponseWithTimeout(dataApiUrl, WB_MICRODATA_TIMEOUT_MS, { accept: "text/html,application/xhtml+xml,*/*" })).text);
    if (!csvUrl) throw new Error("wb_microdata_csv_url_unresolved");
    const csvResponse = await fetchTextResponseWithTimeout(csvUrl, WB_MICRODATA_TIMEOUT_MS, { accept: "text/csv,text/plain,*/*" });
    const rows = mapRows(parseCsv(csvResponse.text), territory);
    if (!rows.length) throw new Error(`wb_microdata_rows_empty:${territory.code}`);

    const widget: GrainWidgetWorldBankMicrodataMarketPrices = {
      id: "grain-worldbank-microdata-market-prices",
      kind: "WB_MICRODATA_MARKET_PRICES",
      title: "World Bank Market Prices",
      subtitle: "World Bank Microdata / real-time food prices layer",
      status: rows.length >= 2 ? "REFRESH" : "INDICATIVE",
      sourceName: "World Bank Microdata",
      sourceAttribution: "Data: World Bank Microdata Real-Time Food Prices",
      sourceUrl: csvUrl,
      updatedAt: ctx.now.toISOString(),
      timeframe: ctx.timeframe,
      territoryScope: "COUNTRY_MULTI",
      territory: { code: territory.code, label: territory.label },
      supportedTerritories: WB_MICRODATA_COUNTRIES.map((code) => ({ code, label: territoryLabels[code as TerritoryCode] || code })),
      territorySelector: {
        paramName: "country",
        default: WB_MICRODATA_COUNTRIES[0] || "UA",
        current: territory.code,
        persistKey: "monitor_country_WB_MICRODATA_MARKET_PRICES",
      },
      rows,
      summary: {
        expectedCount: 3,
        mappedCount: rows.length,
        coverage: `${rows.length}/3`,
        cadence: rows[0]?.cadence || "unknown",
        selectedTerritory: territory.code,
      },
      notes: ["CSV discovered from official World Bank data-api page", "Native units preserved"],
      debug: {
        sourceUrlUsed: csvUrl,
        query: csvUrl,
        rowsParsed: parseCsv(csvResponse.text).length,
      },
    };
    cacheEntry = { fetchedAt: now, territory: territory.code, widget };
    return widget;
  }

  mockFallback(reason: string, ctx: GrainWidgetsProviderContext) {
    return this.fallback.mockFallback(reason, ctx) as any;
  }
}
