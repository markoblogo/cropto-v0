import { Link } from "wouter";
import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function InvestorDeckCallout() {
  return (
    <Link
      href="/deck"
      aria-label="Open Cropto partner and investor deck"
      className="group relative block overflow-hidden rounded-xl border border-border/80 bg-card/80 p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      <span className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-primary/10 to-transparent opacity-0 transition-all duration-1000 group-hover:left-full group-hover:opacity-100 motion-reduce:hidden" />

      <div className="relative flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
            Partner / Investor
          </Badge>
          <p className="text-base font-semibold leading-tight">Cropto Deck</p>
          <p className="text-sm leading-6 text-muted-foreground">
            Market thesis, product roadmap, and investor overview.
          </p>
          <div className="hidden items-center gap-2 text-[11px] text-muted-foreground sm:flex">
            <span>English only</span>
            <span aria-hidden="true">•</span>
            <span>Slides + PDF</span>
          </div>
          <p className="pt-0.5 text-sm font-medium text-primary">Open deck →</p>
        </div>

        <div className="rounded-md border border-border/70 bg-muted/40 p-2 text-muted-foreground transition-colors group-hover:border-primary/30 group-hover:text-primary">
          <FileText className="h-4 w-4" aria-hidden="true" />
        </div>
      </div>
    </Link>
  );
}
