const MONITOR_AUTH_TOKEN_STORAGE_KEY = "sea_brokerage_monitor.auth_token";
const MONITOR_AUTH_CHANGED_EVENT = "sea-brokerage:monitor-auth-changed";

export type TelegramWidgetUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

export type MonitorTelegramIdentity = {
  telegramUserId: string | null;
  telegramUsername: string | null;
};

export function getSeaBrokerageMonitorToken() {
  if (typeof window === "undefined") return null;
  const token = window.localStorage.getItem(MONITOR_AUTH_TOKEN_STORAGE_KEY);
  return token?.trim() || null;
}

export function setSeaBrokerageMonitorToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (!token) {
    window.localStorage.removeItem(MONITOR_AUTH_TOKEN_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(MONITOR_AUTH_CHANGED_EVENT));
    return;
  }
  window.localStorage.setItem(MONITOR_AUTH_TOKEN_STORAGE_KEY, token);
  window.dispatchEvent(new CustomEvent(MONITOR_AUTH_CHANGED_EVENT));
}

export function clearSeaBrokerageMonitorToken() {
  setSeaBrokerageMonitorToken(null);
}

export function buildSeaBrokerageMonitorAuthHeaders(token: string | null | undefined) {
  if (!token) return {} as Record<string, string>;
  return { Authorization: `Bearer ${token}` };
}

export function getSeaBrokerageMonitorAuthChangedEventName() {
  return MONITOR_AUTH_CHANGED_EVENT;
}

export function getSeaBrokerageMonitorHandleFromToken(token: string | null | undefined) {
  if (!token) return null;
  try {
    const payloadBase64 = token.split(".")[1];
    if (!payloadBase64) return null;
    const payloadJson = atob(payloadBase64.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(payloadJson) as {
      telegramUsername?: string | null;
      telegramUserId?: string | null;
    };
    if (payload.telegramUsername) {
      return `@${String(payload.telegramUsername).replace(/^@+/, "")}`;
    }
    if (payload.telegramUserId) {
      return `tg:${payload.telegramUserId}`;
    }
    return null;
  } catch {
    return null;
  }
}

export async function signInSeaBrokerageMonitorWithTelegram(user: TelegramWidgetUser) {
  const response = await fetch("/api/sea-brokerage-monitor/auth/telegram/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(user),
  });

  if (!response.ok) {
    const text = (await response.text()) || "Telegram login failed";
    throw new Error(text);
  }

  return response.json() as Promise<{
    token: string;
    authorized: boolean;
    profile: {
      telegramUserId: string | null;
      telegramUsername: string | null;
      brokerCode: string;
      brokerName: string;
      companyName: string;
      isActive: boolean;
      source: "db" | "env";
    };
  }>;
}
