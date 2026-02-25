import {
  COMMODITIC_API_KEY,
  COMMODITIC_LIVESTOCK_API_URL,
  COMMODITIC_LIVESTOCK_SOURCE_URL,
  ENABLE_LIVESTOCK_FEED_WIDGETS,
  GRAIN_WIDGETS_FETCH_TIMEOUT_MS,
} from "../config";
import { buildLivestockTieInWidget, type LivestockFeedRawRow } from "../builders/livestockTieInBuilder";
import type { GrainWidgetLivestockFeedTieIn } from "../types";
import type { GrainWidgetsProvider, GrainWidgetsProviderContext } from "./types";
import { MockGrainWidgetsProvider } from "./mockGrainWidgetsProvider";
import { fetchTextWithTimeout, normalizeDate, parseNumber } from "./utils";

type SourceRow = {
  symbol?: string;
  instrument?: string;
  name?: string;
  last?: number | string;
  price?: number | string;
  change?: number | string;
  changePct?: number | string;
  currency?: string;
  unit?: string;
  updatedAt?: string | number;
};

function flatten(input: any): any[] {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  if (Array.isArray(input.results)) return input.results;
  if (Array.isArray(input.data)) return input.data;
  if (Array.isArray(input.prices)) return input.prices;
  if (Array.isArray(input.items)) return input.items;
  return [];
}

function rowText(row: SourceRow): string {
  return `${row.symbol || ""} ${row.instrument || ""} ${row.name || ""}`.toLowerCase();
}

function inferUnitType(currency?: string, unit?: string): "USD_PER_TON" | "EUR_PER_TON" | "UNKNOWN" {
  const c = String(currency || "").toUpperCase();
  const u = String(unit || "").toLowerCase();
  if (c === "USD" && (u.includes("/t") || u.includes("usd/t") || u.includes("usd per ton"))) return "USD_PER_TON";
  if (c === "EUR" && (u.includes("/t") || u.includes("eur/t") || u.includes("eur per ton"))) return "EUR_PER_TON";
  return "UNKNOWN";
}

export class CommoditicLivestockProvider implements GrainWidgetsProvider {
  id = "commoditic-livestock";
  kind = "LIVESTOCK_FEED_TIEIN" as const;
  enabled = ENABLE_LIVESTOCK_FEED_WIDGETS;
  private readonly fallback = new MockGrainWidgetsProvider({ kind: "LIVESTOCK_FEED_TIEIN" });

