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
import { useTranslation } from "react-i18next";

type MatchFormData = {
  counterpartyId: string;
};

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
  const { t } = useTranslation();

  const matchFormSchema = z.object({
    counterpartyId: z.string().min(1, t("dialog.match.validation.counterpartyRequired")),
  });

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
    const commodityName = (option as any).commodityName || option.commodity || t("dialog.match.values.unknown");
    const commoditySlug = (option as any).commoditySlug || option.commodity?.toLowerCase() || "";
    const indexName = commodityName || t("dialog.match.values.indexFallback");
    const basis = t("dialog.match.values.basis");
    const windowLabel = (option as any).expiryWindow || (option as any).windowLabel || t("dialog.match.values.notSpecified");
    const windowStart = (option as any).windowStart ? format(new Date((option as any).windowStart), "dd MMM yyyy") : t("dialog.match.values.dash");
    const windowEnd = (option as any).windowEnd ? format(new Date((option as any).windowEnd), "dd MMM yyyy") : t("dialog.match.values.dash");
    const settlementDate = option.settlementDate
      ? format(new Date(option.settlementDate), "dd MMM yyyy")
      : option.expirationDate
      ? format(new Date(option.expirationDate), "dd MMM yyyy")
      : t("dialog.match.values.notSpecified");
    const createdAt = option.createdAt ? new Date(option.createdAt) : null;
    const matchedAt = (option as any).matchedAt ? new Date((option as any).matchedAt) : null;
    const marginDeadline = (option as any).marginCallDeadline ? new Date((option as any).marginCallDeadline) : null;
    const isInMarginCall = Boolean((option as any).isInMarginCall);
    const statusUpper = String(option.status || "").toUpperCase();
    const isSettled = ["EXERCISED", "SETTLED"].includes(statusUpper);
    const isLiquidated = ["LIQUIDATED", "DEFAULTED"].includes(statusUpper);

    const timeline = [
      createdAt && {
        label: t("dialog.match.timeline.created"),
        date: createdAt,
        description: t("dialog.match.timeline.createdDesc"),
      },
      matchedAt && {
        label: t("dialog.match.timeline.matched"),
        date: matchedAt,
        description: t("dialog.match.timeline.matchedDesc"),
      },
      (isInMarginCall || marginDeadline) && {
        label: t("dialog.match.timeline.marginCall"),
        date: marginDeadline || null,
        description: marginDeadline
          ? t("dialog.match.timeline.marginCallDeadline", { deadline: format(marginDeadline, "dd MMM yyyy HH:mm") })
          : t("dialog.match.timeline.marginCallActive"),
      },
      (isSettled || isLiquidated) && {
        label: isLiquidated ? t("dialog.match.timeline.liquidated") : t("dialog.match.timeline.settled"),
        date: option.settlementDate ? new Date(option.settlementDate) : null,
        description: isLiquidated ? t("dialog.match.timeline.liquidatedDesc") : t("dialog.match.timeline.settledDesc"),
      },
    ].filter(Boolean) as { label: string; date: Date | null; description: string }[];

    // Format quantity in tons
    const quantityT = parseFloat(option.qty) / 1000;
    
    // Format expiry date
    const expiryDate = option.expirationDate 
      ? format(new Date(option.expirationDate), "dd MMM yyyy")
      : t("dialog.match.values.notSpecified");

    // Determine role description
    const roleDescription = option.type === "CALL" 
      ? t("dialog.match.values.callDesc")
      : t("dialog.match.values.putDesc");

    // Determine user's side
    const userSide = option.issuerId === userId 
      ? t("dialog.match.values.userIssuer")
      : t("dialog.match.values.userCounterparty");

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px] max-h-[85vh] flex flex-col" data-testid="dialog-trade-option">
          <DialogHeader className="shrink-0">
            <DialogTitle>{t("dialog.match.tradeTitle")}</DialogTitle>
            <DialogDescription>
              {t("dialog.match.tradeSubtitle")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
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
                      <div className="font-semibold text-sm text-muted-foreground">{t("dialog.match.labels.underlying")}</div>
                      <div className="font-medium whitespace-nowrap overflow-hidden text-ellipsis">
                        {commodityName}
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {timeline.length > 0 && (
                    <div className="space-y-3">
                      <div className="font-semibold text-sm text-muted-foreground">{t("dialog.match.labels.lifecycle")}</div>
                      <div className="space-y-3">
                        {timeline.map((step, idx) => (
                          <div key={idx} className="flex items-start gap-3">
                            <div className="mt-1 h-2.5 w-2.5 rounded-full bg-primary" />
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{step.label}</span>
                                {step.date && (
                                  <span className="text-xs text-muted-foreground">
                                    {format(step.date, "dd MMM yyyy HH:mm")}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">{step.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="font-semibold text-sm text-muted-foreground">{t("dialog.match.labels.index")}</div>
                      <div className="font-medium break-words">{indexName}</div>
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-muted-foreground">{t("dialog.match.labels.basis")}</div>
                      <div className="font-medium">{basis}</div>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="font-semibold text-sm text-muted-foreground">{t("dialog.match.labels.settlementType")}</div>
                      <div className="font-medium break-words">{t("dialog.match.values.settlementType")}</div>
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-muted-foreground">{t("dialog.match.labels.basis")}</div>
                      <div className="font-medium">{basis}</div>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="font-semibold text-sm text-muted-foreground">{t("dialog.match.labels.window")}</div>
                      <div className="font-medium break-words">{windowLabel}</div>
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-muted-foreground">{t("dialog.match.labels.windowDates")}</div>
                      <div className="font-medium text-sm">{windowStart} → {windowEnd}</div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <div className="font-semibold text-sm text-muted-foreground">{t("dialog.match.labels.settlementDate")}</div>
                    <div className="font-medium">{settlementDate}</div>
                  </div>

                  <Separator />

                  <div>
                    <div className="font-semibold text-sm text-muted-foreground">{t("dialog.match.labels.type")}</div>
                    <div className="font-medium">{roleDescription}</div>
                  </div>

                  <Separator />

                  <div>
                    <div className="font-semibold text-sm text-muted-foreground">{t("dialog.match.labels.quantity")}</div>
                    <div className="font-medium">{t("dialog.match.values.quantityT", { qty: quantityT.toFixed(2) })}</div>
                  </div>

                  <Separator />

                  <div>
                    <div className="font-semibold text-sm text-muted-foreground">{t("dialog.match.labels.strikePrice")}</div>
                    <div className="font-medium">{t("dialog.match.values.strikePerTon", { price: parseFloat(option.strike).toLocaleString() })}</div>
                  </div>

                  <Separator />

                  <div>
                    <div className="font-semibold text-sm text-muted-foreground">{t("dialog.match.labels.expiry")}</div>
                    <div className="font-medium">{expiryDate}</div>
                  </div>

                  <Separator />

                  <div>
                    <div className="font-semibold text-sm text-muted-foreground">{t("dialog.match.labels.premiumPayout")}</div>
                    <div className="font-medium text-lg">{t("dialog.match.values.premiumValue", { premium: parseFloat(option.premium).toLocaleString() })}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Information Block */}
            <div className="bg-muted/50 rounded-lg p-4 text-sm">
              <p className="text-muted-foreground">
                {t("dialog.match.info", { side: userSide })}
              </p>
            </div>
          </div>

          <DialogFooter className="shrink-0 pt-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {t("button.cancel")}
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
                  {t("dialog.match.tradeConfirming")}
                </>
              ) : (
                t("dialog.match.tradeConfirm")
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
          {t("dialog.match.trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]" data-testid="dialog-match-option">
        <DialogHeader>
          <DialogTitle>{t("dialog.match.title")}</DialogTitle>
          <DialogDescription>
            {t("dialog.match.subtitle")}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="counterpartyId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("dialog.match.counterpartyLabel")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("dialog.match.counterpartyPlaceholder")}
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
                {isPending ? t("dialog.match.buttonProcessing") : t("dialog.match.button")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
