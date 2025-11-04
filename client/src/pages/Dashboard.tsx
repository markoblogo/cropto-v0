import { useQuery, useMutation } from "@tanstack/react-query";
import { TrendingUp, BarChart3, DollarSign } from "lucide-react";
import { CreateOptionDialog } from "@/components/CreateOptionDialog";
import { OptionsTable } from "@/components/OptionsTable";
import { StatsCard } from "@/components/StatsCard";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Option, InsertOption } from "@shared/schema";

export default function Dashboard() {
  const { toast } = useToast();

  const { data: options = [], isLoading } = useQuery<Option[]>({
    queryKey: ["/api/options"],
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

  const totalOptions = options.length;
  const openOptions = options.filter(opt => opt.status === "OPEN").length;
  const totalVolume = options.reduce((sum, opt) => sum + parseFloat(opt.premium) * parseFloat(opt.qty), 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary p-2">
                <TrendingUp className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold" data-testid="text-app-title">Cropto</h1>
                <p className="text-xs text-muted-foreground">Options Trading Platform</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <CreateOptionDialog 
                onSubmit={(data) => createOptionMutation.mutateAsync(data)}
                isPending={createOptionMutation.isPending}
              />
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          <div>
            <h2 className="text-3xl font-bold mb-2">Dashboard</h2>
            <p className="text-muted-foreground">
              Monitor your crypto options positions and trading activity
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatsCard
              title="Total Options"
              value={totalOptions.toString()}
              icon={BarChart3}
              description="All time contracts"
            />
            <StatsCard
              title="Open Positions"
              value={openOptions.toString()}
              icon={TrendingUp}
              description="Active contracts"
            />
            <StatsCard
              title="Total Volume"
              value={`$${totalVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              icon={DollarSign}
              description="Cumulative premium"
            />
          </div>

          <OptionsTable 
            options={options} 
            isLoading={isLoading}
            onMatch={async (optionId, seller) => {
              await matchOptionMutation.mutateAsync({ optionId, seller });
            }}
            isMatching={matchOptionMutation.isPending}
          />
        </div>
      </main>
    </div>
  );
}
