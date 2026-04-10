import { ChevronDown, Save, Search, Star, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  commodityOptions as defaultCommodityOptions,
  countryOptions as defaultCountryOptions,
  currencyOptions as defaultCurrencyOptions,
  portOptions as defaultPortOptions,
} from "../mock/dictionaries";
import { getCountryDisplayLabel } from "../services/displayStandards";
import type {
  Commodity,
  CountryOption,
  Currency,
  FeedFilterState,
  PortOption,
  TransportMode,
} from "../types";

interface MonitorToolbarProps {
  filters: FeedFilterState;
  onFilterChange: <K extends keyof FeedFilterState>(key: K, value: FeedFilterState[K]) => void;
  brokerOptions: Array<{ value: string; label: string }>;
  canManagePresets?: boolean;
  presetOptions?: Array<{ value: string; label: string }>;
  activePresetId?: string | null;
  onApplyPreset?: (presetId: string) => void;
  onSavePreset?: () => void;
  onSetDefaultPreset?: () => void;
  onDeletePreset?: () => void;
  commodityOptions?: Commodity[];
  countryOptions?: CountryOption[];
  deliveryPlaceOptions?: PortOption[];
  businessUnitOptions?: Array<{ value: string; label: string }>;
  currencyOptions?: Array<{ value: Currency; label: string }>;
  transportModeOptions?: Array<{ value: TransportMode; label: string }>;
  basisOptions?: string[];
  recentOriginCountryCodes?: string[];
  recentDeliveryPlaceCodes?: string[];
  recentCurrencies?: string[];
}

