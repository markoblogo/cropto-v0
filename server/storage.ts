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
  analyticsEvents,
  appSettings,
  platformFees,
  croptBalances,
  spotPositions,
  partnerOrganizations,
  serviceContracts,
  seaBrokerageEntries,
  seaBrokerageBrokerAuth,
  commodityIndexPrices,
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
  type InsertFeedback,
  type AnalyticsEvent,
  type InsertAnalyticsEvent,
  type AppSetting,
  type PartnerOrganization,
  type InsertPartnerOrganization,
  type ServiceContract,
  type InsertServiceContract,
  type SeaBrokerageEntryRow,
  type InsertSeaBrokerageEntry,
  type SeaBrokerageBrokerAuthRow,
  type InsertSeaBrokerageBrokerAuth,
} from "@shared/schema";
import { db } from "./db";
import { desc, eq, and, lt, or, sql, gte, lte } from "drizzle-orm";
import { serializeOptionToJson } from "./optionJson";
import { MATCHING_FEE_PER_TON, SETTLEMENT_FEE_PER_TON } from "./fees";

let ensuredAppSettingsTable = false;
async function ensureAppSettingsExists(): Promise<void> {
  if (ensuredAppSettingsTable) return;
  try {
    // Fast-path: table exists.
    await db.select({ key: appSettings.key }).from(appSettings).limit(1);
    ensuredAppSettingsTable = true;
    return;
  } catch (err: any) {
    const msg = String(err?.message || "");
    if (!msg.includes('relation "app_settings" does not exist')) throw err;
  }

  // Create a minimal table definition used by app settings / health snapshots.
  await db.execute(
    sql`create table if not exists app_settings (
      key text primary key,
      value text not null,
      updated_at timestamp not null default now()
    )`,
  );
  ensuredAppSettingsTable = true;
}

