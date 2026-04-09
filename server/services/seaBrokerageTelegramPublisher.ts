import type { SeaBrokerageEntryRow } from "@shared/schema";
import type { SeaBrokerageMatchSuggestion } from "./seaBrokerageMatching";
import {
  formatSeaBrokerageBasisRoute,
  resolveSeaBrokerageCountryAlpha2,
} from "./seaBrokerageBasisFormat";

type TelegramPublishResult = {
  status: "published" | "failed";
  messageId?: string | null;
  messageText: string;
  error?: string;
};

type PublishContext = {
  brokerTelegramUsername?: string | null;
  isEdit?: boolean;
};

type RelayChannel = "internal" | "external";

type RelayTarget = {
  channel: RelayChannel;
  chatId: string;
};

const TELEGRAM_REQUEST_TIMEOUT_MS = Math.max(
  1000,
  Number(process.env.SEA_BROKERAGE_TELEGRAM_TIMEOUT_MS || "8000"),
);

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = TELEGRAM_REQUEST_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function countryFlagEmoji(countryCode: string | null | undefined) {
  const normalizedRaw = (countryCode || "").trim().toUpperCase();
  const normalized =
    normalizedRaw === "UKR"
      ? "UA"
      : normalizedRaw === "EGY"
        ? "EG"
        : normalizedRaw === "ESP"
          ? "ES"
          : normalizedRaw === "TUR"
            ? "TR"
            : normalizedRaw === "ROU"
              ? "RO"
              : normalizedRaw === "MDA"
                ? "MD"
                : normalizedRaw;
  if (!/^[A-Z]{2}$/.test(normalized)) return "";
  return Array.from(normalized)
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
}

function formatTelegramPrice(entry: SeaBrokerageEntryRow) {
  const currencySymbol = formatCurrencySymbol(entry.currency);
  const direct = entry.price;
  const from = entry.priceFrom;
  const to = entry.priceTo;

  if (direct !== null && direct !== undefined) {
    const compact = Number(direct);
    return `${Number.isInteger(compact) ? compact : compact.toFixed(2)}${currencySymbol}`;
  }

  if (from !== null && from !== undefined && to !== null && to !== undefined && from !== to) {
    const fromCompact = Number(from);
    const toCompact = Number(to);
    const left = Number.isInteger(fromCompact) ? `${fromCompact}` : fromCompact.toFixed(2);
    const right = Number.isInteger(toCompact) ? `${toCompact}` : toCompact.toFixed(2);
    return `${left}${currencySymbol} | ${right}${currencySymbol}`;
  }

  const resolvedPrice = from ?? to;
  if (resolvedPrice === null || resolvedPrice === undefined) {
    return "SUBJECT";
  }

  const compact = Number(resolvedPrice);
  return `${Number.isInteger(compact) ? compact : compact.toFixed(2)}${currencySymbol}`;
}

function formatTelegramHeaderSeparator() {
  return "------------------------------";
}

function formatCurrencySymbol(currency: string | null | undefined) {
  const normalized = String(currency || "USD").toUpperCase();
  if (normalized === "EUR") return "€";
  if (normalized === "UAH") return "₴";
  return "$";
}

function formatDateDotted(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${day}.${month}.${year}`;
}

function formatDateDottedShort(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}`;
}

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split(" ")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function normalizeCountryName(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^turkey$/i.test(raw)) return "Turkiye";
  return toTitleCase(raw);
}

function shortMonth(value: Date) {
  return value.toLocaleString("en-US", { month: "short" }).replace(".", "");
}

