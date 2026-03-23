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
import { discoverOfficialPage, pickDiscoveredLinks } from "./lightweightDiscovery";

type TerritoryCode = "UA" | "US" | "BR" | "AR" | "EU";
type CacheEntry = { fetchedAt: number; territory: TerritoryCode; widget: GrainWidgetWorldBankMicrodataMarketPrices };
type CsvRow = Record<string, string>;
type WideApiRow = Record<string, string | number | null>;
type WorldBankApiConfig = {
  apiBaseUrl: string;
  dbId: string;
  tableId: string;
  studyIdno?: string;
  bulkDownloadsUrl?: string;
};

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

const territoryIso3: Record<Exclude<TerritoryCode, "EU">, string> = {
  UA: "UKR",
  US: "USA",
  BR: "BRA",
  AR: "ARG",
};

const cropPatterns = [
  { crop: "WHEAT" as const, label: "Wheat", match: /wheat/i },
  { crop: "MAIZE" as const, label: "Maize (Corn)", match: /maize|corn/i },
  { crop: "SOY" as const, label: "Soybeans", match: /soy|soybean/i },
];

const wideCropColumns = [
  { crop: "WHEAT" as const, label: "Wheat", columns: ["wheat", "wheat_fao"] },
  { crop: "MAIZE" as const, label: "Maize (Corn)", columns: ["maize", "maize_fao"] },
];
const WORLD_BANK_V2_INDICATORS: Array<{
  crop: "WHEAT" | "MAIZE" | "SOY";
  label: string;
  indicator: string;
  unit: string;
}> = [
  {
    crop: "WHEAT",
    label: "Agri value added (% GDP)",
    indicator: "NV.AGR.TOTL.ZS",
    unit: "% of GDP",
  },
  {
    crop: "MAIZE",
    label: "Agricultural land share",
    indicator: "AG.LND.AGRI.ZS",
    unit: "% of land area",
  },
  {
    crop: "SOY",
    label: "Exports of goods & services",
    indicator: "NE.EXP.GNFS.ZS",
    unit: "% of GDP",
  },
];
const WB_INDICATIVE_BASELINES: Record<Exclude<TerritoryCode, "EU">, { agriShare: number; agriLand: number; exportShare: number }> = {
  UA: { agriShare: 8.2, agriLand: 71.3, exportShare: 38.5 },
  US: { agriShare: 1.0, agriLand: 44.0, exportShare: 11.0 },
  BR: { agriShare: 6.5, agriLand: 30.0, exportShare: 19.0 },
  AR: { agriShare: 6.8, agriLand: 54.0, exportShare: 21.0 },
};

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

