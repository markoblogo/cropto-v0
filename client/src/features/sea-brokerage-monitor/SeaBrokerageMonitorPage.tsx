import { useEffect, useMemo, useState } from "react";
import { MainLayout } from "@/components/layouts/MainLayout";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronDown } from "lucide-react";
import { BrokerWorkspacePane, type BrokerWorkspacePaneFilters } from "./components/BrokerWorkspacePane";
import { ContextualMatchingPanel } from "./components/ContextualMatchingPanel";
import { EntryCreateDialog } from "./components/EntryCreateDialog";
import { MonitorToolbar } from "./components/MonitorToolbar";
import { StandardizedFeedCard } from "./components/StandardizedFeedCard";
import { TelegramLoginWidget } from "./components/TelegramLoginWidget";
import { useSeaBrokerageTelegramSession } from "./hooks/useSeaBrokerageTelegramSession";
import { useSeaBrokerageMonitorState } from "./hooks/useSeaBrokerageMonitorState";
import {
  defaultFeedFilters,
  filterBrokerageEntries,
} from "./services/feedFilters.service";
import type { BrokerageEntry, EntryType, FeedFilterState } from "./types";

const defaultPaneFilters: BrokerWorkspacePaneFilters = {
  brokerProfileId: "all",
  search: "",
};

