import { load } from "cheerio";
import { fetchWithHeaders } from "./grainWidgets/providers/utils";

type PodcastRegion = "North America" | "South America" | "Europe" | "Global";

export type PodcastCatalogItem = {
  id: string;
  title: string;
  region: PodcastRegion;
  countries: string[];
  languages: string[];
  rssUrl: string;
  website: string;
  focus: string[];
};

export type PodcastEpisode = {
  id: string;
  title: string;
  publishedAt: string;
  audioUrl: string;
  url: string;
  durationSec: number | null;
  source: string;
  commodities: string[];
  regions: string[];
};

const PODCAST_FETCH_TIMEOUT_MS = Number.parseInt(process.env.MONITOR_PODCASTS_FETCH_TIMEOUT_MS || "7000", 10);
const PODCAST_CACHE_TTL_MS = Number.parseInt(process.env.MONITOR_PODCASTS_CACHE_TTL_MS || String(10 * 60 * 1000), 10);
const MAX_EPISODES_PER_SOURCE = Number.parseInt(process.env.MONITOR_PODCASTS_MAX_EPISODES_PER_SOURCE || "60", 10);

export const PODCAST_CATALOG: PodcastCatalogItem[] = [
  {
    id: "grain_farmers_of_ontario",
    title: "Grain Farmers of Ontario",
    region: "North America",
    countries: ["CA"],
    languages: ["en"],
    rssUrl: "https://grainfarmersofontario.podomatic.com/rss2.xml",
    website: "https://gfo.ca",
    focus: ["corn", "soybeans", "wheat", "barley", "canadian_markets"],
  },
  {
    id: "brownfield_ag_news_podcasts",
    title: "Brownfield Ag News – Podcasts & Programs",
    region: "North America",
    countries: ["US"],
    languages: ["en"],
    rssUrl: "https://www.brownfieldagnews.com/feed/podcast/",
    website: "https://www.brownfieldagnews.com",
    focus: ["us_ag", "corn", "soybeans", "wheat", "markets"],
  },
  {
    id: "grainswest_podcast",
    title: "The GrainsWest Podcast",
    region: "North America",
    countries: ["CA"],
    languages: ["en"],
    rssUrl: "https://grainswestpodcast.podbean.com/feed.xml",
    website: "https://grainswestpodcast.podbean.com",
    focus: ["western_canada", "barley", "wheat", "farm_business"],
  },
  {
    id: "what_the_futures",
    title: "What the Futures!",
    region: "North America",
    countries: ["CA"],
    languages: ["en"],
    rssUrl: "https://feeds.buzzsprout.com/2152799.rss",
    website: "https://www.whatthefuturespodcast.ca/",
    focus: ["western_canada", "markets", "hedging"],
  },
  {
    id: "ukragroconsult_podcasts",
    title: "UkrAgroConsult podcasts",
    region: "Europe",
    countries: ["UA"],
    languages: ["uk", "en"],
    rssUrl: "https://ukragroconsult.com/podcasts/feed",
    website: "https://ukragroconsult.com/podcasts/",
    focus: ["ukraine", "black_sea", "grains", "oilseeds", "exports", "markets"],
  },
  {
    id: "kws_ukraine_podcast",
    title: "KWS PODCAST – КВС-УКРАЇНА представляє!",
    region: "Europe",
    countries: ["UA"],
    languages: ["uk"],
    rssUrl: "https://www.kws.com/ua/uk/kws-podcast/rss.xml",
    website: "https://www.kws.com/ua/uk/kws-podcast/",
    focus: ["ukraine", "seed", "wheat", "barley", "corn", "oilseeds", "production"],
  },
];

const episodeCache = new Map<string, { tsMs: number; episodes: PodcastEpisode[] }>();

