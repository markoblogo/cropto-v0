import type { MouseEvent } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ThemeAwareLogo } from "@/components/ThemeAwareLogo";
import { Button } from "@/components/ui/button";
import type { DeckNavItem } from "@/components/deck/deck-content";
import { CROPTO_MAIN_SITE_URL } from "@/components/deck/deck-content";

interface DeckHeaderProps {
  navItems: DeckNavItem[];
}

function scrollToAnchor(event: MouseEvent<HTMLAnchorElement>, href: string) {
  if (!href.startsWith("#")) {
    return;
  }

  const target = document.querySelector(href);
  if (!target) {
    return;
  }

  event.preventDefault();
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
  window.history.replaceState(null, "", href);
}

export function DeckHeader({ navItems }: DeckHeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container mx-auto flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <a href="#overview" className="flex items-center gap-3 rounded-md px-1 py-1 hover-elevate">
          <ThemeAwareLogo alt="Cropto" className="h-8 w-auto" />
          <span className="hidden text-base font-semibold sm:inline">Cropto</span>
        </a>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Deck sections">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={(event) => scrollToAnchor(event, item.href)}
              className="rounded-md px-3 py-2 text-[14px] font-medium text-foreground/90 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="default" size="sm" asChild>
            <a href="/monitor">
              Open Monitor
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={CROPTO_MAIN_SITE_URL} target="_blank" rel="noreferrer">
              Back to Cropto
            </a>
          </Button>
        </div>
      </div>

      <div className="border-t border-border/60 lg:hidden">
        <nav className="container mx-auto flex gap-2 overflow-x-auto px-4 py-2 sm:px-6" aria-label="Deck sections mobile">
          {navItems.map((item) => (
            <a
              key={`${item.href}-mobile`}
              href={item.href}
              onClick={(event) => scrollToAnchor(event, item.href)}
              className="shrink-0 rounded-full border border-border/70 bg-card px-3 py-1.5 text-sm font-medium text-foreground/85 transition-colors hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
