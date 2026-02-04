import { useTranslation } from "react-i18next";
import { MainLayout } from "@/components/layouts/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MarkdownSection } from "@/components/MarkdownSection";
import FlagSwitcher from "@/components/FlagSwitcher";
import MockModeBanner from "@/components/MockModeBanner";
import { FileText } from "lucide-react";

export default function TestingPage() {
  const { t, i18n } = useTranslation();
  const normalizedLang = (i18n.resolvedLanguage || i18n.language || 'en').split('-')[0];
  const currentLang = normalizedLang === 'uk' ? 'uk' : 'en';
  
  const testingSrc = `/docs/testing.${currentLang}.md`;

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto">
        <MockModeBanner />

        {/* Header Section */}
        <div className="mb-4">
          <h1 className="text-3xl font-bold tracking-tight">{t('page.testing.title')}</h1>
          <p className="text-muted-foreground mt-2">
            {t('page.testing.subtitle')}
          </p>
        </div>

        <Card className="mt-4">
          <CardHeader>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <FileText className="w-8 h-8" />
              </div>
              <FlagSwitcher />
            </div>
          </CardHeader>
          <CardContent>
            <div key={`testing-${currentLang}`} data-testid="section-testing-content">
              <MarkdownSection src={testingSrc} />
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
