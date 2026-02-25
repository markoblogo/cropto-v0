import { ThemeAwareLogo } from "@/components/ThemeAwareLogo";

export function MonitorFooter() {
  return (
    <footer className="border-t border-border/60 bg-muted/55">
      <div className="container mx-auto px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-5">
          <div className="flex items-center gap-3">
            <ThemeAwareLogo alt="Cropto" className="h-8 w-auto shrink-0" />
            <p className="max-w-[520px] text-sm leading-5 text-foreground/80">
              Monitor page for commodity signals, live visuals, and market intelligence workflows in active prototype mode.
            </p>
          </div>

          <div className="space-y-1 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground/65">Links</p>
            <div className="flex flex-wrap items-center gap-x-2 text-foreground/78">
              <a className="transition-colors hover:text-foreground" href="https://cropto.abvx.xyz/" target="_blank" rel="noreferrer">
                Back to Cropto site
              </a>
              <span className="text-foreground/55" aria-hidden="true">,</span>
              <a className="transition-colors hover:text-foreground" href="/deck">
                Open deck
              </a>
              <span className="text-foreground/55" aria-hidden="true">,</span>
              <a className="transition-colors hover:text-foreground" href="#grain-markets-core">
                Grain markets core
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
