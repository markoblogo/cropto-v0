import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { usePolling } from "@/hooks/usePolling";
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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TrendingUp, TrendingDown, Briefcase, AlertTriangle, DollarSign } from "lucide-react";
import { format, differenceInDays, formatDistanceToNow } from "date-fns";
import { StatusBadge } from "@/components/StatusBadge";
import { OptionTypeBadge } from "@/components/OptionTypeBadge";
import { BackToDashboard } from "@/components/BackToDashboard";
import { SpotPositionsTable } from "@/components/SpotPositionsTable";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SpotBuyModal } from "@/components/SpotBuyModal";
import { SpotSellModal } from "@/components/SpotSellModal";
import { WalletAuthModal } from "@/components/WalletAuthModal";
import { TradingStatusBanner } from "@/components/TradingStatusBanner";
import { useUserTier } from "@/hooks/useUserTier";
import { queryClient } from "@/lib/queryClient";
import type { Option } from "@shared/schema";

interface CommodityIndex {
  id: string;
  name: string;
  slug: string;
  category: string;
  hasVat: boolean;
  latestPrice: {
    price: number;
    delta: number | null;
    timestamp: Date;
  } | null;
}

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
  expirationDate?: string; // Optional - may not be in backend response yet
}

interface EnrichedOptionPosition extends PortfolioPosition {
  underlying: string;
  commoditySlug: string;
  commodityName: string;
  expirationDateObj: Date | null;
  timeToExpiryMs: number;
  timeToExpiryLabel: string;
  isExpired: boolean;
  impliedPnlNow: number | null;
  impliedPnlLabel: string;
  impliedPnlSign: "positive" | "negative" | "flat";
}

interface NetCommodityExposure {
  commoditySlug: string;
  commodityName: string;
  spotQtyT: number;
  syntheticFromOptionsT: number;
  totalNetT: number;
  currentPricePerT?: number;
  spotValueUsd?: number;
  optionsValueUsd?: number;
  totalValueUsd?: number;
}

/**
 * Parse expiration date from option title
 * Format: COMMODITY-QTY-CREATED-EXPIRES-VOLUME-ID
 * Where EXPIRES is DDMMM (e.g., 30DEC)
 */
function parseExpirationFromTitle(title: string, createdAt: string): Date | null {
  try {
    const parts = title.split('-');
    if (parts.length < 4) return null;
    
    const expirationCode = parts[3]; // EXPIRES part
    if (!expirationCode || expirationCode.length < 5) return null;
    
    const day = parseInt(expirationCode.substring(0, 2));
    const monthStr = expirationCode.substring(2, 5).toUpperCase();
    
    const months: Record<string, number> = {
      'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5,
      'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11
    };
    
    const month = months[monthStr];
    if (month === undefined || isNaN(day)) return null;
    
    // Infer year: if expiration is before creation date, it's next year
    const created = new Date(createdAt);
    const currentYear = created.getFullYear();
    let year = currentYear;
    
    const expiryThisYear = new Date(currentYear, month, day);
    if (expiryThisYear < created) {
      year = currentYear + 1;
    }
    
    return new Date(year, month, day);
  } catch {
    return null;
  }
}

/**
 * Calculate time to expiry and format it nicely
 */
function formatTimeToExpiry(expirationDate: string | Date | undefined | null): string {
  let expiry: Date | null = null;
  
  if (expirationDate instanceof Date) {
    expiry = expirationDate;
  } else if (typeof expirationDate === 'string') {
    try {
      expiry = new Date(expirationDate);
    } catch {
      return "N/A";
    }
  }
  
  if (!expiry || isNaN(expiry.getTime())) {
    return "N/A";
  }

  try {
    const now = new Date();
    const daysDiff = differenceInDays(expiry, now);

    if (daysDiff < 0) {
      // Expired
      return `Expired ${Math.abs(daysDiff)} day${Math.abs(daysDiff) !== 1 ? 's' : ''} ago`;
    } else if (daysDiff === 0) {
      return "Expires today";
    } else if (daysDiff === 1) {
      return "Expires tomorrow";
    } else if (daysDiff <= 7) {
      return `${daysDiff} days left`;
    } else {
      return `in ${daysDiff} days`;
    }
  } catch {
    return "N/A";
  }
}

