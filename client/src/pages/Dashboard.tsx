import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { CreateOptionDialog } from "@/components/CreateOptionDialog";
import { OptionsTable } from "@/components/OptionsTable";
import { Hero } from "@/components/Hero";
import { Header } from "@/components/Header";
import { MetricCards } from "@/components/MetricCards";
import { DashboardIndexWidget } from "@/components/DashboardIndexWidget";
import { CroptMintButton } from "@/components/CroptMintButton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Option, InsertOption } from "@shared/schema";

export default function Dashboard() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isWalletDialogOpen, setIsWalletDialogOpen] = useState(false);

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

  // Fetch margin calls
  const { data: marginCalls = [] } = useQuery<any[]>({
    queryKey: ["/api/margin-calls"],
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
      queryClient.invalidateQueries({ queryKey: ["/api/options"] });
      toast({
        title: "Match Successful",
        description: "Option has been successfully matched",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Match Failed",
        description: error.message || "Failed to match option",
        variant: "destructive",
      });
    },
  });

  const exerciseOptionMutation = useMutation({
    mutationFn: async ({ optionId, exercisedBy, spotPrice }: { optionId: string; exercisedBy: string; spotPrice: number }) => {
      const response = await apiRequest("POST", `/api/options/${optionId}/exercise`, { exercisedBy, spotPrice });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/options"] });
      toast({
        title: "Exercise Successful",
        description: "Option has been exercised and settled",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Exercise Failed",
        description: error.message || "Failed to exercise option",
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
    // Scroll to top where Header's Connect Wallet button is
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Wait a moment then click the header's connect wallet button
    setTimeout(() => {
      const walletButton = document.querySelector('[data-testid="button-connect-wallet"]') as HTMLElement;
      walletButton?.click();
    }, 500);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header onCreateOption={() => setIsCreateDialogOpen(true)} />
      
      <Hero 
        onCreateOption={() => setIsCreateDialogOpen(true)}
        onConnectWallet={handleConnectWallet}
      />

      <main className="py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          {/* Dashboard Widgets */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-3">
              <MetricCards
                totalOptions={totalOptions}
                openPositions={openOptions}
                totalVolume={totalVolume}
              />
            </div>
            <div className="lg:col-span-1 space-y-6">
              <DashboardIndexWidget />
              {user?.walletAddress && (
                <CroptMintButton walletAddress={user.walletAddress} />
              )}
            </div>
          </div>

          {/* Options Table */}
          <div id="options-table">
            <div className="mb-6">
              <h2 className="text-2xl font-bold mb-2">Options Marketplace</h2>
              <p className="text-muted-foreground">
                Browse, create, and trade grain commodity options
              </p>
            </div>
            
            <OptionsTable 
              options={options} 
              isLoading={isLoading}
              onMatch={async (optionId, counterpartyId) => {
                await matchOptionMutation.mutateAsync({ optionId, counterpartyId });
              }}
              isMatching={matchOptionMutation.isPending}
              onExercise={async (optionId, exercisedBy, spotPrice) => {
                await exerciseOptionMutation.mutateAsync({ optionId, exercisedBy, spotPrice });
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

      {/* Create Option Dialog */}
      <CreateOptionDialog 
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSubmit={async (data) => {
          await createOptionMutation.mutateAsync(data);
          setIsCreateDialogOpen(false);
        }}
        isPending={createOptionMutation.isPending}
      />
    </div>
  );
}
