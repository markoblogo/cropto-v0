import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "./StatusBadge";
import { OptionTypeBadge } from "./OptionTypeBadge";
import type { Option } from "@shared/schema";
import { TrendingUp } from "lucide-react";

interface OptionsTableProps {
  options: Option[];
  isLoading: boolean;
}

export function OptionsTable({ options, isLoading }: OptionsTableProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Options Book
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4" data-testid="loading-skeleton">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded-md" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (options.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Options Book
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div 
            className="flex flex-col items-center justify-center py-16 text-center"
            data-testid="empty-state"
          >
            <div className="rounded-full bg-muted p-6 mb-4">
              <TrendingUp className="w-12 h-12 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No Options Available</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Get started by creating your first option contract. Click the "Create Option" button above.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl font-semibold flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          Options Book
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-semibold">Title</TableHead>
                <TableHead className="font-semibold">Type</TableHead>
                <TableHead className="font-semibold text-right">Strike</TableHead>
                <TableHead className="font-semibold text-right">Quantity</TableHead>
                <TableHead className="font-semibold text-right">Premium</TableHead>
                <TableHead className="font-semibold">Buyer</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {options.map((option) => (
                <TableRow key={option.id} data-testid={`row-option-${option.id}`}>
                  <TableCell className="font-semibold" data-testid={`text-title-${option.id}`}>
                    {option.title}
                  </TableCell>
                  <TableCell>
                    <OptionTypeBadge type={option.type as "CALL" | "PUT"} />
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold" data-testid={`text-strike-${option.id}`}>
                    ${parseFloat(option.strike).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold" data-testid={`text-qty-${option.id}`}>
                    {parseFloat(option.qty).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold" data-testid={`text-premium-${option.id}`}>
                    ${parseFloat(option.premium).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-mono text-sm" data-testid={`text-buyer-${option.id}`}>
                    {option.buyer.slice(0, 6)}...{option.buyer.slice(-4)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={option.status as "OPEN" | "FILLED" | "EXPIRED" | "CANCELLED"} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground" data-testid={`text-created-${option.id}`}>
                    {format(new Date(option.createdAt), "MMM dd, yyyy")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
