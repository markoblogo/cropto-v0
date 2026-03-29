import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
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
import {
  basisOptions,
  brokers,
  commodityOptions,
  countryOptions,
  paymentTermOptions,
  portOptions,
} from "../mock/dictionaries";
import {
  getCountryDisplayLabel,
} from "../services/displayStandards";
import { buildSeaBrokerageMonitorAuthHeaders } from "../services/monitorAuth.service";
import {
  buildCanonicalView,
  normalizePeriodLabel,
} from "../services/entryFormatting.service";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type {
  Basis,
  BrokerageEntry,
  CompanyOption,
  Currency,
  EntryType,
  PeriodType,
  PortOption,
  SelectOption,
  TransportType,
  VolumeUnit,
} from "../types";
import type { useSeaBrokerageTelegramSession } from "../hooks/useSeaBrokerageTelegramSession";

const volumeUnitOptions: Array<{ value: VolumeUnit; label: string }> = [{ value: "mt", label: "MT" }];
const currencyOptions: Array<{ value: Currency; label: string }> = [
  { value: "USD", label: "USD ($)" },
  { value: "EUR", label: "EUR (€)" },
  { value: "UAH", label: "UAH (₴)" },
];
type PeriodPreset =
  | "spot"
  | "prompt"
  | "current_month_1h"
  | "current_month_2h"
  | "full_month"
  | "explicit_range";

const periodPresetOptions: SelectOption<PeriodPreset>[] = [
  { value: "spot", label: "SPOT" },
  { value: "prompt", label: "PROMPT" },
  { value: "current_month_1h", label: "1H Month" },
  { value: "current_month_2h", label: "2H Month" },
  { value: "full_month", label: "Full month" },
  { value: "explicit_range", label: "Exact window" },
];
const transportTypeOptions: Array<{ value: TransportType; label: string }> = [
  { value: "handysize", label: "Handysize" },
  { value: "coaster", label: "Coaster" },
  { value: "truck", label: "Truck" },
  { value: "rail", label: "Rail" },
  { value: "truck/rail", label: "Truck/Rail" },
  { value: "vessel", label: "Vessel" },
];

const entryFormSchema = z
  .object({
    sellerName: z.string().max(200, "Seller name must be 200 characters or fewer").optional(),
    buyerName: z.string().max(200, "Buyer name must be 200 characters or fewer").optional(),
    periodPreset: z.enum([
      "spot",
      "prompt",
      "current_month_1h",
      "current_month_2h",
      "full_month",
      "explicit_range",
    ]),
    commodity: z.string().min(1, "Commodity is required"),
    harvestYear: z.string().trim().optional().default(""),
    originCountry: z.string().min(1, "Origin is required"),
    quantityMt: z.coerce.number().min(0, "Quantity must be 0 or greater"),
    tolerancePct: z.coerce
      .number()
      .min(0, "Tolerance must be 0 or greater")
      .max(25, "Tolerance must be 25% or lower"),
    basis: z.enum(["FOB", "CIF", "CPT", "DAP", "FCA"]),
    destinationPortCode: z.string().min(1, "Port / place is required"),
    periodMonth: z.string().optional().default(""),
    periodStart: z.string().optional().default(""),
    periodEnd: z.string().optional().default(""),
    currency: z.enum(["USD", "EUR", "UAH"]),
    price: z.coerce.number().nonnegative("Price must be 0 or greater"),
    paymentTerms: z.string().min(1, "Payment terms are required"),
    transportType: z.enum(["handysize", "coaster", "truck", "rail", "truck/rail", "vessel"]),
    note: z.string().max(500, "Note must be 500 characters or fewer").optional(),
  })
  .superRefine((values, ctx) => {
    if (
      (values.periodPreset === "full_month" ||
        values.periodPreset === "current_month_1h" ||
        values.periodPreset === "current_month_2h") &&
      !values.periodMonth
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["periodMonth"],
        message: "Month / year is required",
      });
      return;
    }

    if (values.periodPreset === "explicit_range") {
      if (!values.periodStart) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["periodStart"],
          message: "Shipment / delivery period from is required",
        });
      }

      if (!values.periodEnd) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["periodEnd"],
          message: "Shipment / delivery period to is required",
        });
      }

      if (values.periodStart && values.periodEnd && values.periodEnd < values.periodStart) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["periodEnd"],
          message: "Shipment / delivery to must be on or after from",
        });
      }
    }

    const harvestYear = String(values.harvestYear || "").trim();
    if (!harvestYear) {
      return;
    }
    if (!/^\d{4}$/.test(harvestYear)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["harvestYear"],
        message: "Harvest year must be YYYY",
      });
      return;
    }
    const year = Number(harvestYear);
    const nowYear = new Date().getFullYear();
    if (year < nowYear - 3 || year > nowYear + 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["harvestYear"],
        message: "Harvest year is out of expected range",
      });
    }
  });

