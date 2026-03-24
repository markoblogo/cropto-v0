import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  buildSeaBrokerageMonitorAuthHeaders,
  clearSeaBrokerageMonitorToken,
  getSeaBrokerageMonitorToken,
  setSeaBrokerageMonitorToken,
  signInSeaBrokerageMonitorWithTelegram,
  type TelegramWidgetUser,
} from "../services/monitorAuth.service";
import { resolveSeaBrokerageTelegramSession } from "../services/telegramSession.service";

interface BrokerAuthMeResponse {
  authenticated: boolean;
  identity: {
    telegramUserId: string;
    telegramUsername: string | null;
  };
  profile: {
    authUserId: string | null;
    authEmail: string | null;
    telegramUserId: string | null;
    telegramUsername: string | null;
    brokerCode: string;
    brokerName: string;
    companyName: string;
    isActive: boolean;
    source: "db" | "env";
  };
}

const TELEGRAM_BOT_USERNAME = import.meta.env.VITE_SEA_BROKERAGE_TELEGRAM_BOT_USERNAME || "spikemoonbot";

export function useSeaBrokerageTelegramSession() {
  const [monitorToken, setMonitorToken] = useState<string | null>(() => getSeaBrokerageMonitorToken());
  const [selectedDemoBrokerId, setSelectedDemoBrokerId] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  useEffect(() => {
    setSeaBrokerageMonitorToken(monitorToken);
  }, [monitorToken]);

  const headers = useMemo(() => buildSeaBrokerageMonitorAuthHeaders(monitorToken), [monitorToken]);

  const { data, isLoading, refetch } = useQuery<BrokerAuthMeResponse | null>({
    queryKey: ["/api/sea-brokerage-monitor/auth/telegram/me", monitorToken],
    enabled: !!monitorToken,
    retry: false,
    queryFn: async () => {
      const response = await fetch("/api/sea-brokerage-monitor/auth/telegram/me", {
        method: "GET",
        headers,
        credentials: "include",
      });
      if (response.status === 401 || response.status === 403) {
        clearSeaBrokerageMonitorToken();
        setMonitorToken(null);
        return null;
      }
      if (!response.ok) {
        throw new Error(`Failed to resolve monitor auth session: ${response.status}`);
      }
      return response.json();
    },
  });

  async function authenticateWithTelegram(user: TelegramWidgetUser) {
    try {
      setIsAuthenticating(true);
      setAuthError(null);
      const result = await signInSeaBrokerageMonitorWithTelegram(user);
      setMonitorToken(result.token);
      await refetch();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Telegram authentication failed");
    } finally {
      setIsAuthenticating(false);
    }
  }

  function logoutTelegramSession() {
    clearSeaBrokerageMonitorToken();
    setMonitorToken(null);
    setAuthError(null);
  }

  const session = resolveSeaBrokerageTelegramSession(
    data?.identity
      ? {
          telegramUserId: data.identity.telegramUserId,
          telegramUsername: data.identity.telegramUsername,
        }
      : {
          telegramUserId: null,
          telegramUsername: null,
        },
    selectedDemoBrokerId,
    data?.profile ?? null,
  );

  return {
    ...session,
    isLoading: isLoading || isAuthenticating,
    selectedDemoBrokerId,
    setSelectedDemoBrokerId,
    telegramIdentity: data?.identity
      ? {
          telegramUserId: data.identity.telegramUserId,
          telegramUsername: data.identity.telegramUsername,
        }
      : { telegramUserId: null, telegramUsername: null },
    monitorAuthToken: monitorToken,
    monitorAuthHeaders: headers,
    telegramBotUsername: TELEGRAM_BOT_USERNAME,
    authError,
    authenticateWithTelegram,
    logoutTelegramSession,
  };
}

