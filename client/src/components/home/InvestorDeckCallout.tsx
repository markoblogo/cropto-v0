import { Link } from "wouter";
import { useState } from "react";
import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const INVESTOR_DECK_THUMBNAIL_SRC = "/deck/hero/hero1.svg";

export function InvestorDeckCallout() {
  const [thumbLoaded, setThumbLoaded] = useState(true);

  return (
    <Link
      href="/deck"
      aria-label="Open Cropto partner and investor deck"
      className="group relative block overflow-hidden rounded-xl border border-primary/40 bg-gradient-to-br from-card via-card to-primary/10 p-3 shadow-[0_10px_24px_-18px_hsl(var(--primary)/0.65)] transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/65 hover:shadow-[0_20px_30px_-22px_hsl(var(--primary)/0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 md:p-3.5"
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
      <span className="pointer-events-none absolute inset-y-0 -left-2/3 w-2/5 -skew-x-12 bg-gradient-to-r from-transparent via-primary/15 to-transparent opacity-0 transition-all duration-1000 group-hover:left-full group-hover:opacity-100 motion-reduce:hidden" />

      <div className="relative grid grid-cols-[minmax(0,1fr)_96px] items-start gap-3 lg:grid-cols-[minmax(0,1fr)_88px] xl:grid-cols-[minmax(0,1fr)_102px]">
        <div className="space-y-2 pr-1">
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className="border border-primary/40 bg-primary/15 text-[10px] font-semibold uppercase tracking-wide text-foreground">
              Partner / Investor
            </Badge>
            <Badge variant="outline" className="hidden border-primary/30 bg-background/85 text-[10px] uppercase tracking-wide text-foreground/85 xl:inline-flex">
              Slides + PDF
            </Badge>
          </div>
          <p className="text-lg font-semibold leading-tight text-foreground">Cropto Deck</p>
          <p className="line-clamp-2 text-sm leading-5 text-foreground/85">
            Indexed trading, settlement infrastructure, and AMI ecosystem position.
          </p>
          <div className="hidden items-center gap-2 text-[11px] text-foreground/70 sm:flex xl:hidden">
            <span>English only</span>
            <span aria-hidden="true">•</span>
            <span>Slides + PDF</span>
          </div>
          <p className="inline-flex items-center rounded-md border border-primary/45 bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-all duration-300 group-hover:shadow-md group-hover:shadow-primary/30">
            Read investor brief
            <span className="ml-1 transition-transform duration-300 group-hover:translate-x-0.5 motion-reduce:transform-none">→</span>
          </p>
        </div>

        <div className="relative h-24 overflow-hidden rounded-lg border border-primary/25 bg-muted/60 lg:h-[88px] xl:h-[102px]">
          {thumbLoaded ? (
            <img
              src={INVESTOR_DECK_THUMBNAIL_SRC}
              alt=""
              aria-hidden="true"
              className="h-full w-full object-cover"
              loading="lazy"
              onError={() => setThumbLoaded(false)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/25 via-primary/10 to-background/50 text-primary/80">
              <FileText className="h-5 w-5" aria-hidden="true" />
            </div>
          )}
          <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/30 via-transparent to-transparent" />
          <div className="pointer-events-none absolute right-2 top-2 rounded-md border border-background/60 bg-background/70 p-1 text-muted-foreground backdrop-blur-sm transition-colors group-hover:text-primary">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          </div>
        </div>
      </div>
    </Link>
  );
}
