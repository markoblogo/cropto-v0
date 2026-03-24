const MONITOR_TELEGRAM_USER_ID_STORAGE_KEY = "sea_brokerage_monitor.telegram_user_id";
const MONITOR_TELEGRAM_USERNAME_STORAGE_KEY = "sea_brokerage_monitor.telegram_username";

export interface MonitorTelegramIdentity {
  telegramUserId: string | null;
  telegramUsername: string | null;
}

function normalizeUserId(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeUsername(value: string | null | undefined) {
  const normalized = String(value || "").trim().replace(/^@+/, "");
  return normalized || null;
}

export function getStoredMonitorTelegramIdentity(): MonitorTelegramIdentity {
  if (typeof window === "undefined") {
    return { telegramUserId: null, telegramUsername: null };
  }

  return {
    telegramUserId: normalizeUserId(window.localStorage.getItem(MONITOR_TELEGRAM_USER_ID_STORAGE_KEY)),
    telegramUsername: normalizeUsername(
      window.localStorage.getItem(MONITOR_TELEGRAM_USERNAME_STORAGE_KEY),
    ),
  };
}

export function setStoredMonitorTelegramIdentity(identity: MonitorTelegramIdentity) {
  if (typeof window === "undefined") return;

  const telegramUserId = normalizeUserId(identity.telegramUserId);
  const telegramUsername = normalizeUsername(identity.telegramUsername);

  if (telegramUserId) {
    window.localStorage.setItem(MONITOR_TELEGRAM_USER_ID_STORAGE_KEY, telegramUserId);
  } else {
    window.localStorage.removeItem(MONITOR_TELEGRAM_USER_ID_STORAGE_KEY);
  }

  if (telegramUsername) {
    window.localStorage.setItem(MONITOR_TELEGRAM_USERNAME_STORAGE_KEY, telegramUsername);
  } else {
    window.localStorage.removeItem(MONITOR_TELEGRAM_USERNAME_STORAGE_KEY);
  }
}

export function buildSeaBrokerageTelegramHeaders(
  identity: MonitorTelegramIdentity | null | undefined,
): Record<string, string> {
  const headers: Record<string, string> = {};
  const telegramUserId = normalizeUserId(identity?.telegramUserId);
  const telegramUsername = normalizeUsername(identity?.telegramUsername);

  if (telegramUserId) {
    headers["x-sea-telegram-user-id"] = telegramUserId;
  }
  if (telegramUsername) {
    headers["x-sea-telegram-username"] = telegramUsername;
  }
  return headers;
}

