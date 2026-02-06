import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Wallet, Search, Calendar, FileText, DollarSign, BarChart3 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const stepIcons = {
  1: Wallet,
  2: Search,
  3: Calendar,
  4: FileText,
  5: DollarSign,
  6: BarChart3,
};

export function HowCroptoWorks() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  const steps = [1, 2, 3, 4, 5, 6].map((num) => {
    const Icon = stepIcons[num as keyof typeof stepIcons];
    return {
      num,
      Icon,
      title: t(`home.how.steps.${num}.title`),
      description: t(`home.how.steps.${num}.description`),
    };
  });

  const handleStartTrading = () => {
    // Navigate to forward market (Index Trading)
    setLocation("/forward-market");
  };

  return (
    <section className="py-7 bg-muted/40">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-bold tracking-tight mb-1">
            {t('home.how.title')}
          </h2>
          <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
            {t('home.how.subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          {steps.map((step) => (
            <Card key={step.num} className="flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary">
                    <step.Icon className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-base">{step.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <CardDescription className="text-sm leading-5">
                  {step.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* CTA Button */}
        <div className="text-center">
          <Button
            size="sm"
            onClick={handleStartTrading}
            className="font-semibold"
          >
            {t('home.how.cta.startTrading')}
          </Button>
        </div>
      </div>
    </section>
  );
}