type EntryFormValues = z.infer<typeof entryFormSchema>;
type TelegramSessionHook = ReturnType<typeof useSeaBrokerageTelegramSession>;

function normalizeLocationCityInput(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ");
}

function formatPortPlaceLabel(option: PortOption) {
  return `${option.displayLabel}, ${getCountryDisplayLabel(option.countryCode)}`;
}

function getDefaultValues(entryType: EntryType): EntryFormValues {
  const now = new Date();
  const periodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  return {
    sellerName: "",
    buyerName: "",
    periodPreset: "explicit_range",
    commodity: "corn",
    harvestYear: "",
    originCountry: "UA",
    quantityMt: entryType === "bid" ? 25000 : entryType === "trade" ? 22000 : 20000,
    tolerancePct: 5,
    basis: "FOB",
    destinationPortCode: "odesa",
    periodMonth,
    periodStart: "2026-03-24",
    periodEnd: "2026-03-31",
    currency: "USD",
    price: entryType === "bid" ? 225 : entryType === "trade" ? 224 : 223,
    paymentTerms: entryType === "bid" ? "CAD" : "CAFD",
    transportType: "vessel",
    note: "",
  };
}

function deriveVolumeRange(quantityMt: number, tolerancePct: number) {
  if (tolerancePct <= 0) {
    return { volumeFrom: quantityMt, volumeTo: quantityMt };
  }

  const spread = quantityMt * (tolerancePct / 100);
  return {
    volumeFrom: Math.round(quantityMt - spread),
    volumeTo: Math.round(quantityMt + spread),
  };
}

function buildPeriodLabel(periodStart: string, periodEnd: string) {
  return normalizePeriodLabel({
    periodType: "range",
    periodStart,
    periodEnd,
  });
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getFullMonthRange(periodMonth: string) {
  const [yearString, monthString] = periodMonth.split("-");
  const year = Number(yearString);
  const month = Number(monthString);

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);

  return {
    start: formatDateInput(monthStart),
    end: formatDateInput(monthEnd),
    label: `${monthStart.toLocaleString("en-US", { month: "short" }).toUpperCase()} ${year}`,
  };
}

function getMonthBoundaryDatesFromPeriodMonth(periodMonth: string) {
  const range = getFullMonthRange(periodMonth);
  if (!range) {
    return null;
  }

  const start = new Date(range.start);
  const end = new Date(range.end);

  const firstHalfStart = formatDateInput(start);
  const firstHalfEnd = formatDateInput(new Date(start.getFullYear(), start.getMonth(), 15));
  const secondHalfStart = formatDateInput(new Date(start.getFullYear(), start.getMonth(), 16));
  const secondHalfEnd = formatDateInput(end);

  return {
    firstHalfStart,
    firstHalfEnd,
    secondHalfStart,
    secondHalfEnd,
  };
}

