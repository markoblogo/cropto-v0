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
import { Handshake } from "lucide-react";

const matchFormSchema = z.object({
  seller: z.string().min(1, "Seller identifier is required"),
});

type MatchFormData = z.infer<typeof matchFormSchema>;

interface MatchOptionDialogProps {
  optionId: string;
  onMatch: (data: MatchFormData) => Promise<void>;
  isPending: boolean;
}

export function MatchOptionDialog({ optionId, onMatch, isPending }: MatchOptionDialogProps) {
  const [open, setOpen] = useState(false);

  const form = useForm<MatchFormData>({
    resolver: zodResolver(matchFormSchema),
    defaultValues: {
      seller: "",
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
            Enter the seller details to complete this trade
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="seller"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Seller Identifier</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="seller@example.com"
                      {...field}
                      data-testid="input-seller"
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
