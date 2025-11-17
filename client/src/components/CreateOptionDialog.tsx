import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
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
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { insertOptionSchema } from "@shared/schema";
import type { InsertOption } from "@shared/schema";

interface CreateOptionDialogProps {
  onSubmit: (data: InsertOption) => Promise<void>;
  isPending: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultCommodity?: string;
}

export function CreateOptionDialog({ onSubmit, isPending, open: externalOpen, onOpenChange, defaultCommodity }: CreateOptionDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;

  const form = useForm<InsertOption>({
    resolver: zodResolver(insertOptionSchema),
    defaultValues: {
      title: "",
      type: "CALL",
      strike: "",
      qty: "",
      premium: "",
      buyer: "",
      commodity: defaultCommodity || "",
      status: "OPEN",
    },
  });

  const handleSubmit = async (data: InsertOption) => {
    await onSubmit(data);
    setOpen(false);
    form.reset();
  };

  // Watch form values for live calculations
  const strike = form.watch("strike");
  const qty = form.watch("qty");
  const premium = form.watch("premium");

  // Calculate total premium and collateral
  const totalPremium = (parseFloat(premium) || 0) * (parseFloat(qty) || 0);
  const requiredCollateral = (parseFloat(strike) || 0) * (parseFloat(qty) || 0);

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
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold">Create New Option</DialogTitle>
          <DialogDescription>
            Create a new crypto option contract. Fill in all required fields.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Option Title</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="e.g., BTC-50000-CALL-30DEC" 
                      data-testid="input-title"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="commodity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Commodity</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="e.g., WHEAT, Corn, Rapeseed" 
                      data-testid="input-commodity"
                      disabled={!!defaultCommodity}
                      {...field} 
                    />
                  </FormControl>
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
                name="strike"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Strike Price</FormLabel>
                    <FormControl>
                      <Input 
                        type="number"
                        step="0.00000001"
                        min="0"
                        placeholder="50000.00" 
                        className="font-mono"
                        data-testid="input-strike"
                        {...field} 
                      />
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
                    <FormLabel className="text-sm font-medium">Quantity</FormLabel>
                    <FormControl>
                      <Input 
                        type="number"
                        step="0.00000001"
                        min="0"
                        placeholder="1.00" 
                        className="font-mono"
                        data-testid="input-qty"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="premium"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Premium</FormLabel>
                  <FormControl>
                    <Input 
                      type="number"
                      step="0.00000001"
                      min="0"
                      placeholder="500.00" 
                      className="font-mono"
                      data-testid="input-premium"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="buyer"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Buyer Address</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="0x..." 
                      className="font-mono text-sm"
                      data-testid="input-buyer"
                      {...field} 
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
                      ${totalPremium.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
