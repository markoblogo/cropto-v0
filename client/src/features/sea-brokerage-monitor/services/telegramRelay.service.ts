import type { BrokerageEntry } from "../types";
import { formatEntryTimestampCompact, formatEntryVolumeCompact } from "./entryFormatting.service";

export interface TelegramRelayPublisher {
  publishEntryToTelegram(entry: BrokerageEntry): Promise<void>;
}

function formatTelegramPrice(entry: BrokerageEntry) {
  const resolvedPrice = entry.priceFrom ?? entry.priceTo;
  if (resolvedPrice === null) return "subject";
  return `@ ${resolvedPrice} ${entry.currency}`;
}

export function formatTelegramRelayMessage(entry: BrokerageEntry) {
  const header = entry.type === "bid" ? "=========== BID IDEA =========" : "=========== OFFER IDEA =======";
  const body = [
    formatEntryTimestampCompact(entry.createdAt),
    `${entry.brokerCode} (${entry.brokerName}) ${entry.commodityLabel.toUpperCase()} ${formatEntryVolumeCompact(entry.volumeFrom, entry.volumeTo)} ${entry.basis} ${entry.destinationPort} ${entry.periodLabel} ${formatTelegramPrice(entry)}`,
  ].join(" / ");

  return `${header}\n${body}`;
}

class PlaceholderTelegramRelayPublisher implements TelegramRelayPublisher {
  async publishEntryToTelegram(_entry: BrokerageEntry): Promise<void> {
    return Promise.resolve();
  }
}

const telegramRelayPublisher: TelegramRelayPublisher = new PlaceholderTelegramRelayPublisher();

export async function publishEntryToTelegram(entry: BrokerageEntry): Promise<void> {
  await telegramRelayPublisher.publishEntryToTelegram(entry);
}
