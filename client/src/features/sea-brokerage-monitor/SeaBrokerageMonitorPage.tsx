import { useEffect, useMemo, useState } from "react";
import { MainLayout } from "@/components/layouts/MainLayout";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { BrokerWorkspacePane, type BrokerWorkspacePaneFilters } from "./components/BrokerWorkspacePane";
import { ContextualMatchingPanel } from "./components/ContextualMatchingPanel";
import { EntryCreateDialog } from "./components/EntryCreateDialog";
import { MonitorToolbar } from "./components/MonitorToolbar";
import { StandardizedFeedCard } from "./components/StandardizedFeedCard";
import { useSeaBrokerageTelegramSession } from "./hooks/useSeaBrokerageTelegramSession";
import { useSeaBrokerageMonitorState } from "./hooks/useSeaBrokerageMonitorState";
import {
  addSeaBrokerageMonitorSampleEntry,
  clearSeaBrokerageMonitorEntries,
  resetSeaBrokerageMonitorDemoData,
  reseedSeaBrokerageMonitorDemoData,
} from "./services/seaBrokerageMonitor.service";
import {
  defaultFeedFilters,
  filterBrokerageEntries,
} from "./services/feedFilters.service";
import type { BrokerageEntry, EntryType, FeedFilterState } from "./types";

const defaultPaneFilters: BrokerWorkspacePaneFilters = {
  brokerProfileId: "all",
  search: "",
};

export function SeaBrokerageMonitorPage() {
  const monitorState = useSeaBrokerageMonitorState();
  const session = useSeaBrokerageTelegramSession();
  const [createDialogType, setCreateDialogType] = useState<EntryType | null>(null);
  const [filters, setFilters] = useState<FeedFilterState>(defaultFeedFilters);
  const [offerPaneFilters, setOfferPaneFilters] =
    useState<BrokerWorkspacePaneFilters>(defaultPaneFilters);
  const [bidPaneFilters, setBidPaneFilters] = useState<BrokerWorkspacePaneFilters>(defaultPaneFilters);
  const [selectedEntry, setSelectedEntry] = useState<BrokerageEntry | null>(null);

  const filteredEntries = useMemo(
    () => filterBrokerageEntries(monitorState.standardizedFeed, filters),
    [monitorState.standardizedFeed, filters],
  );

  const offerEntries = useMemo(
    () =>
      filterBrokerageEntries(filteredEntries, {
        ...defaultFeedFilters,
        entryType: "offer",
        brokerProfileId: offerPaneFilters.brokerProfileId,
        search: offerPaneFilters.search,
      }),
    [filteredEntries, offerPaneFilters],
  );

  const bidEntries = useMemo(
    () =>
      filterBrokerageEntries(filteredEntries, {
        ...defaultFeedFilters,
        entryType: "bid",
        brokerProfileId: bidPaneFilters.brokerProfileId,
        search: bidPaneFilters.search,
      }),
    [bidPaneFilters, filteredEntries],
  );

  function updateFilter<K extends keyof FeedFilterState>(key: K, value: FeedFilterState[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  useEffect(() => {
    if (!selectedEntry) {
      return;
    }

    const visibleEntryIds = new Set([...offerEntries, ...bidEntries].map((entry) => entry.id));
    if (!visibleEntryIds.has(selectedEntry.id)) {
      setSelectedEntry(null);
    }
  }, [bidEntries, offerEntries, selectedEntry]);

  return (
    <MainLayout>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 pb-1">
        <MonitorToolbar
          filters={filters}
          onFilterChange={updateFilter}
          onCreateBid={() => setCreateDialogType("bid")}
          onCreateOffer={() => setCreateDialogType("offer")}
          session={session}
          onResetDemo={resetSeaBrokerageMonitorDemoData}
          onClearEntries={clearSeaBrokerageMonitorEntries}
          onReseedDemo={reseedSeaBrokerageMonitorDemoData}
          onAddSampleBid={() => addSeaBrokerageMonitorSampleEntry("bid")}
          onAddSampleOffer={() => addSeaBrokerageMonitorSampleEntry("offer")}
        />

        <section className="grid gap-2 xl:grid-cols-2">
          <BrokerWorkspacePane
            title="Offers"
            emptyTitle="No visible offers"
            emptyDescription="Adjust the offer-side filters, reseed demo data, or create a new OFFER."
            entries={offerEntries}
            selectedEntryId={selectedEntry?.type === "offer" ? selectedEntry.id : null}
            onSelectEntry={setSelectedEntry}
            filters={offerPaneFilters}
            onFiltersChange={setOfferPaneFilters}
          />
          <BrokerWorkspacePane
            title="Bids"
            emptyTitle="No visible bids"
            emptyDescription="Adjust the bid-side filters, reseed demo data, or create a new BID."
            entries={bidEntries}
            selectedEntryId={selectedEntry?.type === "bid" ? selectedEntry.id : null}
            onSelectEntry={setSelectedEntry}
            filters={bidPaneFilters}
            onFiltersChange={setBidPaneFilters}
          />
        </section>

        <ContextualMatchingPanel
          entries={filteredEntries}
          selectedEntry={selectedEntry}
        />

        <Collapsible>
          <div className="flex justify-end">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 text-muted-foreground">
                Secondary Views
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent>
            <StandardizedFeedCard entries={filteredEntries} />
          </CollapsibleContent>
        </Collapsible>
      </div>

      <EntryCreateDialog
        open={createDialogType === "bid"}
        onOpenChange={(open) => {
          if (!open) setCreateDialogType(null);
        }}
        entryType="bid"
        session={session}
      />
      <EntryCreateDialog
        open={createDialogType === "offer"}
        onOpenChange={(open) => {
          if (!open) setCreateDialogType(null);
        }}
        entryType="offer"
        session={session}
      />
    </MainLayout>
  );
}
