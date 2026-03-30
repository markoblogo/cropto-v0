import type { SeaBrokerageEntryRow } from "@shared/schema";
import type { SeaBrokerageMatchSuggestion } from "./seaBrokerageMatching";

type TelegramPublishResult = {
  status: "published" | "failed";
  messageId?: string | null;
  messageText: string;
  error?: string;
};

type PublishContext = {
  brokerTelegramUsername?: string | null;
};

type RelayChannel = "internal" | "external";

type RelayTarget = {
  channel: RelayChannel;
  chatId: string;
};

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
  const currencySymbol =
    String(entry.currency || "USD").toUpperCase() === "EUR"
      ? "€"
      : String(entry.currency || "USD").toUpperCase() === "UAH"
        ? "₴"
        : "$";
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

function formatTelegramPeriod(entry: SeaBrokerageEntryRow) {
  const rawLabel = (entry.periodLabel || "").trim().toUpperCase();
  if (!rawLabel) return "OPEN";
  if (rawLabel === "SPOT" || rawLabel === "PROMPT") return rawLabel;

  const start = entry.periodStart ? new Date(entry.periodStart) : null;
  const hasValidStart = !!start && !Number.isNaN(start.getTime());
  const monthLong = hasValidStart
    ? start.toLocaleString("en-US", { month: "long" }).toUpperCase()
    : null;
  const yearShort = hasValidStart ? String(start.getFullYear()).slice(-2) : null;

  if (entry.periodType === "range" && entry.periodStart && entry.periodEnd) {
    return `${formatDateDottedShort(entry.periodStart)}-${formatDateDottedShort(entry.periodEnd)}`;
  }

  if (entry.periodType === "window" || entry.periodType === "month") {
    if (rawLabel.startsWith("1H")) return monthLong && yearShort ? `1H ${monthLong} ${yearShort}` : "1H";
    if (rawLabel.startsWith("2H")) return monthLong && yearShort ? `2H ${monthLong} ${yearShort}` : "2H";
    if (rawLabel.startsWith("LH")) return monthLong && yearShort ? `LH ${monthLong} ${yearShort}` : "LH";
    if (monthLong && yearShort) return `${monthLong} ${yearShort}`;
  }

  if (hasValidStart && monthLong && yearShort) {
    if (rawLabel.startsWith("1H")) return `1H ${monthLong} ${yearShort}`;
    if (rawLabel.startsWith("2H")) return `2H ${monthLong} ${yearShort}`;
    if (rawLabel.startsWith("LH")) return `LH ${monthLong} ${yearShort}`;
    if (rawLabel === "MONTH" || rawLabel.endsWith("MONTH")) return `${monthLong} ${yearShort}`;
  }

  return rawLabel;
}

