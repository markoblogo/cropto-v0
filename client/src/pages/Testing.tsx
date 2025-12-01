import { useTranslation } from "react-i18next";
import { MainLayout } from "@/components/layouts/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MarkdownSection } from "@/components/MarkdownSection";
import FlagSwitcher from "@/components/FlagSwitcher";
import MockModeBanner from "@/components/MockModeBanner";
import { FileText } from "lucide-react";

export default function TestingPage() {
  const { i18n } = useTranslation();
  const currentLang = i18n.language === 'uk' ? 'uk' : 'en';
  
  const testingSrc = `/docs/testing.${currentLang}.md`;

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto">
        <MockModeBanner />

        <Card className="mt-4">
          <CardHeader>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <CardTitle className="text-3xl font-bold flex items-center gap-2">
                <FileText className="w-8 h-8" />
                {currentLang === 'uk' ? 'Інструкція з тестування' : 'Testing Guide'}
              </CardTitle>
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
