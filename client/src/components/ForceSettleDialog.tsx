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

const forceSettleFormSchema = z.object({
  reason: z.string()
    .min(10, "Reason must be at least 10 characters")
    .max(500, "Reason must be less than 500 characters"),
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

  const form = useForm<ForceSettleFormData>({
    resolver: zodResolver(forceSettleFormSchema),
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
          Force Settle
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]" data-testid="dialog-force-settle">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            Force Settle Option
          </DialogTitle>
          <DialogDescription>
            This will force-settle the option "{optionTitle}" and update its status to EXERCISED or DEFAULTED. 
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason for Force Settlement</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter detailed reason for force-settling this option (e.g., margin call deadline expired, insufficient collateral, etc.)"
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
                Cancel
              </Button>
              <Button 
                type="submit" 
                variant="destructive"
                disabled={isPending}
                data-testid="button-confirm-force-settle"
              >
                {isPending ? "Processing..." : "Force Settle"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
