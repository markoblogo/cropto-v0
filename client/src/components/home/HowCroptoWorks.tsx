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
    <section className="py-12 bg-muted/50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-tight mb-2">
            {t('home.how.title')}
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            {t('home.how.subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {steps.map((step) => (
            <Card key={step.num} className="flex flex-col">
              <CardHeader>
                <div className="flex items-center gap-4 mb-2">
                  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary">
                    <step.Icon className="h-6 w-6" />
                  </div>
                  <div className="text-2xl font-bold text-muted-foreground">
                    {step.num}
                  </div>
                </div>
                <CardTitle className="text-xl">{step.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  {step.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* CTA Button */}
        <div className="text-center">
          <Button
            size="lg"
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