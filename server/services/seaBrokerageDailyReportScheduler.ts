import type { SeaBrokerageEntryRow } from "@shared/schema";
import { storage } from "../storage";
import {
  sendSeaBrokerageTelegramDirectMessage,
  sendSeaBrokerageTelegramInternalBroadcast,
} from "./seaBrokerageTelegramPublisher";
import {
  buildSeaBrokerageMarketUpdateMessage,
  buildSeaBrokerageMarketUpdateMessagesByGroup,
  type SeaBrokerageReportGroup,
} from "./seaBrokerageMarketUpdateFormatter";

const DEFAULT_TIMEZONE = process.env.SEA_BROKERAGE_DAILY_REPORT_TIMEZONE || "Europe/Paris";
const DEFAULT_HOUR = Number(process.env.SEA_BROKERAGE_DAILY_REPORT_HOUR || "17");
const DEFAULT_MINUTE = Number(process.env.SEA_BROKERAGE_DAILY_REPORT_MINUTE || "0");
const LAST_SENT_KEY = "sea_brokerage_daily_report_last_sent_local_date";
const REPORT_PROFILES_KEY = "sea_brokerage_report_profiles_v1";
const REPORT_PROFILES_AUTO_LAST_SENT_KEY = "sea_brokerage_report_profiles_auto_last_sent_v1";

let timer: NodeJS.Timeout | null = null;
let running = false;

type SeaBrokerageReportProfile = {
  id: string;
  brokerUserId: string;
  brokerCode: string;
  name: string;
  title: string;
  groups: SeaBrokerageReportGroup[];
  commodities: string[];
  basis: string[];
  deliveryPlaces: string[];
  postedWindowDays: number;
  includeBids: boolean;
  includeOffers: boolean;
  autoDaily: boolean;
  active: boolean;
  targetChat: string | null;
  createdAt: string;
  updatedAt: string;
};

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
  return { dateKey, hour, minute };
}

function isCreatedOnLocalDate(date: Date, dateKey: string, timeZone: string) {
  const local = getParisParts(date, timeZone);
  return local.dateKey === dateKey;
}

function parseProfiles(raw: string): SeaBrokerageReportProfile[] {
  try {
    const parsed = JSON.parse(raw) as SeaBrokerageReportProfile[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        item &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.brokerUserId === "string",
    );
  } catch {
    return [];
  }
}

function parseProfileLastSentMap(raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

function shouldIncludeEntryByProfile(entry: SeaBrokerageEntryRow, profile: SeaBrokerageReportProfile, now: Date) {
  if (entry.type !== "bid" && entry.type !== "offer") return false;
  if (entry.type === "bid" && !profile.includeBids) return false;
  if (entry.type === "offer" && !profile.includeOffers) return false;

  const createdAt = new Date(entry.createdAt);
  if (Number.isNaN(createdAt.getTime())) return false;
  const windowDays = Math.max(1, Number(profile.postedWindowDays || 1));
  const fromMs = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  if (createdAt.getTime() < fromMs) return false;

  if (profile.commodities.length) {
    const commodity = String(entry.commodity || "").toLowerCase();
    if (!profile.commodities.some((value) => value.toLowerCase() === commodity)) return false;
  }
  if (profile.basis.length) {
    const basis = String(entry.basis || "").toUpperCase();
    if (!profile.basis.some((value) => value.toUpperCase() === basis)) return false;
  }
  if (profile.deliveryPlaces.length) {
    const destinationCode = String(entry.destinationPortCode || "").toLowerCase();
    const destination = String(entry.destinationPort || "").toLowerCase();
    const matchedPlace = profile.deliveryPlaces.some((value) => {
      const normalized = String(value || "").toLowerCase();
      return normalized && (normalized === destinationCode || normalized === destination);
    });
    if (!matchedPlace) return false;
  }

  return true;
}

async function sendDailyGroupReports(entries: SeaBrokerageEntryRow[]) {
  const grouped = buildSeaBrokerageMarketUpdateMessagesByGroup(entries, new Date());
  for (const groupReport of grouped) {
    const result = await sendSeaBrokerageTelegramInternalBroadcast(groupReport.message);
    if (result.status !== "published") {
      return { ok: false as const, error: result.error || `Failed to send ${groupReport.group}` };
    }
  }
  return { ok: true as const };
}

async function runAutoProfileReports(now: Date, localDateKey: string, entries: SeaBrokerageEntryRow[]) {
  const profilesRaw = (await storage.getAppSetting(REPORT_PROFILES_KEY))?.value || "[]";
  const allProfiles = parseProfiles(profilesRaw);
  if (!allProfiles.length) return;

  const lastSentRaw = (await storage.getAppSetting(REPORT_PROFILES_AUTO_LAST_SENT_KEY))?.value || "{}";
  const lastSentMap = parseProfileLastSentMap(lastSentRaw);
  let changed = false;

  for (const profile of allProfiles) {
    if (!profile.autoDaily || !profile.active) continue;
    if (!profile.targetChat) continue;
    if (lastSentMap[profile.id] === localDateKey) continue;

    const matched = entries.filter((entry) => shouldIncludeEntryByProfile(entry, profile, now));
    const message = buildSeaBrokerageMarketUpdateMessage(matched, now, {
      groups: profile.groups?.length ? profile.groups : undefined,
      title: profile.title || `🇺🇦 SPIKE BROKERS Market Update — ${profile.name}`,
    });
    const dm = await sendSeaBrokerageTelegramDirectMessage(profile.targetChat, message);
    if (!dm.ok) {
      console.error(`[SeaBrokerageDailyReport] auto profile ${profile.id} failed: ${dm.error}`);
      continue;
    }
    lastSentMap[profile.id] = localDateKey;
    changed = true;
  }

  if (changed) {
    await storage.upsertAppSetting(REPORT_PROFILES_AUTO_LAST_SENT_KEY, JSON.stringify(lastSentMap));
  }
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
    const groupedResult = await sendDailyGroupReports(todayEntries);
    if (!groupedResult.ok) {
      console.error(`[SeaBrokerageDailyReport] failed for ${local.dateKey}: ${groupedResult.error}`);
      return;
    }

    await runAutoProfileReports(now, local.dateKey, allEntries);
    await storage.upsertAppSetting(LAST_SENT_KEY, local.dateKey);
    console.log(`[SeaBrokerageDailyReport] sent for ${local.dateKey}`);
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
