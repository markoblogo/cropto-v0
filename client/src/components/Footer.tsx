import { Link } from "wouter";
import { useTranslation } from "react-i18next";

export function Footer() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <footer className="bg-muted/50 border-t border-border mt-12">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid gap-8 md:grid-cols-4">
          {/* Logo and Description */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <img
                src="/CroptoBlackLogo-removebg-preview.png"
                alt="Cropto logo"
                className="h-10 w-auto"
              />
              <div>
                <p className="font-semibold text-foreground">Cropto</p>
                <p className="text-sm text-muted-foreground">{t('footer.tagline')}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t('footer.description')}
            </p>
          </div>

          {/* Index Trading */}
          <div className="space-y-3">
            <p className="font-semibold text-foreground">{t('footer.indexTrading')}</p>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <Link href="/forward-market?country=ua" className="hover:text-foreground transition-colors">
                {t('footer.tradeIndexUA')}
              </Link>
              <Link href="/forward-market?country=br" className="hover:text-foreground transition-colors">
                {t('footer.tradeIndexBR')}
              </Link>
              <Link href="/forward-market?country=ar" className="hover:text-foreground transition-colors">
                {t('footer.tradeIndexAR')}
              </Link>
              <Link href="/arbitrage" className="hover:text-foreground transition-colors">
                {t('footer.tradeArbitrage')}
              </Link>
            </div>
          </div>

          {/* Options Trading */}
          <div className="space-y-3">
            <p className="font-semibold text-foreground">{t('footer.optionsTrading')}</p>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <Link href="/options?country=ua" className="hover:text-foreground transition-colors">
                {t('footer.tradeOptionsUA')}
              </Link>
              <Link href="/options?country=br" className="hover:text-foreground transition-colors">
                {t('footer.tradeOptionsBR')}
              </Link>
              <Link href="/options?country=ar" className="hover:text-foreground transition-colors">
                {t('footer.tradeOptionsAR')}
              </Link>
            </div>
          </div>

          {/* Market Data & Other */}
          <div className="space-y-3">
            <p className="font-semibold text-foreground">{t('footer.marketData')}</p>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground mb-4">
              <Link href="/market-data?country=ua" className="hover:text-foreground transition-colors">
                {t('footer.indexUA')}
              </Link>
              <Link href="/market-data?country=br" className="hover:text-foreground transition-colors">
                {t('footer.indexBR')}
              </Link>
              <Link href="/market-data?country=ar" className="hover:text-foreground transition-colors">
                {t('footer.indexAR')}
              </Link>
            </div>
            
            <p className="font-semibold text-foreground mt-4">{t('footer.other')}</p>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <Link href="/docs" className="hover:text-foreground transition-colors">
                {t('footer.documentation')}
              </Link>
              <Link href="/wallet" className="hover:text-foreground transition-colors">
                {t('footer.wallet')}
              </Link>
              <Link href="/education#faq" className="hover:text-foreground transition-colors">
                {t('footer.faq')}
              </Link>
              <Link href="/education" className="hover:text-foreground transition-colors">
                {t('footer.aboutCropto')}
              </Link>
            </div>
          </div>
        </div>

        {/* Legal & Copyright */}
        <div className="mt-8 pt-8 border-t border-border">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <Link href="/privacy" className="hover:text-foreground transition-colors">
                {t('footer.privacyPolicy')}
              </Link>
              <Link href="/terms" className="hover:text-foreground transition-colors">
                {t('footer.termsOfUse')}
              </Link>
              <Link href="/risk-disclosure" className="hover:text-foreground transition-colors">
                {t('footer.riskDisclosure')}
              </Link>
            </div>
            <p className="text-xs text-muted-foreground">
              © {year} Cropto. {t('footer.allRightsReserved')}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
