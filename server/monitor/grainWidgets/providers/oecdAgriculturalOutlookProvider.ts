import * as cheerio from "cheerio";
import {
  ENABLE_OECD_AGRICULTURAL_OUTLOOK_WIDGET,
  OECD_AGRICULTURAL_OUTLOOK_CACHE_TTL_MS,
  OECD_AGRICULTURAL_OUTLOOK_CEREALS_URL,
  OECD_AGRICULTURAL_OUTLOOK_OILSEEDS_URL,
  OECD_AGRICULTURAL_OUTLOOK_SDMX_BASE_URL,
  OECD_AGRICULTURAL_OUTLOOK_SDMX_DATASET,
  OECD_AGRICULTURAL_OUTLOOK_SDMX_START_PERIOD,
  OECD_AGRICULTURAL_OUTLOOK_TIMEOUT_MS,
} from "../config";
import type { GrainWidgetOecdAgriculturalOutlook, GrainWidgetOecdAgriculturalOutlookItem } from "../types";
import type { GrainWidgetsProvider, GrainWidgetsProviderContext } from "./types";
import { MockGrainWidgetsProvider } from "./mockGrainWidgetsProvider";
import { fetchTextResponseWithTimeout } from "./utils";

type CacheEntry = { fetchedAt: number; widget: GrainWidgetOecdAgriculturalOutlook };
let cacheEntry: CacheEntry | null = null;
type OecdDimension = { id?: string; values?: Array<{ id?: string; name?: string }> };
type OecdSeriesPoint = {
  year: string;
  value: number;
  dims: Record<string, string>;
};

type SdmxTarget = {
  id: string;
  commodity: GrainWidgetOecdAgriculturalOutlookItem["commodity"];
  label: string;
  unit: string;
  confidence: GrainWidgetOecdAgriculturalOutlookItem["confidence"];
  filterCandidates: string[];
};

function buildIndicativeItems(): GrainWidgetOecdAgriculturalOutlookItem[] {
  return [
    { id: "oecd-wheat-indicative", commodity: "WHEAT", label: "Wheat outlook reference", projectedValue: 245, unit: "USD/t", horizon: "2034", cadence: "annual", confidence: "LOW", notes: ["Indicative fallback baseline"] },
    { id: "oecd-maize-indicative", commodity: "MAIZE", label: "Maize outlook reference", projectedValue: 220, unit: "USD/t", horizon: "2034", cadence: "annual", confidence: "LOW", notes: ["Indicative fallback baseline"] },
    { id: "oecd-soy-indicative", commodity: "SOYBEANS", label: "Soybean outlook reference", projectedValue: 460, unit: "USD/t", horizon: "2034", cadence: "annual", confidence: "LOW", notes: ["Indicative fallback baseline"] },
  ];
}

function extractMatch(text: string, patterns: RegExp[]): { value: number; unit: string; horizon: string } | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const value = Number.parseFloat(match[1]);
    const horizon = match[2] || "2034";
    const unit = match[3] || "value";
    if (Number.isFinite(value)) return { value, unit, horizon };
  }
  return undefined;
}

