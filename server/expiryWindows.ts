type HalfCode = "1H" | "2H";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export interface ExpiryWindowInput {
  half: HalfCode;
  month: number; // 1-12
  year: number; // four-digit year
}

export interface ExpiryWindowResult {
  label: string; // e.g. "1H Feb 2026"
  windowStart: Date;
  windowEnd: Date;
  settlementDate: Date;
}

function getLastDayOfMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export function computeExpiryWindow(input: ExpiryWindowInput): ExpiryWindowResult {
  const { half, month, year } = input;
  if (month < 1 || month > 12) {
    throw new Error(`Invalid month ${month}. Expected 1-12.`);
  }
  const monthIndex = month - 1;
  const lastDay = getLastDayOfMonth(year, month);

  const isFirstHalf = half === "1H";
  const startDay = isFirstHalf ? 1 : 16;
  const endDay = isFirstHalf ? 15 : lastDay;

  const windowStart = new Date(Date.UTC(year, monthIndex, startDay, 0, 0, 0));
  const windowEnd = new Date(Date.UTC(year, monthIndex, endDay, 23, 59, 59));

  const label = `${half} ${MONTH_LABELS[monthIndex]} ${year}`;

  return {
    label,
    windowStart,
    windowEnd,
    settlementDate: windowEnd,
  };
}

