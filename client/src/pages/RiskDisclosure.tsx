import { MainLayout } from "@/components/layouts/MainLayout";
import { useTranslation } from "react-i18next";

export default function RiskDisclosure() {
  const { t } = useTranslation();

  return (
    <MainLayout>
      <div className="space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">{t("page.risk.title")}</h1>
          <p className="text-muted-foreground">
            {t("page.risk.lastUpdated")}
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">{t("page.risk.general.title")}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {t("page.risk.general.body")}
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">{t("page.risk.market.title")}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {t("page.risk.market.body")}
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">{t("page.risk.counterparty.title")}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {t("page.risk.counterparty.body")}
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">{t("page.risk.performance.title")}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {t("page.risk.performance.body")}
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">{t("page.risk.demo.title")}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {t("page.risk.demo.body")}
          </p>
        </section>
      </div>
    </MainLayout>
  );
}
