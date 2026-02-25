export type GrainPriceDisplayMode = "USD_TON" | "NATIVE";
export type TemperatureDisplayMode = "C" | "F";

export type NormalizationStatus = "OK" | "PARTIAL" | "FX_MISSING" | "UNAVAILABLE";

export type NativePriceUnit =
  | "CENTS_PER_BUSHEL"
  | "USD_PER_BUSHEL"
  | "USD_PER_TON"
  | "EUR_PER_TON"
  | "UNKNOWN";

export type GrainCropForBushelFactor = "corn" | "wheat" | "soybeans";

export interface FxSnapshot {
  eurUsd?: number | null;
  fetchedAt?: string;
  sourceName?: string;
}

export interface NativePriceQuote {
  valueCurrent?: number;
  valueChange?: number;
  valueChangePct?: number;
  currency?: string;
  unit?: string;
  nativeUnitType: NativePriceUnit;
  crop?: GrainCropForBushelFactor;
}

export interface NormalizedPrice {
  valueCurrent?: number;
  valueChange?: number;
  valueChangePct?: number;
  currency: "USD";
  unit: "t";
}

export interface NormalizationMeta {
  method: "identity_usd_t" | "cbot_cents_bu_to_usd_t" | "cbot_usd_bu_to_usd_t" | "eur_t_to_usd_t" | "unavailable";
  fxRateUsed?: number;
  bushelsPerTon?: number;
  cropFactor?: GrainCropForBushelFactor;
  notes?: string[];
}

