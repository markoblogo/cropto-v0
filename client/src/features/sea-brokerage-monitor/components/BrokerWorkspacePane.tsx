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
  formatEntryPriceRange,
  formatEntryTimestampCompact,
  formatEntryVolumeCompact,
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
      <CardHeader className="border-b border-border/60 px-3.5 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="mr-auto text-sm uppercase tracking-[0.18em]">{title}</CardTitle>
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
            <SelectTrigger className="h-7 w-[150px]">
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

          <div className="relative min-w-[150px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-7 pl-8 text-sm"
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
          <div className="p-5">
            <MonitorEmptyState title={emptyTitle} description={emptyDescription} />
          </div>
        ) : (
          <ScrollArea className="h-[320px] lg:h-[330px] xl:h-[340px]">
            <div className="divide-y divide-border/50">
              {entries.map((entry) => {
                const isSelected = entry.id === selectedEntryId;
                const volume = formatEntryVolumeCompact(entry.volumeFrom, entry.volumeTo);

                return (
                  <Button
                    key={entry.id}
                    type="button"
                    variant="ghost"
                    onClick={() => onSelectEntry(entry)}
                    className={`h-auto w-full justify-start rounded-none border-l-2 px-3 py-1.5 text-left ${
                      isSelected
                        ? "border-l-primary bg-muted/28"
                        : "border-l-transparent hover:bg-muted/16"
                    }`}
                  >
                    <div className="w-full min-w-0 space-y-0.5">
                      <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[13px] leading-[18px] text-foreground">
                        <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
                          {formatEntryTimestampCompact(entry.createdAt)}
                        </span>
                        <span className="shrink-0 font-semibold">{entry.brokerCode}</span>
                        <span className="min-w-0 truncate font-semibold tracking-[0.04em]">
                          {entry.commodityLabel.toUpperCase()}
                        </span>
                        <span className="shrink-0 text-muted-foreground">/</span>
                        <span className="shrink-0 font-medium">{volume}</span>
                        <span className="shrink-0 text-muted-foreground">/</span>
                        <span className="min-w-0 truncate">{entry.basis} {entry.destinationPort}</span>
                        <span className="shrink-0 text-muted-foreground">/</span>
                        <span className="shrink-0">{entry.periodLabel}</span>
                        <span className="shrink-0 text-muted-foreground">/</span>
                        <span className="shrink-0 font-semibold">
                          {formatEntryPriceRange(entry)} {entry.currency}
                        </span>
                      </div>
                      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-3.5 text-muted-foreground/65">
                        <span className="truncate">{entry.brokerName}</span>
                        <span>·</span>
                        <span className="truncate">{entry.gradeOrSpec}</span>
                        {entry.note ? (
                          <>
                            <span>·</span>
                            <span className="truncate text-muted-foreground/55">{entry.note}</span>
                          </>
                        ) : null}
                      </div>
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
