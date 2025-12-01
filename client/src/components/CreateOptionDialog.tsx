import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Calendar, Info } from "lucide-react";
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
import { insertOptionSchema } from "@shared/schema";
import type { InsertOption } from "@shared/schema";
import { generateOptionTitle } from "@shared/utils";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useWalletSummary } from "@/hooks/useWalletSummary";

interface CreateOptionDialogProps {
  onSubmit: (data: InsertOption) => Promise<void>;
  isPending: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultIndexId?: string;
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

export function CreateOptionDialog({ onSubmit, isPending, open: externalOpen, onOpenChange, defaultIndexId }: CreateOptionDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;

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

  const walletAddress = userData?.user?.walletAddress || null;
  const walletData = useWalletSummary(walletAddress);

  const form = useForm<InsertOption>({
    resolver: zodResolver(insertOptionSchema),
    defaultValues: {
      title: "",
      type: "CALL",
      strike: "",
      qty: "",
      premium: "",
      buyer: "",
      indexId: defaultIndexId || "",
      expirationDate: undefined,
      status: "OPEN",
    },
  });

  const handleSubmit = async (data: InsertOption) => {
    try {
      await onSubmit(data);
      setOpen(false);
      form.reset();
    } catch (error) {
      // Error is already handled by the mutation's onError callback
      // Just prevent it from bubbling up and breaking the UI
      console.error("Error submitting option form:", error);
    }
  };

  // Watch form values for auto-generation and dynamic labels
  const indexId = form.watch("indexId");
  const qty = form.watch("qty");
  const expirationDate = form.watch("expirationDate");
  const optionType = form.watch("type");
  const strike = form.watch("strike");
  const premium = form.watch("premium");

  // Find selected commodity
  const selectedCommodity = commodities.find(c => c.id === indexId);

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

  // Calculate total premium and notional for preview
  const totalPremium = (parseFloat(premium) || 0) * (parseFloat(qty) || 0);
  const notional = (parseFloat(strike) || 0) * (parseFloat(qty) || 0);

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
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold">Create New Option</DialogTitle>
          <DialogDescription>
            Create a new commodity option contract with auto-generated title
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            
            {/* Block 1: Contract Terms */}
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold mb-1">Contract Terms</h3>
                <p className="text-xs text-muted-foreground">
                  Define the basic terms of the option contract
                </p>
              </div>
              
              <FormField
                control={form.control}
                name="indexId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Commodity / Index</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
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
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
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

              <div className="grid grid-cols-2 gap-4">
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
                            step="1"
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
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

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
                    <input
                      type="date"
                      data-testid="input-expiration-date-hidden"
                      className="sr-only"
                      value={field.value && !isNaN(new Date(field.value).getTime()) 
                        ? format(new Date(field.value), "yyyy-MM-dd") 
                        : ""}
                      onChange={(e) => {
                        const date = e.target.value ? new Date(e.target.value + "T00:00:00") : undefined;
                        field.onChange(date);
                      }}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="premium"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Premium (CROPT)</FormLabel>
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
            </div>

            <Separator />

            {/* Block 2: Collateral Model */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold">Collateral Model</h3>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-4 h-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">
                        Collateral is required from the seller to cover potential obligations. 
                        For MVP, we use a simplified model based on expiry duration (5% for ≤3 months, 10% for 4-6 months, 20% for 7+ months).
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-sm text-muted-foreground">
                  Standard collateral model (calculated automatically based on expiry duration)
                </p>
              </div>
            </div>

            <Separator />

            {/* Block 3: Price Preview */}
            <div className="space-y-4">
              <h3 className="text-base font-semibold">Price Preview</h3>
              <Card className="bg-muted/30">
                <CardContent className="pt-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Premium:</span>
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
                  <Separator className="my-2" />
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p className="font-medium mb-1">Settlement Logic:</p>
                    {optionType === "CALL" ? (
                      <p>If index at expiry is above strike, buyer receives (index - strike) × quantity. Otherwise, no payout.</p>
                    ) : (
                      <p>If index at expiry is below strike, seller pays (strike - index) × quantity. Otherwise, no payout.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Separator />

            {/* Block 4: Transaction & Signature */}
            <div className="space-y-4">
              <h3 className="text-base font-semibold">Transaction & Signature</h3>
              
              {!walletAddress ? (
                <div className="rounded-md border border-dashed p-4 text-center">
                  <p className="text-sm text-muted-foreground mb-3">Wallet not connected</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Trigger wallet connection - this would typically open a modal
                      // For now, we'll just show a message
                      window.location.href = '/';
                    }}
                  >
                    Connect Wallet
                  </Button>
                </div>
              ) : (
                <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Wallet:</span>
                    <span className="font-mono text-xs">
                      {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                    </span>
                  </div>
                  {walletData.onChainBalance > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">CROPT Balance:</span>
                      <span className="font-mono font-semibold">
                        {walletData.onChainBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} CROPT
                      </span>
                    </div>
                  )}
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
            </div>

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
                disabled={isPending}
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
