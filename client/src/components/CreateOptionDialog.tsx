import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Calendar } from "lucide-react";
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
import { insertOptionSchema } from "@shared/schema";
import type { InsertOption } from "@shared/schema";
import { generateOptionTitle } from "@shared/utils";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

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
    await onSubmit(data);
    setOpen(false);
    form.reset();
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

  // Calculate total premium and collateral
  const totalPremium = (parseFloat(premium) || 0) * (parseFloat(qty) || 0);
  const requiredCollateral = (parseFloat(strike) || 0) * (parseFloat(qty) || 0);

  // Dynamic buyer address label
  const buyerAddressLabel = optionType === "CALL" 
    ? "Buyer CROPT Address" 
    : "Buyer Commodity Wallet Address";
  const buyerAddressPlaceholder = optionType === "CALL"
    ? "0x... (will pay CROPT premium)"
    : "0x... (will deliver commodity)";

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
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            
            {/* Commodity Selector */}
            <FormField
              control={form.control}
              name="indexId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Commodity</FormLabel>
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

            {/* Auto-generated Title (Read-only) */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Option Title (Auto-generated)</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Select commodity, quantity, and dates to generate" 
                      data-testid="input-title"
                      readOnly
                      className="bg-muted/50 font-mono text-sm"
                      {...field} 
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Format: COMMODITY-QTY-CREATED-EXPIRES-VOLUME-ID
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Option Type */}
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
                      <SelectItem value="CALL">CALL (Buyer pays CROPT, seller delivers commodity)</SelectItem>
                      <SelectItem value="PUT">PUT (Buyer delivers commodity, seller pays CROPT)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Strike Price and Quantity */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="strike"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Strike Price ($)</FormLabel>
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

              <FormField
                control={form.control}
                name="qty"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Quantity (tonnes)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input 
                          type="number"
                          step="1"
                          min="0"
                          placeholder="50" 
                          className="font-mono pr-16"
                          data-testid="input-qty"
                          {...field} 
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">tonnes</span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Expiration Date */}
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
                  {/* Hidden date input for testing purposes */}
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

            {/* Premium */}
            <FormField
              control={form.control}
              name="premium"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Premium ($ = CROPT)</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input 
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="5.00" 
                        className="font-mono pl-7"
                        data-testid="input-premium"
                        {...field} 
                      />
                    </div>
                  </FormControl>
                  <FormDescription className="text-xs">
                    1 CROPT = 1 USDT (dollar-denominated premium)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Buyer Address */}
            <FormField
              control={form.control}
              name="buyer"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">{buyerAddressLabel}</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder={buyerAddressPlaceholder}
                      className="font-mono text-sm"
                      data-testid="input-buyer"
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Live Calculations Summary */}
            {(totalPremium > 0 || requiredCollateral > 0) && (
              <div className="rounded-md border bg-accent/5 p-4 space-y-3" data-testid="calculations-summary">
                <h3 className="text-sm font-semibold text-foreground">Contract Summary</h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Total Premium:</span>
                    <span className="text-sm font-mono font-semibold text-accent-foreground" data-testid="text-total-premium">
                      ${totalPremium.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CROPT
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Required Collateral:</span>
                    <span className="text-sm font-mono font-semibold text-primary" data-testid="text-required-collateral">
                      ${requiredCollateral.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="pt-2 border-t text-xs text-muted-foreground">
                    Collateral is required from the seller to cover the obligation at strike price.
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
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
