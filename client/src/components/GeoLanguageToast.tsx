import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

const GEO_LANG_TOAST_EVENT = "cropto:geoLang";
const GEO_LANG_TOAST_SHOWN_KEY = "cropto_geo_lang_toast_shown";

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
      if (localStorage.getItem(GEO_LANG_TOAST_SHOWN_KEY)) return;

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

      toast({
        description: t("geo.detected", { language: languageName }),
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
