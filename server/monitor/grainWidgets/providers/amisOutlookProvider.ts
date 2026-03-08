import * as cheerio from "cheerio";
import {
  AMIS_CACHE_TTL_MS,
  AMIS_MARKET_MONITOR_CURRENT_PDF_URL,
  AMIS_MARKET_MONITOR_URL,
  AMIS_TIMEOUT_MS,
  ENABLE_AMIS_GLOBAL_BALANCE_WIDGET,
} from "../config";
import type { GrainWidgetAmisGlobalBalance, GrainWidgetAmisBalanceItem } from "../types";
import type { GrainWidgetsProvider, GrainWidgetsProviderContext } from "./types";
import { MockGrainWidgetsProvider } from "./mockGrainWidgetsProvider";
import { fetchTextResponseWithTimeout } from "./utils";

type CacheEntry = { fetchedAt: number; widget: GrainWidgetAmisGlobalBalance };
let cacheEntry: CacheEntry | null = null;

const crops = [
  { crop: "WHEAT" as const, label: "Wheat" },
  { crop: "MAIZE" as const, label: "Maize" },
  { crop: "RICE" as const, label: "Rice" },
  { crop: "SOYBEANS" as const, label: "Soybeans" },
];

function resolveLink(href?: string | null): string | undefined {
  if (!href) return undefined;
  if (/^https?:\/\//i.test(href)) return href;
  return new URL(href, AMIS_MARKET_MONITOR_URL).toString();
}

export class AmisOutlookProvider implements GrainWidgetsProvider {
  id = "amis-outlook";
  kind = "AMIS_GLOBAL_BALANCE" as const;
  enabled = ENABLE_AMIS_GLOBAL_BALANCE_WIDGET;
  private readonly fallback = new MockGrainWidgetsProvider({ kind: "AMIS_GLOBAL_BALANCE" as any });

  async getWidget(ctx: GrainWidgetsProviderContext): Promise<GrainWidgetAmisGlobalBalance> {
    const now = Date.now();
    if (cacheEntry && now - cacheEntry.fetchedAt <= AMIS_CACHE_TTL_MS) {
      return { ...cacheEntry.widget, updatedAt: ctx.now.toISOString(), notes: [...(cacheEntry.widget.notes || []), "cache_hit"] };
    }

    const response = await fetchTextResponseWithTimeout(AMIS_MARKET_MONITOR_URL, AMIS_TIMEOUT_MS, {
      accept: "text/html,application/xhtml+xml,*/*",
    });
    const $ = cheerio.load(response.text);
    const text = $.text().replace(/\s+/g, " ");
    const pdfHref = $("a[href$='.pdf']").first().attr("href") || AMIS_MARKET_MONITOR_CURRENT_PDF_URL;
    const issueHref = $("a").filter((_, el) => /electronic edition/i.test($(el).text())).first().attr("href") || pdfHref;
    const releaseDate = text.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i)?.[0];
    const items: GrainWidgetAmisBalanceItem[] = crops.map((entry) => ({
      id: `amis-${entry.crop.toLowerCase()}`,
      crop: entry.crop,
      label: `${entry.label} balance outlook`,
      statusLabel: "Latest AMIS monitor available",
      releaseDate,
      cadence: "release-based",
      notes: ["Metadata/release-based source", "No fragile PDF table parsing in this pass"],
      sourceUrl: resolveLink(issueHref) || resolveLink(pdfHref),
    }));

    const widget: GrainWidgetAmisGlobalBalance = {
      id: "grain-amis-global-balance",
      kind: "AMIS_GLOBAL_BALANCE",
      title: "AMIS Global Balance",
      subtitle: "Global outlook / monitor releases",
      status: resolveLink(pdfHref) ? "REFRESH" : "INDICATIVE",
      sourceName: "AMIS",
      sourceAttribution: "Data: AMIS Market Monitor",
      sourceUrl: resolveLink(issueHref) || resolveLink(pdfHref) || AMIS_MARKET_MONITOR_URL,
      updatedAt: ctx.now.toISOString(),
      timeframe: ctx.timeframe,
      territoryScope: "GLOBAL",
      territory: { code: "GLOBAL", label: "Global" },
      items,
      summary: {
        issueLabel: releaseDate ? `Issue ${releaseDate}` : "Latest issue",
        releaseDate,
        expectedCount: 4,
        mappedCount: items.length,
        coverage: `${items.length}/4`,
        cadence: "release-based",
      },
      notes: ["Release widget: latest AMIS monitor / outlook context", "No PDF content parsing"],
      debug: {
        sourceUrlUsed: response.finalUrl || AMIS_MARKET_MONITOR_URL,
        pdfUrl: resolveLink(pdfHref),
        rowsParsed: items.length,
      },
    };
    cacheEntry = { fetchedAt: now, widget };
    return widget;
  }

  mockFallback(reason: string, ctx: GrainWidgetsProviderContext) {
    return this.fallback.mockFallback(reason, ctx) as any;
  }
}
