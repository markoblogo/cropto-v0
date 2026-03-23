import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { basisOptions, brokers, commodityOptions, countryOptions, portOptions } from "../mock/dictionaries";
import {
  createBrokerageEntry,
  updateBrokerageEntryTelegramRelayStatus,
} from "../services/seaBrokerageMonitor.service";
import {
  buildCanonicalView,
} from "../services/entryFormatting.service";
import { publishEntryToTelegram } from "../services/telegramRelay.service";
import type {
  Basis,
  BrokerageEntry,
  Currency,
  EntryType,
  PeriodType,
  TransportType,
  VolumeUnit,
} from "../types";
import type { useSeaBrokerageTelegramSession } from "../hooks/useSeaBrokerageTelegramSession";

const volumeUnitOptions: Array<{ value: VolumeUnit; label: string }> = [{ value: "mt", label: "MT" }];
const currencyOptions: Array<{ value: Currency; label: string }> = [
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
];
const transportTypeOptions: Array<{ value: TransportType; label: string }> = [
  { value: "handysize", label: "Handysize" },
  { value: "coaster", label: "Coaster" },
  { value: "truck", label: "Truck" },
  { value: "rail", label: "Rail" },
  { value: "vessel", label: "Vessel" },
  { value: "mixed", label: "Mixed" },
];
const periodTypeOptions: Array<{ value: PeriodType; label: string }> = [
  { value: "spot", label: "Spot" },
  { value: "prompt", label: "Prompt" },
  { value: "range", label: "Range" },
  { value: "month", label: "Month" },
  { value: "window", label: "Window" },
];

const entryFormSchema = z
  .object({
    commodity: z.string().min(1, "Commodity is required"),
    gradeOrSpec: z.string().min(1, "Grade / spec is required"),
    volumeFrom: z.coerce.number().positive("Volume from must be greater than 0"),
    volumeTo: z.coerce.number().positive("Volume to must be greater than 0"),
    volumeUnit: z.enum(["mt"]),
    basis: z.enum(["FOB", "CIF", "CPT", "DAP", "FCA"]),
    destinationPort: z.string().min(1, "Destination port is required"),
    destinationCountry: z.string().min(1, "Destination country is required"),
    periodType: z.enum(["spot", "prompt", "range", "month", "window"]),
    periodLabel: z.string().min(1, "Period label is required"),
    periodStart: z.string().optional(),
    periodEnd: z.string().optional(),
    priceFrom: z.coerce.number().nonnegative("Price from must be 0 or greater"),
    priceTo: z.coerce.number().nonnegative("Price to must be 0 or greater"),
    currency: z.enum(["USD", "EUR"]),
    transportType: z.enum(["handysize", "coaster", "truck", "rail", "vessel", "mixed"]),
    note: z.string().max(500, "Note must be 500 characters or fewer").optional(),
  })
  .refine((values) => values.volumeTo >= values.volumeFrom, {
    path: ["volumeTo"],
    message: "Volume to must be greater than or equal to volume from",
  })
  .refine((values) => values.priceTo >= values.priceFrom, {
    path: ["priceTo"],
    message: "Price to must be greater than or equal to price from",
  });

type EntryFormValues = z.infer<typeof entryFormSchema>;
type TelegramSessionHook = ReturnType<typeof useSeaBrokerageTelegramSession>;

function getDefaultValues(entryType: EntryType): EntryFormValues {
  return {
    commodity: "corn",
    gradeOrSpec: "",
    volumeFrom: entryType === "bid" ? 25000 : 20000,
    volumeTo: entryType === "bid" ? 25000 : 22000,
    volumeUnit: "mt",
    basis: "FOB",
    destinationPort: "pivdenny",
    destinationCountry: "EG",
    periodType: "prompt",
    periodLabel: "prompt",
    periodStart: "",
    periodEnd: "",
    priceFrom: entryType === "bid" ? 225 : 223,
    priceTo: entryType === "bid" ? 225 : 225,
    currency: "USD",
    transportType: "vessel",
    note: "",
  };
}

interface EntryCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryType: EntryType;
  session: TelegramSessionHook;
}

