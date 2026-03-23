import { describe, expect, it } from "@jest/globals";
import { toUsdPerTon } from "../server/ingestion/normalization/price";
import { validateUsdPerTon } from "../server/ingestion/normalization/priceSanity";

const fx = {
  asOf: "2026-02-19",
  usdPerUnit: {
    USD: 1,
    ARS: 0.0012,
    BRL: 0.18,
    EUR: 1.08,
  },
};

describe("price normalization", () => {
  it("converts USD/bu to USD/t using commodity factors", () => {
    const corn = toUsdPerTon({ commodity: "corn", rawPrice: 5, rawUnit: "USD/bu", fx });
    const wheat = toUsdPerTon({ commodity: "wheat", rawPrice: 5, rawUnit: "USD/bu", fx });
    const soy = toUsdPerTon({ commodity: "soybeans", rawPrice: 5, rawUnit: "USD/bu", fx });

    expect(corn.priceUsdPerTon).toBeCloseTo(196.84, 1);
    expect(wheat.priceUsdPerTon).toBeCloseTo(183.71, 1);
    expect(soy.priceUsdPerTon).toBeCloseTo(183.71, 1);
  });

  it("converts ARS/t to USD/t via FX", () => {
    const ar = toUsdPerTon({ commodity: "soybeans", rawPrice: 300000, rawUnit: "ARS/t", fx });
    expect(ar.priceUsdPerTon).toBeCloseTo(360, 4);
    expect(ar.rawToUsdFxRate).toBeCloseTo(0.0012, 6);
  });

  it("sanity gate rejects clear outliers", () => {
    const low1 = validateUsdPerTon({ market: "BR", commodity: "soybeans", price: 40.29 });
    const low2 = validateUsdPerTon({ market: "AR", commodity: "soybeans", price: 0.03 });

    expect(low1.valid).toBe(false);
    expect(low1.invalidReason).toBe("OUT_OF_RANGE");
    expect(low2.valid).toBe(false);
    expect(low2.invalidReason).toBe("OUT_OF_RANGE");
  });
});
