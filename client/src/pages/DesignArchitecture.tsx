import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const mockScreens = [
  { src: "/assets/designs/design-1.png", caption: "Dashboard - Light & Dark Mode Overview", description: "Main dashboard showing total options, open positions, and total volume stats with options book table" },
  { src: "/assets/designs/design-2.png", caption: "Options Book - Dark Mode", description: "Detailed options listing with type badges, premiums, expiry dates, and status indicators" },
  { src: "/assets/designs/design-3.png", caption: "Create Option Dialog - Dark Mode", description: "Form for creating new options contracts with commodity selection and collateral upload" },
  { src: "/assets/designs/design-4.png", caption: "Match Flow", description: "Buyer-seller matching interface with transaction confirmation" },
  { src: "/assets/designs/design-5.png", caption: "Exercise Settlement", description: "Option exercise workflow showing spot price input and P&L calculations" },
  { src: "/assets/designs/design-6.png", caption: "Mobile Responsive Views", description: "Mobile-first design showing dashboard, options list, and navigation patterns" },
  { src: "/assets/designs/design-7.png", caption: "Wallet Connection", description: "Wallet integration dialog with address input and validation" },
  { src: "/assets/designs/design-8.png", caption: "Documentation Page", description: "Product documentation with feature guides and partner information" },
];

export default function DesignArchitecture() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img 
                src="/cropto-logo.png" 
                alt="Cropto" 
                className="h-10 w-auto"
                data-testid="img-cropto-logo"
              />
              <div>
                <p className="text-xs text-muted-foreground">Design & Architecture</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/">
                <button 
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-input bg-background hover-elevate active-elevate-2"
                  data-testid="button-back-dashboard"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Dashboard
                </button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          <div>
            <h1 className="text-4xl font-bold mb-4">Design & Architecture Gallery</h1>
            <p className="text-lg text-muted-foreground mb-6">
              Cropto platform UI/UX mockups showcasing the commodity options trading interface, 
              dark/light modes, and responsive design patterns.
            </p>
            <div className="prose dark:prose-invert max-w-none">
              <h2 className="text-2xl font-bold mb-3">Brand Assets</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <Card>
                  <CardHeader>
                    <CardTitle>Cropto Logo</CardTitle>
                    <CardDescription>Main brand logo with wheat grain icon</CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center justify-center p-8 bg-muted rounded-md">
                    <img src="/cropto-logo.png" alt="Cropto Logo" className="h-24 w-auto" />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Cover Pattern</CardTitle>
                    <CardDescription>Wheat field and sailboat pattern for backgrounds</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0 overflow-hidden rounded-md">
                    <img src="/assets/designs/cropto-cover.png" alt="Cropto Cover" className="w-full h-48 object-cover" />
                  </CardContent>
                </Card>
              </div>

              <h2 className="text-2xl font-bold mb-3">Color Palette</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="text-center">
                  <div className="h-20 rounded-md bg-white border-2 border-border mb-2"></div>
                  <p className="text-sm font-mono">#FFFFFF</p>
                  <p className="text-xs text-muted-foreground">White (Light BG)</p>
                </div>
                <div className="text-center">
                  <div className="h-20 rounded-md bg-[#0b0b0b] border-2 border-border mb-2"></div>
                  <p className="text-sm font-mono">#0B0B0B</p>
                  <p className="text-xs text-muted-foreground">Black (Dark BG)</p>
                </div>
                <div className="text-center">
                  <div className="h-20 rounded-md bg-[#9AA33A] border-2 border-border mb-2"></div>
                  <p className="text-sm font-mono">#9AA33A</p>
                  <p className="text-xs text-muted-foreground">Olive (Accent)</p>
                </div>
                <div className="text-center">
                  <div className="h-20 rounded-md bg-[#111111] border-2 border-border mb-2"></div>
                  <p className="text-sm font-mono">#111111</p>
                  <p className="text-xs text-muted-foreground">Text (Primary)</p>
                </div>
              </div>

              <h2 className="text-2xl font-bold mb-3">UI Mockups</h2>
              <p className="text-muted-foreground mb-6">
                Explore the complete set of UI mockups showing various features including dashboard, 
                options creation, contract management, and transaction tracking.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {mockScreens.map((screen, index) => (
              <Card key={index} data-testid={`card-mockup-${index}`}>
                <CardHeader>
                  <CardTitle className="text-lg">{screen.caption}</CardTitle>
                  <CardDescription>{screen.description}</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <img 
                    src={screen.src} 
                    alt={screen.caption}
                    className="w-full h-auto rounded-b-lg"
                    data-testid={`img-mockup-${index}`}
                  />
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-12">
            <Card>
              <CardHeader>
                <CardTitle>Additional Resources</CardTitle>
                <CardDescription>Documentation and design specifications</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  For complete design documentation including component specifications, spacing systems, 
                  and implementation guidelines, refer to the <code className="text-xs bg-muted px-2 py-1 rounded">docs/design-architecture.md</code> file in the repository.
                </p>
                <p className="text-sm text-muted-foreground">
                  Additional design assets and Figma files can be found in the project's design documentation.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
