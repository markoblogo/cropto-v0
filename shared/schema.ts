import { sql } from "drizzle-orm";
import { pgTable, text, varchar, decimal, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const options = pgTable("options", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  type: text("type", { enum: ["CALL", "PUT"] }).notNull(),
  strike: decimal("strike", { precision: 18, scale: 8 }).notNull(),
  qty: decimal("qty", { precision: 18, scale: 8 }).notNull(),
  premium: decimal("premium", { precision: 18, scale: 8 }).notNull(),
  buyer: text("buyer"),
  seller: text("seller"),
  status: text("status", { enum: ["OPEN", "FILLED", "EXPIRED", "CANCELLED", "EXERCISED", "DEFAULTED", "MARGIN_CALL"] }).notNull().default("OPEN"),
  commodity: text("commodity"),
  buyerId: text("buyer_id"),
  issuerId: text("issuer_id"),
  collateralAmount: decimal("collateral_amount", { precision: 18, scale: 8 }),
  lastIntrinsic: decimal("last_intrinsic", { precision: 18, scale: 8 }),
  payoutAccumulated: decimal("payout_accumulated", { precision: 18, scale: 8 }).default("0"),
  isDemo: text("is_demo", { enum: ["true", "false"] }).default("false"),
  // NFT columns
  nftTokenId: integer("nft_token_id"),
  nftMintTx: text("nft_mint_tx"),
  nftStatus: text("nft_status", { enum: ["NOT_MINTED", "MINTING", "MINTED", "FAILED"] }),
  // Matching engine columns
  matchedBy: text("matched_by"),
  matchedAt: timestamp("matched_at"),
  counterpartyId: text("counterparty_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastUpdated: timestamp("last_updated").notNull().defaultNow(),
});

export const trades = pgTable("trades", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  optionId: varchar("option_id").notNull().references(() => options.id),
  buyer: text("buyer").notNull(),
  seller: text("seller").notNull(),
  strike: decimal("strike", { precision: 18, scale: 8 }).notNull(),
  qty: decimal("qty", { precision: 18, scale: 8 }).notNull(),
  premium: decimal("premium", { precision: 18, scale: 8 }).notNull(),
  totalValue: decimal("total_value", { precision: 18, scale: 8 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const settlements = pgTable("settlements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  optionId: varchar("option_id").notNull().references(() => options.id),
  exercisedBy: text("exercised_by").notNull(),
  spotPrice: decimal("spot_price", { precision: 18, scale: 8 }).notNull(),
  strike: decimal("strike", { precision: 18, scale: 8 }).notNull(),
  qty: decimal("qty", { precision: 18, scale: 8 }).notNull(),
  payout: decimal("payout", { precision: 18, scale: 8 }).notNull(),
  profitLoss: decimal("profit_loss", { precision: 18, scale: 8 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const wallets = pgTable("wallets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  address: text("address").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const marginCalls = pgTable("margin_calls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  optionId: varchar("option_id").notNull().references(() => options.id),
  userId: text("user_id").notNull(),
  amountRequired: decimal("amount_required", { precision: 18, scale: 8 }).notNull(),
  intrinsicValue: decimal("intrinsic_value", { precision: 18, scale: 8 }).notNull(),
  collateralAmount: decimal("collateral_amount", { precision: 18, scale: 8 }).notNull(),
  reservedCollateral: decimal("reserved_collateral", { precision: 18, scale: 8 }).notNull().default("0"),
  status: text("status", { enum: ["PENDING", "RESOLVED", "LIQUIDATED"] }).notNull().default("PENDING"),
  deadline: timestamp("deadline"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastUpdated: timestamp("last_updated").notNull().defaultNow(),
});

export const transactions = pgTable("transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  optionId: varchar("option_id").notNull().references(() => options.id),
  type: text("type", { enum: ["FORCE_SETTLE", "COLLATERAL_DEDUCTION", "PAYOUT"] }).notNull(),
  fromUserId: text("from_user_id"),
  toUserId: text("to_user_id"),
  amount: decimal("amount", { precision: 18, scale: 8 }).notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastUpdated: timestamp("last_updated").notNull().defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  type: text("type", { enum: ["MARGIN_CALL", "OPTION_MATCHED", "OPTION_EXERCISED", "LIQUIDATION", "FORCE_SETTLE"] }).notNull(),
  message: text("message").notNull(),
  relatedId: text("related_id"),
  read: text("read", { enum: ["true", "false"] }).notNull().default("false"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const feedback = pgTable("feedback", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull(),
  message: text("message").notNull(),
  screenshotUrl: text("screenshot_url"),
  status: text("status", { enum: ["open", "resolved"] }).notNull().default("open"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const indexPrices = pgTable("index_prices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  commodity: text("commodity").notNull(),
  price: decimal("price", { precision: 18, scale: 8 }).notNull(),
  date: timestamp("date").notNull().defaultNow(),
  source: text("source").default("manual"),
  raw: text("raw"),
  meta: text("meta"),
  messageId: text("message_id"),
  isDemo: text("is_demo", { enum: ["true", "false"] }).default("false"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const indexes = pgTable("indexes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  category: text("category").notNull(),
  hasVat: text("has_vat", { enum: ["true", "false"] }).notNull().default("false"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const commodityIndexPrices = pgTable("commodity_index_prices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  indexId: varchar("index_id").notNull().references(() => indexes.id),
  price: decimal("price", { precision: 18, scale: 8 }).notNull(),
  delta: decimal("delta", { precision: 18, scale: 8 }),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const onchainTransactions = pgTable("onchain_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  optionId: varchar("option_id").references(() => options.id),
  userId: text("user_id").notNull(),
  type: text("type", { enum: ["MINT", "WITHDRAW"] }).notNull(),
  toAddress: text("to_address").notNull(),
  amount: decimal("amount", { precision: 18, scale: 8 }).notNull(),
  txHash: text("tx_hash"),
  status: text("status", { enum: ["PENDING", "CONFIRMED", "FAILED"] }).notNull().default("PENDING"),
  blockNumber: integer("block_number"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  confirmedAt: timestamp("confirmed_at"),
});

export const nonces = pgTable("nonces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: text("wallet_address").notNull().unique(),
  nonce: text("nonce").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertOptionSchema = createInsertSchema(options).omit({
  id: true,
  createdAt: true,
  lastUpdated: true,
}).extend({
  strike: z.coerce.number()
    .positive("Strike price must be positive")
    .min(0.00000001, "Strike price must be greater than 0")
    .transform(val => val.toString()),
  qty: z.coerce.number()
    .positive("Quantity must be positive")
    .min(0.00000001, "Quantity must be greater than 0")
    .transform(val => val.toString()),
  premium: z.coerce.number()
    .positive("Premium must be positive")
    .min(0.00000001, "Premium must be greater than 0")
    .transform(val => val.toString()),
  collateralAmount: z.coerce.number()
    .positive("Collateral amount must be positive")
    .optional()
    .transform(val => val ? val.toString() : undefined),
});

export const insertTradeSchema = createInsertSchema(trades).omit({
  id: true,
  createdAt: true,
});

export const insertSettlementSchema = createInsertSchema(settlements).omit({
  id: true,
  createdAt: true,
});

export const insertWalletSchema = createInsertSchema(wallets).omit({
  id: true,
  createdAt: true,
});

export const insertMarginCallSchema = createInsertSchema(marginCalls).omit({
  id: true,
  createdAt: true,
  lastUpdated: true,
  status: true,
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  id: true,
  createdAt: true,
  lastUpdated: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
  read: true,
});

export const insertFeedbackSchema = createInsertSchema(feedback).omit({
  id: true,
  createdAt: true,
  status: true,
});

export const insertIndexPriceSchema = createInsertSchema(indexPrices).omit({
  id: true,
  createdAt: true,
});

export const insertIndexSchema = createInsertSchema(indexes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCommodityIndexPriceSchema = createInsertSchema(commodityIndexPrices).omit({
  id: true,
  timestamp: true,
});

export const insertOnchainTransactionSchema = createInsertSchema(onchainTransactions).omit({
  id: true,
  createdAt: true,
  status: true,
  confirmedAt: true,
});

export const insertNonceSchema = createInsertSchema(nonces).omit({
  id: true,
  createdAt: true,
});

export type InsertOption = z.infer<typeof insertOptionSchema>;
export type Option = typeof options.$inferSelect;
export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type Trade = typeof trades.$inferSelect;
export type InsertSettlement = z.infer<typeof insertSettlementSchema>;
export type Settlement = typeof settlements.$inferSelect;
export type InsertWallet = z.infer<typeof insertWalletSchema>;
export type Wallet = typeof wallets.$inferSelect;
export type InsertMarginCall = z.infer<typeof insertMarginCallSchema>;
export type MarginCall = typeof marginCalls.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactions.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;
export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;
export type Feedback = typeof feedback.$inferSelect;
export type InsertIndexPrice = z.infer<typeof insertIndexPriceSchema>;
export type IndexPrice = typeof indexPrices.$inferSelect;
export type InsertIndex = z.infer<typeof insertIndexSchema>;
export type Index = typeof indexes.$inferSelect;
export type InsertCommodityIndexPrice = z.infer<typeof insertCommodityIndexPriceSchema>;
export type CommodityIndexPrice = typeof commodityIndexPrices.$inferSelect;
export type InsertOnchainTransaction = z.infer<typeof insertOnchainTransactionSchema>;
export type OnchainTransaction = typeof onchainTransactions.$inferSelect;
export type InsertNonce = z.infer<typeof insertNonceSchema>;
export type Nonce = typeof nonces.$inferSelect;

export interface HealthUpdateResponse {
  lastSync: string; // ISO timestamp from server
  options: Option[];
  marginCalls: MarginCall[];
  transactions: Transaction[];
}
