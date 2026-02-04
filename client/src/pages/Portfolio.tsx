import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { useTranslation } from "react-i18next";
import { usePolling } from "@/hooks/usePolling";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, Briefcase, AlertTriangle, DollarSign, Shield } from "lucide-react";
import { format, differenceInDays, formatDistanceToNow } from "date-fns";
import { StatusBadge } from "@/components/StatusBadge";
import { OptionTypeBadge } from "@/components/OptionTypeBadge";
import { PortfolioHealthGauge } from "@/components/PortfolioHealthGauge";
import { SpotPositionsTable } from "@/components/SpotPositionsTable";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SpotBuyModal } from "@/components/SpotBuyModal";
import { SpotSellModal } from "@/components/SpotSellModal";
import { WalletAuthModal } from "@/components/WalletAuthModal";
import { TradingStatusBanner } from "@/components/TradingStatusBanner";
import { ExerciseOptionDialog } from "@/components/ExerciseOptionDialog";
import { WithdrawDialog } from "@/components/WithdrawDialog";
import { WalletSummary } from "@/components/WalletSummary";
import { useUserTier } from "@/hooks/useUserTier";
import { useTradingGuard } from "@/hooks/useTradingGuard";
import { useWalletSummary } from "@/hooks/useWalletSummary";
import { usePortfolioSummary } from "@/hooks/usePortfolioSummary";
import { useForwardPortfolio } from "@/hooks/useForwardPortfolio";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import type { Option } from "@shared/schema";
import { Badge } from "@/components/ui/badge";

