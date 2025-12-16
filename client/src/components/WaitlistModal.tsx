import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Loader2, MailCheck } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import type { WaitlistSource } from "@/contexts/WaitlistContext";

const optionalNullableUrl = z.preprocess(
  (v) => {
    if (typeof v !== "string") return v;
    const trimmed = v.trim();
    return trimmed.length ? trimmed : null;
  },
  z.string().url("Must be a valid URL").nullable().optional()
);

const waitlistFormSchema = z.object({
  name: z.string().min(2, "Full name is required"),
  email: z.string().email("Valid email is required"),
  country: z.string().min(2, "Country is required"),
  role: z.enum(["trader", "broker", "farmer", "other"], { required_error: "Role is required" }),
  company: z.string().min(2, "Company is required"),
  linkedinUrl: optionalNullableUrl,
  websiteUrl: optionalNullableUrl,
  agree: z
    .boolean()
    .refine((v) => v === true, { message: "Please agree to be contacted about early access updates." }),
});

type WaitlistFormData = z.infer<typeof waitlistFormSchema>;

export default function WaitlistModal({
  open,
  onOpenChange,
  source,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: WaitlistSource;
}) {
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const defaultValues = useMemo<WaitlistFormData>(
    () => ({
      name: "",
      email: "",
      country: "",
      role: "trader",
      company: "",
      linkedinUrl: "",
      websiteUrl: "",
      agree: false,
    }),
    []
  );

  const form = useForm<WaitlistFormData>({
    resolver: zodResolver(waitlistFormSchema),
    defaultValues,
    mode: "onSubmit",
  });

  const submitMutation = useMutation({
    mutationFn: async (data: WaitlistFormData) => {
      const payload = {
        name: data.name,
        email: data.email,
        country: data.country,
        role: data.role,
        company: data.company,
        linkedinUrl: data.linkedinUrl ?? null,
        websiteUrl: data.websiteUrl ?? null,
        source,
      };

      const resp = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        let message = "Failed to join waitlist. Please try again.";
        try {
          const json = await resp.json();
          message = json?.error
            ? json?.details
              ? `${json.error}: ${json.details}`
              : json.error
            : message;
        } catch {
          // ignore
        }
        throw new Error(message);
      }

      return resp.json().catch(() => ({}));
    },
    onSuccess: () => {
      setSubmitError(null);
      setSubmitted(true);
    },
    onError: (err: any) => {
      setSubmitError(err?.message || "Failed to join waitlist. Please try again.");
    },
  });

  useEffect(() => {
    if (!open) {
      setSubmitted(false);
      setSubmitError(null);
      form.reset(defaultValues);
      form.clearErrors();
    } else {
      // opening: keep whatever user already typed unless it was previously submitted
      if (submitted) {
        setSubmitted(false);
        form.reset(defaultValues);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onSubmit = (data: WaitlistFormData) => {
    setSubmitError(null);
    submitMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-1.5rem)] max-w-xl max-h-[85vh] overflow-y-auto">
        {submitted ? (
          <div className="space-y-5">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MailCheck className="h-5 w-5 text-primary" />
                You're on the list!
              </DialogTitle>
              <DialogDescription>
                We’ve sent a confirmation link to your email. After you confirm, you’ll be among the first to get access to
                production trading and new features.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end">
              <Button onClick={() => onOpenChange(false)}>Close</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <DialogHeader>
              <DialogTitle>Join the Cropto early-access waitlist</DialogTitle>
              <DialogDescription>Leave your details and confirm your email to secure early access.</DialogDescription>
            </DialogHeader>

            {submitError ? (
              <Alert variant="destructive">
                <AlertTitle>Couldn&apos;t submit</AlertTitle>
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            ) : null}

            <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
              <div className="grid gap-2">
                <Label htmlFor="waitlist-name">Full name</Label>
                <Input id="waitlist-name" placeholder="Jane Doe" {...form.register("name")} />
                {form.formState.errors.name ? (
                  <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
                ) : null}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="waitlist-email">Email</Label>
                <Input id="waitlist-email" type="email" placeholder="jane@company.com" {...form.register("email")} />
                {form.formState.errors.email ? (
                  <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="waitlist-country">Country</Label>
                  <Input id="waitlist-country" placeholder="Ukraine" {...form.register("country")} />
                  {form.formState.errors.country ? (
                    <p className="text-sm text-destructive">{form.formState.errors.country.message}</p>
                  ) : null}
                </div>

                <div className="grid gap-2">
                  <Label>Role</Label>
                  <Select
                    value={form.watch("role")}
                    onValueChange={(v) => form.setValue("role", v as WaitlistFormData["role"], { shouldValidate: true })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trader">Trader</SelectItem>
                      <SelectItem value="broker">Broker</SelectItem>
                      <SelectItem value="farmer">Farmer</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.formState.errors.role ? (
                    <p className="text-sm text-destructive">{form.formState.errors.role.message}</p>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="waitlist-company">Company</Label>
                <Input id="waitlist-company" placeholder="Acme Trading LLC" {...form.register("company")} />
                {form.formState.errors.company ? (
                  <p className="text-sm text-destructive">{form.formState.errors.company.message}</p>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="waitlist-linkedin">LinkedIn URL (optional)</Label>
                  <Input id="waitlist-linkedin" placeholder="https://linkedin.com/in/..." {...form.register("linkedinUrl")} />
                  {form.formState.errors.linkedinUrl ? (
                    <p className="text-sm text-destructive">{form.formState.errors.linkedinUrl.message as string}</p>
                  ) : null}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="waitlist-website">Website (optional)</Label>
                  <Input id="waitlist-website" placeholder="https://company.com" {...form.register("websiteUrl")} />
                  {form.formState.errors.websiteUrl ? (
                    <p className="text-sm text-destructive">{form.formState.errors.websiteUrl.message as string}</p>
                  ) : null}
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-md border p-3">
                <Checkbox
                  id="waitlist-agree"
                  checked={!!form.watch("agree")}
                  onCheckedChange={(v) => form.setValue("agree", v === true, { shouldValidate: false })}
                />
                <div className="grid gap-1">
                  <Label htmlFor="waitlist-agree" className="leading-snug">
                    I agree to be contacted about Cropto early access and product updates.
                  </Label>
                  {form.formState.errors.agree ? (
                    <p className="text-sm text-destructive">{form.formState.errors.agree.message as string}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      We’ll only use your email for early-access and product update communication.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={submitMutation.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={submitMutation.isPending}>
                  {submitMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Joining…
                    </>
                  ) : (
                    "Join waitlist"
                  )}
                </Button>
              </div>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}


