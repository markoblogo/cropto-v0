import { db } from "../db";
import { forwardContracts, forwardOrders, indexes, commodityIndexPrices } from "@shared/schema";
import { eq, and, gte, desc } from "drizzle-orm";

export interface CalendarSpread {
  leg1: {
    commodity: string;
    window: string;
    windowStart: Date | null;
    windowEnd: Date | null;
  };
  leg2: {
    commodity: string;
    window: string;
    windowStart: Date | null;
    windowEnd: Date | null;
  };
  spreadPrice: number;
  contractCount: number;
  lastUpdated: Date;
}

export interface CrossCommoditySpread {
  leg1: {
    commodity: string;
    window: string;
    windowStart: Date | null;
    windowEnd: Date | null;
  };
  leg2: {
    commodity: string;
    window: string;
    windowStart: Date | null;
    windowEnd: Date | null;
  };
  spreadPrice: number;
  contractCount: number;
  lastUpdated: Date;
}

/**
 * Calculate calendar spreads for a given commodity
 * Groups contracts by pairs of windows (near vs far)
 */
export async function calculateCalendarSpreads(commodity?: string): Promise<CalendarSpread[]> {
  try {
    // Get active forward contracts
    const baseWhere: any[] = [eq(forwardContracts.status, "ACTIVE")];
    if (commodity) {
      baseWhere.push(eq(forwardContracts.commodity, commodity));
    }

    const contracts = await db
      .select({
        id: forwardContracts.id,
        commodity: forwardContracts.commodity,
        contractPrice: forwardContracts.contractPrice,
        window: forwardContracts.window,
        windowStart: forwardContracts.windowStart,
        windowEnd: forwardContracts.windowEnd,
        status: forwardContracts.status,
        createdAt: forwardContracts.createdAt,
        updatedAt: forwardContracts.updatedAt,
      })
      .from(forwardContracts)
      .where(and(...baseWhere));

    // Group by commodity and window
    const windowGroups: Record<string, Record<string, typeof contracts>> = {};

    for (const contract of contracts) {
      const key = contract.commodity || "unknown";
      const windowKey = contract.window || "unknown";

      if (!windowGroups[key]) {
        windowGroups[key] = {};
      }
      if (!windowGroups[key][windowKey]) {
        windowGroups[key][windowKey] = [];
      }
      windowGroups[key][windowKey].push(contract);
    }

    const spreads: CalendarSpread[] = [];

    // Calculate spreads between window pairs for each commodity
    for (const [commodityKey, windows] of Object.entries(windowGroups)) {
      const windowKeys = Object.keys(windows).sort();

      // Create pairs: consecutive windows (H1 vs H2, Sep vs Oct, etc.)
      for (let i = 0; i < windowKeys.length - 1; i++) {
        const window1 = windowKeys[i];
        const window2 = windowKeys[i + 1];

        const contracts1 = windows[window1];
        const contracts2 = windows[window2];

        if (contracts1.length === 0 || contracts2.length === 0) continue;

        // Calculate average prices
        const avgPrice1 = contracts1.reduce((sum, c) => sum + parseFloat(c.contractPrice || "0"), 0) / contracts1.length;
        const avgPrice2 = contracts2.reduce((sum, c) => sum + parseFloat(c.contractPrice || "0"), 0) / contracts2.length;

        // Spread = near - far (assuming window1 is nearer than window2)
        const spreadPrice = avgPrice1 - avgPrice2;

        // Find latest update time
        const allContracts = [...contracts1, ...contracts2];
        const lastUpdated = new Date(Math.max(...allContracts.map(c => c.updatedAt.getTime())));

        spreads.push({
          leg1: {
            commodity: commodityKey,
            window: window1,
            windowStart: contracts1[0].windowStart,
            windowEnd: contracts1[0].windowEnd,
          },
          leg2: {
            commodity: commodityKey,
            window: window2,
            windowStart: contracts2[0].windowStart,
            windowEnd: contracts2[0].windowEnd,
          },
          spreadPrice: Math.round(spreadPrice * 100) / 100, // Round to 2 decimal places
          contractCount: contracts1.length + contracts2.length,
          lastUpdated,
        });
      }
    }

    return spreads.sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime());
  } catch (error) {
    console.error("Error calculating calendar spreads:", error);
    return [];
  }
}

