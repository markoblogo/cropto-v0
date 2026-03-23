import { ChevronDown, Plus, RotateCcw, Search, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  brokers,
  commodityOptions,
  countryOptions,
  getPortPlaceLabel,
  portOptions,
} from "../mock/dictionaries";
import type { FeedFilterState } from "../types";
import type { useSeaBrokerageTelegramSession } from "../hooks/useSeaBrokerageTelegramSession";

type TelegramSessionHook = ReturnType<typeof useSeaBrokerageTelegramSession>;

interface MonitorToolbarProps {
  filters: FeedFilterState;
  onFilterChange: <K extends keyof FeedFilterState>(key: K, value: FeedFilterState[K]) => void;
  onCreateBid: () => void;
  onCreateOffer: () => void;
  session: TelegramSessionHook;
  onResetDemo: () => void;
  onClearEntries: () => void;
  onReseedDemo: () => void;
  onAddSampleBid: () => void;
  onAddSampleOffer: () => void;
}

export function MonitorToolbar({
  filters,
  onFilterChange,
  onCreateBid,
  onCreateOffer,
  session,
  onResetDemo,
  onClearEntries,
  onReseedDemo,
  onAddSampleBid,
  onAddSampleOffer,
}: MonitorToolbarProps) {
  return (
    <Collapsible>
      <Card className="border-border/70 bg-card/95 px-2.5 py-1.5 shadow-sm sm:px-3 sm:py-2">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <div className="mr-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground sm:text-[11px] sm:tracking-[0.18em]">
            Sea Brokerage Monitor
          </div>
          <Button onClick={onCreateBid} size="sm" className="h-7 px-2.5 text-[11px] sm:h-8 sm:px-3 sm:text-sm">
            <Plus className="mr-1.5 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />
            Create BID
          </Button>
          <Button
            onClick={onCreateOffer}
            variant="secondary"
            size="sm"
            className="h-7 px-2.5 text-[11px] sm:h-8 sm:px-3 sm:text-sm"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />
            Create OFFER
          </Button>

          <div className="contents">
            <Select
              value={filters.commodity}
              onValueChange={(value) =>
                onFilterChange("commodity", value as FeedFilterState["commodity"])
              }
            >
              <SelectTrigger className="h-7 w-[126px] text-xs sm:h-8 sm:w-[142px]">
                <SelectValue placeholder="Commodity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All commodities</SelectItem>
                {commodityOptions.map((option) => (
                  <SelectItem key={option.code} value={option.code}>
                    {option.label}
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
              <SelectTrigger className="h-7 w-[126px] text-xs sm:h-8 sm:w-[142px]">
                <SelectValue placeholder="Origin" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All origins</SelectItem>
                {countryOptions.map((country) => (
                  <SelectItem key={country.code} value={country.code}>
                    {country.label}
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
              <SelectTrigger className="h-7 w-[118px] text-xs sm:h-8 sm:w-[142px]">
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
              <SelectTrigger className="h-7 w-[156px] text-xs sm:h-8 sm:w-[188px]">
                <SelectValue placeholder="Port / place" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All delivery places</SelectItem>
                {portOptions.map((port) => (
                  <SelectItem key={port.code} value={port.code}>
                    {getPortPlaceLabel(port.code)}
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
              <SelectTrigger className="h-7 w-[134px] text-xs sm:h-8 sm:w-[160px]">
                <SelectValue placeholder="Broker" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All brokers</SelectItem>
                {brokers.map((broker) => (
                  <SelectItem key={broker.id} value={broker.id}>
                    {broker.brokerCode} ({broker.brokerName})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative min-w-[150px] flex-1 xl:max-w-[220px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-7 pl-8 text-xs sm:h-8 sm:text-sm"
                value={filters.search}
                onChange={(event) => onFilterChange("search", event.target.value)}
                placeholder="Search market"
              />
            </div>
          </div>

          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="ml-auto h-7 px-2 text-[11px] text-muted-foreground sm:h-8 sm:text-sm">
              Tools
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </CollapsibleTrigger>

          <CollapsibleContent className="space-y-2.5 border-t border-border/60 pt-2">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Telegram Session
                </div>
                <div className="text-sm text-muted-foreground">{session.statusMessage}</div>
                {session.telegramHandle ? (
                  <div className="text-xs text-muted-foreground/80">
                    {session.telegramHandle}
                    {session.authorProfile ? ` · ${session.authorProfile.brokerCode}` : ""}
                  </div>
                ) : null}
              </div>

              {session.isDemoSelectorEnabled ? (
                <Select
                  value={session.selectedDemoBrokerId ?? "none"}
                  onValueChange={(value) =>
                    session.setSelectedDemoBrokerId(value === "none" ? null : value)
                  }
                >
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Demo Telegram author" />
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
              ) : null}
            </div>

            {session.isDemoSelectorEnabled ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" onClick={onAddSampleBid}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Sample BID
                </Button>
                <Button variant="ghost" size="sm" onClick={onAddSampleOffer}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Sample OFFER
                </Button>
                <Button variant="ghost" size="sm" onClick={onResetDemo}>
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  Reset
                </Button>
                <Button variant="ghost" size="sm" onClick={onClearEntries}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Clear
                </Button>
                <Button variant="ghost" size="sm" onClick={onReseedDemo}>
                  <Sparkles className="mr-1 h-3.5 w-3.5" />
                  Reseed
                </Button>
              </div>
            ) : null}
          </CollapsibleContent>
        </div>
      </Card>
    </Collapsible>
  );
}
