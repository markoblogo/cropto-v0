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
  portOptions,
} from "../mock/dictionaries";
import { getPortPlaceDisplayLabel } from "../services/displayStandards";
import { TelegramLoginWidget } from "./TelegramLoginWidget";
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
      <Card className="overflow-hidden border-border/70 bg-card/95 px-1.5 py-1 shadow-sm sm:px-2.5 sm:py-1.5">
        <div className="flex min-w-0 flex-col gap-1 sm:gap-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-1 sm:gap-1.5">
            <div className="mr-auto min-w-0 text-[8.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground sm:text-[11px] sm:tracking-[0.18em]">
              Sea Brokerage Monitor
            </div>
            <Button
              onClick={onCreateBid}
              size="sm"
              className="h-6 shrink-0 px-1.5 text-[9.5px] sm:h-7 sm:px-2.5 sm:text-xs"
            >
              <Plus className="mr-1 h-2.5 w-2.5 sm:mr-2 sm:h-4 sm:w-4" />
              Create BID
            </Button>
            <Button
              onClick={onCreateOffer}
              variant="secondary"
              size="sm"
              className="h-6 shrink-0 px-1.5 text-[9.5px] sm:h-7 sm:px-2.5 sm:text-xs"
            >
              <Plus className="mr-1 h-2.5 w-2.5 sm:mr-2 sm:h-4 sm:w-4" />
              Create OFFER
            </Button>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-6 shrink-0 px-1 text-[9.5px] text-muted-foreground sm:h-7 sm:px-1.5 sm:text-xs"
              >
                Tools
                <ChevronDown className="ml-1.5 h-3.5 w-3.5 sm:ml-2 sm:h-4 sm:w-4" />
              </Button>
            </CollapsibleTrigger>
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
                {brokers.map((broker) => (
                  <SelectItem key={broker.id} value={broker.id}>
                    {broker.brokerCode} ({broker.brokerName})
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

          <div className="grid min-w-0 gap-1 border-t border-border/60 pt-1.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,320px)_minmax(0,320px)] sm:gap-2">
            <div className="min-w-0">
              <div className="truncate text-[10px] uppercase tracking-[0.14em] text-muted-foreground sm:text-[11px]">
                Telegram Session
              </div>
              <div className="truncate text-[11px] text-muted-foreground sm:text-xs">{session.statusMessage}</div>
              {session.telegramHandle ? (
                <div className="truncate text-[10px] text-muted-foreground/80 sm:text-[11px]">
                  {session.telegramHandle}
                  {session.authorProfile ? ` · ${session.authorProfile.brokerCode}` : ""}
                </div>
              ) : null}
            </div>
            <div className="sm:col-span-2 flex min-h-7 items-center justify-start sm:justify-end">
              {session.monitorAuthToken ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={session.logoutTelegramSession}
                >
                  Sign out Telegram
                </Button>
              ) : (
                <TelegramLoginWidget
                  botUsername={session.telegramBotUsername}
                  onAuth={session.authenticateWithTelegram}
                />
              )}
            </div>
          </div>
          {session.authError ? (
            <div className="rounded-md border border-amber-300/70 bg-amber-50 px-2.5 py-1 text-xs text-amber-900">
              {session.authError}
            </div>
          ) : null}

          <CollapsibleContent className="space-y-2 border-t border-border/60 pt-1.5 sm:space-y-2 sm:pt-1.5">
            {session.isDemoSelectorEnabled ? (
              <div className="flex flex-wrap gap-2">
                <Select
                  value={session.selectedDemoBrokerId ?? "none"}
                  onValueChange={(value) =>
                    session.setSelectedDemoBrokerId(value === "none" ? null : value)
                  }
                >
                  <SelectTrigger className="w-full sm:w-[220px]">
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
