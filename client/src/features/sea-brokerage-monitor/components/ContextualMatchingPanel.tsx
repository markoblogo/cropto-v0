import { useMemo, useState } from "react";
import { ChevronDown, ExternalLink, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EntryDetailSheet } from "./EntryDetailSheet";
import { MonitorEmptyState } from "./MonitorEmptyState";
import { generateMatchSuggestions } from "../services/matchingEngine.service";
import {
  formatEntryTimestampCompact,
  formatEntryPriceRange,
} from "../services/entryFormatting.service";
import type { BrokerageEntry, MatchSuggestion } from "../types";

interface ContextualMatchingPanelProps {
  entries: BrokerageEntry[];
  selectedEntry: BrokerageEntry | null;
}

function buildCompactCounterpartyLine(entry: BrokerageEntry) {
  return [
    formatEntryTimestampCompact(entry.createdAt),
    entry.brokerCode,
    entry.commodityLabel.toUpperCase(),
    `${entry.basis} ${entry.destinationPort}`,
    entry.periodLabel,
    `${formatEntryPriceRange(entry)} ${entry.currency}`,
  ].join(" / ");
}

function confidenceTone(confidence: "high confidence" | "medium confidence" | "weak match") {
  switch (confidence) {
    case "high confidence":
      return "border-emerald-400/40 bg-emerald-500/10 text-emerald-700";
    case "medium confidence":
      return "border-amber-400/40 bg-amber-500/10 text-amber-700";
    default:
      return "border-slate-400/40 bg-slate-500/10 text-slate-700";
  }
}

function getLatestMatchTimestamp(suggestion: MatchSuggestion) {
  const bidTime = new Date(suggestion.bidEntry.createdAt).getTime();
  const offerTime = new Date(suggestion.offerEntry.createdAt).getTime();
  return Math.max(bidTime, offerTime);
}

export function ContextualMatchingPanel({
  entries,
  selectedEntry,
}: ContextualMatchingPanelProps) {
  const [detailEntry, setDetailEntry] = useState<BrokerageEntry | null>(null);
  const [expandedSuggestionId, setExpandedSuggestionId] = useState<string | null>(null);

  const rollingSuggestions = useMemo(() => {
    const suggestions = generateMatchSuggestions(entries);

    return suggestions
      .sort((a, b) => {
        const aRelated = selectedEntry && (a.bidEntryId === selectedEntry.id || a.offerEntryId === selectedEntry.id) ? 1 : 0;
        const bRelated = selectedEntry && (b.bidEntryId === selectedEntry.id || b.offerEntryId === selectedEntry.id) ? 1 : 0;

        if (aRelated !== bRelated) {
          return bRelated - aRelated;
        }

        return getLatestMatchTimestamp(b) - getLatestMatchTimestamp(a) || b.score - a.score;
      })
      .slice(0, 8);
  }, [entries, selectedEntry]);

  return (
    <>
      <Card className="border-border/70 bg-card/95 shadow-sm">
        <CardHeader className="border-b border-border/60 px-3.5 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="mr-auto text-sm">Best Current Matches</CardTitle>
            <div className="text-[11px] text-muted-foreground">
              {rollingSuggestions.length} shown
            </div>
            {selectedEntry ? (
              <Button variant="outline" size="sm" className="h-7" onClick={() => setDetailEntry(selectedEntry)}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Open
              </Button>
            ) : null}
          </div>
        </CardHeader>

        {rollingSuggestions.length === 0 ? (
          <CardContent className="p-4">
            <MonitorEmptyState
              title="No current matches"
              description="Create or reveal compatible offers and bids to populate the rolling matching stream."
            />
          </CardContent>
        ) : (
          <CardContent className="p-0">
            {selectedEntry ? (
              <div className="border-b border-border/50 bg-muted/20 px-3.5 py-1.5 text-[11px] text-muted-foreground">
                Highlighting matches related to selected{" "}
                <span className="font-medium text-foreground">
                  {selectedEntry.type === "offer" ? "offer" : "bid"}
                </span>
                : {selectedEntry.brokerCode} / {selectedEntry.commodityLabel} /{" "}
                {formatEntryPriceRange(selectedEntry)} {selectedEntry.currency}
              </div>
            ) : null}

            <ScrollArea className="h-[180px] lg:h-[190px]">
              <div className="divide-y divide-border/50">
                {rollingSuggestions.map((suggestion) => {
                  const isRelated =
                    !!selectedEntry &&
                    (suggestion.bidEntryId === selectedEntry.id ||
                      suggestion.offerEntryId === selectedEntry.id);
                  const latestTimestamp = formatEntryTimestampCompact(
                    getLatestMatchTimestamp(suggestion) ===
                      new Date(suggestion.bidEntry.createdAt).getTime()
                      ? suggestion.bidEntry.createdAt
                      : suggestion.offerEntry.createdAt,
                  );

                  return (
                    <div
                      key={suggestion.id}
                      className={`px-3.5 py-1.5 ${
                        isRelated ? "bg-muted/20" : ""
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-4">
                        <Badge className={`h-5 px-1.5 py-0 ${confidenceTone(suggestion.confidenceLabel)}`}>
                          {suggestion.confidenceLabel}
                        </Badge>
                        <span className="text-muted-foreground">
                          {suggestion.scoreLabel}
                        </span>
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Scale className="h-3.5 w-3.5" />
                          {suggestion.priceDeltaLabel}
                        </span>
                        <span className="text-muted-foreground">{latestTimestamp}</span>
                      </div>

                      <div className="mt-0.5 grid gap-x-3 gap-y-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                        <button
                          type="button"
                          onClick={() => setDetailEntry(suggestion.bidEntry)}
                          className="truncate text-left text-[12px] font-medium leading-4 text-foreground transition-colors hover:text-primary"
                        >
                          Bid: {buildCompactCounterpartyLine(suggestion.bidEntry)}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDetailEntry(suggestion.offerEntry)}
                          className="truncate text-left text-[12px] font-medium leading-4 text-foreground transition-colors hover:text-primary"
                        >
                          Offer: {buildCompactCounterpartyLine(suggestion.offerEntry)}
                        </button>
                      </div>

                      <div className="mt-0.5 truncate text-[11px] leading-4 text-muted-foreground">
                        {(suggestion.reasons[0] ?? "Commercial fit found") +
                          (suggestion.reasons[1] ? ` · ${suggestion.reasons[1]}` : "")}
                      </div>

                      {suggestion.reasons.length > 2 ? (
                        <Collapsible
                          open={expandedSuggestionId === suggestion.id}
                          onOpenChange={(open) =>
                            setExpandedSuggestionId(open ? suggestion.id : null)
                          }
                        >
                          <CollapsibleTrigger asChild>
                            <button
                              type="button"
                              className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                            >
                              More detail
                              <ChevronDown className="h-3.5 w-3.5" />
                            </button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
                            {suggestion.reasons.join(" · ")}
                          </CollapsibleContent>
                        </Collapsible>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        )}
      </Card>

      <EntryDetailSheet
        entry={detailEntry}
        open={!!detailEntry}
        onOpenChange={(open) => {
          if (!open) setDetailEntry(null);
        }}
      />
    </>
  );
}
