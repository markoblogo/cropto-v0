import type { MonitorFeatureFlags, MonitorSource } from "./types";

function flag(name: keyof MonitorFeatureFlags, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null) return fallback;
  return raw === "1" || raw.toLowerCase() === "true";
}

export const MONITOR_FEATURE_FLAGS: MonitorFeatureFlags = {
  ENABLE_GEO_WIDGETS: flag("ENABLE_GEO_WIDGETS", false),
  ENABLE_AI_SUMMARIZATION: flag("ENABLE_AI_SUMMARIZATION", false),
  ENABLE_MACRO_WIDGETS: flag("ENABLE_MACRO_WIDGETS", true),
  ENABLE_CROPTO_INDICES: flag("ENABLE_CROPTO_INDICES", true),
  ENABLE_LOGISTICS_PANEL: flag("ENABLE_LOGISTICS_PANEL", true),
  ENABLE_WEATHER_PLACEHOLDER: flag("ENABLE_WEATHER_PLACEHOLDER", true),
  ENABLE_DEBUG_DASHBOARD: flag("ENABLE_DEBUG_DASHBOARD", true),
  ENABLE_LIVE_VISUALS: flag("ENABLE_LIVE_VISUALS", true),
  ENABLE_LOGISTICS_INDICATORS: flag("ENABLE_LOGISTICS_INDICATORS", true),
};

export const MONITOR_RELEVANCE_THRESHOLD = Number.parseInt(
  process.env.MONITOR_RELEVANCE_THRESHOLD || "3",
  10,
);
export const MONITOR_RELEVANCE_THRESHOLD_MIN = Number.parseInt(
  process.env.MONITOR_RELEVANCE_THRESHOLD_MIN || "2",
  10,
);
export const MONITOR_RELEVANCE_THRESHOLD_MAX = Number.parseInt(
  process.env.MONITOR_RELEVANCE_THRESHOLD_MAX || "8",
  10,
);

export const MONITOR_FETCH_TIMEOUT_MS = Number.parseInt(
  process.env.MONITOR_FETCH_TIMEOUT_MS || "7000",
  10,
);

export const MONITOR_CACHE_TTL_MS = Number.parseInt(
  process.env.MONITOR_CACHE_TTL_MS || String(10 * 60 * 1000),
  10,
);

export const LIVE_VISUALS_MAX_TILES = Number.parseInt(process.env.LIVE_VISUALS_MAX_TILES || "4", 10);
export const LIVE_VISUALS_ENABLE_AUTO_REFRESH =
  process.env.LIVE_VISUALS_ENABLE_AUTO_REFRESH == null
    ? true
    : process.env.LIVE_VISUALS_ENABLE_AUTO_REFRESH === "1" ||
      process.env.LIVE_VISUALS_ENABLE_AUTO_REFRESH.toLowerCase() === "true";
export const LIVE_VISUALS_DEFAULT_REFRESH_SEC = Number.parseInt(
  process.env.LIVE_VISUALS_DEFAULT_REFRESH_SEC || "60",
  10,
);

