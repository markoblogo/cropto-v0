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
  miniAppShortName?: string;
  onAuth: (user: TelegramWidgetUser) => void;
  onUseTelegramWebApp?: () => void;
  isAuthorizing?: boolean;
}

function isMobileViewport() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );
}

function openTelegramBotChat(botUsername: string) {
  const username = botUsername.replace(/^@+/, "");
  if (typeof window === "undefined") return;

  const deepLink = `tg://resolve?domain=${username}`;
  const webLink = `https://t.me/${username}`;

  window.location.href = deepLink;
  window.setTimeout(() => {
    window.location.href = webLink;
  }, 700);
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

export function TelegramLoginWidget({
  botUsername,
  botId,
  miniAppShortName: _miniAppShortName,
  onAuth,
  onUseTelegramWebApp,
  isAuthorizing = false,
}: TelegramLoginWidgetProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const mobile = isMobileViewport();
  const hasTelegramWebAppContext =
    typeof window !== "undefined" &&
    Boolean((window as Window & { Telegram?: { WebApp?: unknown } }).Telegram?.WebApp);
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

  const shouldRenderWidget = !mobile || hasTelegramWebAppContext;

  return (
    <div className="space-y-2">
      {mobile && !hasTelegramWebAppContext ? (
        <Button
          type="button"
          className="h-9 w-full justify-center gap-2"
          onClick={() => {
            openTelegramBotChat(botUsername);
          }}
        >
          <Send className="h-4 w-4" />
          Open bot chat in Telegram
        </Button>
      ) : null}
      {mobile && !hasTelegramWebAppContext ? (
        <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          In Telegram, open <span className="font-medium">@{botUsername.replace(/^@+/, "")}</span> and tap
          {" "}
          <span className="font-medium">Open Spike Monitor</span> (menu button). Sign-in will apply automatically.
        </div>
      ) : null}
      {mobile && hasTelegramWebAppContext ? (
        <Button
          type="button"
          className="h-9 w-full justify-center gap-2"
          disabled={isAuthorizing}
          onClick={() => {
            onUseTelegramWebApp?.();
          }}
        >
          <Send className="h-4 w-4" />
          {isAuthorizing ? "Authorizing..." : "Use Telegram session now"}
        </Button>
      ) : null}
      {!mobile && telegramAppLoginUrl ? (
        <Button
          type="button"
          variant="outline"
          className="h-9 w-full justify-center gap-2"
          onClick={() => {
            window.location.href = telegramAppLoginUrl;
          }}
        >
          <Send className="h-4 w-4" />
          Web Telegram fallback
        </Button>
      ) : null}
      {shouldRenderWidget ? <div ref={mountRef} className="min-h-8 [&>iframe]:max-w-full" /> : null}
    </div>
  );
}
