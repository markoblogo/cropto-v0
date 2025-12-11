import { Link } from "wouter";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-muted/50 border-t border-border mt-12">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid gap-8 md:grid-cols-3">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <img
                src="/CroptoBlackLogo-removebg-preview.png"
                alt="Cropto logo"
                className="h-10 w-auto"
              />
              <div>
                <p className="font-semibold text-foreground">Cropto</p>
                <p className="text-sm text-muted-foreground">Trade Commodities. On-Chain.</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Prototype platform for commodity derivatives trading. For demonstration and testing purposes only.
            </p>
          </div>

          <div className="space-y-3">
            <p className="font-semibold text-foreground">Navigation</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-muted-foreground">
              <Link href="/options" className="hover:text-foreground transition-colors">
                Option Trading
              </Link>
              <Link href="/spot-trading" className="hover:text-foreground transition-colors">
                Spot Trading
              </Link>
              <Link href="/market-data" className="hover:text-foreground transition-colors">
                Market Data
              </Link>
              <Link href="/education" className="hover:text-foreground transition-colors">
                Education
              </Link>
              <Link href="/portfolio" className="hover:text-foreground transition-colors">
                Portfolio
              </Link>
            </div>
          </div>

          <div className="space-y-3">
            <p className="font-semibold text-foreground">Legal &amp; Contacts</p>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <Link href="/privacy" className="hover:text-foreground transition-colors">
                Privacy Policy
              </Link>
              <Link href="/terms" className="hover:text-foreground transition-colors">
                Terms of Use
              </Link>
              <Link href="/risk-disclosure" className="hover:text-foreground transition-colors">
                Risk Disclosure
              </Link>
            </div>
            <p className="text-xs text-muted-foreground">
              © {year} Cropto. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