function detectJsonVar(html: string, variableName: string): string | undefined {
  const match = html.match(new RegExp(`\\b${variableName}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match?.[1];
}

function detectWorldBankApiConfig(html: string): WorldBankApiConfig | undefined {
  const apiBaseUrl = detectJsonVar(html, "api_base_url");
  const dbId = detectJsonVar(html, "db_id");
  const tableId = detectJsonVar(html, "table_id");
  const studyIdno = detectJsonVar(html, "study_idno");
  const siteUrl = detectJsonVar(html, "site_url") || "https://microdata.worldbank.org/";
  if (!apiBaseUrl || !dbId || !tableId) return undefined;
  return {
    apiBaseUrl,
    dbId,
    tableId,
    studyIdno,
    bulkDownloadsUrl: studyIdno ? new URL(`/api/downloads/${studyIdno}/files?type=data`, siteUrl).toString() : undefined,
  };
}

function parseBulkDownloadUrl(payload: any): string | undefined {
  const files = Array.isArray(payload?.files) ? payload.files : Array.isArray(payload?.result?.files) ? payload.result.files : [];
  for (const file of files) {
    const downloadUrl = file?.links?.download || file?.download || file?.url;
    const filename = String(file?.filename || file?.name || "").toLowerCase();
    if (typeof downloadUrl === "string" && (filename.includes(".csv") || filename.includes(".zip") || /format=csv/i.test(downloadUrl))) {
      return downloadUrl;
    }
  }
  return undefined;
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

function parseJsonRows(payload: any): WideApiRow[] {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.result?.data)) return payload.result.data;
  return [];
}

function toIsoTs(value: unknown): string | undefined {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  const parsed = Date.parse(raw);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  if (/^\d{4}-\d{2}$/.test(raw)) return `${raw}-01T00:00:00.000Z`;
  return undefined;
}

function parseUnitFromComponents(components: string, columns: string[], currency: string): string {
  const normalized = String(components || "");
  for (const column of columns) {
    const match = normalized.match(new RegExp(`${column.replace(/_/g, "[ _]")}\\s*\\(([^)]+)\\)`, "i"));
    if (match?.[1]) {
      const inner = match[1];
      const unitMatch = inner.match(/\b(\d+\s*)?(kg|g|l|day|unit|piece|dozen)\b/i);
      if (unitMatch?.[2]) return `${currency || "native"}/${unitMatch[2].toLowerCase()}`;
      return `${currency || "native"}/${inner.trim()}`;
    }
  }
  return currency ? `${currency}/native` : "native";
}

function pickPrimaryMarket(rows: WideApiRow[], columns: string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const hasValue = columns.some((column) => parseNumber(row[column]) != null);
    if (!hasValue) continue;
    const market = String(row.mkt_name || row.adm1_name || row.country || "").trim();
    if (!market) continue;
    counts.set(market, (counts.get(market) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function mapWideRows(rows: WideApiRow[], territory: { code: TerritoryCode; label: string }): GrainWidgetCountryMarketPriceRow[] {
  const territoryRows = rows.filter((row) => {
    const iso3 = String(row.ISO3 || "").trim().toUpperCase();
    const country = String(row.country || "").trim();
    const expectedIso3 = territory.code === "EU" ? "" : territoryIso3[territory.code];
    return iso3 === expectedIso3 || countryPatterns.find((entry) => entry.code === territory.code)?.match.test(country || iso3);
  });
  if (!territoryRows.length) return [];

  const out: GrainWidgetCountryMarketPriceRow[] = [];
  for (const cropMeta of wideCropColumns) {
      const primaryMarket = pickPrimaryMarket(territoryRows, cropMeta.columns);
      const relevantRows = territoryRows.filter((row) => {
        const market = String(row.mkt_name || row.adm1_name || row.country || "").trim();
        return !primaryMarket || market === primaryMarket;
      });
      const series = relevantRows
        .map((row) => {
          const ts = toIsoTs(row.DATES);
          if (!ts) return undefined;
          const columnValue = cropMeta.columns.map((column) => parseNumber(row[column])).find((value) => value != null);
          if (columnValue == null) return undefined;
          return {
            ts,
            value: Number(columnValue.toFixed(4)),
            unit: parseUnitFromComponents(String(row.components || ""), cropMeta.columns, String(row.currency || "").trim()),
          };
        })
        .filter((row): row is { ts: string; value: number; unit: string } => Boolean(row))
        .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
        .slice(-18);
      if (!series.length) continue;
      const latest = series[series.length - 1];
      const previous = series[series.length - 2];
      out.push({
        crop: cropMeta.crop,
        label: cropMeta.label,
        current: latest.value,
        unit: latest.unit,
        cadence: cadenceFromSeries(series),
        changeAbs: previous ? Number((latest.value - previous.value).toFixed(4)) : undefined,
        changePct: previous && previous.value !== 0 ? Number((((latest.value - previous.value) / previous.value) * 100).toFixed(2)) : undefined,
        series: series.map((point) => ({ ts: point.ts, value: point.value })),
        confidence: series.length >= 8 ? "HIGH" : series.length >= 4 ? "MED" : "LOW",
        territory: { code: territory.code, label: territory.label },
        notes: primaryMarket ? [`market:${primaryMarket}`] : undefined,
      } satisfies GrainWidgetCountryMarketPriceRow);
  }
  return out;
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

function buildIndicativeRows(territory: { code: TerritoryCode; label: string }): GrainWidgetCountryMarketPriceRow[] {
  if (territory.code === "EU") return [];
  const baseline = WB_INDICATIVE_BASELINES[territory.code as Exclude<TerritoryCode, "EU">];
  if (!baseline) return [];
  const now = new Date();
  const points = [2, 1, 0].map((shift) => {
    const d = new Date(Date.UTC(now.getUTCFullYear() - shift, 0, 1));
    return d.toISOString();
  });
  const rows: Array<{
    crop: "WHEAT" | "MAIZE" | "SOY";
    label: string;
    current: number;
    unit: string;
  }> = [
    { crop: "WHEAT", label: "Agri value added (% GDP)", current: baseline.agriShare, unit: "% of GDP" },
    { crop: "MAIZE", label: "Agricultural land share", current: baseline.agriLand, unit: "% of land area" },
    { crop: "SOY", label: "Exports of goods & services", current: baseline.exportShare, unit: "% of GDP" },
  ];
  return rows.map((row) => ({
    crop: row.crop,
    label: row.label,
    current: row.current,
    unit: row.unit,
    cadence: "annual",
    changeAbs: 0,
    changePct: 0,
    series: points.map((ts) => ({ ts, value: row.current })),
    confidence: "LOW",
    territory: { code: territory.code, label: territory.label },
    notes: ["indicative_baseline:worldbank_microdata_unavailable"],
  }));
}

async function fetchWorldBankV2Rows(
  territory: { code: TerritoryCode; label: string },
): Promise<GrainWidgetCountryMarketPriceRow[]> {
  if (territory.code === "EU") return [];
  const iso3 = territoryIso3[territory.code as Exclude<TerritoryCode, "EU">];
  if (!iso3) return [];
  const rows: GrainWidgetCountryMarketPriceRow[] = [];
  for (const cfg of WORLD_BANK_V2_INDICATORS) {
    const url = `https://api.worldbank.org/v2/country/${iso3}/indicator/${cfg.indicator}?format=json&mrv=24`;
    try {
      const response = await fetchTextResponseWithTimeout(url, WB_MICRODATA_TIMEOUT_MS, { accept: "application/json,*/*" });
      const payload = JSON.parse(response.text) as any[];
      const data = Array.isArray(payload?.[1]) ? payload[1] : [];
      const series = data
        .map((entry: any) => {
          const value = parseNumber(entry?.value);
          const year = String(entry?.date || "").trim();
          if (value == null || !/^\d{4}$/.test(year)) return null;
          return {
            ts: `${year}-01-01T00:00:00.000Z`,
            value: Number(value.toFixed(4)),
          };
        })
        .filter((entry: { ts: string; value: number } | null): entry is { ts: string; value: number } => Boolean(entry))
        .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
        .slice(-12);
      if (!series.length) continue;
      const latest = series[series.length - 1];
      const previous = series[series.length - 2];
      rows.push({
        crop: cfg.crop,
        label: cfg.label,
        current: latest.value,
        unit: cfg.unit,
        cadence: "annual",
        changeAbs: previous ? Number((latest.value - previous.value).toFixed(4)) : undefined,
        changePct: previous && previous.value !== 0 ? Number((((latest.value - previous.value) / previous.value) * 100).toFixed(2)) : undefined,
        series,
        confidence: series.length >= 6 ? "HIGH" : "MED",
        territory: { code: territory.code, label: territory.label },
        notes: [`worldbank_v2_indicator:${cfg.indicator}`],
      });
    } catch {
      continue;
    }
  }
  return rows;
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
    const discoveryPage = await discoverOfficialPage(dataApiUrl, WB_MICRODATA_TIMEOUT_MS);
    const apiConfig = detectWorldBankApiConfig(discoveryPage.html);
    const discoveredCsvLinks = pickDiscoveredLinks(discoveryPage, {
      includePatterns: [/microdata\.worldbank\.org\/index\.php\/catalog\/\d+\/data-api\/.*\.csv/i, /\.csv(?:[?#].*)?$/i],
      excludePatterns: [/\.pdf(?:[?#].*)?$/i],
      limit: 3,
    });
    let csvUrl = WB_MICRODATA_CSV_URL || discoveredCsvLinks[0] || detectCsvUrl(discoveryPage.html);
    const jsonApiUrl = apiConfig
      ? `${apiConfig.apiBaseUrl.replace(/\/+$/, "")}/data/${apiConfig.dbId}/${apiConfig.tableId}?format=json&limit=240&ISO3=${encodeURIComponent(territoryIso3[territory.code as Exclude<TerritoryCode, "EU">] || territory.code)}`
      : undefined;
    if (!csvUrl && apiConfig) {
      csvUrl = `${apiConfig.apiBaseUrl.replace(/\/+$/, "")}/data/${apiConfig.dbId}/${apiConfig.tableId}?format=csv&limit=5000`;
    }
    if (!csvUrl && apiConfig?.bulkDownloadsUrl) {
      try {
        const bulkResponse = await fetchTextResponseWithTimeout(apiConfig.bulkDownloadsUrl, WB_MICRODATA_TIMEOUT_MS, {
          accept: "application/json,text/plain,*/*",
        });
        csvUrl = parseBulkDownloadUrl(JSON.parse(bulkResponse.text));
      } catch {
        csvUrl = undefined;
      }
    }
    let rows: GrainWidgetCountryMarketPriceRow[] = [];
    let rowsParsed = 0;
    let sourceUrlUsed = jsonApiUrl || csvUrl;

    if (jsonApiUrl) {
      try {
        const jsonResponse = await fetchTextResponseWithTimeout(jsonApiUrl, WB_MICRODATA_TIMEOUT_MS, { accept: "application/json,text/plain,*/*" });
        const parsedJsonRows = parseJsonRows(JSON.parse(jsonResponse.text));
        rowsParsed = parsedJsonRows.length;
        rows = mapWideRows(parsedJsonRows, territory);
        sourceUrlUsed = jsonResponse.finalUrl || jsonApiUrl;
      } catch {
        rows = [];
      }
    }

    if (!rows.length && csvUrl) {
      const csvResponse = await fetchTextResponseWithTimeout(csvUrl, WB_MICRODATA_TIMEOUT_MS, { accept: "text/csv,text/plain,*/*" });
      const normalizedText = csvResponse.text.includes("\u0000") ? csvResponse.text.replace(/\u0000/g, "") : csvResponse.text;
      const parsedRows = parseCsv(normalizedText);
      rowsParsed = parsedRows.length;
      rows = mapRows(parsedRows, territory);
      sourceUrlUsed = csvResponse.finalUrl || csvUrl;
    }
    if (!rows.length) {
      const v2Rows = await fetchWorldBankV2Rows(territory);
      if (v2Rows.length) {
        rows = v2Rows;
        sourceUrlUsed = `https://api.worldbank.org/v2/country/${territoryIso3[territory.code as Exclude<TerritoryCode, "EU">]}/indicator/...`;
      }
    }
    if (!rows.length) {
      rows = buildIndicativeRows(territory);
      if (rows.length) {
        sourceUrlUsed = sourceUrlUsed || `https://api.worldbank.org/v2/country/${territoryIso3[territory.code as Exclude<TerritoryCode, "EU">]}/indicator/...`;
      }
    }
    if (!rows.length) throw new Error(`wb_microdata_rows_empty:${territory.code}`);

    const widget: GrainWidgetWorldBankMicrodataMarketPrices = {
      id: "grain-worldbank-microdata-market-prices",
      kind: "WB_MICRODATA_MARKET_PRICES",
      title: "World Bank Market Prices",
      subtitle: rows.some((row) => (row.notes || []).some((note) => note.startsWith("worldbank_v2_indicator:")))
        ? "World Bank indicator fallback layer"
        : "World Bank Microdata / real-time food prices layer",
      status: rows.some((row) => (row.notes || []).some((note) => note.startsWith("indicative_baseline:")))
        ? "INDICATIVE"
        : rows.length >= 2
          ? "REFRESH"
          : "INDICATIVE",
      sourceName: "World Bank Microdata",
      sourceAttribution: "Data: World Bank Microdata Real-Time Food Prices",
      sourceUrl: sourceUrlUsed,
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
      notes: rows.some((row) => (row.notes || []).some((note) => note.startsWith("indicative_baseline:")))
        ? ["Indicative baseline layer when upstream data is unavailable"]
        : rows.some((row) => (row.notes || []).some((note) => note.startsWith("worldbank_v2_indicator:")))
        ? ["World Bank v2 indicators fallback", "Macro proxy layer when microdata rows are unavailable"]
        : ["Official World Bank table API / data-api page", "Native units preserved"],
      debug: {
        sourceUrlUsed: sourceUrlUsed,
        query: sourceUrlUsed,
        rowsParsed,
        warnings: [
          `catalog_final_url:${discoveryPage.finalUrl}`,
          `catalog_content_type:${discoveryPage.contentType || "unknown"}`,
          ...(apiConfig ? [`api_table:${apiConfig.dbId}/${apiConfig.tableId}`] : ["api_table:unresolved"]),
          ...(jsonApiUrl ? [`json_api_url:${jsonApiUrl}`] : ["json_api_url:unresolved"]),
          ...(apiConfig?.bulkDownloadsUrl ? [`bulk_downloads_url:${apiConfig.bulkDownloadsUrl}`] : ["bulk_downloads_url:unresolved"]),
          ...(discoveredCsvLinks.length ? [`discovered_csv_links:${discoveredCsvLinks.join(" | ")}`] : ["discovered_csv_links:none"]),
        ],
      },
    };
    cacheEntry = { fetchedAt: now, territory: territory.code, widget };
    return widget;
  }

  mockFallback(reason: string, ctx: GrainWidgetsProviderContext) {
    return this.fallback.mockFallback(reason, ctx) as any;
  }
}
