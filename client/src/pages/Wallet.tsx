import { useQuery } from "@tanstack/react-query";
import { MainLayout } from "@/components/layouts/MainLayout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { WalletSummary } from "@/components/WalletSummary";
import { OnchainTransactionsTable } from "@/components/OnchainTransactionsTable";
import { useWalletSummary } from "@/hooks/useWalletSummary";
import { useWalletSummary as usePortfolioWalletSummary } from "@/hooks/useWalletSummary";
import { useLocation } from "wouter";

interface PortfolioSummary {
  lockedCollateral: string;
}

export default function Wallet() {
  const [, setLocation] = useLocation();

  // Fetch current user to get wallet address
  const { data: userData } = useQuery<{
    user: {
      id: string;
      email: string;
      role: string;
      walletAddress?: string;
    };
  } | null>({
    queryKey: ["/api/auth/me"],
    retry: false,
    enabled: !!localStorage.getItem("cropto_token"),
  });

  const user = userData?.user;

  // Reuse existing wallet summary hook
  const walletData = useWalletSummary(user?.walletAddress || null);

  // Fetch portfolio summary for locked collateral (if available)
  const { data: portfolioData } = useQuery<PortfolioSummary | null>({
    queryKey: ["/api/portfolio/me"],
    enabled: !!user,
  });

  const lockedCollateral = portfolioData ? parseFloat(portfolioData.lockedCollateral || "0") : 0;

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Wallet</h1>
          <p className="text-muted-foreground mt-1">
            Manage your CROPT balances, collateral and transfers.
          </p>
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="activity">On-chain Activity</TabsTrigger>
            <TabsTrigger value="transfers">Transfers</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6 space-y-6">
            {/* Wallet summary bar */}
            <Card>
              <CardContent className="pt-6">
                <WalletSummary variant="bar" {...walletData} />
              </CardContent>
            </Card>

            {/* Balances & Collateral layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: Balances */}
              <Card>
                <CardHeader>
                  <CardTitle>Balances</CardTitle>
                  <CardDescription>
                    Overview of your CROPT balances across on-chain and internal accounts.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Source</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell>On-chain CROPT</TableCell>
                        <TableCell className="text-right font-mono">
                          {walletData.isLoadingBalance
                            ? "—"
                            : `${walletData.onChainBalance.toFixed(2)} CROPT`}
                        </TableCell>
                        <TableCell>Polygon Amoy testnet</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Internal (Spot Trading)</TableCell>
                        <TableCell className="text-right font-mono">
                          {walletData.internalBalance.toFixed(2)} CROPT
                        </TableCell>
                        <TableCell>Internal ledger</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Locked collateral</TableCell>
                        <TableCell className="text-right font-mono">
                          {lockedCollateral > 0
                            ? `$${lockedCollateral.toFixed(2)} USD`
                            : "Coming soon"}
                        </TableCell>
                        <TableCell>
                          {lockedCollateral > 0
                            ? "Active option positions"
                            : "Collateral from options will appear here"}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Right: Collateral & Risk (lightweight) */}
              <Card>
              <CardHeader>
                <CardTitle>Collateral & Risk</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                  {lockedCollateral > 0 ? (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Locked collateral is reserved for your active short option positions.
                        If your margin approaches liquidation levels, you’ll see alerts on the
                        Portfolio page.
                      </p>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Locked Collateral (USD)</p>
                        <p className="text-2xl font-bold font-mono">
                          ${lockedCollateral.toFixed(2)}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        For a more detailed breakdown of margin usage and risk per position, visit
                        the Portfolio page.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLocation("/portfolio")}
                      >
                        Go to Portfolio
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Margin & risk analytics live on the Portfolio page. There you can see
                        exposure, locked collateral and P&L per option.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLocation("/portfolio")}
                      >
                        Go to Portfolio
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Coming soon: Wallet providers & fiat on-ramp */}
            <Card>
              <CardHeader>
                <CardTitle>More wallet & on-ramp options (coming soon)</CardTitle>
                <CardDescription>
                  MetaMask is already supported for testnet trading. We’re working on more wallet
                  connections and fiat on-ramps so you can top up CROPT using bank cards, USDT or
                  PayPal.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    "Trust Wallet",
                    "WalletConnect",
                    "Buy CROPT with card / USDT / PayPal",
                  ].map((label) => (
                    <div
                      key={label}
                      className="rounded-lg border border-dashed bg-muted/40 px-4 py-6 flex flex-col items-start gap-2 opacity-60"
                    >
                      <span className="text-sm font-semibold">{label}</span>
                      <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-muted-foreground bg-background/60">
                        Coming soon
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity" className="mt-6 space-y-4">
            <div>
              <h2 className="text-xl font-semibold">On-chain Transactions</h2>
              <p className="text-sm text-muted-foreground">
                Recent settlements, deposits and other on-chain activity for your account.
              </p>
            </div>
            <OnchainTransactionsTable />
          </TabsContent>

          <TabsContent value="transfers" className="mt-6 space-y-4">
            <h2 className="text-xl font-semibold">Transfers (coming soon)</h2>
            <p className="text-sm text-muted-foreground">
              Here you will see deposits, withdrawals and internal transfers history once we start
              logging them.
            </p>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}


