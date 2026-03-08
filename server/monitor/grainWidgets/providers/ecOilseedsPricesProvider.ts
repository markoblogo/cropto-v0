import { ENABLE_EC_OILSEEDS_WIDGET, EC_AGRI_CACHE_TTL_MS } from "../config";
import type { GrainWidgetEcOfficialPricesSnapshot } from "../types";
import type { GrainWidgetsProvider, GrainWidgetsProviderContext } from "./types";
import { MockGrainWidgetsProvider } from "./mockGrainWidgetsProvider";
import { fetchEcPriceRows, resolveEcTerritory } from "./ecAgriOfficialUtils";

type CacheEntry = {
  fetchedAt: number;
  territory: string;
  widget: GrainWidgetEcOfficialPricesSnapshot;
};

let cacheEntry: CacheEntry | null = null;

export class EcOilseedsPricesProvider implements GrainWidgetsProvider {
  id = "ec-oilseeds-prices";
  kind = "EC_OILSEEDS_MULTI_COUNTRY" as const;
  enabled = ENABLE_EC_OILSEEDS_WIDGET;
  private readonly fallback = new MockGrainWidgetsProvider({ kind: "EC_OILSEEDS_MULTI_COUNTRY" as any });

  async getWidget(ctx: GrainWidgetsProviderContext): Promise<GrainWidgetEcOfficialPricesSnapshot> {
    const territory = resolveEcTerritory("oilseeds", ctx.country);
    const now = Date.now();
    if (cacheEntry && cacheEntry.territory === territory.code && now - cacheEntry.fetchedAt <= EC_AGRI_CACHE_TTL_MS) {
      return {
        ...cacheEntry.widget,
        updatedAt: ctx.now.toISOString(),
        notes: [...(cacheEntry.widget.notes || []), "cache_hit"],
      };
    }

    const result = await fetchEcPriceRows({
      mode: "oilseeds",
      countryCode: territory.code,
      productKeys: ["rapeseed", "sunflower", "soybeans"],
      eurUsd: ctx.eurUsd,
      seriesPoints: ctx.seriesPoints,
    });
    if (!result.rows.length) throw new Error(`ec_oilseeds_rows_empty:${territory.code}`);

    const widget: GrainWidgetEcOfficialPricesSnapshot = {
      id: "grain-ec-oilseeds-multi-country",
      kind: "EC_OILSEEDS_MULTI_COUNTRY",
      title: "EC Oilseeds Prices",
      subtitle: "Official EU oilseeds market layer",
      status: result.rows.length >= 2 ? "REFRESH" : "INDICATIVE",
      sourceName: "EC Agri-food Data Portal",
      sourceAttribution: "Data: European Commission Agri-food Data Portal (Oilseeds)",
      sourceUrl: result.sourceUrlUsed,
      updatedAt: ctx.now.toISOString(),
      timeframe: ctx.timeframe,
      territoryScope: "COUNTRY_MULTI",
      territory: { code: territory.code, label: territory.label },
      supportedTerritories: territory.supported,
      territorySelector: {
        paramName: "country",
        default: territory.supported[0]?.code || "FR",
        current: territory.code,
        persistKey: "monitor_country_EC_OILSEEDS_MULTI_COUNTRY",
      },
      rows: result.rows,
      summary: {
        expectedCount: 3,
        mappedCount: result.rows.length,
        coverage: `${result.rows.length}/3`,
        cadence: result.cadence,
        selectedTerritory: territory.code,
        stageLabel: result.stageLabel,
      },
      notes: ["Official EC oilseeds prices", "No proxy substitution for missing crops"],
      debug: {
        sourceUrlUsed: result.sourceUrlUsed,
        query: result.sourceUrlUsed.includes("?") ? result.sourceUrlUsed.split("?")[1] : "",
        productCodes: result.productCodes,
        stageCodes: result.stageCodes,
        marketCodes: result.marketCodes,
        rowsParsed: result.rowsParsed,
        warnings: result.warnings.length ? result.warnings : undefined,
      },
    };

    cacheEntry = { fetchedAt: now, territory: territory.code, widget };
    return widget;
  }

  mockFallback(reason: string, ctx: GrainWidgetsProviderContext) {
    return this.fallback.mockFallback(reason, ctx) as any;
  }
}
