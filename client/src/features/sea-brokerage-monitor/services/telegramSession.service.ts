import { brokers } from "../mock/dictionaries";
import type { BrokerUser } from "../types";
import type { MonitorTelegramIdentity } from "./monitorAuth.service";

const DEMO_TELEGRAM_BROKER_STORAGE_KEY = "sea_brokerage_monitor.demo_telegram_broker_id";

export interface SeaBrokerageTelegramSession {
  authorProfile: BrokerUser | null;
  sessionState: "viewer" | "telegram_allowlisted" | "telegram_unlisted" | "demo_telegram";
  canCreateEntries: boolean;
  isDemoSelectorEnabled: boolean;
  statusLabel: string;
  statusMessage: string;
  telegramHandle: string | null;
}

export interface SeaBrokerageBrokerAuthProfile {
  authUserId: string | null;
  authEmail: string | null;
  telegramUserId: string | null;
  telegramUsername: string | null;
  brokerCode: string;
  brokerName: string;
  companyName: string;
  isActive: boolean;
  source: "db" | "env";
}

function normalizeHandlePart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function buildTelegramHandle(profile: BrokerUser) {
  return `@${normalizeHandlePart(profile.brokerCode)}_tape`;
}

export function isSeaBrokerageMonitorDemoSessionEnabled() {
  return !import.meta.env.PROD || (import.meta.env.VITE_MOCK_ONCHAIN || "").toLowerCase() === "true";
}

export function getStoredDemoTelegramBrokerId() {
  if (typeof window === "undefined") return null;

  const value = window.localStorage.getItem(DEMO_TELEGRAM_BROKER_STORAGE_KEY);
  return brokers.some((broker) => broker.id === value) ? value : null;
}

export function setStoredDemoTelegramBrokerId(brokerId: string | null) {
  if (typeof window === "undefined") return;

  if (!brokerId) {
    window.localStorage.removeItem(DEMO_TELEGRAM_BROKER_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(DEMO_TELEGRAM_BROKER_STORAGE_KEY, brokerId);
}

export function resolveDemoTelegramBroker(brokerId: string | null | undefined) {
  if (!isSeaBrokerageMonitorDemoSessionEnabled() || !brokerId) {
    return null;
  }

  return brokers.find((broker) => broker.id === brokerId) ?? null;
}

function getIdentityHandle(identity: MonitorTelegramIdentity) {
  if (identity.telegramUsername) {
    return `@${identity.telegramUsername.replace(/^@+/, "")}`;
  }
  if (identity.telegramUserId) {
    return `tg:${identity.telegramUserId}`;
  }
  return null;
}

export function resolveSeaBrokerageTelegramSession(
  identity: MonitorTelegramIdentity,
  demoBrokerId?: string | null,
  brokerAuthProfile?: SeaBrokerageBrokerAuthProfile | null,
): SeaBrokerageTelegramSession {
  if (brokerAuthProfile?.isActive) {
    const profile: BrokerUser = {
      id: brokerAuthProfile.telegramUserId || `sea_brokerage_auth:${brokerAuthProfile.brokerCode}`,
      authUserId: brokerAuthProfile.telegramUserId || "telegram_auth",
      brokerCode: brokerAuthProfile.brokerCode,
      brokerName: brokerAuthProfile.brokerName,
      companyName: brokerAuthProfile.companyName,
      displayName: brokerAuthProfile.brokerName,
      email: brokerAuthProfile.authEmail || "",
      role: "broker",
      identityProvider: "telegram_future",
    };
    return {
      authorProfile: profile,
      sessionState: "telegram_allowlisted",
      canCreateEntries: true,
      isDemoSelectorEnabled: isSeaBrokerageMonitorDemoSessionEnabled(),
      statusLabel: "Telegram broker authorized",
      statusMessage:
        "Broker is authorized via monitor Telegram allowlist. Entry creation is enabled.",
      telegramHandle: brokerAuthProfile.telegramUsername
        ? `@${brokerAuthProfile.telegramUsername.replace(/^@+/, "")}`
        : getIdentityHandle(identity) || buildTelegramHandle(profile),
    };
  }

  const demoBrokerProfile = resolveDemoTelegramBroker(demoBrokerId);
  if (demoBrokerProfile) {
    return {
      authorProfile: demoBrokerProfile,
      sessionState: "demo_telegram",
      canCreateEntries: false,
      isDemoSelectorEnabled: true,
      statusLabel: "Demo Telegram preview",
      statusMessage: "Demo identity is preview-only. Real publish requires allowlisted Telegram identity.",
      telegramHandle: buildTelegramHandle(demoBrokerProfile),
    };
  }

  const hasIdentity = !!identity.telegramUserId || !!identity.telegramUsername;
  if (hasIdentity) {
    return {
      authorProfile: null,
      sessionState: "telegram_unlisted",
      canCreateEntries: false,
      isDemoSelectorEnabled: isSeaBrokerageMonitorDemoSessionEnabled(),
      statusLabel: "Telegram identity detected",
      statusMessage:
        "Telegram identity is present but not in allowlist yet. Ask admin to add your Telegram user id/username.",
      telegramHandle: getIdentityHandle(identity),
    };
  }

  return {
    authorProfile: null,
    sessionState: "viewer",
    canCreateEntries: false,
    isDemoSelectorEnabled: isSeaBrokerageMonitorDemoSessionEnabled(),
    statusLabel: "Viewer mode",
    statusMessage: "Sign in with Telegram to enable broker authorization.",
    telegramHandle: null,
  };
}
