import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Calendar, Info, Wallet, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { insertOptionSchema } from "@shared/schema";
import type { InsertOption } from "@shared/schema";
import { generateOptionTitle } from "@shared/utils";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useWalletSummary } from "@/hooks/useWalletSummary";
import { useWeb3 } from "@/contexts/Web3Context";
import {
  computeNotional,
  computeCollateral,
  collateralPct,
  monthsBetween,
  calculatePnLPreview,
} from "@/lib/optionCalculations";

interface CreateOptionDialogProps {
  onSubmit: (data: InsertOption) => Promise<void>;
  isPending: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultIndexId?: string;
  // Prefill values from an existing option
  prefillOption?: {
    indexId?: string;
    type?: "CALL" | "PUT";
    strike?: string;
    qty?: string;
    premium?: string;
    expirationDate?: Date | string;
  } | null;
}

interface CommodityIndex {
  id: string;
  name: string;
  slug: string;
  category: string;
  hasVat: boolean;
  latestPrice: {
    price: number;
    delta: number | null;
    timestamp: string;
  } | null;
}

export function CreateOptionDialog({ onSubmit, isPending, open: externalOpen, onOpenChange, defaultIndexId, prefillOption }: CreateOptionDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;
  const web3 = useWeb3();

  // Fetch commodity indexes
  const { data: commodities = [], isLoading: commoditiesLoading } = useQuery<CommodityIndex[]>({
    queryKey: ['/api/indexes'],
    enabled: open,
  });

  // Fetch current user for wallet info
  const { data: userData } = useQuery<{ 
    user: { 
      id: string; 
      email: string; 
      role: string;
      walletAddress?: string;
    } 
  } | null>({
    queryKey: ["/api/auth/me"],
    retry: false,
    enabled: open && !!localStorage.getItem('cropto_token'),
  });

  const walletAddress = userData?.user?.walletAddress || web3.address || null;
  const walletData = useWalletSummary(walletAddress);

  const form = useForm<InsertOption>({
    resolver: zodResolver(insertOptionSchema),
    defaultValues: {
      title: "",
      type: prefillOption?.type || "CALL",
      strike: prefillOption?.strike || "",
      qty: prefillOption?.qty || "",
      premium: prefillOption?.premium || "",
      buyer: "",
      indexId: prefillOption?.indexId || defaultIndexId || "",
      expirationDate: prefillOption?.expirationDate 
        ? (typeof prefillOption.expirationDate === 'string' 
          ? new Date(prefillOption.expirationDate) 
          : prefillOption.expirationDate)
        : undefined,
      status: "OPEN",
    },
  });

  // Reset form when prefillOption changes or dialog opens
  useEffect(() => {
    if (open) {
      form.reset({
        title: "",
        type: prefillOption?.type || "CALL",
        strike: prefillOption?.strike || "",
        qty: prefillOption?.qty || "",
        premium: prefillOption?.premium || "",
        buyer: "",
        indexId: prefillOption?.indexId || defaultIndexId || "",
        expirationDate: prefillOption?.expirationDate 
          ? (typeof prefillOption.expirationDate === 'string' 
            ? new Date(prefillOption.expirationDate) 
            : prefillOption.expirationDate)
          : undefined,
        status: "OPEN",
      });
    }
  }, [open, prefillOption, defaultIndexId, form]);

  const handleSubmit = async (data: InsertOption) => {
    try {
      await onSubmit(data);
      setOpen(false);
      form.reset();
    } catch (error) {
      // Error is already handled by the mutation's onError callback
      console.error("Error submitting option form:", error);
    }
  };

  // Watch form values for calculations
  const indexId = form.watch("indexId");
  const qty = form.watch("qty");
  const expirationDate = form.watch("expirationDate");
  const optionType = form.watch("type");
  const strike = form.watch("strike");
  const premium = form.watch("premium");

  // Find selected commodity
  const selectedCommodity = commodities.find(c => c.id === indexId);
  const currentMarketPrice = selectedCommodity?.latestPrice?.price || 0;

  // Auto-generate title when relevant fields change
  useEffect(() => {
    if (selectedCommodity && qty && expirationDate) {
      const qtyNum = parseFloat(qty);
      if (!isNaN(qtyNum) && qtyNum > 0) {
        const title = generateOptionTitle({
          commodityName: selectedCommodity.name,
          quantity: qtyNum,
          creationDate: new Date(),
          expirationDate: new Date(expirationDate),
        });
        form.setValue("title", title);
      }
    }
  }, [selectedCommodity, qty, expirationDate, form]);

  // Calculate financial metrics
  const qtyNum = parseFloat(qty) || 0;
  const strikeNum = parseFloat(strike) || 0;
  const premiumNum = parseFloat(premium) || 0;
  const notional = computeNotional(strikeNum, qtyNum);
  
  // Calculate expiry months for collateral
  const expiryMonths = useMemo(() => {
    if (!expirationDate) return 0;
    const expiry = typeof expirationDate === 'string' ? new Date(expirationDate) : expirationDate;
    return monthsBetween(new Date(), expiry);
  }, [expirationDate]);
  
  const collateralAmount = computeCollateral(notional, expiryMonths);
  const totalPremium = premiumNum * qtyNum;
  const totalRequired = totalPremium + collateralAmount;

  // PnL Preview calculations
  const pnlPreview = useMemo(() => {
    if (!strikeNum || !qtyNum || !premiumNum || !currentMarketPrice) {
      return null;
    }
    // Show preview at current market price and at strike ±20%
    const scenarios = [
      { label: "Current Price", price: currentMarketPrice },
      { label: "Strike -20%", price: strikeNum * 0.8 },
      { label: "Strike", price: strikeNum },
      { label: "Strike +20%", price: strikeNum * 1.2 },
    ];
    return scenarios.map(scenario => ({
      ...scenario,
      ...calculatePnLPreview(optionType as "CALL" | "PUT", strikeNum, qtyNum, premiumNum, scenario.price),
    }));
  }, [strikeNum, qtyNum, premiumNum, currentMarketPrice, optionType]);

  // Validation: check balance
  const hasInsufficientBalance = walletData.internalBalance < totalRequired;
  const canSubmit = !hasInsufficientBalance && qtyNum > 0 && strikeNum > 0 && premiumNum > 0 && expirationDate && indexId;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {externalOpen === undefined && (
        <DialogTrigger asChild>
          <Button 
            data-testid="button-create-option"
            className="inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Option
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold">Create Option Contract</DialogTitle>
          <DialogDescription>
            Create a new commodity option contract with professional terms
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            
            {/* Block 1: Contract Terms */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Block 1: Contract Terms</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Define the basic terms of the option contract
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="indexId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">Commodity / Index</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          value={field.value}
                          disabled={commoditiesLoading || !!defaultIndexId}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-commodity">
                              <SelectValue placeholder="Select commodity" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {commodities.map((commodity) => (
                              <SelectItem key={commodity.id} value={commodity.id}>
                                {commodity.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">Option Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-type">
                              <SelectValue placeholder="Select option type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="CALL">CALL</SelectItem>
                            <SelectItem value="PUT">PUT</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="qty"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">Quantity (tons)</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input 
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="50" 
                              className="font-mono pr-12"
                              data-testid="input-qty"
                              {...field} 
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">t</span>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="strike"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">Strike Price ($/t)</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                            <Input 
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="209.00" 
                              className="font-mono pl-7"
                              data-testid="input-strike"
                              {...field} 
                            />
                          </div>
                        </FormControl>
                        {currentMarketPrice > 0 && (
                          <FormDescription className="text-xs">
                            Current: ${currentMarketPrice.toFixed(2)}/t
                          </FormDescription>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="expirationDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel className="text-sm font-medium">Expiration Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                data-testid="button-expiration-date"
                                className={cn(
                                  "w-full pl-3 text-left font-normal justify-start",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                <Calendar className="mr-2 h-4 w-4" />
                                {field.value && !isNaN(new Date(field.value).getTime()) 
                                  ? format(new Date(field.value), "PPP") 
                                  : "Pick expiration date"}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <CalendarComponent
                              mode="single"
                              selected={field.value ? new Date(field.value) : undefined}
                              onSelect={field.onChange}
                              disabled={(date) => date < new Date()}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="premium"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">Premium (CROPT per ton)</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input 
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="5.00" 
                              className="font-mono pr-16"
                              data-testid="input-premium"
                              {...field} 
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">CROPT</span>
                          </div>
                        </FormControl>
                        <FormDescription className="text-xs">
                          1 CROPT = 1 USD (dollar-denominated premium)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Side</Label>
                    <div className="rounded-md border bg-muted/30 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Your Position:</span>
                        <Badge variant="secondary">SHORT (Seller)</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        As the option creator, you are the seller. When matched, the counterparty becomes the buyer (LONG).
                      </p>
                    </div>
                  </div>
                </div>

                {/* Auto-generated Title (Hidden but still in form) */}
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem className="hidden">
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Block 2 & 3: Collateral Model and Price Preview (side by side) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Block 2: Collateral Model */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg">Block 2: Collateral Model</CardTitle>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="w-4 h-4 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-xs">
                            Collateral is required from the seller to cover potential obligations. 
                            The percentage is calculated automatically based on expiry duration.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-md border bg-muted/30 p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Collateral Rate:</span>
                      <span className="text-sm font-mono font-semibold">
                        {expiryMonths > 0 && notional > 0 ? `${(collateralPct(expiryMonths) * 100).toFixed(0)}%` : "-"}
                      </span>
                    </div>
                    {expiryMonths > 0 && (
                      <div className="text-xs text-muted-foreground space-y-1">
                        <p>• {collateralPct(expiryMonths) * 100}% for {expiryMonths <= 3 ? "≤3 months" : expiryMonths <= 6 ? "4-6 months" : "7+ months"}</p>
                        <p>• Collateral is locked when option is matched</p>
                        <p>• Returned if option expires worthless or is exercised profitably</p>
                        <p>• Margin call triggered if intrinsic value ≥ 80% of collateral</p>
                      </div>
                    )}
                    {notional > 0 && (
                      <div className="pt-2 border-t">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium">Collateral Amount:</span>
                          <span className="text-sm font-mono font-semibold">
                            {collateralAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CROPT
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Block 3: Price & PnL Preview */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Block 3: Price & PnL Preview</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Premium per ton:</span>
                      <span className="text-sm font-mono font-semibold">
                        {premiumNum > 0 ? `${premiumNum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CROPT` : "-"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Total Premium:</span>
                      <span className="text-sm font-mono font-semibold" data-testid="text-total-premium">
                        {totalPremium > 0 
                          ? `${totalPremium.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CROPT`
                          : "-"}
                      </span>
                    </div>
                    {notional > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Notional Value:</span>
                        <span className="text-sm font-mono font-semibold">
                          ${notional.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                  </div>

                  {pnlPreview && pnlPreview.length > 0 && (
                    <div className="pt-2 border-t space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">PnL Scenarios (as Seller):</p>
                      <div className="space-y-1 text-xs">
                        {pnlPreview.map((scenario, idx) => (
                          <div key={idx} className="flex justify-between">
                            <span className="text-muted-foreground">{scenario.label}:</span>
                            <span className={cn(
                              "font-mono",
                              scenario.netPnL < 0 ? "text-red-600" : scenario.netPnL > 0 ? "text-green-600" : ""
                            )}>
                              {scenario.netPnL >= 0 ? "+" : ""}{scenario.netPnL.toFixed(2)} CROPT
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <Separator className="my-2" />
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p className="font-medium mb-1">Settlement Logic:</p>
                    {optionType === "CALL" ? (
                      <p>If index at expiry is above strike, buyer receives (index - strike) × quantity. Otherwise, no payout.</p>
                    ) : (
                      <p>If index at expiry is below strike, seller pays (strike - index) × quantity. Otherwise, no payout.</p>
                    )}
                    <p className="mt-2">Exercise available when status is FILLED. Withdraw available after exercise or expiry.</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Block 4: Transaction & Signature */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Block 4: Transaction & Signature</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!walletAddress ? (
                  <Alert>
                    <Wallet className="h-4 w-4" />
                    <AlertDescription>
                      <div className="flex items-center justify-between">
                        <span>Wallet not connected</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={web3.connectWallet}
                          disabled={web3.isConnecting}
                        >
                          {web3.isConnecting ? "Connecting..." : "Connect Wallet"}
                        </Button>
                      </div>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Wallet Address:</span>
                        <span className="font-mono text-xs">
                          {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Available CROPT:</span>
                        <span className="font-mono font-semibold">
                          {walletData.internalBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} CROPT
                        </span>
                      </div>
                    </div>

                    {hasInsufficientBalance && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          Insufficient balance. Required: {totalRequired.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CROPT
                          <br />
                          <span className="text-xs">Go to Spot Trading to buy CROPT</span>
                        </AlertDescription>
                      </Alert>
                    )}

                    <div className="rounded-md border bg-muted/30 p-3 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">You will pay:</span>
                        <span className="font-mono font-semibold">
                          {totalPremium > 0 ? `${totalPremium.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CROPT` : "-"}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Premium</span>
                        <span>{totalPremium > 0 ? `${totalPremium.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CROPT` : "-"}</span>
                      </div>
                      {collateralAmount > 0 && (
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>+ Collateral (locked when matched)</span>
                          <span>{collateralAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CROPT</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Buyer Address (still needed for form) */}
                <FormField
                  control={form.control}
                  name="buyer"
                  render={({ field }) => (
                    <FormItem className="hidden">
                      <FormControl>
                        <Input {...field} value={field.value || ""} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isPending}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isPending || !canSubmit}
                data-testid="button-submit"
              >
                {isPending ? "Creating..." : "Create Option"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
