import { useEffect, useMemo, useState } from "react";
import type { MonitorFilterState, MonitorGrainGroupBy } from "@/components/monitor/v2/filters";
import type { MonitorRole } from "@/components/monitor/v2/types";
import {
  getDefaultFilterState,
  readStoredCountry,
  readStoredGrainGroupBy,
  readStoredRole,
  writeStoredCountry,
  writeStoredGrainGroupBy,
  writeStoredRole,
} from "@/components/monitor/v2/filters";

export function useMonitorV2FilterState() {
  const defaults = useMemo(() => getDefaultFilterState(), []);
  const [role, setRole] = useState<MonitorRole>(() => readStoredRole());
  const [country, setCountry] = useState<string>(() => readStoredCountry());
  const [grainGroupBy, setGrainGroupBy] = useState<MonitorGrainGroupBy>(() => readStoredGrainGroupBy());

  useEffect(() => {
    writeStoredRole(role);
  }, [role]);

  useEffect(() => {
    writeStoredCountry(country);
  }, [country]);

  useEffect(() => {
    writeStoredGrainGroupBy(grainGroupBy);
  }, [grainGroupBy]);

  return {
    defaults,
    role,
    setRole,
    country,
    setCountry,
    grainGroupBy,
    setGrainGroupBy,
  } satisfies {
    defaults: MonitorFilterState;
    role: MonitorRole;
    setRole: (next: MonitorRole) => void;
    country: string;
    setCountry: (next: string) => void;
    grainGroupBy: MonitorGrainGroupBy;
    setGrainGroupBy: (next: MonitorGrainGroupBy) => void;
  };
}