  async getWidget(ctx: GrainWidgetsProviderContext): Promise<GrainWidgetLivestockFeedTieIn> {
    if (!COMMODITIC_LIVESTOCK_API_URL) throw new Error("commoditic_livestock_api_url_missing");
    const headers: HeadersInit = {};
    if (COMMODITIC_API_KEY) headers.authorization = `Bearer ${COMMODITIC_API_KEY}`;
    const text = await fetchTextWithTimeout(COMMODITIC_LIVESTOCK_API_URL, GRAIN_WIDGETS_FETCH_TIMEOUT_MS, headers);
    const payload = JSON.parse(text) as any;
    const rows = flatten(payload);

    const findByAliases = (aliases: string[]) =>
      rows.find((row: SourceRow) => aliases.some((alias) => rowText(row).includes(alias)));

    const soyMeal = findByAliases(["soy meal", "soybean meal", "meal"]);
    const cornFeed = findByAliases(["corn feed", "feed corn", "corn"]);
    const feedWheatProxy = findByAliases(["feed wheat", "wheat feed", "wheat"]);

    const rawRows: LivestockFeedRawRow[] = [
      {
        id: "livestock-soy-meal",
        label: "Soy Meal",
        sublabel: "Feed ingredient benchmark",
        region: "Global",
        valueCurrent: parseNumber(soyMeal?.last ?? soyMeal?.price),
        valueChange: parseNumber(soyMeal?.change),
        valueChangePct: parseNumber(soyMeal?.changePct),
        currency: String(soyMeal?.currency || "USD"),
        unit: String(soyMeal?.unit || "USD/t"),
        nativeUnitType: inferUnitType(soyMeal?.currency, soyMeal?.unit),
        sourceName: "Commoditic",
        sourceAttribution: "Data: Commoditic",
        updatedAt: normalizeDate(soyMeal?.updatedAt) || ctx.now.toISOString(),
        status: parseNumber(soyMeal?.last ?? soyMeal?.price) != null ? "REFRESH" : "OFFLINE",
        metricSemanticKind: "price",
        tags: ["oilseeds", "meal", "feed"],
      },
      {
        id: "livestock-corn-feed",
        label: cornFeed ? "Corn Feed" : "Feed Proxy",
        sublabel: cornFeed ? "Feed-side benchmark" : "Closest available feed metric",
        region: "Global",
        valueCurrent: parseNumber(cornFeed?.last ?? cornFeed?.price),
        valueChange: parseNumber(cornFeed?.change),
        valueChangePct: parseNumber(cornFeed?.changePct),
        currency: String(cornFeed?.currency || "USD"),
        unit: String(cornFeed?.unit || "USD/t"),
        nativeUnitType: inferUnitType(cornFeed?.currency, cornFeed?.unit),
        sourceName: "Commoditic",
        sourceAttribution: "Data: Commoditic",
        updatedAt: normalizeDate(cornFeed?.updatedAt) || ctx.now.toISOString(),
        status: parseNumber(cornFeed?.last ?? cornFeed?.price) != null ? "REFRESH" : "OFFLINE",
        metricSemanticKind: "price",
        tags: ["corn", "feed"],
        notes: cornFeed ? undefined : ["Closest available feed proxy used"],
      },
      {
        id: "livestock-feed-wheat-proxy",
        label: "Feed Wheat (Proxy)",
        sublabel: "Feed grain proxy",
        region: "Europe",
        valueCurrent: parseNumber(feedWheatProxy?.last ?? feedWheatProxy?.price),
        valueChange: parseNumber(feedWheatProxy?.change),
        valueChangePct: parseNumber(feedWheatProxy?.changePct),
        currency: String(feedWheatProxy?.currency || "USD"),
        unit: String(feedWheatProxy?.unit || "USD/t"),
        nativeUnitType: inferUnitType(feedWheatProxy?.currency, feedWheatProxy?.unit),
        sourceName: "Commoditic",
        sourceAttribution: "Data: Commoditic",
        updatedAt: normalizeDate(feedWheatProxy?.updatedAt) || ctx.now.toISOString(),
        status: parseNumber(feedWheatProxy?.last ?? feedWheatProxy?.price) != null ? "REFRESH" : "OFFLINE",
        metricSemanticKind: "price",
        tags: ["wheat", "feed", "proxy"],
      },
    ];

    const available = rawRows.filter((row) => typeof row.valueCurrent === "number").length;
    return buildLivestockTieInWidget({
      sourceName: "Commoditic",
      sourceAttribution: "Data: Commoditic",
      sourceUrl: COMMODITIC_LIVESTOCK_SOURCE_URL,
      updatedAt: ctx.now.toISOString(),
      status: available ? (available >= 2 ? "REFRESH" : "INDICATIVE") : "OFFLINE",
      rows: rawRows,
      fx: { eurUsd: ctx.eurUsd },
      buildDerivedCue: true,
      notes: available < 2 ? [`${available}/2 core rows available`] : undefined,
      derivedFrom: [{ source: "grainMarkets", key: "CBOT_SOYBEANS", label: "CBOT Soybeans" }],
    });
  }

  mockFallback(reason: string, ctx: GrainWidgetsProviderContext): GrainWidgetLivestockFeedTieIn {
    return this.fallback.mockFallback(reason, ctx) as GrainWidgetLivestockFeedTieIn;
  }
}
