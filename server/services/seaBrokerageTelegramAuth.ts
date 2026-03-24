import crypto from "crypto";
import jwt from "jsonwebtoken";
import type { Request } from "express";

export type TelegramLoginPayload = {
  id: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number | string;
  hash: string;
};

export type SeaBrokerageTelegramIdentity = {
  telegramUserId: string;
  telegramUsername: string | null;
};

export type TelegramMiniAppLoginPayload = {
  initData: string;
};

type MonitorTokenPayload = {
  sub: string;
  telegramUserId: string;
  telegramUsername: string | null;
  iat?: number;
  exp?: number;
};

const MONITOR_TOKEN_TTL = "30d";
const TELEGRAM_AUTH_MAX_AGE_SECONDS = 60 * 60 * 24;

function getMonitorJwtSecret() {
  const secret = process.env.SEA_BROKERAGE_MONITOR_JWT_SECRET || process.env.JWT_SECRET || "";
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("SEA_BROKERAGE_MONITOR_JWT_SECRET or JWT_SECRET is required in production");
  }
  return secret || "sea_brokerage_monitor_dev_secret";
}

function getTelegramBotToken() {
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is required for Telegram login");
  }
  return token;
}

function normalizeUsername(value: string | null | undefined) {
  const normalized = String(value || "").trim().replace(/^@+/, "").toLowerCase();
  return normalized || null;
}

function normalizeTelegramUserId(value: string | number | null | undefined) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

export function verifyTelegramLoginPayload(payload: TelegramLoginPayload): SeaBrokerageTelegramIdentity {
  const botToken = getTelegramBotToken();
  const authDate = Number(payload.auth_date);
  if (!Number.isFinite(authDate)) {
    throw new Error("Invalid Telegram auth_date");
  }

  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > TELEGRAM_AUTH_MAX_AGE_SECONDS) {
    throw new Error("Telegram auth payload expired");
  }

  const hash = String(payload.hash || "").trim();
  if (!hash) {
    throw new Error("Telegram auth hash is missing");
  }

  const dataCheckString = Object.entries(payload)
    .filter(([key, value]) => key !== "hash" && value !== undefined && value !== null && value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto.createHash("sha256").update(botToken).digest();
  const computedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (computedHash !== hash) {
    throw new Error("Invalid Telegram auth hash");
  }

  const telegramUserId = normalizeTelegramUserId(payload.id);
  if (!telegramUserId) {
    throw new Error("Telegram user id is missing");
  }

  return {
    telegramUserId,
    telegramUsername: normalizeUsername(payload.username),
  };
}

export function verifyTelegramMiniAppInitData(initDataRaw: string): SeaBrokerageTelegramIdentity {
  const botToken = getTelegramBotToken();
  const initData = String(initDataRaw || "").trim();
  if (!initData) {
    throw new Error("Telegram Mini App initData is missing");
  }

  const params = new URLSearchParams(initData);
  const hash = String(params.get("hash") || "").trim();
  if (!hash) {
    throw new Error("Telegram Mini App hash is missing");
  }

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate)) {
    throw new Error("Invalid Telegram Mini App auth_date");
  }

  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > TELEGRAM_AUTH_MAX_AGE_SECONDS) {
    throw new Error("Telegram Mini App auth payload expired");
  }

  const dataCheckString = Array.from(params.entries())
    .filter(([key, value]) => key !== "hash" && value !== undefined && value !== null && value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const computedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (computedHash !== hash) {
    throw new Error("Invalid Telegram Mini App auth hash");
  }

  const userRaw = params.get("user");
  if (!userRaw) {
    throw new Error("Telegram Mini App user payload is missing");
  }

  let user: { id?: string | number; username?: string | null } = {};
  try {
    user = JSON.parse(userRaw);
  } catch {
    throw new Error("Invalid Telegram Mini App user payload");
  }

  const telegramUserId = normalizeTelegramUserId(user.id);
  if (!telegramUserId) {
    throw new Error("Telegram Mini App user id is missing");
  }

  return {
    telegramUserId,
    telegramUsername: normalizeUsername(user.username),
  };
}

export function signSeaBrokerageMonitorToken(identity: SeaBrokerageTelegramIdentity) {
  return jwt.sign(
    {
      sub: `tg:${identity.telegramUserId}`,
      telegramUserId: identity.telegramUserId,
      telegramUsername: identity.telegramUsername,
    } satisfies MonitorTokenPayload,
    getMonitorJwtSecret(),
    { expiresIn: MONITOR_TOKEN_TTL },
  );
}

function readBearerToken(req: Request) {
  const value = String(req.headers.authorization || "").trim();
  if (!value.toLowerCase().startsWith("bearer ")) return null;
  return value.slice(7).trim() || null;
}

export function readSeaBrokerageMonitorIdentityFromToken(
  req: Request,
): SeaBrokerageTelegramIdentity | null {
  const token = readBearerToken(req);
  if (!token) return null;

  try {
    const payload = jwt.verify(token, getMonitorJwtSecret()) as MonitorTokenPayload;
    const telegramUserId = normalizeTelegramUserId(payload.telegramUserId);
    if (!telegramUserId) return null;
    return {
      telegramUserId,
      telegramUsername: normalizeUsername(payload.telegramUsername),
    };
  } catch {
    return null;
  }
}
