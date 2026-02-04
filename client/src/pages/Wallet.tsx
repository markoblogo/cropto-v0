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
import { useTranslation } from "react-i18next";

interface PortfolioSummary {
  lockedCollateral: string;
}

export default function Wallet() {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();

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
          <h1 className="text-3xl font-bold">{t("wallet.page.title")}</h1>
          <p className="text-muted-foreground mt-1">
            {t("wallet.page.subtitle")}
          </p>
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="overview">{t("wallet.tabs.overview")}</TabsTrigger>
            <TabsTrigger value="activity">{t("wallet.tabs.activity")}</TabsTrigger>
            <TabsTrigger value="transfers">{t("wallet.tabs.transfers")}</TabsTrigger>
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
                  <CardTitle>{t("wallet.balances.title")}</CardTitle>
                  <CardDescription>
                    {t("wallet.balances.subtitle")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("wallet.balances.table.type")}</TableHead>
                        <TableHead className="text-right">{t("wallet.balances.table.amount")}</TableHead>
                        <TableHead>{t("wallet.balances.table.source")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell>{t("wallet.balances.rows.onChain")}</TableCell>
                        <TableCell className="text-right font-mono">
                          {walletData.isLoadingBalance
                            ? t("wallet.balances.loading")
                            : `${walletData.onChainBalance.toFixed(2)} CROPT`}
                        </TableCell>
                        <TableCell>{t("wallet.balances.rows.onChainSource")}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>{t("wallet.balances.rows.internal")}</TableCell>
                        <TableCell className="text-right font-mono">
                          {walletData.internalBalance.toFixed(2)} CROPT
                        </TableCell>
                        <TableCell>{t("wallet.balances.rows.internalSource")}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>{t("wallet.balances.rows.lockedCollateral")}</TableCell>
                        <TableCell className="text-right font-mono">
                          {lockedCollateral > 0
                            ? `$${lockedCollateral.toFixed(2)} USD`
                            : t("wallet.balances.rows.comingSoon")}
                        </TableCell>
                        <TableCell>
                          {lockedCollateral > 0
                            ? t("wallet.balances.rows.lockedCollateralSource")
                            : t("wallet.balances.rows.lockedCollateralEmpty")}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Right: Collateral & Risk (lightweight) */}
              <Card>
              <CardHeader>
                <CardTitle>{t("wallet.risk.title")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                  {lockedCollateral > 0 ? (
                    <>
                      <p className="text-sm text-muted-foreground">
                        {t("wallet.risk.lockedInfo")}
                      </p>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">{t("wallet.risk.lockedLabel")}</p>
                        <p className="text-2xl font-bold font-mono">
                          ${lockedCollateral.toFixed(2)}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t("wallet.risk.moreInfo")}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLocation("/portfolio")}
                      >
                        {t("wallet.risk.cta")}
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">
                        {t("wallet.risk.emptyInfo")}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLocation("/portfolio")}
                      >
                        {t("wallet.risk.cta")}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Coming soon: Wallet providers & fiat on-ramp */}
            <Card>
              <CardHeader>
                <CardTitle>{t("wallet.moreWallets.title")}</CardTitle>
                <CardDescription>
                  {t("wallet.moreWallets.subtitle")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    t("wallet.moreWallets.items.trustWallet"),
                    t("wallet.moreWallets.items.walletConnect"),
                    t("wallet.moreWallets.items.buyCropt"),
                  ].map((label) => (
                    <div
                      key={label}
                      className="rounded-lg border border-dashed bg-muted/40 px-4 py-6 flex flex-col items-start gap-2 opacity-60"
                    >
                      <span className="text-sm font-semibold">{label}</span>
                      <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-muted-foreground bg-background/60">
                        {t("wallet.moreWallets.comingSoon")}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity" className="mt-6 space-y-4">
            <div>
              <h2 className="text-xl font-semibold">{t("wallet.activity.title")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("wallet.activity.subtitle")}
              </p>
            </div>
            <OnchainTransactionsTable />
          </TabsContent>

          <TabsContent value="transfers" className="mt-6 space-y-4">
            <h2 className="text-xl font-semibold">{t("wallet.transfers.title")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("wallet.transfers.subtitle")}
            </p>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}

