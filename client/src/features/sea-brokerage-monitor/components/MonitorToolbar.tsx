import { ChevronDown, Save, Search, Star, Trash2 } from "lucide-react";
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
}: MonitorToolbarProps) {
  const selectedOriginCountries = new Set(
    filters.originCountries.map((value) => String(value).toLowerCase()),
  );
  const selectedBusinessUnits = new Set(filters.businessUnits.map((value) => String(value).toLowerCase()));
  const selectedCurrencies = new Set(filters.currencies.map((value) => String(value).toUpperCase()));
  const selectedTransportModes = new Set(
    filters.transportModes.map((value) => String(value).toLowerCase()),
  );

  function renderMultiLabel(baseLabel: string, selectedCount: number) {
    if (selectedCount <= 0) return `All ${baseLabel}`;
    if (selectedCount === 1) return `1 ${baseLabel.slice(0, -1)}`;
    return `${selectedCount} ${baseLabel}`;
  }

  const compactFilterTriggerClass =
    "h-6 min-w-0 w-full justify-between rounded-md border border-input bg-background px-3 text-left text-[10.5px] font-normal text-foreground hover:bg-background sm:h-7 sm:text-[11px]";

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
              <Button
                type="button"
                variant="outline"
                className={compactFilterTriggerClass}
              >
                <span className="truncate">{renderMultiLabel("origins", selectedOriginCountries.size)}</span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[280px] max-w-[90vw]">
              {countryOptions.map((country) => {
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
              {["FOB", "CIF", "CPT", "DAP", "FCA"].map((basis) => (
                <SelectItem key={basis} value={basis}>
                  {basis}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.deliveryPlace}
            onValueChange={(value) =>
              onFilterChange("deliveryPlace", value as FeedFilterState["deliveryPlace"])
            }
          >
            <SelectTrigger className="h-6 min-w-0 w-full text-[10.5px] sm:h-7 sm:text-[11px]">
              <SelectValue placeholder="Port / place" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All delivery places</SelectItem>
              {deliveryPlaceOptions.map((port) => (
                <SelectItem key={port.code} value={port.code}>
                  {`${port.displayLabel}, ${getCountryDisplayLabel(port.countryCode)}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className={compactFilterTriggerClass}
              >
                <span className="truncate">
                  {renderMultiLabel("business units", selectedBusinessUnits.size)}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
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
              <Button
                type="button"
                variant="outline"
                className={compactFilterTriggerClass}
              >
                <span className="truncate">{renderMultiLabel("currencies", selectedCurrencies.size)}</span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[230px] max-w-[90vw]">
              {currencyOptions.map((currency) => {
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
              <Button
                type="button"
                variant="outline"
                className={compactFilterTriggerClass}
              >
                <span className="truncate">
                  {renderMultiLabel("transport types", selectedTransportModes.size)}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
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
