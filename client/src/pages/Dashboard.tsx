import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation } from "wouter";
import { CreateOptionDialog } from "@/components/CreateOptionDialog";
import { OptionsTable } from "@/components/OptionsTable";
import { Hero } from "@/components/Hero";
import { Header } from "@/components/Header";
import { MetricCards } from "@/components/MetricCards";
import { CommodityIndexesGrid } from "@/components/CommodityIndexesGrid";
import { OptionsMarketStrip } from "@/components/home/OptionsMarketStrip";
import { SpotMarketGrid } from "@/components/SpotMarketGrid";
import { SpotPositionsTable } from "@/components/SpotPositionsTable";
import { WalletSummary } from "@/components/WalletSummary";
import { useWalletSummary } from "@/hooks/useWalletSummary";
import { WalletAuthModal } from "@/components/WalletAuthModal";
import { RoleSelectionModal } from "@/components/RoleSelectionModal";
import { TradingStatusBanner } from "@/components/TradingStatusBanner";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { usePolling } from "@/hooks/usePolling";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Option, InsertOption } from "@shared/schema";
import { Footer } from "@/components/Footer";
import { PortfolioHealthGauge } from "@/components/PortfolioHealthGauge";
import { usePortfolioSummary } from "@/hooks/usePortfolioSummary";

