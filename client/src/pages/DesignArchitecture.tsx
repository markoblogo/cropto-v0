import croptoLogo from "@assets/cropto logo_1762265015324.png";
import croptoCover from "@assets/cropto cover2_1762265015324.png";
import mockScreen1 from "@assets/082ab971-74f8-4903-96d7-4b44f7057302_1762265015324.png";
import mockScreen2 from "@assets/988642ab-2de5-42b0-9349-8e28f0dca690_1762265015324.png";
import mockScreen3 from "@assets/5aaa7d84-1989-45d5-b07c-cbd5333aaece_1762265015324.png";
import mockScreen4 from "@assets/fea38316-fd3b-4905-9e89-d7fea2952679_1762265015324.png";
import mockScreen5 from "@assets/1ec26ed7-6bb2-4c63-bb06-8998d261da4c_1762265015324.png";
import mockScreen6 from "@assets/c3a0d545-3d39-4eb4-946e-94b97084b431_1762265015324.png";
import mockScreen7 from "@assets/cbdef710-15f2-4bdf-a526-2b2d3e485859_1762265015324.png";
import mockScreen8 from "@assets/c67f497f-51f8-4c1d-a966-17024642cc9d_1762265015325.png";
import mockScreen9 from "@assets/082ab971-74f8-4903-96d7-4b44f7057302 (1)_1762265015325.png";
import mockScreen10 from "@assets/8af64a69-2069-4db3-8f1f-ee87b9a92943_1762265015325.png";
import mockScreen11 from "@assets/4dd403ab-d899-4e12-bfa4-c1772b57c171_1762265015325.png";
import mockScreen12 from "@assets/b13824f7-2392-4d94-a2dd-ab59e8a12085_1762265015325.png";
import mockScreen13 from "@assets/f01316ec-7b71-4c02-8f00-c5b231361994_1762265015325.png";
import mockScreen14 from "@assets/1a23ba45-675d-4179-9a21-e0b381046687_1762265015325.png";
import mockScreen15 from "@assets/988642ab-2de5-42b0-9349-8e28f0dca690 (1)_1762265015324.png";
import mockScreen16 from "@assets/74427d36-5f73-4d97-bc33-11c37d2d091c_1762265015325.png";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const mockScreens = [
  { src: mockScreen1, caption: "Dashboard - Light & Dark Mode Overview", description: "Main dashboard showing total options, open positions, and total volume stats with options book table" },
  { src: mockScreen2, caption: "Options Book - Dark Mode", description: "Detailed options listing with type badges, premiums, expiry dates, and status indicators" },
  { src: mockScreen3, caption: "Create Option Dialog - Dark Mode", description: "Form for creating new options contracts with commodity selection and collateral upload" },
  { src: mockScreen4, caption: "Icon Set", description: "Cropto brand icon set including wheat, sailboat, document, wallet, and calendar icons" },
  { src: mockScreen5, caption: "Contracts Management", description: "Partner contracts table showing contract status, types, and document links" },
  { src: mockScreen6, caption: "Transaction History", description: "On-chain transaction monitoring with network, amount, and reconciliation status" },
  { src: mockScreen7, caption: "Wheat Market Overview", description: "Market-specific view with spot price, options count, and trading volume" },
  { src: mockScreen8, caption: "Mobile Responsive Views", description: "Mobile-first design showing dashboard, options list, and navigation patterns" },
  { src: mockScreen9, caption: "Dashboard Light Mode", description: "Clean light mode interface with bordered card design" },
  { src: mockScreen10, caption: "Option Detail Page", description: "Detailed view showing strike, quantity, premium, collateral, and P&L chart with exercise/withdraw actions" },
  { src: mockScreen11, caption: "Transaction Detail Modal", description: "Detailed transaction view with network reconciliation and status tracking" },
  { src: mockScreen12, caption: "Contract Detail View", description: "Partner contract details with grain storage agreement information" },
  { src: mockScreen13, caption: "Settlement Overview", description: "Settlement tracking table showing daily P&L, payouts, and status per instrument" },
  { src: mockScreen14, caption: "Option Detail with P&L Chart", description: "Comprehensive option view with profit/loss curve and action buttons" },
  { src: mockScreen15, caption: "Dashboard Variations", description: "Multiple dashboard layout variations showing different data densities" },
  { src: mockScreen16, caption: "Create Option Form", description: "Complete option creation workflow with title, type, strike, quantity, and premium fields" },
];

export default function DesignArchitecture() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img 
                src={croptoLogo} 
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
                    <img src={croptoLogo} alt="Cropto Logo" className="h-24 w-auto" />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Cover Pattern</CardTitle>
                    <CardDescription>Wheat field and sailboat pattern for backgrounds</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0 overflow-hidden rounded-md">
                    <img src={croptoCover} alt="Cropto Cover" className="w-full h-48 object-cover" />
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
