import { storage } from "../storage";
import {
  isSeaBrokerageSheetsSyncEnabled,
  syncSeaBrokerageMonitorDayToSheets,
} from "./seaBrokerageSheetsSync";

const DEFAULT_TIMEZONE = process.env.SEA_BROKERAGE_SHEETS_SYNC_TIMEZONE || "Europe/Paris";
const DEFAULT_HOUR = Number(process.env.SEA_BROKERAGE_SHEETS_SYNC_HOUR || "20");
const DEFAULT_MINUTE = Number(process.env.SEA_BROKERAGE_SHEETS_SYNC_MINUTE || "0");
const LAST_SYNC_KEY = "sea_brokerage_sheets_sync_last_local_date";

let timer: NodeJS.Timeout | null = null;
let running = false;

function getLocalParts(now: Date, timeZone: string) {
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

  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour") || "0"),
    minute: Number(get("minute") || "0"),
  };
}

async function runSheetsSyncTick() {
  if (running) return;
  running = true;
  try {
    if (!isSeaBrokerageSheetsSyncEnabled()) return;

    const now = new Date();
    const local = getLocalParts(now, DEFAULT_TIMEZONE);
    const afterTargetTime =
      local.hour > DEFAULT_HOUR || (local.hour === DEFAULT_HOUR && local.minute >= DEFAULT_MINUTE);
    if (!afterTargetTime) return;

    const lastRun = await storage.getAppSetting(LAST_SYNC_KEY);
    if (lastRun?.value === local.dateKey) return;

    const result = await syncSeaBrokerageMonitorDayToSheets(now);
    if (!result.ok) {
      console.error(
        `[SeaBrokerageSheetsSync] failed for ${local.dateKey}: ${result.errors.join(" | ") || "unknown error"}`,
      );
      return;
    }

    await storage.upsertAppSetting(LAST_SYNC_KEY, local.dateKey);
    console.log(
      `[SeaBrokerageSheetsSync] synced for ${local.dateKey} entries=${result.syncedEntries} dictionaries=${result.dictionariesUpdated}`,
    );
  } catch (error: any) {
    console.error(
      `[SeaBrokerageSheetsSync] scheduler tick failed: ${error?.message || "unknown error"}`,
    );
  } finally {
    running = false;
  }
}

export function startSeaBrokerageSheetsSyncScheduler() {
  if (timer) return;
  timer = setInterval(() => {
    void runSheetsSyncTick();
  }, 30_000);
  void runSheetsSyncTick();
  console.log(
    `[SeaBrokerageSheetsSync] scheduler started (${DEFAULT_TIMEZONE} ${String(DEFAULT_HOUR).padStart(
      2,
      "0",
    )}:${String(DEFAULT_MINUTE).padStart(2, "0")})`,
  );
}

export async function runSeaBrokerageSheetsSyncNow() {
  const result = await syncSeaBrokerageMonitorDayToSheets(new Date());
  if (result.ok) {
    await storage.upsertAppSetting(LAST_SYNC_KEY, result.dateKey);
  }
  return result;
}
