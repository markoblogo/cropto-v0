import { useEffect, useMemo, useState } from "react";
import type { HeroSlotId, MonitorRole } from "@/components/monitor/v2/types";
import {
  buildDefaultHeroOccupancy,
  demoteWidget,
  HERO_SLOT_STORAGE_KEY,
  type MonitorHeroOccupancy,
  promoteWidget,
  sanitizeHeroOccupancy,
} from "@/components/monitor/v2/hero";

function readStoredHeroOccupancy(): MonitorHeroOccupancy {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(HERO_SLOT_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function useMonitorV2HeroState({
  role,
  country,
}: {
  role: MonitorRole;
  country: string;
}) {
  const defaults = useMemo(() => buildDefaultHeroOccupancy({ role, country }), [role, country]);
  const [occupancy, setOccupancy] = useState<MonitorHeroOccupancy>(() => readStoredHeroOccupancy());

  useEffect(() => {
    setOccupancy((current) => {
      const sanitized = sanitizeHeroOccupancy({ occupancy: current, role, country });
      const merged: MonitorHeroOccupancy = { ...defaults, ...sanitized };
      return JSON.stringify(current) === JSON.stringify(merged) ? current : merged;
    });
  }, [defaults, role, country]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(HERO_SLOT_STORAGE_KEY, JSON.stringify(occupancy));
  }, [occupancy]);

  return {
    occupancy,
    setOccupancy,
    promote: (widgetId: string, slotId: HeroSlotId) =>
      setOccupancy((current) => promoteWidget({ occupancy: current, widgetId, slotId })),
    demote: (slotId: HeroSlotId) =>
      setOccupancy((current) => demoteWidget({ occupancy: current, slotId })),
    reset: () => setOccupancy(defaults),
  };
}
