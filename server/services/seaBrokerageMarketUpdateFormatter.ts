import type { SeaBrokerageEntryRow } from "@shared/schema";
import { formatSeaBrokerageBasisRoute } from "./seaBrokerageBasisFormat";
import { resolveSeaBrokerageTelegramTag } from "./seaBrokerageTelegramTags";

type CommoditySection = {
  title: string;
  emoji: string;
  matcher: RegExp;
  group: SeaBrokerageReportGroup;
};

export type SeaBrokerageReportGroup = "grains" | "oilseeds" | "byproducts" | "niche";
export type SeaBrokerageReportFormatMode = "regular" | "client_custom";
export type SeaBrokerageReportTemplateKey = "none" | "cassilo" | "rava";

export const SEA_BROKERAGE_REPORT_GROUP_ORDER: SeaBrokerageReportGroup[] = [
  "grains",
  "oilseeds",
  "byproducts",
  "niche",
];

export const SEA_BROKERAGE_REPORT_GROUP_LABELS: Record<SeaBrokerageReportGroup, string> = {
  grains: "Grains",
  oilseeds: "Oilseeds",
  byproducts: "By-products",
  niche: "Niche",
};

const COMMODITY_SECTIONS: CommoditySection[] = [
  { title: "CORN", emoji: "🌽", matcher: /\bcorn\b|\bmaize\b/i, group: "grains" },
  { title: "WHEAT 12.5", emoji: "🌾", matcher: /\bwheat\b.*12\.?5/i, group: "grains" },
  { title: "WHEAT 11.5", emoji: "🌾", matcher: /\bwheat\b.*11\.?5/i, group: "grains" },
  { title: "FEED WHEAT", emoji: "🌾", matcher: /\bfeed\b.*\bwheat\b|\bwheat\b.*\bfeed\b/i, group: "grains" },
  { title: "BARLEY", emoji: "🌾", matcher: /\bbarley\b/i, group: "grains" },
  { title: "SUNFLOWER SEEDS", emoji: "🌻", matcher: /\bsunflower\b.*\bseed/i, group: "oilseeds" },
  { title: "SOYBEANS", emoji: "🌱", matcher: /\bsoybean|\bsoy bean/i, group: "oilseeds" },
  { title: "RAPESEEDS", emoji: "🌿", matcher: /\brapeseed|\bcanola|\brape\b/i, group: "oilseeds" },
  { title: "SUNFLOWER MEAL", emoji: "⚙️", matcher: /\bsunflower\b.*\bmeal|\bmeal\b.*\bsunflower/i, group: "byproducts" },
  { title: "SUNFLOWER CAKE", emoji: "⚙️", matcher: /\bsunflower\b.*\bcake|\bcake\b.*\bsunflower/i, group: "byproducts" },
  { title: "SOYBEAN MEAL", emoji: "⚙️", matcher: /\bsoy\b.*\bmeal|\bmeal\b.*\bsoy/i, group: "byproducts" },
  { title: "SOYBEAN CAKE", emoji: "⚙️", matcher: /\bsoy\b.*\bcake|\bcake\b.*\bsoy/i, group: "byproducts" },
  { title: "RAPESEED MEAL", emoji: "⚙️", matcher: /\brapeseed|\bcanola|\brape\b.*\bmeal|\bmeal\b.*\brapeseed|\bmeal\b.*\bcanola/i, group: "byproducts" },
  { title: "RAPESEED CAKE", emoji: "⚙️", matcher: /\brapeseed|\bcanola|\brape\b.*\bcake|\bcake\b.*\brapeseed|\bcake\b.*\bcanola/i, group: "byproducts" },
  { title: "SUNFLOWER OIL", emoji: "💧", matcher: /\bsunflower\b.*\boil|\boil\b.*\bsunflower/i, group: "byproducts" },
  { title: "RAPESEED OIL", emoji: "💧", matcher: /\brapeseed|\bcanola|\brape\b.*\boil|\boil\b.*\brapeseed|\boil\b.*\bcanola/i, group: "byproducts" },
  { title: "SOYBEAN OIL", emoji: "💧", matcher: /\bsoy\b.*\boil|\boil\b.*\bsoy/i, group: "byproducts" },
  { title: "OAT", emoji: "🌾", matcher: /\boat\b/i, group: "niche" },
  { title: "RYE", emoji: "🌾", matcher: /\brye\b/i, group: "niche" },
  { title: "SORGHUM", emoji: "🌾", matcher: /\bsorghum\b/i, group: "niche" },
  { title: "MILLET", emoji: "🌾", matcher: /\bmillet\b/i, group: "niche" },
  { title: "YELLOW PEAS", emoji: "🫘", matcher: /\byellow\b.*\bpea|\bpea\b.*\byellow/i, group: "niche" },
  { title: "WHEAT BRAN", emoji: "⚙️", matcher: /\bwheat\b.*\bbran|\bbran\b.*\bwheat/i, group: "byproducts" },
  { title: "FLOUR", emoji: "⚙️", matcher: /\bflour\b/i, group: "byproducts" },
  { title: "SUGAR BEET PULP", emoji: "🗜️", matcher: /\bsugar\b.*\bbeet\b.*\bpulp/i, group: "byproducts" },
];

