import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  CROPTO_DECK_HERO_IMAGES,
  CROPTO_MAIN_SITE_URL,
  DECK_PAGE_COPY,
  type DeckHeroImage,
} from "@/components/deck/deck-content";

const FALLBACK_HERO_IMAGE: DeckHeroImage = {
  src: "/assets/designs/cropto-cover.png",
  alt: "Cropto commodity market network",
};

const HERO_ROTATION_MS = 6500;

interface DeckHeroProps {
  onViewDeck: () => void;
}

export function DeckHero({ onViewDeck }: DeckHeroProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const slides = useMemo(() => {
    return CROPTO_DECK_HERO_IMAGES.length > 0 ? CROPTO_DECK_HERO_IMAGES : [FALLBACK_HERO_IMAGE];
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);

    return () => {
      mediaQuery.removeEventListener("change", updatePreference);
    };
  }, []);

  useEffect(() => {
    if (slides.length <= 1 || prefersReducedMotion) {
      return;
    }

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % slides.length);
    }, HERO_ROTATION_MS);

    return () => window.clearInterval(timer);
  }, [slides.length, prefersReducedMotion]);

  return (
    <section id="overview" className="scroll-mt-24 border-b border-border/60 bg-gradient-to-b from-muted/50 via-background to-background">
      <div className="container mx-auto grid gap-7 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-10 lg:px-8">
        <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-card/35 p-6 shadow-xl backdrop-blur-[2px] sm:p-8">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-black/15 via-transparent to-transparent dark:from-white/5" />
          <p className="relative mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-primary">Partner & Investor Page</p>
          <h1 className="relative text-3xl font-semibold leading-tight tracking-tight sm:text-4xl lg:text-[2.8rem]">
            {DECK_PAGE_COPY.heroTitle}
          </h1>
          <p className="relative mt-5 max-w-2xl text-base leading-8 text-foreground/90 sm:text-lg">{DECK_PAGE_COPY.heroSubtitle}</p>
          <p className="relative mt-3 max-w-2xl text-sm leading-7 text-foreground/75">{DECK_PAGE_COPY.heroMicrocopy}</p>

          <div className="relative mt-7 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" className="transition-all hover:-translate-y-0.5 hover:shadow-lg" onClick={onViewDeck}>
              {DECK_PAGE_COPY.viewDeckCta}
            </Button>
            <Button size="lg" variant="outline" className="transition-all hover:-translate-y-0.5" asChild>
              <a href={CROPTO_MAIN_SITE_URL} target="_blank" rel="noreferrer">
                {DECK_PAGE_COPY.exploreProductCta}
              </a>
            </Button>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl">
          <div className="relative aspect-[16/10]">
            {slides.map((slide, index) => (
              <div
                key={`${slide.src}-${index}`}
                className="absolute inset-0 transition-opacity duration-1000 motion-reduce:transition-none"
                style={{ opacity: index === activeIndex ? 1 : 0 }}
                aria-hidden={index !== activeIndex}
              >
                <img src={slide.src} alt={slide.alt} className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-tr from-black/78 via-black/35 to-black/20" />
                <div className="absolute inset-y-0 left-0 w-3/5 bg-gradient-to-r from-black/48 to-transparent" />
              </div>
            ))}

            <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
              <p className="max-w-md text-sm font-medium leading-6 text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.45)] sm:text-base">
                Cropto builds risk transfer infrastructure for local commodity realities and scalable digital liquidity.
              </p>
              {slides.length > 1 ? (
                <div className="flex items-center gap-1.5 rounded-full bg-black/35 px-2 py-1 backdrop-blur">
                  {slides.map((_, index) => (
                    <span
                      key={`dot-${index}`}
                      className={`h-1.5 w-1.5 rounded-full transition-colors ${index === activeIndex ? "bg-white" : "bg-white/40"}`}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
