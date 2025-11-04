import { options, trades, settlements, type Option, type InsertOption, type Trade, type InsertTrade, type Settlement } from "@shared/schema";
import { db } from "./db";
import { desc, eq, and } from "drizzle-orm";

export interface IStorage {
  listOptions(): Promise<Option[]>;
  createOption(option: InsertOption): Promise<Option>;
  getOptionById(id: string): Promise<Option | undefined>;
  updateOption(id: string, updates: Partial<Option>): Promise<Option>;
  matchOption(optionId: string, seller: string): Promise<Trade | null>;
  exerciseOption(optionId: string, exercisedBy: string, spotPrice: string): Promise<Settlement>;
  listTrades(): Promise<Trade[]>;
  getTradesByUser(user: string): Promise<Trade[]>;
  listSettlements(): Promise<Settlement[]>;
}

export class DatabaseStorage implements IStorage {
  async listOptions(): Promise<Option[]> {
    const allOptions = await db
      .select()
      .from(options)
      .orderBy(desc(options.createdAt));
    return allOptions;
  }

  async createOption(insertOption: InsertOption): Promise<Option> {
    const [option] = await db
      .insert(options)
      .values(insertOption)
      .returning();
    return option;
  }

  async getOptionById(id: string): Promise<Option | undefined> {
    const [option] = await db
      .select()
      .from(options)
      .where(eq(options.id, id));
    return option;
  }

  async updateOption(id: string, updates: Partial<Option>): Promise<Option> {
    const [option] = await db
      .update(options)
      .set(updates)
      .where(eq(options.id, id))
      .returning();
    return option;
  }

  async matchOption(optionId: string, seller: string): Promise<Trade | null> {
    return await db.transaction(async (tx) => {
      const [option] = await tx
        .select()
        .from(options)
        .where(eq(options.id, optionId))
        .for('update');
      
      if (!option) {
        throw new Error("Option not found");
      }

      if (option.status !== "OPEN") {
        throw new Error("Option is not open for matching");
      }

      if (option.buyer === seller) {
        throw new Error("Buyer and seller cannot be the same");
      }

      const premiumNum = parseFloat(option.premium);
      const qtyNum = parseFloat(option.qty);
      const totalValue = (premiumNum * qtyNum).toFixed(8);

      const [trade] = await tx
        .insert(trades)
        .values({
          optionId: option.id,
          buyer: option.buyer,
          seller: seller,
          strike: option.strike,
          qty: option.qty,
          premium: option.premium,
          totalValue: totalValue,
        })
        .returning();

      await tx
        .update(options)
        .set({
          seller: seller,
          status: "FILLED",
        })
        .where(eq(options.id, optionId));

      return trade;
    });
  }

  async listTrades(): Promise<Trade[]> {
    const allTrades = await db
      .select()
      .from(trades)
      .orderBy(desc(trades.createdAt));
    return allTrades;
  }

  async getTradesByUser(user: string): Promise<Trade[]> {
    const userTrades = await db
      .select()
      .from(trades)
      .where(
        and(
          eq(trades.buyer, user)
        )
      )
      .orderBy(desc(trades.createdAt));
    return userTrades;
  }

  async exerciseOption(optionId: string, exercisedBy: string, spotPrice: string): Promise<Settlement> {
    return await db.transaction(async (tx) => {
      const [option] = await tx
        .select()
        .from(options)
        .where(eq(options.id, optionId))
        .for('update');
      
      if (!option) {
        throw new Error("Option not found");
      }

      if (option.status !== "FILLED") {
        throw new Error("Only filled options can be exercised");
      }

      if (option.buyer !== exercisedBy && option.seller !== exercisedBy) {
        throw new Error("Only the buyer or seller can exercise this option");
      }

      const spot = parseFloat(spotPrice);
      const strikePrice = parseFloat(option.strike);
      const quantity = parseFloat(option.qty);
      const premiumPaid = parseFloat(option.premium);

      let payout = 0;
      let profitLoss = 0;

      if (option.type === "CALL") {
        if (spot > strikePrice) {
          payout = (spot - strikePrice) * quantity;
          profitLoss = payout - (premiumPaid * quantity);
        } else {
          payout = 0;
          profitLoss = -(premiumPaid * quantity);
        }
      } else {
        if (spot < strikePrice) {
          payout = (strikePrice - spot) * quantity;
          profitLoss = payout - (premiumPaid * quantity);
        } else {
          payout = 0;
          profitLoss = -(premiumPaid * quantity);
        }
      }

      const [settlement] = await tx
        .insert(settlements)
        .values({
          optionId: option.id,
          exercisedBy: exercisedBy,
          spotPrice: spotPrice,
          strike: option.strike,
          qty: option.qty,
          payout: payout.toFixed(8),
          profitLoss: profitLoss.toFixed(8),
        })
        .returning();

      await tx
        .update(options)
        .set({ status: "EXPIRED" })
        .where(eq(options.id, optionId));

      return settlement;
    });
  }

  async listSettlements(): Promise<Settlement[]> {
    const allSettlements = await db
      .select()
      .from(settlements)
      .orderBy(desc(settlements.createdAt));
    return allSettlements;
  }
}

export const storage = new DatabaseStorage();
