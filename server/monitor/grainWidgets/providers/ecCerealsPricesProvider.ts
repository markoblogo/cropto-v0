import { ENABLE_EC_CEREALS_WIDGET, EC_AGRI_CACHE_TTL_MS } from "../config";
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

export class EcCerealsPricesProvider implements GrainWidgetsProvider {
  id = "ec-cereals-prices";
  kind = "EC_CEREALS_MULTI_COUNTRY" as const;
  enabled = ENABLE_EC_CEREALS_WIDGET;
  private readonly fallback = new MockGrainWidgetsProvider({ kind: "EC_CEREALS_MULTI_COUNTRY" as any });

  async getWidget(ctx: GrainWidgetsProviderContext): Promise<GrainWidgetEcOfficialPricesSnapshot> {
    const territory = resolveEcTerritory("cereal", ctx.country);
    const now = Date.now();
    if (cacheEntry && cacheEntry.territory === territory.code && now - cacheEntry.fetchedAt <= EC_AGRI_CACHE_TTL_MS) {
      return {
        ...cacheEntry.widget,
        updatedAt: ctx.now.toISOString(),
        notes: [...(cacheEntry.widget.notes || []), "cache_hit"],
      };
    }

    const result = await fetchEcPriceRows({
      mode: "cereal",
      countryCode: territory.code,
      productKeys: ["soft_wheat", "durum_wheat", "maize", "barley", "rye"],
      eurUsd: ctx.eurUsd,
      seriesPoints: ctx.seriesPoints,
    });
    if (!result.rows.length) throw new Error(`ec_cereals_rows_empty:${territory.code}`);

    const widget: GrainWidgetEcOfficialPricesSnapshot = {
      id: "grain-ec-cereals-multi-country",
      kind: "EC_CEREALS_MULTI_COUNTRY",
      title: "EC Cereals Prices",
      subtitle: "Official EU cereals market layer",
      status: result.rows.length >= 3 ? "REFRESH" : "INDICATIVE",
      sourceName: "EC Agri-food Data Portal",
      sourceAttribution: "Data: European Commission Agri-food Data Portal (Cereals)",
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
        persistKey: "monitor_country_EC_CEREALS_MULTI_COUNTRY",
      },
      rows: result.rows,
      summary: {
        expectedCount: 5,
        mappedCount: result.rows.length,
        coverage: `${result.rows.length}/5`,
        cadence: result.cadence,
        selectedTerritory: territory.code,
        stageLabel: result.stageLabel,
      },
      notes: ["Official EC cereals prices", "Partial coverage is preserved without fills"],
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
