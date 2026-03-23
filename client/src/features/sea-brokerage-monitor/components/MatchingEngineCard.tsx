import { useState } from "react";
import { ChevronDown, Layers3, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MonitorEmptyState } from "./MonitorEmptyState";
import type { MatchSuggestion } from "../types";

interface MatchingEngineCardProps {
  suggestions: MatchSuggestion[];
}

function confidenceTone(confidence: MatchSuggestion["confidenceLabel"]) {
  switch (confidence) {
    case "high confidence":
      return "bg-emerald-500/15 text-emerald-700 border-emerald-300";
    case "medium confidence":
      return "bg-amber-500/15 text-amber-700 border-amber-300";
    default:
      return "bg-slate-500/15 text-slate-700 border-slate-300";
  }
}

export function MatchingEngineCard({ suggestions }: MatchingEngineCardProps) {
  const topSuggestions = suggestions.slice(0, 14);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <Card className="border-border/70 bg-card/95 shadow-sm">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-lg">Matching Assistant</CardTitle>
            <CardDescription>
              Compact ranked BID/OFFER pairings from the visible tape.
            </CardDescription>
          </div>
          <Badge variant="outline">{suggestions.length} matches</Badge>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {topSuggestions.length === 0 ? (
          <div className="p-6">
            <MonitorEmptyState
              icon={<Layers3 className="h-5 w-5 text-muted-foreground" />}
              title="No useful matches yet"
              description="Create or reveal compatible BID and OFFER ideas in the tape to populate this panel."
            />
          </div>
        ) : (
          <ScrollArea className="h-[620px]">
            <div className="divide-y divide-border/60">
              {topSuggestions.map((suggestion) => (
                <div key={suggestion.id} className="px-4 py-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge className={confidenceTone(suggestion.confidenceLabel)}>
                      {suggestion.confidenceLabel}
                    </Badge>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <span>{suggestion.scoreLabel}</span>
                      <span>·</span>
                      <Scale className="h-3.5 w-3.5" />
                      {suggestion.priceDeltaLabel}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm leading-5 text-foreground">
                      <span className="mr-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                        Bid
                      </span>
                      {suggestion.bidEntry.canonicalView}
                    </div>
                    <div className="text-sm leading-5 text-foreground">
                      <span className="mr-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                        Offer
                      </span>
                      {suggestion.offerEntry.canonicalView}
                    </div>
                  </div>

                  <div className="mt-2 text-xs text-muted-foreground">
                    {suggestion.reasons.slice(0, 2).join(" · ")}
                  </div>

                  {suggestion.reasons.length > 2 ? (
                    <Collapsible
                      open={expandedId === suggestion.id}
                      onOpenChange={(open) => setExpandedId(open ? suggestion.id : null)}
                    >
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                        >
                          More detail
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-2 text-xs text-muted-foreground">
                        {suggestion.reasons.join(" · ")}
                      </CollapsibleContent>
                    </Collapsible>
                  ) : null}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
