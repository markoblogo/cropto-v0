import { HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { DeckContactForm } from "@/components/deck/DeckContactForm";
import { DeckCtaBand } from "@/components/deck/DeckCtaBand";
import { DeckEcosystemStrip } from "@/components/deck/DeckEcosystemStrip";
import { DeckFooter } from "@/components/deck/DeckFooter";
import { DeckHeader } from "@/components/deck/DeckHeader";
import { DeckHero } from "@/components/deck/DeckHero";
import { DeckNativeVideo } from "@/components/deck/DeckNativeVideo";
import {
  CROPTO_DECK_PDF_URL,
  CROPTO_GOOGLE_SLIDES_EMBED_URL,
  CROPTO_GOOGLE_SLIDES_PUBLIC_URL,
  CROPTO_MAIN_SITE_URL,
  DECK_FAQ_ITEMS,
  DECK_NAV_ITEMS,
  DECK_PAGE_COPY,
  MARKET_MODEL_STEPS,
  PRODUCT_FEATURES,
  PROBLEM_BULLETS,
  TARGET_MARKETS,
  USE_CASES,
  WHY_NOW_POINTS,
} from "@/components/deck/deck-content";

function scrollToSection(sectionId: string) {
  const target = document.getElementById(sectionId);
  if (!target) {
    return;
  }

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
}

function SectionIntro({ label, title, body }: { label: string; title: string; body: string }) {
  return (
    <div className="max-w-3xl space-y-3">
      <Badge variant="secondary" className="mb-1 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-foreground/90">
        {label}
      </Badge>
      <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      <p className="text-base leading-8 text-foreground/88 sm:text-lg">{body}</p>
    </div>
  );
}

export default function DeckPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <DeckHeader navItems={DECK_NAV_ITEMS} />

      <main>
        <DeckHero onViewDeck={() => scrollToSection("deck")} />

        <section id="problem" className="scroll-mt-24 border-b border-border/60 py-14 sm:py-16 lg:py-20">
          <div className="container mx-auto space-y-8 px-4 sm:px-6 lg:px-8">
            <SectionIntro label="Problem" title={DECK_PAGE_COPY.problemTitle} body={DECK_PAGE_COPY.problemBody} />

            <p className="max-w-3xl text-base leading-8 text-foreground/82 sm:text-lg">{DECK_PAGE_COPY.problemBody2}</p>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {PROBLEM_BULLETS.map((item, index) => (
                <Card
                  key={item}
                  className={`border-black/85 dark:border-white/85 bg-gradient-to-b from-card to-muted/35 shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-lg ${
                    index === 0 ? "bg-gradient-to-br from-primary/15 via-card to-muted/30 shadow-lg shadow-primary/10" : ""
                  }`}
                >
                  <CardContent className="p-5">
                    <p className="text-base leading-7 text-foreground/92">{item}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="border-black/85 dark:border-white/85 bg-gradient-to-br from-primary/12 via-card to-muted/30 shadow-lg">
              <CardHeader>
                <CardTitle className="text-xl text-foreground">{DECK_PAGE_COPY.notEnoughTitle}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-base leading-8 text-foreground/90">{DECK_PAGE_COPY.notEnoughBody}</p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section id="product" className="scroll-mt-24 border-b border-border/60 py-14 sm:py-16 lg:py-20">
          <div className="container mx-auto space-y-8 px-4 sm:px-6 lg:px-8">
            <SectionIntro label="Product" title={DECK_PAGE_COPY.productTitle} body={DECK_PAGE_COPY.productBody} />
            <p className="max-w-3xl text-base leading-8 text-foreground/82 sm:text-lg">{DECK_PAGE_COPY.productBody2}</p>

            <div className="grid gap-4 md:grid-cols-2">
              {PRODUCT_FEATURES.map((item) => (
                <Card key={item.title} className="border-black/85 dark:border-white/85 bg-gradient-to-b from-card to-muted/35 shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-lg text-foreground">{item.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-base leading-7 text-foreground/82">{item.description}</CardDescription>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="border-black/85 dark:border-white/85 bg-gradient-to-b from-card to-muted/30 shadow-md">
              <CardHeader>
                <CardTitle className="text-foreground">{DECK_PAGE_COPY.marketScopeTitle}</CardTitle>
                  <CardDescription className="text-base leading-7 text-foreground/82">{DECK_PAGE_COPY.marketScopeBody}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2.5">
                  {TARGET_MARKETS.map((market) => (
                    <Badge key={market} className="rounded-full border border-amber-400 bg-amber-300 px-3 py-1 text-xs font-semibold text-amber-950 shadow-sm shadow-amber-500/20">
                      {market}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <h3 className="text-2xl font-semibold tracking-tight">{DECK_PAGE_COPY.useCasesTitle}</h3>
              <div className="grid gap-4 md:grid-cols-3">
                {USE_CASES.map((item) => (
                  <Card key={item.title} className="border-black/85 dark:border-white/85 bg-gradient-to-b from-card to-muted/35 shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-lg">
                    <CardHeader>
                      <CardTitle className="text-lg text-foreground">{item.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CardDescription className="text-base leading-7 text-foreground/82">{item.description}</CardDescription>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="h-full border-black/85 dark:border-white/85 bg-gradient-to-b from-card to-muted/30 shadow-md transition-all duration-300 hover:border-primary/45 hover:shadow-lg">
                <CardHeader>
                  <CardTitle className="text-foreground">{DECK_PAGE_COPY.whyNowTitle}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2.5 text-base leading-7 text-foreground/88">
                    {WHY_NOW_POINTS.map((item) => (
                      <li key={item} className="flex items-start gap-2.5">
                        <span className="mt-2 inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card className="h-full border-black/85 dark:border-white/85 bg-gradient-to-br from-muted/80 via-card to-primary/10 shadow-md transition-all duration-300 hover:border-primary/45 hover:shadow-lg flex flex-col">
                <CardHeader>
                  <CardTitle className="text-foreground">{DECK_PAGE_COPY.statusTitle}</CardTitle>
                </CardHeader>
                <CardContent className="flex-1">
                  <p className="text-base leading-8 text-foreground/90">{DECK_PAGE_COPY.statusBody}</p>
                </CardContent>
                <CardFooter className="pt-2">
                  <Button className="mt-auto w-fit bg-amber-300 text-amber-950 shadow-md shadow-primary/20 transition-all duration-300 hover:-translate-y-0.5 hover:bg-amber-200 hover:shadow-xl" asChild>
                    <a href={CROPTO_MAIN_SITE_URL} target="_blank" rel="noreferrer">
                      Explore current product environment
                    </a>
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </div>
        </section>

        <section id="market-model" className="scroll-mt-24 border-b border-border/60 py-14 sm:py-16 lg:py-20">
          <div className="container mx-auto space-y-8 px-4 sm:px-6 lg:px-8">
            <SectionIntro label="Market Model" title={DECK_PAGE_COPY.marketModelTitle} body={DECK_PAGE_COPY.marketModelIntro} />

            <div className="grid gap-4 lg:grid-cols-2">
              {MARKET_MODEL_STEPS.map((item) => (
                <Card key={item.title} className="border-black/85 dark:border-white/85 bg-gradient-to-b from-card to-muted/35 shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-base leading-7 text-foreground">{item.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-base leading-7 text-foreground/82">{item.description}</CardDescription>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="border-primary/45 bg-gradient-to-br from-primary/20 via-primary/8 to-card shadow-xl shadow-primary/15 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-2xl">
              <CardContent className="p-6 sm:p-8">
                <p className="text-lg font-semibold leading-8 text-foreground sm:text-xl">{DECK_PAGE_COPY.marketModelTakeaway}</p>
              </CardContent>
            </Card>
          </div>
        </section>

        <DeckNativeVideo />

        <section id="deck" className="scroll-mt-24 border-b border-border/60 py-14 sm:py-16 lg:py-20">
          <div className="container mx-auto space-y-6 px-4 sm:px-6 lg:px-8">
            <SectionIntro label="Deck" title={DECK_PAGE_COPY.deckTitle} body={DECK_PAGE_COPY.deckIntro} />

            <div className="overflow-hidden rounded-2xl border border-black/85 dark:border-white/85 bg-gradient-to-b from-muted/75 via-card to-card p-3 shadow-[0_18px_40px_rgba(0,0,0,0.24)] transition-all duration-300 hover:border-primary/35 dark:shadow-[0_18px_42px_rgba(0,0,0,0.5)] sm:p-4">
              <div className="mb-3 flex items-center justify-between rounded-lg border border-black/80 dark:border-white/80 bg-background/85 px-4 py-2.5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground/75">Partner Deck</p>
                <p className="text-xs text-foreground/65">Investor overview</p>
              </div>

              <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg border border-black/80 dark:border-white/80 bg-card">
                <iframe
                  title="Cropto investor deck"
                  src={CROPTO_GOOGLE_SLIDES_EMBED_URL}
                  className="h-full w-full"
                  allowFullScreen
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button className="shadow-lg shadow-primary/20 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl" asChild>
                <a href={CROPTO_DECK_PDF_URL} target="_blank" rel="noreferrer">
                  Download PDF
                </a>
              </Button>
              <Button variant="outline" className="transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-md" asChild>
                <a href={CROPTO_GOOGLE_SLIDES_PUBLIC_URL} target="_blank" rel="noreferrer">
                  Open in Google Slides
                </a>
              </Button>
            </div>
          </div>
        </section>

        <section id="faq" className="scroll-mt-24 border-b border-border/60 py-14 sm:py-16 lg:py-20">
          <div className="container mx-auto space-y-6 px-4 sm:px-6 lg:px-8">
            <SectionIntro label="FAQ" title={DECK_PAGE_COPY.faqTitle} body="Short answers to core partner and investor questions." />
            <div className="grid gap-4 md:grid-cols-2">
              {DECK_FAQ_ITEMS.map((item) => (
                <Card key={item.question} className="h-full border-black/85 dark:border-white/85 bg-gradient-to-b from-card to-muted/35 shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-lg">
                  <CardHeader className="pb-3">
                    <div className="mb-2 flex items-center gap-2 text-primary/90">
                      <HelpCircle className="h-4 w-4" aria-hidden="true" />
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground/65">Question</span>
                    </div>
                    <CardTitle className="text-lg leading-7 text-foreground">{item.question}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-base leading-7 text-foreground/83">{item.answer}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <DeckCtaBand onViewDeck={() => scrollToSection("deck")} />

        <section id="contact" className="scroll-mt-24 border-b border-border/60 py-14 sm:py-16 lg:py-20">
          <div className="container mx-auto space-y-6 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl space-y-4">
              <Badge variant="secondary" className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-foreground/90">
                Contact
              </Badge>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{DECK_PAGE_COPY.contactTitle}</h2>
              <p className="text-base leading-8 text-foreground/82 sm:text-lg">{DECK_PAGE_COPY.contactBody}</p>
              <div className="space-y-1 text-base leading-8 text-foreground/88">
                <p>For partnerships, pilot corridors, and investor conversations.</p>
                <p>We reply personally.</p>
              </div>
            </div>

            <DeckContactForm />
          </div>
        </section>

        <DeckEcosystemStrip />
      </main>

      <DeckFooter />
    </div>
  );
}
