import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MainLayout } from "@/components/layouts/MainLayout";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ChevronDown, BarChart3 } from "lucide-react";
import { BrokerWorkspacePane, type BrokerWorkspacePaneFilters } from "./components/BrokerWorkspacePane";
import { ContextualMatchingPanel } from "./components/ContextualMatchingPanel";
import { EntryDetailSheet } from "./components/EntryDetailSheet";
import { EntryCreateDialog, type EntryCreateFormPrefill } from "./components/EntryCreateDialog";
import { MonitorToolbar } from "./components/MonitorToolbar";
import { StandardizedFeedCard } from "./components/StandardizedFeedCard";
import { BossAnalyticsView } from "./components/analytics/BossAnalyticsView";
import { useSeaBrokerageTelegramSession } from "./hooks/useSeaBrokerageTelegramSession";
import { useSeaBrokerageMonitorState } from "./hooks/useSeaBrokerageMonitorState";
import {
  commodityOptions as defaultCommodityOptions,
  countryOptions as defaultCountryOptions,
  currencyOptions as defaultCurrencyOptions,
  portOptions as defaultPortOptions,
} from "./mock/dictionaries";
import { isoCountryOptionsEn } from "./mock/isoCountryOptions.en";
import { buildSeaBrokerageMonitorAuthHeaders } from "./services/monitorAuth.service";
import {
  defaultFeedFilters,
  filterBrokerageEntries,
  mapTransportTypeToMode,
} from "./services/feedFilters.service";
import {
  businessUnitOptions,
  resolveEntryBusinessUnitCode,
} from "./services/businessUnits.service";
import type {
  BrokerageEntry,
  Commodity,
  CountryOption,
  Currency,
  EntryType,
  FeedFilterState,
  FilterPreset,
  MatchSuggestion,
  PortOption,
  TransportMode,
} from "./types";
import { apiRequest, queryClient } from "@/lib/queryClient";

const defaultPaneFilters: BrokerWorkspacePaneFilters = {
  brokerProfileId: "all",
  search: "",
};

