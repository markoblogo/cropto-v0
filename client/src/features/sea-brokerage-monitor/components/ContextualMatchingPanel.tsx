import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Handshake, Settings2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { buildSeaBrokerageMonitorAuthHeaders } from "../services/monitorAuth.service";
import { getPortPlaceDisplayLabel, getTransportDisplayLabel } from "../services/displayStandards";
import { apiRequest } from "@/lib/queryClient";
import type {
  BrokerageEntry,
  MatchLike,
  MatchSettings,
  MatchSuggestion,
  MatchVisibilityMode,
} from "../types";

interface ContextualMatchingPanelProps {
  entries: BrokerageEntry[];
  selectedEntry: BrokerageEntry | null;
  monitorAuthToken?: string | null;
  canLikeMatches?: boolean;
  currentBrokerCode?: string | null;
  onRequireAuth?: () => void;
  onCreateTradeFromMatch?: (suggestion: MatchSuggestion) => void;
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
const BOSS_BROKER_CODES = new Set(["OS", "VZH", "ABV"]);
const MATCH_FRESHNESS_OPTIONS = [1, 3, 5, 7, 10, 14, 21, 30] as const;

function buildCompactCounterpartyLine(entry: BrokerageEntry) {
  return buildCompactCanonicalView(entry);
}

function getLatestMatchTimestamp(suggestion: MatchSuggestion) {
  const bidTime = new Date(suggestion.bidEntry.createdAt).getTime();
  const offerTime = new Date(suggestion.offerEntry.createdAt).getTime();
  return Math.max(bidTime, offerTime);
}

type CompareRow = {
  label: string;
  offerValue: string;
  bidValue: string;
  equal: boolean;
};

function normalizeCompareValue(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function formatComparePeriod(entry: BrokerageEntry) {
  const startRaw = String(entry.periodStart || "").trim();
  const endRaw = String(entry.periodEnd || "").trim();
  if (!startRaw || !endRaw) {
    return entry.periodLabel || "Open";
  }

  const start = new Date(startRaw);
  const end = new Date(endRaw);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return entry.periodLabel || "Open";
  }

  const dayMonth = (value: Date) =>
    `${String(value.getDate()).padStart(2, "0")} ${value.toLocaleString("en-US", {
      month: "short",
    })}`;
  return `${dayMonth(start)} - ${dayMonth(end)} ${end.getFullYear()}`;
}

function buildCompareRows(suggestion: MatchSuggestion): CompareRow[] {
  const bid = suggestion.bidEntry;
  const offer = suggestion.offerEntry;
  const resolvePortCodes = (entry: BrokerageEntry) =>
    Array.isArray(entry.destinationPortCodes) && entry.destinationPortCodes.length
      ? entry.destinationPortCodes
      : String(entry.destinationPortCode || "")
          .split("|")
          .map((part) => part.trim())
          .filter(Boolean);

  const rows: CompareRow[] = [
    {
      label: "Commodity",
      offerValue: offer.commodityLabel,
      bidValue: bid.commodityLabel,
      equal: normalizeCompareValue(bid.commodity) === normalizeCompareValue(offer.commodity),
    },
    {
      label: "Quantity / Tolerance",
      offerValue: `${offer.quantityMt ?? offer.volumeFrom} MT ${offer.tolerancePct != null ? `(+/- ${offer.tolerancePct}%)` : ""}`.trim(),
      bidValue: `${bid.quantityMt ?? bid.volumeFrom} MT ${bid.tolerancePct != null ? `(+/- ${bid.tolerancePct}%)` : ""}`.trim(),
      equal:
        (bid.quantityMt ?? bid.volumeFrom) === (offer.quantityMt ?? offer.volumeFrom) &&
        (bid.tolerancePct ?? null) === (offer.tolerancePct ?? null),
    },
    {
      label: "Basis / Place",
      offerValue: `${offer.basis} ${getPortPlaceDisplayLabel(offer.destinationPortCode || "")}`,
      bidValue: `${bid.basis} ${getPortPlaceDisplayLabel(bid.destinationPortCode || "")}`,
      equal:
        normalizeCompareValue(bid.basis) === normalizeCompareValue(offer.basis) &&
        resolvePortCodes(bid).some((code) => resolvePortCodes(offer).includes(code)),
    },
    {
      label: "Transport",
      offerValue: getTransportDisplayLabel(offer.transportType),
      bidValue: getTransportDisplayLabel(bid.transportType),
      equal: normalizeCompareValue(bid.transportType) === normalizeCompareValue(offer.transportType),
    },
    {
      label: "Period",
      offerValue: formatComparePeriod(offer),
      bidValue: formatComparePeriod(bid),
      equal: normalizeCompareValue(formatComparePeriod(bid)) === normalizeCompareValue(formatComparePeriod(offer)),
    },
    {
      label: "Price",
      offerValue: `${offer.price ?? offer.priceFrom ?? "n/a"} ${offer.currency}`,
      bidValue: `${bid.price ?? bid.priceFrom ?? "n/a"} ${bid.currency}`,
      equal:
        (bid.price ?? bid.priceFrom ?? null) === (offer.price ?? offer.priceFrom ?? null) &&
        normalizeCompareValue(bid.currency) === normalizeCompareValue(offer.currency),
    },
    {
      label: "Payment terms",
      offerValue: offer.paymentTerms || "Not specified",
      bidValue: bid.paymentTerms || "Not specified",
      equal: normalizeCompareValue(bid.paymentTerms || "") === normalizeCompareValue(offer.paymentTerms || ""),
    },
  ];

  return rows;
}

export function ContextualMatchingPanel({
  entries,
  selectedEntry,
  monitorAuthToken = null,
  canLikeMatches = false,
  currentBrokerCode = null,
  onRequireAuth,
  onCreateTradeFromMatch,
}: ContextualMatchingPanelProps) {
  const queryClient = useQueryClient();
  const [detailEntry, setDetailEntry] = useState<BrokerageEntry | null>(null);
  const [compareSuggestion, setCompareSuggestion] = useState<MatchSuggestion | null>(null);
  const [focus, setFocus] = useState<MatchingFocusState>(defaultFocusState);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [matchVisibilityMode, setMatchVisibilityMode] = useState<MatchVisibilityMode>("mine");
  const [localFreshnessDays, setLocalFreshnessDays] = useState(7);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const matchableEntries = useMemo(
    () => entries.filter((entry) => entry.type === "bid" || entry.type === "offer"),
    [entries],
  );
  const brokerCodeUpper = String(currentBrokerCode || "").toUpperCase();
  const isBoss = !!brokerCodeUpper && BOSS_BROKER_CODES.has(brokerCodeUpper);

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
    const suggestions = generateMatchSuggestions(matchableEntries, {
      freshnessDays: localFreshnessDays,
    });

    return suggestions
      .filter((suggestion) => {
        const hasBrokerScope = !!brokerCodeUpper;
        const bidBrokerCode = String(suggestion.bidEntry.brokerCode || "").toUpperCase();
        const offerBrokerCode = String(suggestion.offerEntry.brokerCode || "").toUpperCase();
        const mineScopeMatches = hasBrokerScope
          ? bidBrokerCode === brokerCodeUpper || offerBrokerCode === brokerCodeUpper
          : false;
        const visibilityMatches =
          matchVisibilityMode === "all" && isBoss ? true : mineScopeMatches;
        if (!visibilityMatches) {
          return false;
        }

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
        const bidPortCodes =
          Array.isArray(suggestion.bidEntry.destinationPortCodes) && suggestion.bidEntry.destinationPortCodes.length
            ? suggestion.bidEntry.destinationPortCodes
            : String(suggestion.bidEntry.destinationPortCode || "")
                .split("|")
                .map((part) => part.trim())
                .filter(Boolean);
        const offerPortCodes =
          Array.isArray(suggestion.offerEntry.destinationPortCodes) &&
          suggestion.offerEntry.destinationPortCodes.length
            ? suggestion.offerEntry.destinationPortCodes
            : String(suggestion.offerEntry.destinationPortCode || "")
                .split("|")
                .map((part) => part.trim())
                .filter(Boolean);
        const placeMatches =
          scope === "port"
            ? bidPortCodes.includes(value) || offerPortCodes.includes(value)
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
  }, [
    brokerCodeUpper,
    focus,
    isBoss,
    localFreshnessDays,
    matchVisibilityMode,
    matchableEntries,
    selectedEntry,
  ]);

  const { data: matchSettings } = useQuery<MatchSettings>({
    queryKey: ["/api/sea-brokerage-monitor/match-settings", monitorAuthToken],
    enabled: !!monitorAuthToken && !!brokerCodeUpper,
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/sea-brokerage-monitor/match-settings", undefined, {
        headers: buildSeaBrokerageMonitorAuthHeaders(monitorAuthToken),
      });
      return response.json();
    },
  });

  useEffect(() => {
    if (!isBoss) {
      setMatchVisibilityMode("mine");
    }
  }, [isBoss]);

  useEffect(() => {
    if (matchSettings?.freshnessDays) {
      setLocalFreshnessDays(matchSettings.freshnessDays);
    }
  }, [matchSettings?.freshnessDays]);

  const { data: matchLikes = [] } = useQuery<MatchLike[]>({
    queryKey: ["/api/sea-brokerage-monitor/matches/likes", monitorAuthToken],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/sea-brokerage-monitor/matches/likes", undefined, {
        headers: buildSeaBrokerageMonitorAuthHeaders(monitorAuthToken),
      });
      return response.json();
    },
  });

  const likesByMatch = useMemo(() => {
    const map = new Map<string, MatchLike[]>();
    for (const like of matchLikes) {
      const current = map.get(like.matchId);
      if (current) {
        current.push(like);
      } else {
        map.set(like.matchId, [like]);
      }
    }
    return map;
  }, [matchLikes]);

  async function handleLikeMatch(suggestion: MatchSuggestion) {
    if (!canLikeMatches) {
      onRequireAuth?.();
      return;
    }
    try {
      await fetch(`/api/sea-brokerage-monitor/matches/${suggestion.id}/likes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildSeaBrokerageMonitorAuthHeaders(monitorAuthToken),
        },
      });
      await queryClient.invalidateQueries({
        queryKey: ["/api/sea-brokerage-monitor/matches/likes", monitorAuthToken],
      });
    } catch {
      // Keep matching interactions resilient to transient relay/API hiccups.
    }
  }

  async function handleSaveMatchSettings() {
    if (!monitorAuthToken) {
      onRequireAuth?.();
      return;
    }
    setSavingSettings(true);
    setSettingsError(null);
    try {
      await apiRequest(
        "PUT",
        "/api/sea-brokerage-monitor/match-settings",
        { freshnessDays: localFreshnessDays },
        {
          headers: buildSeaBrokerageMonitorAuthHeaders(monitorAuthToken),
        },
      );
      await queryClient.invalidateQueries({
        queryKey: ["/api/sea-brokerage-monitor/match-settings", monitorAuthToken],
      });
      setSettingsOpen(false);
    } catch (error: any) {
      setSettingsError(error?.message || "Failed to save matching settings");
    } finally {
      setSavingSettings(false);
    }
  }

  return (
    <>
      <Card className="overflow-hidden border-border/70 bg-card/95 shadow-sm">
        <CardHeader className="space-y-0.75 border-b border-border/60 px-1.5 py-0.75 sm:space-y-1 sm:px-3 sm:py-1.5">
          <div className="flex min-w-0 items-center gap-1">
            <CardTitle className="mr-auto text-[11.5px] uppercase tracking-[0.12em] sm:text-[13px] sm:tracking-[0.16em]">
              MATCHES
            </CardTitle>
            {isBoss ? (
              <Select
                value={matchVisibilityMode}
                onValueChange={(value) => setMatchVisibilityMode(value as MatchVisibilityMode)}
              >
                <SelectTrigger className="h-5.5 w-[82px] px-1 text-[9px] sm:h-6.5 sm:w-[102px] sm:text-[10px]">
                  <SelectValue placeholder="Scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mine">My matches</SelectItem>
                  <SelectItem value="all">All matches</SelectItem>
                </SelectContent>
              </Select>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-5.5 shrink-0 px-1 text-[9.5px] sm:h-6.5 sm:px-2 sm:text-[10px]"
              onClick={() => {
                if (!monitorAuthToken) {
                  onRequireAuth?.();
                  return;
                }
                setSettingsError(null);
                setSettingsOpen(true);
              }}
            >
              <Settings2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span className="ml-1 hidden sm:inline">Settings</span>
            </Button>
            <div className="text-[9.5px] text-foreground/70 dark:text-muted-foreground sm:text-[11px]">
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
              description={
                matchVisibilityMode === "all" && isBoss
                  ? `No matches found in last ${localFreshnessDays} days for selected filters.`
                  : `No matches found in your scope for last ${localFreshnessDays} days.`
              }
            />
          </CardContent>
        ) : (
          <CardContent className="p-0">
            {selectedEntry ? (
              <div className="border-b border-border/50 bg-muted/20 px-2 py-0.5 text-[9.5px] text-foreground/70 dark:text-muted-foreground sm:px-3.5 sm:py-1.5 sm:text-[11px]">
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

            <ScrollArea className="h-[220px] sm:h-[232px] lg:h-[20vh] lg:min-h-[160px] lg:max-h-[208px] xl:h-[21vh] xl:max-h-[220px]">
              <div className="divide-y divide-border/50">
                {rollingSuggestions.map((suggestion) => {
                  const isRelated =
                    !!selectedEntry &&
                    (suggestion.bidEntryId === selectedEntry.id ||
                      suggestion.offerEntryId === selectedEntry.id);
                  const matchLikesList = likesByMatch.get(suggestion.id) ?? [];
                  const brokerCodeUpper = String(currentBrokerCode || "").toUpperCase();
                  const bidIsMine = !!brokerCodeUpper && suggestion.bidEntry.brokerCode.toUpperCase() === brokerCodeUpper;
                  const offerIsMine =
                    !!brokerCodeUpper && suggestion.offerEntry.brokerCode.toUpperCase() === brokerCodeUpper;
                  const isMine = bidIsMine || offerIsMine;
                  const hasOutgoingLike =
                    !!brokerCodeUpper &&
                    matchLikesList.some((like) => like.likerBrokerCode.toUpperCase() === brokerCodeUpper);
                  const hasIncomingLike =
                    isMine &&
                    matchLikesList.some((like) => like.likerBrokerCode.toUpperCase() !== brokerCodeUpper);
                  const hasBossLike = matchLikesList.some((like) => like.kind === "boss");
                  const canLikeThisMatch =
                    canLikeMatches && (!!brokerCodeUpper && (isMine || BOSS_BROKER_CODES.has(brokerCodeUpper)));
                  return (
                    <div
                      key={suggestion.id}
                      className={`min-w-0 overflow-hidden px-2 py-1 sm:px-3 sm:py-1.5 ${
                        isRelated ? "bg-muted/20" : ""
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <button
                            type="button"
                            onClick={() => setDetailEntry(suggestion.bidEntry)}
                            className={`mt-0.5 min-w-0 line-clamp-2 break-words text-left text-[10px] font-medium leading-3.5 transition-colors hover:text-primary sm:text-[11px] ${
                              bidIsMine ? "text-emerald-300" : "text-foreground"
                            }`}
                          >
                            Bid: {buildCompactCounterpartyLine(suggestion.bidEntry)}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDetailEntry(suggestion.offerEntry)}
                            className={`mt-0.5 min-w-0 line-clamp-2 break-words text-left text-[10px] font-medium leading-3.5 transition-colors hover:text-primary sm:text-[11px] ${
                              offerIsMine ? "text-emerald-300" : "text-foreground"
                            }`}
                          >
                            Offer: {buildCompactCounterpartyLine(suggestion.offerEntry)}
                          </button>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-5.5 px-1.5 text-[9.5px] sm:h-6 sm:text-[10px]"
                            onClick={() => onCreateTradeFromMatch?.(suggestion)}
                          >
                            TO TRADE
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-5.5 px-1.5 text-[9.5px] sm:h-6 sm:text-[10px]"
                            onClick={() => setCompareSuggestion(suggestion)}
                          >
                            COMPARE
                          </Button>
                          {canLikeMatches ? (
                            <button
                              type="button"
                              disabled={!canLikeThisMatch || hasOutgoingLike}
                              onClick={() => void handleLikeMatch(suggestion)}
                              className={`inline-flex h-6 min-w-[32px] items-center justify-center rounded border px-1 ${
                                hasBossLike
                                  ? "border-sky-400/80 bg-sky-500/20 text-sky-300"
                                  : hasOutgoingLike
                                    ? "cursor-default border-amber-400/80 bg-amber-500/20 text-amber-300"
                                    : hasIncomingLike
                                      ? "border-emerald-400/80 bg-emerald-500/20 text-emerald-300"
                                      : canLikeThisMatch
                                        ? "border-border/80 bg-background/70 text-foreground hover:bg-muted/30"
                                        : "cursor-default border-border/60 bg-background/40 text-muted-foreground/60"
                              }`}
                              aria-label="Like match"
                            >
                              {hasBossLike ? <ShieldCheck className="h-3.5 w-3.5" /> : <Handshake className="h-3.5 w-3.5" />}
                            </button>
                          ) : null}
                        </div>
                      </div>
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

      <Dialog open={!!compareSuggestion} onOpenChange={(open) => !open && setCompareSuggestion(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Match compare</DialogTitle>
          </DialogHeader>
          {compareSuggestion ? (
            <div className="space-y-2">
              <div className="hidden grid-cols-12 gap-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground/70 dark:text-muted-foreground sm:grid">
                <div className="sm:col-span-2">Parameters</div>
                <div className="sm:col-span-4">Offer</div>
                <div className="sm:col-span-4">Bid</div>
                <div className="sm:col-span-2">Result</div>
              </div>
              {buildCompareRows(compareSuggestion).map((row) => (
                <div key={row.label} className="grid gap-1.5 rounded-md border border-border/60 p-2 sm:grid-cols-12 sm:items-center">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground/70 dark:text-muted-foreground sm:col-span-2">
                    {row.label}
                  </div>
                  <div
                    className={`rounded border px-2 py-1 text-[11px] sm:col-span-4 ${
                      row.equal
                        ? "border-border/60 text-foreground"
                        : "border-amber-500/60 bg-amber-50/70 text-amber-800 dark:border-amber-400/60 dark:bg-amber-950/20 dark:text-amber-200"
                    }`}
                  >
                    {row.offerValue}
                  </div>
                  <div
                    className={`rounded border px-2 py-1 text-[11px] sm:col-span-4 ${
                      row.equal
                        ? "border-border/60 text-foreground"
                        : "border-sky-500/60 bg-sky-50/70 text-sky-800 dark:border-sky-400/60 dark:bg-sky-950/20 dark:text-sky-200"
                    }`}
                  >
                    {row.bidValue}
                  </div>
                  <div className="sm:col-span-2">
                    <div
                      className={`inline-flex h-8 w-full items-center justify-center rounded border text-sm font-semibold ${
                        row.equal
                          ? "border-emerald-500/70 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                          : "border-rose-500/70 bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                      }`}
                    >
                      {row.equal ? "✔️" : "✖️"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Matching settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-foreground/70 dark:text-muted-foreground">
                Freshness window
              </p>
              <Select
                value={String(localFreshnessDays)}
                onValueChange={(value) => setLocalFreshnessDays(Number(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select days" />
                </SelectTrigger>
                <SelectContent>
                  {MATCH_FRESHNESS_OPTIONS.map((days) => (
                    <SelectItem key={days} value={String(days)}>
                      Last {days} day{days === 1 ? "" : "s"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-foreground/70 dark:text-muted-foreground">
                Applies to your match card and personal Telegram match notifications.
              </p>
            </div>
            {settingsError ? <p className="text-xs text-destructive">{settingsError}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setSettingsOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void handleSaveMatchSettings()} disabled={savingSettings}>
                {savingSettings ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
