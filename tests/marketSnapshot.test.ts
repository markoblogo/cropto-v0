import { describe, it, expect } from "@jest/globals";
import { mapOptionToMarketRow } from "../server/utils/marketSnapshot";
import type { Option } from "@shared/schema";

describe("mapOptionToMarketRow", () => {
  it("maps option to market row with expiry window label fallback", () => {
    const option = {
      id: "opt-1",
      title: "Test",
      type: "CALL",
      strike: "210",
      qty: "50",
      premium: "5",
      status: "OPEN",
      commodity: "WHEAT_11_5_EXPORT",
      expiryWindow: "",
      windowStart: new Date("2025-12-01T00:00:00.000Z"),
      expirationDate: new Date("2025-12-15T00:00:00.000Z"),
      createdAt: new Date(),
      lastUpdated: new Date(),
    } as unknown as Option;

    const row = mapOptionToMarketRow(option);

    expect(row).toMatchObject({
      id: "opt-1",
      commodity: "WHEAT_11_5_EXPORT",
      type: "CALL",
      qtyTons: 50,
      strikePerTon: 210,
      premiumPerTon: 5,
      side: "SHORT",
    });
    expect(row.expiryWindowLabel).toBe("Dec 2025");
    expect(row.expirationDate).toBe("2025-12-15T00:00:00.000Z");
  });
});

