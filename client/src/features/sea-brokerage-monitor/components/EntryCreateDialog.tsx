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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  currencyOptions,
  paymentTermOptions,
  portOptions,
} from "../mock/dictionaries";
import { isoCountryOptionsEn } from "../mock/isoCountryOptions.en";
import {
  getCountryDisplayLabel,
} from "../services/displayStandards";
import {
  SEA_BROKERAGE_TRANSPORT_DICTIONARY,
  getSeaBrokerageTransportDisplayLabel,
  normalizeSeaBrokerageTransportCode,
} from "@shared/seaBrokerageTransport";
import { buildSeaBrokerageMonitorAuthHeaders } from "../services/monitorAuth.service";
import {
  buildCanonicalView,
  normalizePeriodLabel,
} from "../services/entryFormatting.service";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type {
  Basis,
  BrokerDirectoryItem,
  BrokerageEntry,
  Commodity,
  CompanyOption,
  CountryOption,
  Currency,
  EntryType,
  PeriodType,
  PortOption,
  SelectOption,
  SeaBrokerageEntryStatus,
  TransportOption,
  TransportType,
  VolumeUnit,
} from "../types";
import type { useSeaBrokerageTelegramSession } from "../hooks/useSeaBrokerageTelegramSession";

const volumeUnitOptions: Array<{ value: VolumeUnit; label: string }> = [{ value: "mt", label: "MT" }];
const allowedCurrencyCodes = new Set(currencyOptions.map((option) => option.value.toUpperCase()));
const allowedBasisCodes = new Set(basisOptions.map((option) => option.value.toUpperCase()));
type PeriodPreset =
  | "spot"
  | "prompt"
  | "current_month_1h"
  | "current_month_2h"
  | "full_month"
  | "explicit_range";

type QuantityPreset = "single" | "range";
type TradeMyRole = "seller" | "buyer";
type VatMode = "none" | "incl_vat" | "plus_vat";

const periodPresetOptions: SelectOption<PeriodPreset>[] = [
  { value: "spot", label: "SPOT" },
  { value: "prompt", label: "PROMPT" },
  { value: "current_month_1h", label: "1H Month" },
  { value: "current_month_2h", label: "2H Month" },
  { value: "full_month", label: "Full month" },
  { value: "explicit_range", label: "Exact window" },
];
const entryStatusOptions: Array<{ value: SeaBrokerageEntryStatus; label: string }> = [
  { value: "active", label: "Active" },
  { value: "needs_update", label: "Needs Update" },
];
const tolerancePctOptions = [0, 1, 3, 4, 5, 6, 7, 8, 9, 10] as const;
const allowedTolerancePct = new Set<number>(tolerancePctOptions);

const harvestCurrentYear = new Date().getFullYear();
const harvestYearValues = [
  String(harvestCurrentYear - 1),
  String(harvestCurrentYear),
  String(harvestCurrentYear + 1),
] as const;
const harvestYearOptions: Array<{ value: (typeof harvestYearValues)[number]; label: string }> =
  harvestYearValues.map((year) => ({ value: year, label: year }));
const defaultHarvestYear = harvestYearValues[0];

function isNewCropByHarvestYear(value: string | null | undefined) {
  const normalizedYear = Number(String(value || "").trim());
  if (!Number.isFinite(normalizedYear)) return false;
  return normalizedYear >= harvestCurrentYear;
}

function normalizeTransportTypeForForm(value: string | null | undefined): TransportType {
  return normalizeSeaBrokerageTransportCode(value, "vessel");
}

