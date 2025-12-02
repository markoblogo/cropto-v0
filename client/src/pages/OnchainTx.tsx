import { MainLayout } from "@/components/layouts/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OnchainTransactionsTable } from "@/components/OnchainTransactionsTable";

export default function OnchainTx() {
  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">On-Chain Transactions</h1>
          <p className="text-muted-foreground mt-1">
            Monitor blockchain settlements and transfers
          </p>
        </div>

        <OnchainTransactionsTable />

        <Card>
          <CardHeader>
            <CardTitle>Transaction Statistics</CardTitle>
            <CardDescription>Summary of on-chain activity</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Total Transactions</p>
                <p className="text-2xl font-bold font-mono" data-testid="text-stat-total">
                  {transactions.length}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Confirmed</p>
                <p className="text-2xl font-bold font-mono text-primary" data-testid="text-stat-confirmed">
                  {transactions.filter((tx) => tx.status === "confirmed").length}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold font-mono text-muted-foreground" data-testid="text-stat-pending">
                  {transactions.filter((tx) => tx.status === "pending").length}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Failed</p>
                <p className="text-2xl font-bold font-mono text-destructive" data-testid="text-stat-failed">
                  {transactions.filter((tx) => tx.status === "failed").length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
