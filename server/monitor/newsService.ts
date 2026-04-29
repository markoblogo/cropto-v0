import { createHash } from "crypto";
import {
  MONITOR_CACHE_TTL_MS,
  MONITOR_FETCH_TIMEOUT_MS,
  MONITOR_RELEVANCE_THRESHOLD,
  MONITOR_SOURCE_NOISE_PATTERNS,
  MONITOR_SOURCE_SCORE_BIAS,
  MONITOR_SOURCES,
} from "./config";
import { scoreNews } from "./scoring";
import type { MonitorIngestStats, MonitorNewsItem, MonitorSource } from "./types";

type ParsedFeedItem = {
  title: string;
  link: string;
  summary?: string;
  publishedAt?: string;
};

type NewsCache = {
  generatedAt: number;
  items: MonitorNewsItem[];
  stats: MonitorIngestStats;
};

let cache: NewsCache | null = null;

function stripHtml(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeXml(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function extractTagValue(block: string, tag: string): string | null {
  const fullTagRegex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const fullTag = block.match(fullTagRegex);
  if (fullTag?.[1]) return decodeXml(stripHtml(fullTag[1]));

  const atomLinkRegex = /<link[^>]+href=["']([^"']+)["'][^>]*>/i;
  if (tag === "link") {
    const atomLink = block.match(atomLinkRegex);
    if (atomLink?.[1]) return decodeXml(atomLink[1]);
  }

  return null;
}

function parseFeedXml(xml: string): ParsedFeedItem[] {
  const items: ParsedFeedItem[] = [];
  const candidates = [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)];

  for (const match of candidates) {
    const block = match[0];
    const title = extractTagValue(block, "title") || "";
    const link = extractTagValue(block, "link") || "";
    const summary =
      extractTagValue(block, "description") ||
      extractTagValue(block, "summary") ||
      extractTagValue(block, "content") ||
      undefined;
    const publishedAt =
      extractTagValue(block, "pubDate") ||
      extractTagValue(block, "published") ||
      extractTagValue(block, "updated") ||
      undefined;

    if (!title || !link) continue;
    items.push({ title, link, summary, publishedAt });
  }

  return items;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesNoisePattern(sourceId: string, text: string): boolean {
  const patterns = MONITOR_SOURCE_NOISE_PATTERNS[sourceId];
  if (!patterns?.length) return false;
  const normalized = text.toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern.toLowerCase()));
}

