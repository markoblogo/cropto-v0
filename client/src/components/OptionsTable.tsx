import { format } from "date-fns";
import { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { StatusBadge } from "./StatusBadge";
import { OptionTypeBadge } from "./OptionTypeBadge";
import { MatchOptionDialog } from "./MatchOptionDialog";
import { ExerciseOptionDialog } from "./ExerciseOptionDialog";
import { SimulateMarginCallDialog } from "./SimulateMarginCallDialog";
import { ForceSettleDialog } from "./ForceSettleDialog";
import { TopUpMarginCallDialog } from "./TopUpMarginCallDialog";
import type { Option } from "@shared/schema";
import { TrendingUp, ArrowUpDown, ArrowUp, ArrowDown, ArrowDownToLine } from "lucide-react";

type SortField = "title" | "type" | "strike" | "qty" | "premium" | "status" | "createdAt";
type SortDirection = "asc" | "desc" | null;

interface OptionsTableProps {
  options: Option[];
  isLoading: boolean;
  onMatch?: (optionId: string, seller: string) => Promise<void>;
  isMatching?: boolean;
  onExercise?: (optionId: string, exercisedBy: string, spotPrice: number) => Promise<void>;
  isExercising?: boolean;
  onSimulate?: (optionId: string, indexPrice: number, commodity?: string) => Promise<void>;
  isSimulating?: boolean;
  onForceSettle?: (optionId: string, reason: string) => Promise<void>;
  isForceSettling?: boolean;
  onTopUp?: (marginCallId: string, amount: number, currency: string) => Promise<void>;
  isTopping?: boolean;
  userRole?: string;
  userId?: string;
}

export function OptionsTable({ 
  options, 
  isLoading, 
  onMatch, 
  isMatching = false, 
  onExercise, 
  isExercising = false,
  onSimulate,
  isSimulating = false,
  onForceSettle,
  isForceSettling = false,
  onTopUp,
  isTopping = false,
  userRole,
  userId 
}: OptionsTableProps) {
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortField(null);
        setSortDirection(null);
      } else {
        setSortDirection("asc");
      }
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-4 h-4" />;
    }
    if (sortDirection === "asc") {
      return <ArrowUp className="w-4 h-4" />;
    }
    return <ArrowDown className="w-4 h-4" />;
  };

  const filteredAndSortedOptions = useMemo(() => {
    let filtered = options.filter(opt => {
      const matchesStatus = statusFilter === "ALL" || opt.status === statusFilter;
      const matchesType = typeFilter === "ALL" || opt.type === typeFilter;
      return matchesStatus && matchesType;
    });

    if (sortField && sortDirection) {
      filtered = [...filtered].sort((a, b) => {
        let aVal: any = a[sortField];
        let bVal: any = b[sortField];

        if (sortField === "strike" || sortField === "qty" || sortField === "premium") {
          const aNum = Number(aVal);
          const bNum = Number(bVal);
          if (aNum < bNum) return sortDirection === "asc" ? -1 : 1;
          if (aNum > bNum) return sortDirection === "asc" ? 1 : -1;
          return 0;
        } else if (sortField === "createdAt") {
          const aTime = new Date(aVal).getTime();
          const bTime = new Date(bVal).getTime();
          if (aTime < bTime) return sortDirection === "asc" ? -1 : 1;
          if (aTime > bTime) return sortDirection === "asc" ? 1 : -1;
          return 0;
        } else {
          const aStr = String(aVal).toLowerCase();
          const bStr = String(bVal).toLowerCase();
          if (aStr < bStr) return sortDirection === "asc" ? -1 : 1;
          if (aStr > bStr) return sortDirection === "asc" ? 1 : -1;
          return 0;
        }
      });
    }

    return filtered;
  }, [options, statusFilter, typeFilter, sortField, sortDirection]);

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

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <CardTitle className="text-xl font-semibold flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Options Book
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[140px]" data-testid="select-type-filter">
                <SelectValue placeholder="Filter Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Types</SelectItem>
                <SelectItem value="CALL">Call</SelectItem>
                <SelectItem value="PUT">Put</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
                <SelectValue placeholder="Filter Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Status</SelectItem>
                <SelectItem value="OPEN">Open</SelectItem>
                <SelectItem value="FILLED">Filled</SelectItem>
                <SelectItem value="EXPIRED">Expired</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {filteredAndSortedOptions.length === 0 ? (
          <div 
            className="flex flex-col items-center justify-center py-16 text-center"
            data-testid="empty-state"
          >
            <div className="rounded-full bg-muted p-6 mb-4">
              <TrendingUp className="w-12 h-12 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No Options Found</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              {options.length === 0 
                ? "Get started by creating your first option contract."
                : "No options match your current filters. Try adjusting them."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleSort("title")}
                      className="hover-elevate gap-1 h-8"
                      data-testid="button-sort-title"
                    >
                      Title
                      {getSortIcon("title")}
                    </Button>
                  </TableHead>
                  <TableHead className="font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleSort("type")}
                      className="hover-elevate gap-1 h-8"
                      data-testid="button-sort-type"
                    >
                      Type
                      {getSortIcon("type")}
                    </Button>
                  </TableHead>
                  <TableHead className="font-semibold text-right">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleSort("strike")}
                      className="hover-elevate gap-1 h-8"
                      data-testid="button-sort-strike"
                    >
                      Strike
                      {getSortIcon("strike")}
                    </Button>
                  </TableHead>
                  <TableHead className="font-semibold text-right">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleSort("qty")}
                      className="hover-elevate gap-1 h-8"
                      data-testid="button-sort-qty"
                    >
                      Quantity
                      {getSortIcon("qty")}
                    </Button>
                  </TableHead>
                  <TableHead className="font-semibold text-right">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleSort("premium")}
                      className="hover-elevate gap-1 h-8"
                      data-testid="button-sort-premium"
                    >
                      Premium
                      {getSortIcon("premium")}
                    </Button>
                  </TableHead>
                  <TableHead className="font-semibold">Buyer</TableHead>
                  <TableHead className="font-semibold">Seller</TableHead>
                  <TableHead className="font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleSort("status")}
                      className="hover-elevate gap-1 h-8"
                      data-testid="button-sort-status"
                    >
                      Status
                      {getSortIcon("status")}
                    </Button>
                  </TableHead>
                  <TableHead className="font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleSort("createdAt")}
                      className="hover-elevate gap-1 h-8"
                      data-testid="button-sort-created"
                    >
                      Created
                      {getSortIcon("createdAt")}
                    </Button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedOptions.map((option) => (
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
                  <TableCell className="font-mono text-sm" data-testid={`text-seller-${option.id}`}>
                    {option.seller ? (
                      <>{option.seller.slice(0, 6)}...{option.seller.slice(-4)}</>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={option.status as "OPEN" | "FILLED" | "EXPIRED" | "CANCELLED"} />
                      {option.status === "OPEN" && onMatch && (
                        <MatchOptionDialog
                          optionId={option.id}
                          onMatch={async (data) => {
                            await onMatch(option.id, data.seller);
                          }}
                          isPending={isMatching}
                        />
                      )}
                      {option.status === "FILLED" && onExercise && (
                        <ExerciseOptionDialog
                          optionId={option.id}
                          optionType={option.type as "CALL" | "PUT"}
                          strike={option.strike}
                          onExercise={async (data) => {
                            await onExercise(option.id, data.exercisedBy, data.spotPrice);
                          }}
                          isPending={isExercising}
                        />
                      )}
                      {option.status === "OPEN" && onSimulate && userRole === "broker" && (
                        <SimulateMarginCallDialog
                          optionId={option.id}
                          commodity={option.commodity || undefined}
                          onSimulate={async (data) => {
                            await onSimulate(option.id, data.indexPrice, option.commodity || undefined);
                          }}
                          isPending={isSimulating}
                        />
                      )}
                      {option.status === "OPEN" && onForceSettle && userRole === "broker" && (
                        <ForceSettleDialog
                          optionId={option.id}
                          optionTitle={option.title}
                          onForceSettle={async (data) => {
                            await onForceSettle(option.id, data.reason);
                          }}
                          isPending={isForceSettling}
                        />
                      )}
                      {option.status === "MARGIN_CALL" && onTopUp && userId && option.buyerId === userId && (
                        <TopUpMarginCallDialog
                          marginCallId={option.id}
                          onTopUp={async (data) => {
                            await onTopUp(data.marginCallId, data.amount, data.currency);
                          }}
                          isPending={isTopping}
                        />
                      )}
                      {(option.status === "EXERCISED" || option.status === "FILLED") && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled
                                data-testid={`button-withdraw-${option.id}`}
                              >
                                <ArrowDownToLine className="h-4 w-4 mr-1" />
                                Withdraw
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>On-chain withdrawals coming soon</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground" data-testid={`text-created-${option.id}`}>
                    {format(new Date(option.createdAt), "MMM dd, yyyy")}
                  </TableCell>
                </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
