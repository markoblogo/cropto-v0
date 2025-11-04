import { Button } from "@/components/ui/button";
import { ArrowRight, PlayCircle } from "lucide-react";

interface HeroProps {
  onCreateOption: () => void;
}

export function Hero({ onCreateOption }: HeroProps) {
  return (
    <div className="relative overflow-hidden bg-background">
      {/* Background Image with Dark Overlay */}
      <div 
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: 'url(/cropto-cover.png)' }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-black/80 via-black/70 to-black/60" />
      </div>

      {/* Content */}
      <div className="relative container mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 lg:py-36">
        <div className="max-w-4xl">
          {/* Main Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight" data-testid="text-hero-headline">
            Cropto — Simple NFT options for grain markets
          </h1>

          {/* Subheadline */}
          <p className="text-lg sm:text-xl text-white/90 mb-8 max-w-2xl" data-testid="text-hero-subhead">
            Trade agricultural commodity options with transparency, flexibility, and institutional-grade infrastructure. Create, match, and settle options in minutes.
          </p>

          {/* CTAs */}
          <div className="flex flex-wrap gap-4">
            <Button
              size="lg"
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              onClick={onCreateOption}
              data-testid="button-hero-create-option"
            >
              Create Option
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>

            <Button
              size="lg"
              variant="outline"
              className="bg-white/10 hover:bg-white/20 text-white border-white/30 backdrop-blur-sm font-semibold"
              onClick={() => {
                // Scroll to options table
                const tableElement = document.getElementById('options-table');
                tableElement?.scrollIntoView({ behavior: 'smooth' });
              }}
              data-testid="button-hero-try-demo"
            >
              <PlayCircle className="mr-2 h-5 w-5" />
              Try Demo
            </Button>
          </div>

          {/* Trust Indicators */}
          <div className="mt-12 pt-8 border-t border-white/20">
            <div className="flex flex-wrap gap-8 text-white/70">
              <div>
                <div className="text-2xl font-bold text-white font-mono">24/7</div>
                <div className="text-sm">Trading Hours</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-white font-mono">$0</div>
                <div className="text-sm">Platform Fees</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-white font-mono">Instant</div>
                <div className="text-sm">Settlement</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