function cleanText(value: string | null | undefined): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeDurationSec(raw: string): number | null {
  const value = cleanText(raw);
  if (!value) return null;
  if (/^\d+$/.test(value)) {
    const sec = Number.parseInt(value, 10);
    return Number.isFinite(sec) ? sec : null;
  }
  const parts = value.split(":").map((part) => Number.parseInt(part, 10));
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function toIsoDate(raw: string): string {
  const value = cleanText(raw);
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return new Date(0).toISOString();
  return new Date(ms).toISOString();
}

function inferCommodities(source: PodcastCatalogItem, text: string): string[] {
  const lower = `${text} ${source.focus.join(" ")}`.toLowerCase();
  const byKeyword: Array<[string, string[]]> = [
    ["wheat", ["wheat", "feed wheat", "milling wheat"]],
    ["corn", ["corn", "maize"]],
    ["soybeans", ["soybean", "soybeans", "soy", "meal", "oilseed"]],
    ["barley", ["barley"]],
    ["rapeseed", ["rapeseed", "canola"]],
    ["sunflower", ["sunflower"]],
    ["rice", ["rice"]],
  ];
  return byKeyword.filter(([, keys]) => keys.some((key) => lower.includes(key))).map(([label]) => label);
}

function inferRegions(source: PodcastCatalogItem, text: string): string[] {
  const lower = text.toLowerCase();
  const regions = new Set<string>(source.countries);
  if (lower.includes("black sea")) regions.add("BLACK_SEA");
  if (lower.includes("eu") || lower.includes("europe")) regions.add("EU");
  if (lower.includes("usa") || lower.includes("u.s.")) regions.add("US");
  if (lower.includes("canada")) regions.add("CA");
  if (lower.includes("ukraine")) regions.add("UA");
  if (lower.includes("brazil")) regions.add("BR");
  if (lower.includes("argentina")) regions.add("AR");
  return Array.from(regions);
}

function parseRssEpisodes(xml: string, source: PodcastCatalogItem): PodcastEpisode[] {
  const root = load(xml, { xmlMode: true });
  const rows: PodcastEpisode[] = [];
  root("item").each((idx, node) => {
    const item = root(node);
    const title = cleanText(item.find("title").first().text());
    const link = cleanText(item.find("link").first().text()) || source.website;
    const guid = cleanText(item.find("guid").first().text());
    const pubDate = cleanText(item.find("pubDate").first().text()) || cleanText(item.find("published").first().text());
    const description = cleanText(item.find("description").first().text());
    const enclosureUrl = item.find("enclosure").first().attr("url") || item.find("media\\:content").first().attr("url");
    const audioUrl = cleanText(enclosureUrl);
    if (!audioUrl) return;
    const durationRaw =
      item.find("itunes\\:duration").first().text() ||
      item.find("duration").first().text() ||
      item.find("media\\:content").first().attr("duration");
    const baseText = [title, description].join(" ");
    rows.push({
      id: cleanText(guid) || `${source.id}:${toIsoDate(pubDate)}:${idx}`,
      title: title || `Episode ${idx + 1}`,
      publishedAt: toIsoDate(pubDate || new Date().toUTCString()),
      audioUrl,
      url: link || source.website,
      durationSec: normalizeDurationSec(cleanText(durationRaw)),
      source: source.title,
      commodities: inferCommodities(source, baseText),
      regions: inferRegions(source, baseText),
    });
  });
  return rows
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, Math.max(5, MAX_EPISODES_PER_SOURCE));
}

async function fetchEpisodesForSource(source: PodcastCatalogItem): Promise<PodcastEpisode[]> {
  const cached = episodeCache.get(source.id);
  const now = Date.now();
  if (cached && now - cached.tsMs < PODCAST_CACHE_TTL_MS) return cached.episodes;

  const response = await fetchWithHeaders(source.rssUrl, {
    timeoutMs: PODCAST_FETCH_TIMEOUT_MS,
    retryOnStatuses: [429, 500, 502, 503, 504],
    headers: {
      accept: "application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
      "user-agent": "CroptoMonitor/podcasts-service",
    },
  });
  const xml = await response.text();
  const episodes = parseRssEpisodes(xml, source);
  episodeCache.set(source.id, { tsMs: now, episodes });
  return episodes;
}

export function listPodcastCatalog(filters?: { region?: string; country?: string }) {
  const region = cleanText(filters?.region).toLowerCase();
  const country = cleanText(filters?.country).toUpperCase();
  return PODCAST_CATALOG.filter((item) => {
    if (region && region !== "all" && item.region.toLowerCase() !== region) return false;
    if (country && country !== "ALL" && !item.countries.includes(country)) return false;
    return true;
  }).map((item) => ({
    id: item.id,
    title: item.title,
    region: item.region,
    countries: item.countries,
    languages: item.languages,
    website: item.website,
    focus: item.focus,
  }));
}

export async function listPodcastEpisodes(
  podcastId: string,
  opts?: { limit?: number; offset?: number },
): Promise<{ podcast: ReturnType<typeof listPodcastCatalog>[number]; episodes: PodcastEpisode[] }> {
  const source = PODCAST_CATALOG.find((item) => item.id === podcastId);
  if (!source) {
    throw new Error(`podcast_not_found:${podcastId}`);
  }
  const catalogRow = listPodcastCatalog({}).find((item) => item.id === podcastId)!;
  const episodes = await fetchEpisodesForSource(source);
  const offset = Math.max(0, Number(opts?.offset || 0));
  const limit = Math.max(1, Math.min(100, Number(opts?.limit || 20)));
  return {
    podcast: catalogRow,
    episodes: episodes.slice(offset, offset + limit),
  };
}