function buildBrokerOptions(entries: BrokerageEntry[]) {
  const byBroker = new Map<string, { code: string; name: string }>();
  for (const entry of entries) {
    if (!entry.brokerId) continue;
    if (!byBroker.has(entry.brokerId)) {
      byBroker.set(entry.brokerId, {
        code: entry.brokerCode,
        name: entry.brokerName,
      });
    }
  }

  return Array.from(byBroker.entries())
    .map(([value, broker]) => ({
      value,
      label: `${broker.code} (${broker.name})`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function normalizeCommodityKey(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[,]/g, ".")
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SEA_BROKERAGE_BOSS_CODES = new Set(["OS", "VZH", "ABV", "VttL"]);
const PRIMARY_VIEW_WINDOW_DAYS = 7;

function isWithinPrimaryDisplayWindow(entry: BrokerageEntry, nowMs = Date.now()) {
  const createdAtMs = new Date(entry.createdAt).getTime();
  if (Number.isNaN(createdAtMs)) return false;
  const windowMs = PRIMARY_VIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return createdAtMs >= nowMs - windowMs;
}

export function SeaBrokerageMonitorPage() {
  const todayIso = new Date().toISOString().slice(0, 10);
  const weekAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const monitorState = useSeaBrokerageMonitorState();
  const session = useSeaBrokerageTelegramSession();
  const [createDialogType, setCreateDialogType] = useState<EntryType | null>(null);
  const [editEntry, setEditEntry] = useState<BrokerageEntry | null>(null);
  const [filters, setFilters] = useState<FeedFilterState>(defaultFeedFilters);
  const [offerPaneFilters, setOfferPaneFilters] =
    useState<BrokerWorkspacePaneFilters>(defaultPaneFilters);
  const [bidPaneFilters, setBidPaneFilters] = useState<BrokerWorkspacePaneFilters>(defaultPaneFilters);
  const [tradePaneFilters, setTradePaneFilters] = useState<BrokerWorkspacePaneFilters>(defaultPaneFilters);
  const [selectedEntry, setSelectedEntry] = useState<BrokerageEntry | null>(null);
  const [isEntryDetailOpen, setIsEntryDetailOpen] = useState(false);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [telegramAuthOpen, setTelegramAuthOpen] = useState(false);
  const [telegramUsername, setTelegramUsername] = useState("");
  const [magicLinkRequested, setMagicLinkRequested] = useState(false);
  const [isDeletingEntry, setIsDeletingEntry] = useState(false);
  const [isRepostingEntry, setIsRepostingEntry] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [bidPrefillFormValues, setBidPrefillFormValues] = useState<EntryCreateFormPrefill | null>(null);
  const [offerPrefillFormValues, setOfferPrefillFormValues] = useState<EntryCreateFormPrefill | null>(null);
  const [tradePrefillFormValues, setTradePrefillFormValues] = useState<EntryCreateFormPrefill | null>(null);
  const [reportSending, setReportSending] = useState(false);
  const [reportStatus, setReportStatus] = useState<string | null>(null);
  const [reportForm, setReportForm] = useState<{
    commodities: string[];
    basis: string[];
    deliveryPlaces: string[];
    periodStart: string;
    periodEnd: string;
    overlapDays: number;
    postedFrom: string;
    postedTo: string;
    includeBids: boolean;
    includeOffers: boolean;
  }>({
    commodities: ["corn"],
    basis: [],
    deliveryPlaces: [],
    periodStart: weekAgoIso,
    periodEnd: todayIso,
    overlapDays: 1,
    postedFrom: weekAgoIso,
    postedTo: todayIso,
    includeBids: true,
    includeOffers: true,
  });
  const defaultPresetAppliedTokenRef = useRef<string | null>(null);

  const { data: filterPresets = [] } = useQuery<FilterPreset[]>({
    queryKey: ["/api/sea-brokerage-monitor/filter-presets", session.monitorAuthToken],
    enabled: !!session.monitorAuthToken,
    queryFn: async () => {
      const response = await fetch("/api/sea-brokerage-monitor/filter-presets", {
        method: "GET",
        headers: buildSeaBrokerageMonitorAuthHeaders(session.monitorAuthToken),
      });
      if (!response.ok) return [];
      return response.json();
    },
  });
  const { data: customCountryOptions = [] } = useQuery<CountryOption[]>({
    queryKey: ["/api/sea-brokerage-monitor/countries"],
    queryFn: async () => {
      const response = await fetch("/api/sea-brokerage-monitor/countries");
      if (!response.ok) return [];
      const payload = (await response.json()) as { countries?: CountryOption[] };
      return Array.isArray(payload.countries) ? payload.countries : [];
    },
    staleTime: 60_000,
  });
  const { data: customPortOptions = [] } = useQuery<PortOption[]>({
    queryKey: ["/api/sea-brokerage-monitor/locations"],
    queryFn: async () => {
      const response = await fetch("/api/sea-brokerage-monitor/locations");
      if (!response.ok) return [];
      const payload = (await response.json()) as { locations?: PortOption[] };
      return Array.isArray(payload.locations) ? payload.locations : [];
    },
    staleTime: 60_000,
  });
  const { data: customCommodityOptions = [] } = useQuery<Commodity[]>({
    queryKey: ["/api/sea-brokerage-monitor/commodities"],
    queryFn: async () => {
      const response = await fetch("/api/sea-brokerage-monitor/commodities");
      if (!response.ok) return [];
      const payload = (await response.json()) as { commodities?: Commodity[] };
      return Array.isArray(payload.commodities) ? payload.commodities : [];
    },
    staleTime: 60_000,
  });
  const { data: sharedBasisOptions = [] } = useQuery<string[]>({
    queryKey: ["/api/sea-brokerage-monitor/basis"],
    queryFn: async () => {
      const response = await fetch("/api/sea-brokerage-monitor/basis");
      if (!response.ok) return [];
      const payload = (await response.json()) as { basis?: string[] };
      return Array.isArray(payload.basis) ? payload.basis : [];
    },
    staleTime: 60_000,
  });

  const feedWithBusinessUnits = useMemo(
    () =>
      monitorState.standardizedFeed.map((entry) => ({
        ...entry,
        businessUnitCode: resolveEntryBusinessUnitCode(entry),
      })),
    [monitorState.standardizedFeed],
  );

  const filteredEntries = useMemo(
    () => filterBrokerageEntries(feedWithBusinessUnits, filters),
    [feedWithBusinessUnits, filters],
  );

  const globalBrokerOptions = useMemo(
    () => buildBrokerOptions(feedWithBusinessUnits),
    [feedWithBusinessUnits],
  );
  const toolbarBusinessUnitOptions = useMemo(() => {
    const active = new Set(feedWithBusinessUnits.map((entry) => String(entry.businessUnitCode || "")));
    return businessUnitOptions.filter((option) => active.has(option.value));
  }, [feedWithBusinessUnits]);
  const toolbarCurrencyOptions = useMemo(
    () => defaultCurrencyOptions,
    [],
  );
  const toolbarTransportModeOptions = useMemo(() => {
    const labels: Record<TransportMode, string> = {
      land: "Land (truck/rail)",
      river: "River (barge)",
      bulk_sea: "Bulk Sea (vessel)",
      container: "Containers",
    };
    const active = new Set<TransportMode>(
      feedWithBusinessUnits.map((entry) => mapTransportTypeToMode(entry.transportType)),
    );
    return (["land", "river", "bulk_sea", "container"] as TransportMode[])
      .filter((value) => active.has(value))
      .map((value) => ({ value, label: labels[value] }));
  }, [feedWithBusinessUnits]);
  const toolbarBasisOptions = useMemo(() => {
    const values = new Set<string>(["FOB", "CIF", "CPT", "DAP", "FCA", "EXW"]);
    for (const value of sharedBasisOptions) {
      const normalized = String(value || "").trim().toUpperCase();
      if (normalized) values.add(normalized);
    }
    for (const entry of feedWithBusinessUnits) {
      const normalized = String(entry.basis || "").trim().toUpperCase();
      if (normalized) values.add(normalized);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [sharedBasisOptions, feedWithBusinessUnits]);
  const toolbarCountryOptions = useMemo(() => {
    const byCode = new Map<string, CountryOption>();
    for (const option of [...isoCountryOptionsEn, ...defaultCountryOptions, ...customCountryOptions]) {
      byCode.set(option.code, option);
    }
    return Array.from(byCode.values()).sort((a, b) => a.displayLabel.localeCompare(b.displayLabel));
  }, [customCountryOptions]);
  const toolbarDeliveryPlaceOptions = useMemo(() => {
    const byCode = new Map<string, PortOption>();
    for (const option of [...defaultPortOptions, ...customPortOptions]) {
      byCode.set(option.code, option);
    }
    return Array.from(byCode.values()).sort((a, b) => a.displayLabel.localeCompare(b.displayLabel));
  }, [customPortOptions]);
  const toolbarCommodityOptions = useMemo(() => {
    const byNormalized = new Map<string, Commodity>();
    const register = (option: Commodity) => {
      const normalizedKey =
        normalizeCommodityKey(option.displayLabel) || normalizeCommodityKey(option.code);
      if (!normalizedKey) return;
      if (!byNormalized.has(normalizedKey)) {
        byNormalized.set(normalizedKey, option);
      }
    };
    for (const option of [...defaultCommodityOptions, ...customCommodityOptions]) {
      register(option);
    }
    for (const entry of feedWithBusinessUnits) {
      const option: Commodity = {
          code: entry.commodity,
          displayLabel: entry.commodityLabel || entry.commodity,
          compactDisplay: (entry.commodityLabel || entry.commodity).toUpperCase(),
          group: "processed",
          defaultVolumeUnit: "mt",
        };
      register(option);
    }
    return Array.from(byNormalized.values()).sort((a, b) => a.displayLabel.localeCompare(b.displayLabel));
  }, [customCommodityOptions, feedWithBusinessUnits]);

  const primaryWindowEntries = useMemo(
    () => filteredEntries.filter((entry) => isWithinPrimaryDisplayWindow(entry)),
    [filteredEntries],
  );

  const offerEntriesBase = useMemo(
    () =>
      filterBrokerageEntries(primaryWindowEntries, {
        ...defaultFeedFilters,
        entryType: "offer",
      }),
    [primaryWindowEntries],
  );

  const bidEntriesBase = useMemo(
    () =>
      filterBrokerageEntries(primaryWindowEntries, {
        ...defaultFeedFilters,
        entryType: "bid",
      }),
    [primaryWindowEntries],
  );

  const tradeEntriesBase = useMemo(
    () =>
      filterBrokerageEntries(primaryWindowEntries, {
        ...defaultFeedFilters,
        entryType: "trade",
      }),
    [primaryWindowEntries],
  );

  const offerBrokerOptions = useMemo(
    () => buildBrokerOptions(offerEntriesBase),
    [offerEntriesBase],
  );

  const bidBrokerOptions = useMemo(
    () => buildBrokerOptions(bidEntriesBase),
    [bidEntriesBase],
  );

  const tradeBrokerOptions = useMemo(
    () => buildBrokerOptions(tradeEntriesBase),
    [tradeEntriesBase],
  );

  const offerEntries = useMemo(
    () =>
      filterBrokerageEntries(offerEntriesBase, {
        ...defaultFeedFilters,
        brokerProfileId: offerPaneFilters.brokerProfileId,
        search: offerPaneFilters.search,
      }),
    [offerEntriesBase, offerPaneFilters],
  );

  const bidEntries = useMemo(
    () =>
      filterBrokerageEntries(bidEntriesBase, {
        ...defaultFeedFilters,
        brokerProfileId: bidPaneFilters.brokerProfileId,
        search: bidPaneFilters.search,
      }),
    [bidEntriesBase, bidPaneFilters],
  );

  const tradeEntries = useMemo(
    () =>
      filterBrokerageEntries(tradeEntriesBase, {
        ...defaultFeedFilters,
        brokerProfileId: tradePaneFilters.brokerProfileId,
        search: tradePaneFilters.search,
      }),
    [tradeEntriesBase, tradePaneFilters],
  );

  function buildTradePrefillFromMatch(suggestion: MatchSuggestion): EntryCreateFormPrefill {
    const offer = suggestion.offerEntry;
    const bid = suggestion.bidEntry;
    const periodMonth = offer.periodStart?.slice(0, 7) || offer.periodEnd?.slice(0, 7) || "";
    const periodPreset =
      offer.periodType === "spot"
        ? "spot"
        : offer.periodType === "prompt"
          ? "prompt"
          : offer.periodType === "month"
            ? "full_month"
            : offer.periodLabel?.toUpperCase().startsWith("1H")
              ? "current_month_1h"
              : offer.periodLabel?.toUpperCase().startsWith("2H")
                ? "current_month_2h"
                : "explicit_range";

    return {
      sellerName: offer.sellerName || offer.companyName || "",
      buyerName: bid.buyerName || bid.companyName || "",
      commodity: offer.commodity,
      harvestYear: (String(offer.gradeOrSpec || "").match(/\b(20\d{2})\b/) || [])[1] || "2026",
      isNewCrop: !!offer.isNewCrop || !!bid.isNewCrop,
      originCountry: offer.originCountryCode || bid.originCountryCode || "UA",
      quantityPreset:
        offer.quantityMt === null || offer.quantityMt === undefined ? "range" : "single",
      quantityMt: offer.quantityMt ?? offer.volumeFrom ?? bid.quantityMt ?? bid.volumeFrom ?? 0,
      quantityFromMt: offer.quantityMt == null ? (offer.volumeFrom ?? undefined) : undefined,
      quantityToMt: offer.quantityMt == null ? (offer.volumeTo ?? undefined) : undefined,
      tolerancePct: offer.tolerancePct ?? bid.tolerancePct ?? 0,
      basis: offer.basis,
      destinationPortCodes:
        (offer.destinationPortCodes && offer.destinationPortCodes.length
          ? offer.destinationPortCodes
          : String(offer.destinationPortCode || "")
              .split("|")
              .map((part) => part.trim())
              .filter(Boolean)).length > 0
          ? (offer.destinationPortCodes && offer.destinationPortCodes.length
              ? offer.destinationPortCodes
              : String(offer.destinationPortCode || "")
                  .split("|")
                  .map((part) => part.trim())
                  .filter(Boolean))
          : (bid.destinationPortCodes && bid.destinationPortCodes.length
              ? bid.destinationPortCodes
              : String(bid.destinationPortCode || "")
                  .split("|")
                  .map((part) => part.trim())
                  .filter(Boolean)),
      periodPreset,
      periodMonth,
      periodStart: offer.periodStart || "",
      periodEnd: offer.periodEnd || "",
      currency: offer.currency,
      price: offer.price ?? offer.priceFrom ?? bid.price ?? bid.priceFrom ?? 0,
      paymentTerms: offer.paymentTerms || bid.paymentTerms || "CAD",
      transportType: offer.transportType,
      note: "",
    };
  }

  function buildCounterPrefillFromEntry(
    source: BrokerageEntry,
    targetType: "bid" | "offer",
  ): EntryCreateFormPrefill {
    const periodMonth = source.periodStart?.slice(0, 7) || source.periodEnd?.slice(0, 7) || "";
    const periodPreset =
      source.periodType === "spot"
        ? "spot"
        : source.periodType === "prompt"
          ? "prompt"
          : source.periodType === "month"
            ? "full_month"
            : source.periodLabel?.toUpperCase().startsWith("1H")
              ? "current_month_1h"
              : source.periodLabel?.toUpperCase().startsWith("2H")
                ? "current_month_2h"
                : "explicit_range";

    const sourcePortCodes =
      source.destinationPortCodes && source.destinationPortCodes.length
        ? source.destinationPortCodes
        : String(source.destinationPortCode || "")
            .split("|")
            .map((part) => part.trim())
            .filter(Boolean);

    const harvestYear =
      (String(source.gradeOrSpec || "").match(/\b(20\d{2})\b/) || [])[1] || "2026";

    return {
      sellerName: targetType === "offer" ? "" : source.sellerName || "",
      buyerName: targetType === "bid" ? "" : source.buyerName || "",
      commodity: source.commodity,
      harvestYear,
      isNewCrop: !!source.isNewCrop,
      originCountry: source.originCountryCode || "UA",
      quantityPreset: source.quantityMt === null || source.quantityMt === undefined ? "range" : "single",
      quantityMt: source.quantityMt ?? source.volumeFrom ?? 0,
      quantityFromMt: source.quantityMt == null ? (source.volumeFrom ?? undefined) : undefined,
      quantityToMt: source.quantityMt == null ? (source.volumeTo ?? undefined) : undefined,
      tolerancePct: source.tolerancePct ?? 0,
      basis: source.basis,
      destinationPortCodes: sourcePortCodes,
      periodPreset,
      periodMonth,
      periodStart: source.periodStart || "",
      periodEnd: source.periodEnd || "",
      currency: source.currency,
      price: source.price ?? source.priceFrom ?? source.priceTo ?? 0,
      paymentTerms: source.paymentTerms || "CAD",
      transportType: source.transportType,
      note: source.note || "",
    };
  }

  function handleOfferPaneFiltersChange(next: BrokerWorkspacePaneFilters) {
    setActivePresetId(null);
    setOfferPaneFilters(next);
  }

  function handleBidPaneFiltersChange(next: BrokerWorkspacePaneFilters) {
    setActivePresetId(null);
    setBidPaneFilters(next);
  }

  function handleTradePaneFiltersChange(next: BrokerWorkspacePaneFilters) {
    setActivePresetId(null);
    setTradePaneFilters(next);
  }

  function updateFilter<K extends keyof FeedFilterState>(key: K, value: FeedFilterState[K]) {
    setActivePresetId(null);
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function handleSelectEntry(entry: BrokerageEntry) {
    setSelectedEntry(entry);
    setIsEntryDetailOpen(true);
  }

  function isSameCalendarDay(dateIso: string) {
    const date = new Date(dateIso);
    const now = new Date();
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    );
  }

  function canManageEntry(entry: BrokerageEntry | null) {
    if (!entry || !session.authorProfile) return { canEdit: false, canDelete: false, canRepost: false };
    const brokerCode = String(session.authorProfile.brokerCode || "").toUpperCase();
    const isBoss = SEA_BROKERAGE_BOSS_CODES.has(brokerCode);
    const isAuthor =
      entry.brokerId === session.authorProfile.id ||
      String(entry.brokerCode || "").toUpperCase() === brokerCode;
    const sameDay = isSameCalendarDay(entry.createdAt);
    const canEdit = (isAuthor || isBoss) && sameDay;
    const canDelete = canEdit && sameDay;
    const canRepost = (isAuthor || isBoss) && !sameDay;
    return { canEdit, canDelete, canRepost };
  }

  function applyPreset(preset: FilterPreset) {
    setFilters((prev) => ({
      ...prev,
      commodity: (preset.filters.commodity as FeedFilterState["commodity"]) || "all",
      basis: (preset.filters.basis as FeedFilterState["basis"]) || "all",
      brokerProfileId: preset.filters.brokerProfileId || "all",
      businessUnits: (preset.filters.businessUnits || []).map((item) => String(item).toLowerCase()),
      originCountries: (preset.filters.originCountries || []).map((item) => String(item).toLowerCase()),
      currencies: (preset.filters.currencies || []).map((item) => String(item).toUpperCase()) as Currency[],
      transportModes: (preset.filters.transportModes || []).map((item) =>
        String(item).toLowerCase(),
      ) as TransportMode[],
      originCountry: preset.filters.originCountry || "all",
      deliveryPlace: preset.filters.deliveryPlace || "all",
      search: preset.filters.search || "",
    }));
    setOfferPaneFilters({
      brokerProfileId: preset.offerPaneFilters.brokerProfileId || "all",
      search: preset.offerPaneFilters.search || "",
    });
    setBidPaneFilters({
      brokerProfileId: preset.bidPaneFilters.brokerProfileId || "all",
      search: preset.bidPaneFilters.search || "",
    });
    setTradePaneFilters({
      brokerProfileId: preset.tradePaneFilters.brokerProfileId || "all",
      search: preset.tradePaneFilters.search || "",
    });
    setActivePresetId(preset.id);
  }

  async function handleSavePreset() {
    if (!session.monitorAuthToken) {
      setTelegramAuthOpen(true);
      return;
    }
    const name = window.prompt("View name", "My view");
    if (!name || !name.trim()) return;
    await fetch("/api/sea-brokerage-monitor/filter-presets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildSeaBrokerageMonitorAuthHeaders(session.monitorAuthToken),
      },
      body: JSON.stringify({
        name: name.trim(),
        isDefault: false,
        filters: {
          commodity: filters.commodity,
          basis: filters.basis,
          brokerProfileId: filters.brokerProfileId,
          businessUnits: filters.businessUnits,
          originCountries: filters.originCountries,
          currencies: filters.currencies,
          transportModes: filters.transportModes,
          originCountry: filters.originCountry,
          deliveryPlace: filters.deliveryPlace,
          search: filters.search,
        },
        offerPaneFilters,
        bidPaneFilters,
        tradePaneFilters,
      }),
    });
    await queryClient.invalidateQueries({
      queryKey: ["/api/sea-brokerage-monitor/filter-presets", session.monitorAuthToken],
    });
  }

  async function handleSetDefaultPreset() {
    if (!session.monitorAuthToken || !activePresetId) return;
    await fetch(`/api/sea-brokerage-monitor/filter-presets/${activePresetId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...buildSeaBrokerageMonitorAuthHeaders(session.monitorAuthToken),
      },
      body: JSON.stringify({ isDefault: true }),
    });
    await queryClient.invalidateQueries({
      queryKey: ["/api/sea-brokerage-monitor/filter-presets", session.monitorAuthToken],
    });
  }

  async function handleDeletePreset() {
    if (!session.monitorAuthToken || !activePresetId) return;
    await fetch(`/api/sea-brokerage-monitor/filter-presets/${activePresetId}`, {
      method: "DELETE",
      headers: buildSeaBrokerageMonitorAuthHeaders(session.monitorAuthToken),
    });
    setActivePresetId(null);
    await queryClient.invalidateQueries({
      queryKey: ["/api/sea-brokerage-monitor/filter-presets", session.monitorAuthToken],
    });
  }

  async function handleToggleLike(entry: BrokerageEntry) {
    if (entry.type !== "bid" && entry.type !== "offer") {
      return;
    }
    if (!session.canCreateEntries) {
      setTelegramAuthOpen(true);
      return;
    }

    try {
      await fetch(`/api/sea-brokerage-monitor/entries/${entry.id}/likes/toggle`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildSeaBrokerageMonitorAuthHeaders(session.monitorAuthToken),
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/sea-brokerage-monitor/entries"] });
    } catch {
      // Ignore transient like errors in UI to keep tape interactions fast.
    }
  }

  async function handleDeleteEntry(entry: BrokerageEntry) {
    if (!session.monitorAuthToken) {
      setTelegramAuthOpen(true);
      return;
    }
    if (!window.confirm("Delete this entry? Deletion is allowed only on publication day.")) {
      return;
    }
    try {
      setIsDeletingEntry(true);
      await apiRequest("DELETE", `/api/sea-brokerage-monitor/entries/${entry.id}`, undefined, {
        headers: buildSeaBrokerageMonitorAuthHeaders(session.monitorAuthToken),
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/sea-brokerage-monitor/entries"] });
      setIsEntryDetailOpen(false);
      setSelectedEntry(null);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Failed to delete entry");
    } finally {
      setIsDeletingEntry(false);
    }
  }

  async function handleRepostEntry(entry: BrokerageEntry) {
    if (!session.monitorAuthToken) {
      setTelegramAuthOpen(true);
      return;
    }
    if (!window.confirm("Repost this entry as a new publication now?")) {
      return;
    }
    try {
      setIsRepostingEntry(true);
      await apiRequest("POST", `/api/sea-brokerage-monitor/entries/${entry.id}/repost`, undefined, {
        headers: buildSeaBrokerageMonitorAuthHeaders(session.monitorAuthToken),
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/sea-brokerage-monitor/entries"] });
      setIsEntryDetailOpen(false);
      setSelectedEntry(null);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Failed to repost entry");
    } finally {
      setIsRepostingEntry(false);
    }
  }

  useEffect(() => {
    if (!selectedEntry) {
      return;
    }

    const visibleEntryIds = new Set([...offerEntries, ...bidEntries, ...tradeEntries].map((entry) => entry.id));
    if (!visibleEntryIds.has(selectedEntry.id)) {
      setSelectedEntry(null);
      setIsEntryDetailOpen(false);
    }
  }, [bidEntries, offerEntries, selectedEntry, tradeEntries]);

  useEffect(() => {
    if (!editEntry) return;
    const visibleEntry = [...offerEntries, ...bidEntries, ...tradeEntries].find(
      (entry) => entry.id === editEntry.id,
    );
    if (!visibleEntry) {
      setEditEntry(null);
      return;
    }
    setEditEntry(visibleEntry);
  }, [bidEntries, editEntry, offerEntries, tradeEntries]);

  useEffect(() => {
    function handleOpenTelegramAuth() {
      setTelegramAuthOpen(true);
    }

    function handleLogoutTelegramAuth() {
      session.logoutTelegramSession();
      setTelegramAuthOpen(false);
    }

    window.addEventListener("sea-brokerage:open-telegram-auth", handleOpenTelegramAuth);
    window.addEventListener("sea-brokerage:logout-telegram-auth", handleLogoutTelegramAuth);
    return () => {
      window.removeEventListener("sea-brokerage:open-telegram-auth", handleOpenTelegramAuth);
      window.removeEventListener("sea-brokerage:logout-telegram-auth", handleLogoutTelegramAuth);
    };
  }, [session]);

  useEffect(() => {
    if (
      filters.brokerProfileId !== "all" &&
      !globalBrokerOptions.some((option) => option.value === filters.brokerProfileId)
    ) {
      setFilters((prev) => ({ ...prev, brokerProfileId: "all" }));
    }
  }, [filters.brokerProfileId, globalBrokerOptions]);

  useEffect(() => {
    const validBusinessUnits = new Set(toolbarBusinessUnitOptions.map((option) => option.value.toLowerCase()));
    const validCurrencies = new Set(
      toolbarCurrencyOptions.map((option) => option.value.toUpperCase()),
    );
    const validTransportModes = new Set(toolbarTransportModeOptions.map((option) => option.value.toLowerCase()));
    const validOrigins = new Set(toolbarCountryOptions.map((option) => option.code.toLowerCase()));

    setFilters((prev) => {
      const nextBusinessUnits = prev.businessUnits.filter((value) => validBusinessUnits.has(value.toLowerCase()));
      const nextCurrencies = prev.currencies.filter((value) => validCurrencies.has(value.toUpperCase()));
      const nextTransportModes = prev.transportModes.filter((value) =>
        validTransportModes.has(value.toLowerCase()),
      );
      const nextOrigins = prev.originCountries.filter((value) => validOrigins.has(value.toLowerCase()));

      if (
        nextBusinessUnits.length === prev.businessUnits.length &&
        nextCurrencies.length === prev.currencies.length &&
        nextTransportModes.length === prev.transportModes.length &&
        nextOrigins.length === prev.originCountries.length
      ) {
        return prev;
      }

      return {
        ...prev,
        businessUnits: nextBusinessUnits,
        currencies: nextCurrencies,
        transportModes: nextTransportModes as FeedFilterState["transportModes"],
        originCountries: nextOrigins,
      };
    });
  }, [toolbarBusinessUnitOptions, toolbarCountryOptions, toolbarCurrencyOptions, toolbarTransportModeOptions]);

  useEffect(() => {
    if (
      offerPaneFilters.brokerProfileId !== "all" &&
      !offerBrokerOptions.some((option) => option.value === offerPaneFilters.brokerProfileId)
    ) {
      setOfferPaneFilters((prev) => ({ ...prev, brokerProfileId: "all" }));
    }
  }, [offerBrokerOptions, offerPaneFilters.brokerProfileId]);

  useEffect(() => {
    if (
      bidPaneFilters.brokerProfileId !== "all" &&
      !bidBrokerOptions.some((option) => option.value === bidPaneFilters.brokerProfileId)
    ) {
      setBidPaneFilters((prev) => ({ ...prev, brokerProfileId: "all" }));
    }
  }, [bidBrokerOptions, bidPaneFilters.brokerProfileId]);

  useEffect(() => {
    if (
      tradePaneFilters.brokerProfileId !== "all" &&
      !tradeBrokerOptions.some((option) => option.value === tradePaneFilters.brokerProfileId)
    ) {
      setTradePaneFilters((prev) => ({ ...prev, brokerProfileId: "all" }));
    }
  }, [tradeBrokerOptions, tradePaneFilters.brokerProfileId]);

  useEffect(() => {
    if (session.monitorAuthToken && telegramAuthOpen) {
      setTelegramAuthOpen(false);
      setTelegramUsername("");
      setMagicLinkRequested(false);
    }
  }, [session.monitorAuthToken, telegramAuthOpen]);

  useEffect(() => {
    if (!session.monitorAuthToken) {
      defaultPresetAppliedTokenRef.current = null;
      setActivePresetId(null);
      return;
    }
    if (defaultPresetAppliedTokenRef.current === session.monitorAuthToken) {
      return;
    }
    const defaultPreset = filterPresets.find((preset) => preset.isDefault);
    if (defaultPreset) {
      applyPreset(defaultPreset);
    }
    defaultPresetAppliedTokenRef.current = session.monitorAuthToken;
  }, [filterPresets, session.monitorAuthToken]);

  async function handleRequestTelegramMagicLink() {
    const normalized = telegramUsername.trim().replace(/^@+/, "");
    if (!normalized) return;
    await session.requestTelegramMagicLinkLogin(normalized);
    setMagicLinkRequested(true);
  }

  function toggleReportBasis(value: string) {
    setReportForm((prev) => {
      const exists = prev.basis.includes(value);
      return {
        ...prev,
        basis: exists ? prev.basis.filter((item) => item !== value) : [...prev.basis, value],
      };
    });
  }

  function toggleReportCommodity(value: string) {
    setReportForm((prev) => {
      const exists = prev.commodities.includes(value);
      return {
        ...prev,
        commodities: exists
          ? prev.commodities.filter((item) => item !== value)
          : [...prev.commodities, value],
      };
    });
  }

  function toggleReportDeliveryPlace(value: string) {
    setReportForm((prev) => {
      const exists = prev.deliveryPlaces.includes(value);
      return {
        ...prev,
        deliveryPlaces: exists
          ? prev.deliveryPlaces.filter((item) => item !== value)
          : [...prev.deliveryPlaces, value],
      };
    });
  }

  async function handleSendReport() {
    if (!session.monitorAuthToken) {
      setReportOpen(false);
      setTelegramAuthOpen(true);
      return;
    }
    if (!reportForm.postedFrom || !reportForm.postedTo || !reportForm.periodStart || !reportForm.periodEnd) {
      setReportStatus("Please set all date ranges (posted and period).");
      return;
    }
    const sortedPostedFrom = reportForm.postedFrom <= reportForm.postedTo ? reportForm.postedFrom : reportForm.postedTo;
    const sortedPostedTo = reportForm.postedFrom <= reportForm.postedTo ? reportForm.postedTo : reportForm.postedFrom;
    const sortedPeriodStart = reportForm.periodStart <= reportForm.periodEnd ? reportForm.periodStart : reportForm.periodEnd;
    const sortedPeriodEnd = reportForm.periodStart <= reportForm.periodEnd ? reportForm.periodEnd : reportForm.periodStart;
    const payload = {
      ...reportForm,
      postedFrom: sortedPostedFrom,
      postedTo: sortedPostedTo,
      periodStart: sortedPeriodStart,
      periodEnd: sortedPeriodEnd,
      commodities: Array.from(new Set(reportForm.commodities)),
    };
    setReportStatus(null);
    setReportSending(true);
    try {
      const response = await apiRequest("POST", "/api/sea-brokerage-monitor/report/send", payload, {
        headers: {
          "Content-Type": "application/json",
          ...buildSeaBrokerageMonitorAuthHeaders(session.monitorAuthToken),
        },
      });
      const responsePayload = (await response.json()) as {
        matchedEntries: number;
        offers: number;
        bids: number;
        sentChunks: number;
      };
      setReportStatus(
        `Report sent in Telegram: ${responsePayload.matchedEntries} entries (offers ${responsePayload.offers}, bids ${responsePayload.bids}), ${responsePayload.sentChunks} message(s).`,
      );
    } catch (error) {
      setReportStatus(error instanceof Error ? error.message : "Failed to send report");
    } finally {
      setReportSending(false);
    }
  }

  return (
    <MainLayout>
      <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-0.5 overflow-x-hidden pb-1 sm:gap-1">
        <MonitorToolbar
          filters={filters}
          onFilterChange={updateFilter}
          brokerOptions={globalBrokerOptions}
          businessUnitOptions={toolbarBusinessUnitOptions}
          currencyOptions={toolbarCurrencyOptions}
          transportModeOptions={toolbarTransportModeOptions}
          basisOptions={toolbarBasisOptions}
          commodityOptions={toolbarCommodityOptions}
          countryOptions={toolbarCountryOptions}
          deliveryPlaceOptions={toolbarDeliveryPlaceOptions}
          canManagePresets={session.canCreateEntries}
          presetOptions={filterPresets.map((preset) => ({
            value: preset.id,
            label: `${preset.isDefault ? "★ " : ""}${preset.name}`,
          }))}
          activePresetId={activePresetId}
          onApplyPreset={(presetId) => {
            const preset = filterPresets.find((item) => item.id === presetId);
            if (!preset) return;
            applyPreset(preset);
          }}
          onSavePreset={() => void handleSavePreset()}
          onSetDefaultPreset={() => void handleSetDefaultPreset()}
          onDeletePreset={() => void handleDeletePreset()}
        />

        <section className="grid min-w-0 gap-0.5 overflow-hidden xl:grid-cols-2 sm:gap-1">
          <BrokerWorkspacePane
            title="Offers"
            emptyTitle="No visible offers"
            emptyDescription="Adjust the offer-side filters or create a new OFFER."
            entries={offerEntries}
            brokerOptions={offerBrokerOptions}
            selectedEntryId={selectedEntry?.type === "offer" ? selectedEntry.id : null}
            onSelectEntry={handleSelectEntry}
            filters={offerPaneFilters}
            onFiltersChange={handleOfferPaneFiltersChange}
            likesEnabled
            onToggleLike={handleToggleLike}
            currentBrokerId={session.authorProfile?.id ?? null}
            currentBrokerCode={session.authorProfile?.brokerCode ?? null}
            createActionLabel="Create OFFER"
            createActionVariant="secondary"
            onCreateAction={() => {
              setOfferPrefillFormValues(null);
              setCreateDialogType("offer");
            }}
            onCounterEntry={(entry) => {
              setBidPrefillFormValues(buildCounterPrefillFromEntry(entry, "bid"));
              setCreateDialogType("bid");
            }}
          />
          <BrokerWorkspacePane
            title="Bids"
            emptyTitle="No visible bids"
            emptyDescription="Adjust the bid-side filters or create a new BID."
            entries={bidEntries}
            brokerOptions={bidBrokerOptions}
            selectedEntryId={selectedEntry?.type === "bid" ? selectedEntry.id : null}
            onSelectEntry={handleSelectEntry}
            filters={bidPaneFilters}
            onFiltersChange={handleBidPaneFiltersChange}
            likesEnabled
            onToggleLike={handleToggleLike}
            currentBrokerId={session.authorProfile?.id ?? null}
            currentBrokerCode={session.authorProfile?.brokerCode ?? null}
            createActionLabel="Create BID"
            onCreateAction={() => {
              setBidPrefillFormValues(null);
              setCreateDialogType("bid");
            }}
            onCounterEntry={(entry) => {
              setOfferPrefillFormValues(buildCounterPrefillFromEntry(entry, "offer"));
              setCreateDialogType("offer");
            }}
          />
        </section>

        <section className="grid min-w-0 gap-0.5 overflow-hidden xl:grid-cols-2 sm:gap-1">
          <ContextualMatchingPanel
            entries={primaryWindowEntries}
            selectedEntry={selectedEntry}
            monitorAuthToken={session.monitorAuthToken}
            canLikeMatches={session.canCreateEntries}
            currentBrokerCode={session.authorProfile?.brokerCode ?? null}
            onRequireAuth={() => setTelegramAuthOpen(true)}
            onCreateTradeFromMatch={(suggestion) => {
              setTradePrefillFormValues(buildTradePrefillFromMatch(suggestion));
              setCreateDialogType("trade");
            }}
          />
          <BrokerWorkspacePane
            title="Trades"
            emptyTitle="No visible trades"
            emptyDescription="Create a new TRADE or adjust trade-side filters."
            entries={tradeEntries}
            brokerOptions={tradeBrokerOptions}
            selectedEntryId={selectedEntry?.type === "trade" ? selectedEntry.id : null}
            onSelectEntry={handleSelectEntry}
            filters={tradePaneFilters}
            onFiltersChange={handleTradePaneFiltersChange}
            likesEnabled={false}
            createActionLabel="Create TRADE"
            createActionVariant="default"
            createActionClassName="bg-teal-500/85 text-white hover:bg-teal-400 border border-teal-300/70"
            onCreateAction={() => {
              setTradePrefillFormValues(null);
              setCreateDialogType("trade");
            }}
          />
        </section>

        <Collapsible>
          <div className="flex items-center justify-end gap-2">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 text-[10.5px] text-muted-foreground sm:h-6.5 sm:text-xs">
                Secondary Views
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent>
            <StandardizedFeedCard
              entries={filteredEntries}
              onSelectEntry={handleSelectEntry}
              onOpenReport={() => {
                setReportOpen(true);
                setReportStatus(null);
              }}
            />
          </CollapsibleContent>
        </Collapsible>

        {session.authorProfile &&
          SEA_BROKERAGE_BOSS_CODES.has(String(session.authorProfile.brokerCode || "").toUpperCase()) && (
  <Collapsible className="mt-2 sm:mt-4">
    <div className="flex items-center justify-end gap-2 px-1 sm:px-0">
      <CollapsibleTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 border-purple-500/40 bg-purple-500/10 text-[10.5px] font-semibold uppercase tracking-wider text-purple-300 hover:bg-purple-500/20 hover:text-purple-200 sm:h-8 sm:text-xs"
        >
          <BarChart3 className="mr-2 h-3.5 w-3.5" />
          Boss Analytics Dashboard
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </CollapsibleTrigger>
    </div>
    <CollapsibleContent className="mt-2">
      <div className="rounded-xl border border-purple-500/30 bg-card/80 p-1.5 shadow-2xl backdrop-blur-sm sm:p-4">
        <BossAnalyticsView monitorAuthToken={session.monitorAuthToken} />
      </div>
    </CollapsibleContent>
  </Collapsible>
          )}
      </div>

      <EntryCreateDialog
        open={createDialogType === "bid"}
        onOpenChange={(open) => {
          if (!open) {
            setCreateDialogType(null);
            setBidPrefillFormValues(null);
          }
        }}
        entryType="bid"
        session={session}
        initialFormValues={bidPrefillFormValues}
      />
      <EntryCreateDialog
        open={createDialogType === "offer"}
        onOpenChange={(open) => {
          if (!open) {
            setCreateDialogType(null);
            setOfferPrefillFormValues(null);
          }
        }}
        entryType="offer"
        session={session}
        initialFormValues={offerPrefillFormValues}
      />
      <EntryCreateDialog
        open={createDialogType === "trade"}
        onOpenChange={(open) => {
          if (!open) {
            setCreateDialogType(null);
            setTradePrefillFormValues(null);
          }
        }}
        entryType="trade"
        session={session}
        initialFormValues={tradePrefillFormValues}
      />
      <EntryCreateDialog
        open={!!editEntry}
        onOpenChange={(open) => {
          if (!open) setEditEntry(null);
        }}
        entryType={(editEntry?.type || "bid") as EntryType}
        session={session}
        mode="edit"
        initialEntry={editEntry}
        onSubmitted={(updated) => {
          setSelectedEntry(updated);
          setIsEntryDetailOpen(true);
        }}
      />

      <EntryDetailSheet
        entry={selectedEntry}
        open={isEntryDetailOpen && !!selectedEntry}
        onOpenChange={(open) => {
          setIsEntryDetailOpen(open);
        }}
        canEdit={canManageEntry(selectedEntry).canEdit}
        canDelete={canManageEntry(selectedEntry).canDelete}
        canRepost={canManageEntry(selectedEntry).canRepost}
        isDeleting={isDeletingEntry}
        isReposting={isRepostingEntry}
        onEdit={(entry) => {
          setEditEntry(entry);
          setIsEntryDetailOpen(false);
        }}
        onDelete={(entry) => void handleDeleteEntry(entry)}
        onRepost={(entry) => void handleRepostEntry(entry)}
      />

      <Dialog open={telegramAuthOpen} onOpenChange={setTelegramAuthOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Telegram Sign-in</DialogTitle>
            <DialogDescription>
              Sign in with Telegram to create BID/OFFER entries in Sea Brokerage Monitor.
            </DialogDescription>
          </DialogHeader>

          {session.monitorAuthToken && session.telegramHandle ? (
            <div className="space-y-2">
              <div className="rounded-md border border-emerald-300/70 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                Authorized as {session.telegramHandle}
                {session.authorProfile ? ` · ${session.authorProfile.brokerCode}` : ""}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  session.logoutTelegramSession();
                }}
              >
                Sign out Telegram
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-md border border-border/70 p-3">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Sign in via Telegram link
                </div>
                <div className="space-y-2">
                  <Input
                    value={telegramUsername}
                    onChange={(event) => setTelegramUsername(event.target.value)}
                    placeholder="@username"
                  />
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => void handleRequestTelegramMagicLink()}
                    disabled={session.isLoading || !telegramUsername.trim()}
                  >
                    Send sign-in link in Telegram
                  </Button>
                  {magicLinkRequested ? (
                    <div className="text-[11px] text-muted-foreground">
                      Link sent in Telegram DM. Open it from Telegram to complete sign-in automatically.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          {session.authError ? (
            <div className="rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {session.authError}
            </div>
          ) : null}
          {session.isLoading ? (
            <div className="text-xs text-muted-foreground">Authorizing Telegram session...</div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Report</DialogTitle>
            <DialogDescription>
              Personal price digest by filters. Report will be sent to your Telegram DM.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            Posted range = when BID/OFFER was published. Period range = shipment/delivery window inside entries.
          </div>
          <div className="rounded-md border border-border/70 p-3">
            <div className="mb-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">Commodities</div>
            <div className="grid max-h-36 gap-2 overflow-auto pr-1 sm:grid-cols-2">
              {toolbarCommodityOptions.map((option) => (
                <label key={option.code} className="inline-flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={reportForm.commodities.includes(option.code)}
                    onCheckedChange={() => toggleReportCommodity(option.code)}
                  />
                  {option.displayLabel}
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Posted from</div>
              <Input
                type="date"
                value={reportForm.postedFrom}
                onChange={(event) => setReportForm((prev) => ({ ...prev, postedFrom: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Posted to</div>
              <Input
                type="date"
                value={reportForm.postedTo}
                onChange={(event) => setReportForm((prev) => ({ ...prev, postedTo: event.target.value }))}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-1">
              <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Period from</div>
              <Input
                type="date"
                value={reportForm.periodStart}
                onChange={(event) => setReportForm((prev) => ({ ...prev, periodStart: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-1">
              <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Period to</div>
              <Input
                type="date"
                value={reportForm.periodEnd}
                onChange={(event) => setReportForm((prev) => ({ ...prev, periodEnd: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-1">
              <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Overlap</div>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={String(reportForm.overlapDays)}
                onChange={(event) =>
                  setReportForm((prev) => ({ ...prev, overlapDays: Number(event.target.value) || 1 }))
                }
              >
                <option value="1">1+ day</option>
                <option value="5">5+ days</option>
                <option value="10">10+ days</option>
                <option value="15">15+ days</option>
              </select>
            </div>
            <div className="flex items-end gap-4 pb-1 sm:col-span-1">
              <label className="inline-flex items-center gap-2 text-sm">
                <Checkbox
                  checked={reportForm.includeOffers}
                  onCheckedChange={(checked) =>
                    setReportForm((prev) => ({ ...prev, includeOffers: checked === true }))
                  }
                />
                Offers
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <Checkbox
                  checked={reportForm.includeBids}
                  onCheckedChange={(checked) =>
                    setReportForm((prev) => ({ ...prev, includeBids: checked === true }))
                  }
                />
                Bids
              </label>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-border/70 p-3">
              <div className="mb-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">Basis</div>
              <div className="grid max-h-36 gap-2 overflow-auto pr-1">
                {toolbarBasisOptions.map((basis) => (
                  <label key={basis} className="inline-flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={reportForm.basis.includes(basis)}
                      onCheckedChange={() => toggleReportBasis(basis)}
                    />
                    {basis}
                  </label>
                ))}
              </div>
            </div>
            <div className="rounded-md border border-border/70 p-3">
              <div className="mb-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">Delivery places</div>
              <div className="grid max-h-36 gap-2 overflow-auto pr-1">
                {toolbarDeliveryPlaceOptions.slice(0, 60).map((port) => (
                  <label key={port.code} className="inline-flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={reportForm.deliveryPlaces.includes(port.code)}
                      onCheckedChange={() => toggleReportDeliveryPlace(port.code)}
                    />
                    {port.displayLabel}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {reportStatus ? (
            <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-sm">
              {reportStatus}
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setReportOpen(false)}>
              Close
            </Button>
            <Button type="button" onClick={() => void handleSendReport()} disabled={reportSending}>
              {reportSending ? "Sending..." : "Send report to Telegram"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