function formatTelegramPeriod(entry: SeaBrokerageEntryRow) {
  const start = entry.periodStart ? new Date(entry.periodStart) : null;
  const end = entry.periodEnd ? new Date(entry.periodEnd) : null;
  const hasValidStart = !!start && !Number.isNaN(start.getTime());
  const hasValidEnd = !!end && !Number.isNaN(end.getTime());
  const rawLabel = (entry.periodLabel || "").trim();
  const rawUpper = rawLabel.toUpperCase();
  if (!rawLabel) return "Open";
  if (rawUpper === "SPOT") return "Spot";
  if (rawUpper === "PROMPT") return "Prompt";

  if (hasValidStart && hasValidEnd) {
    const s = start as Date;
    const e = end as Date;
    const sDay = String(s.getDate()).padStart(2, "0");
    const eDay = String(e.getDate()).padStart(2, "0");
    const sMonth = shortMonth(s);
    const eMonth = shortMonth(e);
    const sYear = s.getFullYear();
    const eYear = e.getFullYear();
    if (sYear === eYear && sMonth === eMonth) {
      return `${sDay}-${eDay} ${sMonth} ${sYear}`;
    }
    if (sYear === eYear) {
      return `${sDay} ${sMonth} - ${eDay} ${eMonth} ${sYear}`;
    }
    return `${sDay} ${sMonth} ${sYear} - ${eDay} ${eMonth} ${eYear}`;
  }

  if (hasValidStart) {
    const s = start as Date;
    if (rawUpper.startsWith("1H")) return `1H ${shortMonth(s)} ${s.getFullYear()}`;
    if (rawUpper.startsWith("2H")) return `2H ${shortMonth(s)} ${s.getFullYear()}`;
    if (rawUpper.startsWith("LH")) return `LH ${shortMonth(s)} ${s.getFullYear()}`;
    return `${shortMonth(s)} ${s.getFullYear()}`;
  }

  return toTitleCase(rawLabel);
}

function formatTelegramTransportCode(entry: SeaBrokerageEntryRow) {
  const normalized = String(entry.transportType || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (normalized === "coaster") return "Coaster vessel";
  if (normalized === "handysize") return "Handysize vessels";
  if (normalized === "supramax") return "Supramax vessels";
  if (normalized === "panamax") return "Panamax vessels";
  if (normalized === "capesize") return "Capesize vessels";
  if (normalized === "vessel") return "Vessel";
  if (normalized === "rail" || normalized === "ua wagons") return "UA wagons";
  if (normalized === "truck" || normalized === "dump trucks") return "Dump trucks";
  if (normalized === "barge") return "Barge";
  if (normalized === "container") return "Container";
  if (normalized === "truck/rail" || normalized === "ua wagons dump trucks") {
    return "UA wagons | Dump trucks";
  }
  return toTitleCase(normalized);
}

function formatTelegramCommodity(entry: SeaBrokerageEntryRow) {
  const base = String(entry.commodityLabel || entry.commodity || "")
    .replace(/%/g, "")
    .trim();
  if (/^wheat\s*11\.?5$/i.test(base)) return "Wheat 11.5pro";
  if (/^wheat\s*12\.?5$/i.test(base)) return "Wheat 12.5pro";
  return toTitleCase(base);
}

function extractHarvestYearFromGrade(entry: SeaBrokerageEntryRow) {
  const match = String(entry.gradeOrSpec || "").match(/\b(20\d{2})\b/);
  return match ? match[1] : null;
}

function formatTelegramCommodityCountryLine(
  entry: SeaBrokerageEntryRow,
  countryCodeAlpha2: string,
) {
  const commodity = formatTelegramCommodity(entry);
  const harvestYear = extractHarvestYearFromGrade(entry);
  const originCode = countryCodeAlpha2.toUpperCase();
  if (harvestYear) {
    return `${commodity}, ${originCode} origin, ${harvestYear}`;
  }
  return `${commodity}, ${originCode} origin`;
}

function formatTelegramCounterparty(entry: SeaBrokerageEntryRow) {
  if (entry.type === "bid") {
    return entry.buyerName?.trim() || null;
  }
  if (entry.type === "trade") {
    return null;
  }
  return entry.sellerName?.trim() || null;
}

function formatTelegramHeader(entry: SeaBrokerageEntryRow, brokerLabel: string) {
  if (entry.type === "trade" && entry.isMarketTrade) {
    const flag = countryFlagEmoji(entry.originCountryCode || entry.destinationCountryCode);
    return ["#market_traded", flag, brokerLabel].filter(Boolean).join(" ");
  }

  const ideaTag =
    entry.type === "bid" ? "#bid_idea" : entry.type === "trade" ? "#traded" : "#offer_idea";
  const flag = countryFlagEmoji(entry.originCountryCode || entry.destinationCountryCode);
  if (entry.type === "trade") {
    return [ideaTag, flag].filter(Boolean).join(" ");
  }
  if (entry.type === "bid") {
    const commodityEmoji = resolveCommodityEmoji(entry);
    return [ideaTag, flag, commodityEmoji].filter(Boolean).join(" ");
  }
  return [ideaTag].filter(Boolean).join(" ");
}

function isSeaBasisValue(value: string | null | undefined) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  return normalized === "FOB" || normalized === "CIF" || normalized === "CFR";
}

