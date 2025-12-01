import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { MainLayout } from "@/components/layouts/MainLayout";
import { useTranslation } from "react-i18next";

export default function FAQ() {
  const { t } = useTranslation();
  
  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl font-bold">{t('faq.title')}</CardTitle>
            <CardDescription>
              {t('faq.subtitle')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="item-1" data-testid="faq-what-is-cropto">
                <AccordionTrigger>{t('faq.q1.question')}</AccordionTrigger>
                <AccordionContent>
                  {t('faq.q1.answer')}
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-2" data-testid="faq-how-to-create-option">
                <AccordionTrigger>{t('faq.q2.question')}</AccordionTrigger>
                <AccordionContent>
                  {t('faq.q2.answer')}
                  <ol className="list-decimal list-inside mt-2 space-y-1">
                    <li>{t('faq.q2.steps.1')}</li>
                    <li>{t('faq.q2.steps.2')}</li>
                    <li>{t('faq.q2.steps.3')}</li>
                    <li>{t('faq.q2.steps.4')}</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-3" data-testid="faq-what-is-matching">
                <AccordionTrigger>{t('faq.q3.question')}</AccordionTrigger>
                <AccordionContent>
                  {t('faq.q3.answer')}
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-4" data-testid="faq-nft-minting">
                <AccordionTrigger>{t('faq.q4.question')}</AccordionTrigger>
                <AccordionContent>
                  {t('faq.q4.answer')}
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-5" data-testid="faq-margin-calls">
                <AccordionTrigger>{t('faq.q5.question')}</AccordionTrigger>
                <AccordionContent>
                  {t('faq.q5.answer')}
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-6" data-testid="faq-roles">
                <AccordionTrigger>{t('faq.q6.question')}</AccordionTrigger>
                <AccordionContent>
                  {t('faq.q6.answer')}
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li><strong>{t('component.roleSelection.roles.farmer.title')}:</strong> {t('faq.q6.roles.farmer')}</li>
                    <li><strong>{t('component.roleSelection.roles.trader.title')}:</strong> {t('faq.q6.roles.trader')}</li>
                    <li><strong>{t('component.roleSelection.roles.broker.title')}:</strong> {t('faq.q6.roles.broker')}</li>
                  </ul>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-7" data-testid="faq-blockchain">
                <AccordionTrigger>{t('faq.q7.question')}</AccordionTrigger>
                <AccordionContent>
                  {t('faq.q7.answer')}
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>{t('faq.q7.features.1')}</li>
                    <li>{t('faq.q7.features.2')}</li>
                    <li>{t('faq.q7.features.3')}</li>
                  </ul>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-8" data-testid="faq-wallet-connection">
                <AccordionTrigger>{t('faq.q8.question')}</AccordionTrigger>
                <AccordionContent>
                  {t('faq.q8.answer')}
                  <ol className="list-decimal list-inside mt-2 space-y-1">
                    <li><strong>MetaMask:</strong> {t('faq.q8.methods.metamask')}</li>
                    <li><strong>{t('component.walletAuth.manual.title')}:</strong> {t('faq.q8.methods.manual')}</li>
                  </ol>
                  {t('faq.q8.note')}
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-9" data-testid="faq-portfolio">
                <AccordionTrigger>{t('faq.q9.question')}</AccordionTrigger>
                <AccordionContent>
                  {t('faq.q9.answer')}
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>{t('faq.q9.features.1')}</li>
                    <li>{t('faq.q9.features.2')}</li>
                    <li>{t('faq.q9.features.3')}</li>
                    <li>{t('faq.q9.features.4')}</li>
                  </ul>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-10" data-testid="faq-demo-accounts">
                <AccordionTrigger>{t('faq.q10.question')}</AccordionTrigger>
                <AccordionContent>
                  {t('faq.q10.answer')}
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>{t('faq.q10.accounts.farmer')}</li>
                    <li>{t('faq.q10.accounts.trader')}</li>
                    <li>{t('faq.q10.accounts.broker')}</li>
                  </ul>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
