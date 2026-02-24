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
    <section id="overview" className="scroll-mt-24 border-b border-border/60">
      <div className="relative isolate overflow-hidden">
        {slides.map((slide, index) => (
          <div
            key={`${slide.src}-${index}`}
            className="absolute inset-0 transition-opacity duration-1000 motion-reduce:transition-none"
            style={{ opacity: index === activeIndex ? 1 : 0 }}
            aria-hidden={index !== activeIndex}
          >
            <img src={slide.src} alt={slide.alt} className="h-full w-full object-cover" />
          </div>
        ))}

        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/62 to-black/35 dark:from-black/88 dark:via-black/72 dark:to-black/40" />
        <div className="absolute inset-y-0 left-0 w-[58%] bg-gradient-to-r from-black/50 to-transparent" />

        <div className="relative container mx-auto px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
          <div className="max-w-3xl rounded-2xl border border-white/22 bg-black/42 p-6 shadow-2xl backdrop-blur-[4px] sm:p-7 lg:p-8">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-primary">Partner & Investor Page</p>
            <h1 className="text-3xl font-semibold leading-[1.08] tracking-tight text-white sm:text-4xl lg:text-5xl [text-shadow:0_2px_16px_rgba(0,0,0,0.45)]">
              {DECK_PAGE_COPY.heroTitle}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-white/95 sm:text-lg">{DECK_PAGE_COPY.heroSubtitle}</p>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/86 sm:text-base">{DECK_PAGE_COPY.heroMicrocopy}</p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button
                size="lg"
                className="bg-amber-300 text-amber-950 shadow-lg shadow-black/30 transition-all duration-300 hover:-translate-y-0.5 hover:bg-amber-200 hover:shadow-xl"
                onClick={onViewDeck}
              >
                {DECK_PAGE_COPY.viewDeckCta}
              </Button>
              <Button size="lg" className="border border-lime-300/70 bg-lime-300/90 text-lime-950 shadow-md shadow-black/20 transition-all duration-300 hover:-translate-y-0.5 hover:bg-lime-200" asChild>
                <a href={CROPTO_MAIN_SITE_URL} target="_blank" rel="noreferrer">
                  {DECK_PAGE_COPY.exploreProductCta}
                </a>
              </Button>
            </div>
          </div>

          {slides.length > 1 ? (
            <div className="mt-6 flex items-center gap-2">
              {slides.map((_, index) => (
                <span
                  key={`dot-${index}`}
                  className={`h-1.5 rounded-full transition-all duration-300 ${index === activeIndex ? "w-8 bg-primary" : "w-3 bg-white/45"}`}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
