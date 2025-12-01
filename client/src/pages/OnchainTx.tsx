import { MainLayout } from "@/components/layouts/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

const transactions = [
  {
    id: "1",
    txHash: "0x7a8f3d2e1b9c4a5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9",
    type: "Settlement",
    amount: "2.5000 BTC",
    from: "0x742d...8f3a",
    to: "0x9a3e...2d1b",
    status: "confirmed",
    confirmations: 42,
    timestamp: "2024-11-04 13:45:22",
    gasUsed: "0.00021 ETH",
  },
  {
    id: "2",
    txHash: "0x1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b",
    type: "Collateral Deposit",
    amount: "50,000 USDC",
    from: "0x3e4f...9a2b",
    to: "0x742d...8f3a",
    status: "confirmed",
    confirmations: 128,
    timestamp: "2024-11-04 12:30:15",
    gasUsed: "0.00015 ETH",
  },
  {
    id: "3",
    txHash: "0x9c8b7a6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a",
    type: "Premium Payment",
    amount: "1,250 USDT",
    from: "0x5b6c...3d4e",
    to: "0x9a3e...2d1b",
    status: "confirmed",
    confirmations: 87,
    timestamp: "2024-11-04 11:15:08",
    gasUsed: "0.00018 ETH",
  },
  {
    id: "4",
    txHash: "0x4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e",
    type: "Withdrawal",
    amount: "1.2500 ETH",
    from: "0x742d...8f3a",
    to: "0x1a2b...5c6d",
    status: "pending",
    confirmations: 3,
    timestamp: "2024-11-04 14:02:41",
    gasUsed: "0.00024 ETH",
  },
  {
    id: "5",
    txHash: "0x2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d",
    type: "Settlement",
    amount: "15,000 USDC",
    from: "0x9a3e...2d1b",
    to: "0x3e4f...9a2b",
    status: "confirmed",
    confirmations: 215,
    timestamp: "2024-11-04 09:22:33",
    gasUsed: "0.00019 ETH",
  },
  {
    id: "6",
    txHash: "0x6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f",
    type: "Collateral Refund",
    amount: "25,000 USDT",
    from: "0x742d...8f3a",
    to: "0x5b6c...3d4e",
    status: "failed",
    confirmations: 0,
    timestamp: "2024-11-04 08:55:17",
    gasUsed: "0.00012 ETH",
  },
];

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

        <Card>
          <CardHeader>
            <CardTitle>Transaction History</CardTitle>
            <CardDescription>
              Recent on-chain transactions for settlements, deposits, and withdrawals
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transaction Hash</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Confirmations</TableHead>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Gas Used</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => (
                  <TableRow key={tx.id} data-testid={`row-transaction-${tx.id}`}>
                    <TableCell data-testid={`text-tx-hash-${tx.id}`}>
                      <div className="flex items-center gap-2">
                        <code className="text-xs">
                          {tx.txHash.slice(0, 10)}...{tx.txHash.slice(-8)}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          data-testid={`button-view-tx-${tx.id}`}
                          onClick={() => {
                            window.open(
                              `https://etherscan.io/tx/${tx.txHash}`,
                              "_blank"
                            );
                          }}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell data-testid={`text-tx-type-${tx.id}`}>
                      {tx.type}
                    </TableCell>
                    <TableCell className="font-mono" data-testid={`text-tx-amount-${tx.id}`}>
                      {tx.amount}
                    </TableCell>
                    <TableCell className="font-mono text-xs" data-testid={`text-tx-from-${tx.id}`}>
                      {tx.from}
                    </TableCell>
                    <TableCell className="font-mono text-xs" data-testid={`text-tx-to-${tx.id}`}>
                      {tx.to}
                    </TableCell>
                    <TableCell data-testid={`badge-tx-status-${tx.id}`}>
                      <Badge
                        variant={
                          tx.status === "confirmed"
                            ? "default"
                            : tx.status === "pending"
                            ? "secondary"
                            : "destructive"
                        }
                      >
                        {tx.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono" data-testid={`text-tx-confirmations-${tx.id}`}>
                      {tx.confirmations}
                    </TableCell>
                    <TableCell className="text-sm" data-testid={`text-tx-timestamp-${tx.id}`}>
                      {tx.timestamp}
                    </TableCell>
                    <TableCell className="font-mono text-xs" data-testid={`text-tx-gas-${tx.id}`}>
                      {tx.gasUsed}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

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
