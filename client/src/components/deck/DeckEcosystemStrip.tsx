import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DECK_ECOSYSTEM_LINKS } from "@/components/deck/deck-content";

export function DeckEcosystemStrip() {
  return (
    <section className="border-t border-border/60 py-9">
      <div className="container mx-auto space-y-4 px-4 sm:px-6 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground/70">Ecosystem</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {DECK_ECOSYSTEM_LINKS.map((item) => (
            <a
              key={item.label}
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="group relative overflow-hidden rounded-xl border border-black/85 dark:border-white/85 bg-gradient-to-br from-muted/80 via-card to-primary/10 px-4 py-3.5 shadow-md transition-all duration-300 hover:-translate-y-1 hover:border-primary/55 hover:shadow-xl hover:shadow-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <span className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-primary/20 to-transparent opacity-0 transition-all duration-1000 group-hover:left-full group-hover:opacity-100 motion-reduce:hidden" />
              <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
              <div className="relative flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <Badge variant="outline" className="border-primary/45 bg-primary/15 text-[10px] font-semibold uppercase tracking-wide text-foreground/95">
                    {item.tag}
                  </Badge>
                  <p className="text-[15px] font-semibold leading-6 text-foreground">{item.label}</p>
                  <p className="text-sm leading-6 text-foreground/78">{item.description}</p>
                </div>
                <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-foreground/70 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary motion-reduce:transform-none" />
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
