/**
 * Unit tests for IGC Price Service
 * Tests HTML parsing logic with sample HTML fragments
 */

import * as cheerio from "cheerio";
import type { IgcPrice } from "../server/services/igcPriceService";

// Sample HTML table structure (simplified example based on IGC structure)
const SAMPLE_HTML = `
<table>
  <thead>
    <tr>
      <th>Market</th>
      <th>1 Jan</th>
      <th>Daily % Change</th>
      <th>Annual Change</th>
      <th>52 Week Low</th>
      <th>52 Week High</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>US No 2 Hard Red Winter (HRW)</td>
      <td>285.50</td>
      <td>2.3</td>
      <td>5.8</td>
      <td>250.00</td>
      <td>320.00</td>
    </tr>
    <tr>
      <td>Brazil Parana Wheat</td>
      <td>275.00</td>
      <td>-1.2</td>
      <td>3.5</td>
      <td>260.00</td>
      <td>310.00</td>
    </tr>
    <tr>
      <td>Argentina Rosario Wheat</td>
      <td>270.50</td>
      <td>0.8</td>
      <td>-2.1</td>
      <td>265.00</td>
      <td>295.00</td>
    </tr>
  </tbody>
</table>
`;

describe("IGC Price Service", () => {
  describe("HTML parsing", () => {
    it("should parse table structure correctly", () => {
      const $ = cheerio.load(SAMPLE_HTML);
      const $table = $("table");
      expect($table.length).toBe(1);

      const $rows = $table.find("tbody tr");
      expect($rows.length).toBe(3);

      const headers: string[] = [];
      $table.find("thead th").each((i, el) => {
        headers.push($(el).text().trim());
      });

      expect(headers).toContain("Market");
      expect(headers).toContain("Daily % Change");
    });

    it("should extract country names from labels", () => {
      const labels = [
        "US No 2 Hard Red Winter (HRW)",
        "Brazil Parana Wheat",
        "Argentina Rosario Wheat",
      ];

      const extractCountry = (text: string): "US" | "BR" | "AR" | null => {
        const lower = text.toLowerCase();
        if (lower.includes("us") || lower.includes("u.s.")) return "US";
        if (lower.includes("brazil")) return "BR";
        if (lower.includes("argentina")) return "AR";
        return null;
      };

      expect(extractCountry(labels[0])).toBe("US");
      expect(extractCountry(labels[1])).toBe("BR");
      expect(extractCountry(labels[2])).toBe("AR");
    });

    it("should parse price values correctly", () => {
      const parsePrice = (priceStr: string): number => {
        const cleaned = priceStr.replace(/[$,\s]/g, "");
        const parsed = parseFloat(cleaned);
        return isNaN(parsed) ? 0 : parsed;
      };

      expect(parsePrice("285.50")).toBe(285.50);
      expect(parsePrice("$285.50")).toBe(285.50);
      expect(parsePrice("1,285.50")).toBe(1285.50);
      expect(parsePrice("invalid")).toBe(0);
    });

    it("should parse percentage values correctly", () => {
      const parsePercentage = (percentStr: string): number | null => {
        const cleaned = percentStr.replace(/[%\s+]/g, "");
        const parsed = parseFloat(cleaned);
        return isNaN(parsed) ? null : parsed;
      };

      expect(parsePercentage("2.3")).toBe(2.3);
      expect(parsePercentage("2.3%")).toBe(2.3);
      expect(parsePercentage("+2.3")).toBe(2.3);
      expect(parsePercentage("-1.2")).toBe(-1.2);
      expect(parsePercentage("")).toBe(null);
    });

    it("should parse date strings correctly", () => {
      const parseDate = (dateStr: string): string => {
        const trimmed = dateStr.trim();
        if (!trimmed) return new Date().toISOString().split("T")[0];

        const months: Record<string, number> = {
          jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
          jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
        };

        const parts = trimmed.toLowerCase().split(/\s+/);
        if (parts.length < 2) {
          return new Date().toISOString().split("T")[0];
        }

        const day = parseInt(parts[0], 10);
        const monthName = parts[1];
        const month = months[monthName];
        
        if (isNaN(day) || month === undefined) {
          return new Date().toISOString().split("T")[0];
        }

        const year = parts.length >= 3 ? parseInt(parts[2], 10) : new Date().getFullYear();
        const date = new Date(year, month, day);
        return date.toISOString().split("T")[0];
      };

      const today = new Date();
      const currentYear = today.getFullYear();

      expect(parseDate("1 Jan")).toMatch(/^\d{4}-01-01$/);
      expect(parseDate("15 Dec")).toMatch(/^\d{4}-12-15$/);
      expect(parseDate("1 Jan 2024")).toBe("2024-01-01");
      expect(parseDate("invalid")).toMatch(/^\d{4}-\d{2}-\d{2}$/); // Falls back to today
    });
  });

  describe("Data structure validation", () => {
    it("should create valid IgcPrice objects", () => {
      const samplePrice: IgcPrice = {
        commodity: "wheat",
        country: "US",
        label: "US No 2 Hard Red Winter (HRW)",
        asOfDate: "2024-01-15",
        priceUsdPerTon: 285.50,
        dailyChangePct: 2.3,
        annualChangePct: 5.8,
        low52w: 250.00,
        high52w: 320.00,
        rawRow: {
          Market: "US No 2 Hard Red Winter (HRW)",
          "1 Jan": "285.50",
          "Daily % Change": "2.3",
          "Annual Change": "5.8",
          "52 Week Low": "250.00",
          "52 Week High": "320.00",
        },
      };

      expect(samplePrice.commodity).toBe("wheat");
      expect(samplePrice.country).toBe("US");
      expect(samplePrice.priceUsdPerTon).toBeGreaterThan(0);
      expect(samplePrice.asOfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});

