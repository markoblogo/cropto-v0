import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { MainLayout } from "@/components/layouts/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { OptionsTable } from "@/components/OptionsTable";
import { CreateOptionDialog } from "@/components/CreateOptionDialog";
import { OptionAnalyticsChart } from "@/components/OptionAnalyticsChart";
import { useOptionAnalytics } from "@/hooks/useOptionAnalytics";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Option, InsertOption } from "@shared/schema";
import { Plus } from "lucide-react";
import { format } from "date-fns";
import { OrderBook } from "@/components/trading/OrderBook";
import { SPOT_ALLOWED_SLUGS } from "@/lib/indexMapping";
import { MARGIN_PROFILES, MarginProfileId, getMarginProfile } from "@/lib/marginProfiles";

type ViewMode = "all" | "my";
type AnalyticsTab = "chain" | "volume" | "openInterest";

export default function OptionChain() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTab>("chain");
  const [selectedCommodity, setSelectedCommodity] = useState<string>("ALL");
  const [selectedExpiry, setSelectedExpiry] = useState<string>("ALL");
  const [selectedType, setSelectedType] = useState<string>("ALL");
  const [marginProfileId, setMarginProfileId] = useState<MarginProfileId>("standard");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [prefillOption, setPrefillOption] = useState<Option | null>(null);

  // Fetch current user
  const { data: userData } = useQuery<{ 
    user: { 
      id: string; 
      email: string; 
      role: string;
      walletAddress?: string;
    } 
  } | null>({
    queryKey: ["/api/auth/me"],
    retry: false,
    enabled: !!localStorage.getItem('cropto_token'),
  });

  const user = userData?.user;
  const userId = user?.id;
  const hasToken = !!localStorage.getItem("cropto_token");

  // Fetch options
  const { data: options = [], isLoading, error } = useQuery<Option[]>({
    queryKey: ["/api/options"],
  });

  // Trades for simple volume count per option
  const { data: trades = [] } = useQuery<{ optionId: string }[]>({
    queryKey: ["/api/trades"],
  });

  // Fetch analytics data for Volume and Open Interest tabs
  const volumeAnalytics = useOptionAnalytics({
    commodity: selectedCommodity !== "ALL" ? selectedCommodity : undefined,
    expiry: selectedExpiry || undefined,
    metric: "volume",
  });

  const openInterestAnalytics = useOptionAnalytics({
    commodity: selectedCommodity !== "ALL" ? selectedCommodity : undefined,
    expiry: selectedExpiry || undefined,
    metric: "openInterest",
  });

  const displayCommodity =
    selectedCommodity === "ALL" ? "All" : selectedCommodity || "All";
  const displayExpiry =
    selectedExpiry && selectedExpiry !== "ALL"
      ? selectedExpiry
      : "All";
  const analyticsFiltersLabel = `Commodity: ${displayCommodity} • Expiry: ${displayExpiry}`;

  // Use the first available expiry as default if none selected
  const availableExpiries = volumeAnalytics.availableExpiries;
  const availableCommodities = volumeAnalytics.availableCommodities;

  // Filter options based on view mode
  const expiryOptions = useMemo(() => {
    const set = new Set<string>();
    options.forEach((opt) => {
      const label =
        (opt as any).expiryWindow && (opt as any).expiryWindow.length > 0
          ? (opt as any).expiryWindow
          : opt.expirationDate
          ? format(new Date(opt.expirationDate), "MMM dd, yyyy")
          : "";
      if (label) set.add(label);
    });
    return Array.from(set).sort();
  }, [options]);

  const commodityOptions = useMemo(() => {
    const set = new Set<string>();
    options.forEach((opt) => {
      const commodityName = (opt as any).commodityName || opt.commodity;
      if (commodityName) set.add(commodityName);
    });
    // Keep ordering aligned with known spot commodities when possible
    const ordered = Array.from(set).sort((a, b) => {
      const aIdx = SPOT_ALLOWED_SLUGS.findIndex((slug) => a.toLowerCase().includes(slug));
      const bIdx = SPOT_ALLOWED_SLUGS.findIndex((slug) => b.toLowerCase().includes(slug));
      if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });
    return ordered;
  }, [options]);

  const volumeMap = useMemo(() => {
    const map: Record<string, number> = {};
    trades.forEach((t) => {
      if (t.optionId) {
        map[t.optionId] = (map[t.optionId] || 0) + 1;
      }
    });
    return map;
  }, [trades]);


  const filteredOptions = useMemo(() => {
    let base = options;
    if (viewMode === "my") {
      base = userId ? options.filter((option) => option.buyerId === userId || option.issuerId === userId) : [];
    }

    return base.filter((opt) => {
      const commodityName = (opt as any).commodityName || opt.commodity || "";
      const expiryLabel =
        (opt as any).expiryWindow && (opt as any).expiryWindow.length > 0
          ? (opt as any).expiryWindow
          : opt.expirationDate
          ? format(new Date(opt.expirationDate), "MMM dd, yyyy")
          : "";
      const matchesCommodity = selectedCommodity === "ALL" || commodityName === selectedCommodity;
      const matchesExpiry = selectedExpiry === "ALL" || expiryLabel === selectedExpiry;
      const matchesType = selectedType === "ALL" || opt.type === selectedType;
      return matchesCommodity && matchesExpiry && matchesType;
    });
  }, [options, viewMode, userId, selectedCommodity, selectedExpiry, selectedType]);

  // Create option mutation
  const createOptionMutation = useMutation({
    mutationFn: async (data: InsertOption) => {
      const response = await apiRequest("POST", "/api/options", data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/options"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/me"] });
      toast({
        title: "Success",
        description: "Option created successfully",
      });
      setIsCreateDialogOpen(false);
      setPrefillOption(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create option",
        variant: "destructive",
      });
    },
  });

  // Match option mutation
  const matchOptionMutation = useMutation({
    mutationFn: async ({ optionId, counterpartyId }: { optionId: string; counterpartyId: string }) => {
      const response = await apiRequest("POST", `/api/options/${optionId}/match`, { counterpartyId });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/options"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spot/positions"] });
      toast({
        title: "Option matched successfully",
        description: "Your position is now updated in the portfolio.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to match option",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  // Exercise option mutation
  const exerciseOptionMutation = useMutation({
    mutationFn: async ({ optionId, spotPrice }: { optionId: string; spotPrice: number }) => {
      const response = await apiRequest("POST", `/api/options/${optionId}/exercise`, { spotPrice });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/options"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settlements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spot/positions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/me"] });
      toast({
        title: "Exercise successful",
        description: "Your option has been exercised and your spot position and CROPT balance are updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Exercise failed",
        description: error.message || "Failed to exercise option. Please check your CROPT balance and try again.",
        variant: "destructive",
      });
    },
  });

  // Simulate margin call mutation
  const simulateMarginCallMutation = useMutation({
    mutationFn: async ({ indexPrice, commodity }: { indexPrice: number; commodity?: string }) => {
      const response = await apiRequest("POST", "/api/jobs/run-margin-check", { 
        indexPrice,
        commodity,
      });
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/options"] });
      queryClient.invalidateQueries({ queryKey: ["/api/margin-calls"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({
        title: "Margin Check Complete",
        description: `Processed ${data.optionsProcessed} options. Created ${data.marginCalls?.length || 0} margin calls.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Margin Check Failed",
        description: error.message || "Failed to run margin check",
        variant: "destructive",
      });
    },
  });

  // Force settle mutation
  const forceSettleMutation = useMutation({
    mutationFn: async ({ optionId, reason }: { optionId: string; reason: string }) => {
      const response = await apiRequest("POST", `/api/options/${optionId}/force-settle`, { 
        reason 
      });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/options"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/me"] });
      toast({
        title: "Option settled",
        description: "The option has been force-settled.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Settlement failed",
        description: error.message || "Failed to settle option",
        variant: "destructive",
      });
    },
  });

  // Top up margin call mutation
  const topUpMarginCallMutation = useMutation({
    mutationFn: async ({ marginCallId, amount, currency }: { marginCallId: string; amount: number; currency: string }) => {
      const response = await apiRequest("POST", `/api/margin-call/${marginCallId}/topup`, { 
        amount,
        currency,
      });
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/options"] });
      queryClient.invalidateQueries({ queryKey: ["/api/margin-calls"] });
      toast({
        title: data.resolved ? "Margin Call Resolved" : "Top-up Successful",
        description: data.resolved 
          ? "Margin call has been resolved. Option status restored to OPEN." 
          : `Added ${data.marginCall.reservedCollateral} to collateral. Total available: ${data.totalAvailable}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Top-up Failed",
        description: error.message || "Failed to top up margin call",
        variant: "destructive",
      });
    },
  });

  // Withdraw mutation
  const withdrawMutation = useMutation({
    mutationFn: async ({ optionId, address, amount }: { optionId: string; address: string; amount: string }) => {
      const response = await apiRequest("POST", "/api/onchain/mint", { 
        optionId, 
        toAddress: address, 
        amount 
      });
      const data = await response.json();
      return { txHash: data.txHash };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/onchain/transactions"] });
      toast({
        title: "Withdrawal Initiated",
        description: `Transaction: ${data.txHash.substring(0, 10)}...`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Withdrawal Failed",
        description: error.message || "Failed to initiate withdrawal",
        variant: "destructive",
      });
    },
  });

  // Handle create option from table row
  const handleCreateFromOption = (option: Option) => {
    setPrefillOption(option);
    setIsCreateDialogOpen(true);
  };

  // Handle create option submit
  const handleCreateOption = async (data: InsertOption) => {
    await createOptionMutation.mutateAsync(data);
  };

  // Empty state for My Options
  const showMyOptionsEmpty = viewMode === "my" && filteredOptions.length === 0 && !isLoading;
  const showAllMarketEmpty = viewMode === "all" && filteredOptions.length === 0 && !isLoading && options.length === 0;

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Options</h1>
            <p className="text-muted-foreground mt-2">
              Browse and trade commodity options contracts
            </p>
          </div>
          <Button
            onClick={() => {
              setPrefillOption(null);
              setIsCreateDialogOpen(true);
            }}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Option
          </Button>
        </div>

        {/* View Mode Tabs */}
        <Card>
          <CardContent className="pt-6">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
              <TabsList>
                <TabsTrigger value="all">All Market</TabsTrigger>
                <TabsTrigger value="my">My Options</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardContent>
        </Card>

        {/* Main Analytics Tabs */}
        <Tabs value={analyticsTab} onValueChange={(v) => setAnalyticsTab(v as AnalyticsTab)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="chain">Chain</TabsTrigger>
            <TabsTrigger value="volume">Volume</TabsTrigger>
            <TabsTrigger value="openInterest">Open Interest</TabsTrigger>
          </TabsList>

        {/* Chain Tab - Current Options Table */}
        <TabsContent value="chain" className="mt-6 space-y-6">
            {error ? (
          <Alert variant="destructive">
            <AlertDescription>
              Failed to load options. Please try again.
            </AlertDescription>
          </Alert>
        ) : showMyOptionsEmpty ? (
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="rounded-full bg-muted p-6 mb-4">
                  <Plus className="w-12 h-12 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No Options Yet</h3>
                <p className="text-sm text-muted-foreground max-w-sm mb-4">
                  You don't have any options yet. Create your first option from the market list above.
                </p>
                <Button
                  onClick={() => {
                    setViewMode("all");
                    setPrefillOption(null);
                    setIsCreateDialogOpen(true);
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create Option
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : showAllMarketEmpty ? (
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="rounded-full bg-muted p-6 mb-4">
                  <Plus className="w-12 h-12 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No Options Found</h3>
                <p className="text-sm text-muted-foreground max-w-sm mb-4">
                  Get started by creating your first option contract.
                </p>
                <Button
                  onClick={() => {
                    setPrefillOption(null);
                    setIsCreateDialogOpen(true);
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create Option
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>
                  Option Chain {viewMode === "my" && `(${filteredOptions.length} contracts)`}
                </CardTitle>
                {/* Chain-like view: extend here with IV/Greeks once available */}
              </CardHeader>
              <CardContent>
                {/* Chain-like filters: commodity, expiry window, type, margin profile (display-only mapping to usePremiumAsMargin) */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                  <div className="space-y-2">
                    <Label>Commodity</Label>
                    <Select value={selectedCommodity} onValueChange={setSelectedCommodity}>
                      <SelectTrigger>
                        <SelectValue placeholder="All commodities" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All</SelectItem>
                        {commodityOptions.map((commodity) => (
                          <SelectItem key={commodity} value={commodity}>
                            {commodity}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Expiry window</Label>
                    <Select value={selectedExpiry} onValueChange={setSelectedExpiry}>
                      <SelectTrigger>
                        <SelectValue placeholder="All expiries" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All</SelectItem>
                        {expiryOptions.map((expiry) => (
                          <SelectItem key={expiry} value={expiry}>
                            {expiry}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={selectedType} onValueChange={setSelectedType}>
                      <SelectTrigger>
                        <SelectValue placeholder="All types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All</SelectItem>
                        <SelectItem value="CALL">Call</SelectItem>
                        <SelectItem value="PUT">Put</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Margin profile</Label>
                    <Select value={marginProfileId} onValueChange={(v) => setMarginProfileId(v as MarginProfileId)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Margin profile" />
                      </SelectTrigger>
                      <SelectContent>
                        {MARGIN_PROFILES.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Display-only: maps to usePremiumAsMargin and optional risk multiplier.
                    </p>
                  </div>
                </div>

                {isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : viewMode === "my" && !userId ? (
                  <Alert>
                    <AlertDescription>
                      Connect wallet to see your options
                    </AlertDescription>
                  </Alert>
                ) : (
                  <OptionsTable
                    options={filteredOptions}
                    isLoading={isLoading}
                    onMatch={async (optionId, counterpartyId) => {
                      await matchOptionMutation.mutateAsync({ optionId, counterpartyId });
                    }}
                    isMatching={matchOptionMutation.isPending}
                    onExercise={async (optionId, spotPrice) => {
                      await exerciseOptionMutation.mutateAsync({ optionId, spotPrice });
                    }}
                    isExercising={exerciseOptionMutation.isPending}
                    onSimulate={async (optionId, indexPrice, commodity) => {
                      await simulateMarginCallMutation.mutateAsync({ indexPrice, commodity });
                    }}
                    isSimulating={simulateMarginCallMutation.isPending}
                    onForceSettle={async (optionId, reason) => {
                      await forceSettleMutation.mutateAsync({ optionId, reason });
                    }}
                    isForceSettling={forceSettleMutation.isPending}
                    onTopUp={async (marginCallId, amount, currency) => {
                      await topUpMarginCallMutation.mutateAsync({ marginCallId, amount, currency });
                    }}
                    isTopping={topUpMarginCallMutation.isPending}
                    onWithdraw={async (data) => {
                      return await withdrawMutation.mutateAsync(data);
                    }}
                    isWithdrawing={withdrawMutation.isPending}
                    onCreateFromOption={handleCreateFromOption}
                    userRole={user?.role}
                    userId={userId}
                    volumeMap={volumeMap}
                    marginProfile={getMarginProfile(marginProfileId)}
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Options Order Book (by expiry window)</CardTitle>
              </CardHeader>
              <CardContent>
                {hasToken ? (
                  <OrderBook
                    mode="options"
                    commodity={selectedCommodity !== "ALL" ? selectedCommodity : (availableCommodities[0] || "")}
                    window={selectedExpiry || undefined}
                    depth={5}
                  />
                ) : (
                  <div className="space-y-3 text-sm text-muted-foreground">
                    <p>Log in to view the options order book.</p>
                    <Button size="sm" onClick={() => setLocation("/login")}>
                      Login
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
            )}
          </TabsContent>

          {/* Volume Tab */}
          <TabsContent value="volume" className="mt-6 space-y-4">
            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle>Filters</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Commodity</Label>
                    <Select value={selectedCommodity} onValueChange={setSelectedCommodity}>
                      <SelectTrigger>
                        <SelectValue placeholder="All commodities" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All</SelectItem>
                        {availableCommodities.map((commodity) => (
                          <SelectItem key={commodity} value={commodity}>
                            {commodity}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Expiry</Label>
                    <Select value={selectedExpiry} onValueChange={setSelectedExpiry}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select expiry" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All</SelectItem>
                        {availableExpiries.map((expiry) => (
                          <SelectItem key={expiry} value={expiry}>
                            {format(new Date(expiry), "MMM dd, yyyy")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Volume Chart */}
            {volumeAnalytics.isLoading ? (
              <Card>
                <CardContent className="pt-6">
                  <Skeleton className="h-96 w-full" />
                </CardContent>
              </Card>
            ) : volumeAnalytics.error ? (
              <Alert variant="destructive">
                <AlertDescription>
                  Failed to load volume data. Please try again.
                </AlertDescription>
              </Alert>
            ) : (
              <OptionAnalyticsChart
                data={volumeAnalytics.data}
                metric="volume"
                filtersLabel={analyticsFiltersLabel}
                commodity={selectedCommodity !== "ALL" ? selectedCommodity : undefined}
                expiry={selectedExpiry || undefined}
              />
            )}
          </TabsContent>

          {/* Open Interest Tab */}
          <TabsContent value="openInterest" className="mt-6 space-y-4">
            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle>Filters</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Commodity</Label>
                    <Select value={selectedCommodity} onValueChange={setSelectedCommodity}>
                      <SelectTrigger>
                        <SelectValue placeholder="All commodities" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All</SelectItem>
                        {availableCommodities.map((commodity) => (
                          <SelectItem key={commodity} value={commodity}>
                            {commodity}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Expiry</Label>
                    <Select value={selectedExpiry} onValueChange={setSelectedExpiry}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select expiry" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableExpiries.map((expiry) => (
                          <SelectItem key={expiry} value={expiry}>
                            {format(new Date(expiry), "MMM dd, yyyy")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Open Interest Chart */}
            {openInterestAnalytics.isLoading ? (
              <Card>
                <CardContent className="pt-6">
                  <Skeleton className="h-96 w-full" />
                </CardContent>
              </Card>
            ) : openInterestAnalytics.error ? (
              <Alert variant="destructive">
                <AlertDescription>
                  Failed to load open interest data. Please try again.
                </AlertDescription>
              </Alert>
            ) : (
              <OptionAnalyticsChart
                data={openInterestAnalytics.data}
                metric="openInterest"
                filtersLabel={analyticsFiltersLabel}
                commodity={selectedCommodity !== "ALL" ? selectedCommodity : undefined}
                expiry={selectedExpiry || undefined}
              />
            )}
          </TabsContent>
        </Tabs>

        {/* Create Option Dialog */}
        <CreateOptionDialog
          onSubmit={handleCreateOption}
          isPending={createOptionMutation.isPending}
          open={isCreateDialogOpen}
          onOpenChange={setIsCreateDialogOpen}
          defaultIndexId={prefillOption?.indexId}
          prefillOption={prefillOption ? {
            indexId: prefillOption.indexId || undefined,
            type: prefillOption.type as "CALL" | "PUT" | undefined,
            strike: prefillOption.strike || undefined,
            qty: prefillOption.qty || undefined,
            premium: prefillOption.premium || undefined,
            expirationDate: prefillOption.expirationDate 
              ? (typeof prefillOption.expirationDate === 'string' 
                ? new Date(prefillOption.expirationDate) 
                : prefillOption.expirationDate)
              : undefined,
          } : null}
        />
      </div>
    </MainLayout>
  );
}
