import { storage } from "../storage";
import type { SeaBrokerageBrokerAuthRow } from "@shared/schema";

export type SeaBrokerageAuthUser = {
  id: string;
  email?: string | null;
  role?: string | null;
};

export type SeaBrokerageTelegramIdentity = {
  telegramUserId?: string | null;
  telegramUsername?: string | null;
};

export type AuthorizedSeaBrokerageBroker = {
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

type EnvAllowlistEntry = {
  authUserId?: string;
  authEmail?: string;
  telegramUserId?: string;
  telegramUsername?: string;
  brokerCode: string;
  brokerName: string;
  companyName: string;
  isActive?: boolean;
};

const ENV_ALLOWLIST_KEY = "SEA_BROKERAGE_BROKER_ALLOWLIST_JSON";

function normalizeEmail(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || null;
}

function normalizeId(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeTelegramUsername(value: string | null | undefined) {
  const normalized = String(value || "").trim().replace(/^@+/, "").toLowerCase();
  return normalized || null;
}

function normalizeDbBroker(row: SeaBrokerageBrokerAuthRow): AuthorizedSeaBrokerageBroker {
  return {
    authUserId: normalizeId(row.authUserId),
    authEmail: normalizeEmail(row.authEmail),
    telegramUserId: normalizeId(row.telegramUserId),
    telegramUsername: normalizeTelegramUsername(row.telegramUsername),
    brokerCode: row.brokerCode,
    brokerName: row.brokerName,
    companyName: row.companyName,
    isActive: row.isActive,
    source: "db",
  };
}

function parseEnvAllowlist(): AuthorizedSeaBrokerageBroker[] {
  const raw = String(process.env[ENV_ALLOWLIST_KEY] || "").trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as EnvAllowlistEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry) => entry && entry.brokerCode && entry.brokerName && entry.companyName)
      .map((entry) => ({
        authUserId: normalizeId(entry.authUserId),
        authEmail: normalizeEmail(entry.authEmail),
        telegramUserId: normalizeId(entry.telegramUserId),
        telegramUsername: normalizeTelegramUsername(entry.telegramUsername),
        brokerCode: entry.brokerCode,
        brokerName: entry.brokerName,
        companyName: entry.companyName,
        isActive: entry.isActive ?? true,
        source: "env" as const,
      }));
  } catch (error) {
    console.error("[SeaBrokerageAuth] Failed to parse env allowlist JSON:", error);
    return [];
  }
}

function matchAllowlistEntry(
  entry: AuthorizedSeaBrokerageBroker,
  userId: string | null,
  email: string | null,
) {
  if (!entry.isActive) return false;
  if (userId && entry.authUserId && entry.authUserId === userId) return true;
  if (email && entry.authEmail && entry.authEmail === email) return true;
  return false;
}

function matchAllowlistByTelegram(
  entry: AuthorizedSeaBrokerageBroker,
  telegramUserId: string | null,
  telegramUsername: string | null,
) {
  if (!entry.isActive) return false;
  if (telegramUserId && entry.telegramUserId && entry.telegramUserId === telegramUserId) return true;
  if (telegramUsername && entry.telegramUsername && entry.telegramUsername === telegramUsername) return true;
  return false;
}

export async function resolveAuthorizedSeaBrokerageBroker(
  user: SeaBrokerageAuthUser | null | undefined,
): Promise<AuthorizedSeaBrokerageBroker | null> {
  if (!user?.id) return null;

  const userId = normalizeId(user.id);
  const email = normalizeEmail(user.email);

  if (!userId) return null;

  const byUserId = await storage.findSeaBrokerageBrokerAuthByAuthUserId(userId);
  if (byUserId?.isActive) {
    return normalizeDbBroker(byUserId);
  }

  if (email) {
    const byEmail = await storage.findSeaBrokerageBrokerAuthByAuthEmail(email);
    if (byEmail?.isActive) {
      return normalizeDbBroker(byEmail);
    }
  }

  const envAllowlist = parseEnvAllowlist();
  const matchedEnv = envAllowlist.find((entry) => matchAllowlistEntry(entry, userId, email));
  return matchedEnv || null;
}

export async function resolveAuthorizedSeaBrokerageBrokerByTelegram(
  identity: SeaBrokerageTelegramIdentity | null | undefined,
): Promise<AuthorizedSeaBrokerageBroker | null> {
  const telegramUserId = normalizeId(identity?.telegramUserId);
  const telegramUsername = normalizeTelegramUsername(identity?.telegramUsername);

  if (!telegramUserId && !telegramUsername) {
    return null;
  }

  if (telegramUserId) {
    const [byTelegramId] = await storage
      .listSeaBrokerageBrokerAuth()
      .then((rows) =>
        rows.filter((row) => row.isActive && normalizeId(row.telegramUserId) === telegramUserId),
      );
    if (byTelegramId) {
      return normalizeDbBroker(byTelegramId);
    }
  }

  if (telegramUsername) {
    const [byTelegramUsername] = await storage
      .listSeaBrokerageBrokerAuth()
      .then((rows) =>
        rows.filter(
          (row) => row.isActive && normalizeTelegramUsername(row.telegramUsername) === telegramUsername,
        ),
      );
    if (byTelegramUsername) {
      return normalizeDbBroker(byTelegramUsername);
    }
  }

  const envAllowlist = parseEnvAllowlist();
  const matchedEnv = envAllowlist.find((entry) =>
    matchAllowlistByTelegram(entry, telegramUserId, telegramUsername),
  );
  return matchedEnv || null;
}

export async function listSeaBrokerageBrokerAllowlist(): Promise<AuthorizedSeaBrokerageBroker[]> {
  const dbEntries = (await storage.listSeaBrokerageBrokerAuth()).map(normalizeDbBroker);
  const envEntries = parseEnvAllowlist();

  const mergedByKey = new Map<string, AuthorizedSeaBrokerageBroker>();
  for (const entry of [...envEntries, ...dbEntries]) {
    const key =
      entry.authUserId ||
      entry.authEmail ||
      entry.telegramUserId ||
      entry.telegramUsername ||
      `${entry.brokerCode}:${entry.companyName}`;
    mergedByKey.set(key, entry);
  }

  return Array.from(mergedByKey.values());
}