interface CommodityIndex {
  id: string;
  name: string;
  slug: string;
  category: string;
  hasVat: boolean;
  isStale?: boolean;
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
  strike: string; // Strike in $/ton
  strikePerTon?: string; // Strike in $/ton (for display)
  qty: string; // Quantity in tons
  premium: string; // Premium per ton
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
function formatTimeToExpiry(expirationDate: string | Date | undefined | null, t: (key: string, options?: any) => string): string {
  let expiry: Date | null = null;
  
  if (expirationDate instanceof Date) {
    expiry = expirationDate;
  } else if (typeof expirationDate === 'string') {
    try {
      expiry = new Date(expirationDate);
    } catch {
      return t('page.portfolio.timeToExpiry.na');
    }
  }
  
  if (!expiry || isNaN(expiry.getTime())) {
    return t('page.portfolio.timeToExpiry.na');
  }

  try {
    const now = new Date();
    const daysDiff = differenceInDays(expiry, now);

    if (daysDiff < 0) {
      // Expired
      const days = Math.abs(daysDiff);
      return t('page.portfolio.timeToExpiry.expiredAgo', { count: days, days });
    } else if (daysDiff === 0) {
      return t('page.portfolio.timeToExpiry.expiresToday');
    } else if (daysDiff === 1) {
      return t('page.portfolio.timeToExpiry.expiresTomorrow');
    } else if (daysDiff <= 7) {
      return t('page.portfolio.timeToExpiry.daysLeft', { count: daysDiff, days: daysDiff });
    } else {
      return t('page.portfolio.timeToExpiry.inDays', { count: daysDiff, days: daysDiff });
    }
  } catch {
    return t('page.portfolio.timeToExpiry.na');
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
    walletAddress?: string;
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

type OptionFilterTab = "all" | "active" | "settled" | "expired";

// Map option statuses to filter categories (client-side only)
function getOptionStatusCategory(status: string): "active" | "settled" | "expired" {
  const upperStatus = status.toUpperCase();
  
  // Active: positions with live risk
  if (["OPEN", "MATCHED", "FILLED", "MARGIN_CALL"].includes(upperStatus)) {
    return "active";
  }
  
  // Settled: fully cash-settled but not expired independently
  if (["SETTLED", "EXERCISED"].includes(upperStatus)) {
    return "settled";
  }
  
  // Expired: final states
  if (["EXPIRED", "CANCELLED", "DEFAULTED", "WITHDRAWN"].includes(upperStatus)) {
    return "expired";
  }
  
  // Default to active for unknown statuses
  return "active";
}

export default function Portfolio() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [isWalletAuthModalOpen, setIsWalletAuthModalOpen] = useState(false);
  const [focusedCommodity, setFocusedCommodity] = useState<string | null>(null);
  const [optionFilterTab, setOptionFilterTab] = useState<OptionFilterTab>("active");
  const [mainTab, setMainTab] = useState<"options" | "forwards" | "all">("all");
  const [hedgeModalState, setHedgeModalState] = useState<{
    mode: "buy" | "sell";
    commoditySlug: string;
    commodityName: string;
    currentPrice: number;
  } | null>(null);
  const userTier = useUserTier();
  const { toast } = useToast();

  // Check authentication
  const { data: userData, isLoading: isAuthLoading } = useQuery<UserData | null>({
    queryKey: ["/api/auth/me"],
    retry: false,
    enabled: !!localStorage.getItem('cropto_token'),
  });

  const user = userData?.user;

  // Get wallet summary data
  const walletData = useWalletSummary(user?.walletAddress || null);

  const handleOpenLogin = () => {
    // Navigate to login page
    setLocation("/login");
  };

  const handleOpenWalletModal = () => {
    setIsWalletAuthModalOpen(true);
  };

  const guardTradingAction = useTradingGuard({
    onOpenLogin: handleOpenLogin,
    onOpenWalletModal: handleOpenWalletModal,
  });

  const handleWalletAuthSuccess = (token: string, newUser: boolean) => {
    // Invalidate queries to refresh user data
    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    queryClient.invalidateQueries({ queryKey: ["/api/spot/positions"] });
    queryClient.invalidateQueries({ queryKey: ["/api/portfolio/me"] });
    setIsWalletAuthModalOpen(false);
  };

  // Helper to check if user can exercise an option
  function canExercise(optionId: string): boolean {
    if (!user) return false;
    const option = allOptions.find(opt => opt.id === optionId);
    if (!option) return false;
    return option.buyerId === user.id || option.issuerId === user.id;
  }

  // Exercise mutation
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
        title: t('page.portfolio.toast.exerciseSuccessTitle'),
        description: t('page.portfolio.toast.exerciseSuccessDesc'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('page.portfolio.toast.exerciseFailedTitle'),
        description: error.message || t('page.portfolio.toast.exerciseFailedDesc'),
        variant: "destructive",
      });
    },
  });

  // Withdraw mutation (placeholder - implement if needed)
  const withdrawMutation = useMutation({
    mutationFn: async (data: { optionId: string; address: string; amount: string }) => {
      const response = await apiRequest("POST", `/api/options/${data.optionId}/withdraw`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/options"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/me"] });
      toast({
        title: t('page.portfolio.toast.withdrawSuccessTitle'),
        description: t('page.portfolio.toast.withdrawSuccessDesc'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('page.portfolio.toast.withdrawFailedTitle'),
        description: error.message || t('page.portfolio.toast.withdrawFailedDesc'),
        variant: "destructive",
      });
    },
  });

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

  // Fetch portfolio summary for aggregated metrics
  const { data: portfolioSummary, isLoading: isSummaryLoading } = usePortfolioSummary(!!user);

  // Fetch forward portfolio
  const { data: forwardPositions = [], isLoading: isForwardLoading } = useForwardPortfolio(!!user);

  const { data: marginCallsList = [] } = useQuery<any[]>({
    queryKey: ["/api/margin-calls"],
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
      let timeToExpiryLabel = t('page.portfolio.timeToExpiry.na');
      let isExpired = false;

      if (expirationDate && !isNaN(expirationDate.getTime())) {
        timeToExpiryMs = expirationDate.getTime() - now.getTime();
        if (timeToExpiryMs <= 0) {
          isExpired = true;
          timeToExpiryLabel = t('page.portfolio.timeToExpiry.expired');
        } else {
          const totalMinutes = Math.floor(timeToExpiryMs / (1000 * 60));
          const totalHours = Math.floor(totalMinutes / 60);
          const days = Math.floor(totalHours / 24);
          const hours = totalHours % 24;
          const minutes = totalMinutes % 60;

          if (days >= 1) {
            timeToExpiryLabel = hours > 0
              ? t('page.portfolio.timeToExpiry.shortDaysHours', { days, hours })
              : t('page.portfolio.timeToExpiry.shortDays', { days });
          } else if (hours >= 1) {
            timeToExpiryLabel = minutes > 0
              ? t('page.portfolio.timeToExpiry.shortHoursMinutes', { hours, minutes })
              : t('page.portfolio.timeToExpiry.shortHours', { hours });
          } else {
            timeToExpiryLabel = t('page.portfolio.timeToExpiry.shortMinutes', { minutes });
          }
        }
      }

      // Implied PnL (very simplified, intrinsic-only approximation)
      let impliedPnlNow: number | null = null;
      let impliedPnlLabel = t('page.portfolio.values.dash');
      let impliedPnlSign: "positive" | "negative" | "flat" = "flat";

      const indexKey = underlying.toLowerCase();
      const pnlIndexInfo = indexPriceMap[indexKey];

      if (pnlIndexInfo) {
        // Use strikePerTon from API (already in $/ton, no conversion needed)
        const strikePerTon = position.strikePerTon 
          ? parseFloat(position.strikePerTon)
          : parseFloat(position.strike); // Fallback: assume already in $/ton
        // Quantity is already in tons (per user's note)
        const qtyTonnes = parseFloat(position.qty);
        const currentPerTon = pnlIndexInfo.latestPricePerTon;
        const premiumPerTon = parseFloat(position.premium); // Premium is per ton

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

      // Try to get commodity name from index map
      const commoditySlug = underlying.toLowerCase();
      const indexInfo = indexPriceMap[commoditySlug];
      const finalCommodityName = indexInfo?.name || underlying;

      return {
        ...position,
        underlying,
        commoditySlug,
        commodityName: finalCommodityName,
        expirationDateObj: expirationDate,
        timeToExpiryMs,
        timeToExpiryLabel,
        isExpired,
        impliedPnlNow,
        impliedPnlLabel,
        impliedPnlSign,
      };
    });
  }, [portfolioData, indexPriceMap, t]);

  // Build options exposure map by underlying commodity (in tonnes)
  const optionsExposure = useMemo(() => {
    const exposure: Record<string, number> = {};
    if (!user) return exposure;

    allOptions.forEach((opt) => {
      // Only consider options where user is buyer or issuer
      if (opt.buyerId !== user.id && opt.issuerId !== user.id) {
        return;
      }

      // Only active positions
      const status = opt.status?.toUpperCase();
      if (status !== "OPEN" && status !== "FILLED") {
        return;
      }

      // Get commodity slug
      const slug = ((opt as any).commoditySlug || opt.commodity || "").toLowerCase();
      if (!slug) return;

      // Quantity is already in tonnes (per user's note)
      const qtyT = parseFloat(opt.qty);
      if (!isFinite(qtyT) || qtyT <= 0) return;

      // Determine user's role
      const isBuyer = opt.buyerId === user.id;
      const isSeller = opt.issuerId === user.id;

      // Calculate synthetic exposure
      let syntheticQtyT = 0;
      if (opt.type === "CALL") {
        if (isBuyer) {
          syntheticQtyT = qtyT; // CALL buyer → +quantityTons
        } else if (isSeller) {
          syntheticQtyT = -qtyT; // CALL seller → -quantityTons
        }
      } else if (opt.type === "PUT") {
        if (isBuyer) {
          syntheticQtyT = -qtyT; // PUT buyer → -quantityTons
        } else if (isSeller) {
          syntheticQtyT = qtyT; // PUT seller → +quantityTons
        }
      }

      // Accumulate exposure
      exposure[slug] = (exposure[slug] || 0) + syntheticQtyT;
    });

    return exposure;
  }, [allOptions, user]);

  const netExposure: NetCommodityExposure[] = useMemo(() => {
    const map: Record<string, NetCommodityExposure> = {};

    // Seed with spot positions
    spotPositions.forEach((spot) => {
      const slug = spot.commoditySlug.toLowerCase();
      const name = spot.commodityName;
      const qtyT = parseFloat(spot.quantityKg) / 1000; // Spot quantities are stored in kg; convert to tonnes
      const currentPricePerT = parseFloat(spot.currentPricePerKg) * 1000; // Spot prices are per kg; convert to $/ton
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

    // Add synthetic exposure from options
    Object.entries(optionsExposure).forEach(([slug, optionsTons]) => {
      if (!map[slug]) {
        // Get commodity name from index map or use slug
        const indexInfo = indexPriceMap[slug];
        const name = indexInfo?.name || slug;
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

      map[slug].syntheticFromOptionsT = optionsTons;

      // Calculate options value
      const pricePerT =
        map[slug].currentPricePerT ??
        indexPriceMap[slug]?.latestPricePerTon;
      if (pricePerT !== undefined) {
        const valueUsd = optionsTons * pricePerT;
        map[slug].optionsValueUsd = valueUsd;
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
  }, [spotPositions, optionsExposure, indexPriceMap]);

  // Filter enriched positions by selected tab
  const filteredPositions = useMemo(() => {
    if (optionFilterTab === "all") {
      return enrichedPositions;
    }
    return enrichedPositions.filter((pos) => {
      const category = getOptionStatusCategory(pos.status);
      return category === optionFilterTab;
    });
  }, [enrichedPositions, optionFilterTab]);

  // Derived values - computed after all hooks
  // All summary values come directly from /api/portfolio/me response
  const isLoading = isAuthLoading || isPortfolioLoading || isSummaryLoading || isForwardLoading;
  const shouldRedirect = !isAuthLoading && !user;
  const hasError = error || (!isPortfolioLoading && !portfolioData);
  
  // Extract summary values from API response
  // Backend calculates totalPnL as realizedPnL + unrealizedPnL, so we use it directly
  const totalPnL = portfolioData ? parseFloat(portfolioData.totalPnL || "0") : 0;
  const realizedPnL = portfolioData ? parseFloat(portfolioData.realizedPnL || "0") : 0;
  const unrealizedPnL = portfolioData ? parseFloat(portfolioData.unrealizedPnL || "0") : 0;
  const openPositions = portfolioData?.openPositions ?? 0;
  const lockedCollateral = portfolioData ? parseFloat(portfolioData.lockedCollateral || "0") : 0;
  const marginCalls = portfolioData?.marginCalls ?? 0;
  const myMarginCalls = useMemo(() => {
    if (!user) return [];
    return (marginCallsList || []).filter((mc: any) => mc.userId === user.id);
  }, [marginCallsList, user]);
  
  // Determine if profitable for UI styling (Total P&L >= 0)
  const isProfitable = totalPnL >= 0;

  // Collateral & Risk calculations (UI-only approximations)
  // TODO: These are approximations based on available data. In a real system, 
  // we would have explicit availableMargin and usedMargin fields from the backend.
  // For now, we approximate:
  // - Used margin ≈ lockedCollateral (collateral currently locked in positions)
  // - Available margin ≈ internalBalance - lockedCollateral (if we had internal balance)
  // - Since we don't have internal balance in portfolio response, we use a placeholder
  const usedMargin = lockedCollateral;
  // Approximate available margin: assume user has some free balance (this is a UI placeholder)
  // In reality, this should come from /api/spot/balance or similar
  const estimatedAvailableMargin = Math.max(0, walletData.internalBalance - lockedCollateral);
  const totalMargin = usedMargin + estimatedAvailableMargin;
  
  // Risk ratio: usedMargin / totalMargin (clamped 0-1)
  const riskRatio = totalMargin > 0 
    ? Math.min(1, Math.max(0, usedMargin / totalMargin))
    : 0;
  
  // Risk level colors
  const riskColor = riskRatio >= 0.85 
    ? "text-destructive" 
    : riskRatio >= 0.60 
    ? "text-yellow-600 dark:text-yellow-400"
    : "text-green-600 dark:text-green-400";
  
  const riskBarColor = riskRatio >= 0.85 
    ? "bg-destructive" 
    : riskRatio >= 0.60 
    ? "bg-yellow-500"
    : "bg-green-500";

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
          <h1 className="text-3xl font-bold mb-2">{t('page.portfolio.title')}</h1>
          <p className="text-muted-foreground">{t('page.portfolio.subtitle')}</p>
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
            <AlertTitle>{t('common.error')}</AlertTitle>
            <AlertDescription>
              {error instanceof Error ? error.message : t('page.portfolio.loadError')}
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
      <Header onCreateOption={() => {}} />
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-2" data-testid="heading-portfolio">{t('page.portfolio.title')}</h1>
            <p className="text-muted-foreground">{t('page.portfolio.overviewSubtitle')}</p>
          </div>
        </div>

        {/* Main Tabs */}
        <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as "options" | "forwards" | "all")}>
          <TabsList>
            <TabsTrigger value="all">{t('page.portfolio.tabs.allPositions')}</TabsTrigger>
            <TabsTrigger value="options">{t('page.portfolio.tabs.options')}</TabsTrigger>
            <TabsTrigger value="forwards">{t('page.portfolio.tabs.forwards')}</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-6">
            {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6">
          {/* Total PnL */}
          <Card data-testid="card-total-pnl">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('page.portfolio.metrics.totalPnl')}</CardTitle>
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
                {t('page.portfolio.metrics.totalPnlDesc')}
              </p>
            </CardContent>
          </Card>

          {/* Realized PnL */}
          <Card data-testid="card-realized-pnl">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('page.portfolio.metrics.realizedPnl')}</CardTitle>
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
                {t('page.portfolio.metrics.realizedPnlDesc')}
              </p>
            </CardContent>
          </Card>

          {/* Unrealized PnL */}
          <Card data-testid="card-unrealized-pnl">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('page.portfolio.metrics.unrealizedPnl')}</CardTitle>
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
                {t('page.portfolio.metrics.unrealizedPnlDesc')}
              </p>
            </CardContent>
          </Card>

          {/* Open Positions */}
          <Card data-testid="card-open-positions">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('page.portfolio.metrics.openPositions')}</CardTitle>
              <Briefcase className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-open-positions">
                {openPositions}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t('page.portfolio.metrics.openPositionsDesc')}
              </p>
            </CardContent>
          </Card>

          {/* Locked Collateral */}
          <Card data-testid="card-locked-collateral">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('page.portfolio.metrics.lockedCollateral')}</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-locked-collateral">
                ${lockedCollateral.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t('page.portfolio.metrics.lockedCollateralDesc')}
              </p>
            </CardContent>
          </Card>

          {/* Margin Calls */}
          <Card data-testid="card-margin-calls">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('page.portfolio.metrics.marginCalls')}</CardTitle>
              <AlertTriangle className={`h-4 w-4 ${marginCalls > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
            </CardHeader>
            <CardContent>
              <div 
                className={`text-2xl font-bold ${marginCalls > 0 ? 'text-destructive' : ''}`}
                data-testid="text-margin-calls"
              >
                {marginCalls}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {marginCalls > 0 ? t('page.portfolio.metrics.actionRequired') : t('page.portfolio.metrics.allClear')}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Portfolio Health Gauge (full width, aligned with wallet card) */}
        {portfolioSummary && (
          <div className="mt-6 w-full">
            <PortfolioHealthGauge
              healthPct={portfolioSummary.healthPct}
              totalNotionalUsd={portfolioSummary.totalNotionalUsd}
              requiredMargin={portfolioSummary.requiredMargin}
              realizedPnl={portfolioSummary.realizedPnl}
              unrealizedPnl={portfolioSummary.unrealizedPnl}
            />
          </div>
        )}

        {/* Wallet Summary Bar */}
        {user?.walletAddress && (
          <div className="mt-6">
            <WalletSummary variant="bar" {...walletData} />
          </div>
        )}

        {/* Trading Status Banner */}
        <TradingStatusBanner onOpenWalletModal={handleOpenWalletModal} />

        {/* Collateral & Risk Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {t('page.portfolio.collateralRisk.title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">{t('page.portfolio.collateralRisk.availableMargin')}</p>
                <p className="text-2xl font-bold">
                  ${estimatedAvailableMargin.toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('page.portfolio.collateralRisk.availableMarginDesc')}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">{t('page.portfolio.collateralRisk.usedMargin')}</p>
                <p className="text-2xl font-bold">
                  ${usedMargin.toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('page.portfolio.collateralRisk.usedMarginDesc')}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">{t('page.portfolio.collateralRisk.riskLevel')}</p>
                <p className={`text-2xl font-bold ${riskColor}`}>
                  {(riskRatio * 100).toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {riskRatio >= 0.85 ? t('page.portfolio.collateralRisk.riskLevelHigh') : riskRatio >= 0.60 ? t('page.portfolio.collateralRisk.riskLevelModerate') : t('page.portfolio.collateralRisk.riskLevelLow')}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('page.portfolio.collateralRisk.marginUtilization')}</span>
                <span className={riskColor}>
                  ${usedMargin.toFixed(2)} / ${totalMargin.toFixed(2)}
                </span>
              </div>
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div 
                  className={`h-full transition-all ${riskBarColor}`}
                  style={{ width: `${riskRatio * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0%</span>
                <span>100%</span>
              </div>
            </div>
            {marginCalls > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{t('page.portfolio.collateralRisk.marginCallsActive')}</AlertTitle>
                <AlertDescription>
                  {t('page.portfolio.collateralRisk.marginCallsActiveDesc', { count: marginCalls })}
                </AlertDescription>
              </Alert>
            )}
            {myMarginCalls.length > 0 && (
              <div className="mt-3 rounded-md border bg-muted/30 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">{t('page.portfolio.marginCalls.yourMarginCalls')}</div>
                  <div className="text-xs text-muted-foreground">{t('page.portfolio.marginCalls.deadlinesAndStatus')}</div>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('page.portfolio.marginCalls.table.option')}</TableHead>
                        <TableHead>{t('page.portfolio.marginCalls.table.required')}</TableHead>
                        <TableHead>{t('page.portfolio.marginCalls.table.status')}</TableHead>
                        <TableHead>{t('page.portfolio.marginCalls.table.deadline')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {myMarginCalls.map((mc: any) => {
                        const deadline = mc.deadline ? new Date(mc.deadline) : null;
                        const now = new Date();
                        const hoursLeft = deadline ? (deadline.getTime() - now.getTime()) / (1000 * 60 * 60) : null;
                        const isOverdue = deadline ? deadline.getTime() < now.getTime() : false;
                        const isLiquidated = String(mc.status || "").toUpperCase() === "LIQUIDATED";
                        const badgeClass =
                          isLiquidated && isOverdue
                            ? "bg-red-100 text-red-900"
                            : hoursLeft !== null && hoursLeft < 24
                            ? "bg-amber-100 text-amber-900"
                            : "bg-muted text-foreground";
                        return (
                          <TableRow key={mc.id}>
                            <TableCell className="font-mono text-xs">{mc.optionId}</TableCell>
                            <TableCell className="font-mono text-sm">
                              ${parseFloat(mc.amountRequired || mc.amount || 0).toFixed(2)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {mc.status || t('common.pending')}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              {deadline ? (
                                <div className="flex items-center gap-2">
                                  <Badge className={`text-[11px] ${badgeClass}`}>
                                    {isOverdue
                                      ? t('page.portfolio.marginCalls.overdue')
                                      : hoursLeft !== null
                                      ? t('page.portfolio.marginCalls.hoursLeft', { hours: Math.max(0, Math.floor(hoursLeft)) })
                                      : t('page.portfolio.values.dash')}
                                  </Badge>
                                  <span className="font-mono text-xs">
                                    {format(deadline, "MMM dd HH:mm")}
                                  </span>
                                </div>
                              ) : (
                                "-"
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Option Positions Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('page.portfolio.positions.title')}</CardTitle>
              <Tabs value={optionFilterTab} onValueChange={(v) => setOptionFilterTab(v as OptionFilterTab)}>
                <TabsList>
                  <TabsTrigger value="all">{t('page.portfolio.filters.all')}</TabsTrigger>
                  <TabsTrigger value="active">{t('page.portfolio.filters.active')}</TabsTrigger>
                  <TabsTrigger value="settled">{t('page.portfolio.filters.settled')}</TabsTrigger>
                  <TabsTrigger value="expired">{t('page.portfolio.filters.expired')}</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            {portfolioData.positions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground" data-testid="text-no-positions">
                <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />
                {userTier === "guest" ? (
                  <>
                    <p className="text-lg font-medium mb-2">{t('page.portfolio.empty.loginRequired')}</p>
                    <Link href="/login">
                      <Button size="sm" data-testid="button-empty-sign-in">
                        {t('button.login')}
                      </Button>
                    </Link>
                  </>
                ) : userTier === "user_no_wallet" ? (
                  <>
                    <p className="text-lg font-medium mb-2">{t('page.portfolio.empty.walletRequired')}</p>
                    <Button size="sm" onClick={handleOpenWalletModal} data-testid="button-empty-connect-wallet">
                      {t('button.connectWallet')}
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-medium mb-2">{t('page.portfolio.positions.empty')}</p>
                    <p className="text-sm">{t('page.portfolio.positions.emptySubtitle')}</p>
                  </>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('page.portfolio.positions.table.commodity')}</TableHead>
                      <TableHead>{t('page.portfolio.positions.table.type')}</TableHead>
                      <TableHead>{t('page.portfolio.positions.table.side')}</TableHead>
                      <TableHead className="text-right">{t('page.portfolio.positions.table.qty')}</TableHead>
                      <TableHead className="text-right">{t('page.portfolio.positions.table.strike')}</TableHead>
                      <TableHead className="text-right">{t('page.portfolio.positions.table.entryPremium')}</TableHead>
                      <TableHead className="text-right">{t('page.portfolio.positions.table.currentPrice')}</TableHead>
                      <TableHead className="text-right">{t('page.portfolio.positions.table.pnl')}</TableHead>
                      <TableHead>{t('page.portfolio.positions.table.expiry')}</TableHead>
                      <TableHead>{t('page.portfolio.positions.table.status')}</TableHead>
                      <TableHead className="text-right">{t('page.portfolio.positions.table.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPositions.map((position) => {
                      const positionPnL = parseFloat(position.pnl);
                      const isProfitablePosition = positionPnL >= 0;
                      
                      // Quantity is already in tons (per user's note)
                      const quantityTonnes = parseFloat(position.qty);
                      
                      // Use strikePerTon from API (already in $/ton, no conversion needed)
                      const strikePerTon = position.strikePerTon 
                        ? parseFloat(position.strikePerTon)
                        : parseFloat(position.strike); // Fallback: assume already in $/ton
                      
                      // Entry Premium: negative for LONG (paid), positive for SHORT (received)
                      const premium = parseFloat(position.premium);
                      const entryPremium = position.role === 'buyer' 
                        ? -(premium * quantityTonnes) // LONG: paid premium (negative cashflow)
                        : (premium * quantityTonnes);  // SHORT: received premium (positive cashflow)

                      const { commodityName, expirationDateObj, timeToExpiryLabel, impliedPnlLabel, impliedPnlSign } = position;

                      const indexKey = position.commoditySlug?.toLowerCase() || position.underlying?.toLowerCase() || "";
                      const indexInfo = indexPriceMap[indexKey];
                      const currentPricePerTon = indexInfo?.latestPricePerTon;

                      return (
                        <TableRow
                          key={position.optionId}
                          data-testid={`row-position-${position.optionId}`}
                          className={
                            focusedCommodity && position.commoditySlug === focusedCommodity
                              ? "bg-muted/40"
                              : ""
                          }
                        >
                          <TableCell className="font-medium" data-testid={`text-commodity-${position.optionId}`}>
                            {commodityName}
                          </TableCell>
                          <TableCell>
                            <OptionTypeBadge type={position.type} />
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={position.role === 'buyer' ? 'default' : 'secondary'} 
                              className={position.role === 'buyer' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}
                              data-testid={`badge-side-${position.optionId}`}
                            >
                              {position.role === 'buyer' ? t('page.portfolio.positions.table.long') : t('page.portfolio.positions.table.short')}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono" data-testid={`text-size-${position.optionId}`}>
                            {quantityTonnes.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono whitespace-nowrap" data-testid={`text-strike-${position.optionId}`}>
                            ${strikePerTon.toFixed(2)}
                          </TableCell>
                          <TableCell className={`text-right font-mono whitespace-nowrap ${entryPremium < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`} data-testid={`text-entry-premium-${position.optionId}`}>
                            {entryPremium < 0 ? '' : '+'}{entryPremium.toFixed(2)} CROPT
                          </TableCell>
                          <TableCell className="text-right font-mono whitespace-nowrap" data-testid={`text-current-price-${position.optionId}`}>
                            {currentPricePerTon !== undefined ? `$${currentPricePerTon.toFixed(2)}` : t('page.portfolio.values.dash')}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <div className="flex flex-col items-end gap-1">
                              <span 
                                className={`font-mono font-semibold ${isProfitablePosition ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                                data-testid={`text-pnl-${position.optionId}`}
                              >
                                {isProfitablePosition ? '+' : ''}${positionPnL.toFixed(2)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap" data-testid={`text-expiry-${position.optionId}`}>
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
                              <span className="text-muted-foreground">{t('page.portfolio.values.notSpecified')}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={position.status} />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {position.status === "FILLED" && canExercise(position.optionId) && (
                                <ExerciseOptionDialog
                                  optionId={position.optionId}
                                  optionType={position.type}
                                  strike={position.strike}
                                  onExercise={async (optionId, spotPrice) => {
                                    await exerciseOptionMutation.mutateAsync({ optionId, spotPrice });
                                  }}
                                  isPending={exerciseOptionMutation.isPending}
                                />
                              )}
                              {(position.status === "EXERCISED" || position.status === "FILLED") && (
                                <WithdrawDialog
                                  optionId={position.optionId}
                                  onWithdraw={async (data) => {
                                    return await withdrawMutation.mutateAsync(data);
                                  }}
                                  isPending={withdrawMutation.isPending}
                                />
                              )}
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
        <div>
          <h2 className="text-2xl font-bold mb-4">{t('page.portfolio.sections.spotPositions')}</h2>
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
        </div>

        {/* Net Exposure / Hedged Positions */}
        <Card>
          <CardHeader>
            <CardTitle>{t('page.portfolio.sections.netExposure')}</CardTitle>
          </CardHeader>
          <CardContent>
            {netExposure.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">{t('page.portfolio.netExposure.empty')}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('page.portfolio.netExposure.table.commodity')}</TableHead>
                      <TableHead className="text-right">{t('page.portfolio.netExposure.table.spot')}</TableHead>
                      <TableHead className="text-right">{t('page.portfolio.netExposure.table.options')}</TableHead>
                      <TableHead className="text-right">{t('page.portfolio.netExposure.table.net')}</TableHead>
                      <TableHead className="text-right">{t('page.portfolio.netExposure.table.currentPrice')}</TableHead>
                      <TableHead className="text-right">{t('page.portfolio.netExposure.table.netValue')}</TableHead>
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
                              : t('page.portfolio.values.dash')}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {entry.totalValueUsd !== undefined
                              ? `$${entry.totalValueUsd.toFixed(2)}`
                              : t('page.portfolio.values.dash')}
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
          </TabsContent>


          <TabsContent value="options" className="space-y-6">
            {/* Collateral & Risk Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  {t('page.portfolio.sections.collateralRiskOptions')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">{t('page.portfolio.collateralRisk.availableMargin')}</p>
                    <p className="text-2xl font-bold">
                      ${estimatedAvailableMargin.toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('page.portfolio.collateralRisk.availableMarginDesc')}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">{t('page.portfolio.collateralRisk.usedMargin')}</p>
                    <p className="text-2xl font-bold">
                      ${usedMargin.toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('page.portfolio.collateralRisk.usedMarginDesc')}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">{t('page.portfolio.collateralRisk.riskLevel')}</p>
                    <p className={`text-2xl font-bold ${riskColor}`}>
                      {(riskRatio * 100).toFixed(1)}%
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {riskRatio >= 0.85 ? t('page.portfolio.collateralRisk.riskLevelHigh') : riskRatio >= 0.60 ? t('page.portfolio.collateralRisk.riskLevelModerate') : t('page.portfolio.collateralRisk.riskLevelLow')}
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('page.portfolio.collateralRisk.marginUtilization')}</span>
                    <span className={riskColor}>
                      ${usedMargin.toFixed(2)} / ${totalMargin.toFixed(2)}
                    </span>
                  </div>
                  <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className={`h-full transition-all ${riskBarColor}`}
                      style={{ width: `${riskRatio * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>0%</span>
                    <span>100%</span>
                  </div>
                </div>
                {marginCalls > 0 && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>{t('page.portfolio.collateralRisk.marginCallsActive')}</AlertTitle>
                    <AlertDescription>
                      {t('page.portfolio.collateralRisk.marginCallsActiveDesc', { count: marginCalls })}
                    </AlertDescription>
                  </Alert>
                )}
                {myMarginCalls.length > 0 && (
                  <div className="mt-3 rounded-md border bg-muted/30 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">{t('page.portfolio.marginCalls.yourMarginCalls')}</div>
                      <div className="text-xs text-muted-foreground">{t('page.portfolio.marginCalls.deadlinesAndStatus')}</div>
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('page.portfolio.marginCalls.table.option')}</TableHead>
                            <TableHead>{t('page.portfolio.marginCalls.table.required')}</TableHead>
                            <TableHead>{t('page.portfolio.marginCalls.table.status')}</TableHead>
                            <TableHead>{t('page.portfolio.marginCalls.table.deadline')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {myMarginCalls.map((mc: any) => {
                            const deadline = mc.deadline ? new Date(mc.deadline) : null;
                            const now = new Date();
                            const hoursLeft = deadline ? (deadline.getTime() - now.getTime()) / (1000 * 60 * 60) : null;
                            const isOverdue = deadline ? deadline.getTime() < now.getTime() : false;
                            const isLiquidated = String(mc.status || "").toUpperCase() === "LIQUIDATED";
                            const badgeClass =
                              isLiquidated && isOverdue
                                ? "bg-red-100 text-red-900"
                                : hoursLeft !== null && hoursLeft < 24
                                ? "bg-amber-100 text-amber-900"
                                : "bg-muted text-foreground";
                            return (
                              <TableRow key={mc.id}>
                                <TableCell className="font-mono text-xs">{mc.optionId}</TableCell>
                                <TableCell className="font-mono text-sm">
                                  ${parseFloat(mc.amountRequired || mc.amount || 0).toFixed(2)}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-xs">
                                    {mc.status || t('common.pending')}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-sm">
                                  {deadline ? (
                                    <div className="flex items-center gap-2">
                                      <Badge className={`text-[11px] ${badgeClass}`}>
                                        {isOverdue
                                          ? t('page.portfolio.marginCalls.overdue')
                                          : hoursLeft !== null
                                          ? t('page.portfolio.marginCalls.hoursLeft', { hours: Math.max(0, Math.floor(hoursLeft)) })
                                          : t('page.portfolio.values.dash')}
                                      </Badge>
                                      <span className="font-mono text-xs">
                                        {format(deadline, "MMM dd HH:mm")}
                                      </span>
                                    </div>
                                  ) : (
                                    t('page.portfolio.values.dash')
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Option Positions Table */}
            <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                  <CardTitle>{t('page.portfolio.sections.optionPositions')}</CardTitle>
                  <Tabs value={optionFilterTab} onValueChange={(v) => setOptionFilterTab(v as OptionFilterTab)}>
                    <TabsList>
                      <TabsTrigger value="all">{t('page.portfolio.filters.all')}</TabsTrigger>
                      <TabsTrigger value="active">{t('page.portfolio.filters.active')}</TabsTrigger>
                      <TabsTrigger value="settled">{t('page.portfolio.filters.settled')}</TabsTrigger>
                      <TabsTrigger value="expired">{t('page.portfolio.filters.expired')}</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </CardHeader>
              <CardContent>
                {filteredPositions.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('page.portfolio.positions.table.commodity')}</TableHead>
                          <TableHead>{t('page.portfolio.positions.table.type')}</TableHead>
                          <TableHead>{t('page.portfolio.positions.table.side')}</TableHead>
                          <TableHead className="text-right">{t('page.portfolio.positions.table.qty')}</TableHead>
                          <TableHead className="text-right">{t('page.portfolio.positions.table.strike')}</TableHead>
                          <TableHead className="text-right">{t('page.portfolio.positions.table.premiumPerTon')}</TableHead>
                          <TableHead className="text-right">{t('page.portfolio.positions.table.impliedPnl')}</TableHead>
                          <TableHead className="text-right">{t('page.portfolio.positions.table.pnl')}</TableHead>
                          <TableHead>{t('page.portfolio.positions.table.expiry')}</TableHead>
                          <TableHead>{t('page.portfolio.positions.table.status')}</TableHead>
                          <TableHead className="text-right">{t('page.portfolio.positions.table.actions')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPositions.map((position) => {
                          const positionPnL = parseFloat(position.pnl);
                          const isProfitablePosition = positionPnL >= 0;

                          // Quantity is already in tons (per user's note)
                          const quantityTonnes = parseFloat(position.qty);

                          // Use strikePerTon from API (already in $/ton, no conversion needed)
                          const strikePerTon = position.strikePerTon
                            ? parseFloat(position.strikePerTon)
                            : 0;

                          return (
                            <TableRow key={position.optionId}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{position.underlying}</span>
                                  {position.impliedPnlNow !== null && (
                                    <Badge
                                      variant={position.impliedPnlNow >= 0 ? "default" : "destructive"}
                                      className="text-xs"
                                    >
                                      {position.impliedPnlNow >= 0 ? "+" : ""}{position.impliedPnlNow.toFixed(2)}%
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <OptionTypeBadge type={position.type as "CALL" | "PUT"} />
                              </TableCell>
                              <TableCell>
                                {position.role === 'buyer' ? (
                                  <Badge className="bg-green-600 text-white">{t('page.portfolio.positions.table.long')}</Badge>
                                ) : position.role === 'seller' ? (
                                  <Badge className="bg-red-600 text-white">{t('page.portfolio.positions.table.short')}</Badge>
                                ) : (
                                  <Badge variant="outline">{t('page.portfolio.values.dash')}</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {quantityTonnes.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                ${strikePerTon.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-muted-foreground">
                                {position.premium ? `$${parseFloat(position.premium).toFixed(2)}` : t('page.portfolio.values.dash')}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {position.impliedPnlNow !== null ? `${position.impliedPnlNow >= 0 ? '+' : ''}${position.impliedPnlNow.toFixed(2)}%` : t('page.portfolio.values.dash')}
                              </TableCell>
                              <TableCell className={`text-right font-mono ${isProfitablePosition ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {isProfitablePosition ? '+' : ''}${positionPnL.toFixed(2)}
                              </TableCell>
                              <TableCell>
                                {position.expirationDate ? (
                                  <div className="text-sm">
                                    <div className="font-medium">
                                      {formatTimeToExpiry(position.expirationDate, t)}
                                    </div>
                                    <div className="text-muted-foreground text-xs">
                                      {format(new Date(position.expirationDate), "MMM dd, yyyy")}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">{t('page.portfolio.values.dash')}</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <StatusBadge status={position.status as any} />
                              </TableCell>
                              <TableCell className="text-right">
                                <span className="text-muted-foreground">{t('page.portfolio.values.dash')}</span>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : userTier === "guest" ? (
                  <>
                    <p className="text-lg font-medium mb-2">{t('page.portfolio.empty.loginRequired')}</p>
                    <Link href="/login">
                      <Button size="sm" data-testid="button-empty-sign-in">
                        {t('button.login')}
                      </Button>
                    </Link>
                  </>
                ) : userTier === "user_no_wallet" ? (
                  <>
                    <p className="text-lg font-medium mb-2">{t('page.portfolio.empty.walletRequired')}</p>
                    <Button size="sm" onClick={handleOpenWalletModal} data-testid="button-empty-connect-wallet">
                      {t('button.connectWallet')}
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-medium mb-2">{t('page.portfolio.positions.empty')}</p>
                    <p className="text-sm">{t('page.portfolio.positions.emptySubtitle')}</p>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="forwards" className="space-y-6">
            {/* Forward Positions Table */}
            <Card>
              <CardHeader>
                <CardTitle>{t('page.portfolio.forwards.title')}</CardTitle>
                <CardDescription>{t('page.portfolio.forwards.subtitle')}</CardDescription>
              </CardHeader>
              <CardContent>
                {forwardPositions.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('page.portfolio.forwards.table.commodity')}</TableHead>
                          <TableHead>{t('page.portfolio.forwards.table.window')}</TableHead>
                          <TableHead>{t('page.portfolio.forwards.table.side')}</TableHead>
                          <TableHead className="text-right">{t('page.portfolio.forwards.table.contractPrice')}</TableHead>
                          <TableHead className="text-right">{t('page.portfolio.forwards.table.qty')}</TableHead>
                          <TableHead className="text-right">{t('page.portfolio.forwards.table.notional')}</TableHead>
                          <TableHead className="text-right">{t('page.portfolio.forwards.table.initialMargin')}</TableHead>
                          <TableHead className="text-right">{t('page.portfolio.forwards.table.realizedPnl')}</TableHead>
                          <TableHead className="text-right">{t('page.portfolio.forwards.table.totalPnl')}</TableHead>
                          <TableHead>{t('page.portfolio.forwards.table.status')}</TableHead>
                          <TableHead>{t('page.portfolio.forwards.table.settlementDate')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {forwardPositions.map((position) => {
                          const realizedPnL = parseFloat(position.realizedPnL);
                          const totalPnL = parseFloat(position.totalPnL);

                          return (
                            <TableRow key={position.contractId}>
                              <TableCell className="font-medium">{position.commodity}</TableCell>
                              <TableCell>{position.window}</TableCell>
                              <TableCell>
                                <Badge
                                  variant={position.role === 'long' ? 'default' : 'secondary'}
                                  className={position.role === 'long' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}
                                >
                                  {position.role === 'long' ? t('page.portfolio.forwards.roles.long') : t('page.portfolio.forwards.roles.short')}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                ${parseFloat(position.contractPrice).toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {parseFloat(position.qtyTon).toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                ${parseFloat(position.notional).toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {parseFloat(position.initialMargin).toFixed(2)} CROPT
                              </TableCell>
                              <TableCell className={`text-right font-mono ${realizedPnL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {realizedPnL >= 0 ? '+' : ''}${realizedPnL.toFixed(2)}
                              </TableCell>
                              <TableCell className={`text-right font-mono ${totalPnL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
                              </TableCell>
                              <TableCell>
                                <StatusBadge status={position.status as any} />
                              </TableCell>
                              <TableCell>
                                {position.settlementDate ? (
                                  <div className="text-sm">
                                    <div className="font-medium">
                                      {formatTimeToExpiry(position.settlementDate, t)}
                                    </div>
                                    <div className="text-muted-foreground text-xs">
                                      {format(new Date(position.settlementDate), "MMM dd, yyyy")}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">{t('page.portfolio.values.dash')}</span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <>
                    <p className="text-lg font-medium mb-2">{t('page.portfolio.positions.emptyForwardsTitle')}</p>
                    <p className="text-sm">{t('page.portfolio.positions.emptyForwards')}</p>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Linked options modal for focused commodity */}
        {focusedCommodity && (
          <Dialog open={true} onOpenChange={(open) => !open && setFocusedCommodity(null)}>
            <DialogContent className="sm:max-w-[700px]">
              <DialogHeader>
                <DialogTitle>
                  {t('page.portfolio.linkedOptions.title', { commodity: indexPriceMap[focusedCommodity]?.name || focusedCommodity })}
                </DialogTitle>
              </DialogHeader>
              <div className="mt-2">
                {optionsByCommodityList[focusedCommodity] && optionsByCommodityList[focusedCommodity].length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('page.portfolio.positions.table.type')}</TableHead>
                          <TableHead>{t('page.portfolio.positions.table.side')}</TableHead>
                          <TableHead className="text-right">{t('page.portfolio.positions.table.strike')}</TableHead>
                          <TableHead className="text-right">{t('page.portfolio.positions.table.qty')}</TableHead>
                          <TableHead>{t('page.portfolio.positions.table.status')}</TableHead>
                          <TableHead className="text-right">{t('page.portfolio.linkedOptions.table.premium')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {optionsByCommodityList[focusedCommodity].map((opt: any) => {
                          if (!user) return null;
                          const isBuyer = opt.buyerId === user.id;
                          const isSeller = opt.issuerId === user.id;
                          const side = isBuyer ? 'LONG' : isSeller ? 'SHORT' : null;
                          const premium = parseFloat(opt.qty) * parseFloat(opt.premium);
                          const entryPremium = isBuyer ? -premium : isSeller ? premium : 0;
                          const strikePerTon = parseFloat(opt.strike); // Already in $/ton, no conversion needed

                          return (
                            <TableRow key={opt.id}>
                              <TableCell>
                                <OptionTypeBadge type={opt.type as "CALL" | "PUT"} />
                              </TableCell>
                              <TableCell>
                                {side && (
                                  <Badge
                                    variant={side === 'LONG' ? 'default' : 'secondary'}
                                    className={side === 'LONG' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}
                                  >
                                    {side === 'LONG' ? t('page.portfolio.positions.table.long') : t('page.portfolio.positions.table.short')}
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                ${strikePerTon.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {parseFloat(opt.qty).toFixed(2)}
                              </TableCell>
                              <TableCell>
                                <StatusBadge status={opt.status as any} />
                              </TableCell>
                              <TableCell className={`text-right font-mono ${entryPremium < 0 ? 'text-red-600 dark:text-red-400' : entryPremium > 0 ? 'text-green-600 dark:text-green-400' : ''}`}>
                                {entryPremium !== 0 ? (entryPremium < 0 ? '' : '+') : ''}{entryPremium.toFixed(2)} CROPT
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t('page.portfolio.linkedOptions.empty')}
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
                  {t('page.portfolio.linkedOptions.openMarket')}
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
    </div>
  );
}
