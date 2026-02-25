import {
  APIFARMER_API_KEY,
  APIFARMER_API_URL,
  APIFARMER_SOURCE_URL,
  APIFARMER_TIMEOUT_MS,
  ENABLE_APIFARMER_WIDGETS,
} from "../config";
import type { GrainWidgetCropPriceIndex, GrainWidgetTableRow } from "../types";
import type { GrainWidgetsProvider, GrainWidgetsProviderContext } from "./types";
import { MockGrainWidgetsProvider } from "./mockGrainWidgetsProvider";
import { fetchTextWithTimeout, parseNumber, statusFromAvailability } from "./utils";

type ApiFarmerItem = {
  symbol?: string;
  name?: string;
  value?: number | string;
  price?: number | string;
  changePct?: number | string;
};

function flatten(input: any): any[] {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  if (Array.isArray(input.data)) return input.data;
  if (Array.isArray(input.items)) return input.items;
  if (Array.isArray(input.prices)) return input.prices;
  return [];
}

function findItem(items: ApiFarmerItem[], aliases: string[]): ApiFarmerItem | undefined {
  return items.find((item) => {
    const txt = `${item.symbol || ""} ${item.name || ""}`.toLowerCase();
    return aliases.some((alias) => txt.includes(alias));
  });
}

function toRow(label: string, value?: number, changePct?: number, status?: GrainWidgetCropPriceIndex["status"]): GrainWidgetTableRow {
  return {
    id: `index-${label.toLowerCase()}`,
    label,
    commodityGroup: label === "Wheat" ? "Grains" : "Oilseeds",
    status,
    price: {
      nativeValueCurrent: value,
      nativeValueChangePct: changePct,
      nativeCurrency: "USD",
      nativeUnit: "index",
      normalizationStatus: "UNAVAILABLE",
    },
  };
}

export class ApiFarmerProvider implements GrainWidgetsProvider {
  id = "apifarmer";
  kind = "CROP_PRICE_INDEX" as const;
  enabled = ENABLE_APIFARMER_WIDGETS;
  private readonly fallback = new MockGrainWidgetsProvider({ kind: "CROP_PRICE_INDEX" });

  async getWidget(ctx: GrainWidgetsProviderContext): Promise<GrainWidgetCropPriceIndex> {
    if (!APIFARMER_API_URL) throw new Error("apifarmer_api_url_missing");
    const headers: HeadersInit = {};
    if (APIFARMER_API_KEY) headers.authorization = `Bearer ${APIFARMER_API_KEY}`;
    const text = await fetchTextWithTimeout(APIFARMER_API_URL, APIFARMER_TIMEOUT_MS, headers);
    let payload: any;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error("apifarmer_parse_error");
    }
    const items = flatten(payload);

    const wheat = findItem(items, ["wheat"]);
    const soy = findItem(items, ["soy"]);
    const oilseeds = findItem(items, ["oilseed", "rapeseed", "canola"]);
    const wheatValue = parseNumber(wheat?.value ?? wheat?.price);
    const soyValue = parseNumber(soy?.value ?? soy?.price);
    const oilValue = parseNumber(oilseeds?.value ?? oilseeds?.price);
    const values = [wheatValue, soyValue, oilValue].filter((v): v is number => typeof v === "number");
    const indexValue = values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : undefined;
    const availableCount = values.length;
    const status = availableCount >= 3 ? "REFRESH" : availableCount > 0 ? "INDICATIVE" : statusFromAvailability({ hasValue: false });

    const avgPct = [parseNumber(wheat?.changePct), parseNumber(soy?.changePct), parseNumber(oilseeds?.changePct)]
      .filter((v): v is number => typeof v === "number");
    const mean = avgPct.length ? avgPct.reduce((sum, value) => sum + value, 0) / avgPct.length : 0;
    const trendLabel = mean > 0.4 ? "Rising" : mean < -0.4 ? "Cooling" : "Stable";

    const weatherSignal = Number.parseFloat(String(payload?.weatherTie ?? payload?.weatherRisk ?? ""));
    const weatherTieIn = Number.isFinite(weatherSignal)
      ? {
          available: true,
          label: "Weather-linked signal",
          score: Math.round(weatherSignal * 100),
          status,
        }
      : {
          available: false,
          label: "Weather-linked signal",
          notes: ["Weather tie-in not available in current provider response"],
        };

    return {
      id: "grain-crop-price-index",
      kind: "CROP_PRICE_INDEX",
      title: "Index (Composite)",
      subtitle: "Crop price composite",
      status,
      sourceName: "APIFarmer",
      sourceAttribution: "Data: APIFarmer",
      sourceUrl: APIFARMER_SOURCE_URL,
      updatedAt: ctx.now.toISOString(),
      timeframe: ctx.timeframe,
      cards: [
        {
          id: "crop-index-total",
          label: "Crop Price Index",
          value: indexValue,
          deltaPct: mean,
          status,
        },
        {
          id: "oilseeds-index",
          label: "Oilseeds",
          value: oilValue,
          deltaPct: parseNumber(oilseeds?.changePct),
          status,
        },
      ],
      rows: [
        toRow("Wheat", wheatValue, parseNumber(wheat?.changePct), status),
        toRow("Soy", soyValue, parseNumber(soy?.changePct), status),
        toRow("Oilseeds", oilValue, parseNumber(oilseeds?.changePct), status),
      ],
      weatherTieIn,
      notes: values.length < 2 ? ["Low source coverage for composite index"] : undefined,
      fallbackReason: values.length ? undefined : "coverage_empty",
    };
  }

  mockFallback(reason: string, ctx: GrainWidgetsProviderContext): GrainWidgetCropPriceIndex {
    return this.fallback.mockFallback(reason, ctx) as GrainWidgetCropPriceIndex;
  }
}