function extractGenericProjection(
  text: string,
  opts: { keyword: RegExp; fallbackUnit: string; valueMin?: number; valueMax?: number },
): { value: number; unit: string; horizon: string } | undefined {
  const normalized = text.replace(/\s+/g, " ");
  const index = normalized.search(opts.keyword);
  if (index < 0) return undefined;
  const window = normalized.slice(Math.max(0, index - 120), Math.min(normalized.length, index + 620));
  const horizon = window.match(/\b(20[3-5]\d)\b/)?.[1] || "2034";

  const usdPerTon = window.match(/(?:usd|us\$)\s*(\d+(?:\.\d+)?)\s*\/?\s*t(?:onne)?/i);
  if (usdPerTon?.[1]) {
    const value = Number.parseFloat(usdPerTon[1]);
    if (Number.isFinite(value)) return { value, unit: "USD/t", horizon };
  }

  const mtValue = window.match(/(\d+(?:\.\d+)?)\s*(mt|million tonnes|million tons|million tonnes)/i);
  if (mtValue?.[1] && mtValue?.[2]) {
    const value = Number.parseFloat(mtValue[1]);
    if (Number.isFinite(value)) return { value, unit: mtValue[2], horizon };
  }

  const looseNumber = (window.match(/\d+(?:\.\d+)?/g) || [])
    .map((value) => Number.parseFloat(value))
    .find((value) => Number.isFinite(value) && value >= (opts.valueMin ?? 20) && value <= (opts.valueMax ?? 3000));
  if (looseNumber != null) return { value: looseNumber, unit: opts.fallbackUnit, horizon };
  return undefined;
}

function parseSdmxPoints(payload: any): OecdSeriesPoint[] {
  const root = payload?.data || payload;
  const dataSet = root?.dataSets?.[0];
  const structure = root?.structure;
  if (!dataSet || !structure) return [];

  const seriesDims: OecdDimension[] = Array.isArray(structure?.dimensions?.series)
    ? structure.dimensions.series
    : [];
  const obsDims: OecdDimension[] = Array.isArray(structure?.dimensions?.observation)
    ? structure.dimensions.observation
    : [];

  const timeDim = obsDims.find((dim) => String(dim?.id || "").toUpperCase() === "TIME_PERIOD");
  const timeValues = Array.isArray(timeDim?.values) ? timeDim!.values! : [];
  const seriesEntries = Object.entries(dataSet?.series || {});
  const out: OecdSeriesPoint[] = [];

  for (const [seriesKey, seriesValueRaw] of seriesEntries) {
    const seriesValue = seriesValueRaw as { observations?: Record<string, unknown> };
    const dimIndexes = String(seriesKey)
      .split(":")
      .map((entry) => Number.parseInt(entry, 10));

    const dims: Record<string, string> = {};
    seriesDims.forEach((dim, index) => {
      const values = Array.isArray(dim?.values) ? dim.values : [];
      const picked = values[dimIndexes[index]];
      const dimId = String(dim?.id || `DIM_${index}`);
      const dimCode = String(picked?.id || picked?.name || "");
      if (dimCode) dims[dimId] = dimCode;
    });

    const observations = seriesValue?.observations || {};
    for (const [obsIndexRaw, obsRaw] of Object.entries(observations)) {
      const obsIndex = Number.parseInt(obsIndexRaw, 10);
      const timeCode = String(timeValues?.[obsIndex]?.id || "");
      if (!timeCode) continue;
      const first = Array.isArray(obsRaw) ? obsRaw[0] : obsRaw;
      const value = Number.parseFloat(String(first));
      if (!Number.isFinite(value)) continue;
      out.push({ year: timeCode, value, dims });
    }
  }

  return out;
}

function pickLatestPoint(points: OecdSeriesPoint[]): OecdSeriesPoint | undefined {
  if (!points.length) return undefined;
  const sorted = [...points].sort((a, b) => {
    const aYear = Number.parseInt(String(a.year).slice(0, 4), 10);
    const bYear = Number.parseInt(String(b.year).slice(0, 4), 10);
    return aYear - bYear;
  });
  return sorted[sorted.length - 1];
}

