import { 
  options, 
  indexes,
  trades, 
  settlements, 
  wallets, 
  marginCalls,
  notifications,
  transactions,
  feedback,
  platformFees,
  croptBalances,
  spotPositions,
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
import { desc, eq, and, lt, or } from "drizzle-orm";

export interface IStorage {
  listOptions(): Promise<Option[]>;
  createOption(option: InsertOption): Promise<Option>;
  getOptionById(id: string): Promise<Option | undefined>;
  getOptionsByUser(userId: string): Promise<Option[]>;
  updateOption(id: string, updates: Partial<Option>): Promise<Option>;
  matchOption(optionId: string, counterpartyId: string, matchedBy: string): Promise<Option>;
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
      .select({
        id: options.id,
        title: options.title,
        type: options.type,
        strike: options.strike,
        qty: options.qty,
        premium: options.premium,
        buyer: options.buyer,
        seller: options.seller,
        status: options.status,
        commodity: options.commodity,
        indexId: options.indexId,
        expirationDate: options.expirationDate,
        buyerId: options.buyerId,
        issuerId: options.issuerId,
        collateralAmount: options.collateralAmount,
        lastIntrinsic: options.lastIntrinsic,
        payoutAccumulated: options.payoutAccumulated,
        isDemo: options.isDemo,
        nftTokenId: options.nftTokenId,
        nftMintTx: options.nftMintTx,
        nftStatus: options.nftStatus,
        matchedBy: options.matchedBy,
        matchedAt: options.matchedAt,
        counterpartyId: options.counterpartyId,
        createdAt: options.createdAt,
        lastUpdated: options.lastUpdated,
        commodityName: indexes.name,
        commoditySlug: indexes.slug,
      })
      .from(options)
      .leftJoin(indexes, eq(options.indexId, indexes.id))
      .orderBy(desc(options.createdAt));
    return allOptions as any;
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

  async getOptionsByUser(userId: string): Promise<Option[]> {
    const userOptions = await db
      .select()
      .from(options)
      .where(
        or(
          eq(options.buyer, userId),
          eq(options.seller, userId)
        )
      )
      .orderBy(desc(options.createdAt));
    return userOptions;
  }

  async updateOption(id: string, updates: Partial<Option>): Promise<Option> {
    const [option] = await db
      .update(options)
      .set({ ...updates, lastUpdated: new Date() })
      .where(eq(options.id, id))
      .returning();
    return option;
  }

  async matchOption(optionId: string, counterpartyId: string, matchedBy: string): Promise<Option> {
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

      if (!counterpartyId) {
        throw new Error("Counterparty ID is required");
      }

      // Update option with matching details
      const [updatedOption] = await tx
        .update(options)
        .set({
          status: "FILLED",
          counterpartyId: counterpartyId,
          matchedBy: matchedBy,
          matchedAt: new Date(),
          lastUpdated: new Date(),
        })
        .where(eq(options.id, optionId))
        .returning();

      return updatedOption;
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

      // Strict ownership validation - no legacy bypass
      if (!option.issuerId && !option.buyerId) {
        throw new Error("This option cannot be exercised: missing ownership records. Contact administrator to update option data.");
      }
      
      if (option.issuerId !== exercisedBy && option.buyerId !== exercisedBy) {
        throw new Error("Only the buyer or issuer can exercise this option");
      }

      if (!option.commodity) {
        throw new Error("Option is missing underlying commodity information");
      }

      const spot = parseFloat(spotPrice);
      const strikePricePerTon = parseFloat(option.strike);
      const quantityTons = parseFloat(option.qty);
      const premiumPaid = parseFloat(option.premium);
      const collateralAmount = parseFloat(option.collateralAmount || "0");

      // Settlement metrics (kept for reporting)
      let intrinsicValue = 0;
      let payout = 0;
      let profitLoss = 0;

      if (option.type === "CALL") {
        intrinsicValue = Math.max(0, (spot - strikePricePerTon) * quantityTons);
      } else {
        intrinsicValue = Math.max(0, (strikePricePerTon - spot) * quantityTons);
      }

      payout = Math.min(collateralAmount, intrinsicValue);
      profitLoss = payout - (premiumPaid * quantityTons);

      // Identify holder (exerciser) and counterparty
      const holderId = exercisedBy;
      const counterpartyId = option.buyerId === holderId ? option.issuerId : option.buyerId;

      if (!counterpartyId) {
        throw new Error("Option is missing counterparty information");
      }

      // Monetary flow for exercise based on strike
      const costAtStrike = quantityTons * strikePricePerTon; // CROPT amount
      const quantityKg = quantityTons * 1000;
      const strikePricePerKg = strikePricePerTon / 1000;

      // Lock CROPT balances for both parties
      const [holderBalance] = await tx
        .select()
        .from(croptBalances)
        .where(eq(croptBalances.userId, holderId))
        .for('update')
        .limit(1);

      const [counterpartyBalance] = await tx
        .select()
        .from(croptBalances)
        .where(eq(croptBalances.userId, counterpartyId))
        .for('update')
        .limit(1);

      const holderCurrent = holderBalance ? parseFloat(holderBalance.balance) : 0;
      const counterpartyCurrent = counterpartyBalance ? parseFloat(counterpartyBalance.balance) : 0;

      let holderNew = holderCurrent;
      let counterpartyNew = counterpartyCurrent;

      if (option.type === "CALL") {
        // Holder buys underlying at strike: holder pays, counterparty receives
        if (holderCurrent < costAtStrike) {
          const error: any = new Error("Insufficient CROPT balance to exercise option");
          error.statusCode = 400;
          throw error;
        }
        holderNew = holderCurrent - costAtStrike;
        counterpartyNew = counterpartyCurrent + costAtStrike;

        // Create long spot position for holder
        await tx.insert(spotPositions).values({
          userId: holderId,
          commoditySlug: option.commodity,
          quantityKg: quantityKg.toFixed(8),
          avgEntryPrice: strikePricePerKg.toFixed(8),
        });
      } else {
        // PUT: holder sells underlying at strike: counterparty pays, holder receives
        if (counterpartyCurrent < costAtStrike) {
          const error: any = new Error("Counterparty has insufficient CROPT balance for settlement");
          error.statusCode = 400;
          throw error;
        }
        holderNew = holderCurrent + costAtStrike;
        counterpartyNew = counterpartyCurrent - costAtStrike;

        // Create short spot position for holder (negative quantity)
        await tx.insert(spotPositions).values({
          userId: holderId,
          commoditySlug: option.commodity,
          quantityKg: (-quantityKg).toFixed(8),
          avgEntryPrice: strikePricePerKg.toFixed(8),
        });
      }

      // Upsert CROPT balances
      if (holderBalance) {
        await tx
          .update(croptBalances)
          .set({ balance: holderNew.toFixed(8) })
          .where(eq(croptBalances.userId, holderId));
      } else {
        await tx
          .insert(croptBalances)
          .values({ userId: holderId, balance: holderNew.toFixed(8) });
      }

      if (counterpartyBalance) {
        await tx
          .update(croptBalances)
          .set({ balance: counterpartyNew.toFixed(8) })
          .where(eq(croptBalances.userId, counterpartyId));
      } else {
        await tx
          .insert(croptBalances)
          .values({ userId: counterpartyId, balance: counterpartyNew.toFixed(8) });
      }

      // Record settlement for reporting
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

      // Mark option as exercised
      await tx
        .update(options)
        .set({ status: "EXERCISED", lastUpdated: new Date() })
        .where(eq(options.id, optionId));

      // Record transaction describing the cash flow at strike
      await tx
        .insert(transactions)
        .values({
          optionId: option.id,
          type: "PAYOUT",
          fromUserId: option.type === "CALL" ? holderId : counterpartyId,
          toUserId: option.type === "CALL" ? counterpartyId : holderId,
          amount: costAtStrike.toFixed(8),
          description: `Option ${option.type} exercised at strike $${strikePricePerTon} for ${quantityTons} tons`,
        });

      // Record platform fee (kept as 0 placeholder)
      const feeAmount = 0;
      await tx
        .insert(platformFees)
        .values({
          userId: exercisedBy,
          role: null,
          type: 'option_exercise',
          amount: feeAmount.toFixed(8),
          currency: 'CROPT',
          instrument: option.id,
          txId: null,
        });

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
      .set({ ...updates, lastUpdated: new Date() })
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
      .set({ status: newStatus, lastUpdated: new Date() })
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
