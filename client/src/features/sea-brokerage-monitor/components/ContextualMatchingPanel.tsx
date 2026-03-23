import { useMemo, useState } from "react";
import { ChevronDown, ExternalLink, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EntryDetailSheet } from "./EntryDetailSheet";
import { MonitorEmptyState } from "./MonitorEmptyState";
import { generateMatchSuggestions } from "../services/matchingEngine.service";
import { countryOptions, portOptions } from "../mock/dictionaries";
import {
  buildCompactCanonicalView,
  formatEntryCommodityCompact,
  formatEntryPriceRange,
  formatEntryTimestampCompact,
} from "../services/entryFormatting.service";
import { getPortPlaceDisplayLabel } from "../services/displayStandards";
import type { BrokerageEntry, MatchSuggestion } from "../types";

interface ContextualMatchingPanelProps {
  entries: BrokerageEntry[];
  selectedEntry: BrokerageEntry | null;
}

type MatchingFocusState = {
  commodity: BrokerageEntry["commodity"] | "all";
  basis: BrokerageEntry["basis"] | "all";
  deliveryPlace: string | "all";
};

const defaultFocusState: MatchingFocusState = {
  commodity: "all",
  basis: "all",
  deliveryPlace: "all",
};

function buildCompactCounterpartyLine(entry: BrokerageEntry) {
  return buildCompactCanonicalView(entry);
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
  const [focus, setFocus] = useState<MatchingFocusState>(defaultFocusState);

  const deliveryPlaceOptions = useMemo(
    () => [
      ...countryOptions.map((country) => ({
        value: `country:${country.code}`,
        label: country.displayLabel,
      })),
      ...portOptions.map((port) => ({
        value: `port:${port.code}`,
        label: getPortPlaceDisplayLabel(port.code),
      })),
    ],
    [],
  );

  const rollingSuggestions = useMemo(() => {
    const suggestions = generateMatchSuggestions(entries);

    return suggestions
      .filter((suggestion) => {
        const commodityMatches =
          focus.commodity === "all" || suggestion.bidEntry.commodity === focus.commodity;
        const basisMatches =
          focus.basis === "all" ||
          suggestion.bidEntry.basis === focus.basis ||
          suggestion.offerEntry.basis === focus.basis;

        if (focus.deliveryPlace === "all") {
          return commodityMatches && basisMatches;
        }

        const [scope, value] = focus.deliveryPlace.split(":");
        const placeMatches =
          scope === "port"
            ? suggestion.bidEntry.destinationPortCode === value ||
              suggestion.offerEntry.destinationPortCode === value
            : suggestion.bidEntry.destinationCountryCode === value ||
              suggestion.offerEntry.destinationCountryCode === value;

        return commodityMatches && basisMatches && placeMatches;
      })
      .sort((a, b) => {
        const aRelated = selectedEntry && (a.bidEntryId === selectedEntry.id || a.offerEntryId === selectedEntry.id) ? 1 : 0;
        const bRelated = selectedEntry && (b.bidEntryId === selectedEntry.id || b.offerEntryId === selectedEntry.id) ? 1 : 0;
        const aFocusBoost =
          (focus.commodity !== "all" && a.bidEntry.commodity === focus.commodity ? 2 : 0) +
          (focus.basis !== "all" &&
          (a.bidEntry.basis === focus.basis || a.offerEntry.basis === focus.basis)
            ? 1
            : 0);
        const bFocusBoost =
          (focus.commodity !== "all" && b.bidEntry.commodity === focus.commodity ? 2 : 0) +
          (focus.basis !== "all" &&
          (b.bidEntry.basis === focus.basis || b.offerEntry.basis === focus.basis)
            ? 1
            : 0);

        if (aRelated !== bRelated) {
          return bRelated - aRelated;
        }
        if (aFocusBoost !== bFocusBoost) {
          return bFocusBoost - aFocusBoost;
        }

        return getLatestMatchTimestamp(b) - getLatestMatchTimestamp(a) || b.score - a.score;
      })
      .slice(0, 8);
  }, [entries, focus, selectedEntry]);

  return (
    <>
      <Card className="border-border/70 bg-card/95 shadow-sm">
        <CardHeader className="border-b border-border/60 px-1.5 py-0.75 sm:px-3 sm:py-1.5">
          <div className="flex flex-wrap items-center gap-0.5 sm:gap-1.5">
            <CardTitle className="mr-auto text-[11.5px] sm:text-[13px]">Best Current Matches</CardTitle>
            <div className="text-[9.5px] text-muted-foreground sm:text-[11px]">
              {rollingSuggestions.length} shown
            </div>
            {selectedEntry ? (
              <Button
                variant="outline"
                size="sm"
                className="h-5.5 px-1 text-[9.5px] sm:h-6.5 sm:px-2 sm:text-[10px]"
                onClick={() => setDetailEntry(selectedEntry)}
              >
                <ExternalLink className="mr-0.5 h-3 w-3 sm:mr-2 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Open</span>
              </Button>
            ) : null}
          </div>
          <div className="mt-0.5 grid gap-0.5 sm:mt-1 sm:grid-cols-3 sm:gap-1.5">
            <Select
              value={focus.commodity}
              onValueChange={(value) =>
                setFocus((prev) => ({
                  ...prev,
                  commodity: value as MatchingFocusState["commodity"],
                }))
              }
            >
              <SelectTrigger className="h-6 text-[10.5px] sm:h-7 sm:text-[11px]">
                <SelectValue placeholder="Commodity focus" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All commodities</SelectItem>
                {Array.from(new Set(entries.map((entry) => entry.commodity))).map((commodity) => (
                  <SelectItem key={commodity} value={commodity}>
                    {entries.find((entry) => entry.commodity === commodity)?.commodityLabel ?? commodity}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={focus.basis}
              onValueChange={(value) =>
                setFocus((prev) => ({
                  ...prev,
                  basis: value as MatchingFocusState["basis"],
                }))
              }
            >
              <SelectTrigger className="h-6 text-[10.5px] sm:h-7 sm:text-[11px]">
                <SelectValue placeholder="Basis focus" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All basis</SelectItem>
                {Array.from(new Set(entries.map((entry) => entry.basis))).map((basis) => (
                  <SelectItem key={basis} value={basis}>
                    {basis}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={focus.deliveryPlace}
              onValueChange={(value) =>
                setFocus((prev) => ({
                  ...prev,
                  deliveryPlace: value,
                }))
              }
            >
              <SelectTrigger className="h-6 text-[10.5px] sm:h-7 sm:text-[11px]">
                <SelectValue placeholder="Delivery focus" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All delivery places</SelectItem>
                {deliveryPlaceOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        {rollingSuggestions.length === 0 ? (
          <CardContent className="p-2.5 sm:p-4">
            <MonitorEmptyState
              title="No current matches"
              description="Create or reveal compatible offers and bids to populate the rolling matching stream."
            />
          </CardContent>
        ) : (
          <CardContent className="p-0">
            {selectedEntry ? (
              <div className="border-b border-border/50 bg-muted/20 px-2 py-0.5 text-[9.5px] text-muted-foreground sm:px-3.5 sm:py-1.5 sm:text-[11px]">
                Highlighting matches related to selected{" "}
                <span className="font-medium text-foreground">
                  {selectedEntry.type === "offer" ? "offer" : "bid"}
                </span>
                : {selectedEntry.brokerCode} / {formatEntryCommodityCompact(selectedEntry)} /{" "}
                {formatEntryPriceRange(selectedEntry)} {selectedEntry.currency}
              </div>
            ) : null}

            <ScrollArea className="h-[142px] sm:h-[148px] lg:h-[158px]">
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
                      className={`px-2 py-0.5 sm:px-3 sm:py-1 ${
                        isRelated ? "bg-muted/20" : ""
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-x-1 gap-y-0 text-[9.5px] leading-3 sm:text-[10px] sm:leading-3">
                        <Badge className={`h-4 px-1 py-0 text-[9px] sm:h-4.5 ${confidenceTone(suggestion.confidenceLabel)}`}>
                          {suggestion.confidenceLabel}
                        </Badge>
                        <span className="text-muted-foreground">
                          {suggestion.scoreLabel}
                        </span>
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Scale className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                          {suggestion.priceDeltaLabel}
                        </span>
                        <span className="text-muted-foreground">{latestTimestamp}</span>
                      </div>

                      <div className="mt-px grid gap-x-2 gap-y-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                        <button
                          type="button"
                          onClick={() => setDetailEntry(suggestion.bidEntry)}
                          className="truncate text-left text-[10.5px] font-medium leading-3.5 text-foreground transition-colors hover:text-primary sm:text-[11px] sm:leading-3.5"
                        >
                          Bid: {buildCompactCounterpartyLine(suggestion.bidEntry)}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDetailEntry(suggestion.offerEntry)}
                          className="truncate text-left text-[10.5px] font-medium leading-3.5 text-foreground transition-colors hover:text-primary sm:text-[11px] sm:leading-3.5"
                        >
                          Offer: {buildCompactCounterpartyLine(suggestion.offerEntry)}
                        </button>
                      </div>

                      <div className="mt-px truncate text-[9.5px] leading-3 text-muted-foreground sm:text-[10px] sm:leading-3">
                        {suggestion.reasons[0] ?? "Commercial fit found"}
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
                              className="mt-px inline-flex items-center gap-1 text-[9.5px] text-muted-foreground transition-colors hover:text-foreground sm:text-[10px]"
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