function resolvePeriodValues(
  preset: PeriodPreset,
  periodMonth: string,
  periodStart: string,
  periodEnd: string,
): {
  periodType: PeriodType;
  periodLabel: string;
  periodStart: string | null;
  periodEnd: string | null;
} {
  if (preset === "spot") {
    return {
      periodType: "spot",
      periodLabel: "SPOT",
      periodStart: null,
      periodEnd: null,
    };
  }

  if (preset === "prompt") {
    return {
      periodType: "prompt",
      periodLabel: "PROMPT",
      periodStart: null,
      periodEnd: null,
    };
  }

  if (preset === "current_month_1h" || preset === "current_month_2h") {
    const boundaries = getMonthBoundaryDatesFromPeriodMonth(periodMonth);
    if (!boundaries) {
      return {
        periodType: "window",
        periodLabel: "OPEN",
        periodStart: null,
        periodEnd: null,
      };
    }

    const rangeStart =
      preset === "current_month_1h" ? boundaries.firstHalfStart : boundaries.secondHalfStart;
    const rangeEnd =
      preset === "current_month_1h" ? boundaries.firstHalfEnd : boundaries.secondHalfEnd;

    return {
      periodType: "window",
      periodLabel: normalizePeriodLabel({
        periodType: "window",
        periodStart: rangeStart,
        periodEnd: rangeEnd,
      }),
      periodStart: rangeStart,
      periodEnd: rangeEnd,
    };
  }

  if (preset === "full_month") {
    const range = getFullMonthRange(periodMonth);
    if (!range) {
      return {
        periodType: "window",
        periodLabel: "OPEN",
        periodStart: null,
        periodEnd: null,
      };
    }

    return {
      periodType: "window",
      periodLabel: range.label,
      periodStart: range.start,
      periodEnd: range.end,
    };
  }

  return {
    periodType: "range",
    periodLabel: buildPeriodLabel(periodStart, periodEnd),
    periodStart,
    periodEnd,
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
  const [isAddingCompany, setIsAddingCompany] = useState(false);
  const [companyEditorTarget, setCompanyEditorTarget] = useState<"sellerName" | "buyerName">(
    entryType === "offer" ? "sellerName" : "buyerName",
  );
  const [newCompanyName, setNewCompanyName] = useState("");
  const [companyEditorMessage, setCompanyEditorMessage] = useState<string | null>(null);
  const [isSavingCompany, setIsSavingCompany] = useState(false);
  const [sellerCompanySearch, setSellerCompanySearch] = useState("");
  const [buyerCompanySearch, setBuyerCompanySearch] = useState("");
  const [isAddingLocation, setIsAddingLocation] = useState(false);
  const [portSearch, setPortSearch] = useState("");
  const [newLocationCity, setNewLocationCity] = useState("");
  const [newLocationCountryCode, setNewLocationCountryCode] = useState("UA");
  const [locationEditorMessage, setLocationEditorMessage] = useState<string | null>(null);
  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const form = useForm<EntryFormValues>({
    resolver: zodResolver(entryFormSchema),
    defaultValues: getDefaultValues(entryType),
  });

  const values = form.watch();
  const { data: companyOptionsData = [] } = useQuery<CompanyOption[]>({
    queryKey: ["/api/sea-brokerage-monitor/companies"],
    queryFn: async () => {
      const response = await fetch("/api/sea-brokerage-monitor/companies");
      if (!response.ok) {
        throw new Error(`Failed to load companies (${response.status})`);
      }
      const payload = (await response.json()) as { companies?: CompanyOption[] };
      return Array.isArray(payload.companies) ? payload.companies : [];
    },
    staleTime: 60_000,
  });
  const { data: sharedPortOptionsData = [] } = useQuery<PortOption[]>({
    queryKey: ["/api/sea-brokerage-monitor/locations"],
    queryFn: async () => {
      const response = await fetch("/api/sea-brokerage-monitor/locations");
      if (!response.ok) {
        throw new Error(`Failed to load custom locations (${response.status})`);
      }
      const payload = (await response.json()) as { locations?: PortOption[] };
      return Array.isArray(payload.locations) ? payload.locations : [];
    },
    staleTime: 60_000,
  });

  const allPortOptions = useMemo(() => {
    const byCode = new Map<string, PortOption>();
    for (const option of [...portOptions, ...sharedPortOptionsData]) {
      byCode.set(option.code, option);
    }
    return Array.from(byCode.values());
  }, [sharedPortOptionsData]);
  const companyOptions = useMemo(() => {
    const byLabel = new Map<string, CompanyOption>();
    for (const option of companyOptionsData) {
      const key = option.displayLabel.trim().toLowerCase();
      if (!key) continue;
      byLabel.set(key, option);
    }
    return Array.from(byLabel.values()).sort((left, right) =>
      left.displayLabel.localeCompare(right.displayLabel),
    );
  }, [companyOptionsData]);
  const sellerCompanyOptions = useMemo(() => {
    const query = sellerCompanySearch.trim().toLowerCase();
    if (!query) return companyOptions;
    return companyOptions.filter((option) =>
      option.displayLabel.toLowerCase().includes(query),
    );
  }, [companyOptions, sellerCompanySearch]);
  const buyerCompanyOptions = useMemo(() => {
    const query = buyerCompanySearch.trim().toLowerCase();
    if (!query) return companyOptions;
    return companyOptions.filter((option) =>
      option.displayLabel.toLowerCase().includes(query),
    );
  }, [companyOptions, buyerCompanySearch]);
  const filteredPortOptions = useMemo(() => {
    const query = portSearch.trim().toLowerCase();
    if (!query) return allPortOptions;
    return allPortOptions.filter((option) =>
      formatPortPlaceLabel(option).toLowerCase().includes(query),
    );
  }, [allPortOptions, portSearch]);

  useEffect(() => {
    form.reset(getDefaultValues(entryType));
    setSubmitMessage(null);
    setIsAddingCompany(false);
    setCompanyEditorTarget(entryType === "offer" ? "sellerName" : "buyerName");
    setNewCompanyName("");
    setSellerCompanySearch("");
    setBuyerCompanySearch("");
    setCompanyEditorMessage(null);
    setIsSavingCompany(false);
    setIsAddingLocation(false);
    setPortSearch("");
    setLocationEditorMessage(null);
    setIsSavingLocation(false);
  }, [entryType, form, open]);

  const canonicalPreview = useMemo(() => {
    if (!session.authorProfile) {
      return "Author session required before a canonical broker line can be generated.";
    }

    const commodity = commodityOptions.find((option) => option.code === values.commodity);
    const selectedPort = allPortOptions.find((option) => option.code === values.destinationPortCode);
    const originCountry = getCountryDisplayLabel(values.originCountry);
    const destinationCountry = getCountryDisplayLabel(selectedPort?.countryCode);
    const { volumeFrom, volumeTo } = deriveVolumeRange(values.quantityMt, values.tolerancePct);
    const harvestYear = String(values.harvestYear || "").trim();
    const gradeOrSpec = harvestYear ? `HARVEST ${harvestYear}` : "";
    const resolvedPeriod = resolvePeriodValues(
      values.periodPreset,
      values.periodMonth,
      values.periodStart,
      values.periodEnd,
    );

    return buildCanonicalView({
      id: "preview",
      type: entryType,
      brokerId: session.authorProfile.id,
      brokerCode: session.authorProfile.brokerCode,
      brokerName: session.authorProfile.brokerName,
      companyName: session.authorProfile.companyName,
      sellerName:
        entryType !== "bid" && values.sellerName?.trim() ? values.sellerName.trim() : null,
      buyerName: entryType !== "offer" && values.buyerName?.trim() ? values.buyerName.trim() : null,
      originCountry,
      originCountryCode: values.originCountry,
      commodity: values.commodity as BrokerageEntry["commodity"],
      commodityLabel: commodity?.displayLabel ?? values.commodity,
      gradeOrSpec,
      quantityMt: values.quantityMt,
      tolerancePct: values.tolerancePct,
      volumeFrom,
      volumeTo,
      volumeUnit: volumeUnitOptions[0].value,
      basis: values.basis as Basis,
      paymentTerms: values.paymentTerms,
      destinationPortCode: values.destinationPortCode,
      destinationPort: selectedPort?.displayLabel ?? values.destinationPortCode,
      destinationCountryCode: selectedPort?.countryCode ?? null,
      destinationCountry,
      periodType: resolvedPeriod.periodType,
      periodLabel: resolvedPeriod.periodLabel,
      periodStart: resolvedPeriod.periodStart,
      periodEnd: resolvedPeriod.periodEnd,
      price: values.price,
      priceFrom: values.price,
      priceTo: values.price,
      currency: values.currency as Currency,
      transportType: values.transportType as TransportType,
      note: values.note?.trim() ? values.note.trim() : null,
      createdAt: new Date().toISOString(),
      createdBy: session.authorProfile,
      telegramRelayStatus: undefined,
      telegramRelayMessage: null,
    });
  }, [allPortOptions, entryType, session.authorProfile, values]);

  async function onSubmit(formValues: EntryFormValues) {
    if (!session.authorProfile || !session.canCreateEntries) {
      setSubmitMessage(
        "Author unavailable. Ask admin to add your account into Sea Brokerage broker allowlist.",
      );
      return;
    }

    if (entryType === "trade") {
      if (!formValues.sellerName?.trim()) {
        setSubmitMessage("Seller is required for TRADE.");
        return;
      }
      if (!formValues.buyerName?.trim()) {
        setSubmitMessage("Buyer is required for TRADE.");
        return;
      }
    }

    try {
      const commodity = commodityOptions.find((option) => option.code === formValues.commodity);
      const selectedPort = allPortOptions.find((option) => option.code === formValues.destinationPortCode);
      const { volumeFrom, volumeTo } = deriveVolumeRange(
        formValues.quantityMt,
        formValues.tolerancePct,
      );
      const harvestYear = String(formValues.harvestYear || "").trim();
      const gradeOrSpec = harvestYear ? `HARVEST ${harvestYear}` : "";
      const resolvedPeriod = resolvePeriodValues(
        formValues.periodPreset,
        formValues.periodMonth,
        formValues.periodStart,
        formValues.periodEnd,
      );

      const payload = {
        type: entryType,
        sellerName:
          entryType !== "bid" && formValues.sellerName?.trim()
            ? formValues.sellerName.trim()
            : null,
        buyerName:
          entryType !== "offer" && formValues.buyerName?.trim()
            ? formValues.buyerName.trim()
            : null,
        originCountry: getCountryDisplayLabel(formValues.originCountry),
        originCountryCode: formValues.originCountry,
        commodity: formValues.commodity as BrokerageEntry["commodity"],
        commodityLabel: commodity?.displayLabel ?? formValues.commodity,
        gradeOrSpec,
        quantityMt: formValues.quantityMt,
        tolerancePct: formValues.tolerancePct,
        volumeFrom,
        volumeTo,
        volumeUnit: volumeUnitOptions[0].value,
        basis: formValues.basis,
        paymentTerms: formValues.paymentTerms,
        destinationPortCode: formValues.destinationPortCode,
        destinationPort: selectedPort?.displayLabel ?? formValues.destinationPortCode,
        destinationCountryCode: selectedPort?.countryCode ?? null,
        destinationCountry: getCountryDisplayLabel(selectedPort?.countryCode),
        periodType: resolvedPeriod.periodType,
        periodLabel: resolvedPeriod.periodLabel,
        periodStart: resolvedPeriod.periodStart,
        periodEnd: resolvedPeriod.periodEnd,
        price: formValues.price,
        priceFrom: formValues.price,
        priceTo: formValues.price,
        currency: formValues.currency,
        transportType: formValues.transportType,
        note: formValues.note?.trim() ? formValues.note.trim() : null,
        brokerCode: session.authorProfile.brokerCode,
        brokerName: session.authorProfile.brokerName,
        companyName: session.authorProfile.companyName,
        canonicalView: canonicalPreview,
      };

      await apiRequest("POST", "/api/sea-brokerage-monitor/entries", payload, {
        headers: buildSeaBrokerageMonitorAuthHeaders(session.monitorAuthToken),
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/sea-brokerage-monitor/entries"] });

      form.reset(getDefaultValues(entryType));
      setSubmitMessage(null);
      onOpenChange(false);
    } catch (error) {
      setSubmitMessage(
        error instanceof Error ? error.message : "Failed to create the brokerage entry.",
      );
    }
  }

  async function addCustomLocation() {
    const city = normalizeLocationCityInput(newLocationCity);
    const countryCode = newLocationCountryCode;
    const country = countryOptions.find((option) => option.code === countryCode);

    if (!country) {
      setLocationEditorMessage("Select country from the list.");
      return;
    }

    if (!/^[A-Za-z][A-Za-z\\s'\\-]{1,59}$/.test(city)) {
      setLocationEditorMessage("Use English city name (letters, spaces, hyphen).");
      return;
    }

    const existing = allPortOptions.find(
      (option) =>
        option.countryCode === countryCode &&
        option.displayLabel.trim().toLowerCase() === city.toLowerCase(),
    );
    if (existing) {
      form.setValue("destinationPortCode", existing.code, { shouldValidate: true });
      setIsAddingLocation(false);
      setLocationEditorMessage("Location already exists and has been selected.");
      return;
    }

    try {
      setIsSavingLocation(true);
      const response = await fetch("/api/sea-brokerage-monitor/locations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildSeaBrokerageMonitorAuthHeaders(session.monitorAuthToken),
        },
        body: JSON.stringify({
          displayLabel: city,
          countryCode,
          countryCodeAlpha3: country.countryCodeAlpha3,
        }),
      });

      if (!response.ok) {
        const text = (await response.text()) || "Failed to add location";
        throw new Error(text);
      }

      const payload = (await response.json()) as { location?: PortOption; duplicate?: boolean };
      const location = payload.location;
      if (!location) {
        throw new Error("Invalid location payload.");
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/sea-brokerage-monitor/locations"] });
      form.setValue("destinationPortCode", location.code, { shouldValidate: true });
      setNewLocationCity("");
      setNewLocationCountryCode("UA");
      setIsAddingLocation(false);
      setLocationEditorMessage(payload.duplicate ? "Location already existed and was selected." : "Location added.");
    } catch (error) {
      setLocationEditorMessage(error instanceof Error ? error.message : "Failed to add location.");
    } finally {
      setIsSavingLocation(false);
    }
  }

  async function addCustomCompany() {
    const label = newCompanyName.trim().replace(/\s+/g, " ");
    if (!label) {
      setCompanyEditorMessage("Company name is required.");
      return;
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9\s'"&().,\/-]{1,119}$/.test(label)) {
      setCompanyEditorMessage("Use English company name (letters, numbers, basic punctuation).");
      return;
    }

    const existing = companyOptions.find(
      (option) => option.displayLabel.trim().toLowerCase() === label.toLowerCase(),
    );
    if (existing) {
      const fieldName =
        entryType === "offer"
          ? "sellerName"
          : entryType === "bid"
            ? "buyerName"
            : companyEditorTarget;
      form.setValue(fieldName, existing.displayLabel, { shouldValidate: true });
      setIsAddingCompany(false);
      setCompanyEditorMessage("Company already exists and has been selected.");
      return;
    }

    try {
      setIsSavingCompany(true);
      const response = await fetch("/api/sea-brokerage-monitor/companies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildSeaBrokerageMonitorAuthHeaders(session.monitorAuthToken),
        },
        body: JSON.stringify({ displayLabel: label }),
      });

      if (!response.ok) {
        const text = (await response.text()) || "Failed to add company";
        throw new Error(text);
      }

      const payload = (await response.json()) as { company?: CompanyOption; duplicate?: boolean };
      const company = payload.company;
      if (!company) {
        throw new Error("Invalid company payload.");
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/sea-brokerage-monitor/companies"] });
      const fieldName =
        entryType === "offer"
          ? "sellerName"
          : entryType === "bid"
            ? "buyerName"
            : companyEditorTarget;
      form.setValue(fieldName, company.displayLabel, { shouldValidate: true });
      setNewCompanyName("");
      setIsAddingCompany(false);
      setCompanyEditorMessage(payload.duplicate ? "Company already existed and was selected." : "Company added.");
    } catch (error) {
      setCompanyEditorMessage(error instanceof Error ? error.message : "Failed to add company.");
    } finally {
      setIsSavingCompany(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-0.75rem)] max-w-[calc(100vw-0.75rem)] overflow-y-auto px-4 sm:max-w-2xl sm:px-6">
        <DialogHeader>
          <DialogTitle>
            {entryType === "bid" ? "Create BID" : entryType === "offer" ? "Create OFFER" : "Create TRADE"}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Compact broker entry workflow.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5 text-sm">
          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Author Session</div>
          {session.authorProfile ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {session.sessionState === "demo_telegram" ? "Demo Telegram" : "Telegram session"}
              </Badge>
              <span className="font-medium">{session.telegramHandle}</span>
              <span className="text-muted-foreground">{session.authorProfile.brokerCode}</span>
            </div>
          ) : (
            <div className="mt-1.5 space-y-2.5">
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
          <div className="rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            {submitMessage}
          </div>
        ) : null}

        <Form {...form}>
          <form className="space-y-3" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid gap-2.5 md:grid-cols-2">
              {entryType !== "bid" ? (
                <FormField
                  control={form.control}
                  name="sellerName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Seller / Seller name</FormLabel>
                      <Select
                        value={field.value?.trim() ? field.value : "__none__"}
                        onValueChange={(value) => field.onChange(value === "__none__" ? "" : value)}
                        onOpenChange={(open) => {
                          if (!open) setSellerCompanySearch("");
                        }}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select seller company" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <div className="px-2 pb-2">
                            <Input
                              placeholder="Type company..."
                              value={sellerCompanySearch}
                              onChange={(event) => setSellerCompanySearch(event.target.value)}
                              className="h-8 text-xs"
                              onKeyDown={(event) => event.stopPropagation()}
                            />
                          </div>
                          <SelectItem value="__none__">Not specified</SelectItem>
                          {sellerCompanyOptions.map((option) => (
                            <SelectItem key={option.id} value={option.displayLabel}>
                              {option.displayLabel}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="mt-2 flex items-center gap-2">
                        <Button
                          type="button"
                          variant={isAddingCompany && companyEditorTarget === "sellerName" ? "outline" : "secondary"}
                          className={
                            isAddingCompany && companyEditorTarget === "sellerName"
                              ? undefined
                              : "border-primary/60 bg-primary/20 text-primary hover:bg-primary/30"
                          }
                          size="sm"
                          onClick={() => {
                            setCompanyEditorTarget("sellerName");
                            setIsAddingCompany((prev) =>
                              companyEditorTarget === "sellerName" ? !prev : true,
                            );
                            setCompanyEditorMessage(null);
                          }}
                        >
                          {isAddingCompany && companyEditorTarget === "sellerName" ? "Cancel" : "Add company"}
                        </Button>
                      </div>
                      {isAddingCompany && companyEditorTarget === "sellerName" ? (
                        <div className="mt-2 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                          <Input
                            placeholder="Company name in English"
                            value={newCompanyName}
                            onChange={(event) => setNewCompanyName(event.target.value)}
                          />
                          <Button type="button" size="sm" onClick={addCustomCompany}>
                            {isSavingCompany ? "Saving..." : "Save company"}
                          </Button>
                        </div>
                      ) : null}
                      {companyEditorMessage && companyEditorTarget === "sellerName" ? (
                        <div className="mt-1 text-[11px] text-muted-foreground">{companyEditorMessage}</div>
                      ) : null}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}
              {entryType !== "offer" ? (
                <FormField
                  control={form.control}
                  name="buyerName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Buyer / Buyer name</FormLabel>
                      <Select
                        value={field.value?.trim() ? field.value : "__none__"}
                        onValueChange={(value) => field.onChange(value === "__none__" ? "" : value)}
                        onOpenChange={(open) => {
                          if (!open) setBuyerCompanySearch("");
                        }}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select buyer company" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <div className="px-2 pb-2">
                            <Input
                              placeholder="Type company..."
                              value={buyerCompanySearch}
                              onChange={(event) => setBuyerCompanySearch(event.target.value)}
                              className="h-8 text-xs"
                              onKeyDown={(event) => event.stopPropagation()}
                            />
                          </div>
                          <SelectItem value="__none__">Not specified</SelectItem>
                          {buyerCompanyOptions.map((option) => (
                            <SelectItem key={option.id} value={option.displayLabel}>
                              {option.displayLabel}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="mt-2 flex items-center gap-2">
                        <Button
                          type="button"
                          variant={isAddingCompany && companyEditorTarget === "buyerName" ? "outline" : "secondary"}
                          className={
                            isAddingCompany && companyEditorTarget === "buyerName"
                              ? undefined
                              : "border-primary/60 bg-primary/20 text-primary hover:bg-primary/30"
                          }
                          size="sm"
                          onClick={() => {
                            setCompanyEditorTarget("buyerName");
                            setIsAddingCompany((prev) =>
                              companyEditorTarget === "buyerName" ? !prev : true,
                            );
                            setCompanyEditorMessage(null);
                          }}
                        >
                          {isAddingCompany && companyEditorTarget === "buyerName" ? "Cancel" : "Add company"}
                        </Button>
                      </div>
                      {isAddingCompany && companyEditorTarget === "buyerName" ? (
                        <div className="mt-2 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                          <Input
                            placeholder="Company name in English"
                            value={newCompanyName}
                            onChange={(event) => setNewCompanyName(event.target.value)}
                          />
                          <Button type="button" size="sm" onClick={addCustomCompany}>
                            {isSavingCompany ? "Saving..." : "Save company"}
                          </Button>
                        </div>
                      ) : null}
                      {companyEditorMessage && companyEditorTarget === "buyerName" ? (
                        <div className="mt-1 text-[11px] text-muted-foreground">{companyEditorMessage}</div>
                      ) : null}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}
              <FormField
                control={form.control}
                name="commodity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Commodity</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      onOpenChange={(open) => {
                        if (!open) setPortSearch("");
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Commodity" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {commodityOptions.map((option) => (
                          <SelectItem key={option.code} value={option.code}>
                            {option.displayLabel}
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
                name="originCountry"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Origin</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Origin" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {countryOptions.map((option) => (
                          <SelectItem key={option.code} value={option.code}>
                            {option.displayLabel}
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
                name="harvestYear"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Harvest year</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="2020"
                        max="2035"
                        step="1"
                        placeholder="e.g. 2026"
                        value={field.value ?? ""}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="quantityMt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity, MT</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tolerancePct"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tolerance, +/- %</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="0.1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-2.5 md:grid-cols-2">
              <FormField
                control={form.control}
                name="basis"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Delivery basis</FormLabel>
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
                name="destinationPortCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Port / place</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Port / place" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <div className="px-2 pb-2">
                          <Input
                            placeholder="Type port/city/country..."
                            value={portSearch}
                            onChange={(event) => setPortSearch(event.target.value)}
                            className="h-8 text-xs"
                            onKeyDown={(event) => event.stopPropagation()}
                          />
                        </div>
                        {filteredPortOptions.map((option) => (
                          <SelectItem key={option.code} value={option.code}>
                            {formatPortPlaceLabel(option)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setIsAddingLocation((prev) => !prev);
                          setLocationEditorMessage(null);
                        }}
                      >
                        {isAddingLocation ? "Cancel" : "Add location"}
                      </Button>
                    </div>
                    {isAddingLocation ? (
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        <Input
                          placeholder="City in English (e.g. Chop)"
                          value={newLocationCity}
                          onChange={(event) => setNewLocationCity(event.target.value)}
                        />
                        <Select value={newLocationCountryCode} onValueChange={setNewLocationCountryCode}>
                          <SelectTrigger>
                            <SelectValue placeholder="Country" />
                          </SelectTrigger>
                          <SelectContent>
                            {countryOptions.map((option) => (
                              <SelectItem key={option.code} value={option.code}>
                                {option.displayLabel}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="md:col-span-2">
                          <Button type="button" size="sm" onClick={addCustomLocation}>
                            {isSavingLocation ? "Saving..." : "Save location"}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                    {locationEditorMessage ? (
                      <div className="mt-1 text-[11px] text-muted-foreground">{locationEditorMessage}</div>
                    ) : null}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-2.5 md:grid-cols-2">
              <FormField
                control={form.control}
                name="periodPreset"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Period</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Period preset" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {periodPresetOptions.map((option) => (
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
              {values.periodPreset === "explicit_range" ? (
                <div className="hidden md:block" />
              ) : (
                <div className="flex items-end text-[11px] text-muted-foreground">
                  {resolvePeriodValues(
                    values.periodPreset,
                    values.periodMonth,
                    values.periodStart,
                    values.periodEnd,
                  ).periodLabel}
                </div>
              )}
            </div>

            {values.periodPreset === "full_month" ||
            values.periodPreset === "current_month_1h" ||
            values.periodPreset === "current_month_2h" ? (
              <div className="grid gap-2.5 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="periodMonth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Month / year</FormLabel>
                      <FormControl>
                        <Input type="month" value={field.value ?? ""} onChange={field.onChange} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ) : null}

            {values.periodPreset === "explicit_range" ? (
              <div className="grid gap-2.5 md:grid-cols-2">
              <FormField
                control={form.control}
                name="periodStart"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Shipment / delivery from</FormLabel>
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
                    <FormLabel>Shipment / delivery to</FormLabel>
                    <FormControl>
                      <Input type="date" value={field.value ?? ""} onChange={field.onChange} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              </div>
            ) : null}

            <div className="grid gap-2.5 md:grid-cols-4">
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
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="paymentTerms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment terms</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Payment terms" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {paymentTermOptions.map((option) => (
                          <SelectItem key={option.code} value={option.code}>
                            {option.displayLabel}
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

            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Other terms</FormLabel>
                  <FormControl>
                    <Textarea
                      className="min-h-[64px] resize-y"
                      placeholder="Optional terms or execution notes"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2">
              <div className="mb-1 flex items-center justify-between gap-3">
                <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Tape preview</div>
                <Badge variant="outline">
                  {entryType === "bid" ? "BID IDEA" : entryType === "offer" ? "OFFER IDEA" : "TRADE IDEA"}
                </Badge>
              </div>
              <div className="text-sm leading-5 text-foreground">{canonicalPreview}</div>
            </div>

            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-[11px] leading-4 text-muted-foreground">
                Single-price compact workflow.
              </div>
              <Button
                type="submit"
                className="w-full sm:w-auto"
                disabled={!session.canCreateEntries || form.formState.isSubmitting}
              >
                {form.formState.isSubmitting
                  ? "Saving..."
                  : entryType === "bid"
                    ? "Create BID"
                    : entryType === "offer"
                      ? "Create OFFER"
                      : "Create TRADE"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
