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
    <Card className="overflow-hidden border-border/70 bg-card/95 shadow-sm">
      <CardHeader className="space-y-0.75 border-b border-border/60 px-1.5 py-0.75 sm:space-y-1 sm:px-3 sm:py-1.5">
        <div className="flex min-w-0 items-center gap-1">
          <CardTitle className="mr-auto text-[11.5px] uppercase tracking-[0.12em] sm:text-[13px] sm:tracking-[0.16em]">
            {title}
          </CardTitle>
          <div className="shrink-0 text-[9.5px] text-muted-foreground sm:text-[11px]">
            {entries.length} visible
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-[minmax(0,110px)_minmax(0,1fr)] gap-0.5 sm:flex sm:flex-wrap sm:items-center sm:gap-1.5">
          <Select
            value={filters.brokerProfileId}
            onValueChange={(value) =>
              onFiltersChange({
                ...filters,
                brokerProfileId: value,
              })
            }
          >
            <SelectTrigger className="h-5.5 min-w-0 w-full text-[10px] sm:h-6.5 sm:w-[132px] sm:flex-none sm:text-xs">
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

          <div className="relative min-w-0 w-full flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground sm:left-3 sm:h-3.5 sm:w-3.5" />
            <Input
              className="h-5.5 min-w-0 pr-2 pl-8 text-[10px] placeholder:text-[10px] sm:h-6.5 sm:pr-3 sm:pl-9 sm:text-xs sm:placeholder:text-xs"
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
          <div className="p-3 sm:p-5">
            <MonitorEmptyState title={emptyTitle} description={emptyDescription} />
          </div>
        ) : (
          <ScrollArea className="h-[236px] sm:h-[248px] lg:h-[262px] xl:h-[274px]">
            <div className="divide-y divide-border/50">
              {entries.map((entry) => {
                const isSelected = entry.id === selectedEntryId;

                return (
                  <Button
                    key={entry.id}
                    type="button"
                    variant="ghost"
                    onClick={() => onSelectEntry(entry)}
                    className={`h-auto w-full min-w-0 justify-start rounded-none border-l-2 px-2 py-0.5 text-left sm:px-2.5 sm:py-0.75 ${
                      isSelected
                        ? "border-l-primary bg-muted/28"
                        : "border-l-transparent hover:bg-muted/16"
                    }`}
                  >
                    <div className="w-full min-w-0 overflow-hidden">
                      <div className="line-clamp-2 break-words text-left text-[10px] font-medium leading-3.5 text-foreground sm:truncate sm:text-[11px] sm:leading-4">
                        {buildCompactCanonicalView(entry)}
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
