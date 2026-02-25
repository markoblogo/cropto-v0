import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";
import { ThemeAwareLogo } from "@/components/ThemeAwareLogo";

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
  const debugSources = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debugSources") === "1";
  const showBuildInfo = debugSources || !import.meta.env.PROD;
  const { data: versionInfo } = useQuery<{ gitSha: string; buildTime: string | null; env: string }>({
    queryKey: ["/api/version"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/version");
      return res.json();
    },
    enabled: showBuildInfo,
    staleTime: 60_000,
  });

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
      <div className="container mx-auto px-4 py-4 sm:px-6 lg:px-8">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-xl border border-border/70 bg-background/85 p-2.5 md:col-span-2 xl:col-span-1">
            <div className="flex items-center gap-2.5">
              <ThemeAwareLogo alt={t("site.logoAlt")} className="h-8 w-auto" />
              <p className="text-sm font-semibold text-foreground">{t("site.title")}</p>
            </div>
            <p className="mt-1.5 max-w-xs text-sm leading-5 text-foreground/75">{t("footer.description")}</p>
          </div>

          <div className="rounded-xl border border-border/70 bg-background/85 p-2.5">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/75">{t("footer.indexTrading")}</p>
            <div className="mb-1.5 flex flex-wrap gap-1.5">
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
              className="inline-flex w-full items-center justify-center gap-1 rounded-full border border-primary/35 bg-primary/10 px-2 py-1.5 text-sm font-medium transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              {COUNTRY_FLAGS.map(({ code, flag }) => (
                <span key={`arb-${code}`} className="text-base" aria-hidden="true">
                  {flag}
                </span>
              ))}
            </Link>
          </div>

          <div className="grid gap-2.5">
            <div className="rounded-xl border border-border/70 bg-background/85 p-2.5">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/75">{t("footer.optionsTrading")}</p>
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
            <div className="rounded-xl border border-border/70 bg-background/85 p-2.5">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/75">{t("footer.marketData")}</p>
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
          </div>

          <Link
            href="/deck"
            className="group relative overflow-hidden rounded-xl border border-primary/45 bg-gradient-to-br from-primary/15 via-background/90 to-gold/15 p-2.5 shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/70 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            aria-label="Open Cropto partner and investor deck"
          >
            <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/45 to-transparent" />
            <span className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-primary/12 to-transparent opacity-0 transition-all duration-1000 group-hover:left-full group-hover:opacity-100 motion-reduce:hidden" />
            <div className="mb-1.5 flex items-center justify-between">
              <Badge variant="outline" className="border-primary/40 bg-primary/10 text-[10px] font-semibold uppercase tracking-wide text-foreground/85">
                Partner / Investor
              </Badge>
              <FileText className="h-4 w-4 text-foreground/65 transition-colors group-hover:text-primary" aria-hidden="true" />
            </div>
            <p className="text-[15px] font-semibold text-foreground">Cropto Deck</p>
            <p className="mt-1 text-sm leading-5 text-foreground/78">Market thesis, roadmap, investor overview.</p>
            <div className="mt-1.5 flex items-center gap-2 text-[11px] text-foreground/65">
              <span>Slides + PDF</span>
            </div>
            <p className="mt-1 text-sm font-semibold text-primary">
              Open deck
              <span className="ml-1 inline-block transition-transform duration-300 group-hover:translate-x-0.5 motion-reduce:transform-none">→</span>
            </p>
          </Link>

          <div className="rounded-xl border border-border/70 bg-background/85 p-2.5">
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
              {moreLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="truncate text-sm text-foreground/72 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  {item.label}
                </Link>
              ))}
            </div>
            <Link
              href="/monitor"
              className="mt-2 inline-flex w-full items-center justify-center rounded-md border border-primary/60 bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              Open Monitor
            </Link>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-1.5 border-t border-border/60 pt-2.5 text-xs text-foreground/65 md:flex-row md:items-center md:justify-between">
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
          <div className="text-right">
            <p>© 2026 {t("site.title")}. {t("footer.allRightsReserved")}</p>
            {showBuildInfo ? (
              <p className="text-[11px]">
                build: {versionInfo?.gitSha?.slice(0, 12) || "unknown"} · {versionInfo?.buildTime || "n/a"}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </footer>
  );
}
