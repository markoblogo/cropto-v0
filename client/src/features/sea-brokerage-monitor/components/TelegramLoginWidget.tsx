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

function buildMiniAppOpenUrl(botUsername: string, miniAppShortName?: string) {
  const username = botUsername.replace(/^@+/, "");
  const shortName = String(miniAppShortName || "").trim();
  if (!shortName) {
    return `https://t.me/${username}?startapp=monitor_auth`;
  }
  return `https://t.me/${username}/${shortName}?startapp=monitor_auth`;
}

function openTelegramMiniApp(botUsername: string, miniAppShortName?: string) {
  const username = botUsername.replace(/^@+/, "");
  const shortName = String(miniAppShortName || "").trim();
  const deepLink = shortName
    ? `tg://resolve?domain=${encodeURIComponent(username)}&appname=${encodeURIComponent(shortName)}&startapp=monitor_auth`
    : `tg://resolve?domain=${encodeURIComponent(username)}&startapp=monitor_auth`;
  const webLink = buildMiniAppOpenUrl(botUsername, miniAppShortName);

  window.location.href = deepLink;
  window.setTimeout(() => {
    window.location.href = webLink;
  }, 700);
}

export function TelegramLoginWidget({
  botUsername,
  miniAppShortName,
  onAuth,
  onUseTelegramWebApp,
  isAuthorizing = false,
}: TelegramLoginWidgetProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const mobile = isMobileViewport();
  const hasTelegramWebAppContext =
    typeof window !== "undefined" &&
    Boolean((window as Window & { Telegram?: { WebApp?: unknown } }).Telegram?.WebApp);

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
      {mobile ? (
        hasTelegramWebAppContext ? (
          <Button
            type="button"
            className="h-9 w-full justify-center gap-2"
            onClick={() => {
              onUseTelegramWebApp?.();
            }}
            disabled={isAuthorizing}
          >
            <Send className="h-4 w-4" />
            {isAuthorizing ? "Authorizing..." : "Use current Telegram session"}
          </Button>
        ) : (
          <>
            <Button
              type="button"
              className="h-9 w-full justify-center gap-2"
              onClick={() => {
                openTelegramMiniApp(botUsername, miniAppShortName);
              }}
            >
              <Send className="h-4 w-4" />
              Continue in Telegram app
            </Button>
            <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-xs text-foreground/70 dark:text-muted-foreground">
              Mobile sign-in is completed inside Telegram app.
            </div>
          </>
        )
      ) : (
        <div ref={mountRef} className="min-h-8 [&>iframe]:max-w-full" />
      )}
    </div>
  );
}
