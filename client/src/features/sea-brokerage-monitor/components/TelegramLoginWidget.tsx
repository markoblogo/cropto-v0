import { useEffect, useRef } from "react";
import type { TelegramWidgetUser } from "../services/monitorAuth.service";

declare global {
  interface Window {
    onSeaBrokerageTelegramAuth?: (user: TelegramWidgetUser) => void;
  }
}

interface TelegramLoginWidgetProps {
  botUsername: string;
  onAuth: (user: TelegramWidgetUser) => void;
}

export function TelegramLoginWidget({ botUsername, onAuth }: TelegramLoginWidgetProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

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

  return <div ref={mountRef} className="min-h-8 [&>iframe]:max-w-full" />;
}

