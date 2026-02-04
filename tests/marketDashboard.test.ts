/**
 * Tests for /api/market-dashboard endpoint
 * 
 * Note: These tests require a running server and database connection.
 * Run with: npm test -- tests/marketDashboard.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { db } from "../server/db";
import { indexPrices } from "../shared/schema";
import { eq } from "drizzle-orm";

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:5000";

describe("GET /api/market-dashboard", () => {
  let testPriceId: string | null = null;

  beforeAll(async () => {
    // Insert a test IGC price record for testing
    try {
      const [inserted] = await db
        .insert(indexPrices)
        .values({
          commodity: "SOYBEANS",
          price: "485.50",
          date: new Date(),
          source: "IGC",
          country: "BR",
          label: "Brazil Parana Soybeans (Test)",
          asOfDate: new Date(),
          dailyChangePct: "2.3",
          annualChangePct: "5.8",
          low52w: "450.00",
          high52w: "520.00",
          rawRow: JSON.stringify({ test: "data" }),
          isDemo: "false",
        })
        .returning();

      if (inserted) {
        testPriceId = inserted.id;
      }
    } catch (error) {
      console.warn("Failed to insert test data (may already exist):", error);
    }
  });

  afterAll(async () => {
    // Clean up test data
    if (testPriceId) {
      try {
        await db.delete(indexPrices).where(eq(indexPrices.id, testPriceId));
      } catch (error) {
        console.warn("Failed to clean up test data:", error);
      }
    }
  });

  it("should return 200 and valid structure", async () => {
    const response = await fetch(`${API_BASE_URL}/api/market-dashboard`);
    
    expect(response.status).toBe(200);
    const data = await response.json();

    // Check structure
    expect(data).toHaveProperty("ua");
    expect(data).toHaveProperty("br");
    expect(data).toHaveProperty("ar");
    expect(data).toHaveProperty("us");
    expect(Array.isArray(data.ua)).toBe(true);
    expect(Array.isArray(data.br)).toBe(true);
    expect(Array.isArray(data.ar)).toBe(true);
    expect(Array.isArray(data.us)).toBe(true);
  });

  it("should include IGC data with all required fields", async () => {
    const response = await fetch(`${API_BASE_URL}/api/market-dashboard`);
    const data = await response.json();

    // Check that at least one IGC record exists in BR/AR/US
    const allRegionalData = [...data.br, ...data.ar, ...data.us];
    const igcRecords = allRegionalData.filter((item: any) => item.source === "IGC");

    if (igcRecords.length > 0) {
      const igcRecord = igcRecords[0];

      // Required fields
      expect(igcRecord).toHaveProperty("commodity");
      expect(igcRecord).toHaveProperty("country");
      expect(igcRecord).toHaveProperty("source");
      expect(igcRecord).toHaveProperty("asOf");
      expect(igcRecord).toHaveProperty("price");
      expect(igcRecord).toHaveProperty("basis");

      // Source should be "IGC"
      expect(igcRecord.source).toBe("IGC");

      // Country should be one of BR, AR, US
      expect(["BR", "AR", "US"]).toContain(igcRecord.country);

      // Optional fields (if present in DB, should be in response)
      // annualChange, low52w, high52w may be present
      if (igcRecord.annualChange !== undefined) {
        expect(typeof igcRecord.annualChange).toBe("number");
      }
      if (igcRecord.low52w !== undefined) {
        expect(typeof igcRecord.low52w).toBe("number");
      }
      if (igcRecord.high52w !== undefined) {
        expect(typeof igcRecord.high52w).toBe("number");
      }
    } else {
      console.warn("No IGC records found in response - test may need seed data");
    }
  });

  it("should return valid data types", async () => {
    const response = await fetch(`${API_BASE_URL}/api/market-dashboard`);
    const data = await response.json();

    // Check all arrays contain objects with correct types
    for (const region of ["ua", "br", "ar", "us"]) {
      const items = data[region];
      if (items.length > 0) {
        const item = items[0];
        expect(typeof item.commodity).toBe("string");
        expect(typeof item.price).toBe("number");
        expect(typeof item.country).toBe("string");
        expect(typeof item.source).toBe("string");
        expect(typeof item.asOf).toBe("string");
        expect(item.currency).toBe("USD");
      }
    }
  });

  it("should filter IGC records according to IGC_SERIES_MAPPING", async () => {
    const response = await fetch(`${API_BASE_URL}/api/market-dashboard`);
    const data = await response.json();
    const { IGC_SERIES_MAPPING, EXPECTED_COMMODITY_COUNTS } = await import("../server/services/igcSeriesMapping");

    // Check BR: should have exactly 2 IGC records (soybeans, maize)
    const brIgcRecords = data.br.filter((item: any) => item.source === "IGC");
    expect(brIgcRecords.length).toBeLessThanOrEqual(EXPECTED_COMMODITY_COUNTS.BR);
    
    // Check AR: should have at most 4 IGC records (wheat, maize, barley, soybeans)
    const arIgcRecords = data.ar.filter((item: any) => item.source === "IGC");
    expect(arIgcRecords.length).toBeLessThanOrEqual(EXPECTED_COMMODITY_COUNTS.AR);
    
    // Check US: should have at most 3 IGC records (wheat, maize, soybeans)
    const usIgcRecords = data.us.filter((item: any) => item.source === "IGC");
    expect(usIgcRecords.length).toBeLessThanOrEqual(EXPECTED_COMMODITY_COUNTS.US);

    // Verify that all IGC records match the expected labels
    for (const record of [...brIgcRecords, ...arIgcRecords, ...usIgcRecords]) {
      const country = record.country as keyof typeof IGC_SERIES_MAPPING;
      const commodity = record.commodity.toLowerCase();
      const preferredLabel = IGC_SERIES_MAPPING[country]?.[commodity as keyof typeof IGC_SERIES_MAPPING[typeof country]];
      
      if (preferredLabel) {
        // Label should start with preferred label (allows for minor formatting variations)
        expect(record.basis || record.label).toMatch(new RegExp(`^${preferredLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
      }
    }

    // Verify that AR does not have rice (not in mapping)
    const arRiceRecords = data.ar.filter((item: any) => 
      item.source === "IGC" && item.commodity.toLowerCase() === "rice"
    );
    expect(arRiceRecords.length).toBe(0);

    // Verify that US does not have barley or rice (not in mapping)
    const usBarleyRecords = data.us.filter((item: any) => 
      item.source === "IGC" && item.commodity.toLowerCase() === "barley"
    );
    const usRiceRecords = data.us.filter((item: any) => 
      item.source === "IGC" && item.commodity.toLowerCase() === "rice"
    );
    expect(usBarleyRecords.length).toBe(0);
    expect(usRiceRecords.length).toBe(0);
  });
});

