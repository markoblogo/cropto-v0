import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BackToDashboard } from "@/components/BackToDashboard";
import FlagSwitcher from "@/components/FlagSwitcher";
import MockModeBanner from "@/components/MockModeBanner";
import { FileText } from "lucide-react";

export default function TestingPage() {
  const { i18n } = useTranslation();
  const currentLang = i18n.language === 'uk' ? 'uk' : 'en';
  
  const [testingContent, setTestingContent] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadMarkdown = async () => {
      setLoading(true);
      try {
        const testingFile = `/docs/testing.${currentLang}.md`;
        const response = await fetch(testingFile);

        if (response.ok) {
          const text = await response.text();
          setTestingContent(text);
        } else {
          setTestingContent(`# Error\nFailed to load ${testingFile}`);
        }
      } catch (error) {
        console.error("Error loading markdown file:", error);
        setTestingContent("# Error\nFailed to load testing guide");
      } finally {
        setLoading(false);
      }
    };

    loadMarkdown();
  }, [currentLang]);

  return (
    <div className="min-h-screen bg-background">
      <Header onCreateOption={() => {}} />
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-4">
          <BackToDashboard />
        </div>

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
            {loading ? (
              <div className="py-8 text-center text-muted-foreground">
                {currentLang === 'uk' ? 'Завантаження...' : 'Loading...'}
              </div>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none" data-testid="section-testing-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {testingContent}
                </ReactMarkdown>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
