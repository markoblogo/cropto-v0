import { CROPTO_MAIN_SITE_URL, DECK_PAGE_COPY } from "@/components/deck/deck-content";

export function DeckFooter() {
  return (
    <footer className="border-t border-border/60 bg-muted/55">
      <div className="container mx-auto grid gap-4 px-4 py-8 sm:px-6 lg:grid-cols-[1.4fr_1fr] lg:px-8">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <img src="/cropto-logo.png" alt="Cropto" className="h-8 w-auto" />
            <p className="text-base font-semibold">Cropto</p>
          </div>
          <p className="max-w-xl text-sm text-muted-foreground">
            This page is dedicated to partner and investor discussions around Cropto's market model and product direction.
          </p>
          <p className="text-xs text-muted-foreground">{DECK_PAGE_COPY.footerNote}</p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Links</p>
          <div className="flex flex-col gap-1 text-sm">
            <a className="text-muted-foreground transition-colors hover:text-foreground" href={CROPTO_MAIN_SITE_URL} target="_blank" rel="noreferrer">
              Back to Cropto site
            </a>
            <a className="text-muted-foreground transition-colors hover:text-foreground" href="#deck">
              View deck section
            </a>
            <a className="text-muted-foreground transition-colors hover:text-foreground" href="#contact">
              Contact section
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
