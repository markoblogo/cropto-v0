import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import type { TelegramWidgetUser } from "../services/monitorAuth.service";

declare global {
  interface Window {
    onSeaBrokerageTelegramAuth?: (user: TelegramWidgetUser) => void;
  }
}

interface TelegramLoginWidgetProps {
  botUsername: string;
  botId?: string;
  onAuth: (user: TelegramWidgetUser) => void;
}

function isMobileViewport() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );
}

function buildTelegramOauthUrl(botId: string) {
  if (typeof window === "undefined") return "";
  const origin = window.location.hostname;
  const returnTo = window.location.href;
  const params = new URLSearchParams({
    bot_id: botId,
    origin,
    request_access: "write",
    return_to: returnTo,
  });
  return `https://oauth.telegram.org/auth?${params.toString()}`;
}

export function TelegramLoginWidget({ botUsername, botId, onAuth }: TelegramLoginWidgetProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const mobile = isMobileViewport();
  const telegramAppLoginUrl = botId ? buildTelegramOauthUrl(botId) : "";

  useEffect(() => {
    if (!mountRef.current || !botUsername) return;

    window.onSeaBrokerageTelegramAuth = (user: TelegramWidgetUser) => {
      onAuth(user);
    };

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername.replace(/^@+/, ""));
    script.setAttribute("data-size", "large");
    script.setAttribute("data-userpic", "false");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-onauth", "onSeaBrokerageTelegramAuth(user)");

    mountRef.current.innerHTML = "";
    mountRef.current.appendChild(script);

    return () => {
      if (window.onSeaBrokerageTelegramAuth) {
        delete window.onSeaBrokerageTelegramAuth;
      }
    };
  }, [botUsername, onAuth]);

  return (
    <div className="space-y-2">
      {mobile && telegramAppLoginUrl ? (
        <Button
          type="button"
          className="h-9 w-full justify-center gap-2"
          onClick={() => {
            window.location.href = telegramAppLoginUrl;
          }}
        >
          <Send className="h-4 w-4" />
          Continue in Telegram app
        </Button>
      ) : null}
      <div ref={mountRef} className="min-h-8 [&>iframe]:max-w-full" />
    </div>
  );
}