/**
 * Calculate cross-commodity spreads for a given window
 * Groups contracts by pairs of commodities within the same window
 */
export async function calculateCrossCommoditySpreads(window?: string): Promise<CrossCommoditySpread[]> {
  try {
    // Get active forward contracts
    const baseWhere: any[] = [eq(forwardContracts.status, "ACTIVE")];
    if (window) {
      baseWhere.push(eq(forwardContracts.window, window));
    }

    const contracts = await db
      .select({
        id: forwardContracts.id,
        commodity: forwardContracts.commodity,
        contractPrice: forwardContracts.contractPrice,
        window: forwardContracts.window,
        windowStart: forwardContracts.windowStart,
        windowEnd: forwardContracts.windowEnd,
        status: forwardContracts.status,
        createdAt: forwardContracts.createdAt,
        updatedAt: forwardContracts.updatedAt,
      })
      .from(forwardContracts)
      .where(and(...baseWhere));

    // Group by window and commodity
    const commodityGroups: Record<string, Record<string, typeof contracts>> = {};

    for (const contract of contracts) {
      const windowKey = contract.window || "unknown";
      const commodityKey = contract.commodity || "unknown";

      if (!commodityGroups[windowKey]) {
        commodityGroups[windowKey] = {};
      }
      if (!commodityGroups[windowKey][commodityKey]) {
        commodityGroups[windowKey][commodityKey] = [];
      }
      commodityGroups[windowKey][commodityKey].push(contract);
    }

    const spreads: CrossCommoditySpread[] = [];

    // Calculate spreads between commodity pairs for each window
    for (const [windowKey, commodities] of Object.entries(commodityGroups)) {
      const commodityKeys = Object.keys(commodities).sort();

      // Create pairs: all combinations of commodities
      for (let i = 0; i < commodityKeys.length; i++) {
        for (let j = i + 1; j < commodityKeys.length; j++) {
          const commodity1 = commodityKeys[i];
          const commodity2 = commodityKeys[j];

          const contracts1 = commodities[commodity1];
          const contracts2 = commodities[commodity2];

          if (contracts1.length === 0 || contracts2.length === 0) continue;

          // Calculate average prices
          const avgPrice1 = contracts1.reduce((sum, c) => sum + parseFloat(c.contractPrice || "0"), 0) / contracts1.length;
          const avgPrice2 = contracts2.reduce((sum, c) => sum + parseFloat(c.contractPrice || "0"), 0) / contracts2.length;

          // Spread = commodity1 - commodity2
          const spreadPrice = avgPrice1 - avgPrice2;

          // Find latest update time
          const allContracts = [...contracts1, ...contracts2];
          const lastUpdated = new Date(Math.max(...allContracts.map(c => c.updatedAt.getTime())));

          spreads.push({
            leg1: {
              commodity: commodity1,
              window: windowKey,
              windowStart: contracts1[0].windowStart,
              windowEnd: contracts1[0].windowEnd,
            },
            leg2: {
              commodity: commodity2,
              window: windowKey,
              windowStart: contracts2[0].windowStart,
              windowEnd: contracts2[0].windowEnd,
            },
            spreadPrice: Math.round(spreadPrice * 100) / 100, // Round to 2 decimal places
            contractCount: contracts1.length + contracts2.length,
            lastUpdated,
          });
        }
      }
    }

    return spreads.sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime());
  } catch (error) {
    console.error("Error calculating cross-commodity spreads:", error);
    return [];
  }
}

/**
 * Get both calendar and cross-commodity spreads
 */
export async function getAllSpreads(commodity?: string, window?: string) {
  const [calendarSpreads, crossCommoditySpreads] = await Promise.all([
    calculateCalendarSpreads(commodity),
    calculateCrossCommoditySpreads(window),
  ]);

  return {
    calendar: calendarSpreads,
    crossCommodity: crossCommoditySpreads,
  };
}