function normalizeText(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function formatQtyCompact(entry: SeaBrokerageEntryRow) {
  const from = Number(entry.volumeFrom || 0);
  const to = Number(entry.volumeTo || 0);
  const qty = Number(entry.quantityMt || 0);
  const fmt = (v: number) => `${Math.round(v / 1000)}k`;

  if (from > 0 && to > 0 && from !== to) return `${fmt(Math.min(from, to))}-${fmt(Math.max(from, to))}`;
  if (qty > 0) return `${fmt(qty)}`;
  if (to > 0) return `${fmt(to)}`;
  if (from > 0) return `${fmt(from)}`;
  return "n/a";
}

function formatPriceCompact(entry: SeaBrokerageEntryRow) {
  const symbol = (() => {
    const currency = normalizeText(entry.currency).toUpperCase();
    if (currency === "EUR") return "€";
    if (currency === "UAH") return "₴";
    return "$";
  })();

  const direct = entry.price !== null && entry.price !== undefined ? Number(entry.price) : null;
  const from = entry.priceFrom !== null && entry.priceFrom !== undefined ? Number(entry.priceFrom) : null;
  const to = entry.priceTo !== null && entry.priceTo !== undefined ? Number(entry.priceTo) : null;
  const fmt = (v: number) => (Number.isInteger(v) ? `${v}` : `${v.toFixed(2)}`);

  if (direct !== null && Number.isFinite(direct)) return `${fmt(direct)}${symbol}`;
  if (from !== null && to !== null && Number.isFinite(from) && Number.isFinite(to)) {
    if (from === to) return `${fmt(from)}${symbol}`;
    return `${fmt(Math.min(from, to))}-${fmt(Math.max(from, to))}${symbol}`;
  }
  const fallback = from ?? to;
  if (fallback !== null && fallback !== undefined && Number.isFinite(fallback)) return `${fmt(fallback)}${symbol}`;
  return "SUBJECT";
}

function formatPeriodCompact(entry: SeaBrokerageEntryRow) {
  const start = entry.periodStart ? new Date(entry.periodStart) : null;
  const end = entry.periodEnd ? new Date(entry.periodEnd) : null;
  const validStart = !!start && !Number.isNaN(start.getTime());
  const validEnd = !!end && !Number.isNaN(end.getTime());
  if (!validStart && !validEnd) return normalizeText(entry.periodLabel) || "OPEN";

  const month = (d: Date) => d.toLocaleString("en-US", { month: "short" }).replace(".", "");
  const day = (d: Date) => String(d.getDate()).padStart(2, "0");
  const year = (d: Date) => String(d.getFullYear());
  if (validStart && validEnd) {
    const s = start as Date;
    const e = end as Date;
    if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
      return `${day(s)}-${day(e)} ${month(s)} ${year(s)}`;
    }
    if (s.getFullYear() === e.getFullYear()) {
      return `${day(s)} ${month(s)} - ${day(e)} ${month(e)} ${year(s)}`;
    }
    return `${day(s)} ${month(s)} ${year(s)} - ${day(e)} ${month(e)} ${year(e)}`;
  }
  const one = (validStart ? (start as Date) : (end as Date));
  return `${day(one)} ${month(one)} ${year(one)}`;
}

function summarySide(entry: SeaBrokerageEntryRow) {
  return `${formatQtyCompact(entry)} ${formatPeriodCompact(entry)} ${formatPriceCompact(entry)}`;
}

function routeLabel(entry: SeaBrokerageEntryRow) {
  return formatSeaBrokerageBasisRoute(entry, { uppercase: false, countryMode: "alpha2" });
}

function findSection(entry: SeaBrokerageEntryRow) {
  const label = normalizeText(entry.commodityLabel || entry.commodity).toLowerCase();
  return COMMODITY_SECTIONS.find((section) => section.matcher.test(label)) || null;
}

