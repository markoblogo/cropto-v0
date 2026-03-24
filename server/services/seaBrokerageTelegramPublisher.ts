import type { SeaBrokerageEntryRow } from "@shared/schema";

type TelegramPublishResult = {
  status: "published" | "failed";
  messageId?: string | null;
  messageText: string;
  error?: string;
};

function countryFlagEmoji(countryCode: string | null | undefined) {
  const normalized = (countryCode || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return "";
  return Array.from(normalized)
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
}

function formatTelegramPrice(entry: SeaBrokerageEntryRow) {
  const direct = entry.price;
  const from = entry.priceFrom;
  const to = entry.priceTo;

  if (direct !== null && direct !== undefined) {
    const compact = Number(direct);
    return `@${Number.isInteger(compact) ? compact : compact.toFixed(2)}$`;
  }

  if (from !== null && from !== undefined && to !== null && to !== undefined && from !== to) {
    const fromCompact = Number(from);
    const toCompact = Number(to);
    const left = Number.isInteger(fromCompact) ? `${fromCompact}` : fromCompact.toFixed(2);
    const right = Number.isInteger(toCompact) ? `${toCompact}` : toCompact.toFixed(2);
    return `@${left}$ | ${right}$`;
  }

  const resolvedPrice = from ?? to;
  if (resolvedPrice === null || resolvedPrice === undefined) {
    return "@ subject";
  }

  const compact = Number(resolvedPrice);
  return `@${Number.isInteger(compact) ? compact : compact.toFixed(2)}$`;
}

function formatDateDotted(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${day}.${month}.${year}`;
}

function formatTelegramPeriod(entry: SeaBrokerageEntryRow) {
  if (entry.periodStart && entry.periodEnd) {
    return `${formatDateDotted(entry.periodStart)}-${formatDateDotted(entry.periodEnd)}`;
  }

  return entry.periodLabel;
}

function formatTelegramTransport(entry: SeaBrokerageEntryRow) {
  return entry.transportType.replace(/_/g, " | ");
}

function formatTelegramCommodity(entry: SeaBrokerageEntryRow) {
  return entry.commodityLabel.replace(/%/g, "").trim();
}

function formatTelegramCounterparty(entry: SeaBrokerageEntryRow) {
  if (entry.type === "bid") {
    return entry.buyerName?.trim() || null;
  }

  return entry.sellerName?.trim() || null;
}

export function formatSeaBrokerageTelegramMessage(entry: SeaBrokerageEntryRow) {
  const ideaTag = entry.type === "bid" ? "#bid_idea" : "#offer_idea";
  const brokerLabel = entry.companyName || entry.brokerName || entry.brokerCode;
  const flag = countryFlagEmoji(entry.originCountryCode || entry.destinationCountryCode);
  const counterparty = formatTelegramCounterparty(entry);
  const header = [ideaTag, flag, brokerLabel].filter(Boolean).join(" ");
  const transportLine = formatTelegramTransport(entry);
  const counterpartyLine =
    entry.type === "bid"
      ? counterparty
        ? `Buyer: ${counterparty}`
        : null
      : counterparty
        ? `Seller: ${counterparty}`
        : null;
  const termsLine = entry.paymentTerms?.trim() ? `Payment: ${entry.paymentTerms.trim()}` : null;

  const lines = [
    header,
    "------------------------------",
    formatTelegramCommodity(entry),
    `${entry.basis} ${entry.destinationPort}, ${entry.destinationCountry}`,
    transportLine,
    termsLine,
    counterpartyLine,
    `${formatTelegramPeriod(entry)} ${formatTelegramPrice(entry)}`,
  ];

  if (entry.note?.trim()) {
    lines.push(entry.note.trim());
  }

  return lines.filter((line) => !!line).join("\n");
}

function resolveSeaBrokerageChatIds(entry: SeaBrokerageEntryRow) {
  const ids = new Set<string>();
  const generic = process.env.SEA_BROKERAGE_TELEGRAM_CHAT_ID;
  const multi = process.env.SEA_BROKERAGE_TELEGRAM_CHAT_IDS;
  const uaChat = process.env.SEA_BROKERAGE_TELEGRAM_UA_CHAT_ID;

  if (generic) ids.add(generic);
  if (multi) {
    multi
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .forEach((value) => ids.add(value));
  }
  if (entry.originCountryCode?.toUpperCase() === "UA" && uaChat) {
    ids.add(uaChat);
  }

  return Array.from(ids);
}

export async function publishSeaBrokerageEntryToTelegram(
  entry: SeaBrokerageEntryRow,
): Promise<TelegramPublishResult> {
  const messageText = formatSeaBrokerageTelegramMessage(entry);
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatIds = resolveSeaBrokerageChatIds(entry);

  if (!botToken) {
    return {
      status: "failed",
      messageText,
      error: "TELEGRAM_BOT_TOKEN is not configured",
    };
  }

  if (chatIds.length === 0) {
    return {
      status: "failed",
      messageText,
      error: "Sea brokerage Telegram chat id is not configured",
    };
  }

  const apiBase = `https://api.telegram.org/bot${botToken}/sendMessage`;
  let firstMessageId: string | null = null;

  try {
    for (const chatId of chatIds) {
      const response = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: messageText,
          disable_web_page_preview: true,
        }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        description?: string;
        result?: { message_id?: number };
      };

      if (!response.ok || !payload.ok) {
        return {
          status: "failed",
          messageText,
          error: payload.description || `Telegram sendMessage failed with status ${response.status}`,
        };
      }

      if (!firstMessageId && payload.result?.message_id) {
        firstMessageId = String(payload.result.message_id);
      }
    }

    return {
      status: "published",
      messageId: firstMessageId,
      messageText,
    };
  } catch (error) {
    return {
      status: "failed",
      messageText,
      error: error instanceof Error ? error.message : "Unknown Telegram relay error",
    };
  }
}