let ensuredSeaBrokerageSchema = false;
async function ensureSeaBrokerageSchemaSynced(): Promise<void> {
  if (ensuredSeaBrokerageSchema) return;
  try {
    console.log("[DB] Syncing sea_brokerage_entries schema...");
    await db.execute(
      sql`ALTER TABLE sea_brokerage_entries ADD COLUMN IF NOT EXISTS is_market_trade BOOLEAN NOT NULL DEFAULT FALSE`
    );
    ensuredSeaBrokerageSchema = true;
    console.log("[DB] Sea brokerage schema synced successfully");
  } catch (err: any) {
    console.error("[DB] Failed to sync sea brokerage schema:", err.message);
    // Continue anyway as the column might exist but the check failed
    ensuredSeaBrokerageSchema = true;
  }
}

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
  createAnalyticsEvent(event: InsertAnalyticsEvent): Promise<AnalyticsEvent>;
  writeAuditEvent(input: {
    event: string;
    userId: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<AnalyticsEvent>;
  getAppSetting(key: string): Promise<AppSetting | undefined>;
  upsertAppSetting(key: string, value: string): Promise<AppSetting>;
  // Partner Organizations
  getPartnerOrganizations(): Promise<PartnerOrganization[]>;
  getPartnerById(id: string): Promise<PartnerOrganization | undefined>;
  createOrUpdatePartner(partner: InsertPartnerOrganization, id?: string): Promise<PartnerOrganization>;
  // Service Contracts
  getServiceContracts(): Promise<ServiceContract[]>;
  getServiceContractById(id: string): Promise<ServiceContract | undefined>;
  getServiceContractsByPartner(partnerId: string): Promise<ServiceContract[]>;
  createOrUpdateServiceContract(contract: InsertServiceContract, id?: string): Promise<ServiceContract>;
  getPartnerWithContracts(partnerId: string): Promise<{ partner: PartnerOrganization; contracts: ServiceContract[] } | undefined>;
  listSeaBrokerageEntries(): Promise<SeaBrokerageEntryRow[]>;
  createSeaBrokerageEntry(entry: InsertSeaBrokerageEntry): Promise<SeaBrokerageEntryRow>;
  updateSeaBrokerageEntry(id: string, updates: Partial<SeaBrokerageEntryRow>): Promise<SeaBrokerageEntryRow>;
  deleteSeaBrokerageEntry(id: string): Promise<boolean>;
  listSeaBrokerageBrokerAuth(): Promise<SeaBrokerageBrokerAuthRow[]>;
  findSeaBrokerageBrokerAuthByAuthUserId(authUserId: string): Promise<SeaBrokerageBrokerAuthRow | undefined>;
  findSeaBrokerageBrokerAuthByAuthEmail(authEmail: string): Promise<SeaBrokerageBrokerAuthRow | undefined>;
  upsertSeaBrokerageBrokerAuth(entry: InsertSeaBrokerageBrokerAuth): Promise<SeaBrokerageBrokerAuthRow>;
  syncSeaBrokerageSchema(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async listSeaBrokerageBrokerAuth(): Promise<SeaBrokerageBrokerAuthRow[]> {
    return db.select().from(seaBrokerageBrokerAuth).orderBy(desc(seaBrokerageBrokerAuth.updatedAt));
  }

  async findSeaBrokerageBrokerAuthByAuthUserId(
    authUserId: string,
  ): Promise<SeaBrokerageBrokerAuthRow | undefined> {
    const normalized = String(authUserId || "").trim();
    if (!normalized) return undefined;
    const [row] = await db
      .select()
      .from(seaBrokerageBrokerAuth)
      .where(eq(seaBrokerageBrokerAuth.authUserId, normalized))
      .limit(1);
    return row;
  }

  async findSeaBrokerageBrokerAuthByAuthEmail(
    authEmail: string,
  ): Promise<SeaBrokerageBrokerAuthRow | undefined> {
    const normalized = String(authEmail || "").trim().toLowerCase();
    if (!normalized) return undefined;
    const [row] = await db
      .select()
      .from(seaBrokerageBrokerAuth)
      .where(eq(seaBrokerageBrokerAuth.authEmail, normalized))
      .limit(1);
    return row;
  }

  async upsertSeaBrokerageBrokerAuth(
    entry: InsertSeaBrokerageBrokerAuth,
  ): Promise<SeaBrokerageBrokerAuthRow> {
    const normalizedEmail = entry.authEmail?.trim().toLowerCase() || null;
    const normalizedUsername = entry.telegramUsername?.trim().replace(/^@+/, "").toLowerCase() || null;
    const normalizedUserId = entry.authUserId?.trim() || null;
    const normalizedTelegramUserId = entry.telegramUserId?.trim() || null;

    let existing: SeaBrokerageBrokerAuthRow | undefined;
    if (normalizedUserId) {
      existing = await this.findSeaBrokerageBrokerAuthByAuthUserId(normalizedUserId);
    }
    if (!existing && normalizedEmail) {
      existing = await this.findSeaBrokerageBrokerAuthByAuthEmail(normalizedEmail);
    }
    if (!existing && normalizedTelegramUserId) {
      const [byTelegramId] = await db
        .select()
        .from(seaBrokerageBrokerAuth)
        .where(eq(seaBrokerageBrokerAuth.telegramUserId, normalizedTelegramUserId))
        .limit(1);
      existing = byTelegramId;
    }
    if (!existing && normalizedUsername) {
      const [byTelegramUsername] = await db
        .select()
        .from(seaBrokerageBrokerAuth)
        .where(eq(seaBrokerageBrokerAuth.telegramUsername, normalizedUsername))
        .limit(1);
      existing = byTelegramUsername;
    }

    if (existing) {
      const [updated] = await db
        .update(seaBrokerageBrokerAuth)
        .set({
          authUserId: normalizedUserId,
          authEmail: normalizedEmail,
          telegramUserId: normalizedTelegramUserId,
          telegramUsername: normalizedUsername,
          brokerCode: entry.brokerCode,
          brokerName: entry.brokerName,
          companyName: entry.companyName,
          isActive: entry.isActive ?? true,
          updatedAt: new Date(),
        })
        .where(eq(seaBrokerageBrokerAuth.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(seaBrokerageBrokerAuth)
      .values({
        authUserId: normalizedUserId,
        authEmail: normalizedEmail,
        telegramUserId: normalizedTelegramUserId,
        telegramUsername: normalizedUsername,
        brokerCode: entry.brokerCode,
        brokerName: entry.brokerName,
        companyName: entry.companyName,
        isActive: entry.isActive ?? true,
      })
      .returning();
    return created;
  }

  async syncSeaBrokerageSchema(): Promise<void> {
    await ensureSeaBrokerageSchemaSynced();
  }

  async listSeaBrokerageEntries(): Promise<SeaBrokerageEntryRow[]> {
    await ensureSeaBrokerageSchemaSynced();
    return db.select().from(seaBrokerageEntries).orderBy(desc(seaBrokerageEntries.createdAt));
  }

  async createSeaBrokerageEntry(entry: InsertSeaBrokerageEntry): Promise<SeaBrokerageEntryRow> {
    const [created] = await db.insert(seaBrokerageEntries).values(entry).returning();
    return created;
  }

  async updateSeaBrokerageEntry(
    id: string,
    updates: Partial<SeaBrokerageEntryRow>,
  ): Promise<SeaBrokerageEntryRow> {
    const [updated] = await db
      .update(seaBrokerageEntries)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(seaBrokerageEntries.id, id))
      .returning();

    return updated;
  }

  async deleteSeaBrokerageEntry(id: string): Promise<boolean> {
    const deleted = await db
      .delete(seaBrokerageEntries)
      .where(eq(seaBrokerageEntries.id, id))
      .returning({ id: seaBrokerageEntries.id });
    return deleted.length > 0;
  }

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
    try {
      console.log("[STORAGE] createOption called with:", {
        type: insertOption.type,
        strike: insertOption.strike,
        qty: insertOption.qty,
        premium: insertOption.premium,
        indexId: insertOption.indexId,
        commodity: insertOption.commodity,
        issuerId: insertOption.issuerId,
        expirationDate: insertOption.expirationDate,
        expirationDateType: typeof insertOption.expirationDate,
      });
      
      const [option] = await db
        .insert(options)
        .values({
          ...insertOption,
          schemaVersion: insertOption.schemaVersion ?? "v1",
        })
        .returning();

      const contractJson = JSON.stringify(serializeOptionToJson(option as Option));
      const needsUpdate =
        option.contractJson !== contractJson || option.schemaVersion !== "v1";

      if (needsUpdate) {
        const [updated] = await db
          .update(options)
          .set({
            contractJson,
            schemaVersion: "v1",
            lastUpdated: new Date(),
          })
          .where(eq(options.id, option.id))
          .returning();
        console.log("[STORAGE] Option created successfully:", updated.id);
        return updated;
      }

      console.log("[STORAGE] Option created successfully:", option.id);
      return option;
    } catch (error: any) {
      console.error("[STORAGE] Error in createOption:", {
        message: error?.message,
        code: error?.code,
        detail: error?.detail,
        stack: error?.stack,
      });
      throw error;
    }
  }

  async getOptionById(id: string): Promise<Option | undefined> {
    const [option] = await db
      .select()
      .from(options)
      .where(eq(options.id, id));
    return option;
  }

  /**
   * TEMPORARY: simplified portfolio query to avoid missing columns/views.
   * Returns basic option fields only, no joins, no derived columns.
   */
  async getOptionsByUser(userId: string): Promise<Option[]> {
    try {
      const rows = await db
        .select({
          id: options.id,
          title: options.title,
          type: options.type,
          strike: options.strike,
          qty: options.qty,
          premium: options.premium,
          status: options.status,
          commodity: options.commodity,
          expirationDate: options.expirationDate,
          createdAt: options.createdAt,
        })
        .from(options)
        .where(
          or(
            eq(options.buyerId, userId),
            eq(options.issuerId, userId),
            eq(options.buyer, userId),
            eq(options.seller, userId)
          )
        )
        .orderBy(desc(options.createdAt));

      return rows as Option[];
    } catch (error) {
      console.error("getOptionsByUser failed", error);
      throw error;
    }
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

      const qtyTons = parseFloat(option.qty);
      const matchingFee = MATCHING_FEE_PER_TON * qtyTons;

      // Update option with matching details
      const [updatedOption] = await tx
        .update(options)
        .set({
          status: "FILLED",
          counterpartyId: counterpartyId,
          buyerId: counterpartyId, // Counterparty becomes the buyer
          matchedBy: matchedBy,
          matchedAt: new Date(),
          lastUpdated: new Date(),
        })
        .where(eq(options.id, optionId))
        .returning();

      // Record platform fees for both sides (issuer and counterparty)
      const sides = [
        { userId: option.issuerId, role: "issuer" },
        { userId: counterpartyId, role: "counterparty" },
      ].filter((s) => s.userId);

      for (const side of sides) {
        const notionalAmt = (() => {
          const strikeNum = parseFloat(option.strike);
          if (Number.isFinite(strikeNum)) return (strikeNum * qtyTons).toFixed(8);
          return (qtyTons * MATCHING_FEE_PER_TON).toFixed(8);
        })();
        await tx.insert(platformFees).values({
          userId: side.userId!,
          role: side.role,
          type: "matching_fee",
          amount: matchingFee.toFixed(8),
          notionalAmount: notionalAmt,
          currency: "CROPT",
          instrument: option.id,
          instrumentType: "OPTION",
          txId: null,
        });
      }

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

  private async getSSIavg(indexId: string | null, windowStart?: Date | null, windowEnd?: Date | null): Promise<number | null> {
    if (!indexId || !windowStart || !windowEnd) return null;
    const rows = await db
      .select()
      .from(commodityIndexPrices)
      .where(
        and(
          eq(commodityIndexPrices.indexId, indexId),
          gte(commodityIndexPrices.timestamp, windowStart),
          lte(commodityIndexPrices.timestamp, windowEnd)
        )
      );
    if (!rows.length) return null;
    const avg =
      rows.reduce((sum, row) => sum + parseFloat(row.price), 0) / rows.length;
    return avg;
  }

  private async getLatestIndexPrice(indexId: string | null): Promise<number | null> {
    if (!indexId) return null;
    const [row] = await db
      .select()
      .from(commodityIndexPrices)
      .where(eq(commodityIndexPrices.indexId, indexId))
      .orderBy(desc(commodityIndexPrices.timestamp))
      .limit(1);
    return row ? parseFloat(row.price) : null;
  }

  async exerciseOption(optionId: string, exercisedBy: string, spotPrice: string): Promise<Settlement> {
    const demoRelaxCROPTCheck = (process.env.DEMO_RELAX_CROPT_CHECK || "").toLowerCase() === "true";
    
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

      // Compute SSI average over window if available; fallback to provided spot
      let ssiAvg = spot;
      if (option.indexId && option.windowStart && option.windowEnd) {
        const avg = await this.getSSIavg(option.indexId, option.windowStart, option.windowEnd);
        if (avg && Number.isFinite(avg)) {
          ssiAvg = avg;
        } else {
          const latest = await this.getLatestIndexPrice(option.indexId);
          if (latest && Number.isFinite(latest)) {
            console.warn("[EXERCISE] SSIavg not found for window; falling back to latest price", {
              optionId,
              indexId: option.indexId,
              windowStart: option.windowStart?.toISOString?.(),
              windowEnd: option.windowEnd?.toISOString?.(),
              latest,
            });
            ssiAvg = latest;
          } else {
            console.warn("[EXERCISE] SSIavg and latest price missing; using provided spot fallback", {
              optionId,
              indexId: option.indexId,
              windowStart: option.windowStart?.toISOString?.(),
              windowEnd: option.windowEnd?.toISOString?.(),
              spot,
            });
          }
        }
      }

      // Calculate intrinsic value using SSIavg (strike already in $/ton)
      const intrinsicValue = option.type === "CALL"
        ? Math.max(0, (ssiAvg - strikePricePerTon) * quantityTons)
        : Math.max(0, (strikePricePerTon - ssiAvg) * quantityTons);

      // Identify holder (exerciser) and counterparty (seller)
      const holderId = exercisedBy;
      const isHolderBuyer = option.buyerId === holderId;
      const sellerId = isHolderBuyer ? option.issuerId : option.buyerId;

      if (!sellerId) {
        throw new Error("Option is missing seller information");
      }

      // Calculate payout: buyer receives intrinsic value, seller pays it
      const payout = intrinsicValue; // Full intrinsic value is the payout
      const costAtStrike = quantityTons * strikePricePerTon; // CROPT amount for spot position
      const quantityKg = quantityTons * 1000;
      const strikePricePerKg = strikePricePerTon / 1000;

      // Get balances with row locks
      const [holderBalance] = await tx
        .select()
        .from(croptBalances)
        .where(eq(croptBalances.userId, holderId))
        .for('update')
        .limit(1);

      const [sellerBalance] = await tx
        .select()
        .from(croptBalances)
        .where(eq(croptBalances.userId, sellerId))
        .for('update')
        .limit(1);

      const holderCurrent = holderBalance ? parseFloat(holderBalance.balance) : 0;
      const sellerCurrent = sellerBalance ? parseFloat(sellerBalance.balance) : 0;
      
      // NOTE: For demo, we don't track lockedCollateral in DB
      // The collateralAmount on the option is informational only

      // Calculate P&L for buyer and seller
      const totalPremium = premiumPaid * quantityTons;
      const buyerPnL = isHolderBuyer ? (payout - totalPremium) : (-payout - totalPremium);
      const sellerPnL = isHolderBuyer ? (totalPremium - payout) : (totalPremium + payout);

      let holderNew = holderCurrent;
      let sellerNew = sellerCurrent;

      if (option.type === "CALL") {
        // CALL: buyer exercises right to buy at strike
        // Buyer pays strike price, receives underlying
        // Seller receives strike price, delivers underlying
        if (isHolderBuyer) {
          // Buyer exercises: pays strike, receives underlying
          if (holderCurrent < costAtStrike) {
            if (demoRelaxCROPTCheck) {
              console.warn("[EXERCISE_DEMO] Relaxed CROPT check: holder balance insufficient but continuing", {
                holderId,
                holderCurrent,
                costAtStrike,
                optionId,
              });
            } else {
              const error: any = new Error("Insufficient CROPT balance to exercise option");
              error.statusCode = 400;
              throw error;
            }
          }
          holderNew = holderCurrent - costAtStrike;
          sellerNew = sellerCurrent + costAtStrike;

          // Create long spot position for buyer
          await tx.insert(spotPositions).values({
            userId: holderId,
            commoditySlug: option.commodity,
            quantityKg: quantityKg.toFixed(8),
            avgEntryPrice: strikePricePerKg.toFixed(8),
          });
        } else {
          // Seller is exercising (unusual but possible): seller pays, buyer receives
          if (sellerCurrent < costAtStrike) {
            if (demoRelaxCROPTCheck) {
              console.warn("[EXERCISE_DEMO] Relaxed CROPT check: seller balance insufficient but continuing", {
                sellerId,
                sellerCurrent,
                costAtStrike,
                optionId,
              });
            } else {
              const error: any = new Error("Insufficient CROPT balance to exercise option");
              error.statusCode = 400;
              throw error;
            }
          }
          holderNew = holderCurrent + costAtStrike;
          sellerNew = sellerCurrent - costAtStrike;

          // Create short spot position for seller
          await tx.insert(spotPositions).values({
            userId: sellerId,
            commoditySlug: option.commodity,
            quantityKg: (-quantityKg).toFixed(8),
            avgEntryPrice: strikePricePerKg.toFixed(8),
          });
        }
      } else {
        // PUT: buyer exercises right to sell at strike
        // Buyer delivers underlying, receives strike
        // Seller receives underlying, pays strike
        if (isHolderBuyer) {
          // Buyer exercises: delivers underlying, receives strike
          if (sellerCurrent < costAtStrike) {
            if (demoRelaxCROPTCheck) {
              console.warn("[EXERCISE_DEMO] Relaxed CROPT check: seller balance insufficient but continuing", {
                sellerId,
                sellerCurrent,
                costAtStrike,
                optionId,
              });
            } else {
              const error: any = new Error("Counterparty has insufficient CROPT balance for settlement");
              error.statusCode = 400;
              throw error;
            }
          }
          holderNew = holderCurrent + costAtStrike;
          sellerNew = sellerCurrent - costAtStrike;

          // Create short spot position for buyer
          await tx.insert(spotPositions).values({
            userId: holderId,
            commoditySlug: option.commodity,
            quantityKg: (-quantityKg).toFixed(8),
            avgEntryPrice: strikePricePerKg.toFixed(8),
          });
        } else {
          // Seller is exercising: seller delivers, buyer receives
          if (holderCurrent < costAtStrike) {
            if (demoRelaxCROPTCheck) {
              console.warn("[EXERCISE_DEMO] Relaxed CROPT check: holder balance insufficient but continuing", {
                holderId,
                holderCurrent,
                costAtStrike,
                optionId,
              });
            } else {
              const error: any = new Error("Counterparty has insufficient CROPT balance for settlement");
              error.statusCode = 400;
              throw error;
            }
          }
          holderNew = holderCurrent - costAtStrike;
          sellerNew = sellerCurrent + costAtStrike;

          // Create long spot position for seller
          await tx.insert(spotPositions).values({
            userId: sellerId,
            commoditySlug: option.commodity,
            quantityKg: quantityKg.toFixed(8),
            avgEntryPrice: strikePricePerKg.toFixed(8),
          });
        }
      }

      // If payout > 0, transfer from seller's collateral/free balance to buyer
      if (payout > 0) {
        // Payout comes from seller's collateral first, then free balance
        const payoutFromCollateral = Math.min(collateralAmount, payout);
        const payoutFromFree = Math.max(0, payout - payoutFromCollateral);

        if (payoutFromFree > 0 && sellerNew < payoutFromFree) {
          if (demoRelaxCROPTCheck) {
            console.warn("[EXERCISE_DEMO] Relaxed CROPT check: seller balance insufficient for payout but continuing", {
              sellerId,
              sellerNew,
              payoutFromFree,
              optionId,
            });
          } else {
            const error: any = new Error("Seller has insufficient balance to cover payout");
            error.statusCode = 400;
            throw error;
          }
        }

        holderNew += payout;
        sellerNew -= payout;
      }
      // NOTE: For demo, we don't release lockedCollateral back to balance
      // The collateralAmount on the option is informational only

      // Upsert CROPT balances (without lockedCollateral - column doesn't exist in DB)
      if (holderBalance) {
        await tx
          .update(croptBalances)
          .set({ 
            balance: holderNew.toFixed(8),
            updatedAt: new Date(),
          })
          .where(eq(croptBalances.userId, holderId));
      } else {
        await tx
          .insert(croptBalances)
          .values({ 
            userId: holderId, 
            balance: holderNew.toFixed(8),
          });
      }

      if (sellerBalance) {
        await tx
          .update(croptBalances)
          .set({ 
            balance: sellerNew.toFixed(8),
            updatedAt: new Date(),
          })
          .where(eq(croptBalances.userId, sellerId));
      } else {
        await tx
          .insert(croptBalances)
          .values({ 
            userId: sellerId, 
            balance: sellerNew.toFixed(8),
          });
      }

      // Record settlement for reporting
      const settlementFeePerSide = SETTLEMENT_FEE_PER_TON * quantityTons;
      const [settlement] = await tx
        .insert(settlements)
        .values({
          optionId: option.id,
          exercisedBy: exercisedBy,
          spotPrice: ssiAvg.toString(),
          strike: option.strike,
          qty: option.qty,
          payout: payout.toFixed(8),
          profitLoss: (isHolderBuyer ? buyerPnL : sellerPnL).toFixed(8),
        })
        .returning();

      // Mark option as EXERCISED (will be treated as SETTLED in portfolio)
      const contractJson = JSON.stringify(
        serializeOptionToJson({
          ...(option as any),
          settlementDate: option.settlementDate || option.expirationDate || option.windowEnd || option.windowStart || new Date(),
          finalPnl: isHolderBuyer ? buyerPnL : sellerPnL,
          settlementPrice: ssiAvg,
        } as any)
      );

      await tx
        .update(options)
        .set({ 
          status: "EXERCISED",
          lastUpdated: new Date(),
          payoutAccumulated: payout.toFixed(8),
          contractJson,
          schemaVersion: "v1",
        })
        .where(eq(options.id, optionId));

      console.log(`[EXERCISE] Option ${optionId} exercised: payout=${payout.toFixed(2)}, buyerPnL=${buyerPnL.toFixed(2)}, sellerPnL=${sellerPnL.toFixed(2)}, released collateral=${collateralAmount.toFixed(2)}`);

      // Record transaction describing the cash flow at strike
      await tx
        .insert(transactions)
        .values({
          optionId: option.id,
          type: "PAYOUT",
          fromUserId: option.type === "CALL" ? holderId : sellerId,
          toUserId: option.type === "CALL" ? sellerId : holderId,
          amount: costAtStrike.toFixed(8),
          description: `Option ${option.type} exercised at strike $${strikePricePerTon} for ${quantityTons} tons`,
        });

      // Record platform fee (kept as 0 placeholder)
      const feeAmount = 0;
      // Calculate notional amount: quantity_tons * strike_price_usd_per_ton
      // Note: strikePricePerTon and quantityTons are already defined above in this function
      const notionalAmountUsd = strikePricePerTon * quantityTons;
      
      // Defensive check
      if (notionalAmountUsd == null || Number.isNaN(notionalAmountUsd) || notionalAmountUsd < 0) {
        console.error('[EXERCISE_OPTION] Invalid notionalAmount calculated', { 
          strikePricePerTon, 
          quantityTons, 
          notionalAmountUsd,
          optionId: option.id 
        });
        throw new Error('Invalid notional amount calculated for platform fee');
      }
      
      const notionalAmount = notionalAmountUsd.toFixed(8);
      
      // Settlement fee per side (buyer/seller)
      const feeAmountSettlement = settlementFeePerSide;
      const sidesForSettlement = [
        { userId: holderId, role: isHolderBuyer ? "buyer" : "seller" },
        { userId: sellerId, role: isHolderBuyer ? "seller" : "buyer" },
      ];

      for (const side of sidesForSettlement) {
        try {
          await tx
            .insert(platformFees)
            .values({
              userId: side.userId!,
              role: side.role,
              type: 'settlement_fee',
              amount: feeAmountSettlement.toFixed(8),
              notionalAmount: notionalAmount,
              currency: 'CROPT',
              instrument: option.id,
              instrumentType: "OPTION",
              txId: null,
            });
        } catch (err) {
          console.warn("[SETTLEMENT_FEE] Failed to record fee", {
            optionId: option.id,
            userId: side.userId,
            role: side.role,
            fee: feeAmountSettlement,
            error: (err as Error)?.message,
          });
        }
      }

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
      .select({
        id: marginCalls.id,
        optionId: marginCalls.optionId,
        forwardContractId: sql`NULL::varchar`,
        instrumentType: sql`'OPTION'::text`,
        userId: marginCalls.userId,
        amountRequired: marginCalls.amountRequired,
        intrinsicValue: marginCalls.intrinsicValue,
        collateralAmount: marginCalls.collateralAmount,
        reservedCollateral: marginCalls.reservedCollateral,
        status: marginCalls.status,
        deadline: marginCalls.deadline,
        createdAt: marginCalls.createdAt,
        lastUpdated: marginCalls.lastUpdated,
      })
      .from(marginCalls)
      .where(eq(marginCalls.id, id));
    return marginCall as any;
  }

  async listMarginCalls(): Promise<MarginCall[]> {
    const allMarginCalls = await db
      .select({
        id: marginCalls.id,
        optionId: marginCalls.optionId,
        forwardContractId: sql`NULL::varchar`,
        instrumentType: sql`'OPTION'::text`,
        userId: marginCalls.userId,
        amountRequired: marginCalls.amountRequired,
        intrinsicValue: marginCalls.intrinsicValue,
        collateralAmount: marginCalls.collateralAmount,
        reservedCollateral: marginCalls.reservedCollateral,
        status: marginCalls.status,
        deadline: marginCalls.deadline,
        createdAt: marginCalls.createdAt,
        lastUpdated: marginCalls.lastUpdated,
      })
      .from(marginCalls)
      .orderBy(desc(marginCalls.createdAt));
    return allMarginCalls as any;
  }

  async getMarginCallsByUser(userId: string): Promise<MarginCall[]> {
    const userMarginCalls = await db
      .select({
        id: marginCalls.id,
        optionId: marginCalls.optionId,
        forwardContractId: sql`NULL::varchar`,
        instrumentType: sql`'OPTION'::text`,
        userId: marginCalls.userId,
        amountRequired: marginCalls.amountRequired,
        intrinsicValue: marginCalls.intrinsicValue,
        collateralAmount: marginCalls.collateralAmount,
        reservedCollateral: marginCalls.reservedCollateral,
        status: marginCalls.status,
        deadline: marginCalls.deadline,
        createdAt: marginCalls.createdAt,
        lastUpdated: marginCalls.lastUpdated,
      })
      .from(marginCalls)
      .where(eq(marginCalls.userId, userId))
      .orderBy(desc(marginCalls.createdAt));
    return userMarginCalls as any;
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
      .select({
        id: marginCalls.id,
        optionId: marginCalls.optionId,
        forwardContractId: sql`NULL::varchar`,
        instrumentType: sql`'OPTION'::text`,
        userId: marginCalls.userId,
        amountRequired: marginCalls.amountRequired,
        intrinsicValue: marginCalls.intrinsicValue,
        collateralAmount: marginCalls.collateralAmount,
        reservedCollateral: marginCalls.reservedCollateral,
        status: marginCalls.status,
        deadline: marginCalls.deadline,
        createdAt: marginCalls.createdAt,
        lastUpdated: marginCalls.lastUpdated,
      })
      .from(marginCalls)
      .where(
        and(
          lt(marginCalls.deadline, now),
          eq(marginCalls.status, "PENDING")
        )
      )
      .orderBy(desc(marginCalls.createdAt));
    return expiredMarginCalls as any;
  }

  async getExpiredOptions(): Promise<Option[]> {
    // Avoid referencing missing columns in dev environments that lack expiry_window
    if (process.env.NODE_ENV === 'development') {
      return [];
    }

    const now = new Date();
    const expiredOptions = await db
      .select()
      .from(options)
      .where(
        and(
          sql`${options.expirationDate} IS NOT NULL`,
          sql`${options.expirationDate} <= ${now}`,
          or(
            eq(options.status, "OPEN"),
            eq(options.status, "FILLED")
          )
        )
      )
      .orderBy(desc(options.createdAt));
    return expiredOptions;
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

  async createAnalyticsEvent(event: InsertAnalyticsEvent): Promise<AnalyticsEvent> {
    const [created] = await db
      .insert(analyticsEvents)
      .values(event)
      .returning();
    return created;
  }

  async writeAuditEvent(input: {
    event: string;
    userId: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<AnalyticsEvent> {
    return this.createAnalyticsEvent({
      eventName: input.event,
      userId: input.userId ?? undefined,
      payload: input.metadata ? JSON.stringify(input.metadata) : null,
      sessionId: null,
    });
  }

  async getAppSetting(key: string): Promise<AppSetting | undefined> {
    await ensureAppSettingsExists();
    const [setting] = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, key))
      .limit(1);
    return setting;
  }

  async upsertAppSetting(key: string, value: string): Promise<AppSetting> {
    await ensureAppSettingsExists();
    const [setting] = await db
      .insert(appSettings)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value, updatedAt: new Date() },
      })
      .returning();
    return setting;
  }

  // Partner Organizations
  async getPartnerOrganizations(): Promise<PartnerOrganization[]> {
    try {
      return await db
        .select()
        .from(partnerOrganizations)
        .orderBy(desc(partnerOrganizations.createdAt));
    } catch (error: any) {
      // Backward-compatible fallback: older DB schemas may miss fee_share_percent column
      if (String(error?.message || "").includes("fee_share_percent")) {
        const rows = await db
          .select({
            id: partnerOrganizations.id,
            name: partnerOrganizations.name,
            contactEmail: partnerOrganizations.contactEmail,
            relationship: partnerOrganizations.relationship,
            status: partnerOrganizations.status,
            notes: partnerOrganizations.notes,
            createdAt: partnerOrganizations.createdAt,
            updatedAt: partnerOrganizations.updatedAt,
          })
          .from(partnerOrganizations)
          .orderBy(desc(partnerOrganizations.createdAt));

        return rows.map((r) => ({
          ...(r as any),
          feeSharePercent: "0",
        })) as PartnerOrganization[];
      }
      throw error;
    }
  }

  async getPartnerById(id: string): Promise<PartnerOrganization | undefined> {
    try {
      const [partner] = await db
        .select()
        .from(partnerOrganizations)
        .where(eq(partnerOrganizations.id, id))
        .limit(1);
      return partner;
    } catch (error: any) {
      if (String(error?.message || "").includes("fee_share_percent")) {
        const [partner] = await db
          .select({
            id: partnerOrganizations.id,
            name: partnerOrganizations.name,
            contactEmail: partnerOrganizations.contactEmail,
            relationship: partnerOrganizations.relationship,
            status: partnerOrganizations.status,
            notes: partnerOrganizations.notes,
            createdAt: partnerOrganizations.createdAt,
            updatedAt: partnerOrganizations.updatedAt,
          })
          .from(partnerOrganizations)
          .where(eq(partnerOrganizations.id, id))
          .limit(1);
        if (!partner) return undefined;
        return {
          ...(partner as any),
          feeSharePercent: "0",
        } as PartnerOrganization;
      }
      throw error;
    }
  }

  async createOrUpdatePartner(partner: InsertPartnerOrganization, id?: string): Promise<PartnerOrganization> {
    try {
      const normalizedPartner: any = {
        ...partner,
        feeSharePercent:
          typeof (partner as any).feeSharePercent === "number"
            ? String((partner as any).feeSharePercent)
            : (partner as any).feeSharePercent,
      };

      if (id) {
        const [updated] = await db
          .update(partnerOrganizations)
          .set({
            ...normalizedPartner,
            updatedAt: new Date(),
          })
          .where(eq(partnerOrganizations.id, id))
          .returning();
        return updated;
      } else {
        const [created] = await db
          .insert(partnerOrganizations)
          .values(normalizedPartner)
          .returning();
        return created;
      }
    } catch (error: any) {
      // Backward-compatible fallback: omit feeSharePercent if column is missing
      if (String(error?.message || "").includes("fee_share_percent")) {
        const { feeSharePercent: _omit, ...rest } = (partner as any) ?? {};
        if (id) {
          const [updated] = await db
            .update(partnerOrganizations)
            .set({
              ...rest,
              updatedAt: new Date(),
            })
            .where(eq(partnerOrganizations.id, id))
            .returning();
          return {
            ...(updated as any),
            feeSharePercent: "0",
          } as PartnerOrganization;
        } else {
          const [created] = await db
            .insert(partnerOrganizations)
            .values(rest)
            .returning();
          return {
            ...(created as any),
            feeSharePercent: "0",
          } as PartnerOrganization;
        }
      }
      throw error;
    }
  }

  // Service Contracts
  async getServiceContracts(): Promise<ServiceContract[]> {
    return await db
      .select()
      .from(serviceContracts)
      .orderBy(desc(serviceContracts.createdAt));
  }

  async getServiceContractById(id: string): Promise<ServiceContract | undefined> {
    const [contract] = await db
      .select()
      .from(serviceContracts)
      .where(eq(serviceContracts.id, id))
      .limit(1);
    return contract;
  }

  async getServiceContractsByPartner(partnerId: string): Promise<ServiceContract[]> {
    return await db
      .select()
      .from(serviceContracts)
      .where(eq(serviceContracts.partnerId, partnerId))
      .orderBy(desc(serviceContracts.createdAt));
  }

  async createOrUpdateServiceContract(contract: InsertServiceContract, id?: string): Promise<ServiceContract> {
    // Convert valueUsd to string for database
    const contractData = {
      ...contract,
      valueUsd: typeof contract.valueUsd === 'number' ? contract.valueUsd.toFixed(2) : contract.valueUsd,
    };

    if (id) {
      const [updated] = await db
        .update(serviceContracts)
        .set({
          ...contractData,
          updatedAt: new Date(),
        })
        .where(eq(serviceContracts.id, id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(serviceContracts)
        .values(contractData)
        .returning();
      return created;
    }
  }

  async getPartnerWithContracts(partnerId: string): Promise<{ partner: PartnerOrganization; contracts: ServiceContract[] } | undefined> {
    const partner = await this.getPartnerById(partnerId);
    if (!partner) {
      return undefined;
    }
    const contracts = await this.getServiceContractsByPartner(partnerId);
    return { partner, contracts };
  }
}

export const storage = new DatabaseStorage();
