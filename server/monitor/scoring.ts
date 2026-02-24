const CROPS = [
  "wheat",
  "corn",
  "maize",
  "soybean",
  "soybeans",
  "soy",
  "rapeseed",
  "canola",
  "sunflower",
  "barley",
  "oilseed",
  "oilseeds",
  "meal",
  "crush",
  "crushing",
] as const;

const MARKET_TRADE = [
  "harvest",
  "yield",
  "crop",
  "acreage",
  "planting",
  "sowing",
  "export",
  "import",
  "tender",
  "futures",
  "basis",
  "stocks",
  "shipments",
] as const;

const LOGISTICS = [
  "freight",
  "vessel",
  "rail",
  "barge",
  "port",
  "terminal",
  "shipping",
  "logistics",
  "river",
  "draft",
] as const;

const WEATHER = [
  "drought",
  "rainfall",
  "precipitation",
  "soil moisture",
  "heat",
  "frost",
  "weather",
  "el nino",
  "la nina",
] as const;

const POLICY = [
  "tariff",
  "quota",
  "sanctions",
  "export ban",
  "export duty",
  "regulation",
] as const;

const REGIONS = [
  "ukraine",
  "black sea",
  "eu",
  "france",
  "germany",
  "romania",
  "bulgaria",
  "poland",
  "us",
  "brazil",
  "argentina",
  "russia",
  "india",
  "china",
] as const;

const STOPWORDS = [
  "celebrity",
  "gaming",
  "smartphone",
  "crypto meme",
  "football",
  "movie trailer",
  "coupon",
  "black friday",
  "cyber monday",
  "giveaway",
  "lifestyle",
  "fashion",
  "horoscope",
  "lottery",
  "dating",
  "casino",
  "esports",
  "nft collection",
  "influencer",
  "streaming series",
  "tv show",
  "celebrity interview",
  "red carpet",
] as const;

type ScoringInput = {
  title: string;
  summary?: string;
};

export type ScoringResult = {
  relevanceScore: number;
  topicTags: string[];
  cropTags: string[];
  regionTags: string[];
  matchedKeywords: string[];
};

function includesPhrase(haystack: string, needle: string): boolean {
  return haystack.includes(needle);
}

function scoreGroup(
  text: string,
  title: string,
  keywords: readonly string[],
  baseScore: number,
  titleBonus: number,
  tagPrefix: string,
) {
  const tags: string[] = [];
  const matched: string[] = [];
  let score = 0;

  for (const keyword of keywords) {
    if (!includesPhrase(text, keyword)) continue;
    matched.push(keyword);
    tags.push(`${tagPrefix}:${keyword}`);
    score += baseScore;
    if (includesPhrase(title, keyword)) score += titleBonus;
  }

  return { score, tags, matched };
}

export function scoreNews(input: ScoringInput): ScoringResult {
  const title = input.title.toLowerCase();
  const summary = (input.summary || "").toLowerCase();
  const body = `${title} ${summary}`;

  const crop = scoreGroup(body, title, CROPS, 2, 1, "crop");
  const market = scoreGroup(body, title, MARKET_TRADE, 2, 1, "topic");
  const logistics = scoreGroup(body, title, LOGISTICS, 1, 1, "topic");
  const weather = scoreGroup(body, title, WEATHER, 1, 1, "topic");
  const policy = scoreGroup(body, title, POLICY, 1, 1, "topic");
  const region = scoreGroup(body, title, REGIONS, 1, 1, "region");

  let penalty = 0;
  const noiseMatches: string[] = [];
  for (const noise of STOPWORDS) {
    if (!includesPhrase(body, noise)) continue;
    penalty += 2;
    noiseMatches.push(`noise:${noise}`);
  }

  const relevanceScore =
    crop.score + market.score + logistics.score + weather.score + policy.score + region.score - penalty;

  const cropTags = new Set<string>();
  for (const matched of crop.matched) {
    if (matched.startsWith("soy")) cropTags.add("soy");
    else if (matched === "canola" || matched === "rapeseed") cropTags.add("rapeseed");
    else if (matched === "oilseed" || matched === "oilseeds") cropTags.add("oilseeds");
    else cropTags.add(matched);
  }

  const topicTags = new Set<string>();
  if (market.matched.length > 0) {
    topicTags.add("markets");
    topicTags.add("trade");
  }
  if (market.matched.includes("harvest")) topicTags.add("harvest");
  if (logistics.matched.length > 0) topicTags.add("logistics");
  if (weather.matched.length > 0) topicTags.add("weather");
  if (policy.matched.length > 0) topicTags.add("policy");

  if (region.matched.some((value) => ["brazil", "argentina"].includes(value))) topicTags.add("latam");
  if (region.matched.some((value) => ["china", "india"].includes(value))) topicTags.add("asia");

  return {
    relevanceScore,
    cropTags: [...cropTags],
    topicTags: [...topicTags],
    regionTags: [...new Set(region.tags.map((tag) => tag.replace("region:", "")))],
    matchedKeywords: [
      ...crop.matched,
      ...market.matched,
      ...logistics.matched,
      ...weather.matched,
      ...policy.matched,
      ...region.matched,
      ...noiseMatches,
    ],
  };
}