function formatTelegramTransportCode(entry: SeaBrokerageEntryRow) {
  return entry.transportType
    .replace(/[_\s-]+/g, " ")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function formatTelegramCommodity(entry: SeaBrokerageEntryRow) {
  return entry.commodityLabel.replace(/%/g, "").trim().toUpperCase();
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
  const ideaTag =
    entry.type === "bid" ? "#bid_idea" : entry.type === "trade" ? "#trade_idea" : "#offer_idea";
  const flag = countryFlagEmoji(entry.originCountryCode || entry.destinationCountryCode);
  return [ideaTag, flag, brokerLabel].filter(Boolean).join(" ");
}

function formatQuantityLine(entry: SeaBrokerageEntryRow) {
  if (
    (entry.quantityMt === null || entry.quantityMt === undefined) &&
    entry.volumeFrom !== null &&
    entry.volumeTo !== null &&
    entry.volumeFrom !== entry.volumeTo
  ) {
    const fromLabel = Number(entry.volumeFrom).toLocaleString("en-US").replace(/,/g, "'");
    const toLabel = Number(entry.volumeTo).toLocaleString("en-US").replace(/,/g, "'");
    return `${fromLabel}-${toLabel} MT`;
  }

  const quantity = entry.quantityMt ?? entry.volumeTo ?? entry.volumeFrom;
  const tolerance = entry.tolerancePct ?? 0;
  const quantityLabel = Number(quantity).toLocaleString("en-US").replace(/,/g, "'");
  return tolerance > 0 ? `${quantityLabel} MT ${tolerance}%` : `${quantityLabel} MT`;
}

function resolveCountryCodeAlpha2(entry: SeaBrokerageEntryRow, value: string | null | undefined) {
  const normalized = String(value || "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(normalized)) return normalized;
  if (/^[A-Z]{3}$/.test(normalized)) {
    if (normalized === "UKR") return "UA";
    if (normalized === "ESP") return "ES";
    if (normalized === "EGY") return "EG";
    if (normalized === "TUR") return "TR";
    if (normalized === "ROU") return "RO";
    if (normalized === "MDA") return "MD";
  }
  const destination = String(entry.destinationCountry || "").trim().toUpperCase();
  if (destination === "UKRAINE") return "UA";
  if (destination === "SPAIN") return "ES";
  if (destination === "EGYPT") return "EG";
  if (destination === "TURKEY") return "TR";
  if (destination === "ROMANIA") return "RO";
  if (destination === "MOLDOVA") return "MD";
  return normalized || "N/A";
}

function formatStandardTelegramMessage(
  entry: SeaBrokerageEntryRow,
  brokerSignature?: string | null,
  includeBrokerSignature = true,
) {
  const header = formatTelegramHeader(
    entry,
    includeBrokerSignature
      ? brokerSignature || entry.companyName || entry.brokerName || entry.brokerCode
      : "BROKER DESK",
  );
  const countryCode = resolveCountryCodeAlpha2(entry, entry.originCountryCode || entry.destinationCountryCode);
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

  const lines = [
    header,
    "------------------------------",
    entry.type === "trade" ? `SELLER: ${sellerLine.toUpperCase()}` : counterpartyLine.toUpperCase(),
    entry.type === "trade" ? `BUYER: ${buyerLine.toUpperCase()}` : null,
    entry.type === "trade" ? `SELLER BROKER: ${tradeSellerBroker}` : null,
    entry.type === "trade" ? `BUYER BROKER: ${tradeBuyerBroker}` : null,
    `${formatTelegramCommodity(entry)}, ${countryCode}`,
    entry.gradeOrSpec?.trim() ? entry.gradeOrSpec.trim().toUpperCase() : null,
    formatQuantityLine(entry),
    `${entry.basis.toUpperCase()} ${entry.destinationPort.toUpperCase()}, ${countryCode}`,
    formatTelegramTransportCode(entry),
    formatTelegramPeriod(entry),
    formatTelegramPrice(entry),
    entry.paymentTerms?.trim() ? entry.paymentTerms.trim().toUpperCase() : null,
    "------------------------------",
  ];

  return lines.filter(Boolean).join("\n");
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
  return normalized.toUpperCase();
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

function formatMatchSideLine(label: "BID" | "OFFER", entry: SeaBrokerageEntryRow, includeBroker = true) {
  const brokerHandle = entry.brokerTelegramUsername
    ? `@${entry.brokerTelegramUsername.replace(/^@+/, "")}`
    : entry.brokerCode;
  const countryCode = resolveCountryCodeAlpha2(entry, entry.originCountryCode || entry.destinationCountryCode);
  const brokerPart = includeBroker ? ` ${brokerHandle}` : "";
  const counterparty = label === "BID"
    ? normalizeCounterpartyName(entry.buyerName)
    : normalizeCounterpartyName(entry.sellerName);
  return [
    `${label}${brokerPart}`,
    `${formatTelegramCommodity(entry)}, ${countryCode}`,
    formatQuantityInline(entry),
    `${entry.basis.toUpperCase()} ${entry.destinationPort.toUpperCase()}, ${countryCode}`,
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
  return [
    "#match_idea 🤝",
    "------------------------------",
    formatMatchSideLine("BID", match.bidEntry, includeBrokerIdentity),
    formatMatchSideLine("OFFER", match.offerEntry, includeBrokerIdentity),
    "------------------------------",
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
      const response = await fetch(apiBase, {
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
  const internalMessage = formatStandardTelegramMessage(entry, brokerSignature, true);
  const externalMessage = formatStandardTelegramMessage(entry, brokerSignature, false);
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
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
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
