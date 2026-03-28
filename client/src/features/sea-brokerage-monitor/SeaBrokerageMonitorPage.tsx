import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MainLayout } from "@/components/layouts/MainLayout";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ChevronDown } from "lucide-react";
import { BrokerWorkspacePane, type BrokerWorkspacePaneFilters } from "./components/BrokerWorkspacePane";
import { ContextualMatchingPanel } from "./components/ContextualMatchingPanel";
import { EntryCreateDialog } from "./components/EntryCreateDialog";
import { MonitorToolbar } from "./components/MonitorToolbar";
import { StandardizedFeedCard } from "./components/StandardizedFeedCard";
import { useSeaBrokerageTelegramSession } from "./hooks/useSeaBrokerageTelegramSession";
import { useSeaBrokerageMonitorState } from "./hooks/useSeaBrokerageMonitorState";
import { buildSeaBrokerageMonitorAuthHeaders } from "./services/monitorAuth.service";
import {
  defaultFeedFilters,
  filterBrokerageEntries,
} from "./services/feedFilters.service";
import type { BrokerageEntry, EntryType, FeedFilterState, FilterPreset } from "./types";
import { queryClient } from "@/lib/queryClient";

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
  const [tradePaneFilters, setTradePaneFilters] = useState<BrokerWorkspacePaneFilters>(defaultPaneFilters);
  const [selectedEntry, setSelectedEntry] = useState<BrokerageEntry | null>(null);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [telegramAuthOpen, setTelegramAuthOpen] = useState(false);
  const [telegramUsername, setTelegramUsername] = useState("");
  const [magicLinkRequested, setMagicLinkRequested] = useState(false);
  const defaultPresetAppliedTokenRef = useRef<string | null>(null);

  const { data: filterPresets = [] } = useQuery<FilterPreset[]>({
    queryKey: ["/api/sea-brokerage-monitor/filter-presets", session.monitorAuthToken],
    enabled: !!session.monitorAuthToken,
    queryFn: async () => {
      const response = await fetch("/api/sea-brokerage-monitor/filter-presets", {
        method: "GET",
        headers: buildSeaBrokerageMonitorAuthHeaders(session.monitorAuthToken),
      });
      if (!response.ok) return [];
      return response.json();
    },
  });

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

  const tradeEntriesBase = useMemo(
    () =>
      filterBrokerageEntries(filteredEntries, {
        ...defaultFeedFilters,
        entryType: "trade",
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

  const tradeBrokerOptions = useMemo(
    () => buildBrokerOptions(tradeEntriesBase),
    [tradeEntriesBase],
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

  const tradeEntries = useMemo(
    () =>
      filterBrokerageEntries(tradeEntriesBase, {
        ...defaultFeedFilters,
        brokerProfileId: tradePaneFilters.brokerProfileId,
        search: tradePaneFilters.search,
      }),
    [tradeEntriesBase, tradePaneFilters],
  );

  function handleOfferPaneFiltersChange(next: BrokerWorkspacePaneFilters) {
    setActivePresetId(null);
    setOfferPaneFilters(next);
  }

  function handleBidPaneFiltersChange(next: BrokerWorkspacePaneFilters) {
    setActivePresetId(null);
    setBidPaneFilters(next);
  }

  function handleTradePaneFiltersChange(next: BrokerWorkspacePaneFilters) {
    setActivePresetId(null);
    setTradePaneFilters(next);
  }

  function updateFilter<K extends keyof FeedFilterState>(key: K, value: FeedFilterState[K]) {
    setActivePresetId(null);
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function applyPreset(preset: FilterPreset) {
    setFilters((prev) => ({
      ...prev,
      commodity: (preset.filters.commodity as FeedFilterState["commodity"]) || "all",
      basis: (preset.filters.basis as FeedFilterState["basis"]) || "all",
      brokerProfileId: preset.filters.brokerProfileId || "all",
      originCountry: preset.filters.originCountry || "all",
      deliveryPlace: preset.filters.deliveryPlace || "all",
      search: preset.filters.search || "",
    }));
    setOfferPaneFilters({
      brokerProfileId: preset.offerPaneFilters.brokerProfileId || "all",
      search: preset.offerPaneFilters.search || "",
    });
    setBidPaneFilters({
      brokerProfileId: preset.bidPaneFilters.brokerProfileId || "all",
      search: preset.bidPaneFilters.search || "",
    });
    setTradePaneFilters({
      brokerProfileId: preset.tradePaneFilters.brokerProfileId || "all",
      search: preset.tradePaneFilters.search || "",
    });
    setActivePresetId(preset.id);
  }

  async function handleSavePreset() {
    if (!session.monitorAuthToken) {
      setTelegramAuthOpen(true);
      return;
    }
    const name = window.prompt("View name", "My view");
    if (!name || !name.trim()) return;
    await fetch("/api/sea-brokerage-monitor/filter-presets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildSeaBrokerageMonitorAuthHeaders(session.monitorAuthToken),
      },
      body: JSON.stringify({
        name: name.trim(),
        isDefault: false,
        filters: {
          commodity: filters.commodity,
          basis: filters.basis,
          brokerProfileId: filters.brokerProfileId,
          originCountry: filters.originCountry,
          deliveryPlace: filters.deliveryPlace,
          search: filters.search,
        },
        offerPaneFilters,
        bidPaneFilters,
        tradePaneFilters,
      }),
    });
    await queryClient.invalidateQueries({
      queryKey: ["/api/sea-brokerage-monitor/filter-presets", session.monitorAuthToken],
    });
  }

  async function handleSetDefaultPreset() {
    if (!session.monitorAuthToken || !activePresetId) return;
    await fetch(`/api/sea-brokerage-monitor/filter-presets/${activePresetId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...buildSeaBrokerageMonitorAuthHeaders(session.monitorAuthToken),
      },
      body: JSON.stringify({ isDefault: true }),
    });
    await queryClient.invalidateQueries({
      queryKey: ["/api/sea-brokerage-monitor/filter-presets", session.monitorAuthToken],
    });
  }

  async function handleDeletePreset() {
    if (!session.monitorAuthToken || !activePresetId) return;
    await fetch(`/api/sea-brokerage-monitor/filter-presets/${activePresetId}`, {
      method: "DELETE",
      headers: buildSeaBrokerageMonitorAuthHeaders(session.monitorAuthToken),
    });
    setActivePresetId(null);
    await queryClient.invalidateQueries({
      queryKey: ["/api/sea-brokerage-monitor/filter-presets", session.monitorAuthToken],
    });
  }

  async function handleToggleLike(entry: BrokerageEntry) {
    if (entry.type !== "bid" && entry.type !== "offer") {
      return;
    }
    if (!session.canCreateEntries) {
      setTelegramAuthOpen(true);
      return;
    }

    try {
      await fetch(`/api/sea-brokerage-monitor/entries/${entry.id}/likes/toggle`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildSeaBrokerageMonitorAuthHeaders(session.monitorAuthToken),
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/sea-brokerage-monitor/entries"] });
    } catch {
      // Ignore transient like errors in UI to keep tape interactions fast.
    }
  }

  useEffect(() => {
    if (!selectedEntry) {
      return;
    }

    const visibleEntryIds = new Set([...offerEntries, ...bidEntries, ...tradeEntries].map((entry) => entry.id));
    if (!visibleEntryIds.has(selectedEntry.id)) {
      setSelectedEntry(null);
    }
  }, [bidEntries, offerEntries, selectedEntry, tradeEntries]);

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
    if (
      tradePaneFilters.brokerProfileId !== "all" &&
      !tradeBrokerOptions.some((option) => option.value === tradePaneFilters.brokerProfileId)
    ) {
      setTradePaneFilters((prev) => ({ ...prev, brokerProfileId: "all" }));
    }
  }, [tradeBrokerOptions, tradePaneFilters.brokerProfileId]);

  useEffect(() => {
    if (session.monitorAuthToken && telegramAuthOpen) {
      setTelegramAuthOpen(false);
      setTelegramUsername("");
      setMagicLinkRequested(false);
    }
  }, [session.monitorAuthToken, telegramAuthOpen]);

  useEffect(() => {
    if (!session.monitorAuthToken) {
      defaultPresetAppliedTokenRef.current = null;
      setActivePresetId(null);
      return;
    }
    if (defaultPresetAppliedTokenRef.current === session.monitorAuthToken) {
      return;
    }
    const defaultPreset = filterPresets.find((preset) => preset.isDefault);
    if (defaultPreset) {
      applyPreset(defaultPreset);
    }
    defaultPresetAppliedTokenRef.current = session.monitorAuthToken;
  }, [filterPresets, session.monitorAuthToken]);

  async function handleRequestTelegramMagicLink() {
    const normalized = telegramUsername.trim().replace(/^@+/, "");
    if (!normalized) return;
    await session.requestTelegramMagicLinkLogin(normalized);
    setMagicLinkRequested(true);
  }

  return (
    <MainLayout>
      <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-0.5 overflow-x-hidden pb-1 sm:gap-1">
        <MonitorToolbar
          filters={filters}
          onFilterChange={updateFilter}
          brokerOptions={globalBrokerOptions}
          canManagePresets={session.canCreateEntries}
          presetOptions={filterPresets.map((preset) => ({
            value: preset.id,
            label: `${preset.isDefault ? "★ " : ""}${preset.name}`,
          }))}
          activePresetId={activePresetId}
          onApplyPreset={(presetId) => {
            const preset = filterPresets.find((item) => item.id === presetId);
            if (!preset) return;
            applyPreset(preset);
          }}
          onSavePreset={() => void handleSavePreset()}
          onSetDefaultPreset={() => void handleSetDefaultPreset()}
          onDeletePreset={() => void handleDeletePreset()}
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
            onFiltersChange={handleOfferPaneFiltersChange}
            likesEnabled
            onToggleLike={handleToggleLike}
            currentBrokerId={session.authorProfile?.id ?? null}
            currentBrokerCode={session.authorProfile?.brokerCode ?? null}
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
            onFiltersChange={handleBidPaneFiltersChange}
            likesEnabled
            onToggleLike={handleToggleLike}
            currentBrokerId={session.authorProfile?.id ?? null}
            currentBrokerCode={session.authorProfile?.brokerCode ?? null}
            createActionLabel="Create BID"
            onCreateAction={() => setCreateDialogType("bid")}
          />
        </section>

        <section className="grid min-w-0 gap-0.5 overflow-hidden xl:grid-cols-2 sm:gap-1">
          <ContextualMatchingPanel
            entries={filteredEntries}
            selectedEntry={selectedEntry}
            monitorAuthToken={session.monitorAuthToken}
            canLikeMatches={session.canCreateEntries}
            currentBrokerCode={session.authorProfile?.brokerCode ?? null}
            onRequireAuth={() => setTelegramAuthOpen(true)}
          />
          <BrokerWorkspacePane
            title="Trades"
            emptyTitle="No visible trades"
            emptyDescription="Create a new TRADE or adjust trade-side filters."
            entries={tradeEntries}
            brokerOptions={tradeBrokerOptions}
            selectedEntryId={selectedEntry?.type === "trade" ? selectedEntry.id : null}
            onSelectEntry={setSelectedEntry}
            filters={tradePaneFilters}
            onFiltersChange={handleTradePaneFiltersChange}
            likesEnabled={false}
            createActionLabel="Create TRADE"
            createActionVariant="default"
            createActionClassName="bg-teal-500/85 text-white hover:bg-teal-400 border border-teal-300/70"
            onCreateAction={() => setCreateDialogType("trade")}
          />
        </section>

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
      <EntryCreateDialog
        open={createDialogType === "trade"}
        onOpenChange={(open) => {
          if (!open) setCreateDialogType(null);
        }}
        entryType="trade"
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
              <div className="rounded-md border border-border/70 p-3">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Sign in via Telegram link
                </div>
                <div className="space-y-2">
                  <Input
                    value={telegramUsername}
                    onChange={(event) => setTelegramUsername(event.target.value)}
                    placeholder="@username"
                  />
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => void handleRequestTelegramMagicLink()}
                    disabled={session.isLoading || !telegramUsername.trim()}
                  >
                    Send sign-in link in Telegram
                  </Button>
                  {magicLinkRequested ? (
                    <div className="text-[11px] text-muted-foreground">
                      Link sent in Telegram DM. Open it from Telegram to complete sign-in automatically.
                    </div>
                  ) : null}
                </div>
              </div>
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
