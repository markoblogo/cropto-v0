import { format, formatDistanceToNowStrict } from "date-fns";
import { useState, useMemo, useEffect } from "react";
import { Link } from "wouter";
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
import { WithdrawDialog } from "./WithdrawDialog";
import { MintNFTDialog } from "./MintNFTDialog";
import type { Option } from "@shared/schema";
import { TrendingUp, ArrowUpDown, ArrowUp, ArrowDown, Plus, Info } from "lucide-react";
import { useTradingGuard } from "@/hooks/useTradingGuard";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

type SortField = "commodity" | "title" | "type" | "strike" | "qty" | "premium" | "status" | "createdAt";
type SortDirection = "asc" | "desc" | null;

interface OptionsTableProps {
  options: Option[];
  isLoading: boolean;
  volumeMap?: Record<string, number>;
  marginProfile?: {
    label: string;
    usePremiumAsMargin: boolean;
    riskMultiplier: number;
  };
  onMatch?: (optionId: string, seller: string) => Promise<void>;
  isMatching?: boolean;
  onExercise?: (optionId: string, spotPrice: number) => Promise<void>;
  isExercising?: boolean;
  onSimulate?: (optionId: string, indexPrice: number, commodity?: string) => Promise<void>;
  isSimulating?: boolean;
  onForceSettle?: (optionId: string, reason: string) => Promise<void>;
  isForceSettling?: boolean;
  onTopUp?: (marginCallId: string, amount: number, currency: string) => Promise<void>;
  isTopping?: boolean;
  onWithdraw?: (data: { optionId: string; address: string; amount: string }) => Promise<{ txHash: string }>;
  isWithdrawing?: boolean;
  onCreateFromOption?: (option: Option) => void;
  userRole?: string;
  userId?: string;
}

function canExercise(option: Option, currentUserId?: string) {
  if (!currentUserId) return false;
  return option.buyerId === currentUserId || option.issuerId === currentUserId;
}

function inferMarket(option: Option): "UA" | "BR" | "AR" | "US" | "N/A" {
  const source = `${option.title || ""} ${(option as any).commoditySlug || ""} ${(option as any).commodityName || ""} ${option.commodity || ""}`.toUpperCase();
  if (source.includes("/UA") || source.includes(" UA")) return "UA";
  if (source.includes("/BR") || source.includes(" BR")) return "BR";
  if (source.includes("/AR") || source.includes(" AR")) return "AR";
  if (source.includes("/US") || source.includes(" US") || source.includes(" USA")) return "US";
  return "N/A";
}

