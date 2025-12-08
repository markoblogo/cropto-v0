import { Option } from "@shared/schema";

export interface MarginCheckResult {
  updated: Option & {
    floatingLoss?: number;
    isInMarginCall?: boolean;
    marginCallTimestamp?: Date | null;
    marginCallDeadline?: Date | null;
  };
  marginCallTriggered: boolean;
}

function toNumber(val: any): number {
  const n = typeof val === "string" ? parseFloat(val) : typeof val === "number" ? val : NaN;
  return Number.isFinite(n) ? n : 0;
}


export function checkMarginCall(
  position: Option & { currentPrice?: number },
): MarginCheckResult {
  const strike = toNumber(position.strike);
  const qty = toNumber(position.qty);
  const mark = toNumber((position as any).currentPrice);
  const initialMargin = toNumber(position.initialMargin);

  let floatingLoss = 0;
  if (position.type === "CALL") {
    floatingLoss = Math.max(0, mark - strike) * qty;
  } else {
    floatingLoss = Math.max(0, strike - mark) * qty;
  }

  const alreadyInCall = Boolean(position.isInMarginCall);
  const threshold = 0.8 * initialMargin;
  const now = new Date();

  let marginCallTriggered = false;
  let isInMarginCall = alreadyInCall;
  let marginCallTimestamp = position.marginCallTimestamp || null;
  let marginCallDeadline = position.marginCallDeadline || null;

  if (!alreadyInCall && floatingLoss >= threshold) {
    marginCallTriggered = true;
    isInMarginCall = true;
    marginCallTimestamp = now;
    marginCallDeadline = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  }

  return {
    marginCallTriggered,
    updated: {
      ...position,
      floatingLoss,
      isInMarginCall,
      marginCallTimestamp,
      marginCallDeadline,
    },
  };
}
interface MarginInput {
  strike: number;
  quantityTon: number;
  settlementDate: Date;
  currentDate?: Date;
}

export function calculateInitialMargin({
  strike,
  quantityTon,
  settlementDate,
  currentDate = new Date(),
}: MarginInput): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const diffDays = Math.max(0, (settlementDate.getTime() - currentDate.getTime()) / msPerDay);
  const months = Math.max(1, Math.ceil(diffDays / 30));
  const notional = strike * quantityTon;
  return 0.02 * months * notional;
}

