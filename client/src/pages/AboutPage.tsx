import { useTranslation } from "react-i18next";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { BackToDashboard } from "@/components/BackToDashboard";
import { MarkdownSection } from "@/components/MarkdownSection";
import FlagSwitcher from "@/components/FlagSwitcher";
import { FileText } from "lucide-react";

export default function AboutPage() {
  const { i18n } = useTranslation();
  const currentLang = i18n.language === 'uk' ? 'uk' : 'en';
  
  const aboutSrc = `/docs/about.${currentLang}.md`;
  const faqSrc = `/docs/faq.${currentLang}.md`;

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
            {/* About Section */}
            <div key={`about-${currentLang}`} data-testid="section-about-content">
              <MarkdownSection src={aboutSrc} />
            </div>

            {/* Separator */}
            <Separator className="my-8" />

            {/* FAQ Section */}
            <div id="faq-section" className="scroll-mt-20" key={`faq-${currentLang}`} data-testid="section-faq-content">
              <MarkdownSection src={faqSrc} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
