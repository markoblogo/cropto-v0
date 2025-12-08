import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MainLayout } from "@/components/layouts/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OnchainTransactionsTable } from "@/components/OnchainTransactionsTable";

type OnchainTransaction = {
  id: string;
  type: string;
  amount: string;
  txHash?: string | null;
  status: string;
  toAddress?: string;
  createdAt?: string;
};

export default function OnchainTx() {
  const {
    data: transactions = [],
    isLoading,
    isError,
  } = useQuery<OnchainTransaction[]>({
    queryKey: ["/api/onchain/transactions"],
  });

  const stats = useMemo(() => {
    const normalized = transactions.map((tx) => tx.status?.toLowerCase() || "");
    const total = transactions.length;
    const confirmed = normalized.filter((s) => s === "confirmed").length;
    const pending = normalized.filter((s) => s === "pending").length;
    const failed = normalized.filter((s) => s === "failed").length;
    return { total, confirmed, pending, failed };
  }, [transactions]);

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">On-Chain Transactions</h1>
          <p className="text-muted-foreground mt-1">
            Monitor blockchain settlements and transfers
          </p>
        </div>

        <OnchainTransactionsTable
          transactions={transactions}
          isLoading={isLoading}
          errorMessage={isError ? "Unable to load on-chain transactions" : undefined}
        />

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
                  {stats.total}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Confirmed</p>
                <p className="text-2xl font-bold font-mono text-primary" data-testid="text-stat-confirmed">
                  {stats.confirmed}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold font-mono text-muted-foreground" data-testid="text-stat-pending">
                  {stats.pending}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Failed</p>
                <p className="text-2xl font-bold font-mono text-destructive" data-testid="text-stat-failed">
                  {stats.failed}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
