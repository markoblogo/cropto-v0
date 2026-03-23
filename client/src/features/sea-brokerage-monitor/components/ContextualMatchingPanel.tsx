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
import { countryOptions, getPortPlaceLabel, portOptions } from "../mock/dictionaries";
import {
  buildCompactCanonicalView,
  formatEntryPriceRange,
  formatEntryTimestampCompact,
} from "../services/entryFormatting.service";
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
        label: country.label,
      })),
      ...portOptions.map((port) => ({
        value: `port:${port.code}`,
        label: getPortPlaceLabel(port.code),
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
        <CardHeader className="border-b border-border/60 px-2.5 py-1.5 sm:px-3.5 sm:py-2">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <CardTitle className="mr-auto text-[13px] sm:text-sm">Best Current Matches</CardTitle>
            <div className="text-[11px] text-muted-foreground">
              {rollingSuggestions.length} shown
            </div>
            {selectedEntry ? (
              <Button
                variant="outline"
                size="sm"
                className="h-6.5 px-2 text-[11px] sm:h-7 sm:px-3"
                onClick={() => setDetailEntry(selectedEntry)}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Open
              </Button>
            ) : null}
          </div>
          <div className="mt-1.5 grid gap-1.5 sm:mt-2 sm:grid-cols-3 sm:gap-2">
            <Select
              value={focus.commodity}
              onValueChange={(value) =>
                setFocus((prev) => ({
                  ...prev,
                  commodity: value as MatchingFocusState["commodity"],
                }))
              }
            >
              <SelectTrigger className="h-7 text-xs sm:h-8">
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
              <SelectTrigger className="h-7 text-xs sm:h-8">
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
              <SelectTrigger className="h-7 text-xs sm:h-8">
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
          <CardContent className="p-3 sm:p-4">
            <MonitorEmptyState
              title="No current matches"
              description="Create or reveal compatible offers and bids to populate the rolling matching stream."
            />
          </CardContent>
        ) : (
          <CardContent className="p-0">
            {selectedEntry ? (
              <div className="border-b border-border/50 bg-muted/20 px-2.5 py-1 text-[10px] text-muted-foreground sm:px-3.5 sm:py-1.5 sm:text-[11px]">
                Highlighting matches related to selected{" "}
                <span className="font-medium text-foreground">
                  {selectedEntry.type === "offer" ? "offer" : "bid"}
                </span>
                : {selectedEntry.brokerCode} / {selectedEntry.commodityLabel} /{" "}
                {formatEntryPriceRange(selectedEntry)} {selectedEntry.currency}
              </div>
            ) : null}

            <ScrollArea className="h-[165px] sm:h-[175px] lg:h-[190px]">
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
                      className={`px-2.5 py-1 sm:px-3.5 sm:py-1.5 ${
                        isRelated ? "bg-muted/20" : ""
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] leading-3.5 sm:text-[11px] sm:leading-4">
                        <Badge className={`h-4.5 px-1 py-0 text-[10px] ${confidenceTone(suggestion.confidenceLabel)}`}>
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

                      <div className="mt-0.5 grid gap-x-2 gap-y-0.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                        <button
                          type="button"
                          onClick={() => setDetailEntry(suggestion.bidEntry)}
                          className="truncate text-left text-[11px] font-medium leading-4 text-foreground transition-colors hover:text-primary sm:text-[12px]"
                        >
                          Bid: {buildCompactCounterpartyLine(suggestion.bidEntry)}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDetailEntry(suggestion.offerEntry)}
                          className="truncate text-left text-[11px] font-medium leading-4 text-foreground transition-colors hover:text-primary sm:text-[12px]"
                        >
                          Offer: {buildCompactCounterpartyLine(suggestion.offerEntry)}
                        </button>
                      </div>

                      <div className="mt-0.5 truncate text-[10px] leading-3.5 text-muted-foreground sm:text-[11px] sm:leading-4">
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
