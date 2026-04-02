import type { SeaBrokerageEntryRow } from "@shared/schema";
import { storage } from "../storage";
import { sendSeaBrokerageTelegramInternalBroadcast } from "./seaBrokerageTelegramPublisher";
import { formatSeaBrokerageBasisRoute } from "./seaBrokerageBasisFormat";

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

function normalizeCommodityLabel(entry: SeaBrokerageEntryRow) {
  return String(entry.commodityLabel || entry.commodity || "").trim().toUpperCase();
}

function commodityEmoji(entry: SeaBrokerageEntryRow) {
  const code = String(entry.commodity || "").toLowerCase();
  if (code === "corn") return "🌽";
  if (code === "wheat" || code === "barley") return "🌾";
  if (code === "sunflower") return "🌻";
  if (code === "soybean" || code === "soybeans" || code === "rapeseed") return "🌱";
  return "•";
}

function toUpper(value: unknown) {
  return String(value || "").trim().toUpperCase();
}

function transportShort(entry: SeaBrokerageEntryRow) {
  const transport = String(entry.transportType || "").toLowerCase();
  if (["vessel", "handysize", "coaster"].includes(transport)) return "VSL";
  if (transport === "rail") return "RAIL";
  if (transport === "truck") return "TRUCK";
  return toUpper(entry.transportType);
}

function priceValue(entry: SeaBrokerageEntryRow): number | null {
  const direct = Number(entry.price);
  if (Number.isFinite(direct)) return direct;
  const from = Number(entry.priceFrom);
  if (Number.isFinite(from)) return from;
  const to = Number(entry.priceTo);
  if (Number.isFinite(to)) return to;
  return null;
}

function priceRange(entries: SeaBrokerageEntryRow[]) {
  const prices = entries.map(priceValue).filter((value): value is number => typeof value === "number");
  if (!prices.length) return "N/A";
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const format = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
  return min === max ? `${format(min)}$` : `${format(min)}$-${format(max)}$`;
}

function quantityRangeK(entries: SeaBrokerageEntryRow[]) {
  const values = entries
    .flatMap((entry) => [Number(entry.volumeFrom), Number(entry.volumeTo), Number(entry.quantityMt)])
    .filter((value) => Number.isFinite(value) && value > 0);
  if (!values.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const minK = Math.round(min / 1000);
  const maxK = Math.round(max / 1000);
  return minK === maxK ? `${minK}k` : `${minK}-${maxK}k`;
}

function periodSummary(entries: SeaBrokerageEntryRow[]) {
  const labels = Array.from(
    new Set(entries.map((entry) => toUpper(entry.periodLabel)).filter(Boolean)),
  );
  return labels.slice(0, 2).join(" / ");
}

function buildDailyReportMessage(entries: SeaBrokerageEntryRow[], reportDateLabel: string) {
  const target = entries.filter((entry) => entry.type === "bid" || entry.type === "offer");
  if (!target.length) {
    return [
      `SPIKE BROKERS daily update ${reportDateLabel}`,
      "-----------------------------",
      "No BID/OFFER entries for selected day.",
      "-----------------------------",
    ].join("\n");
  }

  const byCommodity = new Map<string, SeaBrokerageEntryRow[]>();
  for (const entry of target) {
    const commodityLabel = normalizeCommodityLabel(entry);
    const cropKey = entry.isNewCrop ? "NEW" : "STD";
    const key = `${commodityLabel}|${cropKey}`;
    const bucket = byCommodity.get(key) || [];
    bucket.push(entry);
    byCommodity.set(key, bucket);
  }

  const lines: string[] = [];
  lines.push(`SPIKE BROKERS daily update ${reportDateLabel}`);
  lines.push("-----------------------------");

  for (const [commodityKey, commodityEntries] of Array.from(byCommodity.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const [commodity, cropKey] = commodityKey.split("|");
    const commodityTitle = cropKey === "NEW" ? `${commodity} (NEW CROP)` : commodity;
    lines.push(`${commodityEmoji(commodityEntries[0])}${commodityTitle}`);

    const byRoute = new Map<string, SeaBrokerageEntryRow[]>();
    for (const entry of commodityEntries) {
      const route = formatSeaBrokerageBasisRoute(entry, { uppercase: true, countryMode: "alpha2" });
      const key = `${route}|${transportShort(entry)}`;
      const bucket = byRoute.get(key) || [];
      bucket.push(entry);
      byRoute.set(key, bucket);
    }

    for (const [routeKey, routeEntries] of Array.from(byRoute.entries()).sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      const [route, transport] = routeKey.split("|");
      const qty = quantityRangeK(routeEntries);
      const heading = [route, qty, transport].filter(Boolean).join(" ");
      lines.push(`${heading}:`);

      const sellers = routeEntries.filter((entry) => entry.type === "offer");
      const buyers = routeEntries.filter((entry) => entry.type === "bid");

      if (sellers.length) {
        lines.push(`> Sellers ${priceRange(sellers)} ${periodSummary(sellers)}`.trim());
      }
      if (buyers.length) {
        lines.push(`> Buyers ${priceRange(buyers)} ${periodSummary(buyers)}`.trim());
      }
      lines.push("");
    }

    lines.push("-----------------------------");
  }

  return lines.join("\n");
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
