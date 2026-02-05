import { Link } from "wouter";
import { useTranslation } from "react-i18next";

const COUNTRY_FLAGS = [
  { code: "ua", flag: "🇺🇦" },
  { code: "us", flag: "🇺🇸" },
  { code: "br", flag: "🇧🇷" },
  { code: "ar", flag: "🇦🇷" },
] as const;

function countryLabel(code: string, t: (k: string) => string) {
  switch (code) {
    case "ua":
      return t("home.market.tabs.ua");
    case "us":
      return t("home.market.tabs.us");
    case "br":
      return t("home.market.tabs.br");
    case "ar":
      return t("home.market.tabs.ar");
    default:
      return code.toUpperCase();
  }
}

function FlagLink({ href, flag, ariaLabel }: { href: string; flag: string; ariaLabel: string }) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      title={ariaLabel}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-background/70 text-lg transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      <span aria-hidden="true">{flag}</span>
    </Link>
  );
}

export function Footer() {
  const { t } = useTranslation();

  const moreLinks = [
    { href: "/wallet", label: t("nav.wallet") },
    { href: "/education#faq", label: t("nav.faqShort") },
    { href: "/education", label: t("nav.aboutCropto") },
    { href: "/partners-contracts", label: t("nav.partners") },
    { href: "/onchain-tx", label: t("nav.transactions") },
    { href: "/feedback", label: t("nav.feedback") },
    { href: "/markets/chain", label: t("nav.chain") },
  ];

  return (
    <footer className="border-t border-border/70 bg-muted/85">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-xl border border-border/60 bg-background/80 p-3 md:col-span-2 xl:col-span-1">
            <div className="flex items-center gap-2.5">
              <img src="/cropto-logo.png" alt={t("site.logoAlt")} className="h-8 w-auto" />
              <p className="font-semibold text-foreground">{t("site.title")}</p>
            </div>
            <p className="mt-2 max-w-xs text-xs leading-5 text-muted-foreground">{t("footer.description")}</p>
          </div>

          <div className="rounded-xl border border-border/60 bg-background/80 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("footer.indexTrading")}</p>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {COUNTRY_FLAGS.map(({ code, flag }) => (
                <FlagLink
                  key={`idx-${code}`}
                  href={`/spot-trading?country=${code}`}
                  flag={flag}
                  ariaLabel={`${t("nav.indexTrading")} — ${countryLabel(code, t)}`}
                />
              ))}
            </div>
            <Link
              href="/arbitrage"
              aria-label={t("nav.tradeArbitrage")}
              title={t("nav.tradeArbitrage")}
              className="inline-flex w-full items-center justify-center gap-1 rounded-full border border-primary/35 bg-primary/10 px-2 py-1.5 text-sm transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              {COUNTRY_FLAGS.map(({ code, flag }) => (
                <span key={`arb-${code}`} className="text-base" aria-hidden="true">
                  {flag}
                </span>
              ))}
            </Link>
          </div>

          <div className="rounded-xl border border-border/60 bg-background/80 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("footer.optionsTrading")}</p>
            <div className="flex flex-wrap gap-1.5">
              {COUNTRY_FLAGS.map(({ code, flag }) => (
                <FlagLink
                  key={`opt-${code}`}
                  href={`/options?country=${code}`}
                  flag={flag}
                  ariaLabel={`${t("nav.optionsTrading")} — ${countryLabel(code, t)}`}
                />
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-background/80 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("footer.marketData")}</p>
            <div className="flex flex-wrap gap-1.5">
              {COUNTRY_FLAGS.map(({ code, flag }) => (
                <FlagLink
                  key={`mkt-${code}`}
                  href={`/market-data?country=${code}`}
                  flag={flag}
                  ariaLabel={`${t("footer.marketData")} — ${countryLabel(code, t)}`}
                />
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-background/80 p-3">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              {moreLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="truncate text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/privacy" className="transition-colors hover:text-foreground">
              {t("footer.privacyPolicy")}
            </Link>
            <Link href="/terms" className="transition-colors hover:text-foreground">
              {t("footer.termsOfUse")}
            </Link>
            <Link href="/risk-disclosure" className="transition-colors hover:text-foreground">
              {t("footer.riskDisclosure")}
            </Link>
          </div>
          <p>© 2026 {t("site.title")}. {t("footer.allRightsReserved")}</p>
        </div>
      </div>
    </footer>
  );
}