export function OptionsTable({ 
  options, 
  isLoading, 
  volumeMap,
  marginProfile,
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
  onWithdraw,
  isWithdrawing = false,
  onCreateFromOption,
  userRole,
  userId 
}: OptionsTableProps) {
  const { t } = useTranslation();

  function getMarginHealth({
    marginBalance,
    initialMargin,
    isInMarginCall,
    isLiquidated,
  }: {
    marginBalance: number;
    initialMargin: number;
    isInMarginCall: boolean;
    isLiquidated: boolean;
  }) {
    if (isLiquidated) {
      return { label: t("component.optionsTable.marginHealth.liquidated"), className: "bg-red-100 text-red-800 border border-red-200" };
    }
    if (isInMarginCall) {
      return { label: t("component.optionsTable.marginHealth.marginCall"), className: "bg-amber-100 text-amber-800 border border-amber-200" };
    }
    const healthPct = initialMargin > 0 ? (marginBalance / initialMargin) * 100 : 100;
    if (healthPct < 80) {
      return { label: t("component.optionsTable.marginHealth.atRisk"), className: "bg-yellow-100 text-yellow-800 border border-yellow-200" };
    }
    return { label: t("component.optionsTable.marginHealth.normal"), className: "bg-emerald-100 text-emerald-800 border border-emerald-200" };
  }
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [commodityFilter, setCommodityFilter] = useState<string>("ALL");
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [selectedOption, setSelectedOption] = useState<Option | null>(null);
  const [isMatchDialogOpen, setIsMatchDialogOpen] = useState(false);
  const guardTradingAction = useTradingGuard();
  const { toast } = useToast();
  const [marginAlerted, setMarginAlerted] = useState<Set<string>>(new Set());

  useEffect(() => {
    const inCall = options.filter((opt) => (opt as any).isInMarginCall);
    const newOnes = inCall.filter((opt) => !marginAlerted.has(opt.id));
    if (newOnes.length > 0) {
      newOnes.forEach((opt) => {
        toast({
          title: t("component.optionsTable.marginToast.title"),
          description: t("component.optionsTable.marginToast.desc", { id: opt.title || opt.id }),
          variant: "destructive",
        });
      });
      const next = new Set(marginAlerted);
      newOnes.forEach((o) => next.add(o.id));
      setMarginAlerted(next);
    }
  }, [options, marginAlerted, toast]);

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

  const uniqueCommodities = useMemo(() => {
    const commodities = new Set<string>();
    options.forEach(opt => {
      const commodityName = (opt as any).commodityName || opt.commodity;
      if (commodityName) {
        commodities.add(commodityName);
      }
    });
    return Array.from(commodities).sort();
  }, [options]);

  const filteredAndSortedOptions = useMemo(() => {
    let filtered = options.filter(opt => {
      const matchesStatus = statusFilter === "ALL" || opt.status === statusFilter;
      const matchesType = typeFilter === "ALL" || opt.type === typeFilter;
      const commodityName = (opt as any).commodityName || opt.commodity || "";
      const matchesCommodity = commodityFilter === "ALL" || commodityName === commodityFilter;
      return matchesStatus && matchesType && matchesCommodity;
    });

    if (sortField && sortDirection) {
      filtered = [...filtered].sort((a, b) => {
        let aVal: any = a[sortField];
        let bVal: any = b[sortField];

        if (sortField === "commodity") {
          const aName = (a as any).commodityName || a.commodity || "";
          const bName = (b as any).commodityName || b.commodity || "";
          if (aName < bName) return sortDirection === "asc" ? -1 : 1;
          if (aName > bName) return sortDirection === "asc" ? 1 : -1;
          return 0;
        } else if (sortField === "strike" || sortField === "qty" || sortField === "premium") {
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
  }, [options, statusFilter, typeFilter, commodityFilter, sortField, sortDirection]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            {t("component.optionsTable.bookTitle")}
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
          <div>
            <CardTitle className="text-xl font-semibold flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              {t("component.optionsTable.title")}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {t("component.optionsTable.subtitle")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[140px]" data-testid="select-type-filter">
                <SelectValue placeholder={t("component.optionsTable.filters.type")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t("component.optionsTable.filters.allTypes")}</SelectItem>
                <SelectItem value="CALL">{t("component.optionsTable.filters.call")}</SelectItem>
                <SelectItem value="PUT">{t("component.optionsTable.filters.put")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
                <SelectValue placeholder={t("component.optionsTable.filters.status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t("component.optionsTable.filters.allStatus")}</SelectItem>
                <SelectItem value="OPEN">{t("component.optionsTable.filters.open")}</SelectItem>
                <SelectItem value="FILLED">{t("component.optionsTable.filters.filled")}</SelectItem>
                <SelectItem value="EXPIRED">{t("component.optionsTable.filters.expired")}</SelectItem>
                <SelectItem value="CANCELLED">{t("component.optionsTable.filters.cancelled")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={commodityFilter} onValueChange={setCommodityFilter}>
              <SelectTrigger className="w-[160px]" data-testid="select-commodity-filter">
                <SelectValue placeholder={t("component.optionsTable.filters.commodity")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t("component.optionsTable.filters.allCommodities")}</SelectItem>
                {uniqueCommodities.map(commodity => (
                  <SelectItem key={commodity} value={commodity}>
                    {commodity}
                  </SelectItem>
                ))}
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
            <h3 className="text-lg font-semibold mb-2">{t("component.optionsTable.empty")}</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              {options.length === 0 
                ? t("component.optionsTable.emptyCreate")
                : t("component.optionsTable.emptyFilter")}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead className="font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleSort("commodity")}
                      className="hover-elevate gap-1 h-8"
                      data-testid="button-sort-commodity"
                    >
                      {t("component.optionsTable.headers.commodity")}
                      {getSortIcon("commodity")}
                    </Button>
                  </TableHead>
                  <TableHead className="font-semibold w-[58px]">Mkt</TableHead>
                  <TableHead className="font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleSort("type")}
                      className="hover-elevate gap-1 h-8"
                      data-testid="button-sort-type"
                    >
                      {t("component.optionsTable.headers.type")}
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
                      {t("component.optionsTable.headers.strike")}
                      {getSortIcon("strike")}
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
                      {t("component.optionsTable.headers.premium")}
                      {getSortIcon("premium")}
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
                      {t("component.optionsTable.headers.qty")}
                      {getSortIcon("qty")}
                    </Button>
                  </TableHead>
                  <TableHead className="font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleSort("createdAt")}
                      className="hover-elevate gap-1 h-8"
                      data-testid="button-sort-expiry"
                    >
                      {t("component.optionsTable.headers.expiry")}
                      {getSortIcon("createdAt")}
                    </Button>
                  </TableHead>
                  <TableHead className="font-semibold text-right">{t("component.optionsTable.headers.iv")}</TableHead>
                  <TableHead className="font-semibold text-right">{t("component.optionsTable.headers.volume")}</TableHead>
                  <TableHead className="font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleSort("status")}
                      className="hover-elevate gap-1 h-8"
                      data-testid="button-sort-status"
                    >
                      {t("component.optionsTable.headers.status")}
                      {getSortIcon("status")}
                    </Button>
                  </TableHead>
                  <TableHead className="font-semibold">{t("component.optionsTable.headers.margin")}</TableHead>
                  <TableHead className="font-semibold text-right">{t("component.optionsTable.headers.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedOptions.map((option) => {
                  const expiryLabel =
                    (option as any).expiryWindow && (option as any).expiryWindow.length > 0
                      ? (option as any).expiryWindow
                      : option.expirationDate
                      ? format(new Date(option.expirationDate), "MMM dd, yyyy")
                      : t("component.optionsTable.values.dash");
                  const volCount = volumeMap?.[option.id] || 0;
                  const premiumNum = parseFloat(option.premium);
                  const strikeNum = Number(option.strike);
                  const qtyNum = Number(option.qty);
                  const ivApprox =
                    Number.isFinite(strikeNum) && strikeNum > 0
                      ? Math.max(0, (premiumNum / strikeNum) * 100)
                      : 0;
                  const baseMargin = Number((option as any).initialMargin || option.collateralAmount || 0);
                  const displayMargin = marginProfile
                    ? baseMargin * marginProfile.riskMultiplier
                    : baseMargin;
                  const isMine = option.issuerId && userId ? option.issuerId === userId : false;
                  const canMatchAsOther =
                    option.status === "OPEN" &&
                    !isMine &&
                    onMatch;
                  const userCanExercise = canExercise(option, userId);
                  const isInMarginCall = Boolean((option as any).isInMarginCall);
                  const isLiquidated = String(option.status || "").toUpperCase() === "LIQUIDATED";
                  const marginDeadlineRaw = (option as any).marginCallDeadline;
                  const marginDeadline = marginDeadlineRaw ? new Date(marginDeadlineRaw) : null;
                  const timeLeft = marginDeadline
                    ? formatDistanceToNowStrict(marginDeadline, { addSuffix: false })
                    : null;
                  const marginBalance = parseFloat((option as any).marginBalance || (option as any).initialMargin || "0");
                  const floatingLoss = parseFloat((option as any).floatingLoss || "0");
                  const initialMargin = parseFloat((option as any).initialMargin || "0");
                  const topUp = Math.max(0, initialMargin - marginBalance);
                  const ssiAvg = (option as any).ssiAvg || (option as any).settlementPrice;
                  const finalPnl = (option as any).finalPnl;

                  const isClickable = !!onMatch && option.status === "OPEN";
                  return (
                <TableRow
                  key={option.id}
                  data-testid={`row-option-${option.id}`}
                  className={`${isClickable ? "cursor-pointer hover:bg-muted/50" : ""} min-h-[64px]`}
                  onClick={() => {
                    if (isClickable) {
                      setSelectedOption(option);
                      setIsMatchDialogOpen(true);
                    }
                  }}
                >
                  <TableCell data-testid={`cell-commodity-${option.id}`}>
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      {(option as any).commoditySlug && (
                        <img 
                          src={`/commodities/${(option as any).commoditySlug}.png`}
                          alt={(option as any).commodityName || t("component.optionsTable.values.commodityAlt")}
                          className="w-5 h-5 rounded-md object-cover"
                        />
                      )}
                      <span className="font-medium max-w-[140px] truncate">
                        {(option as any).commodityName || option.commodity || t("component.optionsTable.values.dash")}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {inferMarket(option)}
                  </TableCell>
                  <TableCell>
                    <OptionTypeBadge type={option.type as "CALL" | "PUT"} />
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold whitespace-nowrap" data-testid={`text-strike-${option.id}`}>
                    ${parseFloat(option.strike).toLocaleString()}/t
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold whitespace-nowrap" data-testid={`text-premium-${option.id}`}>
                    {premiumNum.toLocaleString()} CROPT
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold whitespace-nowrap" data-testid={`text-qty-${option.id}`}>
                    {qtyNum.toLocaleString(undefined, { maximumFractionDigits: 2 })} t
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap" data-testid={`text-expiry-${option.id}`}>
                    {expiryLabel}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs whitespace-nowrap">
                    {ivApprox ? `${ivApprox.toFixed(1)}%` : t("component.optionsTable.values.dash")}
                  </TableCell>
                  <TableCell className="text-right font-mono whitespace-nowrap">
                    {volCount}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={option.status as "OPEN" | "FILLED" | "EXPIRED" | "CANCELLED" | "EXERCISED" | "DEFAULTED" | "MARGIN_CALL"} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-sm whitespace-nowrap">
                      <span className="font-mono">
                        {Number.isFinite(displayMargin) ? displayMargin.toFixed(2) : t("component.optionsTable.values.dash")} CROPT
                      </span>
                      {(() => {
                        const health = getMarginHealth({
                          marginBalance,
                          initialMargin,
                          isInMarginCall,
                          isLiquidated,
                        });
                        return (
                          <Badge className={`h-6 rounded-full px-2 text-xs font-semibold ${health.className}`}>
                            {health.label}
                          </Badge>
                        );
                      })()}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-foreground inline-flex items-center justify-center"
                              aria-label={t("component.optionsTable.margin.detailsLabel")}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Info className="h-4 w-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs space-y-1">
                            <div>
                              {t("component.optionsTable.margin.line", {
                                label: marginProfile?.label || t("component.optionsTable.margin.standard"),
                                value: Number.isFinite(displayMargin) ? displayMargin.toFixed(2) : t("component.optionsTable.values.dash"),
                              })}{" "}
                              {marginProfile?.usePremiumAsMargin ? t("component.optionsTable.margin.premiumAsMargin") : ""}
                            </div>
                            <div>{t("component.optionsTable.margin.balance", { value: Number.isFinite(marginBalance) ? marginBalance.toFixed(2) : t("component.optionsTable.values.dash") })}</div>
                            <div>{t("component.optionsTable.margin.floatingLoss", { value: Number.isFinite(floatingLoss) ? floatingLoss.toFixed(2) : t("component.optionsTable.values.dash") })}</div>
                            <div>{t("component.optionsTable.margin.topUp", { value: Number.isFinite(initialMargin) ? topUp.toFixed(2) : t("component.optionsTable.values.dash") })}</div>
                            {isInMarginCall && timeLeft && !isLiquidated && (
                              <div>{t("component.optionsTable.margin.dueIn", { time: timeLeft })}</div>
                            )}
                            {isLiquidated && (
                              <>
                                <div>{t("component.optionsTable.margin.ssiAvg", { value: ssiAvg ? Number(ssiAvg).toFixed(2) : t("component.optionsTable.values.na") })}</div>
                                <div>{t("component.optionsTable.margin.finalPnl", { value: finalPnl !== undefined ? Number(finalPnl).toFixed(2) : t("component.optionsTable.values.na") })}</div>
                              </>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2 flex-wrap whitespace-nowrap">
                      {option.status === "OPEN" && onMatch && userRole === "broker" && isMine && (
                        <MatchOptionDialog
                          optionId={option.id}
                          onMatch={async (data) => {
                            await onMatch(option.id, data.counterpartyId);
                          }}
                          isPending={isMatching}
                        />
                      )}
                      {option.status === "FILLED" && onExercise && userCanExercise && (
                        <ExerciseOptionDialog
                          optionId={option.id}
                          optionType={option.type as "CALL" | "PUT"}
                          strike={option.strike}
                          onExercise={onExercise}
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
                      {(option.status === "EXERCISED" || option.status === "FILLED") && onWithdraw && (
                        <WithdrawDialog
                          optionId={option.id}
                          onWithdraw={onWithdraw}
                          isPending={isWithdrawing}
                        />
                      )}
                      {(option.status === "FILLED" || option.status === "EXERCISED") && 
                       userId && 
                       (option.buyerId === userId || option.issuerId === userId) && (
                        <MintNFTDialog
                          optionId={option.id}
                          nftStatus={option.nftStatus}
                          nftTokenId={option.nftTokenId}
                          nftMintTx={option.nftMintTx}
                        />
                      )}
                      {onCreateFromOption && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => onCreateFromOption(option)}
                          data-testid={`button-create-from-${option.id}`}
                        >
                          <Plus className="w-3 h-3" />
                          {t("button.create")}
                        </Button>
                      )}
                      {isLiquidated && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1"
                          data-testid={`button-view-settlement-${option.id}`}
                          asChild
                        >
                          <Link href="/admin/reconciliation">{t("component.optionsTable.actions.viewSettlement")}</Link>
                        </Button>
                      )}
                      {canMatchAsOther && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="default"
                                className="gap-1 bg-green-600 hover:bg-green-700"
                                data-testid={`button-take-offer-${option.id}`}
                                onClick={() =>
                                  guardTradingAction(() => {
                                    setSelectedOption(option);
                                    setIsMatchDialogOpen(true);
                                  })
                                }
                              >
                                {t("component.optionsTable.actions.takeOffer")}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{t("component.optionsTable.actions.takeOfferHint")}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
                );
              })}
              </TableBody>
            </Table>

            {selectedOption && onMatch && userId && (
              <MatchOptionDialog
                option={selectedOption}
                userId={userId}
                open={isMatchDialogOpen}
                onOpenChange={(open) => {
                  setIsMatchDialogOpen(open);
                  if (!open) {
                    setSelectedOption(null);
                  }
                }}
                onMatch={async (optionId, counterpartyId) => {
                  await onMatch(optionId, counterpartyId);
                }}
                isPending={isMatching}
              />
            )}
          </div>
        )}
      </CardContent>
      </Card>
  );
}
