import { Link } from "wouter";
import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CROPTO_DECK_HERO_IMAGES } from "@/components/deck/deck-content";

export function InvestorDeckCallout() {
  const previewImage = CROPTO_DECK_HERO_IMAGES[1]?.src || CROPTO_DECK_HERO_IMAGES[0]?.src || "/cropto-cover.png";

  return (
    <Link
      href="/deck"
      aria-label="Open Cropto partner and investor deck"
      className="group relative block overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-br from-background/95 via-card to-muted/50 p-3 shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 md:p-3.5"
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      <span className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-primary/10 to-transparent opacity-0 transition-all duration-1000 group-hover:left-full group-hover:opacity-100 motion-reduce:hidden" />
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-20 overflow-hidden border-l border-white/15 sm:block">
        <img src={previewImage} alt="" aria-hidden="true" className="h-full w-full object-cover opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-l from-black/45 via-black/20 to-transparent dark:from-black/62 dark:via-black/30 dark:to-transparent" />
      </div>

      <div className="relative flex items-start justify-between gap-3 pr-0 sm:pr-20">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className="border border-primary/30 bg-primary/10 text-[10px] font-semibold uppercase tracking-wide text-foreground/90">
              Partner / Investor
            </Badge>
            <Badge variant="outline" className="hidden border-border/80 bg-background/70 text-[10px] uppercase tracking-wide text-foreground/80 lg:inline-flex">
              Slides + PDF
            </Badge>
          </div>
          <p className="text-base font-semibold leading-tight text-foreground md:text-[17px]">Cropto Deck</p>
          <p className="text-xs leading-5 text-muted-foreground md:text-sm md:leading-6">
            Market thesis, product roadmap, and investor overview.
          </p>
          <div className="hidden items-center gap-2 text-[11px] text-muted-foreground sm:flex lg:hidden">
            <span>English only</span>
            <span aria-hidden="true">•</span>
            <span>Slides + PDF</span>
          </div>
          <p className="inline-flex items-center pt-0.5 text-sm font-semibold text-primary">
            Open deck
            <span className="ml-1 transition-transform duration-300 group-hover:translate-x-0.5 motion-reduce:transform-none">→</span>
          </p>
        </div>

        <div className="rounded-md border border-border/75 bg-muted/45 p-1.5 text-muted-foreground transition-colors group-hover:border-primary/35 group-hover:text-primary">
          <FileText className="h-4 w-4" aria-hidden="true" />
        </div>
      </div>
    </Link>
  );
}
