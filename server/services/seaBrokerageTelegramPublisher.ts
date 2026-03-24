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
    return `${Number.isInteger(compact) ? compact : compact.toFixed(2)}$`;
  }

  if (from !== null && from !== undefined && to !== null && to !== undefined && from !== to) {
    const fromCompact = Number(from);
    const toCompact = Number(to);
    const left = Number.isInteger(fromCompact) ? `${fromCompact}` : fromCompact.toFixed(2);
    const right = Number.isInteger(toCompact) ? `${toCompact}` : toCompact.toFixed(2);
    return `${left}$ | ${right}$`;
  }

  const resolvedPrice = from ?? to;
  if (resolvedPrice === null || resolvedPrice === undefined) {
    return "SUBJECT";
  }

  const compact = Number(resolvedPrice);
  return `${Number.isInteger(compact) ? compact : compact.toFixed(2)}$`;
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
  if (entry.periodStart && entry.periodEnd) {
    return `${formatDateDottedShort(entry.periodStart)}-${formatDateDottedShort(entry.periodEnd)}`;
  }
  return entry.periodLabel.toUpperCase();
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
  return entry.sellerName?.trim() || null;
}

function formatTelegramHeader(entry: SeaBrokerageEntryRow, brokerLabel: string) {
  const ideaTag = entry.type === "bid" ? "#bid_idea" : "#offer_idea";
  const flag = countryFlagEmoji(entry.originCountryCode || entry.destinationCountryCode);
  return [ideaTag, flag, brokerLabel].filter(Boolean).join(" ");
}

function formatQuantityLine(entry: SeaBrokerageEntryRow) {
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

  const lines = [
    header,
    "------------------------------",
    formatTelegramTransportCode(entry),
    `${formatTelegramCommodity(entry)}, ${countryCode}`,
    formatQuantityLine(entry),
    `${entry.basis.toUpperCase()} ${entry.destinationPort.toUpperCase()}, ${countryCode}`,
    formatTelegramPeriod(entry),
    formatTelegramPrice(entry),
    entry.paymentTerms?.trim() ? entry.paymentTerms.trim().toUpperCase() : null,
    "------------------------------",
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
  const internalMessage = formatStandardTelegramMessage(entry, brokerSignature, true);
  const externalMessage = formatStandardTelegramMessage(entry, brokerSignature, false);
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
