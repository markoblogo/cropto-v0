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
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Activity } from "lucide-react";

const exerciseFormSchema = z.object({
  spotPrice: z.coerce.number().positive("Spot price must be positive"),
});

type ExerciseFormData = z.infer<typeof exerciseFormSchema>;

interface ExerciseOptionDialogProps {
  optionId: string;
  optionType: "CALL" | "PUT";
  strike: string;
  onExercise: (optionId: string, spotPrice: number) => Promise<void>;
  isPending: boolean;
}

export function ExerciseOptionDialog({ 
  optionId, 
  optionType,
  strike,
  onExercise, 
  isPending 
}: ExerciseOptionDialogProps) {
  const [open, setOpen] = useState(false);

  const form = useForm<ExerciseFormData>({
    resolver: zodResolver(exerciseFormSchema),
    defaultValues: {
      spotPrice: 0,
    },
  });

  const handleSubmit = async (data: ExerciseFormData) => {
    await onExercise(optionId, data.spotPrice);
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
          data-testid={`button-exercise-${optionId}`}
        >
          <Activity className="w-4 h-4" />
          Exercise
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]" data-testid="dialog-exercise-option">
        <DialogHeader>
          <DialogTitle>Exercise {optionType} Option</DialogTitle>
          <DialogDescription>
            Enter the current spot price to exercise this option. Strike: ${parseFloat(strike).toLocaleString()}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="spotPrice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Current Spot Price</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.00000001"
                      placeholder="0.00"
                      {...field}
                      data-testid="input-spot-price"
                    />
                  </FormControl>
                  <FormDescription>
                    The current market price of the asset
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button 
                type="submit" 
                disabled={isPending}
                data-testid="button-confirm-exercise"
              >
                {isPending ? "Processing..." : "Exercise Option"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
