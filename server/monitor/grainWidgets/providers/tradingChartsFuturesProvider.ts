import {
  ENABLE_TRADINGCHARTS_FUTURES_WIDGETS,
  TRADINGCHARTS_CBOT_URL,
  TRADINGCHARTS_CBOT_URLS,
  TRADINGCHARTS_FETCH_TIMEOUT_MS,
  TRADINGCHARTS_USER_AGENT,
} from "../config";
import type { GrainWidgetCbotFuturesSnapshot, GrainWidgetTableRow } from "../types";
import type { GrainWidgetsProvider, GrainWidgetsProviderContext } from "./types";
import { MockGrainWidgetsProvider } from "./mockGrainWidgetsProvider";
import { deriveSeries, fetchTextWithTimeout, normalizeRowPrice, statusFromAvailability } from "./utils";

type MatchConfig = {
  id: string;
  label: string;
  sublabel: string;
  aliases: string[];
  crop: "corn" | "wheat" | "soybeans";
  commodityGroup: "Grains" | "Oilseeds";
};

const MATCHERS: MatchConfig[] = [
  { id: "fut-corn-nearby", label: "Corn", sublabel: "Nearby", aliases: ["corn", "zc"], crop: "corn", commodityGroup: "Grains" },
  { id: "fut-wheat-nearby", label: "Wheat", sublabel: "Nearby", aliases: ["wheat", "zw", "srw"], crop: "wheat", commodityGroup: "Grains" },
  { id: "fut-soy-nearby", label: "Soybeans", sublabel: "Nearby", aliases: ["soybeans", "soy", "zs"], crop: "soybeans", commodityGroup: "Oilseeds" },
];

function parseInstrumentBlock(raw: string, aliases: string[]): { last?: number; change?: number; pct?: number } {
  const lower = raw.toLowerCase();
  let foundIdx = -1;
  for (const alias of aliases) {
    const idx = lower.indexOf(alias);
    if (idx >= 0 && (foundIdx < 0 || idx < foundIdx)) foundIdx = idx;
  }
  if (foundIdx < 0) return {};
  const sample = raw.slice(Math.max(0, foundIdx - 120), Math.min(raw.length, foundIdx + 420));
  const pctMatch = sample.match(/([+-]?\d+(?:\.\d+)?)\s*%/);
  const numbers = [...sample.matchAll(/([+-]?\d+(?:\.\d+)?)/g)]
    .map((match) => Number.parseFloat(match[1]))
    .filter((num) => Number.isFinite(num))
    .filter((num) => Math.abs(num) < 100000);
  const candidates = numbers.filter((num) => num > 100 && num < 5000);
  const last = candidates[0] ?? numbers.find((num) => num > 1);
  const change = numbers.find((num) => num !== last && Math.abs(num) <= 50);
  const pct = pctMatch ? Number.parseFloat(pctMatch[1]) : undefined;
  return { last, change, pct };
}

export class TradingChartsFuturesProvider implements GrainWidgetsProvider {
  id = "tradingcharts-futures";
  kind = "CBOT_FUTURES_SNAPSHOT" as const;
  enabled = ENABLE_TRADINGCHARTS_FUTURES_WIDGETS;
  private readonly fallback = new MockGrainWidgetsProvider({ kind: "CBOT_FUTURES_SNAPSHOT" });

  private async fetchFirstAvailableHtml(): Promise<{ html: string; sourceUrl: string }> {
    let lastError = "unreachable";
    for (const url of TRADINGCHARTS_CBOT_URLS) {
      try {
        const html = await fetchTextWithTimeout(url, TRADINGCHARTS_FETCH_TIMEOUT_MS, {
          "user-agent": TRADINGCHARTS_USER_AGENT,
        });
        return { html, sourceUrl: url };
      } catch (error: any) {
        lastError = error?.message || "fetch_failed";
      }
    }
    throw new Error(`tradingcharts_all_urls_failed:${lastError}`);
  }

  async getWidget(ctx: GrainWidgetsProviderContext): Promise<GrainWidgetCbotFuturesSnapshot> {
    const { html, sourceUrl } = await this.fetchFirstAvailableHtml();
    const rows: GrainWidgetTableRow[] = MATCHERS.map((matcher) => {
      const parsed = parseInstrumentBlock(html, matcher.aliases);
      return normalizeRowPrice({
        row: {
          id: matcher.id,
          label: matcher.label,
          sublabel: matcher.sublabel,
          commodityGroup: matcher.commodityGroup,
          status: statusFromAvailability({ hasValue: parsed.last != null, fallback: true, delayed: true }),
          sourceName: "TradingCharts",
          sourceAttribution: "Data: TradingCharts (public)",
          updatedAt: ctx.now.toISOString(),
          price: {
            nativeValueCurrent: parsed.last,
            nativeValueChange: parsed.change,
            nativeValueChangePct: parsed.pct,
            nativeCurrency: "USD",
            nativeUnit: "c/bu",
            normalizationStatus: "UNAVAILABLE",
            series: parsed.last != null ? deriveSeries(parsed.last, parsed.change, ctx.seriesPoints) : [],
          },
        },
        eurUsd: ctx.eurUsd,
        crop: matcher.crop,
        nativeUnitType: "CENTS_PER_BUSHEL",
      });
    });

    const parsedCount = rows.filter((row) => row.price?.nativeValueCurrent != null).length;
    const expected = MATCHERS.length;
    const status = parsedCount >= expected ? "INDICATIVE" : parsedCount > 0 ? "INDICATIVE" : "OFFLINE";
    return {
      id: "grain-cbot-futures-snapshot",
      kind: "CBOT_FUTURES_SNAPSHOT",
      title: "Futures (CBOT)",
      subtitle: "Intraday snapshot",
      status,
      sourceName: "TradingCharts",
      sourceAttribution: "Data: TradingCharts (public)",
      sourceUrl,
      updatedAt: ctx.now.toISOString(),
      timeframe: ctx.timeframe,
      rows,
      summary: {
        contractsParsed: parsedCount,
        parseMode: "snapshot",
        notes: [`coverage ${parsedCount}/${expected}`],
      },
      fallbackReason: parsedCount ? "public_parse" : "parse_failed",
      notes: [
        ...(parsedCount < expected ? [`${parsedCount}/${expected} contracts parsed`] : []),
        ...(sourceUrl !== TRADINGCHARTS_CBOT_URL ? [`Fallback source URL used: ${sourceUrl}`] : []),
      ],
    };
  }

  mockFallback(reason: string, ctx: GrainWidgetsProviderContext): GrainWidgetCbotFuturesSnapshot {
    return this.fallback.mockFallback(reason, ctx) as GrainWidgetCbotFuturesSnapshot;
  }
}