export default function Dashboard() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isWalletAuthModalOpen, setIsWalletAuthModalOpen] = useState(false);
  const [isRoleSelectionOpen, setIsRoleSelectionOpen] = useState(false);

  const { data: options = [], isLoading } = useQuery<Option[]>({
    queryKey: ["/api/options"],
  });

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

  const { data: portfolioSummary, isLoading: summaryLoading, error: summaryError } = usePortfolioSummary(!!user);

  // Get wallet summary data
  const walletData = useWalletSummary(user?.walletAddress || null);

  // Enable polling for live updates when user is authenticated
  usePolling({
    endpoint: "/api/health-updates",
    interval: 20000, // Poll every 20 seconds
    enabled: !!user,
    visibilityPause: true,
  });

  // Fetch margin calls
  const { data: marginCalls = [] } = useQuery<any[]>({
    queryKey: ["/api/margin-calls"],
    enabled: !!user,
  });

  // Fetch spot positions
  interface SpotPosition {
    id: string;
    commoditySlug: string;
    commodityName: string;
    quantityKg: string;
    avgEntryPrice: string;
    currentPricePerKg: string;
    currentValue: string;
    entryValue: string;
    pnl: string;
    pnlPercent: string;
    createdAt: Date;
    updatedAt: Date;
  }

  const { data: spotPositions = [], isLoading: isSpotLoading } = useQuery<SpotPosition[]>({
    queryKey: ["/api/spot/positions"],
    enabled: !!user,
  });

  const createOptionMutation = useMutation({
    mutationFn: async (data: InsertOption) => {
      const response = await apiRequest("POST", "/api/options", data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/options"] });
      toast({
        title: "Success",
        description: "Option created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create option",
        variant: "destructive",
      });
    },
  });

  const matchOptionMutation = useMutation({
    mutationFn: async ({ optionId, counterpartyId }: { optionId: string; counterpartyId: string }) => {
      const response = await apiRequest("POST", `/api/options/${optionId}/match`, { counterpartyId });
      return await response.json();
    },
    onSuccess: () => {
      // Invalidate all related queries to refresh the UI
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

  const forceSettleMutation = useMutation({
    mutationFn: async ({ optionId, reason }: { optionId: string; reason: string }) => {
      const response = await apiRequest("POST", `/api/options/${optionId}/force-settle`, { 
        reason,
      });
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/options"] });
      queryClient.invalidateQueries({ queryKey: ["/api/margin-calls"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({
        title: "Force Settlement Complete",
        description: `Option has been force-settled. Status: ${data.option?.status}. ${data.notificationsCreated} notifications sent.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Force Settlement Failed",
        description: error.message || "Failed to force-settle option",
        variant: "destructive",
      });
    },
  });

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

  const totalOptions = options.length;
  const openOptions = options.filter(opt => opt.status === "OPEN").length;
  const totalVolume = options.reduce((sum, opt) => sum + parseFloat(opt.premium) * parseFloat(opt.qty), 0);

  const handleConnectWallet = () => {
    // Wallet-first flow: Open wallet authentication modal for everyone
    setIsWalletAuthModalOpen(true);
  };

  const handleWalletAuthSuccess = (token: string, newUser: boolean) => {
    // If new user, show role selection onboarding
    if (newUser) {
      setIsRoleSelectionOpen(true);
    } else {
      toast({
        title: "Welcome back!",
        description: "You've been successfully authenticated",
      });
    }
  };

  const handleRoleSelectionSuccess = () => {
    toast({
      title: "Account Setup Complete",
      description: "You're all set! Start exploring grain options.",
    });
  };

  const handleOpenLogin = () => {
    // Navigate to login page
    window.location.href = '/login';
  };

  const handleOpenWalletModal = () => {
    setIsWalletAuthModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header 
        onCreateOption={() => setIsCreateDialogOpen(true)}
        onOpenLogin={handleOpenLogin}
        onOpenWalletModal={handleOpenWalletModal}
      />
      
      <Hero 
        onCreateOption={() => setIsCreateDialogOpen(true)}
        onConnectWallet={handleConnectWallet}
        walletAddress={user?.walletAddress}
        onOpenLogin={handleOpenLogin}
        onOpenWalletModal={handleOpenWalletModal}
      />

      <main className="py-12 flex-1 w-full">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          {/* Trading Status Banner */}
          <TradingStatusBanner onOpenWalletModal={handleOpenWalletModal} />
          
          {/* Dashboard Metrics */}
          <MetricCards
            totalOptions={totalOptions}
            openPositions={openOptions}
            totalVolume={totalVolume}
          />

          {/* Portfolio Health (placed directly above Wallet) */}
          {user ? (
            <div>
              {summaryLoading ? (
                <div className="text-sm text-muted-foreground">Loading portfolio health…</div>
              ) : summaryError ? (
                <div className="text-sm text-destructive">Failed to load portfolio health.</div>
              ) : portfolioSummary ? (
                <PortfolioHealthGauge
                  healthPct={portfolioSummary.healthPct}
                  totalNotionalUsd={portfolioSummary.totalNotionalUsd}
                  requiredMargin={portfolioSummary.requiredMargin}
                  realizedPnl={portfolioSummary.realizedPnl}
                  unrealizedPnl={portfolioSummary.unrealizedPnl}
                />
              ) : null}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Sign in to see your portfolio health.
            </div>
          )}

          {/* Wallet Summary Bar */}
          {user?.walletAddress && (
            <div className="mt-6">
              <WalletSummary variant="bar" {...walletData} />
            </div>
          )}

          {/* Commodity Indexes */}
          <CommodityIndexesGrid />

          {/* Options Market Snapshot */}
          <OptionsMarketStrip />

          {/* Spot Market */}
          <SpotMarketGrid />

          {/* Spot Positions */}
          {user && <SpotPositionsTable positions={spotPositions} isLoading={isSpotLoading} />}

          {/* Options Table Preview */}
          <div id="options-table">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold mb-2">Option Chain</h2>
                <p className="text-muted-foreground">
                  Browse and trade commodity options contracts
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => setLocation("/options")}
              >
                View Full Option Chain
              </Button>
            </div>
            
            <OptionsTable 
              options={options.slice(0, 5)} 
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
              onTopUp={async (optionId, amount, currency) => {
                // Find the margin call for this option
                const marginCall = marginCalls.find(mc => mc.optionId === optionId && mc.status === "PENDING");
                if (!marginCall) {
                  toast({
                    title: "Error",
                    description: "No pending margin call found for this option",
                    variant: "destructive",
                  });
                  return;
                }
                await topUpMarginCallMutation.mutateAsync({ marginCallId: marginCall.id, amount, currency });
              }}
              isTopping={topUpMarginCallMutation.isPending}
              onWithdraw={async (data) => {
                return await withdrawMutation.mutateAsync(data);
              }}
              isWithdrawing={withdrawMutation.isPending}
              userRole={user?.role}
              userId={user?.id}
            />
          </div>
        </div>
      </main>

      <Footer />

      {/* Create Option Dialog */}
      <CreateOptionDialog 
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSubmit={async (data) => {
          try {
            await createOptionMutation.mutateAsync(data);
            setIsCreateDialogOpen(false);
          } catch (error) {
            // Error is already handled by mutation's onError callback
            // This catch prevents unhandled promise rejection and Vite ErrorOverlay issues
            console.error("Create option error:", error);
          }
        }}
        isPending={createOptionMutation.isPending}
      />

      {/* Wallet Authentication Modal */}
      <WalletAuthModal
        open={isWalletAuthModalOpen}
        onOpenChange={setIsWalletAuthModalOpen}
        onSuccess={handleWalletAuthSuccess}
      />

      {/* Role Selection Modal (Onboarding) */}
      <RoleSelectionModal
        open={isRoleSelectionOpen}
        onOpenChange={setIsRoleSelectionOpen}
        onSuccess={handleRoleSelectionSuccess}
      />
    </div>
  );
}
