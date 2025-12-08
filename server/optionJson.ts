import { Option } from "@shared/schema";

export type OptionContractJsonV1 = {
  optionType: "call" | "put";
  tradeType: "Buy" | "Sell";
  contractType: string;
  strike: number;
  premium: number;
  window: string | null;
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

  const settlementFormula =
    optionType === "call"
      ? "max(0, SSI - Strike) × qty"
      : "max(0, Strike – SSI) × qty";

  return {
    optionType,
    tradeType,
    contractType,
    strike: toNumber(option.strike as unknown as string),
    premium: toNumber(option.premium as unknown as string),
    window: option.expiryWindow ?? null,
    windowStart: toIso(option.windowStart as unknown as string),
    windowEnd: toIso(option.windowEnd as unknown as string),
    settlementDate: toIso(option.settlementDate as unknown as string),
    quantityTon: toNumber(option.qty as unknown as string),
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

