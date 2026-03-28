import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [focus, setFocus] = useState<MatchingFocusState>(defaultFocusState);
  const matchableEntries = useMemo(
    () => entries.filter((entry) => entry.type === "bid" || entry.type === "offer"),
    [entries],
  );

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
    const suggestions = generateMatchSuggestions(matchableEntries);

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
        const aRelated =
          selectedEntry && (a.bidEntryId === selectedEntry.id || a.offerEntryId === selectedEntry.id)
            ? 1
            : 0;
        const bRelated =
          selectedEntry && (b.bidEntryId === selectedEntry.id || b.offerEntryId === selectedEntry.id)
            ? 1
            : 0;

        if (aRelated !== bRelated) {
          return bRelated - aRelated;
        }

        return getLatestMatchTimestamp(b) - getLatestMatchTimestamp(a);
      })
      .slice(0, 12);
  }, [focus, matchableEntries, selectedEntry]);

  return (
    <>
      <Card className="overflow-hidden border-border/70 bg-card/95 shadow-sm">
        <CardHeader className="space-y-0.75 border-b border-border/60 px-1.5 py-0.75 sm:space-y-1 sm:px-3 sm:py-1.5">
          <div className="flex min-w-0 items-center gap-1">
            <CardTitle className="mr-auto text-[11.5px] uppercase tracking-[0.12em] sm:text-[13px] sm:tracking-[0.16em]">
              MATCHES
            </CardTitle>
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
          <div className="grid min-w-0 gap-0.5 sm:grid-cols-3 sm:gap-1.5">
            <Select
              value={focus.commodity}
              onValueChange={(value) =>
                setFocus((prev) => ({
                  ...prev,
                  commodity: value as MatchingFocusState["commodity"],
                }))
              }
            >
              <SelectTrigger className="h-5.5 text-[10px] sm:h-6.5 sm:text-xs">
                <SelectValue placeholder="Commodity focus" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All commodities</SelectItem>
                {Array.from(new Set(matchableEntries.map((entry) => entry.commodity))).map((commodity) => (
                  <SelectItem key={commodity} value={commodity}>
                    {matchableEntries.find((entry) => entry.commodity === commodity)?.commodityLabel ?? commodity}
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
              <SelectTrigger className="h-5.5 text-[10px] sm:h-6.5 sm:text-xs">
                <SelectValue placeholder="Basis focus" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All basis</SelectItem>
                {Array.from(new Set(matchableEntries.map((entry) => entry.basis))).map((basis) => (
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
              <SelectTrigger className="h-5.5 text-[10px] sm:h-6.5 sm:text-xs">
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
              description="Create compatible offers and bids from last 7 days to populate matching."
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
                :{" "}
                <span className="inline-block max-w-full break-words align-bottom sm:truncate">
                  {selectedEntry.brokerCode} / {formatEntryCommodityCompact(selectedEntry)} /{" "}
                  {formatEntryPriceRange(selectedEntry)} {selectedEntry.currency}
                </span>
              </div>
            ) : null}

            <ScrollArea className="h-[236px] sm:h-[248px] lg:h-[262px] xl:h-[274px]">
              <div className="divide-y divide-border/50">
                {rollingSuggestions.map((suggestion) => {
                  const isRelated =
                    !!selectedEntry &&
                    (suggestion.bidEntryId === selectedEntry.id ||
                      suggestion.offerEntryId === selectedEntry.id);
                  return (
                    <div
                      key={suggestion.id}
                      className={`min-w-0 overflow-hidden px-2 py-1 sm:px-3 sm:py-1.5 ${
                        isRelated ? "bg-muted/20" : ""
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setDetailEntry(suggestion.bidEntry)}
                        className="mt-0.5 min-w-0 line-clamp-2 break-words text-left text-[10px] font-medium leading-3.5 text-foreground transition-colors hover:text-primary sm:text-[11px]"
                      >
                        Bid: {buildCompactCounterpartyLine(suggestion.bidEntry)}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDetailEntry(suggestion.offerEntry)}
                        className="mt-0.5 min-w-0 line-clamp-2 break-words text-left text-[10px] font-medium leading-3.5 text-foreground transition-colors hover:text-primary sm:text-[11px]"
                      >
                        Offer: {buildCompactCounterpartyLine(suggestion.offerEntry)}
                      </button>
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
