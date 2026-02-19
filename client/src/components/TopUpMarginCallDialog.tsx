import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";

const topUpSchema = z.object({
  amount: z.coerce.number().positive().min(0.00000001),
  currency: z.enum(["CROPT", "FIAT"]),
});

type TopUpFormValues = z.infer<typeof topUpSchema>;

interface TopUpMarginCallDialogProps {
  marginCallId: string;
  onTopUp: (data: TopUpFormValues & { marginCallId: string }) => Promise<void>;
  isPending?: boolean;
}

export function TopUpMarginCallDialog({
  marginCallId,
  onTopUp,
  isPending = false,
}: TopUpMarginCallDialogProps) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  const form = useForm<TopUpFormValues>({
    resolver: zodResolver(
      topUpSchema.extend({
        amount: z.coerce
          .number()
          .positive(t("dialog.topup.validation.positive"))
          .min(0.00000001, t("dialog.topup.validation.min")),
        currency: z.enum(["CROPT", "FIAT"], {
          required_error: t("dialog.topup.validation.currencyRequired"),
        }),
      })
    ),
    defaultValues: {
      amount: 0,
      currency: "CROPT",
    },
  });

  const handleSubmit = async (data: TopUpFormValues) => {
    await onTopUp({ ...data, marginCallId });
    setOpen(false);
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="default"
          size="sm"
          data-testid={`button-topup-${marginCallId}`}
          className="gap-1.5"
        >
          <TrendingUp className="w-3.5 h-3.5" />
          {t("dialog.topup.trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="dialog-topup">
        <DialogHeader>
          <DialogTitle>{t("dialog.topup.title")}</DialogTitle>
          <DialogDescription>
            {t("dialog.topup.subtitle")}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("dialog.topup.amountLabel")}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      step="0.00000001"
                      placeholder={t("dialog.topup.amountPlaceholder")}
                      data-testid="input-topup-amount"
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="currency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("dialog.topup.currencyLabel")}</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    disabled={isPending}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-currency">
                        <SelectValue placeholder={t("dialog.topup.currencyPlaceholder")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="CROPT" data-testid="option-currency-cropt">
                        CROPT
                      </SelectItem>
                      <SelectItem value="FIAT" data-testid="option-currency-fiat">
                        {t("dialog.topup.fiat")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex gap-2 justify-end pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isPending}
                data-testid="button-cancel-topup"
              >
                {t("button.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                data-testid="button-submit-topup"
              >
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isPending ? t("dialog.topup.buttonProcessing") : t("dialog.topup.button")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
