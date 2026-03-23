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
import { brokers, commodityOptions, countryOptions, portOptions } from "../mock/dictionaries";
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
      <Card className="border-border/70 bg-card/95 px-3 py-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Sea Brokerage Monitor
          </div>
          <Button onClick={onCreateBid} size="sm" className="h-8">
            <Plus className="mr-2 h-4 w-4" />
            Create BID
          </Button>
          <Button
            onClick={onCreateOffer}
            variant="secondary"
            size="sm"
            className="h-8"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create OFFER
          </Button>

          <div className="contents">
            <Select
              value={filters.commodity}
              onValueChange={(value) =>
                onFilterChange("commodity", value as FeedFilterState["commodity"])
              }
            >
              <SelectTrigger className="h-8 w-[142px]">
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
              value={filters.destinationCountry}
              onValueChange={(value) =>
                onFilterChange("destinationCountry", value as FeedFilterState["destinationCountry"])
              }
            >
              <SelectTrigger className="h-8 w-[142px]">
                <SelectValue placeholder="Country" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All countries</SelectItem>
                {countryOptions.map((country) => (
                  <SelectItem key={country.code} value={country.code}>
                    {country.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.destinationPort}
              onValueChange={(value) =>
                onFilterChange("destinationPort", value as FeedFilterState["destinationPort"])
              }
            >
              <SelectTrigger className="h-8 w-[142px]">
                <SelectValue placeholder="Port" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ports</SelectItem>
                {portOptions.map((port) => (
                  <SelectItem key={port.code} value={port.code}>
                    {port.label}
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
              <SelectTrigger className="h-8 w-[160px]">
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

            <div className="relative min-w-[180px] flex-1 xl:max-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 pl-9"
                value={filters.search}
                onChange={(event) => onFilterChange("search", event.target.value)}
                placeholder="Search market"
              />
            </div>
          </div>

          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="ml-auto h-8 text-muted-foreground">
              Tools
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </CollapsibleTrigger>

          <CollapsibleContent className="space-y-3 border-t border-border/60 pt-2.5">
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
