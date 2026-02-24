import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DECK_ECOSYSTEM_LINKS } from "@/components/deck/deck-content";

export function DeckEcosystemStrip() {
  return (
    <section className="border-t border-border/60 py-11">
      <div className="container mx-auto space-y-5 px-4 sm:px-6 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Ecosystem</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {DECK_ECOSYSTEM_LINKS.map((item) => (
            <a
              key={item.label}
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="group relative overflow-hidden rounded-xl border border-border/75 bg-gradient-to-b from-card to-muted/35 px-4 py-3.5 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <span className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-primary/10 to-transparent opacity-0 transition-all duration-1000 group-hover:left-full group-hover:opacity-100 motion-reduce:hidden" />
              <div className="relative flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                    {item.tag}
                  </Badge>
                  <p className="text-sm font-semibold leading-6">{item.label}</p>
                  <p className="text-xs leading-6 text-muted-foreground">{item.description}</p>
                </div>
                <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