function oecdSdmxTargets(): SdmxTarget[] {
  return [
    {
      id: "oecd-wheat-price",
      commodity: "WHEAT",
      label: "Wheat outlook price",
      unit: "USD/t",
      confidence: "MED",
      filterCandidates: ["A.WLD.PC_WHEAT", "A.WLD.PRICE.WHEAT"],
    },
    {
      id: "oecd-maize-price",
      commodity: "MAIZE",
      label: "Maize outlook price",
      unit: "USD/t",
      confidence: "MED",
      filterCandidates: ["A.WLD.PC_MAIZE", "A.WLD.PRICE.MAIZE"],
    },
    {
      id: "oecd-soy-price",
      commodity: "SOYBEANS",
      label: "Soybean outlook price",
      unit: "USD/t",
      confidence: "MED",
      filterCandidates: ["A.WLD.PC_SOYBEAN", "A.WLD.PRICE.SOYBEAN"],
    },
    {
      id: "oecd-rapeseed-production",
      commodity: "RAPESEED",
      label: "Rapeseed outlook production",
      unit: "million t",
      confidence: "LOW",
      filterCandidates: ["A.WLD.PROD_RAPESEED", "A.WLD.PROD.RAPESEED"],
    },
    {
      id: "oecd-sunflower-production",
      commodity: "SUNFLOWER",
      label: "Sunflower outlook production",
      unit: "million t",
      confidence: "LOW",
      filterCandidates: ["A.WLD.PROD_SUNFLOWER", "A.WLD.PROD.SUNFLOWER"],
    },
  ];
}

async function buildFromSdmx(ctx: GrainWidgetsProviderContext): Promise<{
  items: GrainWidgetOecdAgriculturalOutlookItem[];
  sourceUrls: string[];
  warnings: string[];
}> {
  const items: GrainWidgetOecdAgriculturalOutlookItem[] = [];
  const sourceUrls: string[] = [];
  const warnings: string[] = [];

  const base = OECD_AGRICULTURAL_OUTLOOK_SDMX_BASE_URL.replace(/\/+$/, "");
  const dataset = OECD_AGRICULTURAL_OUTLOOK_SDMX_DATASET.trim();
  if (!base || !dataset) return { items, sourceUrls, warnings: ["sdmx_config_missing"] };

  for (const target of oecdSdmxTargets()) {
    let resolved = false;
    for (const filter of target.filterCandidates) {
      const url = `${base}/${dataset}/${filter}?startPeriod=${encodeURIComponent(
        OECD_AGRICULTURAL_OUTLOOK_SDMX_START_PERIOD,
      )}&format=jsondata`;
      try {
        const response = await fetchTextResponseWithTimeout(url, OECD_AGRICULTURAL_OUTLOOK_TIMEOUT_MS, {
          accept: "application/json,text/plain,*/*",
        });
        sourceUrls.push(response.finalUrl || url);
        const payload = JSON.parse(response.text);
        const points = parseSdmxPoints(payload);
        const latest = pickLatestPoint(points);
        if (!latest) {
          warnings.push(`sdmx_empty:${target.id}:${filter}`);
          continue;
        }
        items.push({
          id: target.id,
          commodity: target.commodity,
          label: target.label,
          projectedValue: Number(latest.value.toFixed(4)),
          unit: target.unit,
          horizon: latest.year,
          cadence: "annual",
          confidence: target.confidence,
          notes: [`sdmx_filter:${filter}`],
        });
        resolved = true;
        break;
      } catch (error: any) {
        warnings.push(`sdmx_error:${target.id}:${filter}:${String(error?.message || "unknown")}`);
      }
    }
    if (!resolved) warnings.push(`sdmx_unresolved:${target.id}`);
  }

  return { items, sourceUrls, warnings };
}

