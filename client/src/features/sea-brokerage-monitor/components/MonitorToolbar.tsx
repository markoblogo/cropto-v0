import { Search } from "lucide-react";
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
  commodityOptions,
  countryOptions,
  portOptions,
} from "../mock/dictionaries";
import { getPortPlaceDisplayLabel } from "../services/displayStandards";
import type { FeedFilterState } from "../types";

interface MonitorToolbarProps {
  filters: FeedFilterState;
  onFilterChange: <K extends keyof FeedFilterState>(key: K, value: FeedFilterState[K]) => void;
  brokerOptions: Array<{ value: string; label: string }>;
}

export function MonitorToolbar({
  filters,
  onFilterChange,
  brokerOptions,
}: MonitorToolbarProps) {
  return (
    <Card className="overflow-hidden border-border/70 bg-card/95 px-1.5 py-1 shadow-sm sm:px-2.5 sm:py-1.5">
      <div className="flex min-w-0 flex-col gap-1 sm:gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1 sm:gap-1.5">
          <div className="mr-auto min-w-0 text-[8.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground sm:text-[11px] sm:tracking-[0.18em]">
            Spike Brokerage Monitor
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(220px,1.3fr)] xl:gap-1.5">
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

          <Select
            value={filters.originCountry}
            onValueChange={(value) =>
              onFilterChange("originCountry", value as FeedFilterState["originCountry"])
            }
          >
            <SelectTrigger className="h-6 min-w-0 w-full text-[10.5px] sm:h-7 sm:text-[11px]">
              <SelectValue placeholder="Origin" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All origins</SelectItem>
              {countryOptions.map((country) => (
                <SelectItem key={country.code} value={country.code}>
                  {country.displayLabel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

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
              {portOptions.map((port) => (
                <SelectItem key={port.code} value={port.code}>
                  {getPortPlaceDisplayLabel(port.code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

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

          <div className="relative min-w-0 w-full">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground sm:left-2.5 sm:h-3.5 sm:w-3.5" />
            <Input
              className="h-6 min-w-0 pr-2 pl-7 text-[10.5px] sm:h-7 sm:pr-3 sm:pl-8.5 sm:text-xs"
              value={filters.search}
              onChange={(event) => onFilterChange("search", event.target.value)}
              placeholder="Search market"
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
