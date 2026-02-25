import type { Express } from "express";
import { latestFxSnapshot } from "../ingestion/storage/fxRepository";
import {
  MONITOR_FEATURE_FLAGS,
  MONITOR_RELEVANCE_THRESHOLD,
  MONITOR_RELEVANCE_THRESHOLD_MAX,
  MONITOR_RELEVANCE_THRESHOLD_MIN,
  MONITOR_SOURCES,
} from "./config";
import { CroptoUkraineIndexProvider } from "./indexProvider";
import { getLiveVisualTiles } from "./liveVisuals";
import { GrainMarketsService } from "./grainMarkets";
import { LogisticsIndicatorsService } from "./logisticsIndicators";
import { filterMonitorNews, getMonitorNews, topSignals } from "./newsService";

const indexProvider = new CroptoUkraineIndexProvider();
const logisticsIndicatorsService = new LogisticsIndicatorsService();
const grainMarketsService = new GrainMarketsService();

function topEntries(record: Record<string, number>, limit = 5) {
  return Object.entries(record)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([sourceId, count]) => ({ sourceId, count }));
}

export function registerMonitorRoutes(app: Express): void {
  logisticsIndicatorsService.start();
  grainMarketsService.start();

  function resolveThreshold(raw?: string): number {
    const parsed = Number.parseInt(raw || "", 10);
    if (!Number.isFinite(parsed)) return MONITOR_RELEVANCE_THRESHOLD;
    return Math.min(MONITOR_RELEVANCE_THRESHOLD_MAX, Math.max(MONITOR_RELEVANCE_THRESHOLD_MIN, parsed));
  }

  app.get("/api/monitor/config", (_req, res) => {
    res.json({
      flags: MONITOR_FEATURE_FLAGS,
      relevanceThreshold: {
        default: MONITOR_RELEVANCE_THRESHOLD,
        min: MONITOR_RELEVANCE_THRESHOLD_MIN,
        max: MONITOR_RELEVANCE_THRESHOLD_MAX,
      },
      sources: {
        total: MONITOR_SOURCES.length,
        enabled: MONITOR_SOURCES.filter((source) => source.enabled).length,
      },
    });
  });

  app.get("/api/monitor/news", async (req, res) => {
    try {
      const threshold = resolveThreshold(typeof req.query.threshold === "string" ? req.query.threshold : undefined);
      const { items, stats } = await getMonitorNews(req.query.refresh === "1", { threshold });
      const filtered = filterMonitorNews(items, {
        crop: typeof req.query.crop === "string" ? req.query.crop : undefined,
        topic: typeof req.query.topic === "string" ? req.query.topic : undefined,
        region: typeof req.query.region === "string" ? req.query.region : undefined,
        time: req.query.time === "24h" ? "24h" : "7d",
        search: typeof req.query.search === "string" ? req.query.search : undefined,
      });

      const top = topSignals(filtered, 10);
      const logistics = filtered
        .filter((item) => item.category === "logistics-shipping" || item.topic_tags.includes("logistics"))
        .slice(0, 8);
      const policy = filtered
        .filter((item) => item.category === "policy-macro" || item.topic_tags.includes("policy") || item.topic_tags.includes("trade"))
        .slice(0, 8);

      res.json({
        generatedAt: stats.generatedAt,
        filters: {
          crop: req.query.crop || "all",
          topic: req.query.topic || "all",
          region: req.query.region || "all",
          time: req.query.time === "24h" ? "24h" : "7d",
          threshold,
        },
        stats,
        topSignals: top,
        feed: filtered,
        sidePanels: {
          logistics,
          policy,
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Failed to load monitor news" });
    }
  });

  app.get("/api/monitor/indices", async (_req, res) => {
    if (!MONITOR_FEATURE_FLAGS.ENABLE_CROPTO_INDICES) {
      return res.json({ enabled: false, items: [], note: "Disabled by feature flag" });
    }

    try {
      const items = await indexProvider.listIndexes();
      return res.json({ enabled: true, items });
    } catch (error: any) {
      return res.status(500).json({ enabled: true, items: [], message: error?.message || "Failed to load indices" });
    }
  });

  app.get("/api/monitor/macro-fx", async (_req, res) => {
    if (!MONITOR_FEATURE_FLAGS.ENABLE_MACRO_WIDGETS) {
      return res.json({ enabled: false, mode: "coming_soon", message: "Macro widgets disabled" });
    }

    try {
      const fx = await latestFxSnapshot();
      const currencies = ["EUR", "UAH", "BRL", "ARS"];
      const rates = currencies
        .map((currency) => ({ currency, usdPerUnit: fx.usdPerUnit[currency] ?? null }))
        .filter((item) => item.usdPerUnit != null);

      if (rates.length === 0) {
        return res.json({
          enabled: true,
          mode: "coming_soon",
          message: "FX snapshot is not available yet",
          rates: [],
        });
      }

      return res.json({
        enabled: true,
        mode: "live",
        asOf: fx.asOf,
        source: "fx_rates",
        rates,
      });
    } catch {
      return res.json({
        enabled: true,
        mode: "coming_soon",
        message: "FX snapshot temporarily unavailable",
        rates: [],
      });
    }
  });

  app.get("/api/monitor/live-visuals", (_req, res) => {
    res.json(getLiveVisualTiles());
  });

  app.get("/api/monitor/logistics-indicators", async (_req, res) => {
    if (!MONITOR_FEATURE_FLAGS.ENABLE_LOGISTICS_INDICATORS) {
      return res.json({
        enabled: false,
        widgets: [],
        meta: { generatedAt: new Date().toISOString() },
        message: "Logistics indicators disabled",
      });
    }

    try {
      const payload = await logisticsIndicatorsService.list();
      return res.json({
        enabled: true,
        ...payload,
      });
    } catch (error: any) {
      return res.status(500).json({
        enabled: true,
        widgets: [],
        meta: { generatedAt: new Date().toISOString(), partialFailure: true },
        message: error?.message || "Failed to load logistics indicators",
      });
    }
  });

  app.get("/api/monitor/grain-markets", async (_req, res) => {
    if (!MONITOR_FEATURE_FLAGS.ENABLE_GRAIN_MARKETS_CORE) {
      return res.json({
        enabled: false,
        widgets: [],
        comparisons: [],
        meta: { generatedAt: new Date().toISOString() },
        message: "Grain markets core disabled",
      });
    }

    try {
      const payload = await grainMarketsService.list();
      return res.json({
        enabled: true,
        ...payload,
      });
    } catch (error: any) {
      return res.status(500).json({
        enabled: true,
        widgets: [],
        comparisons: [],
        meta: { generatedAt: new Date().toISOString(), partialFailure: true },
        message: error?.message || "Failed to load grain markets core",
      });
    }
  });

  app.get("/api/monitor/debug", async (_req, res) => {
    if (!MONITOR_FEATURE_FLAGS.ENABLE_DEBUG_DASHBOARD) {
      return res.status(404).json({ message: "Debug dashboard disabled" });
    }

    const { stats } = await getMonitorNews(false);
    const liveVisuals = getLiveVisualTiles();
    res.json({
      generatedAt: stats.generatedAt,
      sourcesTotal: stats.sourceCount,
      sourcesEnabled: stats.enabledSourceCount,
      itemsFetchedLast24h: stats.fetchedItems,
      itemsAfterFiltering: stats.acceptedItems,
      duplicatesRemoved: stats.duplicatesDropped,
      topSourcesByRelevantItems: topEntries(stats.sourceAcceptedCounts, 8),
      noisySources: topEntries(stats.sourceNoiseCounts, 8),
      sourceErrors: stats.sourceErrors,
      liveVisuals: liveVisuals.summary,
      logisticsIndicators: logisticsIndicatorsService.debugSummary(),
      grainMarkets: grainMarketsService.debugSummary(),
    });
  });
}
