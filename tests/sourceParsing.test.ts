import { describe, expect, it } from "@jest/globals";
import { pickCommodityAwarePriceFromLine } from "../server/ingestion/sources/common";

describe("source parsing helpers", () => {
  it("parses dot-thousands format when configured", () => {
    const line = "Soja Rosario 10-03-2021 ARS 41.071";
    const re = /(?:USD|US\$|ARS|BRL|EUR|R\$|\$)?\s*(-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,4})|\d+(?:[.,]\d{1,4}))/g;
    const value = pickCommodityAwarePriceFromLine(line, ["soja"], re, "thousands_dot_decimal_comma");
    expect(value).toBe(41071);
  });

  it("extracts commodity-specific values from mixed row", () => {
    const row = "Brazil 2026-02-19 corn 210.5 wheat 220.0 soy 450.0";
    const re = /(?:USD|US\$|ARS|BRL|EUR|R\$|\$)?\s*(-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,4})|\d+(?:[.,]\d{1,4}))/g;
    const corn = pickCommodityAwarePriceFromLine(row, ["corn"], re, "auto");
    const wheat = pickCommodityAwarePriceFromLine(row, ["wheat"], re, "auto");
    const soy = pickCommodityAwarePriceFromLine(row, ["soy"], re, "auto");
    expect(corn).toBe(210.5);
    expect(wheat).toBe(220);
    expect(soy).toBe(450);
  });
});
