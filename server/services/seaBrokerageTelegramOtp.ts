import { randomBytes } from "crypto";

type OtpEntry = {
  code: string;
  expiresAt: number;
  attemptsLeft: number;
};

type MagicLinkEntry = {
  username: string;
  expiresAt: number;
};

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const MAGIC_LINK_TTL_MS = 10 * 60 * 1000;
const otpByUsername = new Map<string, OtpEntry>();
const magicLinkByToken = new Map<string, MagicLinkEntry>();

function normalizeUsername(value: string) {
  return String(value || "").trim().replace(/^@+/, "").toLowerCase();
}

export function issueSeaBrokerageTelegramOtp(rawUsername: string) {
  const username = normalizeUsername(rawUsername);
  if (!username) {
    throw new Error("Telegram username is required");
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  otpByUsername.set(username, {
    code,
    expiresAt: Date.now() + OTP_TTL_MS,
    attemptsLeft: OTP_MAX_ATTEMPTS,
  });
  return { username, code };
}

export function verifySeaBrokerageTelegramOtp(rawUsername: string, rawCode: string) {
  const username = normalizeUsername(rawUsername);
  const code = String(rawCode || "").trim();
  if (!username || !code) return false;

  const entry = otpByUsername.get(username);
  if (!entry) return false;

  if (Date.now() > entry.expiresAt) {
    otpByUsername.delete(username);
    return false;
  }

  if (entry.code !== code) {
    entry.attemptsLeft -= 1;
    if (entry.attemptsLeft <= 0) {
      otpByUsername.delete(username);
    } else {
      otpByUsername.set(username, entry);
    }
    return false;
  }

  otpByUsername.delete(username);
  return true;
}

export function issueSeaBrokerageTelegramMagicLink(rawUsername: string) {
  const username = normalizeUsername(rawUsername);
  if (!username) {
    throw new Error("Telegram username is required");
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + MAGIC_LINK_TTL_MS;
  magicLinkByToken.set(token, {
    username,
    expiresAt,
  });

  return {
    username,
    token,
    expiresAt,
  };
}

export function consumeSeaBrokerageTelegramMagicLink(rawToken: string) {
  const token = String(rawToken || "").trim();
  if (!token) return null;

  const entry = magicLinkByToken.get(token);
  if (!entry) return null;

  magicLinkByToken.delete(token);

  if (Date.now() > entry.expiresAt) {
    return null;
  }

  return {
    username: entry.username,
  };
}
