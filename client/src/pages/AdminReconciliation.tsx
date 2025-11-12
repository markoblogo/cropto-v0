import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Download, Filter, Calendar, DollarSign, FileText, AlertCircle } from "lucide-react";
import { BackToDashboard } from "@/components/BackToDashboard";

interface Transaction {
  id: string;
  optionId: string;
  type: string;
  fromUserId: string | null;
  toUserId: string | null;
  amount: string;
  description: string;
  createdAt: string;
}

interface Settlement {
  id: string;
  optionId: string;
  exercisedBy: string;
  spotPrice: string;
  strike: string;
  qty: string;
  payout: string;
  profitLoss: string;
  createdAt: string;
}

interface MarginCall {
  id: string;
  optionId: string;
  userId: string;
  amountRequired: string;
  intrinsicValue: string;
  collateralAmount: string;
  reservedCollateral: string;
  status: string;
  deadline: string | null;
  createdAt: string;
}

export default function AdminReconciliation() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Check user role
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

  // Redirect non-broker users
  useEffect(() => {
    if (userData !== undefined && (!user || user.role !== "broker")) {
      toast({
        title: "Access Denied",
        description: "This page is only accessible to broker accounts",
        variant: "destructive",
      });
      setLocation("/");
    }
  }, [user, userData, setLocation, toast]);

  const { data: transactions = [], isLoading: loadingTransactions, error: transactionsError } = useQuery<Transaction[]>({
    queryKey: ["/api/admin/reconciliation/transactions"],
    enabled: user?.role === "broker",
  });

  const { data: settlements = [], isLoading: loadingSettlements, error: settlementsError } = useQuery<Settlement[]>({
    queryKey: ["/api/admin/reconciliation/settlements"],
    enabled: user?.role === "broker",
  });

  const { data: marginCalls = [], isLoading: loadingMarginCalls, error: marginCallsError } = useQuery<MarginCall[]>({
    queryKey: ["/api/admin/reconciliation/margincalls"],
    enabled: user?.role === "broker",
  });

  // If still loading user data, show loading
  if (userData === undefined) {
    return (
      <div className="min-h-screen bg-background">
        <Header onCreateOption={() => {}} />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </main>
      </div>
    );
  }

  // If not broker, don't render (redirect will happen via useEffect)
  if (!user || user.role !== "broker") {
    return null;
  }

  // Filter functions
  const filterByDate = (date: string) => {
    if (!dateFrom && !dateTo) return true;
    const itemDate = new Date(date);
    const from = dateFrom ? new Date(dateFrom) : new Date(0);
    const to = dateTo ? new Date(dateTo) : new Date();
    // Include the full end date by setting to end of day
    if (dateTo) {
      to.setHours(23, 59, 59, 999);
    }
    return itemDate >= from && itemDate <= to;
  };

  const filteredTransactions = transactions.filter(t => filterByDate(t.createdAt));
  const filteredSettlements = settlements.filter(s => filterByDate(s.createdAt));
  const filteredMarginCalls = marginCalls.filter(mc => {
    const dateMatch = filterByDate(mc.createdAt);
    const statusMatch = statusFilter === "all" || mc.status === statusFilter;
    return dateMatch && statusMatch;
  });

  const handleExportCSV = (type: "transactions" | "settlements" | "margincalls") => {
    let data: any[] = [];
    let filename = "";
    let headers: string[] = [];

    switch (type) {
      case "transactions":
        data = filteredTransactions;
        filename = "transactions-export.csv";
        headers = ["ID", "Option ID", "Type", "From User", "To User", "Amount", "Description", "Created At"];
        break;
      case "settlements":
        data = filteredSettlements;
        filename = "settlements-export.csv";
        headers = ["ID", "Option ID", "Exercised By", "Spot Price", "Strike", "Qty", "Payout", "P&L", "Created At"];
        break;
      case "margincalls":
        data = filteredMarginCalls;
        filename = "margincalls-export.csv";
        headers = ["ID", "Option ID", "User ID", "Amount Required", "Intrinsic Value", "Collateral", "Reserved", "Status", "Deadline", "Created At"];
        break;
    }

    if (data.length === 0) {
      toast({
        title: "No data to export",
        description: "There are no records matching your filters",
        variant: "destructive",
      });
      return;
    }

    // Build CSV content
    let csvContent = headers.join(",") + "\n";

    data.forEach(item => {
      let row: string[] = [];
      switch (type) {
        case "transactions":
          row = [
            item.id,
            item.optionId,
            item.type,
            item.fromUserId || "",
            item.toUserId || "",
            item.amount,
            `"${item.description.replace(/"/g, '""')}"`,
            format(new Date(item.createdAt), "yyyy-MM-dd HH:mm:ss"),
          ];
          break;
        case "settlements":
          row = [
            item.id,
            item.optionId,
            item.exercisedBy,
            item.spotPrice,
            item.strike,
            item.qty,
            item.payout,
            item.profitLoss,
            format(new Date(item.createdAt), "yyyy-MM-dd HH:mm:ss"),
          ];
          break;
        case "margincalls":
          row = [
            item.id,
            item.optionId,
            item.userId,
            item.amountRequired,
            item.intrinsicValue,
            item.collateralAmount,
            item.reservedCollateral,
            item.status,
            item.deadline ? format(new Date(item.deadline), "yyyy-MM-dd HH:mm:ss") : "",
            format(new Date(item.createdAt), "yyyy-MM-dd HH:mm:ss"),
          ];
          break;
      }
      csvContent += row.join(",") + "\n";
    });

    // Create download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    toast({
      title: "Export successful",
      description: `${data.length} records exported to ${filename}`,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header onCreateOption={() => {}} />
      
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">Reconciliation Dashboard</h1>
              <p className="text-muted-foreground" data-testid="text-page-description">
                View transactions, settlements, and margin calls with filtering and export
              </p>
            </div>
            <BackToDashboard />
          </div>

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="w-5 h-5" />
                Filters
              </CardTitle>
              <CardDescription>Filter records by date range and status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date-from">From Date</Label>
                  <Input
                    id="date-from"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    data-testid="input-date-from"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date-to">To Date</Label>
                  <Input
                    id="date-to"
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    data-testid="input-date-to"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status-filter">Margin Call Status</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger id="status-filter" data-testid="select-status">
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="PENDING">Pending</SelectItem>
                      <SelectItem value="RESOLVED">Resolved</SelectItem>
                      <SelectItem value="LIQUIDATED">Liquidated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabs for different record types */}
          <Tabs defaultValue="transactions" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="transactions" data-testid="tab-transactions">
                <DollarSign className="w-4 h-4 mr-2" />
                Transactions ({filteredTransactions.length})
              </TabsTrigger>
              <TabsTrigger value="settlements" data-testid="tab-settlements">
                <FileText className="w-4 h-4 mr-2" />
                Settlements ({filteredSettlements.length})
              </TabsTrigger>
              <TabsTrigger value="margincalls" data-testid="tab-margincalls">
                <Calendar className="w-4 h-4 mr-2" />
                Margin Calls ({filteredMarginCalls.length})
              </TabsTrigger>
            </TabsList>

            {/* Transactions Tab */}
            <TabsContent value="transactions">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                  <div>
                    <CardTitle>Transactions</CardTitle>
                    <CardDescription>All transaction records</CardDescription>
                  </div>
                  <Button
                    onClick={() => handleExportCSV("transactions")}
                    variant="outline"
                    size="sm"
                    data-testid="button-export-transactions"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export CSV
                  </Button>
                </CardHeader>
                <CardContent>
                  {loadingTransactions ? (
                    <p className="text-center py-8 text-muted-foreground">Loading transactions...</p>
                  ) : transactionsError ? (
                    <div className="flex items-center justify-center py-8 text-destructive gap-2">
                      <AlertCircle className="w-5 h-5" />
                      <p>Failed to load transactions. Please try again.</p>
                    </div>
                  ) : filteredTransactions.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">No transactions found</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Type</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>From</TableHead>
                            <TableHead>To</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredTransactions.map((transaction) => (
                            <TableRow key={transaction.id} data-testid={`row-transaction-${transaction.id}`}>
                              <TableCell>
                                <Badge variant="outline">{transaction.type}</Badge>
                              </TableCell>
                              <TableCell className="font-mono">${parseFloat(transaction.amount).toFixed(2)}</TableCell>
                              <TableCell className="text-sm text-muted-foreground truncate max-w-[100px]">
                                {transaction.fromUserId || "-"}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground truncate max-w-[100px]">
                                {transaction.toUserId || "-"}
                              </TableCell>
                              <TableCell className="text-sm max-w-[200px] truncate">{transaction.description}</TableCell>
                              <TableCell className="text-sm">
                                {format(new Date(transaction.createdAt), "MMM dd, yyyy HH:mm")}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Settlements Tab */}
            <TabsContent value="settlements">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                  <div>
                    <CardTitle>Settlements</CardTitle>
                    <CardDescription>All settlement records</CardDescription>
                  </div>
                  <Button
                    onClick={() => handleExportCSV("settlements")}
                    variant="outline"
                    size="sm"
                    data-testid="button-export-settlements"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export CSV
                  </Button>
                </CardHeader>
                <CardContent>
                  {loadingSettlements ? (
                    <p className="text-center py-8 text-muted-foreground">Loading settlements...</p>
                  ) : settlementsError ? (
                    <div className="flex items-center justify-center py-8 text-destructive gap-2">
                      <AlertCircle className="w-5 h-5" />
                      <p>Failed to load settlements. Please try again.</p>
                    </div>
                  ) : filteredSettlements.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">No settlements found</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Exercised By</TableHead>
                            <TableHead>Spot Price</TableHead>
                            <TableHead>Strike</TableHead>
                            <TableHead>Quantity</TableHead>
                            <TableHead>Payout</TableHead>
                            <TableHead>P&L</TableHead>
                            <TableHead>Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredSettlements.map((settlement) => (
                            <TableRow key={settlement.id} data-testid={`row-settlement-${settlement.id}`}>
                              <TableCell className="text-sm truncate max-w-[120px]">{settlement.exercisedBy}</TableCell>
                              <TableCell className="font-mono">${parseFloat(settlement.spotPrice).toFixed(2)}</TableCell>
                              <TableCell className="font-mono">${parseFloat(settlement.strike).toFixed(2)}</TableCell>
                              <TableCell className="font-mono">{parseFloat(settlement.qty).toFixed(2)}</TableCell>
                              <TableCell className="font-mono">${parseFloat(settlement.payout).toFixed(2)}</TableCell>
                              <TableCell className={`font-mono ${parseFloat(settlement.profitLoss) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                ${parseFloat(settlement.profitLoss).toFixed(2)}
                              </TableCell>
                              <TableCell className="text-sm">
                                {format(new Date(settlement.createdAt), "MMM dd, yyyy HH:mm")}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Margin Calls Tab */}
            <TabsContent value="margincalls">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                  <div>
                    <CardTitle>Margin Calls</CardTitle>
                    <CardDescription>All margin call records</CardDescription>
                  </div>
                  <Button
                    onClick={() => handleExportCSV("margincalls")}
                    variant="outline"
                    size="sm"
                    data-testid="button-export-margincalls"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export CSV
                  </Button>
                </CardHeader>
                <CardContent>
                  {loadingMarginCalls ? (
                    <p className="text-center py-8 text-muted-foreground">Loading margin calls...</p>
                  ) : marginCallsError ? (
                    <div className="flex items-center justify-center py-8 text-destructive gap-2">
                      <AlertCircle className="w-5 h-5" />
                      <p>Failed to load margin calls. Please try again.</p>
                    </div>
                  ) : filteredMarginCalls.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">No margin calls found</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>User</TableHead>
                            <TableHead>Amount Required</TableHead>
                            <TableHead>Intrinsic Value</TableHead>
                            <TableHead>Collateral</TableHead>
                            <TableHead>Reserved</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Deadline</TableHead>
                            <TableHead>Created</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredMarginCalls.map((mc) => (
                            <TableRow key={mc.id} data-testid={`row-margincall-${mc.id}`}>
                              <TableCell className="text-sm truncate max-w-[120px]">{mc.userId}</TableCell>
                              <TableCell className="font-mono">${parseFloat(mc.amountRequired).toFixed(2)}</TableCell>
                              <TableCell className="font-mono">${parseFloat(mc.intrinsicValue).toFixed(2)}</TableCell>
                              <TableCell className="font-mono">${parseFloat(mc.collateralAmount).toFixed(2)}</TableCell>
                              <TableCell className="font-mono">${parseFloat(mc.reservedCollateral).toFixed(2)}</TableCell>
                              <TableCell>
                                <Badge
                                  variant={mc.status === "PENDING" ? "default" : mc.status === "RESOLVED" ? "secondary" : "destructive"}
                                >
                                  {mc.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm">
                                {mc.deadline ? format(new Date(mc.deadline), "MMM dd HH:mm") : "-"}
                              </TableCell>
                              <TableCell className="text-sm">
                                {format(new Date(mc.createdAt), "MMM dd, yyyy")}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
