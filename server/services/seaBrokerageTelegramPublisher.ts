import type { SeaBrokerageEntryRow } from "@shared/schema";

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

function formatTelegramHeader(entry: SeaBrokerageEntryRow, brokerLabel: string) {
  const ideaTag = entry.type === "bid" ? "#bid_idea" : "#offer_idea";
  const flag = countryFlagEmoji(entry.originCountryCode || entry.destinationCountryCode);
  return [ideaTag, flag, brokerLabel].filter(Boolean).join(" ");
}

function formatInternalTelegramMessage(entry: SeaBrokerageEntryRow, brokerSignature?: string | null) {
  const header = formatTelegramHeader(
    entry,
    brokerSignature || entry.companyName || entry.brokerName || entry.brokerCode,
  );
  const counterparty = formatTelegramCounterparty(entry);
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
    formatTelegramTransport(entry),
    termsLine,
    counterpartyLine,
    `${formatTelegramPeriod(entry)} ${formatTelegramPrice(entry)}`,
  ];

  if (entry.note?.trim()) {
    lines.push(entry.note.trim());
  }

  return lines.filter(Boolean).join("\n");
}

function formatExternalTelegramMessage(entry: SeaBrokerageEntryRow) {
  const lines = [
    formatTelegramHeader(entry, "BROKER DESK"),
    "------------------------------",
    formatTelegramCommodity(entry),
    `${entry.basis} ${entry.destinationPort}, ${entry.destinationCountry}`,
    `${formatTelegramPeriod(entry)} ${formatTelegramPrice(entry)}`,
  ];
  return lines.filter(Boolean).join("\n");
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

export async function publishSeaBrokerageEntryToTelegram(
  entry: SeaBrokerageEntryRow,
  context?: PublishContext,
): Promise<TelegramPublishResult> {
  const brokerSignature = context?.brokerTelegramUsername
    ? `@${context.brokerTelegramUsername.replace(/^@+/, "")}`
    : entry.brokerTelegramUsername
      ? `@${entry.brokerTelegramUsername.replace(/^@+/, "")}`
      : null;
  const internalMessage = formatInternalTelegramMessage(entry, brokerSignature);
  const externalMessage = formatExternalTelegramMessage(entry);
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const targets = resolveSeaBrokerageRelayTargets(entry);

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

  try {
    for (const target of targets) {
      const text = target.channel === "internal" ? internalMessage : externalMessage;
      const response = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: target.chatId,
          text,
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
          messageText: `internal:\n${internalMessage}\n\nexternal:\n${externalMessage}`,
          error:
            payload.description ||
            `Telegram sendMessage failed (${target.channel}) with status ${response.status}`,
        };
      }

      if (!firstMessageId && payload.result?.message_id) {
        firstMessageId = String(payload.result.message_id);
      }
      sentChannels.push(`${target.channel}:${target.chatId}`);
    }

    return {
      status: "published",
      messageId: firstMessageId,
      messageText: `internal:\n${internalMessage}\n\nexternal:\n${externalMessage}\n\nsent:${sentChannels.join(",")}`,
    };
  } catch (error) {
    return {
      status: "failed",
      messageText: `internal:\n${internalMessage}\n\nexternal:\n${externalMessage}`,
      error: error instanceof Error ? error.message : "Unknown Telegram relay error",
    };
  }
}

