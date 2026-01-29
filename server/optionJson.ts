import { Option } from "@shared/schema";

export type OptionContractJsonV1 = {
  // New schema fields
  option_type: "CALL" | "PUT";
  trade_side: "BUY" | "SELL";
  window: string | null;
  window_start: string | null;
  window_end: string | null;
  settlement_date: string | null;
  quantity_ton: number;
  strike_price: number;
  premium_per_ton: number;
  long_side: string | null;
  short_side: string | null;
  settlement_formula: string;
  index_name?: string;
  basis?: string;
  settlement_type?: "index_cash_settled" | string;

  // Legacy fields (kept for backward compatibility)
  optionType: "call" | "put";
  tradeType: "Buy" | "Sell";
  contractType: string;
  strike: number;
  premium: number;
  windowLegacy?: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  settlementDate: string | null;
  quantityTon: number;
  longSide: string | null;
  shortSide: string | null;
  variationMargin: number;
  usePremiumAsMargin?: boolean;
  initialMargin?: number;
  escrowContract: string;
  settlementFormula: string;
  settlementPrice?: number;
  finalPnl?: number;
  matchingFeePerSide?: number;
  settlementFeePerSide?: number;
};

function toNumber(val: string | number | null | undefined): number {
  const n = typeof val === "string" ? parseFloat(val) : typeof val === "number" ? val : NaN;
  return Number.isFinite(n) ? n : 0;
}

function toIso(val?: Date | string | null): string | null {
  if (!val) return null;
  const d = val instanceof Date ? val : new Date(val);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function serializeOptionToJson(option: Option): OptionContractJsonV1 {
  const optionType = option.type.toLowerCase() === "put" ? "put" : "call";
  const tradeType: "Buy" | "Sell" = optionType === "call" ? "Buy" : "Sell";
  const commoditySlug = option.commodity?.toLowerCase() ?? "unknown";
  const contractType = `CPT_Odesa_${commoditySlug}_${optionType}`;
  const indexName =
    (option as any).commodityName ||
    option.title ||
    option.commodity ||
    "Spike Spot Grain Index";
  const basis = "CPT Odesa";

  const settlementFormula =
    optionType === "call"
      ? "max(0, SSI - Strike) × qty"
      : "max(0, Strike – SSI) × qty";

  const windowLabel = option.expiryWindow ?? null;
  const windowStartIso = toIso(option.windowStart as unknown as string);
  const windowEndIso = toIso(option.windowEnd as unknown as string);
  const settlementDateIso = toIso(option.settlementDate as unknown as string);
  const premiumPerTon = toNumber(option.premium as unknown as string);
  const strikePrice = toNumber(option.strike as unknown as string);
  const quantityTon = toNumber(option.qty as unknown as string);

  return {
    // New schema
    option_type: option.type === "PUT" ? "PUT" : "CALL",
    trade_side: tradeType.toUpperCase() as "BUY" | "SELL",
    window: windowLabel,
    window_start: windowStartIso,
    window_end: windowEndIso,
    settlement_date: settlementDateIso,
    quantity_ton: quantityTon,
    strike_price: strikePrice,
    premium_per_ton: premiumPerTon,
    long_side: option.longSide ?? option.buyerId ?? option.buyer ?? null,
    short_side: option.shortSide ?? option.issuerId ?? option.seller ?? null,
    settlement_formula: settlementFormula,
    index_name: indexName,
    basis,
    settlement_type: "index_cash_settled",

    // Legacy (unchanged)
    optionType,
    tradeType,
    contractType,
    strike: strikePrice,
    premium: premiumPerTon,
    windowLegacy: windowLabel,
    windowStart: windowStartIso,
    windowEnd: windowEndIso,
    settlementDate: settlementDateIso,
    quantityTon: quantityTon,
    longSide: option.longSide ?? option.buyerId ?? option.buyer ?? null,
    shortSide: option.shortSide ?? option.issuerId ?? option.seller ?? null,
    variationMargin: 0,
    usePremiumAsMargin: Boolean((option as any).usePremiumAsMargin),
    initialMargin: option.initialMargin ? toNumber(option.initialMargin as unknown as string) : undefined,
    escrowContract: "",
    settlementFormula,
    settlementPrice: option.settlementDate ? toNumber((option as any).settlementPrice || (option as any).ssiAvg) : undefined,
    finalPnl: (option as any).finalPnl ? toNumber((option as any).finalPnl) : undefined,
    matchingFeePerSide: (option as any).matchingFeePerSide
      ? toNumber((option as any).matchingFeePerSide)
      : undefined,
    settlementFeePerSide: (option as any).settlementFeePerSide
      ? toNumber((option as any).settlementFeePerSide)
      : undefined,
  };
}

