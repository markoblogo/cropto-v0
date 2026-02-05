import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from '../../public/locales/en/common.json';
import uk from '../../public/locales/uk/common.json';
import es from '../../public/locales/es/common.json';
import pt from '../../public/locales/pt/common.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { 
      en: { common: en }, 
      uk: { common: uk },
      es: { common: es },
      pt: { common: pt }
    },
    supportedLngs: ['en', 'uk', 'es', 'pt'],
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    fallbackLng: 'en',
    ns: ['common'],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    detection: {
      order: ['querystring', 'localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

const GEO_LANG_CACHE_KEY = "cropto_geo_lang";
const GEO_LANG_TS_KEY = "cropto_geo_lang_ts";
const GEO_LANG_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const GEO_LANG_TOAST_EVENT = "cropto:geoLang";

const PT_COUNTRIES = new Set(["BR", "PT"]);
const ES_COUNTRIES = new Set([
  "ES", "AR", "MX", "CL", "CO", "PE", "VE", "EC", "BO", "PY", "UY",
  "CR", "PA", "DO", "GT", "SV", "HN", "NI", "PR", "CU", "GQ",
]);

async function fetchCountryCode(url: string, pick: (data: unknown) => string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return "";
    const data = await response.json();
    return String(pick(data) || "").toUpperCase();
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

async function detectGeoLanguage() {
  if (typeof window === "undefined") return;

  const storedLang = localStorage.getItem("i18nextLng");
  if (storedLang) return;

  const cachedLang = localStorage.getItem(GEO_LANG_CACHE_KEY);
  const cachedTs = Number(localStorage.getItem(GEO_LANG_TS_KEY) || 0);
  if (cachedLang && Date.now() - cachedTs < GEO_LANG_TTL_MS) {
    if (i18n.language !== cachedLang) {
      i18n.changeLanguage(cachedLang);
    }
    return;
  }

  try {
    let countryCode = await fetchCountryCode(
      "https://ipapi.co/json/",
      (data) => (data as { country?: string; country_code?: string })?.country || (data as { country_code?: string })?.country_code
    );
    if (!countryCode) {
      countryCode = await fetchCountryCode(
        "https://ipwho.is/?fields=country_code",
        (data) => (data as { country_code?: string })?.country_code
      );
    }
    if (!countryCode) return;

    let lang = "en";
    if (countryCode === "UA") lang = "uk";
    else if (PT_COUNTRIES.has(countryCode)) lang = "pt";
    else if (ES_COUNTRIES.has(countryCode)) lang = "es";

    localStorage.setItem(GEO_LANG_CACHE_KEY, lang);
    localStorage.setItem(GEO_LANG_TS_KEY, String(Date.now()));
    if (i18n.language !== lang) {
      i18n.changeLanguage(lang);
    }
    window.dispatchEvent(new CustomEvent(GEO_LANG_TOAST_EVENT, { detail: { lang } }));
  } catch {
    // best-effort only
  }
}

detectGeoLanguage();

export default i18n;
