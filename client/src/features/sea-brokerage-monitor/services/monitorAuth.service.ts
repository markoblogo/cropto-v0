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

const TELEGRAM_LOGIN_URL_FIELDS = [
  "id",
  "first_name",
  "last_name",
  "username",
  "photo_url",
  "auth_date",
  "hash",
] as const;

function normalizeTelegramWidgetUser(raw: Record<string, string | number | undefined | null>) {
  const id = Number(raw.id);
  const authDate = Number(raw.auth_date);
  const hash = String(raw.hash || "").trim();
  if (!Number.isFinite(id) || !Number.isFinite(authDate) || !hash) {
    return null;
  }

  const user: TelegramWidgetUser = {
    id,
    first_name: raw.first_name ? String(raw.first_name) : undefined,
    last_name: raw.last_name ? String(raw.last_name) : undefined,
    username: raw.username ? String(raw.username) : undefined,
    photo_url: raw.photo_url ? String(raw.photo_url) : undefined,
    auth_date: authDate,
    hash,
  };
  return user;
}

function readTelegramWidgetUserFromHash(hashValue: string) {
  const rawHash = String(hashValue || "").replace(/^#+/, "").trim();
  if (!rawHash) return null;

  const params = new URLSearchParams(rawHash);
  const tgAuthResult = params.get("tgAuthResult");
  if (tgAuthResult) {
    try {
      const decoded = decodeURIComponent(tgAuthResult);
      const parsed = JSON.parse(decoded) as Record<string, string | number | undefined | null>;
      return normalizeTelegramWidgetUser(parsed);
    } catch {
      // no-op, try plain hash params below
    }
  }

  const raw: Record<string, string | number | undefined | null> = {
    id: params.get("id"),
    first_name: params.get("first_name"),
    last_name: params.get("last_name"),
    username: params.get("username"),
    photo_url: params.get("photo_url"),
    auth_date: params.get("auth_date"),
    hash: params.get("hash"),
  };
  return normalizeTelegramWidgetUser(raw);
}

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

export function consumeTelegramWidgetUserFromUrl(): TelegramWidgetUser | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const params = url.searchParams;
  const queryUser = normalizeTelegramWidgetUser({
    id: params.get("id"),
    first_name: params.get("first_name"),
    last_name: params.get("last_name"),
    username: params.get("username"),
    photo_url: params.get("photo_url"),
    auth_date: params.get("auth_date"),
    hash: params.get("hash"),
  });
  const hashUser = readTelegramWidgetUserFromHash(url.hash);
  const user = queryUser || hashUser;

  if (!user) return null;

  let cleaned = false;
  for (const key of TELEGRAM_LOGIN_URL_FIELDS) {
    if (params.has(key)) {
      params.delete(key);
      cleaned = true;
    }
  }
  if (url.hash) {
    const hashParams = new URLSearchParams(url.hash.replace(/^#+/, ""));
    const hasTelegramHashPayload =
      hashParams.has("id") ||
      hashParams.has("auth_date") ||
      hashParams.has("hash") ||
      hashParams.has("tgAuthResult");
    if (hasTelegramHashPayload) {
      url.hash = "";
      cleaned = true;
    }
  }

  if (cleaned) {
    const nextUrl = `${url.pathname}${params.toString() ? `?${params.toString()}` : ""}${url.hash}`;
    window.history.replaceState({}, document.title, nextUrl);
  }

  return user;
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
      authUserId: string | null;
      authEmail: string | null;
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

export async function signInSeaBrokerageMonitorWithTelegramMiniApp(initData: string) {
  const response = await fetch("/api/sea-brokerage-monitor/auth/telegram/miniapp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ initData }),
  });

  if (!response.ok) {
    const text = (await response.text()) || "Telegram Mini App login failed";
    throw new Error(text);
  }

  return response.json() as Promise<{
    token: string;
    authorized: boolean;
    profile: {
      authUserId: string | null;
      authEmail: string | null;
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

export async function requestSeaBrokerageTelegramLoginCode(telegramUsername: string) {
  const response = await fetch("/api/sea-brokerage-monitor/auth/telegram/code/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ telegramUsername }),
  });

  if (!response.ok) {
    const text = (await response.text()) || "Telegram login code request failed";
    throw new Error(text);
  }
}

export async function verifySeaBrokerageTelegramLoginCode(
  telegramUsername: string,
  code: string,
) {
  const response = await fetch("/api/sea-brokerage-monitor/auth/telegram/code/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ telegramUsername, code }),
  });

  if (!response.ok) {
    const text = (await response.text()) || "Telegram login code verification failed";
    throw new Error(text);
  }

  return response.json() as Promise<{
    token: string;
    authorized: boolean;
    profile: {
      authUserId: string | null;
      authEmail: string | null;
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
