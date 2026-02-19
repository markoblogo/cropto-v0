import type { MarketPricePoint } from "../types";

const BUSHEL_KG: Record<string, number> = {
  corn: 25.40117272,
  maize: 25.40117272,
  wheat: 27.2155422,
  soybeans: 27.2155422,
};

export type FxSnapshot = {
  asOf: string | null;
  usdPerUnit: Record<string, number>; // currency -> USD per 1 currency unit
};

function normalizeCurrency(rawUnit: string): string {
  const u = rawUnit.toUpperCase();
  if (u.includes("USD") || u.includes("US$")) return "USD";
  if (u.includes("ARS")) return "ARS";
  if (u.includes("BRL") || u.includes("R$")) return "BRL";
  if (u.includes("EUR")) return "EUR";
  return "USD";
}

function normalizeUnit(rawUnit: string): string {
  const u = rawUnit.toUpperCase().replace(/\s+/g, "");
  if (u.includes("/BU") || u.includes("BUSHEL")) return "USD/bu";
  if (u.includes("USD") && (u.includes("/T") || u.includes("TON"))) return "USD/t";
  if (u.includes("ARS") && (u.includes("/T") || u.includes("TON"))) return "ARS/t";
  if (u.includes("BRL") && (u.includes("/T") || u.includes("TON"))) return "BRL/t";
  if (u.includes("R$") && (u.includes("/T") || u.includes("TON"))) return "BRL/t";
  if (u.includes("EUR") && (u.includes("/T") || u.includes("TON"))) return "EUR/t";
  return rawUnit || "USD/t";
}

export function toUsdPerTon(args: {
  commodity: string;
  rawPrice: number;
  rawUnit: string;
  fx: FxSnapshot;
}): { priceUsdPerTon: number | null; rawCurrency: string; rawToUsdFxRate?: number; conversionNotes?: string; needsReview: boolean } {
  const commodity = args.commodity.toLowerCase();
  const rawUnit = normalizeUnit(args.rawUnit);
  const rawCurrency = normalizeCurrency(rawUnit);

  if (rawUnit === "USD/t") {
    return { priceUsdPerTon: args.rawPrice, rawCurrency, rawToUsdFxRate: 1, conversionNotes: "direct:USD/t", needsReview: false };
  }

  if (rawUnit.endsWith("/t") && rawCurrency !== "USD") {
    const fxRate = args.fx.usdPerUnit[rawCurrency];
    if (!Number.isFinite(fxRate) || fxRate <= 0) {
      return { priceUsdPerTon: null, rawCurrency, conversionNotes: `missing_fx:${rawCurrency}`, needsReview: true };
    }
    return {
      priceUsdPerTon: Number((args.rawPrice * fxRate).toFixed(6)),
      rawCurrency,
      rawToUsdFxRate: fxRate,
      conversionNotes: `${rawCurrency}/t -> USD/t`,
      needsReview: false,
    };
  }

  if (rawUnit === "USD/bu") {
    const kg = BUSHEL_KG[commodity];
    if (!kg) {
      return { priceUsdPerTon: null, rawCurrency, conversionNotes: `unknown_bushel_factor:${commodity}`, needsReview: true };
    }
    const usdPerTon = args.rawPrice * (1000 / kg);
    return {
      priceUsdPerTon: Number(usdPerTon.toFixed(6)),
      rawCurrency: "USD",
      rawToUsdFxRate: 1,
      conversionNotes: `USD/bu -> USD/t (kg_per_bushel=${kg})`,
      needsReview: false,
    };
  }

  return {
    priceUsdPerTon: null,
    rawCurrency,
    conversionNotes: `unsupported_unit:${rawUnit}`,
    needsReview: true,
  };
}

export function applyUsdNormalization(point: MarketPricePoint, fx: FxSnapshot): MarketPricePoint {
  const normalized = toUsdPerTon({
    commodity: point.commodity,
    rawPrice: point.priceRaw,
    rawUnit: point.rawUnit,
    fx,
  });

  const priceUsdPerTon = normalized.priceUsdPerTon;
  return {
    ...point,
    unit: "USD/t",
    price: priceUsdPerTon ?? point.price,
    priceUsdPerTon: priceUsdPerTon ?? undefined,
    rawCurrency: normalized.rawCurrency,
    rawToUsdFxRate: normalized.rawToUsdFxRate,
    conversionNotes: normalized.conversionNotes,
    needsReview: point.needsReview || normalized.needsReview,
  };
}
