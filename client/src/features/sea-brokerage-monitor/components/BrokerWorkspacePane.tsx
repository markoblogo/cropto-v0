import { Handshake, Plus, Search, ShieldCheck } from "lucide-react";
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
  brokerOptions: Array<{ value: string; label: string }>;
  selectedEntryId: string | null;
  onSelectEntry: (entry: BrokerageEntry) => void;
  filters: BrokerWorkspacePaneFilters;
  onFiltersChange: (next: BrokerWorkspacePaneFilters) => void;
  createActionLabel?: string;
  onCreateAction?: () => void;
  createActionVariant?: "default" | "secondary";
  createActionClassName?: string;
  onToggleLike?: (entry: BrokerageEntry) => void;
  likesEnabled?: boolean;
  currentBrokerId?: string | null;
  currentBrokerCode?: string | null;
  onCounterEntry?: (entry: BrokerageEntry) => void;
}

export function BrokerWorkspacePane({
  title,
  emptyTitle,
  emptyDescription,
  entries,
  brokerOptions,
  selectedEntryId,
  onSelectEntry,
  filters,
  onFiltersChange,
  createActionLabel,
  onCreateAction,
  createActionVariant = "default",
  createActionClassName,
  onToggleLike,
  likesEnabled = false,
  currentBrokerId,
  currentBrokerCode,
  onCounterEntry,
}: BrokerWorkspacePaneProps) {
  return (
    <Card className="overflow-hidden border-border/70 bg-card/95 shadow-sm">
      <CardHeader className="space-y-1 border-b border-border/60 px-1.5 py-1 sm:space-y-1 sm:px-3 sm:py-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1 sm:flex-nowrap">
          <div className="flex min-w-0 items-center gap-1">
            <CardTitle className="text-[11.5px] uppercase tracking-[0.12em] sm:text-[13px] sm:tracking-[0.16em]">
              {title}
            </CardTitle>
            {createActionLabel && onCreateAction ? (
              <Button
                type="button"
                size="sm"
                variant={createActionVariant}
                onClick={onCreateAction}
                className={`h-5.5 shrink-0 px-1.5 text-[10px] leading-none sm:h-6.5 sm:px-2 sm:text-[11px] ${createActionClassName ?? ""}`}
              >
                <Plus className="mr-1 h-3 w-3" />
                {createActionLabel}
              </Button>
            ) : null}
          </div>
          <div className="w-full text-right text-[9.5px] text-muted-foreground sm:ml-auto sm:w-auto sm:shrink-0 sm:text-[11px]">
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
              {brokerOptions.map((broker) => (
                <SelectItem key={broker.value} value={broker.value}>
                  {broker.label}
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
            <div className="divide-y divide-border/50 pr-2 sm:pr-3">
              {entries.map((entry) => {
                const isSelected = entry.id === selectedEntryId;
                const isOwnEntry =
                  (!!currentBrokerId && entry.brokerId === currentBrokerId) ||
                  (!!currentBrokerCode && entry.brokerCode === currentBrokerCode);
                const hasIncomingLikes = isOwnEntry && (entry.likeCount ?? 0) > 0;
                const hasOutgoingLike = !isOwnEntry && !!entry.likedByMe;
                const hasBossMatchLike = !!entry.hasBossMatchLike;

                return (
                  <Button
                    key={entry.id}
                    type="button"
                    variant="ghost"
                    onClick={() => onSelectEntry(entry)}
                    className={`h-auto w-full min-w-0 items-start justify-start whitespace-normal rounded-none border-l-2 pl-2 pr-3 py-0.5 text-left sm:items-center sm:pl-2.5 sm:pr-3.5 sm:py-0.75 sm:whitespace-nowrap ${
                      isSelected
                        ? "border-l-primary bg-muted/28"
                        : "border-l-transparent hover:bg-muted/16"
                    }`}
                  >
                    <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2 overflow-hidden">
                      <div className="min-w-0 flex-1 line-clamp-2 break-words text-left text-[10px] font-medium leading-3.5 text-foreground sm:truncate sm:text-[11px] sm:leading-4">
                        {buildCompactCanonicalView(entry)}
                      </div>
                      <div className="flex shrink-0 items-center gap-1 justify-self-end">
                        {likesEnabled && (entry.type === "bid" || entry.type === "offer") ? (
                          <span
                            role={isOwnEntry || entry.likedByMe ? undefined : "button"}
                            tabIndex={isOwnEntry || entry.likedByMe ? -1 : 0}
                            className={`inline-flex h-6 min-w-[36px] items-center justify-center gap-1 rounded border px-1.5 text-[10px] font-semibold leading-none transition-colors ${
                            hasBossMatchLike
                              ? "cursor-default border-sky-400/80 bg-sky-500/20 text-sky-300"
                              : hasIncomingLikes
                              ? "cursor-default border-emerald-400/80 bg-emerald-500/25 text-emerald-300"
                              : hasOutgoingLike
                                ? "cursor-default border-amber-400/80 bg-amber-500/20 text-amber-300"
                                : isOwnEntry
                                  ? "hidden"
                                  : "cursor-pointer border-border/80 bg-background/70 text-foreground hover:bg-muted/30"
                          }`}
                            onClick={(event) => {
                              if (isOwnEntry || entry.likedByMe) {
                                return;
                              }
                              event.stopPropagation();
                              onToggleLike?.(entry);
                            }}
                            onKeyDown={(event) => {
                              if (isOwnEntry || entry.likedByMe) {
                                return;
                              }
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                event.stopPropagation();
                                onToggleLike?.(entry);
                              }
                            }}
                            aria-label={`Like ${entry.type}`}
                          >
                            {hasBossMatchLike ? <ShieldCheck className="h-3.5 w-3.5" /> : <Handshake className="h-3.5 w-3.5" />}
                            {!hasBossMatchLike && hasIncomingLikes ? <span>{entry.likeCount ?? 0}</span> : null}
                          </span>
                        ) : null}
                        {onCounterEntry && (entry.type === "bid" || entry.type === "offer") ? (
                          <span
                            role="button"
                            tabIndex={0}
                            className="inline-flex h-6 min-w-[46px] items-center justify-center rounded border border-border/80 bg-background/70 px-1.5 text-[9.5px] font-semibold leading-none text-foreground transition-colors hover:bg-muted/30 sm:min-w-[52px] sm:text-[10px]"
                            onClick={(event) => {
                              event.stopPropagation();
                              onCounterEntry(entry);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                event.stopPropagation();
                                onCounterEntry(entry);
                              }
                            }}
                            aria-label={`Create counter ${entry.type === "offer" ? "bid" : "offer"}`}
                          >
                            Counter
                          </span>
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
