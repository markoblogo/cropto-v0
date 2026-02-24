import { DECK_ECOSYSTEM_LINKS } from "@/components/deck/deck-content";

export function DeckEcosystemStrip() {
  return (
    <section className="border-t border-border/60 py-10">
      <div className="container mx-auto space-y-4 px-4 sm:px-6 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Ecosystem</p>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {DECK_ECOSYSTEM_LINKS.map((item) => (
            <a
              key={item.label}
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="group rounded-xl border border-border/70 bg-card/65 px-4 py-3 transition-all hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-md"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">{item.label}</p>
                <span className="text-xs text-muted-foreground transition-colors group-hover:text-primary">Open</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
