import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  buildSeaBrokerageTelegramHeaders,
  getStoredMonitorTelegramIdentity,
  setStoredMonitorTelegramIdentity,
  type MonitorTelegramIdentity,
} from "../services/monitorTelegramIdentity.service";
import {
  getStoredDemoTelegramBrokerId,
  resolveSeaBrokerageTelegramSession,
  setStoredDemoTelegramBrokerId,
  type SeaBrokerageBrokerAuthProfile,
} from "../services/telegramSession.service";

interface BrokerAuthMeResponse {
  authorized: boolean;
  profile: SeaBrokerageBrokerAuthProfile | null;
}

export function useSeaBrokerageTelegramSession() {
  const [selectedDemoBrokerId, setSelectedDemoBrokerIdState] = useState<string | null>(() =>
    getStoredDemoTelegramBrokerId(),
  );
  const [identity, setIdentity] = useState<MonitorTelegramIdentity>(() =>
    getStoredMonitorTelegramIdentity(),
  );

  useEffect(() => {
    setStoredDemoTelegramBrokerId(selectedDemoBrokerId);
  }, [selectedDemoBrokerId]);

  useEffect(() => {
    setStoredMonitorTelegramIdentity(identity);
  }, [identity]);

  const headers = useMemo(() => buildSeaBrokerageTelegramHeaders(identity), [identity]);
  const identityReady = Object.keys(headers).length > 0;

  const { data: brokerAuthData, isFetching } = useQuery<BrokerAuthMeResponse | null>({
    queryKey: ["/api/sea-brokerage-monitor/broker-auth/me", identity.telegramUserId, identity.telegramUsername],
    retry: false,
    enabled: identityReady,
    queryFn: async () => {
      const response = await fetch("/api/sea-brokerage-monitor/broker-auth/me", {
        method: "GET",
        headers,
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`Failed to resolve monitor broker auth: ${response.status}`);
      }
      return response.json();
    },
  });

  const session = resolveSeaBrokerageTelegramSession(identity, selectedDemoBrokerId, brokerAuthData?.profile);

  return {
    ...session,
    isLoading: isFetching,
    selectedDemoBrokerId,
    setSelectedDemoBrokerId: setSelectedDemoBrokerIdState,
    telegramIdentity: identity,
    setTelegramIdentity: setIdentity,
  };
}

