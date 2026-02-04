import { MainLayout } from "@/components/layouts/MainLayout";
import { useTranslation } from "react-i18next";

export default function PrivacyPolicy() {
  const { t } = useTranslation();

  return (
    <MainLayout>
      <div className="space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">{t("page.privacy.title")}</h1>
          <p className="text-muted-foreground">
            {t("page.privacy.lastUpdated")}
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">{t("page.privacy.introduction.title")}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {t("page.privacy.introduction.body")}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">{t("page.privacy.data.title")}</h2>
          <ul className="list-disc list-inside text-muted-foreground space-y-1">
            <li>{t("page.privacy.data.list.identification")}</li>
            <li>{t("page.privacy.data.list.technical")}</li>
            <li>{t("page.privacy.data.list.usage")}</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">{t("page.privacy.legal.title")}</h2>
          <ul className="list-disc list-inside text-muted-foreground space-y-1">
            <li>{t("page.privacy.legal.list.demoAccess")}</li>
            <li>{t("page.privacy.legal.list.support")}</li>
            <li>{t("page.privacy.legal.list.compliance")}</li>
          </ul>
          <p className="text-muted-foreground leading-relaxed">
            {t("page.privacy.legal.note")}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">{t("page.privacy.sharing.title")}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {t("page.privacy.sharing.body")}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">{t("page.privacy.security.title")}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {t("page.privacy.security.body")}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">{t("page.privacy.rights.title")}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {t("page.privacy.rights.body")}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">{t("page.privacy.changes.title")}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {t("page.privacy.changes.body")}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">{t("page.privacy.settlement.title")}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {t("page.privacy.settlement.body")}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">{t("page.privacy.identifiers.title")}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {t("page.privacy.identifiers.body")}
          </p>
        </section>
      </div>
    </MainLayout>
  );
}
