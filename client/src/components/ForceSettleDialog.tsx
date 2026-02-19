import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

const forceSettleFormSchema = z.object({
  reason: z.string().min(10).max(500),
});

type ForceSettleFormData = z.infer<typeof forceSettleFormSchema>;

interface ForceSettleDialogProps {
  optionId: string;
  optionTitle: string;
  onForceSettle: (data: ForceSettleFormData) => Promise<void>;
  isPending: boolean;
}

export function ForceSettleDialog({ 
  optionId, 
  optionTitle,
  onForceSettle, 
  isPending 
}: ForceSettleDialogProps) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  const form = useForm<ForceSettleFormData>({
    resolver: zodResolver(
      forceSettleFormSchema.extend({
        reason: z
          .string()
          .min(10, t("dialog.forceSettle.validation.reasonMin"))
          .max(500, t("dialog.forceSettle.validation.reasonMax")),
      })
    ),
    defaultValues: {
      reason: "",
    },
  });

  const handleSubmit = async (data: ForceSettleFormData) => {
    await onForceSettle(data);
    setOpen(false);
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          size="sm" 
          variant="destructive"
          className="gap-2"
          data-testid={`button-force-settle-${optionId}`}
        >
          <AlertTriangle className="w-4 h-4" />
          {t("dialog.forceSettle.button")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]" data-testid="dialog-force-settle">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            {t("dialog.forceSettle.title")}
          </DialogTitle>
          <DialogDescription>
            {t("dialog.forceSettle.subtitle", { title: optionTitle })}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("dialog.forceSettle.reasonLabel")}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t("dialog.forceSettle.reasonPlaceholder")}
                      className="min-h-[100px] resize-none"
                      {...field}
                      data-testid="textarea-force-settle-reason"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setOpen(false)}
                disabled={isPending}
                data-testid="button-cancel-force-settle"
              >
                {t("button.cancel")}
              </Button>
              <Button 
                type="submit" 
                variant="destructive"
                disabled={isPending}
                data-testid="button-confirm-force-settle"
              >
                {isPending ? t("dialog.forceSettle.buttonProcessing") : t("dialog.forceSettle.button")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