// Wave 1 sources (RSS/Atom first). Keep enabled flags tunable without code changes.
export const MONITOR_SOURCES: MonitorSource[] = [
  {
    id: "brownfield-main",
    name: "Brownfield Ag News",
    url: "https://brownfieldagnews.com/feed/",
    category: "agro-general",
    strategy: "rss",
    enabled: true,
  },
  {
    id: "farmersweekly-world",
    name: "Farmers Weekly - Markets",
    url: "https://www.fwi.co.uk/markets/feed",
    category: "agro-general",
    strategy: "rss",
    enabled: false,
  },
  {
    id: "agweb-markets",
    name: "AgWeb Markets",
    url: "https://www.agweb.com/rss.xml",
    category: "agro-general",
    strategy: "rss",
    enabled: true,
  },
  {
    id: "world-grain-news",
    name: "World Grain",
    url: "https://www.world-grain.com/rss/topic/2670-world-grain-news",
    category: "grain-oilseeds",
    strategy: "rss",
    enabled: true,
  },
  {
    id: "graincentral-news",
    name: "Grain Central",
    url: "https://www.graincentral.com/feed/",
    category: "grain-oilseeds",
    strategy: "rss",
    enabled: true,
  },
  {
    id: "farmdoc-daily",
    name: "farmdoc daily",
    url: "https://farmdocdaily.illinois.edu/feed",
    category: "grain-oilseeds",
    strategy: "rss",
    enabled: true,
  },
  {
    id: "agrimoney",
    name: "Agrimoney",
    url: "https://www.agrimoney.com/rss",
    category: "grain-oilseeds",
    strategy: "rss",
    enabled: true,
  },
  {
    id: "mundus-agri",
    name: "Mundus Agri",
    url: "https://mundus-agri.eu/feed/",
    category: "grain-oilseeds",
    strategy: "rss",
    enabled: true,
  },
  {
    id: "biofuels-news",
    name: "Biofuels News",
    url: "https://biofuels-news.com/rss",
    category: "grain-oilseeds",
    strategy: "rss",
    enabled: false,
  },
  {
    id: "sovecon",
    name: "SovEcon",
    url: "https://sovecon.com/en/feed/",
    category: "grain-oilseeds",
    strategy: "rss",
    enabled: true,
  },
  {
    id: "barchart-grains",
    name: "Barchart Grains News",
    url: "https://www.barchart.com/feeds/news/getFeed.php?feed=bcnews_grains",
    category: "grain-oilseeds",
    strategy: "rss",
    enabled: true,
  },
  {
    id: "reuters-commodities",
    name: "Reuters Commodities",
    url: "https://feeds.reuters.com/reuters/commoditiesNews",
    category: "grain-oilseeds",
    strategy: "rss",
    enabled: false,
  },
  {
    id: "splash247",
    name: "Splash247 Shipping",
    url: "https://splash247.com/feed/",
    category: "logistics-shipping",
    strategy: "rss",
    enabled: true,
  },
  {
    id: "lloydslist",
    name: "Lloyd's List",
    url: "https://lloydslist.com/feed",
    category: "logistics-shipping",
    strategy: "rss",
    enabled: false,
  },
  {
    id: "gcaptain",
    name: "gCaptain",
    url: "https://gcaptain.com/feed/",
    category: "logistics-shipping",
    strategy: "rss",
    enabled: true,
  },
  {
    id: "ein-shipping",
    name: "EIN Shipping & Logistics",
    url: "https://shipping.einnews.com/rss",
    category: "logistics-shipping",
    strategy: "rss",
    enabled: true,
  },
  {
    id: "oecd-agri",
    name: "OECD Agriculture",
    url: "https://www.oecd.org/agriculture/rss.xml",
    category: "policy-macro",
    strategy: "rss",
    enabled: true,
  },
  {
    id: "wto-news",
    name: "WTO News",
    url: "https://www.wto.org/english/news_e/news_e.xml",
    category: "policy-macro",
    strategy: "rss",
    enabled: true,
  },
  {
    id: "ec-agri",
    name: "EU Agriculture and Rural Development",
    url: "https://agriculture.ec.europa.eu/news/rss_en",
    category: "policy-macro",
    strategy: "rss",
    enabled: true,
  },
  {
    id: "fao-news",
    name: "FAO News",
    url: "https://www.fao.org/news/rss/en/",
    category: "policy-macro",
    strategy: "rss",
    enabled: true,
  },
];

// Lower values are stricter (effectively requiring slightly higher quality per source).
export const MONITOR_SOURCE_SCORE_BIAS: Record<string, number> = {
  "ein-shipping": -1,
  "ec-agri": +1,
  "wto-news": +1,
  "oecd-agri": +1,
};

// Source-level noise suppression (simple title/summary substring patterns).
export const MONITOR_SOURCE_NOISE_PATTERNS: Record<string, string[]> = {
  "ein-shipping": ["sponsored", "advertorial", "press release", "promo"],
  "agweb-markets": ["podcast", "episode", "listen now"],
  splash247: ["opinion", "commentary"],
  "world-grain-news": ["video", "webinar"],
  "farmdoc-daily": ["farmdoc daily article", "farmdoc webinar"],
};