function normalizeCompanyLookupKey(value: string) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFKC")
    .replace(/[“”„‟«»]/g, '"')
    .replace(/[‘’‚‛`´]/g, "'")
    .toLowerCase();
}

function parseCurrencyWithVat(rawCurrency: string | null | undefined): { currency: string; vatMode: VatMode } {
  const normalized = String(rawCurrency || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
  if (!normalized) {
    return { currency: "", vatMode: "none" };
  }
  if (normalized.endsWith(" INCL. VAT")) {
    return { currency: normalized.replace(/\s+INCL\.\s+VAT$/i, "").trim(), vatMode: "incl_vat" };
  }
  if (normalized.endsWith(" + VAT")) {
    return { currency: normalized.replace(/\s+\+\s+VAT$/i, "").trim(), vatMode: "plus_vat" };
  }
  return { currency: normalized, vatMode: "none" };
}

function composeCurrencyWithVat(currency: string | null | undefined, vatMode: VatMode | null | undefined) {
  const normalizedCurrency = String(currency || "")
    .trim()
    .toUpperCase();
  if (!normalizedCurrency) return "";
  if (vatMode === "incl_vat") return `${normalizedCurrency} INCL. VAT`;
  if (vatMode === "plus_vat") return `${normalizedCurrency} + VAT`;
  return normalizedCurrency;
}

const entryFormSchema = z
  .object({
    isMarketTrade: z.boolean().optional().default(false),
    quantityPreset: z.enum(["single", "range"]),
    tradeMyRole: z.enum(["seller", "buyer"]).optional(),
    tradeCounterpartyBrokerKey: z.string().optional(),
    sourceBidEntryId: z.string().optional().default(""),
    sourceOfferEntryId: z.string().optional().default(""),
    entryStatus: z.enum(["active", "needs_update", "cancelled", "executed"]).optional().default("active"),
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
    isNewCrop: z.boolean().optional().default(false),
    originCountry: z.string().optional().default("UA"),
    quantityMt: z.coerce.number().min(0, "Quantity must be 0 or greater").optional().default(0),
    quantityFromMt: z.coerce.number().min(0, "Quantity from must be 0 or greater").optional(),
    quantityToMt: z.coerce.number().min(0, "Quantity to must be 0 or greater").optional(),
    tolerancePct: z.coerce
      .number()
      .int("Tolerance must be an integer value")
      .refine(
        (value) => allowedTolerancePct.has(value),
        `Allowed tolerance values: ${tolerancePctOptions.map((value) => `± ${value}%`).join(", ")}`,
      )
      .optional()
      .default(0),
    basis: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .refine((value) => allowedBasisCodes.has(value), "Use basis from dictionary"),
    destinationPortCodes: z.array(z.string().min(1)).optional().default([]),
    periodMonth: z.string().optional().default(""),
    periodStart: z.string().optional().default(""),
    periodEnd: z.string().optional().default(""),
    currency: z
      .string()
      .trim()
      .optional()
      .default("")
      .refine((value) => !value || allowedCurrencyCodes.has(value.toUpperCase()), "Use currency from dictionary"),
    vatMode: z.enum(["none", "incl_vat", "plus_vat"]).optional().default("none"),
    price: z.coerce.number().nonnegative("Price must be 0 or greater").optional().default(0),
    paymentTerms: z.string().optional().default(""),
    sellerCommission: z.coerce.number().nonnegative("Seller commission must be 0 or greater").optional(),
    buyerCommission: z.coerce.number().nonnegative("Buyer commission must be 0 or greater").optional(),
    transportType: z.string().trim().min(1, "Transport is required").optional().default("vessel"),
    note: z.string().max(500, "Note must be 500 characters or fewer").optional(),
  })
  .superRefine((values, ctx) => {
    if (values.isMarketTrade) {
      if (!values.commodity) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["commodity"],
          message: "Commodity is required",
        });
      }
      if (!values.basis) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["basis"],
          message: "Delivery basis is required",
        });
      }
      return;
    }

    if (!values.originCountry) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["originCountry"],
        message: "Origin is required",
      });
    }

    if (!values.destinationPortCodes || values.destinationPortCodes.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["destinationPortCodes"],
        message: "Port / place is required",
      });
    }

    if (!values.currency) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["currency"],
        message: "Currency is required",
      });
    }

    if (!values.paymentTerms) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["paymentTerms"],
        message: "Payment terms are required",
      });
    }

    if (values.quantityPreset === "range") {
      if (values.quantityFromMt === null || values.quantityFromMt === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["quantityFromMt"],
          message: "Quantity from is required",
        });
      }
      if (values.quantityToMt === null || values.quantityToMt === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["quantityToMt"],
          message: "Quantity to is required",
        });
      }
      if (
        values.quantityFromMt !== null &&
        values.quantityFromMt !== undefined &&
        values.quantityToMt !== null &&
        values.quantityToMt !== undefined &&
        values.quantityToMt < values.quantityFromMt
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["quantityToMt"],
          message: "Quantity to must be greater than or equal to quantity from",
        });
      }
    }

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
    if (!harvestYearValues.includes(harvestYear as (typeof harvestYearValues)[number])) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["harvestYear"],
        message: `Harvest year must be one of: ${harvestYearValues.join(", ")}`,
      });
    }
  });

type EntryFormValues = z.infer<typeof entryFormSchema>;
export type EntryCreateFormPrefill = Partial<EntryFormValues>;
type TelegramSessionHook = ReturnType<typeof useSeaBrokerageTelegramSession>;

function normalizeTelegramIdentityKey(userId?: string | null, username?: string | null) {
  const normalizedUserId = String(userId || "").trim();
  if (normalizedUserId) return `id:${normalizedUserId}`;
  const normalizedUsername = String(username || "").trim().replace(/^@+/, "").toLowerCase();
  if (normalizedUsername) return `username:${normalizedUsername}`;
  return "";
}

function normalizeLocationCityInput(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ");
}

const globalEnglishCountryOptions = isoCountryOptionsEn;

function formatPortPlaceLabel(option: PortOption) {
  return `${option.displayLabel}, ${getCountryDisplayLabel(option.countryCode)}`;
}

function resolveSelectedPorts(portCodes: string[], allPortOptions: PortOption[]) {
  const selectedPorts = portCodes
    .map((code) => allPortOptions.find((option) => option.code === code))
    .filter((option): option is PortOption => !!option);
  const primaryPort = selectedPorts[0] ?? null;
  const destinationPort = selectedPorts.length
    ? selectedPorts.map((option) => option.displayLabel).join(" | ")
    : "";
  return { selectedPorts, primaryPort, destinationPort };
}

function getDefaultValues(entryType: EntryType): EntryFormValues {
  const now = new Date();
  const periodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  return {
    quantityPreset: "single",
    tradeMyRole: "seller",
    tradeCounterpartyBrokerKey: "",
    sourceBidEntryId: "",
    sourceOfferEntryId: "",
    entryStatus: "active",
    sellerName: "",
    buyerName: "",
    periodPreset: "explicit_range",
    commodity: "corn",
    harvestYear: defaultHarvestYear,
    isNewCrop: false,
    originCountry: "UA",
    quantityMt: entryType === "bid" ? 25000 : entryType === "trade" ? 22000 : 20000,
    quantityFromMt: undefined,
    quantityToMt: undefined,
    tolerancePct: 5,
    basis: "FOB",
    destinationPortCodes: [],
    periodMonth,
    periodStart: "2026-03-24",
    periodEnd: "2026-03-31",
    currency: entryType === "trade" ? "" : "USD",
    vatMode: "none",
    price: entryType === "bid" ? 225 : entryType === "trade" ? 224 : 223,
    paymentTerms: entryType === "bid" ? "CAD" : "CAFD",
    sellerCommission: undefined,
    buyerCommission: undefined,
    transportType: "vessel",
    note: "",
    isMarketTrade: false,
  };
}

function getDefaultValuesFromEntry(entry: BrokerageEntry): EntryFormValues {
  const quantityPreset: QuantityPreset =
    entry.quantityMt === null || entry.quantityMt === undefined ? "range" : "single";
  const periodPreset: PeriodPreset =
    entry.periodType === "spot"
      ? "spot"
      : entry.periodType === "prompt"
        ? "prompt"
        : entry.periodType === "month"
          ? "full_month"
          : "explicit_range";
  const periodMonth =
    entry.periodStart?.slice(0, 7) ||
    entry.periodEnd?.slice(0, 7) ||
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const parsedHarvestYear = (String(entry.gradeOrSpec || "").match(/\b(20\d{2})\b/) || [])[1] || "";
  const normalizedHarvestYear = harvestYearValues.includes(
    parsedHarvestYear as (typeof harvestYearValues)[number],
  )
    ? parsedHarvestYear
    : defaultHarvestYear;
  const parsedCurrency = parseCurrencyWithVat(entry.currency || "");

  return {
    quantityPreset,
    tradeMyRole: "seller",
    tradeCounterpartyBrokerKey: "",
    sourceBidEntryId: "",
    sourceOfferEntryId: "",
    entryStatus: (entry.entryStatus || "active") as SeaBrokerageEntryStatus,
    sellerName: entry.sellerName || "",
    buyerName: entry.buyerName || "",
    periodPreset,
    commodity: entry.commodity,
    harvestYear: normalizedHarvestYear,
    isNewCrop: isNewCropByHarvestYear(normalizedHarvestYear),
    originCountry: entry.originCountryCode || "UA",
    quantityMt: entry.quantityMt ?? entry.volumeFrom ?? 0,
    quantityFromMt: quantityPreset === "range" ? entry.volumeFrom : undefined,
    quantityToMt: quantityPreset === "range" ? entry.volumeTo : undefined,
    tolerancePct:
      entry.tolerancePct !== null &&
      entry.tolerancePct !== undefined &&
      allowedTolerancePct.has(entry.tolerancePct)
        ? entry.tolerancePct
        : 5,
    basis: entry.basis,
    destinationPortCodes:
      (Array.isArray(entry.destinationPortCodes) && entry.destinationPortCodes.length
        ? entry.destinationPortCodes
        : String(entry.destinationPortCode || "")
            .split("|")
            .map((part) => part.trim())
            .filter(Boolean)) || [],
    periodMonth,
    periodStart: entry.periodStart || "",
    periodEnd: entry.periodEnd || "",
    currency: parsedCurrency.currency,
    vatMode: parsedCurrency.vatMode,
    price: entry.price ?? entry.priceFrom ?? entry.priceTo ?? 0,
    paymentTerms: entry.paymentTerms || "CAD",
    sellerCommission: entry.sellerCommission ?? undefined,
    buyerCommission: entry.buyerCommission ?? undefined,
    transportType: normalizeTransportTypeForForm(entry.transportType),
    note: entry.note || "",
    isMarketTrade: !!entry.isMarketTrade,
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

function resolveVolumeRange(values: EntryFormValues) {
  if (
    values.quantityPreset === "range" &&
    values.quantityFromMt !== null &&
    values.quantityFromMt !== undefined &&
    values.quantityToMt !== null &&
    values.quantityToMt !== undefined
  ) {
    return {
      quantityMt: null as number | null,
      volumeFrom: values.quantityFromMt,
      volumeTo: values.quantityToMt,
    };
  }

  const { volumeFrom, volumeTo } = deriveVolumeRange(values.quantityMt, values.tolerancePct);
  return {
    quantityMt: values.quantityMt,
    volumeFrom,
    volumeTo,
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
  mode?: "create" | "edit";
  initialEntry?: BrokerageEntry | null;
  initialFormValues?: EntryCreateFormPrefill | null;
  onSubmitted?: (entry: BrokerageEntry) => void;
}

export function EntryCreateDialog({
  open,
  onOpenChange,
  entryType,
  session,
  mode = "create",
  initialEntry = null,
  initialFormValues = null,
  onSubmitted,
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
  const [portPickerCode, setPortPickerCode] = useState("");
  const [portSearch, setPortSearch] = useState("");
  const [newLocationCity, setNewLocationCity] = useState("");
  const [newLocationCountrySearch, setNewLocationCountrySearch] = useState("Ukraine");
  const [locationEditorMessage, setLocationEditorMessage] = useState<string | null>(null);
  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const [commoditySearch, setCommoditySearch] = useState("");
  const [isAddingCommodity, setIsAddingCommodity] = useState(false);
  const [newCommodityName, setNewCommodityName] = useState("");
  const [newCommodityCode, setNewCommodityCode] = useState("");
  const [newCommodityGroup, setNewCommodityGroup] = useState<"grains" | "oilseeds" | "processed">("processed");
  const [commodityEditorMessage, setCommodityEditorMessage] = useState<string | null>(null);
  const [isSavingCommodity, setIsSavingCommodity] = useState(false);
  const currencyDatalistId = `sea-monitor-currency-options-${entryType}`;
  const form = useForm<EntryFormValues>({
    resolver: zodResolver(entryFormSchema),
    defaultValues: getDefaultValues(entryType),
  });

  const values = form.watch();
  const canSetNeedsUpdate = ["OS", "VZH", "ABV", "VTTL"].includes(
    String(session.authorProfile?.brokerCode || "").trim().toUpperCase(),
  );
  const visibleEntryStatusOptions = canSetNeedsUpdate || values.entryStatus === "needs_update"
    ? entryStatusOptions
    : entryStatusOptions.filter((option) => option.value !== "needs_update");
  const { data: companyOptionsData = {} } = useQuery<{
    companies?: CompanyOption[];
    buyers?: CompanyOption[];
    sellers?: CompanyOption[];
  }>({
    queryKey: ["/api/sea-brokerage-monitor/companies"],
    queryFn: async () => {
      const response = await fetch("/api/sea-brokerage-monitor/companies");
      if (!response.ok) {
        throw new Error(`Failed to load companies (${response.status})`);
      }
      return (await response.json()) as {
        companies?: CompanyOption[];
        buyers?: CompanyOption[];
        sellers?: CompanyOption[];
      };
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
  const { data: sharedCountryOptionsData = [] } = useQuery<CountryOption[]>({
    queryKey: ["/api/sea-brokerage-monitor/countries"],
    queryFn: async () => {
      const response = await fetch("/api/sea-brokerage-monitor/countries");
      if (!response.ok) {
        throw new Error(`Failed to load custom countries (${response.status})`);
      }
      const payload = (await response.json()) as { countries?: CountryOption[] };
      return Array.isArray(payload.countries) ? payload.countries : [];
    },
    staleTime: 60_000,
  });
  const { data: sharedCommodityOptionsData = [] } = useQuery<Commodity[]>({
    queryKey: ["/api/sea-brokerage-monitor/commodities"],
    queryFn: async () => {
      const response = await fetch("/api/sea-brokerage-monitor/commodities");
      if (!response.ok) {
        throw new Error(`Failed to load custom commodities (${response.status})`);
      }
      const payload = (await response.json()) as { commodities?: Commodity[] };
      return Array.isArray(payload.commodities) ? payload.commodities : [];
    },
    staleTime: 60_000,
  });
  const { data: sharedBasisOptionsData = [] } = useQuery<string[]>({
    queryKey: ["/api/sea-brokerage-monitor/basis"],
    queryFn: async () => {
      const response = await fetch("/api/sea-brokerage-monitor/basis");
      if (!response.ok) {
        throw new Error(`Failed to load basis list (${response.status})`);
      }
      const payload = (await response.json()) as { basis?: string[] };
      return Array.isArray(payload.basis) ? payload.basis : [];
    },
    staleTime: 60_000,
  });
  const { data: sharedTransportOptionsData = [] } = useQuery<TransportOption[]>({
    queryKey: ["/api/sea-brokerage-monitor/transports"],
    queryFn: async () => {
      const response = await fetch("/api/sea-brokerage-monitor/transports");
      if (!response.ok) {
        throw new Error(`Failed to load transport dictionary (${response.status})`);
      }
      const payload = (await response.json()) as { transports?: TransportOption[] };
      return Array.isArray(payload.transports) ? payload.transports : [];
    },
    staleTime: 60_000,
  });
  const { data: brokerDirectory = [] } = useQuery<BrokerDirectoryItem[]>({
    queryKey: ["/api/sea-brokerage-monitor/broker-directory"],
    enabled: open && !!session.monitorAuthToken,
    queryFn: async () => {
      const response = await fetch("/api/sea-brokerage-monitor/broker-directory", {
        headers: buildSeaBrokerageMonitorAuthHeaders(session.monitorAuthToken),
      });
      if (response.status === 403) return [];
      if (!response.ok) {
        throw new Error(`Failed to load broker directory (${response.status})`);
      }
      const payload = (await response.json()) as { brokers?: BrokerDirectoryItem[] };
      return Array.isArray(payload.brokers) ? payload.brokers : [];
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
  const allCountryOptions = useMemo(() => {
    const byCode = new Map<string, CountryOption>();
    for (const option of [
      ...globalEnglishCountryOptions,
      ...countryOptions,
      ...sharedCountryOptionsData,
    ]) {
      byCode.set(option.code, option);
    }
    return Array.from(byCode.values()).sort((left, right) =>
      left.displayLabel.localeCompare(right.displayLabel),
    );
  }, [sharedCountryOptionsData]);
  const allCommodityOptions = useMemo(() => {
    const byCode = new Map<string, Commodity>();
    for (const option of [...commodityOptions, ...sharedCommodityOptionsData]) {
      byCode.set(option.code, option);
    }
    return Array.from(byCode.values()).sort((left, right) =>
      left.displayLabel.localeCompare(right.displayLabel),
    );
  }, [sharedCommodityOptionsData]);
  const allBasisOptions = useMemo(() => {
    const values = new Set<string>();
    for (const option of basisOptions) {
      const normalized = String(option.value || "").trim().toUpperCase();
      if (normalized) values.add(normalized);
    }
    for (const option of sharedBasisOptionsData) {
      const normalized = String(option || "").trim().toUpperCase();
      if (normalized) values.add(normalized);
    }
    return Array.from(values)
      .sort((a, b) => a.localeCompare(b))
      .map((value) => ({ value, label: value }));
  }, [sharedBasisOptionsData]);
  const allTransportOptions = useMemo(() => {
    const byCode = new Map<string, TransportOption>();
    const defaults = SEA_BROKERAGE_TRANSPORT_DICTIONARY.map(
      (item): TransportOption => ({
        code: item.code,
        displayLabel: item.displayLabel,
        displayLabelUa: item.displayLabelUa,
        icon: item.icon,
        transportMode: item.transportMode,
      }),
    );
    for (const option of [...defaults, ...sharedTransportOptionsData]) {
      const code = String(option.code || "").trim();
      if (!code) continue;
      byCode.set(code, {
        code,
        displayLabel: String(option.displayLabel || "").trim() || getSeaBrokerageTransportDisplayLabel(code, code),
        displayLabelUa: String(option.displayLabelUa || "").trim(),
        icon: String(option.icon || "").trim(),
        transportMode: option.transportMode,
      });
    }
    return Array.from(byCode.values()).sort((left, right) =>
      left.displayLabel.localeCompare(right.displayLabel),
    );
  }, [sharedTransportOptionsData]);
  const countryByCode = useMemo(() => {
    const map = new Map<string, CountryOption>();
    for (const option of allCountryOptions) {
      map.set(option.code, option);
    }
    return map;
  }, [allCountryOptions]);
  const companyOptions = useMemo(() => {
    const byLabel = new Map<string, CompanyOption>();
    for (const option of companyOptionsData.companies || []) {
      const key = normalizeCompanyLookupKey(option.displayLabel);
      if (!key) continue;
      byLabel.set(key, option);
    }
    return Array.from(byLabel.values()).sort((left, right) =>
      left.displayLabel.localeCompare(right.displayLabel),
    );
  }, [companyOptionsData.companies]);
  const sellerCompanyDictionary = useMemo(() => {
    const source = [...(companyOptionsData.sellers || []), ...companyOptions];
    const byLabel = new Map<string, CompanyOption>();
    for (const option of source) {
      const key = normalizeCompanyLookupKey(option.displayLabel);
      if (!key) continue;
      byLabel.set(key, option);
    }
    return Array.from(byLabel.values()).sort((left, right) =>
      left.displayLabel.localeCompare(right.displayLabel),
    );
  }, [companyOptionsData.sellers, companyOptions]);
  const buyerCompanyDictionary = useMemo(() => {
    const source = [...(companyOptionsData.buyers || []), ...companyOptions];
    const byLabel = new Map<string, CompanyOption>();
    for (const option of source) {
      const key = normalizeCompanyLookupKey(option.displayLabel);
      if (!key) continue;
      byLabel.set(key, option);
    }
    return Array.from(byLabel.values()).sort((left, right) =>
      left.displayLabel.localeCompare(right.displayLabel),
    );
  }, [companyOptionsData.buyers, companyOptions]);
  const sellerCompanyOptions = useMemo(() => {
    const query = sellerCompanySearch.trim().toLowerCase();
    if (!query) return sellerCompanyDictionary;
    return sellerCompanyDictionary.filter((option) =>
      option.displayLabel.toLowerCase().includes(query),
    );
  }, [sellerCompanyDictionary, sellerCompanySearch]);
  const buyerCompanyOptions = useMemo(() => {
    const query = buyerCompanySearch.trim().toLowerCase();
    if (!query) return buyerCompanyDictionary;
    return buyerCompanyDictionary.filter((option) =>
      option.displayLabel.toLowerCase().includes(query),
    );
  }, [buyerCompanyDictionary, buyerCompanySearch]);
  const filteredPortOptions = useMemo(() => {
    const query = portSearch.trim().toLowerCase();
    if (!query) return allPortOptions;
    return allPortOptions.filter((option) =>
      formatPortPlaceLabel(option).toLowerCase().includes(query),
    );
  }, [allPortOptions, portSearch]);
  const filteredCommodityOptions = useMemo(() => {
    const query = commoditySearch.trim().toLowerCase();
    if (!query) return allCommodityOptions;
    return allCommodityOptions.filter((option) =>
      `${option.displayLabel} ${option.compactDisplay}`.toLowerCase().includes(query),
    );
  }, [allCommodityOptions, commoditySearch]);
  const authorBrokerIdentityKey = useMemo(
    () =>
      normalizeTelegramIdentityKey(
        session.telegramIdentity.telegramUserId,
        session.telegramIdentity.telegramUsername,
      ),
    [session.telegramIdentity.telegramUserId, session.telegramIdentity.telegramUsername],
  );
  const brokerDirectoryOptions = useMemo(() => {
    return brokerDirectory
      .map((broker) => {
        const key = normalizeTelegramIdentityKey(broker.telegramUserId, broker.telegramUsername);
        if (!key) return null;
        const handle = broker.telegramUsername
          ? `@${broker.telegramUsername.replace(/^@+/, "")}`
          : broker.telegramUserId
            ? `tg:${broker.telegramUserId}`
            : "unknown";
        return {
          key,
          handle,
          brokerCode: broker.brokerCode,
          brokerName: broker.brokerName,
          companyName: broker.companyName,
          telegramUserId: broker.telegramUserId || null,
          telegramUsername: broker.telegramUsername || null,
          label: `${broker.brokerCode} / ${broker.brokerName} (${handle})`,
        };
      })
      .filter((option): option is NonNullable<typeof option> => !!option)
      .sort((left, right) => left.brokerCode.localeCompare(right.brokerCode));
  }, [brokerDirectory]);
  const brokerDirectoryByKey = useMemo(() => {
    const byKey = new Map<string, (typeof brokerDirectoryOptions)[number]>();
    brokerDirectoryOptions.forEach((option) => {
      byKey.set(option.key, option);
    });
    return byKey;
  }, [brokerDirectoryOptions]);

  useEffect(() => {
    const nextDefaults =
      mode === "edit" && initialEntry
        ? getDefaultValuesFromEntry(initialEntry)
        : (() => {
            const mergedDefaults = { ...getDefaultValues(entryType), ...(initialFormValues ?? {}) };
            const parsedCurrency = parseCurrencyWithVat(mergedDefaults.currency);
            return {
              ...mergedDefaults,
              currency: parsedCurrency.currency,
              vatMode: parsedCurrency.vatMode,
            };
          })();
    form.reset(nextDefaults);
    setSubmitMessage(null);
    setIsAddingCompany(false);
    setCompanyEditorTarget(entryType === "offer" ? "sellerName" : "buyerName");
    setNewCompanyName("");
    setSellerCompanySearch("");
    setBuyerCompanySearch("");
    setCompanyEditorMessage(null);
    setIsSavingCompany(false);
    setIsAddingLocation(false);
    setPortPickerCode("");
    setPortSearch("");
    setNewLocationCity("");
    setNewLocationCountrySearch("Ukraine");
    setLocationEditorMessage(null);
    setIsSavingLocation(false);
    setCommoditySearch("");
    setIsAddingCommodity(false);
    setNewCommodityName("");
    setNewCommodityCode("");
    setNewCommodityGroup("processed");
    setCommodityEditorMessage(null);
    setIsSavingCommodity(false);
  }, [entryType, form, initialEntry, initialFormValues, mode, open]);

  useEffect(() => {
    if (!open || entryType !== "trade") return;
    if (!authorBrokerIdentityKey) return;

    const authorOption = brokerDirectoryByKey.get(authorBrokerIdentityKey);
    const firstCounterparty = brokerDirectoryOptions[0];
    const currentRole = form.getValues("tradeMyRole");
    const currentCounterparty = form.getValues("tradeCounterpartyBrokerKey");

    if (!currentRole) {
      form.setValue("tradeMyRole", "seller");
    }

    if (!currentCounterparty && firstCounterparty) {
      form.setValue("tradeCounterpartyBrokerKey", firstCounterparty.key);
    }

    if (mode === "edit" && initialEntry) {
      const sellerKey = normalizeTelegramIdentityKey(
        initialEntry.tradeSellerBrokerTelegramUserId,
        initialEntry.tradeSellerBrokerTelegramUsername,
      );
      const buyerKey = normalizeTelegramIdentityKey(
        initialEntry.tradeBuyerBrokerTelegramUserId,
        initialEntry.tradeBuyerBrokerTelegramUsername,
      );
      if (sellerKey && sellerKey === authorBrokerIdentityKey) {
        form.setValue("tradeMyRole", "seller");
        if (buyerKey) {
          form.setValue("tradeCounterpartyBrokerKey", buyerKey);
        }
      } else if (buyerKey && buyerKey === authorBrokerIdentityKey) {
        form.setValue("tradeMyRole", "buyer");
        if (sellerKey) {
          form.setValue("tradeCounterpartyBrokerKey", sellerKey);
        }
      } else if (initialEntry.tradeSellerBrokerTelegramUsername || initialEntry.tradeSellerBrokerTelegramUserId) {
        form.setValue("tradeMyRole", "buyer");
        if (sellerKey) {
          form.setValue("tradeCounterpartyBrokerKey", sellerKey);
        }
      }
    }

    if (authorOption) {
      const role = form.getValues("tradeMyRole") || "seller";
      if (role === "seller" && !form.getValues("sellerName")?.trim()) {
        form.setValue("sellerName", authorOption.companyName, { shouldValidate: true });
      }
      if (role === "buyer" && !form.getValues("buyerName")?.trim()) {
        form.setValue("buyerName", authorOption.companyName, { shouldValidate: true });
      }
    }
  }, [
    authorBrokerIdentityKey,
    brokerDirectoryByKey,
    brokerDirectoryOptions,
    entryType,
    form,
    initialEntry,
    mode,
    open,
  ]);

  const canonicalPreview = useMemo(() => {
    if (!session.authorProfile) {
      return "Author session required before a canonical broker line can be generated.";
    }

    const commodity = allCommodityOptions.find((option) => option.code === values.commodity);
    const { primaryPort, destinationPort } = resolveSelectedPorts(values.destinationPortCodes || [], allPortOptions);
    const originCountry =
      countryByCode.get(values.originCountry)?.displayLabel ||
      getCountryDisplayLabel(values.originCountry);
    const destinationCountry =
      countryByCode.get(primaryPort?.countryCode || "")?.displayLabel ||
      getCountryDisplayLabel(primaryPort?.countryCode);
    const { quantityMt, volumeFrom, volumeTo } = resolveVolumeRange(values);
    const harvestYear = String(values.harvestYear || "").trim();
    const gradeOrSpec = harvestYear ? `HARVEST ${harvestYear}` : "";
    const resolvedPeriod = resolvePeriodValues(
      values.periodPreset,
      values.periodMonth,
      values.periodStart,
      values.periodEnd,
    );
    const resolvedCurrency = composeCurrencyWithVat(values.currency, values.vatMode);
    const normalizedTransportType = normalizeSeaBrokerageTransportCode(values.transportType, "vessel");

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
      quantityMt,
      tolerancePct: values.tolerancePct,
      volumeFrom,
      volumeTo,
      volumeUnit: volumeUnitOptions[0].value,
      basis: values.basis as Basis,
      paymentTerms: values.paymentTerms,
      isNewCrop:
        entryType === "bid" || entryType === "offer"
          ? isNewCropByHarvestYear(harvestYear)
          : false,
      sellerCommission: entryType === "trade" ? values.sellerCommission ?? null : null,
      buyerCommission: entryType === "trade" ? values.buyerCommission ?? null : null,
      destinationPortCode: primaryPort?.code ?? null,
      destinationPort: destinationPort || primaryPort?.displayLabel || "",
      destinationCountryCode: primaryPort?.countryCode ?? null,
      destinationCountry,
      periodType: resolvedPeriod.periodType,
      periodLabel: resolvedPeriod.periodLabel,
      periodStart: resolvedPeriod.periodStart,
      periodEnd: resolvedPeriod.periodEnd,
      price: values.price,
      priceFrom: values.price,
      priceTo: values.price,
      currency: resolvedCurrency as Currency,
      transportType: normalizedTransportType as TransportType,
      note: values.note?.trim() ? values.note.trim() : null,
      createdAt: new Date().toISOString(),
      createdBy: session.authorProfile,
      telegramRelayStatus: undefined,
      telegramRelayMessage: null,
    });
  }, [allCommodityOptions, allPortOptions, countryByCode, entryType, session.authorProfile, values]);

  function normalizeFormValuesForType(
    formValues: EntryFormValues,
    targetType: EntryType,
  ): EntryFormValues {
    if (targetType === "trade") return formValues;
    if (targetType === "offer") {
      const seller = formValues.sellerName?.trim() || formValues.buyerName?.trim() || "";
      return { ...formValues, sellerName: seller, buyerName: "" };
    }
    if (targetType === "bid") {
      const buyer = formValues.buyerName?.trim() || formValues.sellerName?.trim() || "";
      return { ...formValues, buyerName: buyer, sellerName: "" };
    }
    return formValues;
  }

  function buildEntryPayload(formValues: EntryFormValues, targetType: EntryType) {
    const normalizedValues = normalizeFormValuesForType(formValues, targetType);
    const commodity = allCommodityOptions.find((option) => option.code === normalizedValues.commodity);
    const { selectedPorts, primaryPort, destinationPort } = resolveSelectedPorts(
      normalizedValues.destinationPortCodes || [],
      allPortOptions,
    );
    const { quantityMt, volumeFrom, volumeTo } = resolveVolumeRange(normalizedValues);
    const harvestYear = String(normalizedValues.harvestYear || "").trim();
    const gradeOrSpec = harvestYear ? `HARVEST ${harvestYear}` : "";
    const resolvedPeriod = resolvePeriodValues(
      normalizedValues.periodPreset,
      normalizedValues.periodMonth,
      normalizedValues.periodStart,
      normalizedValues.periodEnd,
    );
    const resolvedCurrency = composeCurrencyWithVat(normalizedValues.currency, normalizedValues.vatMode);
    const normalizedTransportType = normalizeSeaBrokerageTransportCode(
      normalizedValues.transportType,
      "vessel",
    );

    let tradeSellerBrokerTelegramUserId: string | null = null;
    let tradeSellerBrokerTelegramUsername: string | null = null;
    let tradeBuyerBrokerTelegramUserId: string | null = null;
    let tradeBuyerBrokerTelegramUsername: string | null = null;

    if (targetType === "trade") {
      const myRole = (normalizedValues.tradeMyRole || "seller") as TradeMyRole;
      const counterpartyKey = String(normalizedValues.tradeCounterpartyBrokerKey || "").trim();
      if (!authorBrokerIdentityKey) {
        throw new Error("Telegram broker identity is required for TRADE publishing.");
      }
      if (!counterpartyKey) {
        throw new Error("Select the second broker for TRADE.");
      }
      const counterpartyBroker = brokerDirectoryByKey.get(counterpartyKey);
      if (!counterpartyBroker) {
        throw new Error("Selected counterparty broker is not available.");
      }

      const meTelegramUserId = session.telegramIdentity.telegramUserId || null;
      const meTelegramUsername = session.telegramIdentity.telegramUsername
        ? session.telegramIdentity.telegramUsername.replace(/^@+/, "")
        : null;
      if (myRole === "seller") {
        tradeSellerBrokerTelegramUserId = meTelegramUserId;
        tradeSellerBrokerTelegramUsername = meTelegramUsername;
        tradeBuyerBrokerTelegramUserId = counterpartyBroker.telegramUserId;
        tradeBuyerBrokerTelegramUsername = counterpartyBroker.telegramUsername;
      } else {
        tradeSellerBrokerTelegramUserId = counterpartyBroker.telegramUserId;
        tradeSellerBrokerTelegramUsername = counterpartyBroker.telegramUsername;
        tradeBuyerBrokerTelegramUserId = meTelegramUserId;
        tradeBuyerBrokerTelegramUsername = meTelegramUsername;
      }

      if (!normalizedValues.sellerName?.trim()) {
        throw new Error("Seller is required for TRADE.");
      }
      if (!normalizedValues.buyerName?.trim()) {
        throw new Error("Buyer is required for TRADE.");
      }
    }

    const originCountry =
      countryByCode.get(normalizedValues.originCountry)?.displayLabel ||
      getCountryDisplayLabel(normalizedValues.originCountry);
    const destinationCountry =
      countryByCode.get(primaryPort?.countryCode || "")?.displayLabel ||
      getCountryDisplayLabel(primaryPort?.countryCode);

    const canonicalView = buildCanonicalView({
      id: mode === "edit" && initialEntry?.id ? initialEntry.id : "preview",
      type: targetType,
      isMarketTrade: targetType === "trade" ? !!normalizedValues.isMarketTrade : false,
      brokerId: session.authorProfile?.id || "unknown",
      brokerCode: session.authorProfile?.brokerCode || "",
      brokerName: session.authorProfile?.brokerName || "",
      companyName: session.authorProfile?.companyName || "",
      sellerName:
        targetType !== "bid" && normalizedValues.sellerName?.trim() ? normalizedValues.sellerName.trim() : null,
      buyerName:
        targetType !== "offer" && normalizedValues.buyerName?.trim() ? normalizedValues.buyerName.trim() : null,
      originCountry,
      originCountryCode: normalizedValues.originCountry,
      commodity: normalizedValues.commodity as BrokerageEntry["commodity"],
      commodityLabel: commodity?.displayLabel ?? normalizedValues.commodity,
      gradeOrSpec,
      quantityMt,
      tolerancePct: normalizedValues.tolerancePct,
      volumeFrom,
      volumeTo,
      volumeUnit: volumeUnitOptions[0].value,
      basis: normalizedValues.basis as Basis,
      paymentTerms: normalizedValues.paymentTerms,
      isNewCrop:
        targetType === "bid" || targetType === "offer"
          ? isNewCropByHarvestYear(harvestYear)
          : false,
      sellerCommission: targetType === "trade" ? normalizedValues.sellerCommission ?? null : null,
      buyerCommission: targetType === "trade" ? normalizedValues.buyerCommission ?? null : null,
      destinationPortCode: selectedPorts.map((port) => port.code).join("|") || primaryPort?.code || null,
      destinationPort: destinationPort || primaryPort?.displayLabel || "",
      destinationCountryCode: primaryPort?.countryCode ?? null,
      destinationCountry,
      periodType: resolvedPeriod.periodType,
      periodLabel: resolvedPeriod.periodLabel,
      periodStart: resolvedPeriod.periodStart,
      periodEnd: resolvedPeriod.periodEnd,
      price: normalizedValues.price,
      priceFrom: normalizedValues.price,
      priceTo: normalizedValues.price,
      currency: resolvedCurrency as Currency,
      transportType: normalizedTransportType as TransportType,
      note: normalizedValues.note?.trim() ? normalizedValues.note.trim() : null,
      createdAt: new Date().toISOString(),
      createdBy: session.authorProfile!,
      telegramRelayStatus: undefined,
      telegramRelayMessage: null,
    });

    return {
      type: targetType,
      isMarketTrade: targetType === "trade" ? !!normalizedValues.isMarketTrade : false,
      sellerName:
        targetType !== "bid" && normalizedValues.sellerName?.trim()
          ? normalizedValues.sellerName.trim()
          : null,
      buyerName:
        targetType !== "offer" && normalizedValues.buyerName?.trim()
          ? normalizedValues.buyerName.trim()
          : null,
      originCountry,
      originCountryCode: normalizedValues.originCountry,
      commodity: normalizedValues.commodity as BrokerageEntry["commodity"],
      commodityLabel: commodity?.displayLabel ?? normalizedValues.commodity,
      gradeOrSpec,
      quantityMt,
      tolerancePct: normalizedValues.tolerancePct,
      volumeFrom,
      volumeTo,
      volumeUnit: volumeUnitOptions[0].value,
      basis: normalizedValues.basis,
      paymentTerms: normalizedValues.paymentTerms,
      isNewCrop:
        targetType === "bid" || targetType === "offer"
          ? isNewCropByHarvestYear(harvestYear)
          : false,
      sellerCommission: targetType === "trade" ? normalizedValues.sellerCommission ?? null : null,
      buyerCommission: targetType === "trade" ? normalizedValues.buyerCommission ?? null : null,
      destinationPortCode: selectedPorts.map((port) => port.code).join("|") || primaryPort?.code || null,
      destinationPort: destinationPort || primaryPort?.displayLabel || "",
      destinationCountryCode: primaryPort?.countryCode ?? null,
      destinationCountry,
      periodType: resolvedPeriod.periodType,
      periodLabel: resolvedPeriod.periodLabel,
      periodStart: resolvedPeriod.periodStart,
      periodEnd: resolvedPeriod.periodEnd,
      price: normalizedValues.price,
      priceFrom: normalizedValues.price,
      priceTo: normalizedValues.price,
      currency: resolvedCurrency,
      transportType: normalizedTransportType,
      note: normalizedValues.note?.trim() ? normalizedValues.note.trim() : null,
      brokerCode: session.authorProfile?.brokerCode || "",
      brokerName: session.authorProfile?.brokerName || "",
      companyName: session.authorProfile?.companyName || "",
      tradeSellerBrokerTelegramUserId:
        targetType === "trade" ? tradeSellerBrokerTelegramUserId : null,
      tradeSellerBrokerTelegramUsername:
        targetType === "trade" ? tradeSellerBrokerTelegramUsername : null,
      tradeBuyerBrokerTelegramUserId:
        targetType === "trade" ? tradeBuyerBrokerTelegramUserId : null,
      tradeBuyerBrokerTelegramUsername:
        targetType === "trade" ? tradeBuyerBrokerTelegramUsername : null,
      sourceBidEntryId:
        targetType === "trade" && normalizedValues.sourceBidEntryId?.trim()
          ? normalizedValues.sourceBidEntryId.trim()
          : null,
      sourceOfferEntryId:
        targetType === "trade" && normalizedValues.sourceOfferEntryId?.trim()
          ? normalizedValues.sourceOfferEntryId.trim()
          : null,
      entryStatus:
        targetType === "trade"
          ? "active"
          : normalizedValues.entryStatus === "needs_update"
            ? "needs_update"
            : "active",
      canonicalView,
    };
  }

  async function saveEntryWithType(formValues: EntryFormValues, targetType: EntryType) {
    if (!session.authorProfile || !session.canCreateEntries) {
      throw new Error("Author unavailable. Ask admin to add your account into Sea Brokerage broker allowlist.");
    }

    const payload = buildEntryPayload(formValues, targetType);
    const requestMethod = mode === "edit" && initialEntry?.id ? "PATCH" : "POST";
    const requestPath =
      mode === "edit" && initialEntry?.id
        ? `/api/sea-brokerage-monitor/entries/${initialEntry.id}`
        : "/api/sea-brokerage-monitor/entries";

    const response = await apiRequest(requestMethod, requestPath, payload, {
      headers: buildSeaBrokerageMonitorAuthHeaders(session.monitorAuthToken),
    });
    await queryClient.invalidateQueries({ queryKey: ["/api/sea-brokerage-monitor/entries"] });
    const savedEntry = (await response.json()) as BrokerageEntry;
    form.reset(getDefaultValues(savedEntry.type));
    setSubmitMessage(null);
    onSubmitted?.(savedEntry);
    onOpenChange(false);
  }

  async function onSubmit(formValues: EntryFormValues) {
    if (!session.authorProfile || !session.canCreateEntries) {
      setSubmitMessage(
        "Author unavailable. Ask admin to add your account into Sea Brokerage broker allowlist.",
      );
      return;
    }

    try {
      await saveEntryWithType(formValues, entryType);
    } catch (error) {
      setSubmitMessage(
        error instanceof Error
          ? error.message
          : mode === "edit"
            ? "Failed to update the brokerage entry."
            : "Failed to create the brokerage entry.",
      );
    }
  }

  async function onConvertEntryType() {
    if (mode !== "edit" || !initialEntry?.id) return;
    if (entryType === "trade") return;

    const targetType: EntryType = entryType === "bid" ? "offer" : "bid";
    const currentValues = form.getValues();
    try {
      await saveEntryWithType(currentValues, targetType);
    } catch (error) {
      setSubmitMessage(
        error instanceof Error ? error.message : `Failed to convert to ${targetType.toUpperCase()}.`,
      );
    }
  }

  async function addCustomLocation() {
    const city = normalizeLocationCityInput(newLocationCity);
    const countrySearch = normalizeLocationCityInput(newLocationCountrySearch);
    const country = allCountryOptions.find(
      (option) =>
        option.code.toLowerCase() === countrySearch.toLowerCase() ||
        option.displayLabel.toLowerCase() === countrySearch.toLowerCase(),
    );
    const countryCode = country?.code || "";

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
      form.setValue("destinationPortCodes", [existing.code], { shouldValidate: true });
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
      form.setValue("destinationPortCodes", [location.code], { shouldValidate: true });
      setNewLocationCity("");
      setNewLocationCountrySearch(country.displayLabel);
      setIsAddingLocation(false);
      setLocationEditorMessage(payload.duplicate ? "Location already existed and was selected." : "Location added.");
    } catch (error) {
      setLocationEditorMessage(error instanceof Error ? error.message : "Failed to add location.");
    } finally {
      setIsSavingLocation(false);
    }
  }

  async function addCustomCommodity() {
    const displayLabel = normalizeLocationCityInput(newCommodityName);
    const code = String(newCommodityCode || "").trim().toLowerCase();

    if (!/^[A-Za-z0-9][A-Za-z0-9\s%.,()'\/-]{1,79}$/.test(displayLabel)) {
      setCommodityEditorMessage("Use English commodity name.");
      return;
    }

    try {
      setIsSavingCommodity(true);
      const response = await fetch("/api/sea-brokerage-monitor/commodities", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildSeaBrokerageMonitorAuthHeaders(session.monitorAuthToken),
        },
        body: JSON.stringify({
          displayLabel,
          code: code || undefined,
          group: newCommodityGroup,
        }),
      });
      if (!response.ok) {
        const text = (await response.text()) || "Failed to add commodity";
        throw new Error(text);
      }

      const payload = (await response.json()) as { commodity?: Commodity; duplicate?: boolean };
      const commodity = payload.commodity;
      if (!commodity) {
        throw new Error("Invalid commodity payload.");
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/sea-brokerage-monitor/commodities"] });
      form.setValue("commodity", commodity.code, { shouldValidate: true });
      setNewCommodityName("");
      setNewCommodityCode("");
      setNewCommodityGroup("processed");
      setIsAddingCommodity(false);
      setCommodityEditorMessage(payload.duplicate ? "Commodity already existed and was selected." : "Commodity added.");
    } catch (error) {
      setCommodityEditorMessage(error instanceof Error ? error.message : "Failed to add commodity.");
    } finally {
      setIsSavingCommodity(false);
    }
  }

  async function addCustomCompany() {
    const label = newCompanyName.trim().replace(/\s+/g, " ");
    if (!label) {
      setCompanyEditorMessage("Company name is required.");
      return;
    }
    if (!/^(?=.{2,120}$)[A-Za-z0-9"'&().,\/-][A-Za-z0-9\s'"&().,\/-]*$/.test(label)) {
      setCompanyEditorMessage("Use English company name (letters, numbers, basic punctuation).");
      return;
    }

    const roleForNewCompany =
      entryType === "offer"
        ? "seller"
        : entryType === "bid"
          ? "buyer"
          : companyEditorTarget === "sellerName"
            ? "seller"
            : "buyer";
    const dictionaryForRole = roleForNewCompany === "seller" ? sellerCompanyDictionary : buyerCompanyDictionary;
    const existing = dictionaryForRole.find(
      (option) => normalizeCompanyLookupKey(option.displayLabel) === normalizeCompanyLookupKey(label),
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
        body: JSON.stringify({ displayLabel: label, role: roleForNewCompany }),
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
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] overflow-x-hidden overflow-y-auto px-3 sm:max-w-2xl sm:px-6">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit"
              ? `Edit ${entryType.toUpperCase()}`
              : entryType === "bid"
                ? "Create BID"
                : entryType === "offer"
                  ? "Create OFFER"
                  : "Create TRADE"}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {mode === "edit" ? "Update broker entry details." : "Compact broker entry workflow."}
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
          <form className="space-y-3 overflow-x-hidden" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid min-w-0 gap-2.5 md:grid-cols-2">
              {entryType === "trade" ? (
                <FormField
                  control={form.control}
                  name="isMarketTrade"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Trade category</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={(value) => field.onChange(value === "market")}
                          value={field.value ? "market" : "our"}
                          className="flex gap-4"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="our" id="trade-our" />
                            <Label htmlFor="trade-our" className="font-normal">
                              Our Trade
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="market" id="trade-market" />
                            <Label htmlFor="trade-market" className="font-normal">
                              Market Trade
                            </Label>
                          </div>
                        </RadioGroup>
                      </FormControl>
                      <div className="text-[11px] text-muted-foreground">
                        {field.value
                          ? "Trade observed from the market. Author handle will be included in report."
                          : "Trade executed by your brokerage. Normal validation applies."}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}
              {entryType === "trade" ? (
                <FormField
                  control={form.control}
                  name="tradeMyRole"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>My role in trade</FormLabel>
                      <Select
                        value={field.value || "seller"}
                        onValueChange={(value) => field.onChange(value as TradeMyRole)}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="seller">Seller</SelectItem>
                          <SelectItem value="buyer">Buyer</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="text-[11px] text-muted-foreground">
                        Your Telegram account is fixed to this side.
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}
              {entryType === "trade" ? (
                <FormField
                  control={form.control}
                  name="tradeCounterpartyBrokerKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Counterparty broker (Telegram)</FormLabel>
                      <Select
                        value={field.value?.trim() ? field.value : "__none__"}
                        onValueChange={(value) => {
                          field.onChange(value === "__none__" ? "" : value);
                        }}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select broker" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">Select broker</SelectItem>
                          {brokerDirectoryOptions.map((option) => (
                            <SelectItem key={option.key} value={option.key}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="text-[11px] text-muted-foreground">
                        Second side of TRADE for Telegram reporting.
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}
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
              {(entryType === "bid" || entryType === "offer") ? (
                <FormField
                  control={form.control}
                  name="entryStatus"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select
                        value={field.value || "active"}
                        onValueChange={(value) => field.onChange(value as SeaBrokerageEntryStatus)}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {visibleEntryStatusOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="text-[11px] text-muted-foreground">
                        Active is default. Needs Update is available for boss role only.
                      </div>
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
                        if (!open) setCommoditySearch("");
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Commodity" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <div className="px-2 pb-2">
                          <Input
                            placeholder="Type commodity..."
                            value={commoditySearch}
                            onChange={(event) => setCommoditySearch(event.target.value)}
                            className="h-8 text-xs"
                            onKeyDown={(event) => event.stopPropagation()}
                          />
                        </div>
                        {filteredCommodityOptions.map((option) => (
                          <SelectItem key={option.code} value={option.code}>
                            {option.displayLabel}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        type="button"
                        variant={isAddingCommodity ? "outline" : "secondary"}
                        className={
                          isAddingCommodity
                            ? undefined
                            : "border-primary/60 bg-primary/20 text-primary hover:bg-primary/30"
                        }
                        size="sm"
                        onClick={() => {
                          setIsAddingCommodity((prev) => !prev);
                          setCommodityEditorMessage(null);
                        }}
                      >
                        {isAddingCommodity ? "Cancel" : "Add commodity"}
                      </Button>
                    </div>
                    {isAddingCommodity ? (
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        <Input
                          placeholder="Commodity name in English"
                          value={newCommodityName}
                          onChange={(event) => setNewCommodityName(event.target.value)}
                        />
                        <Input
                          placeholder="Code (optional, e.g. sunmeal)"
                          value={newCommodityCode}
                          onChange={(event) => setNewCommodityCode(event.target.value)}
                        />
                        <Select
                          value={newCommodityGroup}
                          onValueChange={(value) =>
                            setNewCommodityGroup(value as "grains" | "oilseeds" | "processed")
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Commodity group" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="grains">Grains</SelectItem>
                            <SelectItem value="oilseeds">Oilseeds</SelectItem>
                            <SelectItem value="processed">Processed products</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className="md:col-span-2">
                          <Button type="button" size="sm" onClick={addCustomCommodity}>
                            {isSavingCommodity ? "Saving..." : "Save commodity"}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                    {commodityEditorMessage ? (
                      <div className="mt-1 text-[11px] text-muted-foreground">{commodityEditorMessage}</div>
                    ) : null}
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
                        {allCountryOptions.map((option) => (
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
                    <div className="flex items-center justify-between gap-2">
                      <FormLabel>Harvest year</FormLabel>
                      {(entryType === "bid" || entryType === "offer") &&
                      isNewCropByHarvestYear(field.value) ? (
                        <span className="inline-flex items-center rounded-md border border-primary/60 bg-primary/15 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-primary">
                          NEW CROP
                        </span>
                      ) : null}
                    </div>
                    <Select onValueChange={field.onChange} value={field.value || defaultHarvestYear}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Harvest year" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {harvestYearOptions.map((option) => (
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
                name="quantityMt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity, MT</FormLabel>
                    <div className="space-y-2">
                      <FormField
                        control={form.control}
                        name="quantityPreset"
                        render={({ field: presetField }) => (
                          <Select
                            onValueChange={presetField.onChange}
                            value={presetField.value}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Quantity mode" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="single">Exact quantity</SelectItem>
                              <SelectItem value="range">Range (from-to)</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {values.quantityPreset === "range" ? (
                        <div className="grid grid-cols-2 gap-2">
                          <FormField
                            control={form.control}
                            name="quantityFromMt"
                            render={({ field: rangeField }) => (
                              <FormControl>
                                <Input
                                  type="number"
                                  min="0"
                                  step="1"
                                  placeholder="From"
                                  value={rangeField.value ?? ""}
                                  onChange={(event) =>
                                    rangeField.onChange(
                                      event.target.value === "" ? undefined : Number(event.target.value),
                                    )
                                  }
                                />
                              </FormControl>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="quantityToMt"
                            render={({ field: rangeField }) => (
                              <FormControl>
                                <Input
                                  type="number"
                                  min="0"
                                  step="1"
                                  placeholder="To"
                                  value={rangeField.value ?? ""}
                                  onChange={(event) =>
                                    rangeField.onChange(
                                      event.target.value === "" ? undefined : Number(event.target.value),
                                    )
                                  }
                                />
                              </FormControl>
                            )}
                          />
                        </div>
                      ) : (
                        <FormControl>
                          <Input type="number" min="0" step="1" {...field} />
                        </FormControl>
                      )}
                    </div>
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
                      <Input
                        type="number"
                        min="0"
                        max="10"
                        step="1"
                        list="tolerance-pct-options"
                        value={field.value ?? ""}
                        onChange={(event) =>
                          field.onChange(
                            event.target.value === "" ? "" : Number(event.target.value),
                          )
                        }
                      />
                    </FormControl>
                    <datalist id="tolerance-pct-options">
                      {tolerancePctOptions.map((value) => (
                        <option key={value} value={value} />
                      ))}
                    </datalist>
                    <div className="text-[11px] text-muted-foreground">
                      Allowed: {tolerancePctOptions.map((value) => `± ${value}%`).join(", ")}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid min-w-0 gap-2.5 md:grid-cols-2">
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
                        {allBasisOptions.map((option) => (
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
                name="destinationPortCodes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Port / place</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        const next = Array.from(new Set([...(field.value || []), value]));
                        field.onChange(next);
                        setPortPickerCode("");
                      }}
                      value={portPickerCode}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Add port / place" />
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
                    {(field.value || []).length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(field.value || []).map((code) => {
                          const option = allPortOptions.find((item) => item.code === code);
                          const label = option ? formatPortPlaceLabel(option) : code;
                          return (
                            <button
                              key={code}
                              type="button"
                              className="rounded-md border border-border/70 bg-muted/20 px-2 py-1 text-[11px] hover:bg-muted/40"
                              onClick={() => {
                                const next = (field.value || []).filter((value) => value !== code);
                                field.onChange(next);
                              }}
                            >
                              {label} ×
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
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
                        <div className="space-y-1">
                          <Input
                            list="sea-monitor-country-options"
                            placeholder="Country in English (start typing...)"
                            value={newLocationCountrySearch}
                            onChange={(event) => setNewLocationCountrySearch(event.target.value)}
                          />
                          <datalist id="sea-monitor-country-options">
                            {allCountryOptions.map((option) => (
                              <option key={option.code} value={option.displayLabel} />
                            ))}
                          </datalist>
                          <div className="text-[11px] text-muted-foreground">
                            Type country name and pick suggestion from list.
                          </div>
                        </div>
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

            <div className="grid min-w-0 gap-2.5 md:grid-cols-2">
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
              <div className="grid min-w-0 gap-2.5 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="periodMonth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Month / year</FormLabel>
                      <FormControl>
                        <Input
                          type="month"
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          className="min-w-0 w-full"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ) : null}

            {values.periodPreset === "explicit_range" ? (
              <div className="grid min-w-0 gap-2.5 md:grid-cols-2">
              <FormField
                control={form.control}
                name="periodStart"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Shipment / delivery from</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        className="min-w-0 w-full"
                      />
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
                      <Input
                        type="date"
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        className="min-w-0 w-full"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              </div>
            ) : null}

            <div className="grid min-w-0 gap-2.5 md:grid-cols-5">
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Currency</FormLabel>
                    <FormControl>
                      <Input
                        list={currencyDatalistId}
                        value={field.value}
                        onChange={(event) => {
                          field.onChange(String(event.target.value || "").toUpperCase());
                        }}
                        placeholder="Start typing currency"
                        autoComplete="off"
                        className="min-w-0 w-full"
                      />
                    </FormControl>
                    <datalist id={currencyDatalistId}>
                      {currencyOptions.map((option) => (
                        <option key={option.value} value={option.value} label={option.label} />
                      ))}
                    </datalist>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="vatMode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>VAT</FormLabel>
                    <FormControl>
                      <div className="flex h-10 items-center gap-3 rounded-md border border-border px-3">
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5"
                            checked={field.value === "incl_vat"}
                            onChange={(event) =>
                              field.onChange(event.target.checked ? "incl_vat" : "none")
                            }
                          />
                          incl. VAT
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5"
                            checked={field.value === "plus_vat"}
                            onChange={(event) =>
                              field.onChange(event.target.checked ? "plus_vat" : "none")
                            }
                          />
                          + VAT
                        </label>
                      </div>
                    </FormControl>
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
                        {allTransportOptions.map((option) => (
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
            </div>

            {entryType === "trade" ? (
              <div className="grid min-w-0 gap-2.5 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="sellerCommission"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Seller commission</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={field.value ?? ""}
                          onChange={(event) => {
                            const next = String(event.target.value || "").trim();
                            field.onChange(next === "" ? undefined : Number(next));
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="buyerCommission"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Buyer commission</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={field.value ?? ""}
                          onChange={(event) => {
                            const next = String(event.target.value || "").trim();
                            field.onChange(next === "" ? undefined : Number(next));
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ) : null}

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
              <div className="mb-1 flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Tape preview</div>
                <Badge variant="outline" className="shrink-0">
                  {entryType === "bid" ? "BID IDEA" : entryType === "offer" ? "OFFER IDEA" : "TRADE IDEA"}
                </Badge>
              </div>
              <div className="break-words text-sm leading-5 text-foreground">{canonicalPreview}</div>
            </div>

            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="hidden text-[11px] leading-4 text-muted-foreground sm:block">
                Single-price compact workflow.
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                {mode === "edit" && (entryType === "bid" || entryType === "offer") ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full sm:w-auto"
                    disabled={!session.canCreateEntries || form.formState.isSubmitting}
                    onClick={onConvertEntryType}
                  >
                    {entryType === "bid" ? "Convert to OFFER" : "Convert to BID"}
                  </Button>
                ) : null}
                <Button
                  type="submit"
                  className="w-full sm:w-auto"
                  disabled={!session.canCreateEntries || form.formState.isSubmitting}
                >
                  {form.formState.isSubmitting
                    ? "Saving..."
                    : entryType === "bid"
                      ? mode === "edit"
                        ? "Save BID"
                        : "Create BID"
                      : entryType === "offer"
                        ? mode === "edit"
                          ? "Save OFFER"
                          : "Create OFFER"
                        : mode === "edit"
                          ? "Save TRADE"
                          : "Create TRADE"}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
