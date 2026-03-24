type OtpEntry = {
  code: string;
  expiresAt: number;
  attemptsLeft: number;
};

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const otpByUsername = new Map<string, OtpEntry>();

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