interface PortfolioData {
  totalPnL: string;
  realizedPnL: string;
  unrealizedPnL: string;
  lockedCollateral: string;
  openPositions: number;
  marginCalls: number;
  positions: PortfolioPosition[];
}

interface UserData {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

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

export default function Portfolio() {
  const [, setLocation] = useLocation();
  const [isWalletAuthModalOpen, setIsWalletAuthModalOpen] = useState(false);
  const [focusedCommodity, setFocusedCommodity] = useState<string | null>(null);
  const [hedgeModalState, setHedgeModalState] = useState<{
    mode: "buy" | "sell";
    commoditySlug: string;
    commodityName: string;
    currentPrice: number;
  } | null>(null);
  const userTier = useUserTier();

  // Check authentication
  const { data: userData, isLoading: isAuthLoading } = useQuery<UserData | null>({
    queryKey: ["/api/auth/me"],
    retry: false,
    enabled: !!localStorage.getItem('cropto_token'),
  });

  const user = userData?.user;

  const handleOpenLogin = () => {
    // Navigate to login page
    setLocation("/login");
  };

  const handleOpenWalletModal = () => {
    setIsWalletAuthModalOpen(true);
  };

  const handleWalletAuthSuccess = (token: string, newUser: boolean) => {
    // Invalidate queries to refresh user data
    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    queryClient.invalidateQueries({ queryKey: ["/api/spot/positions"] });
    setIsWalletAuthModalOpen(false);
  };

  // Enable polling for live updates when user is authenticated
  usePolling({
    endpoint: "/api/health-updates",
    interval: 20000, // Poll every 20 seconds
    enabled: !!user,
    visibilityPause: true,
  });

  // Fetch portfolio data only if authenticated
  const { data: portfolioData, isLoading: isPortfolioLoading, error } = useQuery<PortfolioData>({
    queryKey: ["/api/portfolio/me"],
    retry: false,
    enabled: !!user,
  });

  // Fetch spot positions
  const { data: spotPositions = [], isLoading: isSpotLoading } = useQuery<SpotPosition[]>({
    queryKey: ["/api/spot/positions"],
    retry: false,
    enabled: !!user,
  });

  // Fetch indexes for implied PnL calculations
  const { data: indexes = [] } = useQuery<CommodityIndex[]>({
    queryKey: ["/api/indexes"],
    enabled: !!user,
  });

  const indexPriceMap = useMemo(() => {
    const map: Record<string, { name: string; slug: string; latestPricePerTon: number; latestPricePerKg: number }> = {};
    indexes.forEach((idx) => {
      if (!idx.slug || !idx.latestPrice) return;
      const pricePerTon = idx.latestPrice.price;
      const pricePerKg = pricePerTon / 1000;
      map[idx.slug.toLowerCase()] = {
        name: idx.name,
        slug: idx.slug.toLowerCase(),
        latestPricePerTon: pricePerTon,
        latestPricePerKg: pricePerKg,
      };
    });
    return map;
  }, [indexes]);

  // Fetch all options (used to link spot positions to related options)
  const { data: allOptions = [] } = useQuery<Option[]>({
    queryKey: ["/api/options"],
    enabled: !!user,
  });

  // Build mapping commodity -> options list and counts for this user's portfolio
  const optionsByCommodityList = useMemo(() => {
    const map: Record<string, Option[]> = {};
    if (!user) return map;

    allOptions.forEach((opt) => {
      if (opt.issuerId !== user.id && opt.buyerId !== user.id) {
        return;
      }
      const slug = (opt as any).commoditySlug || opt.commodity;
      if (!slug) return;
      if (!map[slug]) {
        map[slug] = [];
      }
      map[slug].push(opt);
    });

    return map;
  }, [allOptions, user]);

  const optionsByCommodity = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.entries(optionsByCommodityList).forEach(([slug, list]) => {
      counts[slug] = list.length;
    });
    return counts;
  }, [optionsByCommodityList]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthLoading && !user) {
      setLocation("/login");
    }
  }, [isAuthLoading, user, setLocation]);

  // Enriched positions calculation - MUST be called before any early returns
  const enrichedPositions: EnrichedOptionPosition[] = useMemo(() => {
    if (!portfolioData || !portfolioData.positions) {
      return [];
    }

    const now = new Date();

    return portfolioData.positions.map((position) => {
      // Underlying from title (COMMODITY-QTY-...)
      const titleParts = position.title.split("-");
      const underlying = titleParts[0] || position.title;

      // Expiration date
      let expirationDate: Date | null = null;
      if (position.expirationDate) {
        expirationDate = new Date(position.expirationDate);
      } else {
        expirationDate = parseExpirationFromTitle(position.title, position.createdAt);
      }

      let timeToExpiryMs = 0;
      let timeToExpiryLabel = "N/A";
      let isExpired = false;

      if (expirationDate && !isNaN(expirationDate.getTime())) {
        timeToExpiryMs = expirationDate.getTime() - now.getTime();
        if (timeToExpiryMs <= 0) {
          isExpired = true;
          timeToExpiryLabel = "Expired";
        } else {
          const totalMinutes = Math.floor(timeToExpiryMs / (1000 * 60));
          const totalHours = Math.floor(totalMinutes / 60);
          const days = Math.floor(totalHours / 24);
          const hours = totalHours % 24;
          const minutes = totalMinutes % 60;

          if (days >= 1) {
            timeToExpiryLabel = `${days}d${hours > 0 ? ` ${hours}h` : ""}`;
          } else if (hours >= 1) {
            timeToExpiryLabel = `${hours}h${minutes > 0 ? ` ${minutes}m` : ""}`;
          } else {
            timeToExpiryLabel = `${minutes}m`;
          }
        }
      }

      // Implied PnL (very simplified, intrinsic-only approximation)
      let impliedPnlNow: number | null = null;
      let impliedPnlLabel = "—";
      let impliedPnlSign: "positive" | "negative" | "flat" = "flat";

      const indexKey = underlying.toLowerCase();
      const indexInfo = indexPriceMap[indexKey];

      if (indexInfo) {
        const strikePerTon = parseFloat(position.strike) * 1000; // strike stored per kg -> per ton
        const qtyTonnes = parseFloat(position.qty) / 1000; // qty stored in kg -> tonnes
        const currentPerTon = indexInfo.latestPricePerTon;
        const premiumPerTon = parseFloat(position.premium); // ASSUMPTION: premium is per ton

        if (
          isFinite(strikePerTon) &&
          isFinite(qtyTonnes) &&
          qtyTonnes > 0 &&
          isFinite(currentPerTon) &&
          isFinite(premiumPerTon)
        ) {
          const isLongUnderlying =
            (position.type === "CALL" && position.role === "buyer") ||
            (position.type === "PUT" && position.role === "seller");

          let intrinsicPerTon = 0;
          if (position.type === "CALL") {
            intrinsicPerTon = Math.max(currentPerTon - strikePerTon, 0);
          } else {
            intrinsicPerTon = Math.max(strikePerTon - currentPerTon, 0);
          }

          let pnlTotal = 0;
          if (isLongUnderlying) {
            const netPerTon = intrinsicPerTon - premiumPerTon;
            pnlTotal = netPerTon * qtyTonnes;
          } else {
            const grossPerTon = premiumPerTon - intrinsicPerTon;
            pnlTotal = grossPerTon * qtyTonnes;
          }

          impliedPnlNow = pnlTotal;
          if (pnlTotal > 0.0001) {
            impliedPnlSign = "positive";
            impliedPnlLabel = `+${pnlTotal.toFixed(2)} CROPT`;
          } else if (pnlTotal < -0.0001) {
            impliedPnlSign = "negative";
            impliedPnlLabel = `${pnlTotal.toFixed(2)} CROPT`;
          } else {
            impliedPnlSign = "flat";
            impliedPnlLabel = "0.00 CROPT";
          }
        }
      }

      return {
        ...position,
        underlying,
        commoditySlug: underlying.toLowerCase(),
        commodityName: underlying,
        expirationDateObj: expirationDate,
        timeToExpiryMs,
        timeToExpiryLabel,
        isExpired,
        impliedPnlNow,
        impliedPnlLabel,
        impliedPnlSign,
      };
    });
  }, [portfolioData, indexPriceMap]);

  const netExposure: NetCommodityExposure[] = useMemo(() => {
    const map: Record<string, NetCommodityExposure> = {};

    // Seed with spot positions
    spotPositions.forEach((spot) => {
      const slug = spot.commoditySlug.toLowerCase();
      const name = spot.commodityName;
      const qtyT = parseFloat(spot.quantityKg) / 1000; // kg -> tonnes
      const currentPricePerT = parseFloat(spot.currentPricePerKg) * 1000; // $/kg -> $/t
      const spotValueUsd = qtyT * currentPricePerT;

      if (!map[slug]) {
        map[slug] = {
          commoditySlug: slug,
          commodityName: name,
          spotQtyT: 0,
          syntheticFromOptionsT: 0,
          totalNetT: 0,
          currentPricePerT,
          spotValueUsd: 0,
          optionsValueUsd: 0,
          totalValueUsd: 0,
        };
      }

      map[slug].spotQtyT += qtyT;
      map[slug].spotValueUsd = (map[slug].spotValueUsd || 0) + spotValueUsd;
    });

    // Add synthetic exposure from options (only active positions)
    enrichedPositions.forEach((pos) => {
      // Treat OPEN/FILLED as active; ignore expired/settled
      const status = pos.status?.toUpperCase();
      if (status !== "OPEN" && status !== "FILLED" && status !== "MATCHED") {
        return;
      }

      const slug = pos.commoditySlug.toLowerCase();
      const name = pos.commodityName;
      const qtyT = parseFloat(pos.qty) / 1000;
      if (!isFinite(qtyT) || qtyT <= 0) return;

      let syntheticQtyT = 0;
      if (pos.type === "CALL") {
        syntheticQtyT = pos.role === "buyer" ? qtyT : -qtyT;
      } else {
        syntheticQtyT = pos.role === "buyer" ? -qtyT : qtyT;
      }

      if (!map[slug]) {
        const indexInfo = indexPriceMap[slug];
        const pricePerT = indexInfo?.latestPricePerTon;
        map[slug] = {
          commoditySlug: slug,
          commodityName: name,
          spotQtyT: 0,
          syntheticFromOptionsT: 0,
          totalNetT: 0,
          currentPricePerT: pricePerT,
          spotValueUsd: 0,
          optionsValueUsd: 0,
          totalValueUsd: 0,
        };
      }

      map[slug].syntheticFromOptionsT += syntheticQtyT;

      const pricePerT =
        map[slug].currentPricePerT ??
        indexPriceMap[slug]?.latestPricePerTon;
      if (pricePerT !== undefined) {
        const valueUsd = syntheticQtyT * pricePerT;
        map[slug].optionsValueUsd =
          (map[slug].optionsValueUsd || 0) + valueUsd;
        map[slug].currentPricePerT = pricePerT;
      }
    });

    // Finalize totals
    Object.values(map).forEach((entry) => {
      entry.totalNetT = entry.spotQtyT + entry.syntheticFromOptionsT;
      if (entry.currentPricePerT !== undefined) {
        entry.totalValueUsd =
          (entry.spotValueUsd || 0) + (entry.optionsValueUsd || 0);
      }
    });

    return Object.values(map);
  }, [spotPositions, enrichedPositions, indexPriceMap]);

  // Derived values - computed after all hooks
  const isLoading = isAuthLoading || isPortfolioLoading;
  const shouldRedirect = !isAuthLoading && !user;
  const hasError = error || (!isPortfolioLoading && !portfolioData);
  const totalPnL = portfolioData ? parseFloat(portfolioData.totalPnL) : 0;
  const realizedPnL = portfolioData ? parseFloat(portfolioData.realizedPnL) : 0;
  const unrealizedPnL = portfolioData ? parseFloat(portfolioData.unrealizedPnL) : 0;
  const isProfitable = totalPnL >= 0;

  // Single return with conditional rendering - all hooks must be called before this
  if (shouldRedirect) {
    return null;
  }

  // Loading state
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

  // Error state
  if (hasError) {
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

  // Main content - portfolioData is guaranteed to exist here
  if (!portfolioData) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-2" data-testid="heading-portfolio">Portfolio</h1>
            <p className="text-muted-foreground">Your options positions and performance</p>
          </div>
          <BackToDashboard />
        </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6">
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

          {/* Realized PnL */}
          <Card data-testid="card-realized-pnl">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Realized P&L</CardTitle>
              {realizedPnL >= 0 ? (
                <TrendingUp className="h-4 w-4 text-success" />
              ) : (
                <TrendingDown className="h-4 w-4 text-destructive" />
              )}
            </CardHeader>
            <CardContent>
              <div 
                className={`text-2xl font-bold ${realizedPnL >= 0 ? 'text-success' : 'text-destructive'}`}
                data-testid="text-realized-pnl"
              >
                {realizedPnL >= 0 ? '+' : ''}${realizedPnL.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Settled options
              </p>
            </CardContent>
          </Card>

          {/* Unrealized PnL */}
          <Card data-testid="card-unrealized-pnl">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Unrealized P&L</CardTitle>
              {unrealizedPnL >= 0 ? (
                <TrendingUp className="h-4 w-4 text-success" />
              ) : (
                <TrendingDown className="h-4 w-4 text-destructive" />
              )}
            </CardHeader>
            <CardContent>
              <div 
                className={`text-2xl font-bold ${unrealizedPnL >= 0 ? 'text-success' : 'text-destructive'}`}
                data-testid="text-unrealized-pnl"
              >
                {unrealizedPnL >= 0 ? '+' : ''}${unrealizedPnL.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Open positions
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
                {portfolioData.openPositions}
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
                ${parseFloat(portfolioData.lockedCollateral).toFixed(2)}
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
              <AlertTriangle className={`h-4 w-4 ${portfolioData.marginCalls > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
            </CardHeader>
            <CardContent>
              <div 
                className={`text-2xl font-bold ${portfolioData.marginCalls > 0 ? 'text-destructive' : ''}`}
                data-testid="text-margin-calls"
              >
                {portfolioData.marginCalls}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {portfolioData.marginCalls > 0 ? 'Action required' : 'All clear'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Trading Status Banner */}
        <TradingStatusBanner onOpenWalletModal={handleOpenWalletModal} />

        {/* Positions Table */}
        <Card>
          <CardHeader>
            <CardTitle>Positions</CardTitle>
          </CardHeader>
          <CardContent>
            {portfolioData.positions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground" data-testid="text-no-positions">
                <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />
                {userTier === "guest" ? (
                  <>
                    <p className="text-lg font-medium mb-2">Log in to see your options portfolio</p>
                    <Link href="/login">
                      <Button size="sm" data-testid="button-empty-sign-in">
                        Sign in
                      </Button>
                    </Link>
                  </>
                ) : userTier === "user_no_wallet" ? (
                  <>
                    <p className="text-lg font-medium mb-2">Connect your wallet to start trading options</p>
                    <Button size="sm" onClick={handleOpenWalletModal} data-testid="button-empty-connect-wallet">
                      Connect wallet
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-medium mb-2">No positions yet</p>
                    <p className="text-sm">Start trading options to see your portfolio here</p>
                  </>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Underlying</TableHead>
                      <TableHead>Type / Side</TableHead>
                      <TableHead className="text-right">Size (t)</TableHead>
                      <TableHead className="text-right">Strike ($/t)</TableHead>
                      <TableHead>Expiry / TTE</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">P&L</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {enrichedPositions.map((position) => {
                      const positionPnL = parseFloat(position.pnl);
                      const isProfitablePosition = positionPnL >= 0;
                      
                      // Convert quantity from kg to tonnes for display
                      const quantityTonnes = parseFloat(position.qty) / 1000;
                      
                      // Convert strike from per kg to per ton (multiply by 1000)
                      const strikePerTon = parseFloat(position.strike) * 1000;
                      
                      // Calculate PnL percentage (approximate based on premium)
                      const premium = parseFloat(position.premium);
                      const pnlPercent = premium !== 0 ? (positionPnL / (premium * quantityTonnes)) * 100 : 0;

                      const { underlying, expirationDateObj, timeToExpiryLabel, impliedPnlLabel, impliedPnlSign } = position;

                      return (
                    <TableRow
                      key={position.optionId}
                      data-testid={`row-position-${position.optionId}`}
                      className={
                        focusedCommodity && underlying === focusedCommodity
                          ? "bg-muted/40"
                          : ""
                      }
                    >
                          <TableCell className="font-medium" data-testid={`text-underlying-${position.optionId}`}>
                            {underlying}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <OptionTypeBadge type={position.type} />
                              <Badge 
                                variant={position.role === 'buyer' ? 'default' : 'secondary'} 
                                className="text-xs"
                                data-testid={`badge-side-${position.optionId}`}
                              >
                                {position.role === 'buyer' ? 'LONG' : 'SHORT'}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono" data-testid={`text-size-${position.optionId}`}>
                            {quantityTonnes.toFixed(2)} t
                          </TableCell>
                          <TableCell className="text-right font-mono" data-testid={`text-strike-${position.optionId}`}>
                            ${strikePerTon.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-sm" data-testid={`text-expiry-${position.optionId}`}>
                            {expirationDateObj && !isNaN(expirationDateObj.getTime()) ? (
                              <div className="flex flex-col">
                                <span className="text-muted-foreground">
                                  {format(expirationDateObj, "MMM dd, yyyy")}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {timeToExpiryLabel}
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">N/A</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={position.status} />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-col items-end gap-1">
                              <span 
                                className={`font-mono font-semibold ${isProfitablePosition ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                                data-testid={`text-pnl-${position.optionId}`}
                              >
                                {isProfitablePosition ? '+' : ''}{positionPnL.toFixed(2)} CROPT
                              </span>
                              <span 
                                className={`text-xs font-mono ${isProfitablePosition ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                                data-testid={`text-pnl-percent-${position.optionId}`}
                              >
                                ({isProfitablePosition ? '+' : ''}{pnlPercent.toFixed(1)}%)
                              </span>
                              <span
                                className={`text-xs font-mono ${
                                  impliedPnlSign === "positive"
                                    ? "text-green-600 dark:text-green-400"
                                    : impliedPnlSign === "negative"
                                    ? "text-red-600 dark:text-red-400"
                                    : "text-muted-foreground"
                                }`}
                                data-testid={`text-implied-pnl-${position.optionId}`}
                              >
                                Implied now: {impliedPnlLabel}
                              </span>
                              <Button
                                variant="outline"
                                size="xs"
                                className="mt-1"
                                onClick={() =>
                                  setHedgeModalState({
                                    // TODO: Improve heuristic: determine effective LONG/SHORT underlying from option type and role.
                                    // For now, default to SELL hedge so user can manually adjust direction/size in the modal.
                                    mode: "sell",
                                    commoditySlug: underlying.toLowerCase(),
                                    commodityName: underlying,
                                    // We don't have index price on this page; pass 0 and let the modal handle display gracefully.
                                    currentPrice: 0,
                                  })
                                }
                                data-testid={`button-hedge-with-spot-${position.optionId}`}
                              >
                                Hedge with spot
                              </Button>
                            </div>
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

        {/* Spot Positions */}
        <SpotPositionsTable 
          positions={spotPositions} 
          isLoading={isSpotLoading}
          onOpenLogin={handleOpenLogin}
          onOpenWalletModal={handleOpenWalletModal}
          optionsByCommodity={optionsByCommodity}
          onShowOptionsForCommodity={(commoditySlug) => {
            setFocusedCommodity(commoditySlug);
          }}
        />

        {/* Net Exposure / Hedged Positions */}
        <Card>
          <CardHeader>
            <CardTitle>Net Exposure</CardTitle>
          </CardHeader>
          <CardContent>
            {netExposure.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">No exposure yet. Trade options or spot to see your net positions here.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Commodity</TableHead>
                      <TableHead className="text-right">Spot (t)</TableHead>
                      <TableHead className="text-right">Options (t)</TableHead>
                      <TableHead className="text-right">Net (t)</TableHead>
                      <TableHead className="text-right">Current Price ($/t)</TableHead>
                      <TableHead className="text-right">Net Value ($)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {netExposure.map((entry) => {
                      const netClass =
                        entry.totalNetT > 0
                          ? "text-green-600 dark:text-green-400"
                          : entry.totalNetT < 0
                          ? "text-red-600 dark:text-red-400"
                          : "text-muted-foreground";

                      return (
                        <TableRow key={entry.commoditySlug}>
                          <TableCell className="font-medium">
                            {entry.commodityName}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {entry.spotQtyT.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {entry.syntheticFromOptionsT.toFixed(2)}
                          </TableCell>
                          <TableCell className={`text-right font-mono ${netClass}`}>
                            {entry.totalNetT.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {entry.currentPricePerT !== undefined
                              ? `$${entry.currentPricePerT.toFixed(2)}`
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {entry.totalValueUsd !== undefined
                              ? `$${entry.totalValueUsd.toFixed(2)}`
                              : "—"}
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

      {/* Linked options modal for focused commodity */}
      {focusedCommodity && (
        <Dialog open={true} onOpenChange={(open) => !open && setFocusedCommodity(null)}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Options for {focusedCommodity}</DialogTitle>
            </DialogHeader>
            <div className="mt-2">
              {optionsByCommodityList[focusedCommodity] && optionsByCommodityList[focusedCommodity].length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Strike</TableHead>
                        <TableHead className="text-right">Qty (t)</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Premium</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {optionsByCommodityList[focusedCommodity].map((opt) => (
                        <TableRow key={opt.id}>
                          <TableCell>
                            <OptionTypeBadge type={opt.type as "CALL" | "PUT"} />
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            ${parseFloat(opt.strike).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {parseFloat(opt.qty).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={opt.status as any} />
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            ${parseFloat(opt.premium).toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No options linked to this commodity yet.
                </p>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setFocusedCommodity(null);
                  setLocation("/#options-table");
                }}
              >
                Open Options Marketplace
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Wallet Authentication Modal */}
      <WalletAuthModal
        open={isWalletAuthModalOpen}
        onOpenChange={setIsWalletAuthModalOpen}
        onSuccess={handleWalletAuthSuccess}
      />

      {/* Hedge with Spot Modals */}
      {hedgeModalState && hedgeModalState.mode === "sell" && (
        <SpotSellModal
          isOpen={true}
          onClose={() => setHedgeModalState(null)}
          commoditySlug={hedgeModalState.commoditySlug}
          commodityName={hedgeModalState.commodityName}
          currentPrice={hedgeModalState.currentPrice}
          onOpenLogin={() => setLocation("/login")}
          onOpenWalletModal={() => setIsWalletAuthModalOpen(true)}
        />
      )}
      {hedgeModalState && hedgeModalState.mode === "buy" && (
        <SpotBuyModal
          isOpen={true}
          onClose={() => setHedgeModalState(null)}
          commoditySlug={hedgeModalState.commoditySlug}
          commodityName={hedgeModalState.commodityName}
          currentPrice={hedgeModalState.currentPrice}
          onOpenLogin={() => setLocation("/login")}
          onOpenWalletModal={() => setIsWalletAuthModalOpen(true)}
        />
      )}
    </div>
  );
}
