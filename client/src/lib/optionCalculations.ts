/**
 * Client-side option calculation utilities
 * These mirror server-side calculations from server/utils/finance.ts
 */
import type { Option } from "@shared/schema";

export type AnalyticsMetric = "volume" | "openInterest";

/**
 * Strike-level aggregated point for analytics charts
 */
export type StrikeVolumePoint = {
  strike: number;      // $/t
  callVolume: number;  // total CALL quantity in tonnes
  putVolume: number;   // total PUT quantity in tonnes
};

export interface GroupByStrikeForAnalyticsParams {
  commodity?: string;
  /**
   * Expiry date filter in YYYY-MM-DD (same as OptionChain filters)
   * When undefined, aggregates across all expiries.
   */
  expiry?: string;
  /**
   * Analytics metric.
   * NOTE: for now, we use qty as a proxy for both volume and open interest.
   * When real open interest data is added to the option schema,
   * this helper should be updated to use that field instead.
   */
  metric: AnalyticsMetric;
}

/**
 * Group options by strike for analytics (Volume / Open Interest).
 *
 * - Aggregates across all commodities when `commodity` is undefined (Commodity = All).
 * - Aggregates across all expiries when `expiry` is undefined (Expiry = All).
 * - Volumes are computed in tonnes, using option.qty.
 */
export function groupByStrikeForAnalytics(
  options: Option[],
  { commodity, expiry, metric }: GroupByStrikeForAnalyticsParams
): StrikeVolumePoint[] {
  // Filter options based on commodity and expiry
  const filtered = options.filter((option) => {
    // Commodity filter (when provided)
    if (commodity && commodity !== "ALL") {
      if (option.commodity !== commodity) {
        return false;
      }
    }

    // Expiry filter (when provided)
    if (expiry) {
      if (!option.expirationDate) {
        return false;
      }

      const optionExpiry =
        typeof option.expirationDate === "string"
          ? new Date(option.expirationDate)
          : option.expirationDate;

      if (isNaN(optionExpiry.getTime())) {
        return false;
      }

      const optionExpiryStr = optionExpiry.toISOString().split("T")[0];
      if (optionExpiryStr !== expiry) {
        return false;
      }
    }

    // Metric-specific filter
    if (metric === "openInterest") {
      // For open interest, only count OPEN options
      // TODO: when real open interest field is available, switch to that field instead of qty.
      return option.status === "OPEN";
    } else {
      // For volume, exclude CANCELLED contracts
      return option.status !== "CANCELLED";
    }
  });

  // Aggregate by strike price
  const strikeMap = new Map<number, { callVolume: number; putVolume: number }>();

  filtered.forEach((option) => {
    const strike = parseFloat(option.strike);
    if (isNaN(strike)) return;

    // For now, we use quantity as the base metric for both volume and open interest
    const qty = parseFloat(option.qty);
    if (isNaN(qty) || qty <= 0) return;

    if (!strikeMap.has(strike)) {
      strikeMap.set(strike, { callVolume: 0, putVolume: 0 });
    }

    const entry = strikeMap.get(strike)!;
    if (option.type === "CALL") {
      entry.callVolume += qty;
    } else if (option.type === "PUT") {
      entry.putVolume += qty;
    }
  });

  // Convert to array and sort by strike
  return Array.from(strikeMap.entries())
    .map(([strike, volumes]) => ({
      strike,
      callVolume: volumes.callVolume,
      putVolume: volumes.putVolume,
    }))
    .sort((a, b) => a.strike - b.strike);
}

/**
 * Calculate collateral percentage based on expiry duration
 * @param expiryMonths - Number of months until expiry
 * @returns Collateral percentage as decimal (e.g., 0.05 for 5%)
 */
export function collateralPct(expiryMonths: number): number {
  if (expiryMonths <= 0) {
    return 0.05; // Default to 5% if invalid
  }
  
  if (expiryMonths <= 3) {
    return 0.05; // 5% for 1-3 months
  } else if (expiryMonths <= 6) {
    return 0.10; // 10% for 4-6 months
  } else {
    return 0.20; // 20% for 7+ months
  }
}

/**
 * Calculate months between two dates
 */
export function monthsBetween(startDate: Date, endDate: Date): number {
  const years = endDate.getFullYear() - startDate.getFullYear();
  const months = endDate.getMonth() - startDate.getMonth();
  return years * 12 + months;
}

/**
 * Compute notional value of an option contract
 * @param strikePerUnit - Strike price per unit
 * @param quantity - Quantity of units
 * @returns Notional value (strike * quantity)
 */
export function computeNotional(strikePerUnit: number, quantity: number): number {
  if (strikePerUnit < 0 || quantity < 0) {
    return 0;
  }
  return strikePerUnit * quantity;
}

/**
 * Calculate collateral amount
 * @param notional - Notional value
 * @param expiryMonths - Number of months until expiry
 * @returns Collateral amount
 */
export function computeCollateral(notional: number, expiryMonths: number): number {
  const pct = collateralPct(expiryMonths);
  return notional * pct;
}

/**
 * Calculate intrinsic value of an option
 * @param optionType - 'CALL' or 'PUT'
 * @param indexPrice - Current market/index price
 * @param strike - Strike price
 * @param quantity - Quantity of units
 * @returns Intrinsic value (max(0, favorable price difference) * quantity)
 */
export function intrinsic(
  optionType: 'CALL' | 'PUT',
  indexPrice: number,
  strike: number,
  quantity: number
): number {
  if (indexPrice < 0 || strike < 0 || quantity < 0) {
    return 0;
  }

  if (optionType === 'CALL') {
    // CALL option: profitable when index > strike
    return Math.max(0, indexPrice - strike) * quantity;
  } else if (optionType === 'PUT') {
    // PUT option: profitable when index < strike
    return Math.max(0, strike - indexPrice) * quantity;
  } else {
    return 0;
  }
}

/**
 * Calculate PnL preview for an option (as seller)
 * @param optionType - 'CALL' or 'PUT'
 * @param strike - Strike price
 * @param quantity - Quantity
 * @param premium - Premium per unit
 * @param marketPrice - Hypothetical market price at expiry
 * @returns PnL breakdown
 */
export function calculatePnLPreview(
  optionType: 'CALL' | 'PUT',
  strike: number,
  quantity: number,
  premium: number,
  marketPrice: number
): {
  intrinsicValue: number;
  totalPremium: number;
  netPnL: number;
  payoff: number;
} {
  const intrinsicValue = intrinsic(optionType, marketPrice, strike, quantity);
  const totalPremium = premium * quantity;
  
  // For seller: 
  // - Receives premium upfront
  // - Pays intrinsic value if option is exercised (intrinsic > 0)
  // - Net PnL = premium received - intrinsic paid
  const netPnL = totalPremium - intrinsicValue;

  return {
    intrinsicValue,
    totalPremium,
    netPnL,
    payoff: intrinsicValue, // What seller would pay if exercised
  };
}

