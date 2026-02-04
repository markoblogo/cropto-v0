import { MainLayout } from "@/components/layouts/MainLayout";
import { useTranslation } from "react-i18next";

export default function TermsOfUse() {
  const { t } = useTranslation();

  return (
    <MainLayout>
      <div className="space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">{t("page.terms.title")}</h1>
          <p className="text-muted-foreground">
            {t("page.terms.lastUpdated")}
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">{t("page.terms.scope.title")}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {t("page.terms.scope.body")}
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">{t("page.terms.nonProduction.title")}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {t("page.terms.nonProduction.body")}
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">{t("page.terms.noAdvice.title")}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {t("page.terms.noAdvice.body")}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">{t("page.terms.responsibilities.title")}</h2>
          <ul className="list-disc list-inside text-muted-foreground space-y-1">
            <li>{t("page.terms.responsibilities.list.accurateInfo")}</li>
            <li>{t("page.terms.responsibilities.list.noAbuse")}</li>
            <li>{t("page.terms.responsibilities.list.demoOnly")}</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">{t("page.terms.ip.title")}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {t("page.terms.ip.body")}
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">{t("page.terms.liability.title")}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {t("page.terms.liability.body")}
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">{t("page.terms.payment.title")}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {t("page.terms.payment.body")}
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">{t("page.terms.product.title")}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {t("page.terms.product.body")}
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">{t("page.terms.spotForward.title")}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {t("page.terms.spotForward.body")}
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">{t("page.terms.fees.title")}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {t("page.terms.fees.body")}
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">{t("page.terms.disclaimer.title")}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {t("page.terms.disclaimer.body")}
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">{t("page.terms.governingLaw.title")}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {t("page.terms.governingLaw.body")}
          </p>
        </section>
      </div>
    </MainLayout>
  );
}