function formatQuantityLine(entry: SeaBrokerageEntryRow) {
  const fmtSingle = (value: number) => Number(value).toLocaleString("en-US").replace(/,/g, "'");
  const fmtRangePart = (value: number) => {
    const normalized = Number(value);
    if (!Number.isFinite(normalized)) return "0";
    if (normalized >= 1000 && normalized % 1000 === 0 && normalized < 10_000) {
      return `${Math.round(normalized / 1000)}`;
    }
    return fmtSingle(normalized);
  };

  const compactThousandsSuffix = (value: number) =>
    value >= 1000 && value % 1000 === 0 && value < 10_000 ? "'000" : "";

  if (
    (entry.quantityMt === null || entry.quantityMt === undefined) &&
    entry.volumeFrom !== null &&
    entry.volumeTo !== null &&
    entry.volumeFrom !== entry.volumeTo
  ) {
    const fromValue = Math.min(Number(entry.volumeFrom), Number(entry.volumeTo));
    const toValue = Math.max(Number(entry.volumeFrom), Number(entry.volumeTo));
    const fromLabel = fmtRangePart(fromValue);
    const toLabel = fmtRangePart(toValue);
    const suffix = compactThousandsSuffix(fromValue) === "'000" && compactThousandsSuffix(toValue) === "'000"
      ? "'000"
      : "";
    const tolerance = entry.tolerancePct ?? 0;
    const qty = `${fromLabel}-${toLabel}${suffix} mt`;
    return tolerance > 0 ? `${qty} ± ${tolerance}%` : qty;
  }

  const quantity = entry.quantityMt ?? entry.volumeTo ?? entry.volumeFrom;
  const tolerance = entry.tolerancePct ?? 0;
  const quantityLabel = fmtSingle(Number(quantity));
  const qty = `${quantityLabel} mt`;
  return tolerance > 0 ? `${qty} ± ${tolerance}%` : qty;
}

function formatBasisRouteReadable(entry: SeaBrokerageEntryRow) {
  const route = formatSeaBrokerageBasisRoute(entry, { uppercase: false, countryMode: "name" });
  return normalizeCountryName(route);
}

function resolveCommodityEmoji(entry: SeaBrokerageEntryRow) {
  const label = `${entry.commodityLabel || ""} ${entry.commodity || ""}`.toLowerCase();
  if (label.includes("corn") || label.includes("maize")) return "🌽";
  if (label.includes("wheat") || label.includes("barley") || label.includes("oat") || label.includes("rye")) return "🌾";
  if (label.includes("sunflower")) return "🌻";
  if (label.includes("soy")) return "🌱";
  if (label.includes("rape") || label.includes("canola")) return "🌿";
  if (label.includes("pea")) return "🫘";
  return "";
}

function formatPublicEntryId(entryId: string) {
  let hash = 0;
  const source = String(entryId || "");
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  }
  const serial = (hash % 1000) + 1;
  return `#ID_${String(serial).padStart(3, "0")}`;
}

