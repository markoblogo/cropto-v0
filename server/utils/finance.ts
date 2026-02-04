/**
 * Core financial calculation utilities for Cropto options trading
 */

/**
 * Calculate collateral percentage based on expiry duration
 * @param expiryMonths - Number of months until expiry
 * @returns Collateral percentage as decimal (e.g., 0.05 for 5%)
 */
export function collateralPct(expiryMonths: number): number {
  if (expiryMonths <= 0) {
    throw new Error('Expiry months must be positive');
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
 * Compute notional value of an option contract
 * @param strikePerUnit - Strike price per unit
 * @param quantity - Quantity of units
 * @returns Notional value (strike * quantity)
 */
export function computeNotional(strikePerUnit: number, quantity: number): number {
  if (strikePerUnit < 0 || quantity < 0) {
    throw new Error('Strike price and quantity must be non-negative');
  }
  return strikePerUnit * quantity;
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
    throw new Error('All parameters must be non-negative');
  }

  if (optionType === 'CALL') {
    // CALL option: profitable when index > strike
    return Math.max(0, indexPrice - strike) * quantity;
  } else if (optionType === 'PUT') {
    // PUT option: profitable when index < strike
    return Math.max(0, strike - indexPrice) * quantity;
  } else {
    throw new Error('Option type must be CALL or PUT');
  }
}

/**
 * Determine if a margin call should be triggered
 * @param intrinsicValue - Current intrinsic value of the option
 * @param collateralAmount - Amount of collateral posted
 * @returns True if intrinsic value >= 80% of collateral
 */
export function shouldTriggerMargin(
  intrinsicValue: number,
  collateralAmount: number
): boolean {
  if (collateralAmount <= 0) {
    return false; // No collateral, no margin trigger
  }
  
  const marginThreshold = 0.8 * collateralAmount;
  return Math.abs(intrinsicValue) >= marginThreshold;
}

/**
 * Calculate margin call amount required
 * @param intrinsicValue - Current intrinsic value
 * @param collateralAmount - Current collateral amount
 * @returns Amount needed to meet margin requirements
 */
export function calculateMarginCallAmount(
  intrinsicValue: number,
  collateralAmount: number
): number {
  return Math.max(0, Math.abs(intrinsicValue) - collateralAmount);
}

/**
 * Calculate profit/loss for option exercise
 * @param optionType - 'CALL' or 'PUT'
 * @param spotPrice - Price at exercise
 * @param strikePrice - Strike price
 * @param quantity - Quantity exercised
 * @param premiumPaid - Premium paid per unit
 * @returns Object with payout and profitLoss
 */
export function calculateExercisePL(
  optionType: 'CALL' | 'PUT',
  spotPrice: number,
  strikePrice: number,
  quantity: number,
  premiumPaid: number
): { payout: number; profitLoss: number } {
  const intrinsicValue = intrinsic(optionType, spotPrice, strikePrice, quantity);
  const totalPremium = premiumPaid * quantity;
  
  return {
    payout: intrinsicValue,
    profitLoss: intrinsicValue - totalPremium,
  };
}

/**
 * Compute intrinsic value in USD for an option
 * All option values are stored in $/ton (strike & premium) and tons (qty)
 * @param optionType - 'CALL' or 'PUT'
 * @param strikePerTon - Strike price per ton (as stored in DB)
 * @param currentPricePerTon - Current index price per ton
 * @param quantityTons - Quantity in tons (as stored in DB)
 * @returns Intrinsic value in USD
 */
export function computeIntrinsicValueUSD(
  optionType: 'CALL' | 'PUT',
  strikePerTon: number,
  currentPricePerTon: number,
  quantityTons: number
): number {
  return intrinsic(optionType, currentPricePerTon, strikePerTon, quantityTons);
}

/**
 * Compute total premium cashflow in USD
 * Premium is stored per ton, so multiply by quantity in tons
 * @param premiumPerTon - Premium per ton (as stored in DB)
 * @param quantityTons - Quantity in tons (as stored in DB)
 * @returns Total premium in USD
 */
export function computePremiumUSD(
  premiumPerTon: number,
  quantityTons: number
): number {
  return premiumPerTon * quantityTons;
}

/**
 * Compute unrealized P&L for an option position
 * @param optionType - 'CALL' or 'PUT'
 * @param isBuyer - True if user is buyer (LONG), false if seller (SHORT)
 * @param strikePerTon - Strike price per ton (as stored in DB)
 * @param currentPricePerTon - Current index price per ton
 * @param quantityTons - Quantity in tons (as stored in DB)
 * @param premiumPerTon - Premium per ton (as stored in DB)
 * @returns Unrealized P&L in USD (positive = profit, negative = loss)
 */
export function computeUnrealizedPnLUSD(
  optionType: 'CALL' | 'PUT',
  isBuyer: boolean,
  strikePerTon: number,
  currentPricePerTon: number,
  quantityTons: number,
  premiumPerTon: number
): number {
  const intrinsicValue = computeIntrinsicValueUSD(
    optionType,
    strikePerTon,
    currentPricePerTon,
    quantityTons
  );
  const totalPremium = computePremiumUSD(premiumPerTon, quantityTons);
  
  if (isBuyer) {
    // LONG: profit = intrinsic value - premium paid
    return intrinsicValue - totalPremium;
  } else {
    // SHORT: profit = premium received - intrinsic value
    return totalPremium - intrinsicValue;
  }
}

/**
 * Get partner fee statistics (demo implementation)
 * For now, uses a simple heuristic: map partnerId to platform fees
 * In production, this would use a proper partnerFeeKey or routing table
 */
export async function getPartnerFeeStats(
  partnerId: string,
  platformFees: Array<{ amount: string; currency: string; createdAt: Date }>
): Promise<{
  totalFeesUsd: number;
  totalVolumeUsd: number;
  contractCount: number;
}> {
  // Simple demo heuristic: use first 3 chars of partnerId as a hash
  // In production, this would be a proper mapping
  const partnerHash = partnerId.substring(0, 3);
  
  // Filter fees that might be related to this partner (demo logic)
  // For now, we'll use a simple percentage of total fees
  const totalFees = platformFees.reduce((sum, fee) => {
    const amount = parseFloat(fee.amount);
    // Convert CROPT to USD (demo: 1 CROPT = 1 USD)
    return sum + amount;
  }, 0);

  // Assign a portion of fees to this partner (demo: based on partner hash)
  const partnerShare = (partnerHash.charCodeAt(0) % 10) / 100; // 0-9% share
  const totalFeesUsd = totalFees * partnerShare;
  
  // Estimate volume (demo: fees are ~0.1% of volume)
  const totalVolumeUsd = totalFeesUsd * 1000;

  return {
    totalFeesUsd,
    totalVolumeUsd,
    contractCount: 0, // Will be set by caller
  };
}
