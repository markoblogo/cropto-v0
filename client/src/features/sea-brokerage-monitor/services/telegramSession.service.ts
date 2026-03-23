import { brokers, brokerProfilesByAuthUserId, brokerProfilesByEmail } from "../mock/dictionaries";
import type { BrokerUser } from "../types";

const DEMO_TELEGRAM_BROKER_STORAGE_KEY = "sea_brokerage_monitor.demo_telegram_broker_id";

export interface WorkspaceAuthUser {
  id: string;
  email: string;
  role: string;
}

export interface SeaBrokerageTelegramSession {
  authorProfile: BrokerUser | null;
  sessionState: "viewer" | "workspace_bridge" | "demo_telegram";
  canCreateEntries: boolean;
  isDemoSelectorEnabled: boolean;
  statusLabel: string;
  statusMessage: string;
  telegramHandle: string | null;
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

export function resolveBrokerProfileFromWorkspaceUser(
  user: WorkspaceAuthUser | null | undefined,
): BrokerUser | null {
  if (!user) return null;

  const mappedById = brokerProfilesByAuthUserId[user.id];
  if (mappedById) {
    return mappedById;
  }

  const mappedByEmail = brokerProfilesByEmail[user.email.trim().toLowerCase()];
  if (mappedByEmail) {
    return {
      ...mappedByEmail,
      authUserId: user.id,
      email: user.email,
    };
  }

  return null;
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

export function resolveSeaBrokerageTelegramSession(
  user: WorkspaceAuthUser | null | undefined,
  demoBrokerId?: string | null,
): SeaBrokerageTelegramSession {
  const mappedWorkspaceProfile = resolveBrokerProfileFromWorkspaceUser(user);
  const demoBrokerProfile = resolveDemoTelegramBroker(demoBrokerId);

  if (mappedWorkspaceProfile) {
    return {
      authorProfile: mappedWorkspaceProfile,
      sessionState: "workspace_bridge",
      canCreateEntries: true,
      isDemoSelectorEnabled: isSeaBrokerageMonitorDemoSessionEnabled(),
      statusLabel: "Telegram session ready",
      statusMessage: "A mapped identity is bridged into the monitor until Telegram login is implemented.",
      telegramHandle: buildTelegramHandle(mappedWorkspaceProfile),
    };
  }

  if (demoBrokerProfile) {
    return {
      authorProfile: demoBrokerProfile,
      sessionState: "demo_telegram",
      canCreateEntries: true,
      isDemoSelectorEnabled: true,
      statusLabel: "Demo Telegram session",
      statusMessage: "Using a controlled local Telegram-style broker identity for manual testing.",
      telegramHandle: buildTelegramHandle(demoBrokerProfile),
    };
  }

  return {
    authorProfile: null,
    sessionState: "viewer",
    canCreateEntries: false,
    isDemoSelectorEnabled: isSeaBrokerageMonitorDemoSessionEnabled(),
    statusLabel: "Viewer mode",
    statusMessage: isSeaBrokerageMonitorDemoSessionEnabled()
      ? "Author unavailable. Choose a demo Telegram identity to create entries."
      : "Author unavailable until Telegram-based login is connected.",
    telegramHandle: null,
  };
}
