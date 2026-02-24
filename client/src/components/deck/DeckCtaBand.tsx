import { Button } from "@/components/ui/button";
import { CROPTO_MAIN_SITE_URL, DECK_PAGE_COPY } from "@/components/deck/deck-content";

interface DeckCtaBandProps {
  onViewDeck: () => void;
}

export function DeckCtaBand({ onViewDeck }: DeckCtaBandProps) {
  return (
    <section className="py-14 sm:py-16">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-2xl border border-primary/35 bg-[linear-gradient(120deg,hsl(var(--foreground))_0%,hsl(var(--foreground))_55%,hsl(var(--primary))_160%)] p-8 text-background shadow-2xl dark:bg-[linear-gradient(120deg,hsl(0_0%_14%)_0%,hsl(0_0%_18%)_55%,hsl(var(--primary)/0.35)_150%)]">
          <div className="max-w-3xl space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-background/75 dark:text-foreground/70">Next Step</p>
            <h3 className="text-2xl font-semibold leading-tight sm:text-3xl">{DECK_PAGE_COPY.ctaBandTitle}</h3>
            <p className="text-base leading-8 text-background/85 dark:text-foreground/85">{DECK_PAGE_COPY.ctaBandBody}</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                size="lg"
                variant="secondary"
                className="shadow-lg shadow-black/20 transition-all hover:-translate-y-0.5"
                onClick={onViewDeck}
              >
                {DECK_PAGE_COPY.viewDeckCta}
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-background/30 bg-transparent text-background hover:bg-background/10 dark:border-foreground/30 dark:text-foreground"
                asChild
              >
                <a href={CROPTO_MAIN_SITE_URL} target="_blank" rel="noreferrer">
                  {DECK_PAGE_COPY.exploreProductCta}
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