async function buildFromHtml(ctx: GrainWidgetsProviderContext): Promise<{
  items: GrainWidgetOecdAgriculturalOutlookItem[];
  releaseDate?: string;
  warnings: string[];
}> {
  const cerealsPage = await fetchTextResponseWithTimeout(OECD_AGRICULTURAL_OUTLOOK_CEREALS_URL, OECD_AGRICULTURAL_OUTLOOK_TIMEOUT_MS, {
    accept: "text/html,application/xhtml+xml,*/*",
  });
  const oilseedsPage = await fetchTextResponseWithTimeout(OECD_AGRICULTURAL_OUTLOOK_OILSEEDS_URL, OECD_AGRICULTURAL_OUTLOOK_TIMEOUT_MS, {
    accept: "text/html,application/xhtml+xml,*/*",
  });
  const cerealsText = cheerio.load(cerealsPage.text).text().replace(/\s+/g, " ");
  const oilseedsText = cheerio.load(oilseedsPage.text).text().replace(/\s+/g, " ");
  const releaseDate = cerealsText.match(/\b\d{4}-\d{4}\b/)?.[0] || cerealsText.match(/2025-2034/)?.[0];
  const warnings: string[] = [];

  const items: GrainWidgetOecdAgriculturalOutlookItem[] = [];
  const wheat = extractMatch(cerealsText, [/wheat prices?[^.]*?reach(?:ing)?\s+USD\s*(\d+(?:\.\d+)?)\/?t[^.]*?by\s+(\d{4})/i, /wheat prices?[^.]*?to\s+USD\s*(\d+(?:\.\d+)?)\/?t[^.]*?(\d{4})/i]);
  if (wheat) items.push({ id: "oecd-wheat", commodity: "WHEAT", label: "Wheat projected price", projectedValue: wheat.value, unit: wheat.unit === "value" ? "USD/t" : wheat.unit, horizon: wheat.horizon, cadence: "annual", confidence: "MED", notes: ["OECD-FAO outlook projection"] });
  const maize = extractMatch(cerealsText, [/maize prices?[^.]*?reach(?:ing)?\s+USD\s*(\d+(?:\.\d+)?)\/?t[^.]*?by\s+(\d{4})/i, /maize prices?[^.]*?to\s+USD\s*(\d+(?:\.\d+)?)\/?t[^.]*?(\d{4})/i]);
  if (maize) items.push({ id: "oecd-maize", commodity: "MAIZE", label: "Maize projected price", projectedValue: maize.value, unit: maize.unit === "value" ? "USD/t" : maize.unit, horizon: maize.horizon, cadence: "annual", confidence: "MED", notes: ["OECD-FAO outlook projection"] });
  const soy = extractMatch(oilseedsText, [/soybean prices?[^.]*?reach(?:ing)?\s+USD\s*(\d+(?:\.\d+)?)\/?t[^.]*?by\s+(\d{4})/i, /soybean prices?[^.]*?to\s+USD\s*(\d+(?:\.\d+)?)\/?t[^.]*?(\d{4})/i]);
  if (soy) items.push({ id: "oecd-soybeans", commodity: "SOYBEANS", label: "Soybean projected price", projectedValue: soy.value, unit: soy.unit === "value" ? "USD/t" : soy.unit, horizon: soy.horizon, cadence: "annual", confidence: "MED", notes: ["OECD-FAO outlook projection"] });
  const rapeseed = extractMatch(oilseedsText, [/rapeseed[^.]*?production[^.]*?(\d+(?:\.\d+)?)\s*(Mt|million tonnes)[^.]*?by\s+(\d{4})/i]);
  if (rapeseed) items.push({ id: "oecd-rapeseed", commodity: "RAPESEED", label: "Rapeseed projected production", projectedValue: rapeseed.value, unit: rapeseed.unit, horizon: rapeseed.horizon, cadence: "annual", confidence: "LOW", notes: ["Structural outlook metric"] });
  const sunflower = extractMatch(oilseedsText, [/sunflower[^.]*?production[^.]*?(\d+(?:\.\d+)?)\s*(Mt|million tonnes)[^.]*?by\s+(\d{4})/i]);
  if (sunflower) items.push({ id: "oecd-sunflower", commodity: "SUNFLOWER", label: "Sunflower projected production", projectedValue: sunflower.value, unit: sunflower.unit, horizon: sunflower.horizon, cadence: "annual", confidence: "LOW", notes: ["Structural outlook metric"] });

  if (!items.find((item) => item.commodity === "WHEAT")) {
    const generic = extractGenericProjection(cerealsText, { keyword: /wheat/i, fallbackUnit: "USD/t", valueMin: 60, valueMax: 800 });
    if (generic) {
      items.push({
        id: "oecd-wheat-generic",
        commodity: "WHEAT",
        label: "Wheat projected reference",
        projectedValue: generic.value,
        unit: generic.unit,
        horizon: generic.horizon,
        cadence: "annual",
        confidence: "LOW",
        notes: ["Generic parse fallback from OECD outlook text"],
      });
    }
  }
  if (!items.find((item) => item.commodity === "MAIZE")) {
    const generic = extractGenericProjection(cerealsText, { keyword: /maize|corn/i, fallbackUnit: "USD/t", valueMin: 50, valueMax: 700 });
    if (generic) {
      items.push({
        id: "oecd-maize-generic",
        commodity: "MAIZE",
        label: "Maize projected reference",
        projectedValue: generic.value,
        unit: generic.unit,
        horizon: generic.horizon,
        cadence: "annual",
        confidence: "LOW",
        notes: ["Generic parse fallback from OECD outlook text"],
      });
    }
  }
  if (!items.find((item) => item.commodity === "SOYBEANS")) {
    const generic = extractGenericProjection(oilseedsText, { keyword: /soybean|soybeans|soy/i, fallbackUnit: "USD/t", valueMin: 100, valueMax: 1000 });
    if (generic) {
      items.push({
        id: "oecd-soybeans-generic",
        commodity: "SOYBEANS",
        label: "Soybean projected reference",
        projectedValue: generic.value,
        unit: generic.unit,
        horizon: generic.horizon,
        cadence: "annual",
        confidence: "LOW",
        notes: ["Generic parse fallback from OECD outlook text"],
      });
    }
  }
  if (!items.find((item) => item.commodity === "RAPESEED")) {
    const generic = extractGenericProjection(oilseedsText, { keyword: /rapeseed|canola/i, fallbackUnit: "Mt", valueMin: 5, valueMax: 400 });
    if (generic) {
      items.push({
        id: "oecd-rapeseed-generic",
        commodity: "RAPESEED",
        label: "Rapeseed projected reference",
        projectedValue: generic.value,
        unit: generic.unit,
        horizon: generic.horizon,
        cadence: "annual",
        confidence: "LOW",
        notes: ["Generic parse fallback from OECD outlook text"],
      });
    }
  }

  if (!items.length) warnings.push("html_parse_empty");
  return { items, releaseDate, warnings };
}

