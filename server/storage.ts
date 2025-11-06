import { 
  options, 
  trades, 
  settlements, 
  wallets, 
  marginCalls,
  notifications,
  transactions,
  feedback,
  type Option, 
  type InsertOption, 
  type Trade, 
  type InsertTrade, 
  type Settlement, 
  type Wallet, 
  type InsertWallet,
  type MarginCall,
  type InsertMarginCall,
  type Notification,
  type InsertNotification,
  type Transaction,
  type InsertTransaction,
  type Feedback,
  type InsertFeedback
} from "@shared/schema";
import { db } from "./db";
import { desc, eq, and, lt } from "drizzle-orm";

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
  linkWallet(address: string): Promise<Wallet>;
  getWalletByAddress(address: string): Promise<Wallet | undefined>;
  listWallets(): Promise<Wallet[]>;
  createMarginCall(marginCall: InsertMarginCall): Promise<MarginCall>;
  updateMarginCall(id: string, updates: Partial<MarginCall>): Promise<MarginCall>;
  getMarginCallById(id: string): Promise<MarginCall | undefined>;
  listMarginCalls(): Promise<MarginCall[]>;
  getMarginCallsByUser(userId: string): Promise<MarginCall[]>;
  getExpiredMarginCalls(): Promise<MarginCall[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  listNotifications(userId: string): Promise<Notification[]>;
  updateNotification(id: string, updates: Partial<Notification>): Promise<Notification>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  listTransactions(): Promise<Transaction[]>;
  forceSettleOption(optionId: string, settledBy: string, reason: string): Promise<{ option: Option; transaction: Transaction; notifications: Notification[] }>;
  createFeedback(feedback: InsertFeedback): Promise<Feedback>;
  listFeedback(): Promise<Feedback[]>;
  updateFeedback(id: string, updates: Partial<Feedback>): Promise<Feedback>;
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

  async linkWallet(address: string): Promise<Wallet> {
    const existing = await this.getWalletByAddress(address);
    if (existing) {
      return existing;
    }

    const [wallet] = await db
      .insert(wallets)
      .values({ address })
      .returning();
    return wallet;
  }

  async getWalletByAddress(address: string): Promise<Wallet | undefined> {
    const [wallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.address, address));
    return wallet;
  }

  async listWallets(): Promise<Wallet[]> {
    const allWallets = await db
      .select()
      .from(wallets)
      .orderBy(desc(wallets.createdAt));
    return allWallets;
  }

  async createMarginCall(insertMarginCall: InsertMarginCall): Promise<MarginCall> {
    const [marginCall] = await db
      .insert(marginCalls)
      .values(insertMarginCall)
      .returning();
    return marginCall;
  }

  async updateMarginCall(id: string, updates: Partial<MarginCall>): Promise<MarginCall> {
    const [marginCall] = await db
      .update(marginCalls)
      .set(updates)
      .where(eq(marginCalls.id, id))
      .returning();
    return marginCall;
  }

  async getMarginCallById(id: string): Promise<MarginCall | undefined> {
    const [marginCall] = await db
      .select()
      .from(marginCalls)
      .where(eq(marginCalls.id, id));
    return marginCall;
  }

  async listMarginCalls(): Promise<MarginCall[]> {
    const allMarginCalls = await db
      .select()
      .from(marginCalls)
      .orderBy(desc(marginCalls.createdAt));
    return allMarginCalls;
  }

  async getMarginCallsByUser(userId: string): Promise<MarginCall[]> {
    const userMarginCalls = await db
      .select()
      .from(marginCalls)
      .where(eq(marginCalls.userId, userId))
      .orderBy(desc(marginCalls.createdAt));
    return userMarginCalls;
  }

  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const [notification] = await db
      .insert(notifications)
      .values(insertNotification)
      .returning();
    return notification;
  }

  async listNotifications(userId: string): Promise<Notification[]> {
    const userNotifications = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));
    return userNotifications;
  }

  async updateNotification(id: string, updates: Partial<Notification>): Promise<Notification> {
    const [notification] = await db
      .update(notifications)
      .set(updates)
      .where(eq(notifications.id, id))
      .returning();
    return notification;
  }

  async getExpiredMarginCalls(): Promise<MarginCall[]> {
    const now = new Date();
    const expiredMarginCalls = await db
      .select()
      .from(marginCalls)
      .where(
        and(
          lt(marginCalls.deadline, now),
          eq(marginCalls.status, "PENDING")
        )
      )
      .orderBy(desc(marginCalls.createdAt));
    return expiredMarginCalls;
  }

  async createTransaction(insertTransaction: InsertTransaction): Promise<Transaction> {
    const [transaction] = await db
      .insert(transactions)
      .values(insertTransaction)
      .returning();
    return transaction;
  }

  async listTransactions(): Promise<Transaction[]> {
    const allTransactions = await db
      .select()
      .from(transactions)
      .orderBy(desc(transactions.createdAt));
    return allTransactions;
  }

  async forceSettleOption(
    optionId: string, 
    settledBy: string, 
    reason: string
  ): Promise<{ option: Option; transaction: Transaction; notifications: Notification[] }> {
    // Get the option
    const option = await this.getOptionById(optionId);
    if (!option) {
      throw new Error("Option not found");
    }

    // Determine status based on reason
    const isDefaulted = reason.includes("margin call") || reason.includes("deadline");
    const newStatus = isDefaulted ? "DEFAULTED" : "EXERCISED";

    // Calculate payout from accumulated payout if defaulted
    const payout = isDefaulted ? parseFloat(option.payoutAccumulated || "0") : 0;

    // Update option status
    const [updatedOption] = await db
      .update(options)
      .set({ status: newStatus })
      .where(eq(options.id, optionId))
      .returning();

    // Create transaction record
    const transaction = await this.createTransaction({
      optionId,
      type: "FORCE_SETTLE",
      fromUserId: option.issuerId || option.seller || null,
      toUserId: option.buyerId || option.buyer,
      amount: payout.toFixed(8),
      description: reason,
    });

    // Create notifications
    const createdNotifications: Notification[] = [];

    // Notify buyer
    if (option.buyerId) {
      const buyerNotification = await this.createNotification({
        userId: option.buyerId,
        type: "FORCE_SETTLE",
        message: `Option ${option.title} has been force-settled. Status: ${newStatus}. ${reason}`,
        relatedId: optionId,
      });
      createdNotifications.push(buyerNotification);
    }

    // Notify issuer/seller (prevent duplicate if same as buyer)
    const responsibleUserId = option.issuerId || option.seller;
    if (responsibleUserId && responsibleUserId !== option.buyerId) {
      const issuerNotification = await this.createNotification({
        userId: responsibleUserId,
        type: "FORCE_SETTLE",
        message: `Option ${option.title} has been force-settled. Status: ${newStatus}. ${reason}`,
        relatedId: optionId,
      });
      createdNotifications.push(issuerNotification);
    }

    return {
      option: updatedOption,
      transaction,
      notifications: createdNotifications,
    };
  }

  async createFeedback(insertFeedback: InsertFeedback): Promise<Feedback> {
    const [feedbackEntry] = await db
      .insert(feedback)
      .values(insertFeedback)
      .returning();
    return feedbackEntry;
  }

  async listFeedback(): Promise<Feedback[]> {
    const allFeedback = await db
      .select()
      .from(feedback)
      .orderBy(desc(feedback.createdAt));
    return allFeedback;
  }

  async updateFeedback(id: string, updates: Partial<Feedback>): Promise<Feedback> {
    const [feedbackEntry] = await db
      .update(feedback)
      .set(updates)
      .where(eq(feedback.id, id))
      .returning();
    return feedbackEntry;
  }
}

export const storage = new DatabaseStorage();
