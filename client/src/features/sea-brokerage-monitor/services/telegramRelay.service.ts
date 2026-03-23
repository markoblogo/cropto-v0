import type { BrokerageEntry } from "../types";
import { buildCanonicalView } from "./entryFormatting.service";

export interface TelegramRelayPublisher {
  publishEntryToTelegram(entry: BrokerageEntry): Promise<void>;
}

export function formatTelegramRelayMessage(entry: BrokerageEntry) {
  const header = entry.type === "bid" ? "=========== BID IDEA =========" : "=========== OFFER IDEA =======";
  const body = entry.canonicalView || buildCanonicalView(entry);

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
