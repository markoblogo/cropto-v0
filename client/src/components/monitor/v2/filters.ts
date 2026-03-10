import type { MonitorCountryOption, MonitorRole, MonitorTopic } from "@/components/monitor/v2/types";
import { MONITOR_COUNTRY_OPTIONS, MONITOR_ROLE_OPTIONS } from "@/components/monitor/v2/config";

export type MonitorRegion = "all" | "black sea" | "eu" | "us" | "latam" | "asia";
export type MonitorCrop = "all" | "wheat" | "corn" | "soy" | "rapeseed" | "sunflower" | "barley" | "oilseeds";
export type MonitorSignalType = "Harvest" | "Export" | "Logistics" | "Policy" | "Weather" | "Futures" | "Markets";
export type MonitorGrainGroupBy = "territory" | "source";
export type MonitorSignalWindow = "24h" | "7d";

export type MonitorFilterState = {
  role: MonitorRole;
  country: string;
  crop: MonitorCrop;
  topic: MonitorTopic | "all" | "trade" | "harvest";
  region: MonitorRegion;
  signalWindow: MonitorSignalWindow;
  grainGroupBy: MonitorGrainGroupBy;
};

export const PROFILE_STORAGE_KEY = "monitor_command_profile_v2";
export const COUNTRY_STORAGE_KEY = "monitor_country_global_v2";
export const GRAIN_GROUP_BY_STORAGE_KEY = "monitor_grain_group_by_v2";

export const MONITOR_CROP_OPTIONS = [
  "all",
  "wheat",
  "corn",
  "soy",
  "rapeseed",
  "sunflower",
  "barley",
  "oilseeds",
] as const;

export const MONITOR_TOPIC_OPTIONS = [
  "all",
  "markets",
  "trade",
  "logistics",
  "weather",
  "policy",
  "harvest",
] as const;

export const MONITOR_REGION_OPTIONS = ["all", "black sea", "eu", "us", "latam", "asia"] as const;

export const MONITOR_PROFILE_SIGNAL_RULES: Record<Exclude<MonitorRole, "all">, MonitorSignalType[]> = {
  farmer: ["Harvest", "Weather", "Export", "Markets"],
  trader: ["Harvest", "Weather", "Export", "Logistics", "Policy", "Futures", "Markets"],
  broker: ["Export", "Logistics", "Policy", "Futures", "Markets"],
};

export const MONITOR_PROFILE_COPY: Record<MonitorRole, string> = Object.fromEntries(
  MONITOR_ROLE_OPTIONS.map((option) => [option.id, option.description]),
) as Record<MonitorRole, string>;

export const MONITOR_COUNTRY_SIGNAL_CONTEXT: Record<string, string[]> = Object.fromEntries(
  MONITOR_COUNTRY_OPTIONS.map((option) => [option.code, option.signalContext]),
);

export function getDefaultFilterState(): MonitorFilterState {
  return {
    role: "all",
    country: "US",
    crop: "all",
    topic: "all",
    region: "all",
    signalWindow: "24h",
    grainGroupBy: "territory",
  };
}

export function readStoredRole(): MonitorRole {
  if (typeof window === "undefined") return "all";
  const saved = window.sessionStorage.getItem(PROFILE_STORAGE_KEY);
  return saved === "farmer" || saved === "trader" || saved === "broker" ? saved : "all";
}

export function readStoredCountry(options: readonly MonitorCountryOption[] = MONITOR_COUNTRY_OPTIONS): string {
  const fallback = getDefaultFilterState().country;
  if (typeof window === "undefined") return fallback;
  const saved = window.localStorage.getItem(COUNTRY_STORAGE_KEY) || window.localStorage.getItem("monitor_country_global");
  return options.some((option) => option.code === saved) ? String(saved) : fallback;
}

export function readStoredGrainGroupBy(): MonitorGrainGroupBy {
  if (typeof window === "undefined") return "territory";
  const saved = window.localStorage.getItem(GRAIN_GROUP_BY_STORAGE_KEY) || window.localStorage.getItem("monitor_grain_group_by");
  return saved === "source" ? "source" : "territory";
}

export function writeStoredRole(role: MonitorRole) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(PROFILE_STORAGE_KEY, role);
}

export function writeStoredCountry(country: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(COUNTRY_STORAGE_KEY, country);
  window.localStorage.setItem("monitor_country_global", country);
}

export function writeStoredGrainGroupBy(value: MonitorGrainGroupBy) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GRAIN_GROUP_BY_STORAGE_KEY, value);
  window.localStorage.setItem("monitor_grain_group_by", value);
}

export function matchesRoleRule(role: MonitorRole, allowed?: Array<Exclude<MonitorRole, "all">>): boolean {
  if (role === "all" || !allowed?.length) return true;
  return allowed.includes(role);
}

export function itemMatchesRole(signalType: MonitorSignalType, impact: "High" | "Medium" | "Low", role: MonitorRole): boolean {
  if (role === "all") return true;
  const allowed = MONITOR_PROFILE_SIGNAL_RULES[role];
  if (allowed.includes(signalType)) return true;
  if (role === "broker" && impact === "High") return true;
  return false;
}

export function itemMatchesCountryText(text: string, country: string): boolean {
  const tokens = MONITOR_COUNTRY_SIGNAL_CONTEXT[country] || [String(country || "").toLowerCase()];
  if (!tokens.length) return true;
  return tokens.some((token) => text.includes(token));
}
