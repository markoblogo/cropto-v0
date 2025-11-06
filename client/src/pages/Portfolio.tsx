import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TrendingUp, TrendingDown, Briefcase, AlertTriangle, DollarSign } from "lucide-react";
import { format } from "date-fns";
import { StatusBadge } from "@/components/StatusBadge";
import { OptionTypeBadge } from "@/components/OptionTypeBadge";

interface PortfolioPosition {
  optionId: string;
  title: string;
  type: 'CALL' | 'PUT';
  strike: string;
  qty: string;
  premium: string;
  status: string;
  role: 'buyer' | 'seller';
  pnl: string;
  unrealized: boolean;
  createdAt: string;
}

interface PortfolioData {
  totalPnL: string;
  totalLockedCollateral: string;
  openPositionsCount: number;
  marginCallsCount: number;
  positions: PortfolioPosition[];
}

interface UserData {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

export default function Portfolio() {
  const [, setLocation] = useLocation();

  // Check authentication
  const { data: userData, isLoading: isAuthLoading } = useQuery<UserData | null>({
    queryKey: ["/api/auth/me"],
    retry: false,
    enabled: !!localStorage.getItem('cropto_token'),
  });

  const user = userData?.user;

  // Fetch portfolio data only if authenticated
  const { data: portfolioData, isLoading: isPortfolioLoading, error } = useQuery<PortfolioData>({
    queryKey: ["/api/portfolio/me"],
    retry: false,
    enabled: !!user,
  });

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthLoading && !user) {
      setLocation("/login");
    }
  }, [isAuthLoading, user, setLocation]);

  const isLoading = isAuthLoading || isPortfolioLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="container mx-auto space-y-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Portfolio</h1>
            <p className="text-muted-foreground">Your options positions and performance</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-4" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-32 mb-2" />
                  <Skeleton className="h-3 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Return null while redirecting
  if (!isAuthLoading && !user) {
    return null;
  }

  if (error || (!isPortfolioLoading && !portfolioData)) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="container mx-auto">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              {error instanceof Error ? error.message : "Failed to load portfolio data. Please try again."}
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  const totalPnL = parseFloat(portfolioData.totalPnL);
  const isProfitable = totalPnL >= 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold mb-2" data-testid="heading-portfolio">Portfolio</h1>
          <p className="text-muted-foreground">Your options positions and performance</p>
        </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Total PnL */}
          <Card data-testid="card-total-pnl">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total P&L</CardTitle>
              {isProfitable ? (
                <TrendingUp className="h-4 w-4 text-success" />
              ) : (
                <TrendingDown className="h-4 w-4 text-destructive" />
              )}
            </CardHeader>
            <CardContent>
              <div 
                className={`text-2xl font-bold ${isProfitable ? 'text-success' : 'text-destructive'}`}
                data-testid="text-total-pnl"
              >
                {isProfitable ? '+' : ''}${totalPnL.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Realized + Unrealized
              </p>
            </CardContent>
          </Card>

          {/* Open Positions */}
          <Card data-testid="card-open-positions">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Open Positions</CardTitle>
              <Briefcase className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-open-positions">
                {portfolioData.openPositionsCount}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Active contracts
              </p>
            </CardContent>
          </Card>

          {/* Locked Collateral */}
          <Card data-testid="card-locked-collateral">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Locked Collateral</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-locked-collateral">
                ${parseFloat(portfolioData.totalLockedCollateral).toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Reserved funds
              </p>
            </CardContent>
          </Card>

          {/* Margin Calls */}
          <Card data-testid="card-margin-calls">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Margin Calls</CardTitle>
              <AlertTriangle className={`h-4 w-4 ${portfolioData.marginCallsCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
            </CardHeader>
            <CardContent>
              <div 
                className={`text-2xl font-bold ${portfolioData.marginCallsCount > 0 ? 'text-destructive' : ''}`}
                data-testid="text-margin-calls"
              >
                {portfolioData.marginCallsCount}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {portfolioData.marginCallsCount > 0 ? 'Action required' : 'All clear'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Positions Table */}
        <Card>
          <CardHeader>
            <CardTitle>Positions</CardTitle>
          </CardHeader>
          <CardContent>
            {portfolioData.positions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground" data-testid="text-no-positions">
                <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">No positions yet</p>
                <p className="text-sm">Start trading options to see your portfolio here</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Strike</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Premium</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">P&L</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {portfolioData.positions.map((position) => {
                      const positionPnL = parseFloat(position.pnl);
                      const isProfitablePosition = positionPnL >= 0;

                      return (
                        <TableRow key={position.optionId} data-testid={`row-position-${position.optionId}`}>
                          <TableCell className="font-medium" data-testid={`text-title-${position.optionId}`}>
                            {position.title}
                          </TableCell>
                          <TableCell>
                            <OptionTypeBadge type={position.type} />
                          </TableCell>
                          <TableCell className="text-right font-mono" data-testid={`text-strike-${position.optionId}`}>
                            ${parseFloat(position.strike).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono" data-testid={`text-qty-${position.optionId}`}>
                            {parseFloat(position.qty).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono" data-testid={`text-premium-${position.optionId}`}>
                            ${parseFloat(position.premium).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={position.role === 'buyer' ? 'default' : 'secondary'} data-testid={`badge-role-${position.optionId}`}>
                              {position.role === 'buyer' ? 'Buyer' : 'Seller'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={position.status} />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span 
                                className={`font-mono font-semibold ${isProfitablePosition ? 'text-success' : 'text-destructive'}`}
                                data-testid={`text-pnl-${position.optionId}`}
                              >
                                {isProfitablePosition ? '+' : ''}${positionPnL.toFixed(2)}
                              </span>
                              {position.unrealized && (
                                <Badge variant="outline" className="text-xs" data-testid={`badge-unrealized-${position.optionId}`}>
                                  Unrealized
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground" data-testid={`text-date-${position.optionId}`}>
                            {format(new Date(position.createdAt), "MMM dd, yyyy")}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
