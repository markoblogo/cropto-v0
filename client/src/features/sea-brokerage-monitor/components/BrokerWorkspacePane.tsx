import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { brokers } from "../mock/dictionaries";
import {
  buildCompactCanonicalView,
} from "../services/entryFormatting.service";
import { MonitorEmptyState } from "./MonitorEmptyState";
import type { BrokerageEntry } from "../types";

export interface BrokerWorkspacePaneFilters {
  brokerProfileId: string | "all";
  search: string;
}

interface BrokerWorkspacePaneProps {
  title: string;
  emptyTitle: string;
  emptyDescription: string;
  entries: BrokerageEntry[];
  selectedEntryId: string | null;
  onSelectEntry: (entry: BrokerageEntry) => void;
  filters: BrokerWorkspacePaneFilters;
  onFiltersChange: (next: BrokerWorkspacePaneFilters) => void;
}

export function BrokerWorkspacePane({
  title,
  emptyTitle,
  emptyDescription,
  entries,
  selectedEntryId,
  onSelectEntry,
  filters,
  onFiltersChange,
}: BrokerWorkspacePaneProps) {
  return (
    <Card className="border-border/70 bg-card/95 shadow-sm">
      <CardHeader className="border-b border-border/60 px-2.5 py-1.5 sm:px-3.5 sm:py-2">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <CardTitle className="mr-auto text-[13px] uppercase tracking-[0.16em] sm:text-sm sm:tracking-[0.18em]">{title}</CardTitle>
          <div className="text-[11px] text-muted-foreground">{entries.length} visible</div>
          <Select
            value={filters.brokerProfileId}
            onValueChange={(value) =>
              onFiltersChange({
                ...filters,
                brokerProfileId: value,
              })
            }
          >
            <SelectTrigger className="h-6.5 w-[126px] text-xs sm:h-7 sm:w-[150px] sm:text-sm">
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

          <div className="relative min-w-[132px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground sm:left-3 sm:h-3.5 sm:w-3.5" />
            <Input
              className="h-6.5 pl-7 text-xs sm:h-7 sm:pl-8 sm:text-sm"
              value={filters.search}
              onChange={(event) =>
                onFiltersChange({
                  ...filters,
                  search: event.target.value,
                })
              }
              placeholder={`Search ${title.toLowerCase()}`}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {entries.length === 0 ? (
          <div className="p-3.5 sm:p-5">
            <MonitorEmptyState title={emptyTitle} description={emptyDescription} />
          </div>
        ) : (
          <ScrollArea className="h-[270px] sm:h-[300px] lg:h-[330px] xl:h-[340px]">
            <div className="divide-y divide-border/50">
              {entries.map((entry) => {
                const isSelected = entry.id === selectedEntryId;
                const counterpartyLabel =
                  entry.type === "offer" ? entry.sellerName : entry.buyerName;
                const supportingMeta = [counterpartyLabel, entry.originCountry].filter(Boolean);

                return (
                  <Button
                    key={entry.id}
                    type="button"
                    variant="ghost"
                    onClick={() => onSelectEntry(entry)}
                    className={`h-auto w-full justify-start rounded-none border-l-2 px-2.5 py-1 text-left sm:px-3 sm:py-1.5 ${
                      isSelected
                        ? "border-l-primary bg-muted/28"
                        : "border-l-transparent hover:bg-muted/16"
                    }`}
                  >
                    <div className="w-full min-w-0 space-y-0.5">
                      <div className="truncate text-left text-[11px] font-medium leading-4 text-foreground sm:text-[13px] sm:leading-[18px]">
                        {buildCompactCanonicalView(entry)}
                      </div>
                      {supportingMeta.length > 0 ? (
                        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] leading-3 text-muted-foreground/65 sm:text-[11px] sm:leading-3.5">
                          {supportingMeta.map((item, index) => (
                            <span key={`${entry.id}-${item}`} className="inline-flex min-w-0 items-center gap-1.5">
                              {index > 0 ? <span>·</span> : null}
                              <span className="truncate">{item}</span>
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </Button>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