function groupEntriesForSection(entries: SeaBrokerageEntryRow[]) {
  const byRoute = new Map<string, SeaBrokerageEntryRow[]>();
  for (const entry of entries) {
    const key = routeLabel(entry);
    const bucket = byRoute.get(key) || [];
    bucket.push(entry);
    byRoute.set(key, bucket);
  }
  return Array.from(byRoute.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

function buildRouteLines(routeEntries: SeaBrokerageEntryRow[]) {
  const offers = routeEntries.filter((entry) => entry.type === "offer");
  const bids = routeEntries.filter((entry) => entry.type === "bid");
  const lines: string[] = [];

  if (offers.length && bids.length) {
    // First pair inline, remaining lines below.
    const offer = offers[0];
    const bid = bids[0];
    lines.push(`→ Seller ${summarySide(offer)} vs. Buyer ${summarySide(bid)}`);
    for (const extraOffer of offers.slice(1)) {
      lines.push(`→ Seller ${summarySide(extraOffer)}`);
    }
    for (const extraBid of bids.slice(1)) {
      lines.push(`→ Buyer ${summarySide(extraBid)}`);
    }
    return lines;
  }

  for (const offer of offers) lines.push(`→ Seller ${summarySide(offer)}`);
  for (const bid of bids) lines.push(`→ Buyer ${summarySide(bid)}`);
  if (!lines.length) lines.push("→ No indications");
  return lines;
}

type BuildMarketMessageOptions = {
  groups?: SeaBrokerageReportGroup[];
  title?: string;
  formatMode?: SeaBrokerageReportFormatMode;
  templateKey?: SeaBrokerageReportTemplateKey;
};

const TEMPLATE_TITLES: Record<Exclude<SeaBrokerageReportTemplateKey, "none">, string> = {
  cassilo: "SPIKE Market for Cassilo",
  rava: "SPIKE Market for Rava",
};

export function buildSeaBrokerageMarketUpdateMessage(
  entries: SeaBrokerageEntryRow[],
  when = new Date(),
  options: BuildMarketMessageOptions = {},
) {
  const target = entries.filter((entry) => entry.type === "bid" || entry.type === "offer");
  const enabledGroups = new Set(options.groups?.length ? options.groups : SEA_BROKERAGE_REPORT_GROUP_ORDER);
  const headerDate = when.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });

  const lines: string[] = [];
  const formatMode = options.formatMode || "regular";
  const templateTitle =
    options.templateKey && options.templateKey !== "none" ? TEMPLATE_TITLES[options.templateKey] : null;
  lines.push(resolveSeaBrokerageTelegramTag("market_report"));
  if (formatMode === "client_custom") {
    lines.push(options.title || templateTitle || "SPIKE Market Update");
  } else {
    lines.push(options.title || templateTitle || "🇺🇦 SPIKE BROKERS Market Update");
  }
  lines.push(headerDate);
  lines.push("");
  lines.push("------------------------------");

  if (!target.length) {
    lines.push("No news today");
    lines.push("------------------------------");
    return lines.join("\n");
  }

  for (const section of COMMODITY_SECTIONS.filter((item) => enabledGroups.has(item.group))) {
    lines.push(`${section.emoji} ${section.title}`);
    const sectionEntries = target.filter((entry) => findSection(entry)?.title === section.title);

    if (sectionEntries.length) {
      for (const [route, routeEntries] of groupEntriesForSection(sectionEntries)) {
        lines.push(route);
        for (const routeLine of buildRouteLines(routeEntries)) {
          lines.push(routeLine);
        }
      }
    }

    lines.push("");
    lines.push("-----------------------------");
  }

  return lines.join("\n");
}

export function buildSeaBrokerageMarketUpdateMessagesByGroup(
  entries: SeaBrokerageEntryRow[],
  when = new Date(),
  groups: SeaBrokerageReportGroup[] = SEA_BROKERAGE_REPORT_GROUP_ORDER,
) {
  const uniqueGroups = Array.from(new Set(groups)).filter((group): group is SeaBrokerageReportGroup =>
    SEA_BROKERAGE_REPORT_GROUP_ORDER.includes(group),
  );
  return uniqueGroups.map((group) => {
    const message = buildSeaBrokerageMarketUpdateMessage(entries, when, {
      groups: [group],
      title: `🇺🇦 SPIKE BROKERS Market Update — ${SEA_BROKERAGE_REPORT_GROUP_LABELS[group]}`,
    });
    return {
      group,
      message,
    };
  });
}
