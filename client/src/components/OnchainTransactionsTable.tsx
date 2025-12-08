import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

type OnchainTransaction = {
  id: string;
  type: string;
  amount: string;
  txHash?: string | null;
  status: string;
  toAddress?: string;
  createdAt?: string;
  blockNumber?: number | null;
};

interface OnchainTransactionsTableProps {
  transactions?: OnchainTransaction[];
  isLoading?: boolean;
  errorMessage?: string;
}

function shortenHash(txHash?: string | null) {
  if (!txHash) return "—";
  return `${txHash.slice(0, 10)}...${txHash.slice(-6)}`;
}

function formatTimestamp(timestamp?: string) {
  if (!timestamp) return "—";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString();
}

function statusVariant(status: string) {
  const value = status.toLowerCase();
  if (value === "confirmed") return "default";
  if (value === "pending") return "secondary";
  return "destructive";
}

function formatAmount(amount: string) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return amount ?? "—";
  return value.toFixed(3);
}

export function OnchainTransactionsTable({
  transactions: providedTransactions,
  isLoading: isLoadingProp,
  errorMessage,
}: OnchainTransactionsTableProps) {
  const {
    data: fetchedTransactions = [],
    isLoading: isQueryLoading,
    isError,
  } = useQuery<OnchainTransaction[]>({
    queryKey: ["/api/onchain/transactions"],
    enabled: !providedTransactions,
  });

  const transactions = useMemo(
    () => providedTransactions ?? fetchedTransactions ?? [],
    [providedTransactions, fetchedTransactions],
  );

  const isLoading = isLoadingProp ?? isQueryLoading;
  const hasError = Boolean(errorMessage) || isError;

  return (
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
              <TableHead>Timestamp</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Asset</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Tx Hash</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                  Loading on-chain transactions...
                </TableCell>
              </TableRow>
            )}

            {hasError && !isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-destructive">
                  {errorMessage || "Unable to load on-chain transactions"}
                </TableCell>
              </TableRow>
            )}

            {!isLoading && !hasError && transactions.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                  No on-chain transactions yet.
                </TableCell>
              </TableRow>
            )}

            {!isLoading &&
              !hasError &&
              transactions.map((tx) => (
                <TableRow key={tx.id} data-testid={`row-transaction-${tx.id}`}>
                  <TableCell data-testid={`text-tx-timestamp-${tx.id}`}>
                    {formatTimestamp(tx.createdAt)}
                  </TableCell>
                  <TableCell className="capitalize" data-testid={`text-tx-type-${tx.id}`}>
                    {tx.type?.toLowerCase()}
                  </TableCell>
                  <TableCell className="font-mono text-xs">CROPT</TableCell>
                  <TableCell className="font-mono" data-testid={`text-tx-amount-${tx.id}`}>
                    {formatAmount(tx.amount)}
                  </TableCell>
                  <TableCell data-testid={`text-tx-hash-${tx.id}`}>
                    <div className="flex items-center gap-2">
                      <code className="text-xs">{shortenHash(tx.txHash)}</code>
                      {tx.txHash && (
                        <Button
                          variant="ghost"
                          size="icon"
                          data-testid={`button-view-tx-${tx.id}`}
                          onClick={() => {
                            window.open(`https://amoy.polygonscan.com/tx/${tx.txHash}`, "_blank");
                          }}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell data-testid={`badge-tx-status-${tx.id}`}>
                    <Badge variant={statusVariant(tx.status || "")}>
                      {tx.status?.toLowerCase() || "unknown"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