export function MonitorToolbar({
  filters,
  onFilterChange,
  brokerOptions,
  canManagePresets = false,
  presetOptions = [],
  activePresetId = null,
  onApplyPreset,
  onSavePreset,
  onSetDefaultPreset,
  onDeletePreset,
  commodityOptions = defaultCommodityOptions,
  countryOptions = defaultCountryOptions,
  deliveryPlaceOptions = defaultPortOptions,
  businessUnitOptions = [],
  currencyOptions = defaultCurrencyOptions,
  transportModeOptions = [],
  basisOptions = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"],
  recentOriginCountryCodes = [],
  recentDeliveryPlaceCodes = [],
  recentCurrencies = [],
}: MonitorToolbarProps) {
  const selectedOriginCountries = new Set(
    filters.originCountries.map((value) => String(value).toLowerCase()),
  );
  const selectedBusinessUnits = new Set(filters.businessUnits.map((value) => String(value).toLowerCase()));
  const selectedCurrencies = new Set(filters.currencies.map((value) => String(value).toUpperCase()));
  const selectedTransportModes = new Set(
    filters.transportModes.map((value) => String(value).toLowerCase()),
  );
  const [originSearch, setOriginSearch] = useState("");
  const [deliveryPlaceSearch, setDeliveryPlaceSearch] = useState("");
  const [currencySearch, setCurrencySearch] = useState("");

  function renderMultiLabel(baseLabel: string, selectedCount: number) {
    if (selectedCount <= 0) return `All ${baseLabel}`;
    if (selectedCount === 1) return `1 ${baseLabel.slice(0, -1)}`;
    return `${selectedCount} ${baseLabel}`;
  }

  const compactFilterTriggerClass =
    "flex h-6 w-full min-w-0 items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-[10.5px] font-normal text-foreground ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:h-7 sm:text-[11px]";

  const countryByCode = useMemo(() => {
    const map = new Map<string, CountryOption>();
    for (const option of countryOptions) {
      map.set(String(option.code || "").toLowerCase(), option);
    }
    return map;
  }, [countryOptions]);

  const recentOriginOptions = useMemo(() => {
    const list: CountryOption[] = [];
    const seen = new Set<string>();
    for (const code of recentOriginCountryCodes) {
      const key = String(code || "").toLowerCase();
      if (!key || seen.has(key)) continue;
      const option = countryByCode.get(key);
      if (!option) continue;
      seen.add(key);
      list.push(option);
    }
    return list;
  }, [recentOriginCountryCodes, countryByCode]);

  const visibleOriginOptions = useMemo(() => {
    const query = originSearch.trim().toLowerCase();
    if (!query) {
      const selectedOptions = countryOptions.filter((option) =>
        selectedOriginCountries.has(String(option.code || "").toLowerCase()),
      );
      const merged = [...recentOriginOptions, ...selectedOptions];
      const seen = new Set<string>();
      return merged.filter((option) => {
        const key = String(option.code || "").toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    return countryOptions.filter((option) => {
      const label = String(option.displayLabel || "").toLowerCase();
      const code = String(option.code || "").toLowerCase();
      return label.includes(query) || code.includes(query);
    });
  }, [originSearch, countryOptions, selectedOriginCountries, recentOriginOptions]);

  const deliveryByCode = useMemo(() => {
    const map = new Map<string, PortOption>();
    for (const option of deliveryPlaceOptions) {
      map.set(option.code, option);
    }
    return map;
  }, [deliveryPlaceOptions]);

  const recentDeliveryOptions = useMemo(() => {
    const list: PortOption[] = [];
    const seen = new Set<string>();
    for (const code of recentDeliveryPlaceCodes) {
      const key = String(code || "").trim();
      if (!key || seen.has(key)) continue;
      const option = deliveryByCode.get(key);
      if (!option) continue;
      seen.add(key);
      list.push(option);
    }
    return list;
  }, [recentDeliveryPlaceCodes, deliveryByCode]);

  const visibleDeliveryOptions = useMemo(() => {
    const query = deliveryPlaceSearch.trim().toLowerCase();
    if (!query) {
      if (filters.deliveryPlace !== "all") {
        const selected = deliveryPlaceOptions.find((item) => item.code === filters.deliveryPlace);
        if (selected) {
          return [
            selected,
            ...recentDeliveryOptions.filter((item) => item.code !== selected.code),
          ];
        }
      }
      return recentDeliveryOptions;
    }
    return deliveryPlaceOptions.filter((option) => {
      const label = String(option.displayLabel || "").toLowerCase();
      const code = String(option.code || "").toLowerCase();
      const country = getCountryDisplayLabel(option.countryCode).toLowerCase();
      return label.includes(query) || code.includes(query) || country.includes(query);
    });
  }, [deliveryPlaceSearch, deliveryPlaceOptions, filters.deliveryPlace, recentDeliveryOptions]);

  const currencyByCode = useMemo(() => {
    const map = new Map<string, { value: Currency; label: string }>();
    for (const option of currencyOptions) {
      map.set(String(option.value || "").toUpperCase(), option);
    }
    return map;
  }, [currencyOptions]);

  const recentCurrencyOptions = useMemo(() => {
    const list: Array<{ value: Currency; label: string }> = [];
    const seen = new Set<string>();
    for (const value of recentCurrencies) {
      const key = String(value || "").toUpperCase();
      if (!key || seen.has(key)) continue;
      const option = currencyByCode.get(key);
      if (!option) continue;
      seen.add(key);
      list.push(option);
    }
    return list;
  }, [recentCurrencies, currencyByCode]);

  const visibleCurrencyOptions = useMemo(() => {
    const query = currencySearch.trim().toLowerCase();
    if (!query) {
      const selectedOptions = currencyOptions.filter((option) =>
        selectedCurrencies.has(String(option.value || "").toUpperCase()),
      );
      const merged = [...recentCurrencyOptions, ...selectedOptions];
      const seen = new Set<string>();
      return merged.filter((option) => {
        const key = String(option.value || "").toUpperCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    return currencyOptions.filter((option) => {
      const label = String(option.label || "").toLowerCase();
      const code = String(option.value || "").toLowerCase();
      return label.includes(query) || code.includes(query);
    });
  }, [currencySearch, currencyOptions, selectedCurrencies, recentCurrencyOptions]);

  return (
    <Card className="overflow-hidden border-border/70 bg-card/95 px-1.5 py-1 shadow-sm sm:px-2.5 sm:py-1.5">
      <div className="flex min-w-0 flex-col gap-1 sm:gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1 sm:gap-1.5">
          <div className="mr-auto min-w-0 text-[8.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground sm:text-[11px] sm:tracking-[0.18em]">
            Spike Brokerage Monitor
          </div>
          <div className="relative min-w-[200px] flex-1 max-w-[360px]">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground sm:left-2.5 sm:h-3.5 sm:w-3.5" />
            <Input
              className="h-6 min-w-0 pr-2 pl-7 text-[10.5px] sm:h-7 sm:pr-3 sm:pl-8.5 sm:text-xs"
              value={filters.search}
              onChange={(event) => onFilterChange("search", event.target.value)}
              placeholder="Search market"
            />
          </div>
          {canManagePresets ? (
            <div className="flex min-w-0 items-center gap-1">
              <Select
                value={activePresetId ?? "none"}
                onValueChange={(value) => {
                  if (value !== "none") onApplyPreset?.(value);
                }}
              >
                <SelectTrigger className="h-6 min-w-[152px] text-[10px] sm:h-7 sm:text-[11px]">
                  <SelectValue placeholder="Views" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Views</SelectItem>
                  {presetOptions.map((preset) => (
                    <SelectItem key={preset.value} value={preset.value}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="sm" className="h-6 px-1.5 sm:h-7" onClick={onSavePreset}>
                <Save className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-1.5 sm:h-7"
                onClick={onSetDefaultPreset}
                disabled={!activePresetId}
              >
                <Star className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-1.5 sm:h-7"
                onClick={onDeletePreset}
                disabled={!activePresetId}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : null}
        </div>

        <div className="grid min-w-0 grid-cols-1 items-stretch gap-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.85fr)_minmax(0,1fr)_minmax(0,0.95fr)_minmax(0,0.95fr)_minmax(0,1.05fr)_minmax(0,1.15fr)] xl:gap-1.5">
          <Select
            value={filters.commodity}
            onValueChange={(value) =>
              onFilterChange("commodity", value as FeedFilterState["commodity"])
            }
          >
            <SelectTrigger className="h-6 min-w-0 w-full text-[10.5px] sm:h-7 sm:text-[11px]">
              <SelectValue placeholder="Commodity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All commodities</SelectItem>
              {commodityOptions.map((option) => (
                <SelectItem key={option.code} value={option.code}>
                  {option.displayLabel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={compactFilterTriggerClass}
              >
                <span className="truncate">{renderMultiLabel("origins", selectedOriginCountries.size)}</span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[280px] max-w-[90vw]">
              <div className="px-2 pb-1">
                <Input
                  value={originSearch}
                  onChange={(event) => setOriginSearch(event.target.value)}
                  placeholder="Type country"
                  className="h-7 text-xs"
                />
              </div>
              {visibleOriginOptions.map((country) => {
                const key = country.code.toLowerCase();
                return (
                  <DropdownMenuCheckboxItem
                    key={country.code}
                    checked={selectedOriginCountries.has(key)}
                    onCheckedChange={(checked) => {
                      const next = new Set(selectedOriginCountries);
                      if (checked) next.add(key);
                      else next.delete(key);
                      const values = Array.from(next);
                      onFilterChange("originCountries", values as FeedFilterState["originCountries"]);
                      onFilterChange(
                        "originCountry",
                        (values[0]?.toUpperCase() || "all") as FeedFilterState["originCountry"],
                      );
                    }}
                  >
                    {country.displayLabel}
                  </DropdownMenuCheckboxItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          <Select
            value={filters.basis}
            onValueChange={(value) =>
              onFilterChange("basis", value as FeedFilterState["basis"])
            }
          >
            <SelectTrigger className="h-6 min-w-0 w-full text-[10.5px] sm:h-7 sm:text-[11px]">
              <SelectValue placeholder="Basis" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All basis</SelectItem>
              {basisOptions.map((basis) => (
                <SelectItem key={basis} value={basis}>
                  {basis}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={compactFilterTriggerClass}
              >
                <span className="truncate">
                  {filters.deliveryPlace === "all"
                    ? "All delivery places"
                    : (() => {
                        const selected = deliveryPlaceOptions.find(
                          (option) => option.code === filters.deliveryPlace,
                        );
                        return selected
                          ? `${selected.displayLabel}, ${getCountryDisplayLabel(selected.countryCode)}`
                          : "All delivery places";
                      })()}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[320px] max-w-[92vw]">
              <div className="px-2 pb-1">
                <Input
                  value={deliveryPlaceSearch}
                  onChange={(event) => setDeliveryPlaceSearch(event.target.value)}
                  placeholder="Type delivery place"
                  className="h-7 text-xs"
                />
              </div>
              <DropdownMenuCheckboxItem
                checked={filters.deliveryPlace === "all"}
                onCheckedChange={() =>
                  onFilterChange("deliveryPlace", "all" as FeedFilterState["deliveryPlace"])
                }
              >
                All delivery places
              </DropdownMenuCheckboxItem>
              {visibleDeliveryOptions.map((port) => (
                <DropdownMenuCheckboxItem
                  key={port.code}
                  checked={filters.deliveryPlace === port.code}
                  onCheckedChange={() =>
                    onFilterChange("deliveryPlace", port.code as FeedFilterState["deliveryPlace"])
                  }
                >
                  {`${port.displayLabel}, ${getCountryDisplayLabel(port.countryCode)}`}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={compactFilterTriggerClass}
              >
                <span className="truncate">
                  {renderMultiLabel("business units", selectedBusinessUnits.size)}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[280px] max-w-[90vw]">
              {businessUnitOptions.map((option) => {
                const key = option.value.toLowerCase();
                return (
                  <DropdownMenuCheckboxItem
                    key={option.value}
                    checked={selectedBusinessUnits.has(key)}
                    onCheckedChange={(checked) => {
                      const next = new Set(selectedBusinessUnits);
                      if (checked) next.add(key);
                      else next.delete(key);
                      onFilterChange(
                        "businessUnits",
                        Array.from(next) as FeedFilterState["businessUnits"],
                      );
                    }}
                  >
                    {option.label}
                  </DropdownMenuCheckboxItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={compactFilterTriggerClass}
              >
                <span className="truncate">{renderMultiLabel("currencies", selectedCurrencies.size)}</span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[230px] max-w-[90vw]">
              <div className="px-2 pb-1">
                <Input
                  value={currencySearch}
                  onChange={(event) => setCurrencySearch(event.target.value)}
                  placeholder="Type currency"
                  className="h-7 text-xs"
                />
              </div>
              {visibleCurrencyOptions.map((currency) => {
                const key = currency.value.toUpperCase();
                return (
                  <DropdownMenuCheckboxItem
                    key={currency.value}
                    checked={selectedCurrencies.has(key)}
                    onCheckedChange={(checked) => {
                      const next = new Set(selectedCurrencies);
                      if (checked) next.add(key);
                      else next.delete(key);
                      onFilterChange(
                        "currencies",
                        Array.from(next) as FeedFilterState["currencies"],
                      );
                    }}
                  >
                    {currency.label}
                  </DropdownMenuCheckboxItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={compactFilterTriggerClass}
              >
                <span className="truncate">
                  {renderMultiLabel("transport types", selectedTransportModes.size)}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[280px] max-w-[90vw]">
              {transportModeOptions.map((option) => {
                const key = option.value.toLowerCase();
                return (
                  <DropdownMenuCheckboxItem
                    key={option.value}
                    checked={selectedTransportModes.has(key)}
                    onCheckedChange={(checked) => {
                      const next = new Set(selectedTransportModes);
                      if (checked) next.add(key);
                      else next.delete(key);
                      onFilterChange(
                        "transportModes",
                        Array.from(next) as FeedFilterState["transportModes"],
                      );
                    }}
                  >
                    {option.label}
                  </DropdownMenuCheckboxItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          <Select
            value={filters.brokerProfileId}
            onValueChange={(value) =>
              onFilterChange("brokerProfileId", value as FeedFilterState["brokerProfileId"])
            }
          >
            <SelectTrigger className="h-6 min-w-0 w-full text-[10.5px] sm:h-7 sm:text-[11px]">
              <SelectValue placeholder="Broker" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All brokers</SelectItem>
              {brokerOptions.map((broker) => (
                <SelectItem key={broker.value} value={broker.value}>
                  {broker.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

        </div>
      </div>
    </Card>
  );
}