function formatStandardTelegramMessage(
  entry: SeaBrokerageEntryRow,
  brokerSignature?: string | null,
  includeBrokerSignature = true,
  isEdit = false,
) {
  const isTrade = entry.type === "trade";
  const isMarketTrade = !!entry.isMarketTrade;
  const isSeaBasis = isSeaBasisValue(entry.basis);
  const header = formatTelegramHeader(
    entry,
    includeBrokerSignature && (!isTrade || isMarketTrade)
      ? brokerSignature || entry.companyName || entry.brokerName || entry.brokerCode
      : "",
  );
  const originCountryCode = resolveSeaBrokerageCountryAlpha2(entry, entry.originCountryCode);
  const counterpartyLine = formatTelegramCounterparty(entry) || (entry.type === "offer" ? "SELLER" : "BUYER");
  const sellerLine =
    (entry.sellerName || "").trim() ||
    (entry.type === "offer" ? "SELLER" : entry.type === "trade" ? "SELLER" : "");
  const buyerLine =
    (entry.buyerName || "").trim() ||
    (entry.type === "bid" ? "BUYER" : entry.type === "trade" ? "BUYER" : "");
  const tradeSellerBroker = formatTelegramBrokerIdentity(
    entry.tradeSellerBrokerTelegramUsername,
    entry.tradeSellerBrokerTelegramUserId,
  );
  const tradeBuyerBroker = formatTelegramBrokerIdentity(
    entry.tradeBuyerBrokerTelegramUsername,
    entry.tradeBuyerBrokerTelegramUserId,
  );

  const bodyLines = [
    header,
    formatTelegramHeaderSeparator(),
    isTrade
      ? formatTradePartyLine("SELLER", sellerLine, tradeSellerBroker)
      : entry.type === "bid" && !isSeaBasis
        ? null
        : counterpartyLine,
    isTrade ? formatTradePartyLine("BUYER", buyerLine, tradeBuyerBroker) : null,
    !isTrade && entry.isNewCrop ? "NEW CROP" : null,
    formatTelegramCommodityCountryLine(entry, originCountryCode),
    entry.gradeOrSpec?.trim() && !/^HARVEST\b/i.test(entry.gradeOrSpec.trim())
      ? entry.gradeOrSpec.trim()
      : null,
    formatQuantityLine(entry),
    formatBasisRouteReadable(entry),
    formatTelegramTransportCode(entry),
    formatTelegramPeriod(entry),
    formatTelegramPrice(entry),
    formatTelegramHeaderSeparator(),
  ];

  const text = bodyLines.filter(Boolean).join("\n");
  const normalizedBroker = brokerSignature
    ? `@${String(brokerSignature).replace(/^@+/, "").toLowerCase()}`
    : entry.brokerTelegramUsername
      ? `@${String(entry.brokerTelegramUsername).replace(/^@+/, "").toLowerCase()}`
      : `@${String(entry.brokerCode || "broker").toLowerCase()}`;
  const out: string[] = [text];
  const otherTerms = formatOptionalOtherTerms(entry.note);
  if (otherTerms) {
    out.push(otherTerms.replace(/^OTHER TERMS:\s*/i, ""));
    out.push(formatTelegramHeaderSeparator());
  }
  if (!isTrade) {
    out.push(`${formatPublicEntryId(entry.id)} by ${normalizedBroker}`);
  }
  return out.filter(Boolean).join("\n");
}

function formatQuantityInline(entry: SeaBrokerageEntryRow) {
  const quantity = entry.quantityMt ?? entry.volumeTo ?? entry.volumeFrom;
  const quantityLabel = Number(quantity).toLocaleString("en-US").replace(/,/g, "'");
  const tolerance = entry.tolerancePct ?? 0;
  return tolerance > 0 ? `${quantityLabel} MT ${tolerance}%` : `${quantityLabel} MT`;
}

function formatPeriodInline(entry: SeaBrokerageEntryRow) {
  return formatTelegramPeriod(entry);
}

function formatPriceInline(entry: SeaBrokerageEntryRow) {
  return formatTelegramPrice(entry);
}

function normalizeCounterpartyName(value?: string | null) {
  const normalized = (value || "").trim();
  if (!normalized) return null;
  if (normalized.toLowerCase() === "not specified") return null;
  return normalized;
}