export function EntryCreateDialog({
  open,
  onOpenChange,
  entryType,
  session,
}: EntryCreateDialogProps) {
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const form = useForm<EntryFormValues>({
    resolver: zodResolver(entryFormSchema),
    defaultValues: getDefaultValues(entryType),
  });

  const values = form.watch();
  const selectedCountry = form.watch("destinationCountry");
  const filteredPorts = useMemo(
    () => portOptions.filter((port) => port.countryCode === selectedCountry),
    [selectedCountry],
  );
  const currentPort = form.watch("destinationPort");

  useEffect(() => {
    form.reset(getDefaultValues(entryType));
    setSubmitMessage(null);
  }, [entryType, form, open]);

  useEffect(() => {
    if (filteredPorts.length > 0 && !filteredPorts.some((port) => port.code === currentPort)) {
      form.setValue("destinationPort", filteredPorts[0].code, { shouldDirty: true });
    }
  }, [currentPort, filteredPorts, form]);

  const canonicalPreview = useMemo(() => {
    if (!session.authorProfile) {
      return "Author session required before a canonical broker line can be generated.";
    }

    const commodity = commodityOptions.find((option) => option.code === values.commodity);
    const selectedPort = portOptions.find((option) => option.code === values.destinationPort);
    const selectedCountryOption = countryOptions.find(
      (option) => option.code === values.destinationCountry,
    );

    return buildCanonicalView({
      id: "preview",
      type: entryType,
      brokerId: session.authorProfile.id,
      brokerCode: session.authorProfile.brokerCode,
      brokerName: session.authorProfile.brokerName,
      companyName: session.authorProfile.companyName,
      commodity: values.commodity as BrokerageEntry["commodity"],
      commodityLabel: commodity?.label ?? values.commodity,
      gradeOrSpec: values.gradeOrSpec.trim(),
      volumeFrom: values.volumeFrom,
      volumeTo: values.volumeTo,
      volumeUnit: values.volumeUnit,
      basis: values.basis as Basis,
      destinationPort: selectedPort?.label ?? values.destinationPort,
      destinationCountry: selectedCountryOption?.label ?? values.destinationCountry,
      periodType: values.periodType as PeriodType,
      periodLabel: values.periodLabel.trim(),
      periodStart: values.periodStart || null,
      periodEnd: values.periodEnd || null,
      priceFrom: values.priceFrom,
      priceTo: values.priceTo,
      currency: values.currency as Currency,
      transportType: values.transportType as TransportType,
      note: values.note?.trim() ? values.note.trim() : null,
      createdAt: new Date().toISOString(),
      createdBy: session.authorProfile,
      telegramRelayStatus: undefined,
      telegramRelayMessage: null,
    });
  }, [entryType, session.authorProfile, values]);

  async function onSubmit(formValues: EntryFormValues) {
    if (!session.authorProfile) {
      setSubmitMessage("Author unavailable. Choose a Telegram session before creating entries.");
      return;
    }

    try {
      const commodity = commodityOptions.find((option) => option.code === formValues.commodity);
      const selectedPort = portOptions.find((option) => option.code === formValues.destinationPort);
      const selectedCountryOption = countryOptions.find(
        (option) => option.code === formValues.destinationCountry,
      );

      const entry = createBrokerageEntry({
        type: entryType,
        commodity: formValues.commodity as BrokerageEntry["commodity"],
        commodityLabel: commodity?.label ?? formValues.commodity,
        gradeOrSpec: formValues.gradeOrSpec.trim(),
        volumeFrom: formValues.volumeFrom,
        volumeTo: formValues.volumeTo,
        volumeUnit: formValues.volumeUnit,
        basis: formValues.basis,
        destinationPort: selectedPort?.label ?? formValues.destinationPort,
        destinationCountry: selectedCountryOption?.label ?? formValues.destinationCountry,
        periodType: formValues.periodType,
        periodLabel: formValues.periodLabel.trim(),
        periodStart: formValues.periodStart || null,
        periodEnd: formValues.periodEnd || null,
        priceFrom: formValues.priceFrom,
        priceTo: formValues.priceTo,
        currency: formValues.currency,
        transportType: formValues.transportType,
        note: formValues.note?.trim() ? formValues.note.trim() : null,
        createdBy: session.authorProfile,
      });

      try {
        await publishEntryToTelegram(entry);
        updateBrokerageEntryTelegramRelayStatus(entry.id, "queued");
      } catch {
        updateBrokerageEntryTelegramRelayStatus(entry.id, "failed");
      }

      form.reset(getDefaultValues(entryType));
      setSubmitMessage(null);
      onOpenChange(false);
    } catch (error) {
      setSubmitMessage(
        error instanceof Error ? error.message : "Failed to create the brokerage entry.",
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{entryType === "bid" ? "Create BID" : "Create OFFER"}</DialogTitle>
          <DialogDescription>
            Fast structured broker entry with canonical tape preview and Telegram-oriented author session.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm">
          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Author Session</div>
          {session.authorProfile ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{session.sessionState === "demo_telegram" ? "Demo Telegram" : "Mapped session"}</Badge>
              <span className="font-medium">{session.telegramHandle}</span>
              <span className="text-muted-foreground">
                {session.authorProfile.brokerCode} / {session.authorProfile.companyName}
              </span>
            </div>
          ) : (
            <div className="mt-2 space-y-3">
              <div className="text-muted-foreground">{session.statusMessage}</div>
              {session.isDemoSelectorEnabled ? (
                <div className="max-w-[280px]">
                  <Select
                    value={session.selectedDemoBrokerId ?? "none"}
                    onValueChange={(value) =>
                      session.setSelectedDemoBrokerId(value === "none" ? null : value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose demo Telegram author" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No demo Telegram identity</SelectItem>
                      {brokers.map((broker) => (
                        <SelectItem key={broker.id} value={broker.id}>
                          {broker.brokerCode} ({broker.brokerName})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {submitMessage ? (
          <div className="rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {submitMessage}
          </div>
        ) : null}

        <Form {...form}>
          <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <FormField
                control={form.control}
                name="commodity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Commodity</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Commodity" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {commodityOptions.map((option) => (
                          <SelectItem key={option.code} value={option.code}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="gradeOrSpec"
                render={({ field }) => (
                  <FormItem className="md:col-span-1 xl:col-span-3">
                    <FormLabel>Grade / Spec</FormLabel>
                    <FormControl>
                      <Input placeholder="11.5% protein / feed / crop 2025" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              <FormField
                control={form.control}
                name="volumeFrom"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Volume From</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="volumeTo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Volume To</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="volumeUnit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Unit" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {volumeUnitOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="basis"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Basis</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Basis" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {basisOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="priceFrom"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price From</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="priceTo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price To</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <FormField
                control={form.control}
                name="destinationCountry"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Country" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {countryOptions.map((option) => (
                          <SelectItem key={option.code} value={option.code}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="destinationPort"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Port</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Port" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {filteredPorts.map((option) => (
                          <SelectItem key={option.code} value={option.code}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Currency</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Currency" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {currencyOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="transportType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Transport</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Transport" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {transportTypeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <FormField
                control={form.control}
                name="periodType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Period Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Period type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {periodTypeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="periodLabel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Period Label</FormLabel>
                    <FormControl>
                      <Input placeholder="2H March / prompt / 04-12 April" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="periodStart"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Period Start</FormLabel>
                    <FormControl>
                      <Input type="date" value={field.value ?? ""} onChange={field.onChange} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="periodEnd"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Period End</FormLabel>
                    <FormControl>
                      <Input type="date" value={field.value ?? ""} onChange={field.onChange} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note</FormLabel>
                  <FormControl>
                    <Textarea
                      className="min-h-[88px]"
                      placeholder="Optional short broker note"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="text-sm font-medium">Canonical Preview</div>
                <Badge variant="outline">{entryType === "bid" ? "BID IDEA" : "OFFER IDEA"}</Badge>
              </div>
              <div className="text-sm leading-6 text-foreground">{canonicalPreview}</div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="text-sm text-muted-foreground">
                Structured quick-entry flow. Fields stay standardized, but the form is intentionally compact.
              </div>
              <Button type="submit" disabled={!session.canCreateEntries || form.formState.isSubmitting}>
                {form.formState.isSubmitting
                  ? "Saving..."
                  : entryType === "bid"
                    ? "Create BID"
                    : "Create OFFER"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
