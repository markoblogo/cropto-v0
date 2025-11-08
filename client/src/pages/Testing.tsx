import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Header } from "@/components/Header";
import { CheckCircle2, AlertCircle } from "lucide-react";

export default function Testing() {
  return (
    <div className="min-h-screen bg-background">
      <Header onCreateOption={() => {}} />
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl font-bold">Testing Guide</CardTitle>
            <CardDescription>
              Step-by-step instructions for testing Cropto platform features
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Demo Accounts Section */}
            <section data-testid="section-demo-accounts">
              <h2 className="text-2xl font-semibold mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-6 h-6 text-primary" />
                Demo Accounts
              </h2>
              <Card className="bg-muted/50">
                <CardContent className="pt-6 space-y-2">
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm">farmer@demo</span>
                      <Badge variant="outline">Farmer</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm">trader@demo</span>
                      <Badge variant="outline">Trader</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm">broker@demo</span>
                      <Badge variant="outline">Broker/Admin</Badge>
                    </div>
                  </div>
                  <Separator className="my-3" />
                  <p className="text-sm text-muted-foreground">
                    Password for all accounts: <code className="font-mono bg-background px-1 rounded">pass</code>
                  </p>
                </CardContent>
              </Card>
            </section>

            <Separator />

            {/* Test Scenario 1: Option Creation & Matching */}
            <section data-testid="section-test-option-lifecycle">
              <h2 className="text-2xl font-semibold mb-3">Test 1: Option Creation & Matching</h2>
              <ol className="list-decimal list-inside space-y-3 text-sm">
                <li className="pl-2">
                  <strong>Login as farmer@demo</strong>
                  <ul className="list-disc list-inside ml-6 mt-1 text-muted-foreground">
                    <li>Navigate to /login</li>
                    <li>Enter credentials: farmer@demo / pass</li>
                    <li>Verify redirect to dashboard</li>
                  </ul>
                </li>
                <li className="pl-2">
                  <strong>Create a new option</strong>
                  <ul className="list-disc list-inside ml-6 mt-1 text-muted-foreground">
                    <li>Click "Create Option" button in header</li>
                    <li>Fill form: Title="Test Option", Strike="50000", Quantity="1", Premium="1000"</li>
                    <li>Buyer address: <code className="font-mono text-xs bg-muted px-1">0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1</code></li>
                    <li>Submit and verify OPEN status in table</li>
                  </ul>
                </li>
                <li className="pl-2">
                  <strong>Match the option (requires broker role)</strong>
                  <ul className="list-disc list-inside ml-6 mt-1 text-muted-foreground">
                    <li>Logout and login as broker@demo</li>
                    <li>Find the option and click "Match"</li>
                    <li>Enter seller: <code className="font-mono text-xs bg-muted px-1">0xf6CA524fa30BC1c55e09bF9eDD7B527c2eF6AcB6</code></li>
                    <li>Confirm and verify status changes to FILLED</li>
                  </ul>
                </li>
              </ol>
            </section>

            <Separator />

            {/* Test Scenario 2: NFT Minting */}
            <section data-testid="section-test-nft-minting">
              <h2 className="text-2xl font-semibold mb-3">Test 2: NFT Minting (Blockchain)</h2>
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg p-4 mb-3 flex gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <strong className="text-amber-900 dark:text-amber-100">Note:</strong>
                  <span className="text-amber-800 dark:text-amber-200 ml-1">
                    Requires test MATIC in deployer wallet (~0.023 MATIC per mint). 
                    Get from <a href="https://faucet.polygon.technology/" target="_blank" rel="noopener noreferrer" className="underline">Polygon Amoy faucet</a>.
                  </span>
                </div>
              </div>
              <ol className="list-decimal list-inside space-y-3 text-sm">
                <li className="pl-2">
                  <strong>Prerequisites</strong>
                  <ul className="list-disc list-inside ml-6 mt-1 text-muted-foreground">
                    <li>Complete Test 1 to have a FILLED option</li>
                    <li>Ensure logged in as option owner (farmer@demo if you created it)</li>
                  </ul>
                </li>
                <li className="pl-2">
                  <strong>Mint NFT for option</strong>
                  <ul className="list-disc list-inside ml-6 mt-1 text-muted-foreground">
                    <li>Locate your FILLED option in the options table</li>
                    <li>Click "Mint NFT" button</li>
                    <li>Enter recipient address (or use buyer address from option)</li>
                    <li>Click "Mint NFT" and wait 10-20 seconds for blockchain confirmation</li>
                  </ul>
                </li>
                <li className="pl-2">
                  <strong>Verify minting</strong>
                  <ul className="list-disc list-inside ml-6 mt-1 text-muted-foreground">
                    <li>Check for success toast with token ID</li>
                    <li>Option row should show NFT badge with token number</li>
                    <li>Click "View" to see transaction on PolygonScan</li>
                  </ul>
                </li>
              </ol>
            </section>

            <Separator />

            {/* Test Scenario 3: Wallet Connection */}
            <section data-testid="section-test-wallet">
              <h2 className="text-2xl font-semibold mb-3">Test 3: Wallet Connection</h2>
              <ol className="list-decimal list-inside space-y-3 text-sm">
                <li className="pl-2">
                  <strong>MetaMask connection</strong>
                  <ul className="list-disc list-inside ml-6 mt-1 text-muted-foreground">
                    <li>Click "Connect Web3" button in header</li>
                    <li>Approve connection in MetaMask popup</li>
                    <li>Verify wallet address displays in header</li>
                  </ul>
                </li>
                <li className="pl-2">
                  <strong>Manual wallet input</strong>
                  <ul className="list-disc list-inside ml-6 mt-1 text-muted-foreground">
                    <li>If MetaMask not available, use manual input</li>
                    <li>Enter any valid Ethereum address</li>
                    <li>Verify address is saved and displayed</li>
                  </ul>
                </li>
              </ol>
            </section>

            <Separator />

            {/* Test Scenario 4: Portfolio & P&L */}
            <section data-testid="section-test-portfolio">
              <h2 className="text-2xl font-semibold mb-3">Test 4: Portfolio & P&L Tracking</h2>
              <ol className="list-decimal list-inside space-y-3 text-sm">
                <li className="pl-2">
                  <strong>View portfolio</strong>
                  <ul className="list-disc list-inside ml-6 mt-1 text-muted-foreground">
                    <li>Navigate to /portfolio</li>
                    <li>Verify total positions count</li>
                    <li>Check unrealized P&L calculations</li>
                  </ul>
                </li>
                <li className="pl-2">
                  <strong>Exercise an option</strong>
                  <ul className="list-disc list-inside ml-6 mt-1 text-muted-foreground">
                    <li>Find a FILLED option</li>
                    <li>Click "Exercise" and enter spot price (e.g., 55000)</li>
                    <li>Verify settlement created and P&L updated</li>
                  </ul>
                </li>
              </ol>
            </section>

            <Separator />

            {/* Test Scenario 5: Admin Features */}
            <section data-testid="section-test-admin">
              <h2 className="text-2xl font-semibold mb-3">Test 5: Admin Features (Broker Role)</h2>
              <ol className="list-decimal list-inside space-y-3 text-sm">
                <li className="pl-2">
                  <strong>Reconciliation view</strong>
                  <ul className="list-disc list-inside ml-6 mt-1 text-muted-foreground">
                    <li>Login as broker@demo</li>
                    <li>Navigate to /admin/reconciliation</li>
                    <li>Verify transactions, settlements, and margin calls display</li>
                    <li>Test filtering and export functionality</li>
                  </ul>
                </li>
                <li className="pl-2">
                  <strong>Index price management</strong>
                  <ul className="list-disc list-inside ml-6 mt-1 text-muted-foreground">
                    <li>Navigate to /admin/index</li>
                    <li>Update index price manually</li>
                    <li>Configure Telegram webhook (optional)</li>
                  </ul>
                </li>
                <li className="pl-2">
                  <strong>Partner feedback</strong>
                  <ul className="list-disc list-inside ml-6 mt-1 text-muted-foreground">
                    <li>Navigate to /admin/feedback</li>
                    <li>Review submitted feedback</li>
                    <li>Update status and add admin responses</li>
                  </ul>
                </li>
              </ol>
            </section>

            <Separator />

            {/* Contract Addresses */}
            <section data-testid="section-contract-info">
              <h2 className="text-2xl font-semibold mb-3">Contract Addresses (Polygon Amoy)</h2>
              <div className="space-y-2 text-sm font-mono bg-muted/50 p-4 rounded-lg">
                <div>
                  <span className="text-muted-foreground">CROPT Token:</span>{" "}
                  <code className="text-primary">{import.meta.env.VITE_CROPT_CONTRACT_ADDRESS || "Check .env"}</code>
                </div>
                <div>
                  <span className="text-muted-foreground">NFT Contract:</span>{" "}
                  <code className="text-primary">0xCE49ba494170495041e5f56a722762f74C968c3F</code>
                </div>
                <div>
                  <span className="text-muted-foreground">Network:</span>{" "}
                  <code>Polygon Amoy Testnet (Chain ID: 80002)</code>
                </div>
                <div>
                  <span className="text-muted-foreground">Explorer:</span>{" "}
                  <a href="https://amoy.polygonscan.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    amoy.polygonscan.com
                  </a>
                </div>
              </div>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