function formatTelegramBrokerIdentity(
  telegramUsername?: string | null,
  telegramUserId?: string | null,
) {
  const normalizedUsername = String(telegramUsername || "").trim().replace(/^@+/, "");
  if (normalizedUsername) {
    return `@${normalizedUsername.toLowerCase()}`;
  }
  const normalizedUserId = String(telegramUserId || "").trim();
  if (normalizedUserId) {
    return `tg:${normalizedUserId}`;
  }
  return "N/A";
}

function formatTradePartyLine(
  label: "SELLER" | "BUYER",
  companyName: string,
  brokerIdentity: string,
) {
  const normalizedCompany = (companyName || "").trim();
  const normalizedIdentity = (brokerIdentity || "").trim();
  if (normalizedIdentity && normalizedIdentity !== "N/A") {
    return `${label}: ${normalizedCompany} / ${normalizedIdentity}`;
  }
  return `${label}: ${normalizedCompany}`;
}

function formatOptionalOtherTerms(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const hasMeaningfulContent = /[\p{L}\p{N}]/u.test(raw);
  if (!hasMeaningfulContent) return null;
  return `OTHER TERMS: ${raw}`;
}

function formatMatchSideLine(label: "BID" | "OFFER", entry: SeaBrokerageEntryRow, includeBroker = true) {
  const brokerHandle = entry.brokerTelegramUsername
    ? `@${entry.brokerTelegramUsername.replace(/^@+/, "")}`
    : entry.brokerCode;
  const countryCode = resolveSeaBrokerageCountryAlpha2(
    entry,
    entry.originCountryCode || entry.destinationCountryCode,
  );
  const brokerPart = includeBroker ? ` ${brokerHandle}` : "";
  const counterparty = label === "BID"
    ? normalizeCounterpartyName(entry.buyerName)
    : normalizeCounterpartyName(entry.sellerName);
  return [
    `${label}${brokerPart}`,
    `${formatTelegramCommodity(entry)}, ${countryCode}`,
    formatQuantityInline(entry),
    formatSeaBrokerageBasisRoute(
      {
        ...entry,
        destinationCountryCode: countryCode,
      },
      { uppercase: true, countryMode: "alpha2" },
    ),
    `${formatPeriodInline(entry)} @ ${formatPriceInline(entry)}`,
    counterparty || entry.companyName || entry.brokerName || entry.brokerCode,
  ]
    .filter(Boolean)
    .join(" / ");
}

