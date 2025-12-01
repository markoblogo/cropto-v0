import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2, Handshake } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Option } from "@shared/schema";

// Schema for broker mode (old mode with form)
const matchFormSchema = z.object({
  counterpartyId: z.string().min(1, "Counterparty ID is required"),
});

type MatchFormData = z.infer<typeof matchFormSchema>;

// New friendly mode props
interface TradeOptionDialogProps {
  option: Option;
  userId: string;
  onMatch: (optionId: string, counterpartyId: string) => Promise<void>;
  isPending: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Old broker mode props (backward compatible)
interface BrokerMatchDialogProps {
  optionId: string;
  onMatch: (data: MatchFormData) => Promise<void>;
  isPending: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

type MatchOptionDialogProps = TradeOptionDialogProps | BrokerMatchDialogProps;

// Type guard to check if it's the new mode
function isTradeOptionMode(props: MatchOptionDialogProps): props is TradeOptionDialogProps {
  return "option" in props && "userId" in props;
}

export function MatchOptionDialog(props: MatchOptionDialogProps) {
  // New friendly mode for regular users
  if (isTradeOptionMode(props)) {
    const { option, userId, onMatch, isPending, open, onOpenChange } = props;

    const handleConfirm = async () => {
      try {
        await onMatch(option.id, userId);
        onOpenChange(false);
      } catch (error) {
        // Error handling is done in the parent component
      }
    };

    // Extract commodity name
    const commodityName = (option as any).commodityName || option.commodity || "Unknown";
    const commoditySlug = (option as any).commoditySlug || option.commodity?.toLowerCase() || "";

    // Format quantity in tons
    const quantityT = parseFloat(option.qty) / 1000;
    
    // Format expiry date
    const expiryDate = option.expirationDate 
      ? format(new Date(option.expirationDate), "dd MMM yyyy")
      : "Not specified";

    // Determine role description
    const roleDescription = option.type === "CALL" 
      ? "Call option (right to buy)"
      : "Put option (right to sell)";

    // Determine user's side
    const userSide = option.issuerId === userId 
      ? "You are the issuer"
      : "You will take the counterparty role";

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]" data-testid="dialog-trade-option">
          <DialogHeader>
            <DialogTitle>Trade option</DialogTitle>
            <DialogDescription>
              You are about to take the other side of this option. Please review the details before confirming.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Option Summary Card */}
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    {commoditySlug && (
                      <img 
                        src={`/commodities/${commoditySlug}.png`}
                        alt={commodityName}
                        className="w-8 h-8 rounded-md object-cover"
                      />
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-muted-foreground">Underlying</div>
                      <div className="font-medium whitespace-nowrap overflow-hidden text-ellipsis">
                        {commodityName}
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <div className="font-semibold text-sm text-muted-foreground">Type</div>
                    <div className="font-medium">{roleDescription}</div>
                  </div>

                  <Separator />

                  <div>
                    <div className="font-semibold text-sm text-muted-foreground">Quantity</div>
                    <div className="font-medium">{quantityT.toFixed(2)} t</div>
                  </div>

                  <Separator />

                  <div>
                    <div className="font-semibold text-sm text-muted-foreground">Strike price</div>
                    <div className="font-medium">${parseFloat(option.strike).toLocaleString()} per ton</div>
                  </div>

                  <Separator />

                  <div>
                    <div className="font-semibold text-sm text-muted-foreground">Expiry</div>
                    <div className="font-medium">{expiryDate}</div>
                  </div>

                  <Separator />

                  <div>
                    <div className="font-semibold text-sm text-muted-foreground">Premium / Expected payout</div>
                    <div className="font-medium text-lg">${parseFloat(option.premium).toLocaleString()} CROPT</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Information Block */}
            <div className="bg-muted/50 rounded-lg p-4 text-sm">
              <p className="text-muted-foreground">
                {userSide}. If the market price at expiry is worse than the strike for your side, you will pay the difference; if it is better, you will receive it.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={isPending}
              className="bg-green-600 hover:bg-green-700"
              data-testid="button-confirm-trade"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Confirming...
                </>
              ) : (
                "Confirm trade"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Old broker mode (backward compatible)
  const { optionId, onMatch, isPending, open: controlledOpen, onOpenChange } = props;
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const setOpen = (next: boolean) => {
    if (!isControlled) {
      setInternalOpen(next);
    }
    onOpenChange?.(next);
  };

  const form = useForm<MatchFormData>({
    resolver: zodResolver(matchFormSchema),
    defaultValues: {
      counterpartyId: "",
    },
  });

  const handleSubmit = async (data: MatchFormData) => {
    await onMatch(data);
    setOpen(false);
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          size="sm" 
          variant="default"
          className="gap-2"
          data-testid={`button-match-${optionId}`}
        >
          <Handshake className="w-4 h-4" />
          Match
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]" data-testid="dialog-match-option">
        <DialogHeader>
          <DialogTitle>Match Option</DialogTitle>
          <DialogDescription>
            Enter the counterparty ID to complete this trade
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="counterpartyId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Counterparty ID</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="user_id_123abc"
                      {...field}
                      data-testid="input-counterparty-id"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button 
                type="submit" 
                disabled={isPending}
                data-testid="button-confirm-match"
              >
                {isPending ? "Matching..." : "Confirm Match"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
