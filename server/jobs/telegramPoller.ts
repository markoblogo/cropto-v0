import { db } from "../db.js";
import { indexPrices } from "../../shared/schema.js";
import { parseIndexMessage } from "../services/telegramParser.js";
import { eq } from "drizzle-orm";
import { isDirectEntrypoint } from "../utils/moduleEntrypoint.js";

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: {
      id: number;
      username?: string;
    };
    text?: string;
    date: number;
  };
  channel_post?: {
    message_id: number;
    chat: {
      id: number;
      username?: string;
    };
    text?: string;
    date: number;
  };
}

interface PollerState {
  lastOffset: number;
}

let pollerState: PollerState = {
  lastOffset: 0,
};

const TELEGRAM_API_BASE = "https://api.telegram.org/bot";
const POLL_INTERVAL = parseInt(process.env.TELEGRAM_POLL_INTERVAL || "120") * 1000;
const TARGET_CHANNEL = process.env.TELEGRAM_CHANNEL_USERNAME || "@spike_brokers";

export async function fetchTelegramUpdates(
  botToken: string,
  offset: number
): Promise<TelegramUpdate[]> {
  const url = `${TELEGRAM_API_BASE}${botToken}/getUpdates?offset=${offset}&timeout=30`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (!data.ok) {
      throw new Error(`Telegram API error: ${data.description || "Unknown error"}`);
    }

    return data.result || [];
  } catch (error) {
    console.error("[TelegramPoller] Fetch error:", error);
    return [];
  }
}

export async function processUpdate(update: TelegramUpdate): Promise<boolean> {
  try {
    const message = update.message || update.channel_post;
    if (!message || !message.text) {
      return false;
    }

    const chatUsername = message.chat.username ? `@${message.chat.username}` : undefined;

    if (chatUsername && chatUsername !== TARGET_CHANNEL) {
      console.log(`[TelegramPoller] Skipping message from ${chatUsername} (not ${TARGET_CHANNEL})`);
      return false;
    }

    const messageId = `${message.chat.id}_${message.message_id}`;
    const existing = await db
      .select()
      .from(indexPrices)
      .where(eq(indexPrices.messageId, messageId))
      .limit(1);

    if (existing.length > 0) {
      console.log(`[TelegramPoller] Skipping duplicate message: ${messageId}`);
      return false;
    }

    const parseResult = parseIndexMessage(message.text);

    if (!parseResult.success) {
      console.log(`[TelegramPoller] Skipped unparseable message: ${parseResult.error}`);
      return false;
    }

    const { commodity, price, location, change } = parseResult.data!;

    const meta = JSON.stringify({
      location,
      change,
      chatUsername,
      updateId: update.update_id,
    });

    const [indexPrice] = await db
      .insert(indexPrices)
      .values({
        commodity: commodity.toUpperCase(),
        price: price.toFixed(8),
        date: new Date(message.date * 1000),
        source: chatUsername || 'telegram-poller',
        raw: message.text,
        meta,
        messageId,
      })
      .returning();

    console.log(
      `[TelegramPoller] ✅ Saved index: ${commodity} = $${price} from ${chatUsername || 'telegram'}`
    );

    return true;
  } catch (error) {
    console.error("[TelegramPoller] Process error:", error);
    return false;
  }
}

export async function pollOnce(): Promise<number> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    console.warn("[TelegramPoller] TELEGRAM_BOT_TOKEN not configured. Skipping poll.");
    return 0;
  }

  console.log(`[TelegramPoller] Polling with offset ${pollerState.lastOffset}...`);

  const updates = await fetchTelegramUpdates(botToken, pollerState.lastOffset);

  if (updates.length === 0) {
    console.log("[TelegramPoller] No new updates.");
    return 0;
  }

  console.log(`[TelegramPoller] Received ${updates.length} updates`);

  let processedCount = 0;

  for (const update of updates) {
    const processed = await processUpdate(update);
    if (processed) {
      processedCount++;
    }

    pollerState.lastOffset = update.update_id + 1;
  }

  console.log(`[TelegramPoller] Processed ${processedCount}/${updates.length} updates`);

  return processedCount;
}

export async function startPoller(): Promise<void> {
  console.log(`[TelegramPoller] Starting with ${POLL_INTERVAL / 1000}s interval, targeting ${TARGET_CHANNEL}`);

  setInterval(async () => {
    try {
      await pollOnce();
    } catch (error) {
      console.error("[TelegramPoller] Error in polling cycle:", error);
    }
  }, POLL_INTERVAL);

  await pollOnce();
}

if (isDirectEntrypoint(import.meta.url, process.argv[1], ["telegramPoller"])) {
  const args = process.argv.slice(2);
  const isOnce = args.includes('--once');
  const isTest = args.includes('--test');

  if (isTest) {
    console.log("[TelegramPoller] Test mode - running single poll");
  }

  if (isOnce || isTest) {
    pollOnce()
      .then((count) => {
        console.log(`[TelegramPoller] Test complete: ${count} messages processed`);
        process.exit(0);
      })
      .catch((error) => {
        console.error("[TelegramPoller] Test failed:", error);
        process.exit(1);
      });
  } else {
    startPoller().catch((error) => {
      console.error("[TelegramPoller] Failed to start:", error);
      process.exit(1);
    });
  }
}