function buildBrokerOptions(entries: BrokerageEntry[]) {
  const byBroker = new Map<string, { code: string; name: string }>();
  for (const entry of entries) {
    if (!entry.brokerId) continue;
    if (!byBroker.has(entry.brokerId)) {
      byBroker.set(entry.brokerId, {
        code: entry.brokerCode,
        name: entry.brokerName,
      });
    }
  }

  return Array.from(byBroker.entries())
    .map(([value, broker]) => ({
      value,
      label: `${broker.code} (${broker.name})`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function SeaBrokerageMonitorPage() {
  const monitorState = useSeaBrokerageMonitorState();
  const session = useSeaBrokerageTelegramSession();
  const [createDialogType, setCreateDialogType] = useState<EntryType | null>(null);
  const [filters, setFilters] = useState<FeedFilterState>(defaultFeedFilters);
  const [offerPaneFilters, setOfferPaneFilters] =
    useState<BrokerWorkspacePaneFilters>(defaultPaneFilters);
  const [bidPaneFilters, setBidPaneFilters] = useState<BrokerWorkspacePaneFilters>(defaultPaneFilters);
  const [selectedEntry, setSelectedEntry] = useState<BrokerageEntry | null>(null);
  const [telegramAuthOpen, setTelegramAuthOpen] = useState(false);

  const filteredEntries = useMemo(
    () => filterBrokerageEntries(monitorState.standardizedFeed, filters),
    [monitorState.standardizedFeed, filters],
  );

  const globalBrokerOptions = useMemo(
    () => buildBrokerOptions(monitorState.standardizedFeed),
    [monitorState.standardizedFeed],
  );

  const offerEntriesBase = useMemo(
    () =>
      filterBrokerageEntries(filteredEntries, {
        ...defaultFeedFilters,
        entryType: "offer",
      }),
    [filteredEntries],
  );

  const bidEntriesBase = useMemo(
    () =>
      filterBrokerageEntries(filteredEntries, {
        ...defaultFeedFilters,
        entryType: "bid",
      }),
    [filteredEntries],
  );

  const offerBrokerOptions = useMemo(
    () => buildBrokerOptions(offerEntriesBase),
    [offerEntriesBase],
  );

  const bidBrokerOptions = useMemo(
    () => buildBrokerOptions(bidEntriesBase),
    [bidEntriesBase],
  );

  const offerEntries = useMemo(
    () =>
      filterBrokerageEntries(offerEntriesBase, {
        ...defaultFeedFilters,
        brokerProfileId: offerPaneFilters.brokerProfileId,
        search: offerPaneFilters.search,
      }),
    [offerEntriesBase, offerPaneFilters],
  );

  const bidEntries = useMemo(
    () =>
      filterBrokerageEntries(bidEntriesBase, {
        ...defaultFeedFilters,
        brokerProfileId: bidPaneFilters.brokerProfileId,
        search: bidPaneFilters.search,
      }),
    [bidEntriesBase, bidPaneFilters],
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

  useEffect(() => {
    function handleOpenTelegramAuth() {
      setTelegramAuthOpen(true);
    }

    function handleLogoutTelegramAuth() {
      session.logoutTelegramSession();
      setTelegramAuthOpen(false);
    }

    window.addEventListener("sea-brokerage:open-telegram-auth", handleOpenTelegramAuth);
    window.addEventListener("sea-brokerage:logout-telegram-auth", handleLogoutTelegramAuth);
    return () => {
      window.removeEventListener("sea-brokerage:open-telegram-auth", handleOpenTelegramAuth);
      window.removeEventListener("sea-brokerage:logout-telegram-auth", handleLogoutTelegramAuth);
    };
  }, [session]);

  useEffect(() => {
    if (
      filters.brokerProfileId !== "all" &&
      !globalBrokerOptions.some((option) => option.value === filters.brokerProfileId)
    ) {
      setFilters((prev) => ({ ...prev, brokerProfileId: "all" }));
    }
  }, [filters.brokerProfileId, globalBrokerOptions]);

  useEffect(() => {
    if (
      offerPaneFilters.brokerProfileId !== "all" &&
      !offerBrokerOptions.some((option) => option.value === offerPaneFilters.brokerProfileId)
    ) {
      setOfferPaneFilters((prev) => ({ ...prev, brokerProfileId: "all" }));
    }
  }, [offerBrokerOptions, offerPaneFilters.brokerProfileId]);

  useEffect(() => {
    if (
      bidPaneFilters.brokerProfileId !== "all" &&
      !bidBrokerOptions.some((option) => option.value === bidPaneFilters.brokerProfileId)
    ) {
      setBidPaneFilters((prev) => ({ ...prev, brokerProfileId: "all" }));
    }
  }, [bidBrokerOptions, bidPaneFilters.brokerProfileId]);

  useEffect(() => {
    if (session.monitorAuthToken && telegramAuthOpen) {
      setTelegramAuthOpen(false);
    }
  }, [session.monitorAuthToken, telegramAuthOpen]);

  return (
    <MainLayout>
      <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-0.5 overflow-x-hidden pb-1 sm:gap-1">
        <MonitorToolbar
          filters={filters}
          onFilterChange={updateFilter}
          brokerOptions={globalBrokerOptions}
        />

        <section className="grid min-w-0 gap-0.5 overflow-hidden xl:grid-cols-2 sm:gap-1">
          <BrokerWorkspacePane
            title="Offers"
            emptyTitle="No visible offers"
            emptyDescription="Adjust the offer-side filters or create a new OFFER."
            entries={offerEntries}
            brokerOptions={offerBrokerOptions}
            selectedEntryId={selectedEntry?.type === "offer" ? selectedEntry.id : null}
            onSelectEntry={setSelectedEntry}
            filters={offerPaneFilters}
            onFiltersChange={setOfferPaneFilters}
            createActionLabel="Create OFFER"
            createActionVariant="secondary"
            onCreateAction={() => setCreateDialogType("offer")}
          />
          <BrokerWorkspacePane
            title="Bids"
            emptyTitle="No visible bids"
            emptyDescription="Adjust the bid-side filters or create a new BID."
            entries={bidEntries}
            brokerOptions={bidBrokerOptions}
            selectedEntryId={selectedEntry?.type === "bid" ? selectedEntry.id : null}
            onSelectEntry={setSelectedEntry}
            filters={bidPaneFilters}
            onFiltersChange={setBidPaneFilters}
            createActionLabel="Create BID"
            onCreateAction={() => setCreateDialogType("bid")}
          />
        </section>

        <ContextualMatchingPanel
          entries={filteredEntries}
          selectedEntry={selectedEntry}
        />

        <Collapsible>
          <div className="flex justify-end">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 text-[10.5px] text-muted-foreground sm:h-6.5 sm:text-xs">
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

      <Dialog open={telegramAuthOpen} onOpenChange={setTelegramAuthOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Telegram Sign-in</DialogTitle>
            <DialogDescription>
              Sign in with Telegram to create BID/OFFER entries in Sea Brokerage Monitor.
            </DialogDescription>
          </DialogHeader>

          {session.monitorAuthToken && session.telegramHandle ? (
            <div className="space-y-2">
              <div className="rounded-md border border-emerald-300/70 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                Authorized as {session.telegramHandle}
                {session.authorProfile ? ` · ${session.authorProfile.brokerCode}` : ""}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  session.logoutTelegramSession();
                }}
              >
                Sign out Telegram
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <TelegramLoginWidget
                botUsername={session.telegramBotUsername}
                miniAppShortName={session.telegramMiniAppShortName}
                onAuth={session.authenticateWithTelegram}
                onUseTelegramWebApp={session.authenticateFromTelegramWebApp}
                isAuthorizing={session.isLoading}
              />
            </div>
          )}

          {session.authError ? (
            <div className="rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {session.authError}
            </div>
          ) : null}
          {session.isLoading ? (
            <div className="text-xs text-muted-foreground">Authorizing Telegram session...</div>
          ) : null}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
