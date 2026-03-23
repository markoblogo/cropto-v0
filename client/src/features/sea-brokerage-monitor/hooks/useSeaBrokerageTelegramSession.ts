import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getStoredDemoTelegramBrokerId,
  resolveSeaBrokerageTelegramSession,
  setStoredDemoTelegramBrokerId,
  type WorkspaceAuthUser,
} from "../services/telegramSession.service";

interface AuthMeResponse {
  user: WorkspaceAuthUser;
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

  useEffect(() => {
    setStoredDemoTelegramBrokerId(selectedDemoBrokerId);
  }, [selectedDemoBrokerId]);

  const session = resolveSeaBrokerageTelegramSession(data?.user, selectedDemoBrokerId);

  return {
    ...session,
    workspaceUser: data?.user ?? null,
    isLoading,
    selectedDemoBrokerId,
    setSelectedDemoBrokerId: setSelectedDemoBrokerIdState,
  };
}
