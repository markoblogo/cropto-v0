import { MONITOR_HERO_SLOTS, MONITOR_V2_WIDGET_CAPABILITIES } from "@/components/monitor/v2/config";
import type { HeroSlotId, MonitorHeroSlot, MonitorRole, MonitorWidgetCapability } from "@/components/monitor/v2/types";

export const HERO_SLOT_STORAGE_KEY = "monitor_hero_slot_occupancy_v2";

export type MonitorHeroOccupancy = Partial<Record<HeroSlotId, string>>;

const HERO_DEFAULT_CANDIDATES: Partial<Record<HeroSlotId, string[]>> = {
  canvas: ["top-signals-priority", "global-spot", "fao-ffpi"],
  "feature-left": ["fao-ffpi", "global-spot", "imf-benchmarks"],
  "feature-right": ["logistics-pressure-grid", "amis-balance", "usda-nass"],
  watchlist: ["signal-watchlist", "top-signals-priority"],
  "media-primary": ["hero-media-primary"],
  "media-secondary": ["hero-media-secondary"],
};

export function getHeroSlots(): readonly MonitorHeroSlot[] {
  return MONITOR_HERO_SLOTS;
}

export function getHeroEligibleCapabilities({
  role,
  country,
}: {
  role: MonitorRole;
  country: string;
}): MonitorWidgetCapability[] {
  return MONITOR_V2_WIDGET_CAPABILITIES.filter((capability) => {
    if (!capability.canLiveInHero) return false;
    if (!(capability.roles.includes("all") || capability.roles.includes(role))) return false;
    if (!(capability.countries.includes("GLOBAL") || capability.countries.includes(country))) return false;
    return true;
  });
}

export function canAssignWidgetToSlot(widgetId: string, slotId: HeroSlotId): boolean {
  const slot = MONITOR_HERO_SLOTS.find((candidate) => candidate.id === slotId);
  const capability = MONITOR_V2_WIDGET_CAPABILITIES.find((candidate) => candidate.id === widgetId);
  if (!slot || !capability) return false;
  if (!capability.canLiveInHero) return false;
  if (!capability.heroSlots?.includes(slotId)) return false;
  return slot.accepts.includes(capability.type);
}

export function buildDefaultHeroOccupancy({
  role,
  country,
}: {
  role: MonitorRole;
  country: string;
}): MonitorHeroOccupancy {
  const eligibleIds = new Set(getHeroEligibleCapabilities({ role, country }).map((capability) => capability.id));
  const used = new Set<string>();
  const occupancy: MonitorHeroOccupancy = {};

  for (const slot of MONITOR_HERO_SLOTS) {
    const candidates = HERO_DEFAULT_CANDIDATES[slot.id] || [];
    const picked = candidates.find((candidateId) => {
      if (used.has(candidateId)) return false;
      if (!eligibleIds.has(candidateId)) return false;
      return canAssignWidgetToSlot(candidateId, slot.id);
    });
    if (!picked) continue;
    occupancy[slot.id] = picked;
    used.add(picked);
  }

  return occupancy;
}

export function sanitizeHeroOccupancy({
  occupancy,
  role,
  country,
}: {
  occupancy: MonitorHeroOccupancy;
  role: MonitorRole;
  country: string;
}): MonitorHeroOccupancy {
  const eligibleIds = new Set(getHeroEligibleCapabilities({ role, country }).map((capability) => capability.id));
  const used = new Set<string>();
  const sanitized: MonitorHeroOccupancy = {};

  for (const slot of MONITOR_HERO_SLOTS) {
    const widgetId = occupancy[slot.id];
    if (!widgetId) continue;
    if (!eligibleIds.has(widgetId)) continue;
    if (!canAssignWidgetToSlot(widgetId, slot.id)) continue;
    if (used.has(widgetId)) continue;
    sanitized[slot.id] = widgetId;
    used.add(widgetId);
  }

  return sanitized;
}

export function getHeroPromotedWidgetIds(occupancy: MonitorHeroOccupancy): string[] {
  return Object.values(occupancy).filter((value): value is string => typeof value === "string");
}

export function promoteWidget({
  occupancy,
  widgetId,
  slotId,
}: {
  occupancy: MonitorHeroOccupancy;
  widgetId: string;
  slotId: HeroSlotId;
}): MonitorHeroOccupancy {
  if (!canAssignWidgetToSlot(widgetId, slotId)) return occupancy;
  const next: MonitorHeroOccupancy = { ...occupancy };
  for (const key of Object.keys(next) as HeroSlotId[]) {
    if (next[key] === widgetId) delete next[key];
  }
  next[slotId] = widgetId;
  return next;
}

export function demoteWidget({
  occupancy,
  slotId,
}: {
  occupancy: MonitorHeroOccupancy;
  slotId: HeroSlotId;
}): MonitorHeroOccupancy {
  if (!occupancy[slotId]) return occupancy;
  const next: MonitorHeroOccupancy = { ...occupancy };
  delete next[slotId];
  return next;
}