function formatMatchMessage(
  match: SeaBrokerageMatchSuggestion,
  includeBrokerIdentity: boolean,
) {
  void includeBrokerIdentity;
  const refEntry = match.bidEntry;
  const flag = countryFlagEmoji(refEntry.destinationCountryCode || refEntry.originCountryCode);
  const emoji = resolveCommodityEmoji(refEntry);
  const bidBroker = refEntry.brokerTelegramUsername
    ? `@${refEntry.brokerTelegramUsername.replace(/^@+/, "").toLowerCase()}`
    : `@${String(refEntry.brokerCode || "broker").toLowerCase()}`;
  const offerBroker = match.offerEntry.brokerTelegramUsername
    ? `@${match.offerEntry.brokerTelegramUsername.replace(/^@+/, "").toLowerCase()}`
    : `@${String(match.offerEntry.brokerCode || "broker").toLowerCase()}`;
  return [
    ["#match_idea", "🔗", flag, emoji].filter(Boolean).join(" "),
    formatTelegramHeaderSeparator(),
    formatTelegramCommodityCountryLine(refEntry, resolveSeaBrokerageCountryAlpha2(refEntry, refEntry.originCountryCode)),
    formatBasisRouteReadable(refEntry),
    formatTelegramTransportCode(refEntry),
    formatTelegramPeriod(refEntry),
    formatTelegramHeaderSeparator(),
    `Offer – ${formatPublicEntryId(match.offerEntry.id)} by ${offerBroker}`,
    `${formatQuantityLine(match.offerEntry)} / ${formatTelegramPeriod(match.offerEntry)} / ${formatTelegramPrice(match.offerEntry)}`,
    "vs.",
    `Bid – ${formatPublicEntryId(match.bidEntry.id)} by ${bidBroker}`,
    `${formatQuantityLine(match.bidEntry)} / ${formatTelegramPeriod(match.bidEntry)} / ${formatTelegramPrice(match.bidEntry)}`,
    formatTelegramHeaderSeparator(),
  ].join("\n");
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function appendChatIds(targets: RelayTarget[], channel: RelayChannel, values: Array<string | undefined>) {
  for (const raw of values) {
    if (!raw) continue;
    raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .forEach((chatId) => targets.push({ channel, chatId }));
  }
}

function resolveSeaBrokerageRelayTargets(entry: SeaBrokerageEntryRow): RelayTarget[] {
  const targets: RelayTarget[] = [];
  const internalEnabled = parseBoolean(process.env.SEA_BROKERAGE_TELEGRAM_INTERNAL_ENABLED, true);
  const externalEnabled = parseBoolean(process.env.SEA_BROKERAGE_TELEGRAM_EXTERNAL_ENABLED, false);

  if (internalEnabled) {
    appendChatIds(targets, "internal", [
      process.env.SEA_BROKERAGE_TELEGRAM_INTERNAL_CHAT_ID,
      process.env.SEA_BROKERAGE_TELEGRAM_INTERNAL_CHAT_IDS,
      process.env.SEA_BROKERAGE_TELEGRAM_CHAT_ID,
      process.env.SEA_BROKERAGE_TELEGRAM_CHAT_IDS,
    ]);

    if (entry.originCountryCode?.toUpperCase() === "UA") {
      appendChatIds(targets, "internal", [
        process.env.SEA_BROKERAGE_TELEGRAM_INTERNAL_UA_CHAT_ID,
        process.env.SEA_BROKERAGE_TELEGRAM_UA_CHAT_ID,
      ]);
    }
  }

  if (externalEnabled) {
    appendChatIds(targets, "external", [
      process.env.SEA_BROKERAGE_TELEGRAM_EXTERNAL_CHAT_ID,
      process.env.SEA_BROKERAGE_TELEGRAM_EXTERNAL_CHAT_IDS,
    ]);
  }

  const deduped = new Map<string, RelayTarget>();
  for (const target of targets) {
    const key = `${target.channel}:${target.chatId}`;
    if (!deduped.has(key)) {
      deduped.set(key, target);
    }
  }
  return Array.from(deduped.values());
}

function resolveSeaBrokerageRelayTargetsForMatch(match: SeaBrokerageMatchSuggestion): RelayTarget[] {
  return resolveSeaBrokerageRelayTargets(match.bidEntry);
}

function resolveSeaBrokerageInternalRelayTargets(): RelayTarget[] {
  const targets: RelayTarget[] = [];
  appendChatIds(targets, "internal", [
    process.env.SEA_BROKERAGE_TELEGRAM_INTERNAL_CHAT_ID,
    process.env.SEA_BROKERAGE_TELEGRAM_INTERNAL_CHAT_IDS,
    process.env.SEA_BROKERAGE_TELEGRAM_CHAT_ID,
    process.env.SEA_BROKERAGE_TELEGRAM_CHAT_IDS,
  ]);
  const deduped = new Map<string, RelayTarget>();
  for (const target of targets) {
    const key = `${target.channel}:${target.chatId}`;
    if (!deduped.has(key)) deduped.set(key, target);
  }
  return Array.from(deduped.values());
}

async function sendTelegramMessages(
  internalMessage: string,
  externalMessage: string,
  targets: RelayTarget[],
): Promise<TelegramPublishResult> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return {
      status: "failed",
      messageText: internalMessage,
      error: "TELEGRAM_BOT_TOKEN is not configured",
    };
  }
  if (targets.length === 0) {
    return {
      status: "failed",
      messageText: internalMessage,
      error: "Sea brokerage Telegram relay targets are not configured",
    };
  }

  const apiBase = `https://api.telegram.org/bot${botToken}/sendMessage`;
  let firstMessageId: string | null = null;
  const sentChannels: string[] = [];
  const failedChannels: string[] = [];
  const failedErrors: string[] = [];

  for (const target of targets) {
    const text = target.channel === "internal" ? internalMessage : externalMessage;
    try {
      const response = await fetchWithTimeout(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: target.chatId,
          text,
          disable_web_page_preview: true,
        }),
      });

      let payload: {
        ok?: boolean;
        description?: string;
        result?: { message_id?: number };
      } = {};
      try {
        payload = (await response.json()) as {
          ok?: boolean;
          description?: string;
          result?: { message_id?: number };
        };
      } catch {
        payload = {};
      }

      if (!response.ok || !payload.ok) {
        failedChannels.push(`${target.channel}:${target.chatId}`);
        failedErrors.push(
          payload.description ||
            `Telegram sendMessage failed (${target.channel}) with status ${response.status}`,
        );
        continue;
      }

      if (!firstMessageId && payload.result?.message_id) {
        firstMessageId = String(payload.result.message_id);
      }
      sentChannels.push(`${target.channel}:${target.chatId}`);
    } catch (error) {
      failedChannels.push(`${target.channel}:${target.chatId}`);
      failedErrors.push(error instanceof Error ? error.message : "Unknown Telegram relay error");
    }
  }

  const messageText = [
    `internal:\n${internalMessage}\n\nexternal:\n${externalMessage}`,
    sentChannels.length ? `sent:${sentChannels.join(",")}` : null,
    failedChannels.length ? `failed:${failedChannels.join(",")}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  if (sentChannels.length > 0) {
    return {
      status: "published",
      messageId: firstMessageId,
      messageText,
      error: failedErrors.length ? failedErrors.join(" | ") : undefined,
    };
  }

  return {
    status: "failed",
    messageText,
    error: failedErrors.join(" | ") || "Unknown Telegram relay error",
  };
}

export async function publishSeaBrokerageEntryToTelegram(
  entry: SeaBrokerageEntryRow,
  context?: PublishContext,
): Promise<TelegramPublishResult> {
  const brokerSignature = context?.brokerTelegramUsername
    ? `@${context.brokerTelegramUsername.replace(/^@+/, "")}`
    : entry.brokerTelegramUsername
      ? `@${entry.brokerTelegramUsername.replace(/^@+/, "")}`
      : null;
  const isEdit = !!context?.isEdit;
  let internalMessage = formatStandardTelegramMessage(entry, brokerSignature, true, isEdit);
  let externalMessage = formatStandardTelegramMessage(entry, brokerSignature, false, isEdit);
  if (isEdit) {
    const editedPrefix = "🔄 EDITED";
    internalMessage = `${editedPrefix}\n${internalMessage}`;
    externalMessage = `${editedPrefix}\n${externalMessage}`;
  }
  const targets = resolveSeaBrokerageRelayTargets(entry);
  return sendTelegramMessages(internalMessage, externalMessage, targets);
}

export async function publishSeaBrokerageMatchToTelegram(
  match: SeaBrokerageMatchSuggestion,
): Promise<TelegramPublishResult> {
  const internalMessage = formatMatchMessage(match, true);
  const externalMessage = formatMatchMessage(match, false);
  const targets = resolveSeaBrokerageRelayTargetsForMatch(match);
  return sendTelegramMessages(internalMessage, externalMessage, targets);
}

export async function sendSeaBrokerageTelegramDirectMessage(
  chatId: string,
  text: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return { ok: false, error: "TELEGRAM_BOT_TOKEN is not configured" };
  }

  try {
    const response = await fetchWithTimeout(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });

    const payload = (await response.json()) as {
      ok?: boolean;
      description?: string;
    };

    if (!response.ok || !payload.ok) {
      return {
        ok: false,
        error: payload.description || `Telegram sendMessage failed with status ${response.status}`,
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown Telegram direct message error",
    };
  }
}

export async function sendSeaBrokerageTelegramInternalBroadcast(
  text: string,
): Promise<TelegramPublishResult> {
  const targets = resolveSeaBrokerageInternalRelayTargets();
  return sendTelegramMessages(text, text, targets);
}
