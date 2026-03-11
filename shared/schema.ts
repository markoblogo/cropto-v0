import { sql } from "drizzle-orm";
import { pgTable, text, varchar, decimal, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const optionCommodityEnum = [
  "CORN_EXPORT",
  "WHEAT_11_5_EXPORT",
  "WHEAT_FEED_EXPORT",
  "SOY_GMO_EXPORT",
  "SUNFLOWER_PROCESSING",
] as const;

export const indexes = pgTable("indexes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  category: text("category").notNull(),
  hasVat: text("has_vat", { enum: ["true", "false"] }).notNull().default("false"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

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
  commodity: text("commodity", { enum: optionCommodityEnum }),
  indexId: varchar("index_id").references(() => indexes.id),
  expirationDate: timestamp("expiration_date"),
  expiryWindow: text("expiry_window").notNull().default(""),
  windowStart: timestamp("window_start"),
  windowEnd: timestamp("window_end"),
  settlementDate: timestamp("settlement_date"),
  buyerId: text("buyer_id"),
  issuerId: text("issuer_id"),
  longSide: text("long_side"),
  shortSide: text("short_side"),
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
  usePremiumAsMargin: boolean("use_premium_as_margin").notNull().default(false),
  initialMargin: decimal("initial_margin", { precision: 18, scale: 8 }),
  marginBalance: decimal("margin_balance", { precision: 18, scale: 8 }),
  floatingLoss: decimal("floating_loss", { precision: 18, scale: 8 }),
  isInMarginCall: boolean("is_in_margin_call").notNull().default(false),
  marginCallTimestamp: timestamp("margin_call_timestamp"),
  marginCallDeadline: timestamp("margin_call_deadline"),
  contractJson: text("contract_json"),
  schemaVersion: text("schema_version"),
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
  optionId: varchar("option_id").references(() => options.id),
  forwardContractId: varchar("forward_contract_id").references(() => forwardContracts.id),
  instrumentType: text("instrument_type", { enum: ["OPTION", "FORWARD"] }).default("OPTION"),
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
  onchainTxHash: text("onchain_tx_hash"),
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

export const analyticsEvents = pgTable("analytics_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventName: text("event_name").notNull(),
  userId: text("user_id"),
  sessionId: text("session_id"),
  payload: text("payload"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const macroPredictionMarkets = pgTable("macro_prediction_markets", {
  id: text("id").primaryKey(),
  source: text("source").notNull(), // kalshi | polymarket
  marketType: text("market_type").notNull().default("binary"),
  question: text("question").notNull(),
  description: text("description"),
  category: text("category").notNull().default("other"),
  tags: text("tags"), // JSON array string
  region: text("region").notNull().default("GLOBAL"),
  impliedProbability: decimal("implied_probability", { precision: 10, scale: 6 }),
  yesPrice: decimal("yes_price", { precision: 10, scale: 6 }),
  noPrice: decimal("no_price", { precision: 10, scale: 6 }),
  volume24h: decimal("volume_24h", { precision: 20, scale: 4 }),
  openInterest: decimal("open_interest", { precision: 20, scale: 4 }),
  liquidityScore: decimal("liquidity_score", { precision: 10, scale: 6 }),
  orderbookSpreadBps: decimal("orderbook_spread_bps", { precision: 10, scale: 2 }),
  qualityScore: decimal("quality_score", { precision: 10, scale: 6 }),
  rawOutcomes: text("raw_outcomes"), // JSON outcomes snapshot
  status: text("status").notNull().default("open"),
  closeTime: timestamp("close_time"),
  resolveTime: timestamp("resolve_time"),
  raw: text("raw"),
  scrapedAt: timestamp("scraped_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const macroRiskTimeseries = pgTable("macro_risk_timeseries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ts: timestamp("ts").notNull().defaultNow(),
  source: text("source").notNull().default("prediction_markets"),
  indexName: text("index_name").notNull(),
  region: text("region").notNull().default("GLOBAL"),
  value: decimal("value", { precision: 10, scale: 6 }).notNull(),
  details: text("details"), // JSON object string
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const cgoWeights = pgTable("cgo_weights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  year: integer("year").notNull(),
  region: text("region").notNull().default("GLOBAL"),
  commodity: text("commodity").notNull(),
  weight: decimal("weight", { precision: 12, scale: 8 }).notNull(),
  source: text("source").notNull().default("seed"),
  meta: text("meta"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const agroCompositeTimeseries = pgTable("agro_composite_timeseries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ts: timestamp("ts").notNull().defaultNow(),
  source: text("source").notNull().default("agro_expectations"),
  indexName: text("index_name").notNull(),
  region: text("region").notNull().default("GLOBAL"),
  value: decimal("value", { precision: 14, scale: 6 }).notNull(),
  details: text("details"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const binanceMarketSnapshot = pgTable("binance_market_snapshot", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ts: timestamp("ts").notNull().defaultNow(),
  venue: text("venue").notNull().default("binance"),
  symbol: text("symbol").notNull(),
  assetType: text("asset_type").notNull(),
  underlying: text("underlying"),
  price: decimal("price", { precision: 20, scale: 8 }),
  priceChange24hPct: decimal("price_change_24h_pct", { precision: 12, scale: 6 }),
  volume24h: decimal("volume_24h", { precision: 24, scale: 8 }),
  openInterest: decimal("open_interest", { precision: 24, scale: 8 }),
  impliedVolatility: decimal("implied_volatility", { precision: 12, scale: 6 }),
  source: text("source").notNull(),
  status: text("status").notNull().default("INDICATIVE"),
  extra: text("extra"),
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
  // IGC-specific fields
  country: text("country"),
  label: text("label"),
  asOfDate: timestamp("as_of_date"),
  dailyChangePct: decimal("daily_change_pct", { precision: 10, scale: 4 }),
  annualChangePct: decimal("annual_change_pct", { precision: 10, scale: 4 }),
  low52w: decimal("low_52w", { precision: 18, scale: 8 }),
  high52w: decimal("high_52w", { precision: 18, scale: 8 }),
  rawRow: text("raw_row"), // JSONB in DB, stored as text/JSON string in Drizzle
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const marketPrices = pgTable("market_prices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  market: text("market").notNull(), // US | AR | BR
  commodity: text("commodity").notNull(),
  category: text("category").notNull().default("other"), // grain | oilseed | other
  variant: text("variant"),
  rawCommodity: text("raw_commodity"),
  basis: text("basis"),
  unit: text("unit").notNull(), // canonical unit: USD/t
  price: decimal("price", { precision: 18, scale: 8 }).notNull(),
  priceUsdPerTon: decimal("price_usd_per_ton", { precision: 18, scale: 8 }),
  priceRaw: decimal("price_raw", { precision: 18, scale: 8 }),
  rawUnit: text("raw_unit"),
  rawCurrency: text("raw_currency"),
  rawToUsdFxRate: decimal("raw_to_usd_fx_rate", { precision: 20, scale: 10 }),
  conversionNotes: text("conversion_notes"),
  asOf: timestamp("as_of").notNull(),
  fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
  provider: text("provider").notNull(),
  channel: text("channel").notNull().default("HTML_PAGE"),
  sourceUrl: text("source_url").notNull(),
  sourceLayer: text("source_layer").notNull().default("primary"), // primary | fallback
  confidence: decimal("confidence", { precision: 5, scale: 4 }),
  freshnessStatus: text("freshness_status").notNull().default("fresh"), // fresh | stale | failed
  needsReview: text("needs_review", { enum: ["true", "false"] }).notNull().default("false"),
  rawMeta: text("raw_meta"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const marketPriceFetchLog = pgTable("market_price_fetch_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  provider: text("provider").notNull(),
  channel: text("channel").notNull().default("HTML_PAGE"),
  market: text("market").notNull(),
  commodity: text("commodity").notNull(),
  sourceUrl: text("source_url").notNull(),
  sourceLayer: text("source_layer").notNull().default("primary"),
  status: text("status").notNull(), // ok | failed
  statusCode: integer("status_code"),
  latencyMs: integer("latency_ms"),
  pointCount: integer("point_count").notNull().default(0),
  confidence: decimal("confidence", { precision: 5, scale: 4 }),
  asOf: timestamp("as_of"),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const marketPriceSourceStatus = pgTable("market_price_source_status", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  provider: text("provider").notNull(),
  channel: text("channel").notNull().default("HTML_PAGE"),
  market: text("market").notNull(),
  commodity: text("commodity").notNull(),
  sourceLayer: text("source_layer").notNull().default("primary"),
  sourceUrl: text("source_url").notNull(),
  freshnessStatus: text("freshness_status").notNull().default("failed"), // fresh | stale | failed
  lastFetchedAt: timestamp("last_fetched_at"),
  lastSuccessAt: timestamp("last_success_at"),
  lastAsOf: timestamp("last_as_of"),
  lastLatencyMs: integer("last_latency_ms"),
  confidence: decimal("confidence", { precision: 5, scale: 4 }),
  lastError: text("last_error"),
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

export const spotPositions = pgTable("spot_positions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  commoditySlug: text("commodity_slug").notNull(),
  quantityKg: decimal("quantity_kg", { precision: 18, scale: 8 }).notNull(),
  avgEntryPrice: decimal("avg_entry_price", { precision: 18, scale: 8 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const croptBalances = pgTable("cropt_balances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull().unique(),
  balance: decimal("balance", { precision: 18, scale: 8 }).notNull().default("0"),
  // Note: locked_collateral column may not exist in DB yet (migration 003)
  // For now, lockedCollateral is computed from options, not stored in DB
  // lockedCollateral: decimal("locked_collateral", { precision: 18, scale: 8 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const platformFees = pgTable("platform_fees", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  // Note: role column may not exist in DB (migration 002 not applied yet)
  // When inserting, omit role if column doesn't exist - code handles this gracefully
  role: text("role"), // Optional - nullable, may not exist in older DB schemas
  // Note: DB column is named "fee_type" but we use "type" in code for consistency
  // Map TypeScript field "type" to DB column "fee_type"
  type: text("fee_type", { enum: ["matching_fee", "settlement_fee", "exercise_fee"] }).notNull().$type<
    "matching_fee" | "settlement_fee" | "exercise_fee"
  >(),
  amount: decimal("amount", { precision: 18, scale: 8 }).notNull().default("0"),
  notionalAmount: decimal("notional_amount", { precision: 18, scale: 8 }).notNull(),
  currency: text("currency").notNull().default("CROPT"),
  instrument: text("instrument"),
  instrumentType: text("instrument_type", { enum: ["OPTION", "FORWARD"] }).default("OPTION"),
  txId: text("tx_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Forward orders
export const forwardOrders = pgTable("forward_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  side: text("side", { enum: ["BUY", "SELL"] }).notNull(),
  indexId: varchar("index_id").references(() => indexes.id),
  commodity: text("commodity"),
  price: decimal("price", { precision: 18, scale: 8 }).notNull(),
  qtyTon: decimal("qty_ton", { precision: 18, scale: 8 }).notNull(),
  window: text("window"),
  windowStart: timestamp("window_start"),
  windowEnd: timestamp("window_end"),
  settlementDate: timestamp("settlement_date"),
  status: text("status", {
    enum: ["OPEN", "PARTIALLY_FILLED", "FILLED", "CANCELLED", "EXPIRED"],
  }).notNull().default("OPEN"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Forward contracts
export const forwardContracts = pgTable("forward_contracts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  buyOrderId: varchar("buy_order_id").references(() => forwardOrders.id),
  sellOrderId: varchar("sell_order_id").references(() => forwardOrders.id),
  indexId: varchar("index_id").references(() => indexes.id),
  commodity: text("commodity"),
  contractPrice: decimal("contract_price", { precision: 18, scale: 8 }).notNull(),
  qtyTon: decimal("qty_ton", { precision: 18, scale: 8 }).notNull(),
  window: text("window"),
  windowStart: timestamp("window_start"),
  windowEnd: timestamp("window_end"),
  settlementDate: timestamp("settlement_date"),
  longUserId: text("long_user_id"),
  shortUserId: text("short_user_id"),
  initialMargin: decimal("initial_margin", { precision: 18, scale: 8 }),
  status: text("status", {
    enum: ["ACTIVE", "MARGIN_CALL", "SETTLED", "LIQUIDATED", "DEFAULTED", "CANCELLED"],
  }).notNull().default("ACTIVE"),
  contractHash: text("contract_hash"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Forward settlements
export const forwardSettlements = pgTable("forward_settlements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  forwardContractId: varchar("forward_contract_id").notNull().references(() => forwardContracts.id),
  settlementPrice: decimal("settlement_price", { precision: 18, scale: 8 }).notNull(),
  contractPrice: decimal("contract_price", { precision: 18, scale: 8 }).notNull(),
  qtyTon: decimal("qty_ton", { precision: 18, scale: 8 }).notNull(),
  pnlLong: decimal("pnl_long", { precision: 18, scale: 8 }).notNull(),
  pnlShort: decimal("pnl_short", { precision: 18, scale: 8 }).notNull(),
  feesTotal: decimal("fees_total", { precision: 18, scale: 8 }).default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Forward spreads (analytics/demo)
export const forwardSpreads = pgTable("forward_spreads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  spreadType: text("spread_type", { enum: ["CALENDAR", "CROSS_COMMODITY"] }).notNull(),
  leg1IndexId: varchar("leg1_index_id").references(() => indexes.id),
  leg2IndexId: varchar("leg2_index_id").references(() => indexes.id),
  leg1Window: text("leg1_window"),
  leg2Window: text("leg2_window"),
  spreadPrice: decimal("spread_price", { precision: 18, scale: 8 }).notNull(),
  baseContractId: varchar("base_contract_id").references(() => forwardContracts.id),
  hedgeContractId: varchar("hedge_contract_id").references(() => forwardContracts.id),
  status: text("status", { enum: ["OPEN", "CANCELLED"] }).notNull().default("OPEN"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const partnerOrganizations = pgTable("partner_organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  contactEmail: text("contact_email").notNull(),
  relationship: text("relationship", { 
    enum: ["prime_broker", "custody", "liquidity_provider", "security_auditor", "other"] 
  }).notNull(),
  status: text("status", { enum: ["active", "pending", "inactive"] }).notNull().default("pending"),
  notes: text("notes"),
  feeSharePercent: decimal("fee_share_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const serviceContracts = pgTable("service_contracts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  partnerId: varchar("partner_id").notNull().references(() => partnerOrganizations.id),
  contractCode: text("contract_code").notNull().unique(),
  valueUsd: decimal("value_usd", { precision: 18, scale: 2 }).notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  status: text("status", { enum: ["active", "pending", "completed", "terminated"] }).notNull().default("pending"),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Waitlist signups (early-access)
export const waitlistSignups = pgTable("waitlist_signups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  userId: text("user_id"),
  name: text("name").notNull(),
  email: text("email").notNull(),
  country: text("country").notNull(),
  // Allowed: "trader" | "broker" | "farmer" | "other"
  role: text("role").notNull(),
  company: text("company").notNull(),
  linkedinUrl: text("linkedin_url"),
  websiteUrl: text("website_url"),
  source: text("source").notNull().default("hero"),
  verificationToken: text("verification_token"),
  verifiedAt: timestamp("verified_at"),
});

export const insertOptionSchema = createInsertSchema(options).omit({
  id: true,
  createdAt: true,
  lastUpdated: true,
}).extend({
  indexId: z.string().min(1, "Please select a commodity"),
  expirationDate: z.coerce.date({
    required_error: "Expiration date is required",
    invalid_type_error: "Invalid date format",
  }),
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
  commodity: z.enum(optionCommodityEnum).optional(),
  expiryWindow: z.string().optional(),
  windowStart: z.coerce.date().optional(),
  windowEnd: z.coerce.date().optional(),
  settlementDate: z.coerce.date().optional(),
  longSide: z.string().optional(),
  shortSide: z.string().optional(),
  contractJson: z.string().optional(),
  schemaVersion: z.string().optional(),
  usePremiumAsMargin: z.boolean().optional(),
  initialMargin: z.coerce.number().optional().transform((val) => val?.toString()),
  marginBalance: z.coerce.number().optional().transform((val) => val?.toString()),
  floatingLoss: z.coerce.number().optional().transform((val) => val?.toString()),
  isInMarginCall: z.boolean().optional(),
  marginCallTimestamp: z.coerce.date().optional(),
  marginCallDeadline: z.coerce.date().optional(),
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

export const insertAnalyticsEventSchema = createInsertSchema(analyticsEvents).omit({
  id: true,
  createdAt: true,
});

export const upsertAppSettingSchema = createInsertSchema(appSettings).omit({
  updatedAt: true,
});

export const insertIndexPriceSchema = createInsertSchema(indexPrices).omit({
  id: true,
  createdAt: true,
});

export const upsertMacroPredictionMarketSchema = createInsertSchema(macroPredictionMarkets).omit({
  updatedAt: true,
});

export const insertMacroRiskTimeseriesSchema = createInsertSchema(macroRiskTimeseries).omit({
  id: true,
  createdAt: true,
});

export const insertMarketPriceSchema = createInsertSchema(marketPrices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMarketPriceFetchLogSchema = createInsertSchema(marketPriceFetchLog).omit({
  id: true,
  createdAt: true,
});

export const upsertMarketPriceSourceStatusSchema = createInsertSchema(marketPriceSourceStatus).omit({
  id: true,
  updatedAt: true,
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

export const insertSpotPositionSchema = createInsertSchema(spotPositions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCroptBalanceSchema = createInsertSchema(croptBalances).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPlatformFeeSchema = createInsertSchema(platformFees)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    amount: z.coerce.number().transform((val) => val.toString()),
    notionalAmount: z.coerce.number().transform((val) => val.toString()),
  });

export const insertForwardOrderSchema = createInsertSchema(forwardOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  expiryHalf: z.enum(["H1", "H2"]).optional(),
  expiryMonth: z.coerce.number().min(1).max(12).optional(),
  expiryYear: z.coerce.number().min(2024).optional(),
});

export const insertForwardContractSchema = createInsertSchema(forwardContracts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertForwardSettlementSchema = createInsertSchema(forwardSettlements).omit({
  id: true,
  createdAt: true,
});

export const insertForwardSpreadSchema = createInsertSchema(forwardSpreads).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
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
export type InsertAnalyticsEvent = z.infer<typeof insertAnalyticsEventSchema>;
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type AppSetting = typeof appSettings.$inferSelect;
export type MacroPredictionMarket = typeof macroPredictionMarkets.$inferSelect;
export type UpsertMacroPredictionMarket = z.infer<typeof upsertMacroPredictionMarketSchema>;
export type MacroRiskTimeseries = typeof macroRiskTimeseries.$inferSelect;
export type InsertMacroRiskTimeseries = z.infer<typeof insertMacroRiskTimeseriesSchema>;
export type InsertIndexPrice = z.infer<typeof insertIndexPriceSchema>;
export type IndexPrice = typeof indexPrices.$inferSelect;
export type InsertMarketPrice = z.infer<typeof insertMarketPriceSchema>;
export type MarketPrice = typeof marketPrices.$inferSelect;
export type InsertMarketPriceFetchLog = z.infer<typeof insertMarketPriceFetchLogSchema>;
export type MarketPriceFetchLog = typeof marketPriceFetchLog.$inferSelect;
export type UpsertMarketPriceSourceStatus = z.infer<typeof upsertMarketPriceSourceStatusSchema>;
export type MarketPriceSourceStatus = typeof marketPriceSourceStatus.$inferSelect;
export type InsertIndex = z.infer<typeof insertIndexSchema>;
export type Index = typeof indexes.$inferSelect;
export type InsertCommodityIndexPrice = z.infer<typeof insertCommodityIndexPriceSchema>;
export type CommodityIndexPrice = typeof commodityIndexPrices.$inferSelect;
export type InsertOnchainTransaction = z.infer<typeof insertOnchainTransactionSchema>;
export type OnchainTransaction = typeof onchainTransactions.$inferSelect;
export type InsertNonce = z.infer<typeof insertNonceSchema>;
export type Nonce = typeof nonces.$inferSelect;
export type InsertSpotPosition = z.infer<typeof insertSpotPositionSchema>;
export type SpotPosition = typeof spotPositions.$inferSelect;
export type InsertCroptBalance = z.infer<typeof insertCroptBalanceSchema>;
export type CroptBalance = typeof croptBalances.$inferSelect;
export type InsertPlatformFee = z.infer<typeof insertPlatformFeeSchema>;
export type PlatformFee = typeof platformFees.$inferSelect;
export type InsertForwardOrder = z.infer<typeof insertForwardOrderSchema>;
export type ForwardOrder = typeof forwardOrders.$inferSelect;
export type InsertForwardContract = z.infer<typeof insertForwardContractSchema>;
export type ForwardContract = typeof forwardContracts.$inferSelect;
export type InsertForwardSettlement = z.infer<typeof insertForwardSettlementSchema>;
export type ForwardSettlement = typeof forwardSettlements.$inferSelect;
export type InsertForwardSpread = z.infer<typeof insertForwardSpreadSchema>;
export type ForwardSpread = typeof forwardSpreads.$inferSelect;

// Partner Organizations schemas
export const insertPartnerOrganizationSchema = createInsertSchema(partnerOrganizations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  feeSharePercent: z.coerce.number().min(0).max(100).optional(),
});

export const updatePartnerOrganizationSchema = insertPartnerOrganizationSchema.partial();

export type InsertPartnerOrganization = z.infer<typeof insertPartnerOrganizationSchema>;
export type PartnerOrganization = typeof partnerOrganizations.$inferSelect;

// Service Contracts schemas
export const insertServiceContractSchema = createInsertSchema(serviceContracts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  valueUsd: z.coerce.number().positive(),
});

export const updateServiceContractSchema = insertServiceContractSchema.partial();

export type InsertServiceContract = z.infer<typeof insertServiceContractSchema>;
export type ServiceContract = typeof serviceContracts.$inferSelect;

export interface HealthUpdateResponse {
  lastSync: string; // ISO timestamp from server
  options: Option[];
  marginCalls: MarginCall[];
  transactions: Transaction[];
}
