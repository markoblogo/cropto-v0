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
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Activity } from "lucide-react";

const simulateFormSchema = z.object({
  indexPrice: z.coerce.number()
    .positive("Index price must be positive")
    .min(0.00000001, "Index price must be greater than 0"),
});

type SimulateFormData = z.infer<typeof simulateFormSchema>;

interface SimulateMarginCallDialogProps {
  optionId: string;
  commodity?: string;
  onSimulate: (data: SimulateFormData) => Promise<void>;
  isPending: boolean;
}

export function SimulateMarginCallDialog({ 
  optionId, 
  commodity,
  onSimulate, 
  isPending 
}: SimulateMarginCallDialogProps) {
  const [open, setOpen] = useState(false);

  const form = useForm<SimulateFormData>({
    resolver: zodResolver(simulateFormSchema),
    defaultValues: {
      indexPrice: 0,
    },
  });

  const handleSubmit = async (data: SimulateFormData) => {
    await onSimulate(data);
    setOpen(false);
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          size="sm" 
          variant="outline"
          className="gap-2"
          data-testid={`button-simulate-${optionId}`}
        >
          <Activity className="w-4 h-4" />
          Simulate
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]" data-testid="dialog-simulate-margin-call">
        <DialogHeader>
          <DialogTitle>Simulate Margin Call</DialogTitle>
          <DialogDescription>
            Enter an index price to trigger a margin check for this option
            {commodity && ` (${commodity})`}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="indexPrice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Index Price</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.00000001"
                      placeholder="Enter index price"
                      {...field}
                      data-testid="input-index-price"
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
                data-testid="button-confirm-simulate"
              >
                {isPending ? "Simulating..." : "Run Margin Check"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
