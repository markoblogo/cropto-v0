#!/usr/bin/env tsx
import * as dotenv from "dotenv";

dotenv.config();

type SmokeChannel = "internal" | "external";

function parseArgs() {
  const args = process.argv.slice(2);
  const result: { channel: SmokeChannel; chatId?: string; text?: string } = {
    channel: "internal",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--channel" && args[index + 1]) {
      const next = args[index + 1].trim().toLowerCase();
      if (next === "internal" || next === "external") {
        result.channel = next;
      }
      index += 1;
      continue;
    }
    if (arg === "--chat-id" && args[index + 1]) {
      result.chatId = args[index + 1].trim();
      index += 1;
      continue;
    }
    if (arg === "--text" && args[index + 1]) {
      result.text = args[index + 1];
      index += 1;
      continue;
    }
  }

  return result;
}

function resolveDefaultChatId(channel: SmokeChannel) {
  if (channel === "internal") {
    return (
      process.env.SEA_BROKERAGE_TELEGRAM_INTERNAL_CHAT_ID ||
      process.env.SEA_BROKERAGE_TELEGRAM_CHAT_ID ||
      ""
    ).trim();
  }
  return (process.env.SEA_BROKERAGE_TELEGRAM_EXTERNAL_CHAT_ID || "").trim();
}

function buildDefaultText(channel: SmokeChannel) {
  const now = new Date();
  const iso = now.toISOString();
  if (channel === "internal") {
    return [
      "#system_check",
      "------------------------------",
      "Sea Brokerage Monitor internal relay smoke",
      `Timestamp: ${iso}`,
      "If you see this message, bot posting is active.",
    ].join("\n");
  }
  return [
    "#system_check",
    "------------------------------",
    "Sea Brokerage Monitor external relay smoke",
    `Timestamp: ${iso}`,
    "If you see this message, external relay target is active.",
  ].join("\n");
}

async function main() {
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured.");
  }

  const { channel, chatId: cliChatId, text: cliText } = parseArgs();
  const chatId = (cliChatId || resolveDefaultChatId(channel)).trim();
  if (!chatId) {
    throw new Error(
      `No chat id provided. Set --chat-id or configure SEA_BROKERAGE_TELEGRAM_${channel.toUpperCase()}_CHAT_ID.`,
    );
  }

  const text = cliText || buildDefaultText(channel);
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const response = await fetch(url, {
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
    result?: { message_id?: number };
  };

  if (!response.ok || !payload.ok) {
    throw new Error(payload.description || `Telegram sendMessage failed with status ${response.status}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        channel,
        chatId,
        messageId: payload.result?.message_id ?? null,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("[sea_brokerage_telegram_smoke] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});

