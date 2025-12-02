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

type ViewMode = "all" | "my";
type AnalyticsTab = "chain" | "volume" | "openInterest";

export default function OptionChain() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTab>("chain");
  const [selectedCommodity, setSelectedCommodity] = useState<string>("ALL");
  const [selectedExpiry, setSelectedExpiry] = useState<string>("");
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

  // Fetch options
  const { data: options = [], isLoading, error } = useQuery<Option[]>({
    queryKey: ["/api/options"],
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
    selectedExpiry && selectedExpiry !== ""
      ? format(new Date(selectedExpiry), "MMM dd, yyyy")
      : "All";
  const analyticsFiltersLabel = `Commodity: ${displayCommodity} • Expiry: ${displayExpiry}`;

  // Use the first available expiry as default if none selected
  const availableExpiries = volumeAnalytics.availableExpiries;
  const availableCommodities = volumeAnalytics.availableCommodities;
  
  // Set default expiry when expiries become available
  useEffect(() => {
    if (!selectedExpiry && availableExpiries.length > 0) {
      setSelectedExpiry(availableExpiries[0]);
    }
  }, [availableExpiries, selectedExpiry]);

  // Filter options based on view mode
  const filteredOptions = useMemo(() => {
    if (viewMode === "all") {
      return options;
    }
    
    // My Options: filter by current user's ID
    // User can be either buyer (buyerId) or issuer/seller (issuerId)
    if (!userId) {
      return [];
    }
    
    return options.filter((option) => {
      return option.buyerId === userId || option.issuerId === userId;
    });
  }, [options, viewMode, userId]);

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
          <TabsContent value="chain" className="mt-6">
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
          <Card>
            <CardHeader>
              <CardTitle>
                Option Chain {viewMode === "my" && `(${filteredOptions.length} contracts)`}
              </CardTitle>
            </CardHeader>
            <CardContent>
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
                />
              )}
            </CardContent>
          </Card>
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
