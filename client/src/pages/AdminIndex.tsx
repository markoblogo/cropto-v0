import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, TrendingUp, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { MainLayout } from "@/components/layouts/MainLayout";

interface IndexPrice {
  id: string;
  commodity: string;
  price: string;
  date: string;
  source?: string | null;
  raw?: string | null;
  meta?: string | null;
  messageId?: string | null;
  createdAt: string;
}

interface UserData {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

export default function AdminIndex() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [commodity, setCommodity] = useState("Wheat 11.5%");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterCommodity, setFilterCommodity] = useState("");

  // Check authentication and role
  const { data: userData, isLoading: isAuthLoading } = useQuery<UserData | null>({
    queryKey: ["/api/auth/me"],
    retry: false,
    enabled: !!localStorage.getItem('cropto_token'),
  });

  const user = userData?.user;
  const isAdminLevelUser = user && (
    user.role?.toLowerCase() === 'admin' || 
    user.role?.toLowerCase() === 'broker' || 
    user.role?.toLowerCase() === 'super_admin'
  );

  // Fetch index prices (call all hooks before early returns)
  const { data: indexPrices, isLoading: isPricesLoading } = useQuery<IndexPrice[]>({
    queryKey: ["/api/admin/index", filterCommodity],
    enabled: !!isAdminLevelUser,
  });

  // Redirect if not admin-level (in useEffect to avoid render-phase side effects)
  useEffect(() => {
    if (!isAuthLoading && (!user || !isAdminLevelUser)) {
      setLocation("/");
    }
  }, [isAuthLoading, user, isAdminLevelUser, setLocation]);

  // Add index price mutation
  const addIndexMutation = useMutation({
    mutationFn: async (data: { commodity: string; price: string; date: string }) => {
      const response = await apiRequest("POST", "/api/admin/index", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/index"] });
      queryClient.invalidateQueries({ queryKey: ["/api/index/latest"] });
      setIsAddDialogOpen(false);
      setCommodity("Wheat 11.5%");
      setPrice("");
      setDate(new Date().toISOString().split('T')[0]);
      toast({
        title: "Success",
        description: "Index price added successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add index price",
        variant: "destructive",
      });
    },
  });

  const handleAddIndex = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!commodity || !price) {
      toast({
        title: "Validation Error",
        description: "Commodity and price are required",
        variant: "destructive",
      });
      return;
    }

    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      toast({
        title: "Validation Error",
        description: "Price must be a positive number",
        variant: "destructive",
      });
      return;
    }

    addIndexMutation.mutate({
      commodity: commodity.toUpperCase(),
      price: priceNum.toString(),
      date,
    });
  };

  if (isAuthLoading || isPricesLoading) {
    return (
      <MainLayout>
        <div className="space-y-8">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      </MainLayout>
    );
  }

  // Early return after all hooks are called (unauthorized access)
  if (!user || !isAdminLevelUser) {
    return null;
  }

  return (
    <MainLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-2" data-testid="heading-admin-index">
              Index Management
            </h1>
            <p className="text-muted-foreground">
              Manage index prices and view Telegram updates
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/admin">
                Back to Admin
              </Link>
            </Button>
            <Button
              onClick={() => setIsAddDialogOpen(true)}
              data-testid="button-add-index"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Index Price
            </Button>
          </div>
        </div>

        {/* Telegram Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Telegram Bot Integration
            </CardTitle>
            <CardDescription>
              Configure your Telegram bot to post index updates
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Webhook URL</Label>
              <code className="block bg-muted p-3 rounded-md font-mono text-sm mt-2">
                {window.location.origin}/api/index
              </code>
            </div>
            <div>
              <Label className="text-sm font-medium">Secret Token Header</Label>
              <code className="block bg-muted p-3 rounded-md font-mono text-sm mt-2">
                X-Telegram-Bot-Api-Secret-Token: YOUR_SECRET_TOKEN
              </code>
              <p className="text-sm text-muted-foreground mt-2">
                Set <code className="bg-muted px-2 py-1 rounded">TELEGRAM_BOT_SECRET_TOKEN</code> in Replit Secrets
              </p>
            </div>
            <div>
              <Label className="text-sm font-medium">Message Formats</Label>
              <div className="space-y-3 mt-2">
                <div>
                  <p className="text-xs font-medium mb-1">Simple Format:</p>
                  <code className="block bg-muted p-2 rounded-md font-mono text-xs">
                    COMMODITY PRICE
                  </code>
                  <p className="text-xs text-muted-foreground mt-1">
                    Example: <code className="bg-muted px-1 py-0.5 rounded text-xs">Wheat 11.5% 240.50</code>
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium mb-1">Spike Brokers Format:</p>
                  <code className="block bg-muted p-2 rounded-md font-mono text-xs whitespace-pre-wrap">
                    • Пшениця 11.5pro – 221$ (0$)
                  </code>
                  <p className="text-xs text-muted-foreground mt-1">
                    Auto-parses Ukrainian wheat prices from @spike_brokers channel
                  </p>
                </div>
              </div>
            </div>
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Setup Options</AlertTitle>
              <AlertDescription className="space-y-2">
                <div>
                  <strong>Option 1: Webhook (for bots)</strong>
                  <ol className="list-decimal list-inside text-xs mt-1 space-y-1">
                    <li>Set <code className="bg-muted px-1 py-0.5 rounded text-xs">TELEGRAM_BOT_SECRET_TOKEN</code> in Replit Secrets</li>
                    <li>Configure bot webhook to POST to URL above</li>
                    <li>Include secret in <code className="bg-muted px-1 py-0.5 rounded text-xs">X-Telegram-Bot-Api-Secret-Token</code> header</li>
                  </ol>
                </div>
                <div>
                  <strong>Option 2: Polling (automatic)</strong>
                  <ol className="list-decimal list-inside text-xs mt-1 space-y-1">
                    <li>Set <code className="bg-muted px-1 py-0.5 rounded text-xs">TELEGRAM_BOT_TOKEN</code> in Replit Secrets</li>
                    <li>System polls @spike_brokers every 2 minutes automatically</li>
                    <li>No webhook configuration needed</li>
                  </ol>
                </div>
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Filter */}
        <div className="flex items-center gap-4">
          <div className="flex-1 max-w-xs">
            <Label htmlFor="filter-commodity">Filter by Commodity</Label>
            <Input
              id="filter-commodity"
              placeholder="e.g. Wheat 11.5%, BTC"
              value={filterCommodity}
              onChange={(e) => setFilterCommodity(e.target.value)}
              data-testid="input-filter-commodity"
            />
          </div>
        </div>

        {/* Index Prices Table */}
        <Card>
          <CardHeader>
            <CardTitle>Index Price History</CardTitle>
            <CardDescription>
              Latest {indexPrices?.length || 0} index prices
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!indexPrices || indexPrices.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground" data-testid="text-no-prices">
                <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">No index prices yet</p>
                <p className="text-sm">Add a price manually or configure the Telegram bot</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Commodity</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Added</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {indexPrices.map((price) => (
                      <TableRow key={price.id} data-testid={`row-index-${price.id}`}>
                        <TableCell className="font-medium" data-testid={`text-commodity-${price.id}`}>
                          {price.commodity}
                        </TableCell>
                        <TableCell className="text-right font-mono" data-testid={`text-price-${price.id}`}>
                          ${parseFloat(price.price).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-sm" data-testid={`text-source-${price.id}`}>
                          <code className="text-xs bg-muted px-2 py-1 rounded">
                            {price.source || 'manual'}
                          </code>
                        </TableCell>
                        <TableCell data-testid={`text-date-${price.id}`}>
                          {format(new Date(price.date), "MMM dd, yyyy HH:mm")}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(price.createdAt), "MMM dd, yyyy HH:mm")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add Index Dialog */}
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Index Price</DialogTitle>
              <DialogDescription>
                Manually add or override an index price
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddIndex} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="commodity">Commodity</Label>
                <Input
                  id="commodity"
                  placeholder="e.g. Wheat 11.5%, BTC"
                  value={commodity}
                  onChange={(e) => setCommodity(e.target.value)}
                  required
                  data-testid="input-commodity"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="price">Price</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  placeholder="e.g. 240.50"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                  data-testid="input-price"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Date & Time</Label>
                <Input
                  id="date"
                  type="datetime-local"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  data-testid="input-date"
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddDialogOpen(false)}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={addIndexMutation.isPending}
                  data-testid="button-submit-index"
                >
                  {addIndexMutation.isPending ? "Adding..." : "Add Price"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
