import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { BackToDashboard } from "@/components/BackToDashboard";
import FlagSwitcher from "@/components/FlagSwitcher";
import { FileText } from "lucide-react";

export default function AboutPage() {
  const { i18n, t } = useTranslation();
  const currentLang = i18n.language === 'uk' ? 'uk' : 'en';
  
  const [aboutContent, setAboutContent] = useState<string>("");
  const [faqContent, setFaqContent] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadMarkdown = async () => {
      setLoading(true);
      try {
        const aboutFile = `/docs/about.${currentLang}.md`;
        const faqFile = `/docs/faq.${currentLang}.md`;
        
        const [aboutRes, faqRes] = await Promise.all([
          fetch(aboutFile),
          fetch(faqFile)
        ]);

        if (aboutRes.ok) {
          const aboutText = await aboutRes.text();
          setAboutContent(aboutText);
        } else {
          setAboutContent(`# Error\nFailed to load ${aboutFile}`);
        }

        if (faqRes.ok) {
          const faqText = await faqRes.text();
          setFaqContent(faqText);
        } else {
          setFaqContent(`# Error\nFailed to load ${faqFile}`);
        }
      } catch (error) {
        console.error("Error loading markdown files:", error);
        setAboutContent("# Error\nFailed to load documentation");
        setFaqContent("");
      } finally {
        setLoading(false);
      }
    };

    loadMarkdown();
  }, [currentLang]);

  const scrollToFaq = () => {
    const faqSection = document.getElementById("faq-section");
    if (faqSection) {
      faqSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header onCreateOption={() => {}} />
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-4">
          <BackToDashboard />
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <CardTitle className="text-3xl font-bold flex items-center gap-2">
                <FileText className="w-8 h-8" />
                {currentLang === 'uk' ? 'Про платформу' : 'About'}
              </CardTitle>
              <div className="flex items-center gap-3">
                <FlagSwitcher />
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={scrollToFaq}
                  data-testid="button-scroll-to-faq"
                >
                  {currentLang === 'uk' ? 'FAQ ↓' : 'View FAQ ↓'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-8 text-center text-muted-foreground">
                {currentLang === 'uk' ? 'Завантаження...' : 'Loading...'}
              </div>
            ) : (
              <>
                {/* About Section */}
                <div className="prose prose-sm dark:prose-invert max-w-none" data-testid="section-about-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {aboutContent}
                  </ReactMarkdown>
                </div>

                {/* Separator */}
                <Separator className="my-8" />

                {/* FAQ Section */}
                <div id="faq-section" className="scroll-mt-20">
                  <div className="prose prose-sm dark:prose-invert max-w-none" data-testid="section-faq-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {faqContent}
                    </ReactMarkdown>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
