import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

const GEO_LANG_TOAST_EVENT = "cropto:geoLang";
const GEO_LANG_TOAST_SHOWN_KEY = "cropto_geo_lang_toast_shown";
const GEO_LANG_TOAST_TS_KEY = "cropto_geo_lang_toast_shown_ts";
const GEO_LANG_TOAST_HIDE_KEY = "cropto_geo_lang_toast_hidden";
const GEO_LANG_TOAST_TTL_MS = 1000 * 60 * 60 * 24 * 30;

type GeoLangEventDetail = {
  lang?: string;
};

const languageNameKeyMap: Record<string, string> = {
  en: "language.name.en",
  uk: "language.name.uk",
  es: "language.name.es",
  pt: "language.name.pt",
};

export default function GeoLanguageToast() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const hasShownRef = useRef(false);

  useEffect(() => {
    const handleToast = (event: Event) => {
      if (hasShownRef.current) return;
      if (localStorage.getItem(GEO_LANG_TOAST_HIDE_KEY)) return;

      const lastShownTs = Number(
        localStorage.getItem(GEO_LANG_TOAST_TS_KEY) || 0
      );
      if (Date.now() - lastShownTs < GEO_LANG_TOAST_TTL_MS) return;

      const detail = (event as CustomEvent<GeoLangEventDetail>).detail;
      const lang = detail?.lang || "en";
      const languageNameKey = languageNameKeyMap[lang] || "language.name.en";
      const languageName = t(languageNameKey);

      const openLanguageMenu = () => {
        const toggle = document.querySelector(
          '[data-testid="button-language-toggle"]'
        ) as HTMLElement | null;
        if (toggle) {
          toggle.focus();
          toggle.click();
        }
      };

      hasShownRef.current = true;
      localStorage.setItem(GEO_LANG_TOAST_SHOWN_KEY, "1");
      localStorage.setItem(GEO_LANG_TOAST_TS_KEY, String(Date.now()));

      const hideToast = () => {
        localStorage.setItem(GEO_LANG_TOAST_HIDE_KEY, "1");
      };

      toast({
        description: (
          <div className="flex flex-col gap-2">
            <span>{t("geo.detected", { language: languageName })}</span>
            <button
              type="button"
              onClick={hideToast}
              className="text-xs text-muted-foreground underline underline-offset-2 self-start hover:text-foreground"
            >
              {t("geo.dismiss")}
            </button>
          </div>
        ),
        action: (
          <ToastAction altText={t("geo.change")} onClick={openLanguageMenu}>
            {t("geo.change")}
          </ToastAction>
        ),
        duration: 9000,
      });
    };

    window.addEventListener(GEO_LANG_TOAST_EVENT, handleToast as EventListener);
    return () => {
      window.removeEventListener(GEO_LANG_TOAST_EVENT, handleToast as EventListener);
    };
  }, [t, toast]);

  return null;
}
