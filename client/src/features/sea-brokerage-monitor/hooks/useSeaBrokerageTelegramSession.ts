import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getStoredDemoTelegramBrokerId,
  resolveSeaBrokerageTelegramSession,
  setStoredDemoTelegramBrokerId,
  type SeaBrokerageBrokerAuthProfile,
  type WorkspaceAuthUser,
} from "../services/telegramSession.service";

interface AuthMeResponse {
  user: WorkspaceAuthUser;
}

interface BrokerAuthMeResponse {
  authorized: boolean;
  profile: SeaBrokerageBrokerAuthProfile | null;
}

export function useSeaBrokerageTelegramSession() {
  const [selectedDemoBrokerId, setSelectedDemoBrokerIdState] = useState<string | null>(() =>
    getStoredDemoTelegramBrokerId(),
  );

  const { data, isLoading } = useQuery<AuthMeResponse | null>({
    queryKey: ["/api/auth/me"],
    retry: false,
    enabled: !!localStorage.getItem("cropto_token"),
  });

  const { data: brokerAuthData } = useQuery<BrokerAuthMeResponse | null>({
    queryKey: ["/api/sea-brokerage-monitor/broker-auth/me"],
    retry: false,
    enabled: !!data?.user,
  });

  useEffect(() => {
    setStoredDemoTelegramBrokerId(selectedDemoBrokerId);
  }, [selectedDemoBrokerId]);

  const session = resolveSeaBrokerageTelegramSession(
    data?.user,
    selectedDemoBrokerId,
    brokerAuthData?.profile,
  );

  return {
    ...session,
    workspaceUser: data?.user ?? null,
    isLoading,
    selectedDemoBrokerId,
    setSelectedDemoBrokerId: setSelectedDemoBrokerIdState,
  };
}
