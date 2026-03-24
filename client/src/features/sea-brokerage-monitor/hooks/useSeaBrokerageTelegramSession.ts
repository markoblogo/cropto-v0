import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  buildSeaBrokerageMonitorAuthHeaders,
  clearSeaBrokerageMonitorToken,
  consumeTelegramWidgetUserFromUrl,
  getSeaBrokerageMonitorToken,
  requestSeaBrokerageTelegramLoginCode,
  setSeaBrokerageMonitorToken,
  verifySeaBrokerageTelegramLoginCode,
  signInSeaBrokerageMonitorWithTelegramMiniApp,
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
const TELEGRAM_BOT_ID = import.meta.env.VITE_SEA_BROKERAGE_TELEGRAM_BOT_ID || "8799667536";
const TELEGRAM_MINI_APP_SHORT_NAME =
  import.meta.env.VITE_SEA_BROKERAGE_TELEGRAM_MINI_APP_SHORT_NAME || "spike_monitor";

export function useSeaBrokerageTelegramSession() {
  const [monitorToken, setMonitorToken] = useState<string | null>(() => getSeaBrokerageMonitorToken());
  const [selectedDemoBrokerId, setSelectedDemoBrokerId] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  useEffect(() => {
    setSeaBrokerageMonitorToken(monitorToken);
  }, [monitorToken]);

  useEffect(() => {
    if (monitorToken) return;

    const tryMiniAppInitData = () => {
      const webApp = (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp;
      const initData = String(webApp?.initData || "").trim();
      if (!initData) return false;
      void authenticateWithTelegramMiniApp(initData);
      return true;
    };

    if (tryMiniAppInitData()) return;

    const user = consumeTelegramWidgetUserFromUrl();
    if (user) {
      void authenticateWithTelegram(user);
      return;
    }

    // Telegram WebApp bridge can appear slightly after first render.
    const startedAt = Date.now();
    const poll = window.setInterval(() => {
      if (monitorToken) {
        window.clearInterval(poll);
        return;
      }
      if (tryMiniAppInitData()) {
        window.clearInterval(poll);
        return;
      }
      if (Date.now() - startedAt > 8000) {
        window.clearInterval(poll);
      }
    }, 350);

    return () => {
      window.clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monitorToken]);

  const headers = useMemo(() => buildSeaBrokerageMonitorAuthHeaders(monitorToken), [monitorToken]);

  const { data, isLoading } = useQuery<BrokerAuthMeResponse | null>({
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
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Telegram authentication failed");
    } finally {
      setIsAuthenticating(false);
    }
  }

  async function authenticateWithTelegramMiniApp(initData: string) {
    try {
      setIsAuthenticating(true);
      setAuthError(null);
      const result = await signInSeaBrokerageMonitorWithTelegramMiniApp(initData);
      setMonitorToken(result.token);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Telegram Mini App authentication failed");
    } finally {
      setIsAuthenticating(false);
    }
  }

  async function authenticateFromTelegramWebApp() {
    const webApp = (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp;
    const initData = String(webApp?.initData || "").trim();
    if (!initData) {
      setAuthError("Telegram WebApp session is not available yet. Open monitor from bot menu button.");
      return;
    }
    await authenticateWithTelegramMiniApp(initData);
  }

  async function requestTelegramCodeLogin(telegramUsername: string) {
    try {
      setIsAuthenticating(true);
      setAuthError(null);
      await requestSeaBrokerageTelegramLoginCode(telegramUsername);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Failed to request Telegram login code");
      throw error;
    } finally {
      setIsAuthenticating(false);
    }
  }

  async function verifyTelegramCodeLogin(telegramUsername: string, code: string) {
    try {
      setIsAuthenticating(true);
      setAuthError(null);
      const result = await verifySeaBrokerageTelegramLoginCode(telegramUsername, code);
      setMonitorToken(result.token);
      return result;
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Failed to verify Telegram login code");
      throw error;
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
    telegramBotId: TELEGRAM_BOT_ID,
    telegramMiniAppShortName: TELEGRAM_MINI_APP_SHORT_NAME,
    authError,
    authenticateWithTelegram,
    authenticateFromTelegramWebApp,
    requestTelegramCodeLogin,
    verifyTelegramCodeLogin,
    logoutTelegramSession,
  };
}
