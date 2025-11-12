import { useState } from "react";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, PlayCircle, Database, Users, TrendingUp } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { BackToDashboard } from "@/components/BackToDashboard";

export default function Admin() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<any>(null);

  const handleRunDemo = async () => {
    setIsLoading(true);
    setResults(null);
    
    try {
      const response = await apiRequest("POST", "/api/admin/run-demo");
      const data = await response.json();

      setResults(data.results);

      const deletedCount = (data.results.deleted?.options || 0) + (data.results.deleted?.indexPrices || 0);
      const deletedMsg = deletedCount > 0 ? ` Cleaned ${deletedCount} existing records.` : "";
      
      toast({
        title: "Demo scenario created! ✨",
        description: `Created ${data.results.users.length} users, ${data.results.options.length} options, and ${data.results.indexPrices.length} index prices.${deletedMsg}`,
      });
    } catch (error: any) {
      console.error("Error running demo:", error);
      toast({
        variant: "destructive",
        title: "Failed to run demo",
        description: error.message || "An error occurred while seeding demo data",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header onCreateOption={() => {}} />
      
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">Admin Panel</h1>
              <p className="text-muted-foreground">
                Manage demo scenarios and system operations
              </p>
            </div>
            <BackToDashboard />
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <PlayCircle className="w-5 h-5 text-primary" />
                <CardTitle>Demo Scenario</CardTitle>
              </div>
              <CardDescription>
                Run a one-click demo to seed the platform with sample data for partner presentations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted/50 rounded-md p-4 space-y-2">
                <h3 className="font-medium text-sm">This will create:</h3>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    <span>3 demo users: farmer@demo, trader@demo, broker@demo (password: pass)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    <span>3 options contracts with various strikes, quantities, and statuses</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    <span>2 index price entries (WHEAT @ 210, WHEAT @ 240)</span>
                  </li>
                </ul>
              </div>

              <Button 
                onClick={handleRunDemo} 
                disabled={isLoading}
                size="lg"
                className="w-full"
                data-testid="button-run-demo"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Seeding demo data...
                  </>
                ) : (
                  <>
                    <PlayCircle className="w-4 h-4 mr-2" />
                    Run Demo Scenario
                  </>
                )}
              </Button>

              {results && (
                <div className="mt-4 p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md">
                  <h4 className="font-medium text-green-900 dark:text-green-100 mb-2">
                    ✅ Demo seeded successfully!
                  </h4>
                  <div className="space-y-1 text-sm text-green-800 dark:text-green-200">
                    <p>• Users: {results.users.length} ({results.users.filter((u: any) => u.status === 'created').length} new, {results.users.filter((u: any) => u.status === 'already_exists').length} existing)</p>
                    <p>• Options: {results.options.length} created{results.deleted?.options > 0 ? ` (replaced ${results.deleted.options} existing)` : ''}</p>
                    <p>• Index Prices: {results.indexPrices.length} created{results.deleted?.indexPrices > 0 ? ` (replaced ${results.deleted.indexPrices} existing)` : ''}</p>
                  </div>
                  
                  {results.users.some((u: any) => u.status === 'created') && (
                    <div className="mt-3 p-3 bg-white dark:bg-slate-900 rounded border border-green-200 dark:border-green-800">
                      <p className="text-xs font-medium text-green-900 dark:text-green-100 mb-1">Login credentials:</p>
                      <div className="space-y-1 text-xs font-mono text-green-800 dark:text-green-200">
                        {results.users.filter((u: any) => u.status === 'created').map((u: any) => (
                          <p key={u.email}>{u.email} / pass ({u.role})</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Note</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>
                This feature is broker-only. The demo scenario is idempotent and can be run multiple times. 
                Existing users will be preserved, and new options/index prices will be added to the database.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