export class OecdAgriculturalOutlookProvider implements GrainWidgetsProvider {
  id = "oecd-agricultural-outlook";
  kind = "OECD_AGRICULTURAL_OUTLOOK" as const;
  enabled = ENABLE_OECD_AGRICULTURAL_OUTLOOK_WIDGET;
  private readonly fallback = new MockGrainWidgetsProvider({ kind: "OECD_AGRICULTURAL_OUTLOOK" as any });

  async getWidget(ctx: GrainWidgetsProviderContext): Promise<GrainWidgetOecdAgriculturalOutlook> {
    const now = Date.now();
    if (cacheEntry && now - cacheEntry.fetchedAt <= OECD_AGRICULTURAL_OUTLOOK_CACHE_TTL_MS) {
      return { ...cacheEntry.widget, updatedAt: ctx.now.toISOString(), notes: [...(cacheEntry.widget.notes || []), "cache_hit"] };
    }

    try {
      const warnings: string[] = [];
      const sdmx = await buildFromSdmx(ctx);
      warnings.push(...sdmx.warnings);
      let releaseDate: string | undefined;
      let items = sdmx.items;

      if (items.length < 3) {
        const html = await buildFromHtml(ctx);
        releaseDate = html.releaseDate;
        warnings.push(...html.warnings);
        if (html.items.length) {
          const byCommodity = new Map<string, GrainWidgetOecdAgriculturalOutlookItem>();
          for (const item of items) byCommodity.set(item.commodity, item);
          for (const item of html.items) {
            if (!byCommodity.has(item.commodity)) byCommodity.set(item.commodity, item);
          }
          items = Array.from(byCommodity.values());
        }
      }

      if (!items.length) throw new Error("oecd_outlook_items_empty");

      const sourceUrls = sdmx.sourceUrls.length
        ? sdmx.sourceUrls
        : [OECD_AGRICULTURAL_OUTLOOK_CEREALS_URL, OECD_AGRICULTURAL_OUTLOOK_OILSEEDS_URL];
      const status = items.length >= 4 ? "REFRESH" : items.length >= 2 ? "INDICATIVE" : "FALLBACK";
      const widget: GrainWidgetOecdAgriculturalOutlook = {
      id: "grain-oecd-agricultural-outlook",
      kind: "OECD_AGRICULTURAL_OUTLOOK",
      title: "OECD Agricultural Outlook",
      subtitle: "Forecast / structural regime layer",
      status,
      sourceName: "OECD-FAO Outlook",
      sourceAttribution: "Data: OECD-FAO Agricultural Outlook",
      sourceUrl: sourceUrls[0],
      updatedAt: ctx.now.toISOString(),
      timeframe: ctx.timeframe,
      territoryScope: "GLOBAL",
      territory: { code: "GLOBAL", label: "Global" },
      items,
      summary: {
        expectedCount: 5,
        mappedCount: items.length,
        coverage: `${items.length}/5`,
        cadence: "annual",
        releaseDate,
        horizon: items[0]?.horizon,
      },
      notes: [
        "Forecast/outlook widget; not a live market price source",
        sdmx.items.length ? "Primary mode: OECD SDMX dataset extraction" : "Fallback mode: OECD outlook text extraction",
      ],
      debug: {
        sourceUrlUsed: sourceUrls.join(" | "),
        rowsParsed: items.length,
        warnings: warnings.length
          ? warnings
          : items.some((item) => item.confidence === "LOW")
            ? ["some_projection_matches_low_confidence"]
            : undefined,
      },
      };
      cacheEntry = { fetchedAt: now, widget };
      return widget;
    } catch (error: any) {
      const fallbackItems = buildIndicativeItems();
      const widget: GrainWidgetOecdAgriculturalOutlook = {
        id: "grain-oecd-agricultural-outlook",
        kind: "OECD_AGRICULTURAL_OUTLOOK",
        title: "OECD Agricultural Outlook",
        subtitle: "Forecast / structural regime layer",
        status: "INDICATIVE",
        sourceName: "OECD-FAO Outlook",
        sourceAttribution: "Data: OECD-FAO Agricultural Outlook",
        sourceUrl: OECD_AGRICULTURAL_OUTLOOK_CEREALS_URL,
        updatedAt: ctx.now.toISOString(),
        timeframe: ctx.timeframe,
        territoryScope: "GLOBAL",
        territory: { code: "GLOBAL", label: "Global" },
        items: fallbackItems,
        summary: {
          expectedCount: 5,
          mappedCount: fallbackItems.length,
          coverage: `${fallbackItems.length}/5`,
          cadence: "annual",
          horizon: "2034",
        },
        notes: ["Indicative fallback layer when OECD upstream blocks requests"],
        debug: {
          sourceUrlUsed: `${OECD_AGRICULTURAL_OUTLOOK_CEREALS_URL} | ${OECD_AGRICULTURAL_OUTLOOK_OILSEEDS_URL}`,
          rowsParsed: fallbackItems.length,
          warnings: [`provider_error:${error?.message || "unknown"}`],
        },
      };
      return widget;
    }
  }

  mockFallback(reason: string, ctx: GrainWidgetsProviderContext) {
    return this.fallback.mockFallback(reason, ctx) as any;
  }
}