export interface NormalizationResult {
  status: NormalizationStatus;
  native: {
    valueCurrent?: number;
    valueChange?: number;
    valueChangePct?: number;
    currency?: string;
    unit?: string;
    nativeUnitType: NativePriceUnit;
  };
  normalized?: NormalizedPrice;
  meta: NormalizationMeta;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function round(value: number, digits = 2): number {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

export const BUSHELS_PER_METRIC_TON: Record<GrainCropForBushelFactor, number> = {
  corn: 39.368,
  wheat: 36.744,
  soybeans: 36.744,
};

export function cbotToUsdPerTon(args: {
  centsPerBushel?: number;
  usdPerBushel?: number;
  crop?: GrainCropForBushelFactor;
}): { value?: number; bushelsPerTon?: number; status: "OK" | "UNAVAILABLE" } {
  const { centsPerBushel, usdPerBushel, crop } = args;
  if (!crop) return { status: "UNAVAILABLE" };

  const bushelsPerTon = BUSHELS_PER_METRIC_TON[crop];
  if (!isFiniteNumber(bushelsPerTon) || bushelsPerTon <= 0) return { status: "UNAVAILABLE" };

  let usdBu: number | undefined;
  if (isFiniteNumber(centsPerBushel)) usdBu = centsPerBushel / 100;
  if (isFiniteNumber(usdPerBushel)) usdBu = usdPerBushel;
  if (!isFiniteNumber(usdBu)) return { status: "UNAVAILABLE" };

  const usdPerTon = usdBu * bushelsPerTon;
  return { value: round(usdPerTon, 2), bushelsPerTon, status: "OK" };
}

export function eurTonToUsdTon(args: {
  eurPerTon?: number;
  eurUsd?: number | null;
}): { value?: number; fxRateUsed?: number; status: "OK" | "FX_MISSING" | "UNAVAILABLE" } {
  const { eurPerTon, eurUsd } = args;
  if (!isFiniteNumber(eurPerTon)) return { status: "UNAVAILABLE" };
  if (!isFiniteNumber(eurUsd) || eurUsd <= 0) return { status: "FX_MISSING" };
  return { value: round(eurPerTon * eurUsd, 2), fxRateUsed: eurUsd, status: "OK" };
}

export function normalizeGrainPriceToUsdTon(args: {
  quote: NativePriceQuote;
  fx?: FxSnapshot;
}): NormalizationResult {
  const { quote, fx } = args;

  const base: NormalizationResult = {
    status: "UNAVAILABLE",
    native: {
      valueCurrent: quote.valueCurrent,
      valueChange: quote.valueChange,
      valueChangePct: quote.valueChangePct,
      currency: quote.currency,
      unit: quote.unit,
      nativeUnitType: quote.nativeUnitType,
    },
    meta: {
      method: "unavailable",
      notes: [],
    },
  };

  switch (quote.nativeUnitType) {
    case "USD_PER_TON": {
      return {
        ...base,
        status: isFiniteNumber(quote.valueCurrent) ? "OK" : "UNAVAILABLE",
        normalized: {
          valueCurrent: isFiniteNumber(quote.valueCurrent) ? round(quote.valueCurrent, 2) : undefined,
          valueChange: isFiniteNumber(quote.valueChange) ? round(quote.valueChange, 2) : undefined,
          valueChangePct: isFiniteNumber(quote.valueChangePct) ? round(quote.valueChangePct, 2) : undefined,
          currency: "USD",
          unit: "t",
        },
        meta: {
          method: "identity_usd_t",
          notes: ["Source quote already in USD/t"],
        },
      };
    }

    case "CENTS_PER_BUSHEL":
    case "USD_PER_BUSHEL": {
      const current = cbotToUsdPerTon({
        centsPerBushel: quote.nativeUnitType === "CENTS_PER_BUSHEL" ? quote.valueCurrent : undefined,
        usdPerBushel: quote.nativeUnitType === "USD_PER_BUSHEL" ? quote.valueCurrent : undefined,
        crop: quote.crop,
      });
      const delta = cbotToUsdPerTon({
        centsPerBushel: quote.nativeUnitType === "CENTS_PER_BUSHEL" ? quote.valueChange : undefined,
        usdPerBushel: quote.nativeUnitType === "USD_PER_BUSHEL" ? quote.valueChange : undefined,
        crop: quote.crop,
      });

      return {
        ...base,
        status: current.status === "OK" ? "OK" : "UNAVAILABLE",
        normalized:
          current.status === "OK"
            ? {
                valueCurrent: current.value,
                valueChange: delta.status === "OK" ? delta.value : undefined,
                valueChangePct: isFiniteNumber(quote.valueChangePct) ? round(quote.valueChangePct, 2) : undefined,
                currency: "USD",
                unit: "t",
              }
            : undefined,
        meta: {
          method: current.status === "OK" ? quote.nativeUnitType === "CENTS_PER_BUSHEL" ? "cbot_cents_bu_to_usd_t" : "cbot_usd_bu_to_usd_t" : "unavailable",
          bushelsPerTon: current.bushelsPerTon,
          cropFactor: quote.crop,
          notes: quote.crop ? [] : ["Missing crop factor for bushel->ton conversion"],
        },
      };
    }

    case "EUR_PER_TON": {
      const current = eurTonToUsdTon({ eurPerTon: quote.valueCurrent, eurUsd: fx?.eurUsd });
      const delta = eurTonToUsdTon({ eurPerTon: quote.valueChange, eurUsd: fx?.eurUsd });

      return {
        ...base,
        status: current.status === "OK" ? "OK" : current.status === "FX_MISSING" ? "FX_MISSING" : "UNAVAILABLE",
        normalized:
          current.status === "OK"
            ? {
                valueCurrent: current.value,
                valueChange: delta.status === "OK" ? delta.value : undefined,
                valueChangePct: isFiniteNumber(quote.valueChangePct) ? round(quote.valueChangePct, 2) : undefined,
                currency: "USD",
                unit: "t",
              }
            : undefined,
        meta: {
          method: current.status === "OK" ? "eur_t_to_usd_t" : "unavailable",
          fxRateUsed: current.fxRateUsed,
          notes: current.status === "FX_MISSING" ? ["EURUSD FX rate unavailable"] : [],
        },
      };
    }

    default:
      return base;
  }
}

export function cToF(c?: number): number | undefined {
  if (!isFiniteNumber(c)) return undefined;
  return round((c * 9) / 5 + 32, 1);
}

export function fToC(f?: number): number | undefined {
  if (!isFiniteNumber(f)) return undefined;
  return round(((f - 32) * 5) / 9, 1);
}
