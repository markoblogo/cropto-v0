import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { CreateOptionDialog } from "@/components/CreateOptionDialog";
import { OptionsTable } from "@/components/OptionsTable";
import { Hero } from "@/components/Hero";
import { Header } from "@/components/Header";
import { MetricCards } from "@/components/MetricCards";
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
    } 
  } | null>({
    queryKey: ["/api/auth/me"],
    retry: false,
    enabled: !!localStorage.getItem('cropto_token'),
  });

  const user = userData?.user;

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
    mutationFn: async ({ optionId, seller }: { optionId: string; seller: string }) => {
      const response = await apiRequest("POST", `/api/options/${optionId}/match`, { seller });
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
          {/* Metric Cards */}
          <MetricCards
            totalOptions={totalOptions}
            openPositions={openOptions}
            totalVolume={totalVolume}
          />

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
              onMatch={async (optionId, seller) => {
                await matchOptionMutation.mutateAsync({ optionId, seller });
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
              userRole={user?.role}
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