function toTokenSet(text: string): Set<string> {
  return new Set(
    normalizeTitle(text)
      .split(" ")
      .map((w) => w.trim())
      .filter((w) => w.length > 2),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function isWithinWindow(item: ParsedFeedItem, sinceMs: number): boolean {
  if (!item.publishedAt) return true;
  const ts = Date.parse(item.publishedAt);
  if (!Number.isFinite(ts)) return true;
  return ts >= sinceMs;
}

async function fetchFeed(source: MonitorSource): Promise<ParsedFeedItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MONITOR_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(source.url, {
      signal: controller.signal,
      headers: {
        "user-agent": "CroptoMonitor/1.1 (+https://cr0pto.com)",
        accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const xml = await response.text();
    return parseFeedXml(xml);
  } finally {
    clearTimeout(timeout);
  }
}

function toNewsItem(source: MonitorSource, item: ParsedFeedItem): MonitorNewsItem {
  const scoring = scoreNews({ title: item.title, summary: item.summary });
  const sourceBias = MONITOR_SOURCE_SCORE_BIAS[source.id] || 0;
  const published = item.publishedAt && Number.isFinite(Date.parse(item.publishedAt))
    ? new Date(item.publishedAt).toISOString()
    : new Date().toISOString();

  const normalizedTitle = normalizeTitle(item.title);
  const id = createHash("sha1").update(`${source.id}|${normalizedTitle}|${item.link}`).digest("hex").slice(0, 20);
  const topicTags = new Set(scoring.topicTags);
  if (source.category === "policy-macro") topicTags.add("policy");
  if (source.category === "logistics-shipping") topicTags.add("logistics");
  if (source.category === "grain-oilseeds" || source.category === "agro-general") topicTags.add("markets");

  return {
    id,
    title: item.title,
    summary: item.summary,
    url: item.link,
    source_name: source.name,
    source_type: source.strategy === "rss" || source.strategy === "atom" ? "rss" : "html",
    published_at: published,
    lang: "en",
    topic_tags: [...topicTags],
    crop_tags: scoring.cropTags,
    region_tags: scoring.regionTags,
    relevance_score: scoring.relevanceScore + sourceBias,
    raw_keywords_matched: scoring.matchedKeywords,
    category: source.category,
  };
}

function deduplicate(items: MonitorNewsItem[]): { items: MonitorNewsItem[]; duplicatesDropped: number } {
  const exactSeen = new Set<string>();
  const accepted: MonitorNewsItem[] = [];
  let duplicatesDropped = 0;

  for (const item of items) {
    const normalized = normalizeTitle(item.title);
    const exactKey = `${item.source_name}|${normalized}`;
    if (exactSeen.has(exactKey)) {
      duplicatesDropped += 1;
      continue;
    }

    const tokens = toTokenSet(item.title);
    let tooClose = false;
    for (const existing of accepted) {
      const sim = jaccardSimilarity(tokens, toTokenSet(existing.title));
      if (sim >= 0.9) {
        tooClose = true;
        break;
      }
    }

    if (tooClose) {
      duplicatesDropped += 1;
      continue;
    }

    exactSeen.add(exactKey);
    accepted.push(item);
  }

  return { items: accepted, duplicatesDropped };
}

export async function getMonitorNews(
  forceRefresh = false,
  options?: { threshold?: number },
): Promise<{ items: MonitorNewsItem[]; stats: MonitorIngestStats }> {
  const threshold = options?.threshold ?? MONITOR_RELEVANCE_THRESHOLD;
  if (!forceRefresh && cache && Date.now() - cache.generatedAt < MONITOR_CACHE_TTL_MS && threshold === MONITOR_RELEVANCE_THRESHOLD) {
    return { items: cache.items, stats: cache.stats };
  }

  const since = Date.now() - 24 * 60 * 60 * 1000;
  const enabledSources = MONITOR_SOURCES.filter((s) => s.enabled);

  const stats: MonitorIngestStats = {
    sourceCount: MONITOR_SOURCES.length,
    enabledSourceCount: enabledSources.length,
    fetchedItems: 0,
    acceptedItems: 0,
    droppedByScore: 0,
    droppedByTime: 0,
    duplicatesDropped: 0,
    sourceErrors: [],
    sourceAcceptedCounts: {},
    sourceNoiseCounts: {},
    generatedAt: new Date().toISOString(),
  };

  const allItems: MonitorNewsItem[] = [];

  await Promise.all(
    enabledSources.map(async (source) => {
      try {
        const fetched = await fetchFeed(source);
        stats.fetchedItems += fetched.length;

        const inWindow = fetched.filter((item) => isWithinWindow(item, since));
        stats.droppedByTime += fetched.length - inWindow.length;

        let acceptedForSource = 0;
        let noisyForSource = 0;

        for (const raw of inWindow) {
          const combinedText = `${raw.title} ${raw.summary || ""}`;
          if (matchesNoisePattern(source.id, combinedText)) {
            stats.droppedByScore += 1;
            noisyForSource += 1;
            continue;
          }
          const newsItem = toNewsItem(source, raw);
          if (newsItem.relevance_score < threshold) {
            stats.droppedByScore += 1;
            noisyForSource += 1;
            continue;
          }

          acceptedForSource += 1;
          allItems.push(newsItem);
        }

        stats.sourceAcceptedCounts[source.id] = acceptedForSource;
        stats.sourceNoiseCounts[source.id] = noisyForSource;
      } catch (error: any) {
        stats.sourceErrors.push({ sourceId: source.id, message: error?.message || "unknown" });
      }
    }),
  );

  const deduped = deduplicate(
    allItems.sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at)),
  );

  stats.duplicatesDropped = deduped.duplicatesDropped;
  stats.acceptedItems = deduped.items.length;

  if (threshold === MONITOR_RELEVANCE_THRESHOLD) {
    cache = {
      generatedAt: Date.now(),
      items: deduped.items,
      stats,
    };
  }

  return { items: deduped.items, stats };
}

export function filterMonitorNews(
  items: MonitorNewsItem[],
  filters: {
    crop?: string;
    topic?: string;
    region?: string;
    time?: "24h" | "7d";
    search?: string;
  },
): MonitorNewsItem[] {
  const now = Date.now();
  const timeWindowMs = filters.time === "24h" ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  const search = (filters.search || "").toLowerCase().trim();

  return items.filter((item) => {
    const publishedTs = Date.parse(item.published_at);
    if (Number.isFinite(publishedTs) && now - publishedTs > timeWindowMs) return false;

    if (filters.crop && filters.crop !== "all" && !item.crop_tags.includes(filters.crop.toLowerCase())) {
      return false;
    }

    if (filters.topic && filters.topic !== "all" && !item.topic_tags.includes(filters.topic.toLowerCase())) {
      return false;
    }

    if (filters.region && filters.region !== "all") {
      const target = filters.region.toLowerCase();
      if (target === "latam") {
        if (!item.region_tags.some((region) => region.includes("brazil") || region.includes("argentina"))) {
          return false;
        }
      } else if (target === "asia") {
        if (!item.region_tags.some((region) => region.includes("china") || region.includes("india"))) {
          return false;
        }
      } else if (!item.region_tags.some((region) => region.includes(target))) {
        return false;
      }
    }

    if (search) {
      const haystack = `${item.title} ${item.summary || ""}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }

    return true;
  });
}

export function topSignals(items: MonitorNewsItem[], count = 10): MonitorNewsItem[] {
  const ranked = [...items].sort(
    (a, b) => b.relevance_score - a.relevance_score || Date.parse(b.published_at) - Date.parse(a.published_at),
  );
  return capBySource(ranked, Math.max(1, Math.floor(count / 3)), count).map((item) => ({
    ...item,
    is_top_signal: true,
  }));
}

export function capBySource(items: MonitorNewsItem[], perSourceLimit: number, totalLimit = items.length): MonitorNewsItem[] {
  if (perSourceLimit <= 0) return items.slice(0, totalLimit);

  const counts = new Map<string, number>();
  const selected: MonitorNewsItem[] = [];
  const overflow: MonitorNewsItem[] = [];

  for (const item of items) {
    const key = item.source_name || "unknown";
    const used = counts.get(key) || 0;
    if (used < perSourceLimit) {
      counts.set(key, used + 1);
      selected.push(item);
      if (selected.length >= totalLimit) return selected;
    } else {
      overflow.push(item);
    }
  }

  for (const item of overflow) {
    selected.push(item);
    if (selected.length >= totalLimit) break;
  }

  return selected;
}
