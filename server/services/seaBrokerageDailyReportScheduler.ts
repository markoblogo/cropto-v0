import type { SeaBrokerageEntryRow } from "@shared/schema";
import { storage } from "../storage";
import { sendSeaBrokerageTelegramInternalBroadcast } from "./seaBrokerageTelegramPublisher";
import { buildSeaBrokerageMarketUpdateMessage } from "./seaBrokerageMarketUpdateFormatter";

const DEFAULT_TIMEZONE = process.env.SEA_BROKERAGE_DAILY_REPORT_TIMEZONE || "Europe/Paris";
const DEFAULT_HOUR = Number(process.env.SEA_BROKERAGE_DAILY_REPORT_HOUR || "17");
const DEFAULT_MINUTE = Number(process.env.SEA_BROKERAGE_DAILY_REPORT_MINUTE || "0");
const LAST_SENT_KEY = "sea_brokerage_daily_report_last_sent_local_date";

let timer: NodeJS.Timeout | null = null;
let running = false;

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function getParisParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";

  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = Number(get("hour") || "0");
  const minute = Number(get("minute") || "0");
  const dateKey = `${year}-${month}-${day}`;
  const dateLabel = `${day}/${month}`;
  return { dateKey, dateLabel, hour, minute };
}

function isCreatedOnLocalDate(date: Date, dateKey: string, timeZone: string) {
  const local = getParisParts(date, timeZone);
  return local.dateKey === dateKey;
}

function buildDailyReportMessage(entries: SeaBrokerageEntryRow[], reportDateLabel: string) {
  void reportDateLabel;
  return buildSeaBrokerageMarketUpdateMessage(entries, new Date());
}

async function runDailyReportTick() {
  if (running) return;
  running = true;
  try {
    const enabled = parseBoolean(process.env.SEA_BROKERAGE_DAILY_REPORT_ENABLED, true);
    if (!enabled) return;

    const now = new Date();
    const local = getParisParts(now, DEFAULT_TIMEZONE);
    const afterTargetTime =
      local.hour > DEFAULT_HOUR || (local.hour === DEFAULT_HOUR && local.minute >= DEFAULT_MINUTE);
    if (!afterTargetTime) return;

    const lastSentSetting = await storage.getAppSetting(LAST_SENT_KEY);
    if (lastSentSetting?.value === local.dateKey) return;

    const allEntries = await storage.listSeaBrokerageEntries();
    const todayEntries = allEntries.filter((entry) =>
      isCreatedOnLocalDate(new Date(entry.createdAt), local.dateKey, DEFAULT_TIMEZONE),
    );
    const message = buildDailyReportMessage(todayEntries, local.dateLabel);
    const result = await sendSeaBrokerageTelegramInternalBroadcast(message);

    if (result.status === "published") {
      await storage.upsertAppSetting(LAST_SENT_KEY, local.dateKey);
      console.log(`[SeaBrokerageDailyReport] sent for ${local.dateKey}`);
      return;
    }

    console.error(`[SeaBrokerageDailyReport] failed for ${local.dateKey}: ${result.error || "unknown error"}`);
  } catch (error) {
    console.error(
      `[SeaBrokerageDailyReport] scheduler tick failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  } finally {
    running = false;
  }
}

export function startSeaBrokerageDailyReportScheduler() {
  if (timer) return;
  timer = setInterval(() => {
    void runDailyReportTick();
  }, 30_000);
  void runDailyReportTick();
  console.log(
    `[SeaBrokerageDailyReport] scheduler started (${DEFAULT_TIMEZONE} ${String(DEFAULT_HOUR).padStart(
      2,
      "0",
    )}:${String(DEFAULT_MINUTE).padStart(2, "0")})`,
  );
}
