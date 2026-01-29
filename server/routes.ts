import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { insertOptionSchema, insertFeedbackSchema, options, trades, settlements, indexPrices, marginCalls, transactions, indexes, commodityIndexPrices, insertCommodityIndexPriceSchema, platformFees, croptBalances, partnerOrganizations, serviceContracts, waitlistSignups, insertPartnerOrganizationSchema, insertServiceContractSchema, spotPositions, forwardOrders, forwardContracts, forwardSettlements, forwardSpreads, insertForwardOrderSchema, insertForwardSpreadSchema, type HealthUpdateResponse } from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import { z } from "zod";
import { eq, desc, gt, and, or, sql, asc, gte, lte } from "drizzle-orm";
import authRoutes from "./authRoutes";
import walletRoutes from "./walletRoutes";
import { registerOnchainRoutes } from "./onchainRoutes";
import { registerSpotRoutes } from "./spotRoutes";
import { startTransactionPoller } from "./onchain/poller";
import { startReconciler } from "./jobs/reconciler";
import { startPoller as startTelegramPoller } from "./jobs/telegramPoller";
import { runScraper } from "./jobs/telegramScraper";
import { MATCHING_FEE_PER_TON, SETTLEMENT_FEE_PER_TON } from "./fees";
import { authenticateToken, type AuthRequest, findUserById, hasBrokerPermissions, hasAdminPermissions } from "./auth";
import { 
  intrinsic, 
  shouldTriggerMargin, 
  calculateMarginCallAmount,
  computeIntrinsicValueUSD,
  computeIntrinsicValueUSDCorrected,
  computePremiumUSD,
  computeUnrealizedPnLUSD,
  collateralPct,
  computeNotional,
  getPartnerFeeStats
} from "./utils/finance";
import { processDeadlines } from "./cron/scheduler";
import { emailService } from "./utils/emailMock";
import { normalizeLegacyCommodity, WHEAT_115_NAME } from "./utils/commodity";
import { computeExpiryWindow } from "./expiryWindows";
import { serializeOptionToJson } from "./optionJson";
import { calculateInitialMargin, checkMarginCall, autoLiquidateIfNeeded } from "./marginEngine";
import { mapOptionToMarketRow } from "./utils/marketSnapshot";
import { calculateCalendarSpreads, calculateCrossCommoditySpreads, getAllSpreads } from "./utils/spreads";
import fs from "fs";
import path from "path";
import { AVAILABLE_COMMODITIES, COMMODITY_MAP, BASIS_CPT_ODESA, type CommoditySlug } from "@shared/commodities";
import { createHash, randomUUID } from "crypto";
import { getMockMarketDataBR, getMockMarketDataAR, getMockMarketDataUS, type MarketIndexDto } from "./services/mockMarketData";

const STALE_MAX_AGE_DAYS = 7;

function computeIsStale(latestTimestamp: Date | string | null | undefined) {
  if (!latestTimestamp) return { isStale: true, staleReason: "no_recent_quotes" };
  const ts = new Date(latestTimestamp).getTime();
  if (Number.isNaN(ts)) return { isStale: true, staleReason: "invalid_timestamp" };
  const ageMs = Date.now() - ts;
  const thresholdMs = STALE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const isStale = ageMs > thresholdMs;
  return { isStale, staleReason: isStale ? `no_updates_since:${new Date(ts).toISOString()}` : null };
}

async function getIndexWithLatestById(indexId: string) {
  const [index] = await db.select().from(indexes).where(eq(indexes.id, indexId)).limit(1);
  if (!index) return null;
  const [latestPrice] = await db
    .select()
    .from(commodityIndexPrices)
    .where(eq(commodityIndexPrices.indexId, index.id))
    .orderBy(desc(commodityIndexPrices.timestamp))
    .limit(1);
  return { index, latestPrice: latestPrice || null };
}

async function getIndexWithLatestBySlug(slug: string) {
  const [index] = await db.select().from(indexes).where(eq(indexes.slug, slug)).limit(1);
  if (!index) return null;
  const [latestPrice] = await db
    .select()
    .from(commodityIndexPrices)
    .where(eq(commodityIndexPrices.indexId, index.id))
    .orderBy(desc(commodityIndexPrices.timestamp))
    .limit(1);
  return { index, latestPrice: latestPrice || null };
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Register auth routes
  app.use("/api/auth", authRoutes);
  app.use("/api/wallet", walletRoutes);
  
  // Register onchain routes
  registerOnchainRoutes(app);
  
  // Register spot trading routes
  registerSpotRoutes(app);
  
  // Start transaction poller if blockchain is configured
  if (process.env.POLYGON_AMOY_RPC_URL && process.env.CROPT_CONTRACT_ADDRESS) {
    startTransactionPoller();
    startReconciler();
    
    // Start periodic deadline processing (expired options and margin calls)
    const DEADLINE_CHECK_INTERVAL = 60000; // 1 minute
    setInterval(async () => {
      try {
        await processDeadlines();
      } catch (error) {
        console.error('[Cron] Error in deadline processing:', error);
      }
    }, DEADLINE_CHECK_INTERVAL);
    console.log(`[Cron] Started deadline processor with ${DEADLINE_CHECK_INTERVAL}ms interval`);
  }

  // Start Telegram integration: Bot API (if token available) OR Public scraper (fallback)
  if (process.env.TELEGRAM_BOT_TOKEN) {
    startTelegramPoller();
  } else {
    console.log("[TelegramPoller] TELEGRAM_BOT_TOKEN not configured. Poller disabled.");
    console.log("[TelegramScraper] Starting fallback scraper for public channel...");
    // Run scraper in background, handle errors gracefully
    runScraper(false).catch((error) => {
      console.error("[TelegramScraper] Fatal error:", error);
    });
  }

  app.get("/api/health", (req, res) => {
    res.json({ ok: true });
  });

  // Waitlist endpoints (early-access)

  const waitlistSchema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    country: z.string().min(2),
    role: z.enum(["trader", "broker", "farmer", "other"]),
    company: z.string().min(2),
    linkedinUrl: z.string().url().optional().nullable(),
    websiteUrl: z.string().url().optional().nullable(),
    source: z.string().optional(),
  });

  // Create waitlist signup (no authenticateToken; but if req.user exists we associate it)
  app.post("/api/waitlist", async (req: AuthRequest, res) => {
    try {
      const parsed = waitlistSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation error",
          details: fromZodError(parsed.error).message,
        });
      }

      const body = parsed.data;
      const verificationToken = randomUUID();

      await db
        .insert(waitlistSignups)
        .values({
          userId: req.user?.id ?? null,
          name: body.name,
          email: body.email,
          country: body.country,
          role: body.role,
          company: body.company,
          linkedinUrl: body.linkedinUrl ?? null,
          websiteUrl: body.websiteUrl ?? null,
          source: body.source || "hero",
          verificationToken,
          verifiedAt: null,
        })
        .returning();

      const baseUrl = process.env.APP_BASE_URL || "http://localhost:5173";
      const verifyLink = `${baseUrl}/waitlist/verify?token=${verificationToken}`;

      try {
        await emailService.sendEmail(
          body.email,
          "Cropto: confirm your waitlist signup",
          `Please confirm your waitlist signup by clicking the link below:\n\n${verifyLink}\n\nIf you did not request this, you can ignore this email.`
        );
      } catch (emailError) {
        console.error("[Waitlist] Failed to send verification email:", emailError);
        // IMPORTANT: do not fail the request if email delivery/logging fails
      }

      return res.status(200).json({
        ok: true,
        message: "Waitlist signup created. Please check your email to confirm.",
      });
    } catch (error: any) {
      console.error("Error creating waitlist signup:", error);
      return res.status(500).json({ error: error.message || "Failed to create waitlist signup" });
    }
  });

  // Verify waitlist signup by token (email confirmation)
  app.get("/api/waitlist/verify", async (req, res) => {
    try {
      const token = typeof req.query.token === "string" ? req.query.token.trim() : "";
      if (!token) {
        return res.status(400).json({ error: "Missing token" });
      }

      const [signup] = await db
        .select()
        .from(waitlistSignups)
        .where(eq(waitlistSignups.verificationToken, token))
        .limit(1);

      if (!signup) {
        return res.status(404).send("Verification link is invalid or has already been used.");
      }

      await db
        .update(waitlistSignups)
        .set({ verifiedAt: new Date(), verificationToken: null })
        .where(eq(waitlistSignups.id, signup.id));

      const baseUrl = process.env.APP_BASE_URL || "http://localhost:5173";
      const backUrl = baseUrl;

      return res.send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Waitlist confirmed</title>
  </head>
  <body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; padding: 32px; line-height: 1.45;">
    <h2>Your email has been confirmed.</h2>
    <p>You are on the Cropto early-access waitlist.</p>
    <p><a href="${backUrl}">Back to app</a></p>
  </body>
</html>`);
    } catch (error) {
      console.error("Error verifying waitlist signup:", error);
      return res.status(500).send("Failed to verify token. Please try again later.");
    }
  });

  // Serve markdown documentation files
  app.get("/api/docs/:filename", async (req, res) => {
    try {
      const { filename } = req.params;
      
      // Validate filename to prevent directory traversal
      if (!filename.match(/^[a-z0-9.-]+\.md$/i)) {
        return res.status(400).json({ error: "Invalid filename" });
      }

      const docsPath = path.resolve(import.meta.dirname, "..", "public", "docs", filename);
      
      // Check if file exists
      if (!fs.existsSync(docsPath)) {
        return res.status(404).json({ error: "File not found" });
      }

      // Read and return file content
      const content = await fs.promises.readFile(docsPath, "utf-8");
      res.set("Content-Type", "text/markdown; charset=utf-8");
      res.send(content);
    } catch (error) {
      console.error("Error serving markdown file:", error);
      res.status(500).json({ error: "Failed to load documentation" });
    }
  });

  // Health updates endpoint for polling
  app.get("/api/health-updates", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const userId = req.user.id;
      const { since } = req.query;
      
      // Capture nextCursor BEFORE queries to prevent lost updates (race condition fix)
      const nextCursor = new Date().toISOString();
      
      // Validate since parameter
      let sinceDate: Date;
      if (!since || typeof since !== 'string') {
        // No since provided - return full sync (last 1 hour)
        sinceDate = new Date(Date.now() - 60 * 60 * 1000);
      } else {
        sinceDate = new Date(since);
        if (isNaN(sinceDate.getTime())) {
          return res.status(400).json({ error: "Invalid since timestamp" });
        }
        
        // Clamp lookback to max 24h
        const maxLookback = new Date(Date.now() - 24 * 60 * 60 * 1000);
        if (sinceDate < maxLookback) {
          sinceDate = maxLookback;
        }
      }

      // Query changed options (USER-SCOPED: only return options where user is participant)
      const changedOptions = await db
        .select({
          id: options.id,
          title: options.title,
          type: options.type,
          strike: options.strike,
          qty: options.qty,
          premium: options.premium,
          status: options.status,
          commodity: options.commodity,
          indexId: options.indexId,
          buyerId: options.buyerId,
          issuerId: options.issuerId,
          counterpartyId: options.counterpartyId,
          expirationDate: options.expirationDate,
          createdAt: options.createdAt,
          lastUpdated: options.lastUpdated,
          collateralAmount: options.collateralAmount,
          payoutAccumulated: options.payoutAccumulated,
        })
        .from(options)
        .where(
          and(
            gt(options.lastUpdated, sinceDate),
            or(
              eq(options.issuerId, userId),
              eq(options.buyerId, userId),
              eq(options.counterpartyId, userId)
            )
          )
        )
        .orderBy(options.lastUpdated)
        .limit(100);

      // Query changed margin calls (USER-SCOPED: only return user's margin calls)
      const changedMarginCalls = await db
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
            gt(marginCalls.lastUpdated, sinceDate),
            eq(marginCalls.userId, userId)
          )
        )
        .orderBy(marginCalls.lastUpdated)
        .limit(100);

      // Query changed transactions (USER-SCOPED: only return transactions where user is sender or recipient)
      const changedTransactions = await db
        .select()
        .from(transactions)
        .where(
          and(
            gt(transactions.lastUpdated, sinceDate),
            or(
              eq(transactions.fromUserId, userId),
              eq(transactions.toUserId, userId)
            )
          )
        )
        .orderBy(transactions.lastUpdated)
        .limit(100);

      const response: HealthUpdateResponse = {
        lastSync: nextCursor, // Use pre-captured cursor to prevent race condition
        options: changedOptions as any,
        marginCalls: changedMarginCalls as any,
        transactions: changedTransactions as any,
      };

      res.json(response);
    } catch (error: any) {
      console.error("[Health Updates] Error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch health updates" });
    }
  });

  // Risk overview (admin-level)
  app.get("/api/risk/overview", authenticateToken, async (req: AuthRequest, res) => {
    const requestContext = {
      userId: req.user?.id ?? "anonymous",
      role: req.user?.role ?? "unknown",
    };

    if (!req.user) {
      console.warn("[Risk Overview] Unauthorized request", requestContext);
      return res.status(401).json({ error: "Authentication required" });
    }

    try {
      if (!hasBrokerPermissions(req.user?.role)) {
        console.warn("[Risk Overview] Forbidden request", { ...requestContext, status: 403 });
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }

      console.info("[Risk Overview] Access granted", { ...requestContext, status: 200 });
      const now = new Date();
      const activeOptions = await db
        .select({
          id: options.id,
          status: options.status,
          collateralAmount: options.collateralAmount,
        })
        .from(options)
        .where(
          or(
            eq(options.status, "OPEN"),
            eq(options.status, "FILLED"),
            eq(options.status, "MARGIN_CALL")
          )
        );

      const marginCallRows = await db
        .select({
          id: marginCalls.id,
          status: marginCalls.status,
          deadline: marginCalls.deadline,
        })
        .from(marginCalls);
      const openMarginCalls = marginCallRows.filter((mc) => mc.status === "PENDING");
      const overdueMarginCalls = openMarginCalls.filter(
        (mc) => mc.deadline && new Date(mc.deadline) < now
      );

      const totalLockedCollateral = activeOptions.reduce((sum, opt) => {
        const collateral = parseFloat(opt.collateralAmount || "0");
        return sum + (Number.isFinite(collateral) ? collateral : 0);
      }, 0);

      // Calculate forward contracts metrics
      const activeForwardContracts = await db
        .select({
          id: forwardContracts.id,
          contractPrice: forwardContracts.contractPrice,
          qtyTon: forwardContracts.qtyTon,
          settlementDate: forwardContracts.settlementDate,
          initialMargin: forwardContracts.initialMargin,
          status: forwardContracts.status,
        })
        .from(forwardContracts)
        .where(eq(forwardContracts.status, "ACTIVE"));

      let forwardNotional = 0;
      let forwardRequiredMargin = 0;
      let forwardCurrentMargin = 0; // For now, assume current margin equals required

      for (const contract of activeForwardContracts) {
        const contractPrice = parseFloat(contract.contractPrice || "0");
        const qtyTon = parseFloat(contract.qtyTon || "0");
        const settlementDate = contract.settlementDate ? new Date(contract.settlementDate) : undefined;

        // Calculate notional value
        const notional = contractPrice * qtyTon;
        forwardNotional += Number.isFinite(notional) ? notional : 0;

        // Use stored initialMargin if available, otherwise calculate it
        let margin = parseFloat(contract.initialMargin || "0");
        if (!Number.isFinite(margin) || margin <= 0) {
          // Fallback: calculate margin using the same logic as in contract creation
          margin = calculateInitialMargin({
            strike: contractPrice,
            quantityTon: qtyTon,
            settlementDate: settlementDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days fallback
            currentDate: new Date(),
          });
        }

        forwardRequiredMargin += margin;
        forwardCurrentMargin += margin; // For now, current margin equals required
      }

      const response = {
        userRole: req.user?.role,
        metrics: {
          activeOptions: activeOptions.length,
          openMarginCalls: openMarginCalls.length,
          overdueMarginCalls: overdueMarginCalls.length,
          totalLockedCollateral: totalLockedCollateral.toFixed(2),
        },
        forwards: {
          notional: Math.round(forwardNotional * 100) / 100, // Round to 2 decimal places
          requiredMargin: Math.round(forwardRequiredMargin * 100) / 100,
          currentMargin: Math.round(forwardCurrentMargin * 100) / 100,
          positionsCount: activeForwardContracts.length,
        },
      };

      console.info("[Risk Overview] Response", { ...requestContext, status: 200 });
      res.json(response);
    } catch (error: any) {
      console.error("[Risk Overview] Error", { ...requestContext, error: error?.message });
      res.status(500).json({ error: error.message || "Failed to fetch risk overview" });
    }
  });

  // Telegram webhook for posting index prices
  app.post("/api/index", async (req, res) => {
    try {
      // Verify Telegram bot token
      const secretToken = req.headers['x-telegram-bot-api-secret-token'];
      const expectedToken = process.env.TELEGRAM_BOT_SECRET_TOKEN;

      if (!expectedToken) {
        console.warn("[Telegram] TELEGRAM_BOT_SECRET_TOKEN not configured. Webhook disabled.");
        return res.status(503).json({ error: "Telegram webhook not configured" });
      }

      if (secretToken !== expectedToken) {
        console.warn("[Telegram] Invalid secret token received");
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { message } = req.body;
      
      // Validate Telegram update structure
      if (!message || !message.text) {
        return res.status(400).json({ error: "Invalid Telegram update format" });
      }

      // Import parser
      const { parseIndexMessage } = await import("./services/telegramParser.js");
      
      const text = message.text.trim();
      const chatUsername = message.chat?.username ? `@${message.chat.username}` : undefined;
      const messageId = message.message_id?.toString();

      // Check for duplicate message_id to prevent reprocessing
      if (messageId) {
        const { eq } = await import("drizzle-orm");
        const existing = await db
          .select()
          .from(indexPrices)
          .where(eq(indexPrices.messageId, messageId))
          .limit(1);

        if (existing.length > 0) {
          console.log(`[Telegram] Skipping duplicate message_id: ${messageId}`);
          return res.json({ 
            ok: true, 
            message: "Duplicate message, already processed",
            skipped: true
          });
        }
      }

      // Parse the message with intelligent parser
      const parseResult = parseIndexMessage(text);

      if (!parseResult.success) {
        console.log(`[Telegram] Failed to parse: ${parseResult.error}`);
        return res.status(400).json({ 
          error: "Message format not recognized",
          details: parseResult.error 
        });
      }

      const { commodity, price, location, change } = parseResult.data!;

      // Build metadata
      const meta = JSON.stringify({
        location,
        change,
        chatUsername,
      });

      // Store index price
      const [indexPrice] = await db
        .insert(indexPrices)
        .values({
          commodity: commodity.toUpperCase(),
          price: price.toFixed(8),
          date: new Date(),
          source: chatUsername || 'telegram',
          raw: text,
          meta,
          messageId,
        })
        .returning();

      console.log(`[Telegram] Index price received: ${commodity} = ${price} from ${chatUsername || 'telegram'}`);

      res.json({ 
        ok: true, 
        message: `Index price stored: ${commodity} = $${price}`,
        data: indexPrice
      });
    } catch (error: any) {
      console.error("Telegram webhook error:", error);
      res.status(500).json({ error: error.message || "Failed to process index update" });
    }
  });

  // Admin endpoint to manually add/override index prices
  app.post("/api/admin/index", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Access denied. Broker role required." });
      }

      const { commodity, price, date } = req.body;

      if (!commodity || !price) {
        return res.status(400).json({ error: "Commodity and price are required" });
      }

      const priceNum = parseFloat(price);
      if (isNaN(priceNum) || priceNum <= 0) {
        return res.status(400).json({ error: "Invalid price value" });
      }

      const indexDate = date ? new Date(date) : new Date();
      const userName = req.user?.email || 'admin';

      const [indexPrice] = await db
        .insert(indexPrices)
        .values({
          commodity: commodity.toUpperCase(),
          price: priceNum.toFixed(8),
          date: indexDate,
          source: `admin-override:${userName}`,
          raw: `Manual entry by ${userName}`,
        })
        .returning();

      res.json({ 
        success: true, 
        message: `Index price added: ${commodity} = $${priceNum}`,
        data: indexPrice
      });
    } catch (error: any) {
      console.error("Admin index add error:", error);
      res.status(500).json({ error: error.message || "Failed to add index price" });
    }
  });

  // Get all index prices (for admin view)
  app.get("/api/admin/index", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Access denied. Broker role required." });
      }

      const limit = parseInt(req.query.limit as string) || 100;
      const commodity = req.query.commodity as string;

      let query = db
        .select()
        .from(indexPrices)
        .orderBy(desc(indexPrices.date))
        .limit(limit);

      if (commodity) {
        query = query.where(eq(indexPrices.commodity, commodity.toUpperCase())) as any;
      }

      const prices = await query;

      res.json(prices);
    } catch (error: any) {
      console.error("Admin index fetch error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch index prices" });
    }
  });

  // Get latest index price with historical data for sparkline
  app.get("/api/index/latest", async (req, res) => {
    try {
      // Normalize legacy identifiers (e.g. WHEAT) to current canonical commodity name
      const rawCommodity = (req.query.commodity as string | undefined) || WHEAT_115_NAME;
      // For the legacy index_prices table we store a human-readable commodity name.
      // Use normalization primarily for backward compatibility with old clients.
      const commodity = normalizeLegacyCommodity(rawCommodity);
      
      // Get the last 7 prices for sparkline
      const prices = await db
        .select()
        .from(indexPrices)
        .where(eq(indexPrices.commodity, commodity))
        .orderBy(desc(indexPrices.date))
        .limit(7);

      if (prices.length === 0) {
        return res.json({
          commodity,
          price: "0",
          timestamp: new Date().toISOString(),
          change: 0,
          changePct: null,
          history: [],
        });
      }

      // Latest price is the first one (most recent)
      const latest = prices[0];
      const latestValue = parseFloat(latest.price);
      
      // Calculate change percentage (comparing to previous price only)
      let changePct: number | null = null;
      if (prices.length > 1) {
        const previousPrice = prices[1];
        const previousValue = parseFloat(previousPrice.price);
        changePct = previousValue !== 0 
          ? ((latestValue - previousValue) / previousValue) * 100
          : 0;
        changePct = parseFloat(changePct.toFixed(2));
      }

      // Fallback to change vs oldest for backward compatibility with sparkline
      const oldestPrice = prices[prices.length - 1];
      const oldestValue = parseFloat(oldestPrice.price);
      const change = oldestValue !== 0 
        ? ((latestValue - oldestValue) / oldestValue) * 100
        : 0;

      // Reverse to get chronological order for sparkline
      const history = prices.reverse().map(p => ({
        price: parseFloat(p.price),
        timestamp: p.date.toISOString(),
      }));

      res.json({
        commodity: latest.commodity,
        price: latest.price,
        timestamp: latest.date.toISOString(),
        change: parseFloat(change.toFixed(2)),
        changePct,
        source: latest.source,
        history,
      });
    } catch (error) {
      console.error("Error fetching latest index:", error);
      res.status(500).json({ error: "Failed to fetch index data" });
    }
  });

  // Get price history for charting (with optional year-over-year comparison)
  app.get("/api/index/history", async (req, res) => {
    try {
      const rawCommodity = (req.query.commodity as string | undefined) || WHEAT_115_NAME;
      const commodity = normalizeLegacyCommodity(rawCommodity);
      const period = req.query.period as string || '30d';
      const interval = req.query.interval as string || 'day';
      const includeComparison = req.query.comparison === 'true';

      // Parse period (30d, 90d, 365d, all)
      let cutoffDate: Date | null = null;
      if (period !== 'all') {
        const days = parseInt(period.replace('d', ''));
        if (!isNaN(days)) {
          cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - days);
        }
      }

      // Build query with conditional cutoff date
      const whereConditions = cutoffDate
        ? and(
            eq(indexPrices.commodity, commodity),
            sql`${indexPrices.date} >= ${cutoffDate}`
          )
        : eq(indexPrices.commodity, commodity);

      const prices = await db
        .select({
          price: indexPrices.price,
          date: indexPrices.date,
        })
        .from(indexPrices)
        .where(whereConditions)
        .orderBy(indexPrices.date);

      // Group by interval (day or month)
      const grouped = new Map<string, number>();
      
      for (const p of prices) {
        let key: string;
        if (interval === 'month') {
          // Group by YYYY-MM
          key = p.date.toISOString().substring(0, 7);
        } else {
          // Default: group by day (YYYY-MM-DD)
          key = p.date.toISOString().split('T')[0];
        }
        // Take latest price for each interval
        grouped.set(key, parseFloat(p.price));
      }

      // Convert to sorted array
      const dataPoints = Array.from(grouped.entries())
        .map(([date, price]) => ({ date, price }))
        .sort((a, b) => a.date.localeCompare(b.date)); // Ascending order for chart

      // Fetch previous year data for comparison if requested
      let previousYearData: Array<{ date: string; price: number }> = [];
      if (includeComparison && cutoffDate) {
        // Calculate date range for previous year (same calendar dates, 1 year ago)
        const prevYearCutoff = new Date(cutoffDate);
        prevYearCutoff.setFullYear(prevYearCutoff.getFullYear() - 1);
        
        const prevYearEnd = new Date();
        prevYearEnd.setFullYear(prevYearEnd.getFullYear() - 1);

        const prevYearConditions = and(
          eq(indexPrices.commodity, commodity),
          sql`${indexPrices.date} >= ${prevYearCutoff}`,
          sql`${indexPrices.date} <= ${prevYearEnd}`
        );

        const prevYearPrices = await db
          .select({
            price: indexPrices.price,
            date: indexPrices.date,
          })
          .from(indexPrices)
          .where(prevYearConditions)
          .orderBy(indexPrices.date);

        // Group previous year data
        const prevGrouped = new Map<string, number>();
        for (const p of prevYearPrices) {
          let key: string;
          if (interval === 'month') {
            key = p.date.toISOString().substring(0, 7);
          } else {
            key = p.date.toISOString().split('T')[0];
          }
          prevGrouped.set(key, parseFloat(p.price));
        }

        previousYearData = Array.from(prevGrouped.entries())
          .map(([date, price]) => ({ date, price }))
          .sort((a, b) => a.date.localeCompare(b.date));
      }

      res.json({
        current: dataPoints,
        previous: previousYearData,
        hasPreviousYear: previousYearData.length > 0
      });
    } catch (error) {
      console.error("Error fetching price history:", error);
      res.status(500).json({ error: "Failed to fetch price history" });
    }
  });

  // Internal endpoint for scraper ingestion
  app.post("/api/index/ingest/scrape", async (req, res) => {
    try {
      const { commodity, price, message_id, raw, date } = req.body;

      if (!commodity || !price || !message_id) {
        return res.status(400).json({ error: "Missing required fields: commodity, price, message_id" });
      }

      // Check for duplicates
      const existing = await db
        .select()
        .from(indexPrices)
        .where(and(
          eq(indexPrices.source, 'telegram/scraper'),
          eq(indexPrices.messageId, message_id)
        ))
        .limit(1);

      if (existing.length > 0) {
        return res.json({ skipped: true, message: "Duplicate message_id" });
      }

      // Insert new record
      const inserted = await db.insert(indexPrices).values({
        commodity: commodity.toUpperCase(),
        price: price.toString(),
        date: date ? new Date(date) : new Date(),
        source: 'telegram/scraper',
        raw: raw || null,
        messageId: message_id,
        meta: JSON.stringify({
          ingested_at: new Date().toISOString()
        }),
        isDemo: 'false'
      }).returning();

      res.json({ success: true, record: inserted[0] });
    } catch (error) {
      console.error("Error ingesting scraped data:", error);
      res.status(500).json({ error: "Failed to ingest data" });
    }
  });

  // Commodity Indexes API - New structured index system
  
  // GET /api/indexes - List all commodity indexes with latest prices
  app.get("/api/indexes", async (req, res) => {
    try {
      // Fetch all indexes
      const allIndexes = await db
        .select()
        .from(indexes)
        .orderBy(indexes.category, indexes.name);

      // For each index, fetch the latest price
      const indexesWithPrices = await Promise.all(
        allIndexes.map(async (index) => {
          const latestPrice = await db
            .select()
            .from(commodityIndexPrices)
            .where(eq(commodityIndexPrices.indexId, index.id))
            .orderBy(desc(commodityIndexPrices.timestamp))
            .limit(1);

          return {
            id: index.id,
            name: index.name,
            slug: index.slug,
            category: index.category,
            hasVat: index.hasVat === 'true',
            latestPrice: latestPrice.length > 0 ? {
              price: parseFloat(latestPrice[0].price),
              delta: latestPrice[0].delta ? parseFloat(latestPrice[0].delta) : null,
              timestamp: latestPrice[0].timestamp,
            } : null,
            ...(() => {
              const { isStale, staleReason } = computeIsStale(latestPrice[0]?.timestamp || null);
              return { isStale, staleReason };
            })(),
            createdAt: index.createdAt,
            updatedAt: index.updatedAt,
          };
        })
      );

      res.json(indexesWithPrices);
    } catch (error) {
      console.error("Error fetching indexes:", error);
      res.status(500).json({ error: "Failed to fetch indexes" });
    }
  });

  // GET /api/indexes/:slug - Get one index by slug with full price history
  app.get("/api/indexes/:slug", async (req, res) => {
    try {
      const { slug } = req.params;

      // Find the index by slug
      const [index] = await db
        .select()
        .from(indexes)
        .where(eq(indexes.slug, slug))
        .limit(1);

      if (!index) {
        return res.status(404).json({ error: "Index not found" });
      }

      // Fetch all price history for this index
      const priceHistory = await db
        .select()
        .from(commodityIndexPrices)
        .where(eq(commodityIndexPrices.indexId, index.id))
        .orderBy(desc(commodityIndexPrices.timestamp));

      // Format response
      const response = {
        id: index.id,
        name: index.name,
        slug: index.slug,
        category: index.category,
        hasVat: index.hasVat === 'true',
        createdAt: index.createdAt,
        updatedAt: index.updatedAt,
        priceHistory: priceHistory.map(p => ({
          id: p.id,
          price: parseFloat(p.price),
          delta: p.delta ? parseFloat(p.delta) : null,
          timestamp: p.timestamp,
        })),
        ...(() => {
          const latestTs = priceHistory[0]?.timestamp || null;
          const { isStale, staleReason } = computeIsStale(latestTs);
          return { isStale, staleReason };
        })(),
      };

      res.json(response);
    } catch (error) {
      console.error("Error fetching index:", error);
      res.status(500).json({ error: "Failed to fetch index" });
    }
  });

  // GET /api/admin/indexes - Get latest index values per (country, commodity, basis)
  app.get("/api/admin/indexes", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Access denied. Broker role required." });
      }

      // Get UA indexes from commodityIndexPrices
      const uaIndexes = await db
        .select()
        .from(indexes)
        .where(sql`${indexes.category} LIKE 'CPT%'`);

      const uaLatest: Array<{
        country: string;
        commodity: string;
        grade: string | null;
        basis: string;
        price: number;
        asOf: string;
        source: string;
      }> = [];

      for (const index of uaIndexes) {
        const [latestPrice] = await db
          .select()
          .from(commodityIndexPrices)
          .where(eq(commodityIndexPrices.indexId, index.id))
          .orderBy(desc(commodityIndexPrices.timestamp))
          .limit(1);

        if (latestPrice) {
          // Extract commodity and grade from index name (simplified)
          const lowerName = index.name.toLowerCase();
          let commodity = "";
          let grade: string | null = null;
          if (lowerName.includes("corn")) commodity = "corn";
          else if (lowerName.includes("wheat")) {
            commodity = "wheat";
            if (index.name.match(/11\.?5/)) grade = "11.5pro";
            if (lowerName.includes("feed")) grade = "feed";
          } else if (lowerName.includes("soy")) {
            commodity = "soybeans";
            if (lowerName.includes("gmo")) grade = "GMO";
          } else if (lowerName.includes("sunflower")) commodity = "sunflower";
          else if (lowerName.includes("rapeseed")) commodity = "rapeseed";

          const basis = index.category === "CPT ODESA" 
            ? "CPT Odesa (export)"
            : index.category === "CPT PARITET ODESA"
            ? "CPT Paritet Odesa (processing)"
            : index.category;

          uaLatest.push({
            country: "UA",
            commodity,
            grade,
            basis,
            price: parseFloat(latestPrice.price),
            asOf: new Date(latestPrice.timestamp).toISOString(),
            source: "spike_telegram",
          });
        }
      }

      // Get BR/AR indexes from indexPrices with meta
      const allIndexPrices = await db
        .select()
        .from(indexPrices)
        .orderBy(desc(indexPrices.date));

      const brArLatest: Array<{
        country: string;
        commodity: string;
        grade: string | null;
        basis: string;
        price: number;
        asOf: string;
        source: string;
      }> = [];

      // Group by (country, commodity, basis) and get latest
      const brArMap = new Map<string, typeof allIndexPrices[0] & { meta: any }>();
      for (const price of allIndexPrices) {
        try {
          const meta = price.meta ? JSON.parse(price.meta) : {};
          if (meta.country && (meta.country === "BR" || meta.country === "AR")) {
            const key = `${meta.country}:${meta.commodity || price.commodity.toLowerCase()}:${meta.basis || ""}`;
            if (!brArMap.has(key)) {
              brArMap.set(key, { ...price, meta });
            }
          }
        } catch {
          // Skip invalid meta
        }
      }

      for (const price of brArMap.values()) {
        const meta = price.meta || {};
        brArLatest.push({
          country: meta.country,
          commodity: meta.commodity || price.commodity.toLowerCase(),
          grade: meta.grade || null,
          basis: meta.basis || "",
          price: parseFloat(price.price),
          asOf: new Date(price.date).toISOString(),
          source: "manual",
        });
      }

      res.json([...uaLatest, ...brArLatest]);
    } catch (error: any) {
      console.error("Error fetching admin indexes:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/admin/indexes - Create/update index value
  app.post("/api/admin/indexes", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Access denied. Broker role required." });
      }

      const schema = z.object({
        country: z.enum(["UA", "BR", "AR", "US"]),
        commodity: z.string().min(1),
        basis: z.string().min(1),
        price: z.coerce.number().positive(),
        currency: z.string().default("USD"),
        asOf: z.string().optional(),
        grade: z.string().nullable().optional(),
      });

      const result = schema.safeParse(req.body);
      if (!result.success) {
        const validationError = fromZodError(result.error);
        return res.status(400).json({
          error: validationError.message,
          details: result.error.issues,
        });
      }

      const { country, commodity, basis, price, currency, asOf, grade } = result.data;
      const date = asOf ? new Date(asOf) : new Date();
      const userName = req.user?.email || "admin";

      if (country === "UA") {
        // For UA, find matching index by commodity/basis and use commodityIndexPrices
        // This is more complex, so for now we'll store it in indexPrices with meta
        // (In a full implementation, we'd match to indexes table)
      }

      // Store in indexPrices with metadata
      const meta = JSON.stringify({
        country,
        commodity: commodity.toLowerCase(),
        basis,
        grade: grade || null,
        currency,
        createdBy: userName,
      });

      const [newPrice] = await db
        .insert(indexPrices)
        .values({
          commodity: commodity.toUpperCase(),
          price: price.toFixed(8),
          date,
          source: `admin:${userName}`,
          raw: `Manual entry: ${country} ${commodity} @ ${basis}`,
          meta,
        })
        .returning();

      res.json({
        success: true,
        message: `Index price added: ${country} ${commodity} @ ${basis} = $${price}`,
        data: newPrice,
      });
    } catch (error: any) {
      console.error("Error creating admin index:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  // GET /api/index/history - Get price history for a specific instrument
  app.get("/api/index/history", async (req, res) => {
    try {
      const { country, commodity, basis } = req.query;
      const countryStr = typeof country === "string" ? country : "";
      const commodityStr = typeof commodity === "string" ? commodity : "";
      const basisStr = typeof basis === "string" ? basis : "";

      if (!countryStr || !commodityStr || !basisStr) {
        return res.status(400).json({
          error: "Missing required parameters: country, commodity, basis",
        });
      }

      const history: Array<{ date: string; price: number }> = [];

      if (countryStr === "UA") {
        // Query from commodityIndexPrices via indexes table
        const uaIndexes = await db
          .select()
          .from(indexes)
          .where(sql`${indexes.category} LIKE 'CPT%'`);

        // Find matching index (simplified matching)
        let matchingIndex = null;
        for (const index of uaIndexes) {
          const indexBasis = index.category === "CPT ODESA"
            ? "CPT Odesa (export)"
            : index.category === "CPT PARITET ODESA"
            ? "CPT Paritet Odesa (processing)"
            : index.category;
          if (indexBasis === basisStr && index.name.toLowerCase().includes(commodityStr.toLowerCase())) {
            matchingIndex = index;
            break;
          }
        }

        if (matchingIndex) {
          const prices = await db
            .select()
            .from(commodityIndexPrices)
            .where(eq(commodityIndexPrices.indexId, matchingIndex.id))
            .orderBy(asc(commodityIndexPrices.timestamp));

          for (const price of prices) {
            history.push({
              date: new Date(price.timestamp).toISOString().split("T")[0],
              price: parseFloat(price.price),
            });
          }
        }
      } else {
        // Query from indexPrices with meta
        const allPrices = await db
          .select()
          .from(indexPrices)
          .orderBy(asc(indexPrices.date));

        for (const price of allPrices) {
          try {
            const meta = price.meta ? JSON.parse(price.meta) : {};
            if (
              meta.country === countryStr &&
              (meta.commodity || price.commodity.toLowerCase()) === commodityStr.toLowerCase() &&
              meta.basis === basisStr
            ) {
              history.push({
                date: new Date(price.date).toISOString().split("T")[0],
                price: parseFloat(price.price),
              });
            }
          } catch {
            // Skip invalid meta
          }
        }
      }

      res.json(history);
    } catch (error: any) {
      console.error("Error fetching index history:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Helper function to get latest index for a country/commodity
  async function getLatestIndexForCountryCommodity(
    country: "UA" | "BR" | "AR" | "US",
    commodity: string
  ): Promise<{ price: number; basis: string; asOf: string } | null> {
    if (country === "UA") {
      // Query UA indexes from commodityIndexPrices via indexes table
      const uaIndexes = await db
        .select()
        .from(indexes)
        .where(sql`${indexes.category} LIKE 'CPT%'`)
        .orderBy(indexes.category, indexes.name);

      // Find matching index by commodity
      const commodityLower = commodity.toLowerCase();
      for (const index of uaIndexes) {
        const indexNameLower = index.name.toLowerCase();
        let matches = false;

        if (commodityLower === "corn" && indexNameLower.includes("corn")) matches = true;
        else if (commodityLower === "wheat" && indexNameLower.includes("wheat")) matches = true;
        else if (commodityLower === "soybeans" && indexNameLower.includes("soy")) matches = true;
        else if (commodityLower === "sunflower" && indexNameLower.includes("sunflower")) matches = true;
        else if (commodityLower === "rapeseed" && indexNameLower.includes("rapeseed")) matches = true;

        if (matches) {
          const [latestPrice] = await db
            .select()
            .from(commodityIndexPrices)
            .where(eq(commodityIndexPrices.indexId, index.id))
            .orderBy(desc(commodityIndexPrices.timestamp))
            .limit(1);

          if (latestPrice && parseFloat(latestPrice.price) > 0) {
            const basis =
              index.category === "CPT ODESA"
                ? "CPT Odesa (export)"
                : index.category === "CPT PARITET ODESA"
                ? "CPT Paritet Odesa (processing)"
                : index.category;
            return {
              price: parseFloat(latestPrice.price),
              basis,
              asOf: new Date(latestPrice.timestamp).toISOString(),
            };
          }
        }
      }
    } else {
      // Query BR/AR from indexPrices with meta
      const allIndexPrices = await db
        .select()
        .from(indexPrices)
        .orderBy(desc(indexPrices.date));

      const commodityLower = commodity.toLowerCase();
      for (const price of allIndexPrices) {
        try {
          const meta = price.meta ? JSON.parse(price.meta) : {};
          if (
            meta.country === country &&
            (meta.commodity || price.commodity.toLowerCase()) === commodityLower
          ) {
            const priceValue = parseFloat(price.price);
            if (priceValue > 0) {
              return {
                price: priceValue,
                basis: meta.basis || "",
                asOf: new Date(price.date).toISOString(),
              };
            }
          }
        } catch {
          // Skip invalid meta
        }
      }

      // Fallback to mock data if no DB entry found
      if (country === "BR") {
        const mockData = getMockMarketDataBR();
        const mock = mockData.find((m) => m.commodity === commodityLower);
        if (mock) {
          return {
            price: mock.price,
            basis: mock.basis,
            asOf: mock.asOf,
          };
        }
      } else if (country === "AR") {
        const mockData = getMockMarketDataAR();
        const mock = mockData.find((m) => m.commodity === commodityLower);
        if (mock) {
          return {
            price: mock.price,
            basis: mock.basis,
            asOf: mock.asOf,
          };
        }
      } else if (country === "US") {
        const mockData = getMockMarketDataUS();
        const mock = mockData.find((m) => m.commodity === commodityLower);
        if (mock) {
          return {
            price: mock.price,
            basis: mock.basis,
            asOf: mock.asOf,
          };
        }
      }
    }

    return null;
  }

  // GET /api/arbitrage/index - Compare indexes between two countries
  app.get("/api/arbitrage/index", async (req, res) => {
    try {
      const { baseCountry, targetCountry, commodity, includeHistory } = req.query;

      if (!baseCountry || !targetCountry || !commodity) {
        return res.status(400).json({
          error: "Missing required parameters: baseCountry, targetCountry, commodity",
        });
      }

      const baseCountryTyped = baseCountry as "UA" | "BR" | "AR" | "US";
      const targetCountryTyped = targetCountry as "UA" | "BR" | "AR" | "US";

      if (!["UA", "BR", "AR", "US"].includes(baseCountryTyped) || !["UA", "BR", "AR", "US"].includes(targetCountryTyped)) {
        return res.status(400).json({
          error: "Invalid country. Must be UA, BR, AR, or US",
        });
      }

      if (baseCountryTyped === targetCountryTyped) {
        return res.status(400).json({
          error: "Base and target countries must be different",
        });
      }

      // Fetch latest indexes for both countries
      const baseIndex = await getLatestIndexForCountryCommodity(baseCountryTyped, commodity as string);
      const targetIndex = await getLatestIndexForCountryCommodity(targetCountryTyped, commodity as string);

      if (!baseIndex) {
        return res.status(404).json({
          error: `No index data found for ${baseCountryTyped} ${commodity}`,
        });
      }

      if (!targetIndex) {
        return res.status(404).json({
          error: `No index data found for ${targetCountryTyped} ${commodity}`,
        });
      }

      // Calculate spread
      const spreadAbs = targetIndex.price - baseIndex.price;
      const spreadPct = baseIndex.price > 0 ? (spreadAbs / baseIndex.price) * 100 : 0;

      const response: any = {
        commodity: commodity as string,
        base: {
          country: baseCountryTyped,
          price: baseIndex.price,
          basis: baseIndex.basis,
          asOf: baseIndex.asOf,
        },
        target: {
          country: targetCountryTyped,
          price: targetIndex.price,
          basis: targetIndex.basis,
          asOf: targetIndex.asOf,
        },
        spreadAbs: Number(spreadAbs.toFixed(2)),
        spreadPct: Number(spreadPct.toFixed(2)),
      };

      // Optional: include history
      if (includeHistory === "true") {
        try {
          // Get history for both countries
          const baseHistory = await db
            .select()
            .from(indexPrices)
            .orderBy(asc(indexPrices.date));

          const targetHistory = await db
            .select()
            .from(indexPrices)
            .orderBy(asc(indexPrices.date));

          const commodityLower = (typeof commodity === "string" ? commodity : "").toLowerCase();
          const historyMap = new Map<string, { basePrice?: number; targetPrice?: number }>();

          // Collect base history
          if (baseCountryTyped === "UA") {
            // For UA, would need to query commodityIndexPrices - simplified for now
            // Just use latest price for all dates (can be enhanced later)
          } else {
            for (const price of baseHistory) {
              try {
                const meta = price.meta ? JSON.parse(price.meta) : {};
                if (
                  meta.country === baseCountryTyped &&
                  (meta.commodity || price.commodity.toLowerCase()) === commodityLower
                ) {
                  const dateKey = new Date(price.date).toISOString().split("T")[0];
                  if (!historyMap.has(dateKey)) {
                    historyMap.set(dateKey, {});
                  }
                  historyMap.get(dateKey)!.basePrice = parseFloat(price.price);
                }
              } catch {
                // Skip invalid meta
              }
            }
          }

          // Collect target history
          if (targetCountryTyped === "UA") {
            // For UA, simplified
          } else {
            for (const price of targetHistory) {
              try {
                const meta = price.meta ? JSON.parse(price.meta) : {};
                if (
                  meta.country === targetCountryTyped &&
                  (meta.commodity || price.commodity.toLowerCase()) === commodityLower
                ) {
                  const dateKey = new Date(price.date).toISOString().split("T")[0];
                  if (!historyMap.has(dateKey)) {
                    historyMap.set(dateKey, {});
                  }
                  historyMap.get(dateKey)!.targetPrice = parseFloat(price.price);
                }
              } catch {
                // Skip invalid meta
              }
            }
          }

          // Build history array (only dates where both prices exist)
          const history: Array<{
            date: string;
            basePrice: number;
            targetPrice: number;
            spreadAbs: number;
            spreadPct: number;
          }> = [];

          for (const [date, prices] of historyMap.entries()) {
            if (prices.basePrice && prices.targetPrice) {
              const spread = prices.targetPrice - prices.basePrice;
              const spreadPercent = prices.basePrice > 0 ? (spread / prices.basePrice) * 100 : 0;
              history.push({
                date,
                basePrice: prices.basePrice,
                targetPrice: prices.targetPrice,
                spreadAbs: Number(spread.toFixed(2)),
                spreadPct: Number(spreadPercent.toFixed(2)),
              });
            }
          }

          // Sort by date
          history.sort((a, b) => a.date.localeCompare(b.date));
          response.history = history;
        } catch (error) {
          console.error("Error fetching history for arbitrage:", error);
          // Continue without history
        }
      }

      res.json(response);
    } catch (error: any) {
      console.error("Error fetching arbitrage index:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/market-dashboard - Market dashboard view by country (UA, BR, AR, US)
  app.get("/api/market-dashboard", async (req, res) => {
    try {
      // Helper function to extract commodity name and grade from index name
      function extractCommodityAndGrade(indexName: string): { commodity: string; grade: string | null } {
        const lower = indexName.toLowerCase();
        let commodity = "";
        let grade: string | null = null;

        if (lower.includes("corn")) {
          commodity = "corn";
        } else if (lower.includes("wheat")) {
          commodity = "wheat";
          // Extract grade like "11.5%" or "11.5pro"
          const gradeMatch = indexName.match(/11\.?5/);
          if (gradeMatch) {
            grade = "11.5pro";
          }
          if (lower.includes("feed")) {
            grade = "feed";
          }
        } else if (lower.includes("soy")) {
          commodity = "soybeans";
          if (lower.includes("gmo")) {
            grade = "GMO";
          }
        } else if (lower.includes("sunflower")) {
          commodity = "sunflower";
        } else if (lower.includes("rapeseed")) {
          commodity = "rapeseed";
        } else {
          // Fallback: use lowercase slug
          commodity = indexName.toLowerCase().replace(/\s+/g, "-");
        }

        return { commodity, grade };
      }

      // Helper function to map category to basis string
      function categoryToBasis(category: string): string {
        if (category === "CPT ODESA") {
          return "CPT Odesa (export)";
        } else if (category === "CPT PARITET ODESA") {
          return "CPT Paritet Odesa (processing)";
        }
        return category;
      }

      // Fetch UA indexes (those with category starting with "CPT")
      const uaIndexes = await db
        .select()
        .from(indexes)
        .where(sql`${indexes.category} LIKE 'CPT%'`)
        .orderBy(indexes.category, indexes.name);

      // For each UA index, get latest price and convert to MarketIndexDto
      const uaData: MarketIndexDto[] = await Promise.all(
        uaIndexes.map(async (index) => {
          const [latestPrice] = await db
            .select()
            .from(commodityIndexPrices)
            .where(eq(commodityIndexPrices.indexId, index.id))
            .orderBy(desc(commodityIndexPrices.timestamp))
            .limit(1);

          const { commodity, grade } = extractCommodityAndGrade(index.name);
          const basis = categoryToBasis(index.category);
          const price = latestPrice ? parseFloat(latestPrice.price) : 0;
          const asOf = latestPrice?.timestamp ? new Date(latestPrice.timestamp).toISOString() : new Date().toISOString();

          // For now, set change values to 0 (we can calculate them later from price history)
          return {
            commodity,
            grade,
            country: "UA" as const,
            basis,
            price,
            currency: "USD" as const,
            change24h: latestPrice?.delta ? parseFloat(latestPrice.delta) : 0,
            change7d: 0,
            change30d: 0,
            asOf,
            source: "spike_telegram" as const,
          };
        })
      );

      // Filter out entries with zero price (no data available)
      const uaDataFiltered = uaData.filter((item) => item.price > 0);

      // Get BR/AR data from database (indexPrices with meta)
      const allIndexPrices = await db
        .select()
        .from(indexPrices)
        .orderBy(desc(indexPrices.date));

      const brMap = new Map<string, MarketIndexDto>();
      const arMap = new Map<string, MarketIndexDto>();
      const usMap = new Map<string, MarketIndexDto>();

      for (const price of allIndexPrices) {
        try {
          const meta = price.meta ? JSON.parse(price.meta) : {};
          if (meta.country && (meta.country === "BR" || meta.country === "AR" || meta.country === "US")) {
            const commodity = meta.commodity || price.commodity.toLowerCase();
            const basis = meta.basis || "";
            const key = `${commodity}:${basis}`;

            const country = meta.country;
            const targetMap = country === "BR" ? brMap : country === "AR" ? arMap : usMap;

            // Only keep the latest entry per (commodity, basis)
            if (!targetMap.has(key)) {
              // Calculate change24h (simplified: compare with previous day)
              const priceValue = parseFloat(price.price);
              let change24h = 0;
              
              // Find previous price for same commodity+basis
              for (const prevPrice of allIndexPrices) {
                if (prevPrice.id === price.id) continue;
                try {
                  const prevMeta = prevPrice.meta ? JSON.parse(prevPrice.meta) : {};
                  if (
                    prevMeta.country === country &&
                    (prevMeta.commodity || prevPrice.commodity.toLowerCase()) === commodity &&
                    prevMeta.basis === basis
                  ) {
                    const prevPriceValue = parseFloat(prevPrice.price);
                    const prevDate = new Date(prevPrice.date);
                    const currentDate = new Date(price.date);
                    const daysDiff = (currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
                    
                    if (daysDiff <= 1.5 && daysDiff > 0) {
                      change24h = ((priceValue - prevPriceValue) / prevPriceValue) * 100;
                    }
                    break;
                  }
                } catch {
                  // Skip invalid meta
                }
              }

              targetMap.set(key, {
                commodity,
                grade: meta.grade || null,
                country: country as "BR" | "AR" | "US",
                basis,
                price: priceValue,
                currency: "USD" as const,
                change24h,
                change7d: 0,
                change30d: 0,
                asOf: new Date(price.date).toISOString(),
                source: "manual" as const,
              });
            }
          }
        } catch {
          // Skip invalid meta
        }
      }

      const brData = Array.from(brMap.values());
      const arData = Array.from(arMap.values());
      const usData = Array.from(usMap.values());

      // Fallback to mock data if no database entries
      const finalBrData = brData.length > 0 ? brData : getMockMarketDataBR();
      const finalArData = arData.length > 0 ? arData : getMockMarketDataAR();
      const finalUsData = usData.length > 0 ? usData : getMockMarketDataUS();

      res.json({
        ua: uaDataFiltered.length > 0 ? uaDataFiltered : [
          // Fallback sample data if no real data available
          {
            commodity: "corn",
            grade: null,
            country: "UA" as const,
            basis: "CPT Odesa (export)",
            price: 240.0,
            currency: "USD" as const,
            change24h: 0,
            change7d: 0,
            change30d: 0,
            asOf: new Date().toISOString(),
            source: "manual" as const,
          },
        ],
        br: finalBrData,
        ar: finalArData,
        us: finalUsData,
      });
    } catch (error: any) {
      console.error("Error fetching market dashboard:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/indexes/:slug/price - Add new price for an index
  app.post("/api/indexes/:slug/price", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Access denied. Broker role required." });
      }

      const { slug } = req.params;

      // Find the index by slug
      const [index] = await db
        .select()
        .from(indexes)
        .where(eq(indexes.slug, slug))
        .limit(1);

      if (!index) {
        return res.status(404).json({ error: "Index not found" });
      }

      // Validate request body
      const priceSchema = z.object({
        price: z.coerce.number().positive("Price must be positive"),
        delta: z.coerce.number().optional().nullable(),
      });

      const result = priceSchema.safeParse(req.body);
      
      if (!result.success) {
        const validationError = fromZodError(result.error);
        return res.status(400).json({ 
          error: validationError.message,
          details: result.error.issues 
        });
      }

      const { price, delta } = result.data;

      // Insert new price record
      const [newPrice] = await db
        .insert(commodityIndexPrices)
        .values({
          indexId: index.id,
          price: price.toString(),
          delta: delta !== null && delta !== undefined ? delta.toString() : null,
        })
        .returning();

      console.log(`[Index] New price added for ${index.name} (${slug}): $${price} by ${req.user?.email}`);

      res.status(201).json({
        id: newPrice.id,
        indexId: newPrice.indexId,
        price: parseFloat(newPrice.price),
        delta: newPrice.delta ? parseFloat(newPrice.delta) : null,
        timestamp: newPrice.timestamp,
        index: {
          name: index.name,
          slug: index.slug,
          category: index.category,
        },
      });
    } catch (error: any) {
      console.error("Error adding index price:", error);
      res.status(500).json({ error: error.message || "Failed to add index price" });
    }
  });

  app.get("/api/options", async (req, res) => {
    try {
      const options = await storage.listOptions();
      res.json(options);
    } catch (error) {
      console.error("Error fetching options:", error);
      res.status(500).json({ error: "Failed to fetch options" });
    }
  });

  // Spot orderbook (aggregated)
  app.get("/api/spot/orderbook", authenticateToken, async (req: AuthRequest, res) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { commodity, depth } = req.query as { commodity?: string; depth?: string };
    if (!commodity) {
      return res.status(400).json({ error: "commodity is required" });
    }

    const depthNum = Math.min(Math.max(Number(depth) || 5, 1), 50);

    try {
      const rows = await db
        .select({
          price: sql`COALESCE(${spotPositions.avgEntryPrice}, '0')`,
          qty: spotPositions.quantityKg,
        })
        .from(spotPositions)
        .where(eq(spotPositions.commoditySlug, commodity));

      const asksMap = new Map<string, number>();
      for (const row of rows) {
        const price = Number(row.price);
        const qty = Number(row.qty);
        if (!Number.isFinite(price) || !Number.isFinite(qty)) continue;
        const current = asksMap.get(price.toString()) || 0;
        asksMap.set(price.toString(), current + qty);
      }

      const asks = Array.from(asksMap.entries())
        .map(([p, q]) => ({ price: Number(p), quantity: q }))
        .sort((a, b) => a.price - b.price)
        .slice(0, depthNum);

      const response = {
        commodity,
        bids: [] as { price: number; quantity: number }[],
        asks,
      };

      console.info("[Orderbook Spot]", { commodity, depth: depthNum, bids: response.bids.length, asks: response.asks.length });
      res.json(response);
    } catch (error: any) {
      console.error("[Orderbook Spot] Error", { commodity, error: error?.message });
      res.status(500).json({ error: error?.message || "Failed to fetch spot orderbook" });
    }
  });

  // Options orderbook (aggregated)
  app.get("/api/options/orderbook", authenticateToken, async (req: AuthRequest, res) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { commodity, window, depth } = req.query as { commodity?: string; window?: string; depth?: string };
    if (!commodity) {
      return res.status(400).json({ error: "commodity is required" });
    }
    const depthNum = Math.min(Math.max(Number(depth) || 5, 1), 50);

    try {
      const rows = await db
        .select({
          id: options.id,
          strike: options.strike,
          qty: options.qty,
          type: options.type,
          status: options.status,
          commodity: options.commodity,
          expirationDate: options.expirationDate,
        })
        .from(options)
        .where(eq(options.status, "OPEN"));

      const filtered = rows.filter((opt) => {
        const matchesCommodity = opt.commodity?.toLowerCase() === commodity.toLowerCase();
        const matchesWindow = window
          ? opt.expirationDate && new Date(opt.expirationDate).toISOString().startsWith(window)
          : true;
        return matchesCommodity && matchesWindow;
      });

      const asksMap = new Map<string, number>();
      for (const opt of filtered) {
        const price = Number(opt.strike);
        const qty = Number(opt.qty);
        if (!Number.isFinite(price) || !Number.isFinite(qty)) continue;
        const key = `${price}-${opt.type}`;
        const current = asksMap.get(key) || 0;
        asksMap.set(key, current + qty);
      }

      const asks = Array.from(asksMap.entries())
        .map(([key, quantity]) => {
          const [priceStr, type] = key.split("-");
          return { price: Number(priceStr), quantity, type };
        })
        .sort((a, b) => {
          if (a.price === b.price) return 0;
          return a.price - b.price;
        })
        .slice(0, depthNum);

      const windowLabel = filtered[0]?.expirationDate
        ? new Date(filtered[0].expirationDate!).toISOString()
        : undefined;

      const response = {
        commodity,
        windowLabel,
        bids: [] as { price: number; quantity: number }[],
        asks,
      };

      console.info("[Orderbook Options]", { commodity, window: windowLabel || window, depth: depthNum, bids: response.bids.length, asks: response.asks.length });
      res.json(response);
    } catch (error: any) {
      console.error("[Orderbook Options] Error", { commodity, error: error?.message });
      res.status(500).json({ error: error?.message || "Failed to fetch options orderbook" });
    }
  });

  // Market snapshot for open options (authenticated users)
  app.get("/api/options/market", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { commodity, window, limit } = req.query as {
        commodity?: string;
        window?: string;
        limit?: string;
      };

      const parsedLimit = Math.min(Math.max(Number(limit) || 0, 1), 50) || 10;

      const baseWhere: any[] = [eq(options.status, "OPEN")];

      if (commodity) {
        baseWhere.push(sql`${options.commodity} = ${commodity}`);
      }

      // Add window filter only if column exists
      // Use raw SQL to avoid referencing optional columns that might be missing
      const conditions = [
        sql`o.status = 'OPEN'`
      ];

      if (commodity) {
        conditions.push(sql`o.commodity = ${commodity}`);
      }

      const whereSql = sql.join(conditions, sql` AND `);

      const rowsResult = await db.execute(
        sql`
          SELECT
            o.id,
            o.type,
            o.strike,
            o.qty,
            o.premium,
            o.status,
            o.commodity,
          COALESCE(i.name, o.commodity, i.slug, o.title, 'Unknown') AS "commodityLabel",
          COALESCE(o.commodity, i.slug) AS "commoditySlug",
            o.expiration_date AS "expirationDate",
            NULL::text AS "expiryWindow",
            NULL::timestamptz AS "windowStart",
            NULL::timestamptz AS "windowEnd",
            NULL::timestamptz AS "settlementDate",
            o.created_at AS "createdAt",
            o.issuer_id AS "issuerId",
            i.name AS "indexName",
            i.slug AS "indexSlug"
          FROM options o
          LEFT JOIN indexes i ON o.index_id = i.id
          WHERE ${whereSql}
          ORDER BY COALESCE(o.expiration_date, o.created_at) ASC, o.strike ASC, o.premium ASC
          LIMIT ${parsedLimit}
        `
      );

      const rows = (rowsResult as any).rows ?? [];

      const marketRows = rows.map((opt: any) => mapOptionToMarketRow(opt as any));

      res.json({ options: marketRows });
    } catch (error: any) {
      console.error("[Options Market] Error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch market options" });
    }
  });

  app.get("/api/options/:id/json", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const option = await storage.getOptionById(id);
      if (!option) {
        return res.status(404).json({ error: "Option not found" });
      }
      const payload =
        option.contractJson ||
        JSON.stringify(serializeOptionToJson(option));
      res.json({
        schemaVersion: option.schemaVersion || "v1",
        contractJson: JSON.parse(payload),
      });
    } catch (error: any) {
      console.error("[GET_OPTION_JSON] Error:", error);
      res.status(500).json({ error: "Failed to load option JSON" });
    }
  });

  app.post("/api/options", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const result = insertOptionSchema.safeParse(req.body);
      
      if (!result.success) {
        const validationError = fromZodError(result.error);
        
        // Log detailed validation error for debugging
        console.error("[CREATE_OPTION_ERROR] Validation failed");
        console.error("Request body:", JSON.stringify(req.body, null, 2));
        console.error("Validation errors:", JSON.stringify(result.error.issues, null, 2));
        
        return res.status(400).json({ 
          error: validationError.message,
          details: result.error.issues 
        });
      }

      // Lookup commodity name from index if indexId is provided
      let commodityName = result.data.commodity;
      let selectedIndex: any = null;
      let selectedLatest: any = null;
      if (result.data.indexId) {
        const found = await getIndexWithLatestById(result.data.indexId);
        if (!found) {
          return res.status(400).json({ 
            error: "Invalid commodity index" 
          });
        }
        selectedIndex = found.index;
        selectedLatest = found.latestPrice;
        const { isStale } = computeIsStale(selectedLatest?.timestamp || null);
        if (isStale) {
          return res.status(400).json({ error: "Trading disabled for this commodity (index is stale)" });
        }
        // Populate commodity field with index name for backward compatibility
        commodityName = selectedIndex.name;
      } else if (commodityName) {
        const foundBySlug = await getIndexWithLatestBySlug(commodityName.toLowerCase());
        if (foundBySlug) {
          const { isStale } = computeIsStale(foundBySlug.latestPrice?.timestamp || null);
          if (isStale) {
            return res.status(400).json({ error: "Trading disabled for this commodity (index is stale)" });
          }
        }
      }

      // Compute expiry window if provided (prefer half/month/year over raw dates)
      const { expiryHalf, expiryMonth, expiryYear } = req.body as any;
      let windowComputed: {
        expiryWindow?: string;
        windowStart?: Date;
        windowEnd?: Date;
        settlementDate?: Date;
        expirationDate?: Date;
      } = {};

      if (expiryHalf && expiryMonth && expiryYear) {
        try {
          const window = computeExpiryWindow({
            half: expiryHalf,
            month: Number(expiryMonth),
            year: Number(expiryYear),
          });
          windowComputed = {
            expiryWindow: window.label,
            windowStart: window.windowStart,
            windowEnd: window.windowEnd,
            settlementDate: window.settlementDate,
            expirationDate: window.settlementDate,
          };
        } catch (err) {
          console.error("[CREATE_OPTION] Invalid expiry window input", err);
          return res.status(400).json({ error: "Invalid expiry window" });
        }
      }

      // Set the issuer ID and commodity name
      // Ensure all required fields are present and properly formatted
      const optionData: any = {
        ...result.data,
        ...windowComputed,
        commodity: commodityName,
        issuerId: req.user!.id,
        // Ensure status is set (default is OPEN, but explicit is better)
        status: result.data.status || 'OPEN',
        usePremiumAsMargin: result.data.usePremiumAsMargin ?? false,
      };

      // Ensure expirationDate is a Date object (Zod should handle this, but double-check)
      let expirationDate: Date | undefined;
      if (result.data.expirationDate) {
        expirationDate = result.data.expirationDate instanceof Date 
          ? result.data.expirationDate 
          : new Date(result.data.expirationDate);
        optionData.expirationDate = expirationDate;
      }

      // Calculate notional value once - will be reused for both collateral calculation and platform fee
      // notional = strike * quantity in tons (result is in USD)
      // This is always calculated regardless of whether collateral is needed, as it's also used for platform fee
      const strikePerTon = parseFloat(result.data.strike); // Already in $/ton
      const quantityTons = parseFloat(result.data.qty); // Already in tons
      
      // Validate inputs before computing notional (computeNotional throws if negative)
      if (isNaN(strikePerTon) || isNaN(quantityTons) || strikePerTon < 0 || quantityTons < 0) {
        return res.status(400).json({
          error: "Invalid strike or quantity",
          details: `Strike: ${strikePerTon}, Quantity: ${quantityTons}`
        });
      }
      
      const notional = computeNotional(strikePerTon, quantityTons);
      
      // Initial margin calculation using margin engine (SHORT side)
      const premiumPerTon = parseFloat(result.data.premium);
      const totalPremium = premiumPerTon * quantityTons;
      if (expirationDate) {
        const baseInitialMargin = calculateInitialMargin({
          strike: strikePerTon,
          quantityTon: quantityTons,
          settlementDate: expirationDate,
          currentDate: new Date(),
        });
        const effectiveInitialMargin = optionData.usePremiumAsMargin
          ? Math.max(0, baseInitialMargin - totalPremium)
          : baseInitialMargin;
        optionData.initialMargin = effectiveInitialMargin.toFixed(8);
        optionData.collateralAmount = optionData.initialMargin;
      }

      // Remove any undefined values that might cause issues with Drizzle
      Object.keys(optionData).forEach(key => {
        if (optionData[key] === undefined) {
          delete optionData[key];
        }
      });

      // Log option data before insertion for debugging
      console.log("[CREATE_OPTION] Attempting to create option with data:", {
        type: optionData.type,
        strike: optionData.strike,
        qty: optionData.qty,
        premium: optionData.premium,
        indexId: optionData.indexId,
        commodity: optionData.commodity,
        issuerId: optionData.issuerId,
        expirationDate: optionData.expirationDate,
        expirationDateType: typeof optionData.expirationDate,
        status: optionData.status,
        hasCollateralAmount: !!optionData.collateralAmount,
      });

      // Freeze collateral for the seller (issuer) before creating the option
      const requiredCollateral = parseFloat(optionData.initialMargin || optionData.collateralAmount || "0");
      
      if (requiredCollateral > 0) {
        // Get or create seller's CROPT balance with row lock
        const [sellerBalance] = await db
          .select()
          .from(croptBalances)
          .where(eq(croptBalances.userId, req.user!.id))
          .for('update')
          .limit(1);

        // NOTE: For demo, we don't actually freeze collateral in DB (locked_collateral column doesn't exist)
        // Instead, we just check that the user has enough balance
        // The collateralAmount is stored on the option record and used for portfolio calculations
        const currentBalance = sellerBalance ? parseFloat(sellerBalance.balance) : 0;

        if (currentBalance < requiredCollateral) {
          return res.status(400).json({
            error: "Insufficient collateral",
            details: `Required: ${requiredCollateral.toFixed(2)} CROPT, Available: ${currentBalance.toFixed(2)} CROPT`
          });
        }

        // For demo: we don't actually lock the balance in DB
        // The collateralAmount on the option is used for portfolio display
        console.log(`[CREATE_OPTION] Option requires ${requiredCollateral.toFixed(2)} CROPT collateral (stored on option, not frozen in DB for demo)`);
      }

      // Create the option - this is the critical operation that must succeed
      // If this fails, we want to return 500
      let createdOption;
      try {
        createdOption = await storage.createOption(optionData);
      } catch (createError: any) {
        console.error("[CREATE_OPTION_ERROR] Failed to create option row", createError);
        console.error("[CREATE_OPTION_ERROR] Request body:", JSON.stringify(req.body, null, 2));
        console.error("[CREATE_OPTION_ERROR] Error type:", createError?.constructor?.name || typeof createError);
        console.error("[CREATE_OPTION_ERROR] Error message:", createError?.message || String(createError));
        console.error("[CREATE_OPTION_ERROR] Error stack:", createError?.stack);
        if (createError?.code) {
          console.error("[CREATE_OPTION_ERROR] Error code:", createError.code);
        }
        return res.status(500).json({ 
          error: "Failed to create option",
          details: createError?.message || String(createError)
        });
      }
      
      // IMPORTANT: Platform fee insertion is NON-FATAL
      // Option creation has already succeeded, so fee logging failures should not cause 500
      // This block is completely isolated from the main flow and NEVER throws
      try {
        // Record platform fee (TODO: implement actual fee calculation policy)
        // For now, storing 0 as placeholder
        const feeAmount = 0; // TODO: implement fee calculation (e.g., premium * 0.001 for 0.1%)
        
        // Compute and validate notionalAmount before attempting insert
        // notional was already calculated above (strikePerTon * quantityTons)
        let notionalAmount: string | null = null;
        
        if (typeof notional === 'number' && Number.isFinite(notional) && !Number.isNaN(notional) && notional > 0) {
          notionalAmount = notional.toFixed(8);
        } else {
          console.error('[CREATE_OPTION] Invalid notional for platform fee (skipping insert)', { 
            strikePerTon, 
            quantityTons, 
            notional,
            optionId: createdOption.id 
          });
        }
        
        // Only attempt insert if we have a valid notionalAmount
        if (!notionalAmount) {
          console.warn("[CREATE_OPTION] Skipping platform_fees insert due to missing/invalid notionalAmount");
        } else {
          // Insert platform fee - ensure fee_type (mapped from 'type' field) is always set
          // The schema maps 'type' field to 'fee_type' column in DB
          // notionalAmount maps to 'notional_amount' column via Drizzle schema
          const feeData = {
            userId: req.user!.id,
            type: 'matching_fee' as const,
            amount: feeAmount.toFixed(8),
            notionalAmount: notionalAmount, // Required: quantity * strike in USD (as string for decimal)
            currency: 'CROPT' as const,
            instrument: createdOption.id,
            txId: null,
            // role is optional - only include if user has one
            ...(req.user!.role && { role: req.user!.role }),
          };
          
          // Final validation before insert - double check notionalAmount is present
          if (!feeData.notionalAmount || feeData.notionalAmount === 'NaN' || feeData.notionalAmount === 'null' || feeData.notionalAmount === '') {
            console.error('[CREATE_OPTION] Invalid notionalAmount in feeData (skipping fee insert)', { 
              feeData, 
              optionId: createdOption.id,
              notionalAmountValue: feeData.notionalAmount
            });
          } else {
            try {
              await db.insert(platformFees).values(feeData);
              console.log(`[CREATE_OPTION] Platform fee recorded for option ${createdOption.id}, userId=${req.user!.id}, fee_type=matching_fee, notionalAmount=${notionalAmount}, role=${req.user!.role || 'none'}`);
            } catch (feeError: any) {
              // Log error but don't fail the request - option was already created successfully
              console.error("[CREATE_OPTION] Failed to insert platform fee (non-fatal):", feeError?.message || feeError);
              console.error("[CREATE_OPTION] Fee data attempted:", JSON.stringify(feeData, null, 2));
              if (feeError?.code) {
                console.error("[CREATE_OPTION] Fee error code:", feeError.code);
              }
              
              // Try once more without role if it's a role-related error
              if (feeError?.code === '42703' || feeError?.message?.includes('role') || feeError?.message?.includes('does not exist')) {
                try {
                  console.warn("[CREATE_OPTION] Retrying platform fee insert without role column");
                  const { role, ...feeDataWithoutRole } = feeData;
                  // Ensure notionalAmount is still present after removing role
                  if (feeDataWithoutRole.notionalAmount) {
                    await db.insert(platformFees).values(feeDataWithoutRole);
                    console.log(`[CREATE_OPTION] Platform fee recorded (retry without role) for option ${createdOption.id}`);
                  } else {
                    console.error('[CREATE_OPTION] notionalAmount missing after removing role', { feeDataWithoutRole });
                  }
                } catch (retryError: any) {
                  // Even retry failed - log but continue
                  console.error("[CREATE_OPTION] Retry also failed (non-fatal):", retryError?.message || retryError);
                  if (retryError?.code) {
                    console.error("[CREATE_OPTION] Retry error code:", retryError.code);
                  }
                }
              }
              // DO NOT re-throw - option creation succeeded, fee logging is secondary
            }
          }
        }
      } catch (feeBlockError: any) {
        // Catch any unexpected errors in the entire fee insertion block
        // This should never happen, but if it does, we log and continue
        console.error("[CREATE_OPTION] Unexpected error in fee insertion block (non-fatal):", feeBlockError?.message || feeBlockError);
        console.error("[CREATE_OPTION] Fee block error stack:", feeBlockError?.stack);
        if (feeBlockError?.code) {
          console.error("[CREATE_OPTION] Fee block error code:", feeBlockError.code);
        }
        // DO NOT re-throw - option was created successfully
      }
      
      // Always return success if option was created
      // This line must be reached regardless of fee insertion success/failure
      res.status(201).json(createdOption);
    } catch (error: any) {
      // This catch block should only catch errors from validation, collateral checks, or option creation
      // Fee insertion errors are already handled above and should never reach here
      console.error("[CREATE_OPTION_ERROR] Unexpected error in option creation handler");
      console.error("Request body:", JSON.stringify(req.body, null, 2));
      console.error("Error type:", error?.constructor?.name || typeof error);
      console.error("Error message:", error?.message || String(error));
      console.error("Error stack:", error?.stack);
      if (error?.code) {
        console.error("Error code:", error.code);
      }
      res.status(500).json({ 
        error: "Failed to create option",
        details: error?.message || String(error)
      });
    }
  });

  app.post("/api/options/:id/match", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Only brokers/admin can manually match options
      const hasAccess = hasBrokerPermissions(req.user?.role);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9954e01e-166a-402a-b350-ebd5f6863d16',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'run1',hypothesisId:'H2-match-role',location:'routes.ts:/api/options/:id/match',message:'match attempt role check',data:{user:req.user,hasAccess},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (!hasAccess) {
        return res.status(403).json({ error: "Only brokers can match options" });
      }

      const matchSchema = z.object({
        counterpartyId: z.string().min(1, "Counterparty ID is required"),
      });

      const result = matchSchema.safeParse(req.body);
      
      if (!result.success) {
        const validationError = fromZodError(result.error);
        return res.status(400).json({ 
          error: validationError.message 
        });
      }

      const option = await storage.matchOption(
        req.params.id, 
        result.data.counterpartyId,
        req.user.id
      );
      res.status(200).json(option);
    } catch (error: any) {
      console.error("Error matching option:", error);
      const statusCode = error.message?.includes("not found") || 
                        error.message?.includes("not open") || 
                        error.message?.includes("cannot be the same") 
                        ? 400 : 500;
      res.status(statusCode).json({ error: error.message || "Failed to match option" });
    }
  });

  app.get("/api/trades", async (req, res) => {
    try {
      const trades = await storage.listTrades();
      res.json(trades);
    } catch (error) {
      console.error("Error fetching trades:", error);
      res.status(500).json({ error: "Failed to fetch trades" });
    }
  });

  app.post("/api/options/:id/exercise", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const exerciseSchema = z.object({
        spotPrice: z.coerce.number().positive("Spot price must be positive"),
      });

      const result = exerciseSchema.safeParse(req.body);
      
      if (!result.success) {
        const validationError = fromZodError(result.error);
        return res.status(400).json({ 
          error: validationError.message 
        });
      }

      const settlement = await storage.exerciseOption(
        req.params.id,
        req.user.id,
        result.data.spotPrice.toString()
      );
      
      res.status(200).json(settlement);
    } catch (error: any) {
      console.error("Error exercising option:", error);
      const message: string = error.message || "Failed to exercise option";

      const isClientError =
        error.statusCode === 400 ||
        message.includes("not found") ||
        message.includes("Only") ||
        message.includes("Insufficient CROPT balance") ||
        message.includes("Counterparty has insufficient CROPT balance");

      const statusCode = isClientError ? 400 : 500;
      res.status(statusCode).json({ error: message });
    }
  });

  app.get("/api/settlements", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const settlements = await storage.listSettlements();
      res.json(settlements);
    } catch (error) {
      console.error("Error fetching settlements:", error);
      res.status(500).json({ error: "Failed to fetch settlements" });
    }
  });

  app.get("/api/transactions", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const transactions = await storage.listTransactions();
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  // POST /api/jobs/run-margin-check - Run margin check on open options
  app.post("/api/jobs/run-margin-check", async (req, res) => {
    try {
      const marginCheckSchema = z.object({
        date: z.string().optional(),
        commodity: z.string().optional(),
        indexPrice: z.coerce.number().optional(),
      });

      const result = marginCheckSchema.safeParse(req.body);
      
      if (!result.success) {
        const validationError = fromZodError(result.error);
        return res.status(400).json({ 
          error: validationError.message 
        });
      }

      const { commodity, indexPrice } = result.data;
      
      // Default index price if not provided (using a default value for demo)
      const currentIndexPrice = indexPrice ?? 100;

      // Get all OPEN options, filtered by commodity if provided
      const allOptions = await storage.listOptions();
      const openOptions = allOptions.filter(option => {
        const isOpen = option.status === "OPEN";
        const matchesCommodity = !commodity || option.commodity === commodity;
        return isOpen && matchesCommodity;
      });

      const marginCalls: any[] = [];
      const createdNotifications: any[] = [];

      // Process each open option
      for (const option of openOptions) {
        const strikePrice = parseFloat(option.strike || "0");
        const qty = parseFloat(option.qty || "0");
        const collateral = parseFloat(option.collateralAmount || "0");
        const lastIntrinsic = parseFloat(option.lastIntrinsic || "0");

        // Calculate intrinsic value using utility function
        const intrinsicValue = intrinsic(option.type, currentIndexPrice, strikePrice, qty);

        // Calculate P&L
        const pnl = lastIntrinsic > 0 ? intrinsicValue - lastIntrinsic : intrinsicValue;
        
        // Update option with new intrinsic and accumulated payout
        const currentPayout = parseFloat(option.payoutAccumulated || "0");
        const newPayoutAccumulated = currentPayout + pnl;

        await storage.updateOption(option.id, {
          lastIntrinsic: intrinsicValue.toFixed(8),
          payoutAccumulated: newPayoutAccumulated.toFixed(8),
        });

        // Check margin rule using utility function
        if (collateral > 0 && shouldTriggerMargin(intrinsicValue, collateral)) {
          const amountRequired = calculateMarginCallAmount(intrinsicValue, collateral);
          
          // Determine responsible party (issuer/seller, not buyer)
          const responsibleUserId = option.issuerId || option.seller;
          
          if (!responsibleUserId) {
            console.warn(`Option ${option.id} has no issuer or seller, skipping margin call`);
            continue;
          }
          
          // Check for existing open margin call for this option/user pair
          const allMarginCalls = await storage.listMarginCalls();
          const existingMarginCall = allMarginCalls.find(
            mc => mc.optionId === option.id && 
                  mc.userId === responsibleUserId && 
                  mc.status === "PENDING"
          );
          
          let marginCall;
          if (existingMarginCall) {
            // Update existing margin call with latest calculations
            marginCall = await storage.updateMarginCall(existingMarginCall.id, {
              amountRequired: amountRequired.toFixed(8),
              intrinsicValue: intrinsicValue.toFixed(8),
              collateralAmount: collateral.toFixed(8),
            });
          } else {
            // Create new margin call
            marginCall = await storage.createMarginCall({
              optionId: option.id,
              userId: responsibleUserId,
              amountRequired: amountRequired.toFixed(8),
              intrinsicValue: intrinsicValue.toFixed(8),
              collateralAmount: collateral.toFixed(8),
            });
            
            // Send email notification for new margin call
            const responsibleUser = await findUserById(responsibleUserId);
            if (responsibleUser && marginCall.deadline) {
              await emailService.sendMarginCallEmail(
                responsibleUser.email,
                responsibleUser.email.split('@')[0], // Use email prefix as name
                option.id,
                amountRequired.toFixed(2),
                marginCall.deadline
              );
            }
          }
          
          // Add to response array (whether new or updated)
          marginCalls.push(marginCall);

          // Create notification for buyer (check for duplicates)
          if (option.buyerId) {
            const existingBuyerNotifications = await storage.listNotifications(option.buyerId);
            const hasBuyerNotification = existingBuyerNotifications.some(
              n => n.type === "MARGIN_CALL" && n.relatedId === marginCall.id && n.read === "false"
            );
            
            if (!hasBuyerNotification) {
              const buyerNotification = await storage.createNotification({
                userId: option.buyerId,
                type: "MARGIN_CALL",
                message: `Margin call triggered for option ${option.title}. Amount required: ${amountRequired.toFixed(8)}`,
                relatedId: marginCall.id,
              });
              createdNotifications.push(buyerNotification);
            }
          }

          // Create notification for issuer/seller (check for duplicates and prevent duplicate if same as buyer)
          if (responsibleUserId !== option.buyerId) {
            const existingIssuerNotifications = await storage.listNotifications(responsibleUserId);
            const hasIssuerNotification = existingIssuerNotifications.some(
              n => n.type === "MARGIN_CALL" && n.relatedId === marginCall.id && n.read === "false"
            );
            
            if (!hasIssuerNotification) {
              const issuerNotification = await storage.createNotification({
                userId: responsibleUserId,
                type: "MARGIN_CALL",
                message: `Margin call triggered for option ${option.title}. Amount required: ${amountRequired.toFixed(8)}`,
                relatedId: marginCall.id,
              });
              createdNotifications.push(issuerNotification);
            }
          }
        }
      }

      res.json({
        marginCalls,
        optionsProcessed: openOptions.length,
        indexPrice: currentIndexPrice,
        commodity: commodity || "all",
      });
    } catch (error: any) {
      console.error("Error running margin check:", error);
      res.status(500).json({ error: error.message || "Failed to run margin check" });
    }
  });

  // POST /api/jobs/daily-settle - Daily settlement with margin call generation
  app.post("/api/jobs/daily-settle", async (req, res) => {
    try {
      const dailySettleSchema = z.object({
        date: z.string().optional(),
        commodity: z.string().optional(),
        indexPrice: z.coerce.number(),
      });

      const result = dailySettleSchema.safeParse(req.body);
      
      if (!result.success) {
        const validationError = fromZodError(result.error);
        return res.status(400).json({ 
          error: validationError.message 
        });
      }

      const { commodity, indexPrice } = result.data;

      // Get all OPEN options, filtered by commodity if provided
      const allOptions = await storage.listOptions();
      const openOptions = allOptions.filter(option => {
        const isOpen = option.status === "OPEN";
        const matchesCommodity = !commodity || option.commodity === commodity;
        return isOpen && matchesCommodity;
      });

      const marginCalls: any[] = [];
      const processedOptions: any[] = [];
      const errors: any[] = [];

      // Process each open option
      for (const option of openOptions) {
        try {
          const strikePrice = parseFloat(option.strike || "0");
          const qty = parseFloat(option.qty || "0");
          const collateral = parseFloat(option.collateralAmount || "0");

          // Calculate intrinsic value
          const intrinsicValue = intrinsic(option.type, indexPrice, strikePrice, qty);

          // Calculate P&L (simplified: just intrinsic value for now)
          const pnl = intrinsicValue;

          // Check if pnl exceeds 0.8 * collateral
          const threshold = 0.8 * collateral;
          
          if (collateral > 0 && pnl > threshold) {
            // Determine responsible party (issuer/seller)
            const responsibleUserId = option.issuerId || option.seller;
            
            if (!responsibleUserId) {
              errors.push({
                optionId: option.id,
                error: "No issuer or seller found for option"
              });
              continue;
            }

            // Check for existing open margin call for this option
            const allMarginCalls = await storage.listMarginCalls();
            const existingMarginCall = allMarginCalls.find(
              mc => mc.optionId === option.id && 
                    mc.userId === responsibleUserId && 
                    mc.status === "PENDING"
            );

            let marginCall;
            if (!existingMarginCall) {
              // Calculate amount required to restore margin
              const amountRequired = calculateMarginCallAmount(intrinsicValue, collateral);
              
              // Create new margin call with 24h deadline
              marginCall = await storage.createMarginCall({
                optionId: option.id,
                userId: responsibleUserId,
                amountRequired: amountRequired.toFixed(8),
                intrinsicValue: intrinsicValue.toFixed(8),
                collateralAmount: collateral.toFixed(8),
              });

              marginCalls.push(marginCall);

              // Update option status to MARGIN_CALL
              await storage.updateOption(option.id, {
                status: "MARGIN_CALL",
              });

              processedOptions.push({
                optionId: option.id,
                intrinsicValue,
                collateral,
                pnl,
                threshold,
                marginCallId: marginCall.id,
                status: "MARGIN_CALL",
              });
            } else {
              // Existing margin call - don't create duplicate
              processedOptions.push({
                optionId: option.id,
                intrinsicValue,
                collateral,
                pnl,
                threshold,
                status: "EXISTING_MARGIN_CALL",
                marginCallId: existingMarginCall.id,
              });
            }
          } else {
            processedOptions.push({
              optionId: option.id,
              intrinsicValue,
              collateral,
              pnl,
              threshold,
              status: "OK",
            });
          }
        } catch (error: any) {
          errors.push({
            optionId: option.id,
            error: error.message || "Failed to process option"
          });
        }
      }

      res.json({
        processedCount: openOptions.length,
        marginCalls,
        processedOptions,
        errors,
        indexPrice,
        commodity: commodity || "all",
      });
    } catch (error: any) {
      console.error("Error running daily settle:", error);
      res.status(500).json({ error: error.message || "Failed to run daily settle" });
    }
  });

  // GET /api/margin-calls - List margin calls (admin sees all, non-admin sees their own)
  app.get("/api/margin-calls", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { status } = req.query;
      const isAdmin = hasBrokerPermissions(req.user?.role); // Broker/super_admin roles act as admin
      
      let marginCalls;
      if (isAdmin) {
        // Admin sees all margin calls
        marginCalls = await storage.listMarginCalls();
      } else {
        // Non-admin sees only their own margin calls
        marginCalls = await storage.getMarginCallsByUser(req.user.id);
      }
      
      // Filter by status if provided
      if (status && typeof status === "string") {
        marginCalls = marginCalls.filter(mc => mc.status === status);
      }
      
      res.json(marginCalls);
    } catch (error: any) {
      console.error("Error fetching margin calls:", error);
      res.status(500).json({ error: error.message || "Failed to fetch margin calls" });
    }
  });

  // GET /api/notifications - Get notifications for current user
  app.get("/api/notifications", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { unread } = req.query;
      let notifications = await storage.listNotifications(req.user.id);
      
      // Filter to unread only if requested
      if (unread === "true") {
        notifications = notifications.filter(n => n.read === "false");
      }
      
      res.json(notifications);
    } catch (error: any) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ error: error.message || "Failed to fetch notifications" });
    }
  });

  // POST /api/notifications/:id/mark-read - Mark a notification as read
  app.post("/api/notifications/:id/mark-read", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      
      // Get the notification to verify ownership
      const notifications = await storage.listNotifications(req.user.id);
      const notification = notifications.find(n => n.id === id);
      
      if (!notification) {
        return res.status(404).json({ error: "Notification not found" });
      }
      
      // Update the notification
      const updated = await storage.updateNotification(id, { read: "true" });
      res.json(updated);
    } catch (error: any) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ error: error.message || "Failed to mark notification as read" });
    }
  });

  // POST /api/notifications/send-mock - Admin-only endpoint to create test notifications
  app.post("/api/notifications/send-mock", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { userId, type, message, relatedId } = req.body;
      
      if (!userId || !type || !message) {
        return res.status(400).json({ error: "userId, type, and message are required" });
      }
      
      const validTypes = ["MARGIN_CALL", "OPTION_MATCHED", "OPTION_EXERCISED", "LIQUIDATION", "FORCE_SETTLE"];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(", ")}` });
      }
      
      const notification = await storage.createNotification({
        userId,
        type,
        message,
        relatedId: relatedId || null,
      });
      
      console.log(`[Mock] Test notification sent to user ${userId}: ${message}`);
      res.json(notification);
    } catch (error: any) {
      console.error("Error sending mock notification:", error);
      res.status(500).json({ error: error.message || "Failed to send mock notification" });
    }
  });

  // POST /api/margin-call/:id/topup - Top up reserved collateral for a margin call
  app.post("/api/margin-call/:id/topup", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { amount, currency } = req.body;
      
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: "Valid amount is required" });
      }
      
      // Validate currency if provided (CROPT or FIAT)
      if (currency && !["CROPT", "FIAT"].includes(currency)) {
        return res.status(400).json({ error: "Currency must be CROPT or FIAT" });
      }
      
      // Get the margin call
      const marginCall = await storage.getMarginCallById(id);
      if (!marginCall) {
        return res.status(404).json({ error: "Margin call not found" });
      }
      
      // Verify the user is the responsible party
      if (marginCall.userId !== req.user.id) {
        return res.status(403).json({ error: "Not authorized to top up this margin call" });
      }
      
      // Verify the margin call is pending
      if (marginCall.status !== "PENDING") {
        return res.status(400).json({ error: "Margin call is not in PENDING status" });
      }
      
      // Calculate new reserved collateral
      const currentReserved = parseFloat(marginCall.reservedCollateral || "0");
      const topupAmount = parseFloat(amount);
      const newReserved = currentReserved + topupAmount;
      
      // Calculate total available collateral
      const currentCollateral = parseFloat(marginCall.collateralAmount);
      const totalAvailable = currentCollateral + newReserved;
      const amountRequired = parseFloat(marginCall.amountRequired);
      
      // Determine if margin call should be resolved
      const shouldResolve = totalAvailable >= amountRequired;
      
      // Update margin call
      const updatedMarginCall = await storage.updateMarginCall(id, {
        reservedCollateral: newReserved.toFixed(8),
        status: shouldResolve ? "RESOLVED" : "PENDING",
      });
      
      // If resolved, update option status back to OPEN
      if (shouldResolve) {
        if (!marginCall.optionId) {
          throw new Error("Margin call is missing optionId");
        }
        await storage.updateOption(marginCall.optionId, {
          status: "OPEN",
        });
      }
      
      res.json({
        marginCall: updatedMarginCall,
        resolved: shouldResolve,
        totalAvailable: totalAvailable.toFixed(8),
        amountRequired: amountRequired.toFixed(8),
      });
    } catch (error: any) {
      console.error("Error topping up margin call:", error);
      res.status(500).json({ error: error.message || "Failed to top up margin call" });
    }
  });

  // POST /api/options/:id/force-settle - Force settle an option (admin only)
  app.post("/api/options/:id/force-settle", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // Only brokers (admin) can force-settle
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Only brokers can force-settle options" });
      }
      
      if (!reason || typeof reason !== "string") {
        return res.status(400).json({ error: "Reason is required" });
      }
      
      const result = await storage.forceSettleOption(id, req.user.id, reason);
      
      res.json({
        option: result.option,
        transaction: result.transaction,
        notificationsCreated: result.notifications.length,
      });
    } catch (error: any) {
      console.error("Error force-settling option:", error);
      const statusCode = error.message?.includes("not found") ? 404 : 500;
      res.status(statusCode).json({ error: error.message || "Failed to force-settle option" });
    }
  });

  // POST /api/admin/run-demo - Run demo scenario seeding (broker only)
  app.post("/api/admin/run-demo", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // Only brokers (admin) can run demo scenario
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Only brokers can run demo scenarios" });
      }
      
      // Import and run seed script
      const { seedDemoData } = await import("./scripts/seedDemo");
      const results = await seedDemoData();
      
      res.json({
        message: "Demo scenario seeded successfully",
        results,
      });
    } catch (error: any) {
      console.error("Error running demo scenario:", error);
      res.status(500).json({ error: error.message || "Failed to run demo scenario" });
    }
  });

  // POST /api/admin/schedule/process-deadlines - Manually trigger deadline processor (broker only)
  app.post("/api/admin/schedule/process-deadlines", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Only brokers can trigger deadline processing" });
      }
      
      const results = await processDeadlines();
      
      res.json(results);
    } catch (error: any) {
      console.error("Error processing deadlines:", error);
      res.status(500).json({ error: error.message || "Failed to process deadlines" });
    }
  });

  // POST /api/jobs/process-deadlines - Process expired margin calls (manual trigger, admin/broker only)
  app.post("/api/jobs/process-deadlines", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // Only brokers (admin) can manually trigger deadline processing
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Only brokers can process deadlines" });
      }
      
      // Get expired margin calls
      const expiredMarginCalls = await storage.getExpiredMarginCalls();
      
      const processedOptions: any[] = [];
      const errors: any[] = [];
      
      // Force-settle each option with expired margin call
      for (const marginCall of expiredMarginCalls) {
        try {
          const reason = `Margin call deadline expired (${marginCall.deadline}). Collateral insufficient.`;
          
          if (!marginCall.optionId) {
            throw new Error(`Margin call ${marginCall.id} is missing optionId`);
          }
          const result = await storage.forceSettleOption(
            marginCall.optionId,
            "system",
            reason
          );
          
          // Update margin call status to LIQUIDATED
          await storage.updateMarginCall(marginCall.id, {
            status: "LIQUIDATED",
          });
          
          processedOptions.push({
            optionId: marginCall.optionId,
            marginCallId: marginCall.id,
            status: result.option.status,
            transactionId: result.transaction.id,
          });
        } catch (error: any) {
          console.error(`Error processing margin call ${marginCall.id}:`, error);
          errors.push({
            marginCallId: marginCall.id,
            optionId: marginCall.optionId,
            error: error.message,
          });
        }
      }
      
      res.json({
        processedCount: processedOptions.length,
        expiredMarginCalls: expiredMarginCalls.length,
        processedOptions,
        errors,
      });
    } catch (error: any) {
      console.error("Error processing deadlines:", error);
      res.status(500).json({ error: error.message || "Failed to process deadlines" });
    }
  });

  // POST /api/jobs/process-overdue-margincalls - Process expired margin calls with settlements (broker only)
  app.post("/api/jobs/process-overdue-margincalls", authenticateToken, async (req: AuthRequest, res) => {
    try {
      // Only brokers can process overdue margin calls
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Only brokers can process overdue margin calls" });
      }
      
      // Get expired margin calls (deadline < now, status PENDING)
      const expiredMarginCalls = await storage.getExpiredMarginCalls();
      
      const processedOptions: any[] = [];
      const errors: any[] = [];
      
      console.log(`Processing ${expiredMarginCalls.length} overdue margin calls...`);
      
      // Process each expired margin call
      for (const marginCall of expiredMarginCalls) {
        try {
          if (!marginCall.optionId) {
            throw new Error(`Margin call ${marginCall.id} is missing optionId`);
          }
          // Get the option
          const option = await storage.getOptionById(marginCall.optionId);
          if (!option) {
            throw new Error("Option not found");
          }
          
          // Calculate intrinsic value payout, accounting for collateral
          const intrinsicValue = parseFloat(option.lastIntrinsic || "0");
          const collateral = parseFloat(option.collateralAmount || "0");
          const reservedCollateral = parseFloat(marginCall.reservedCollateral || "0");
          const totalAvailableCollateral = collateral + reservedCollateral;
          
          // Payout is intrinsic value minus what's covered by available collateral
          // If collateral is insufficient, the seller defaults and buyer gets max(intrinsic - collateral, 0)
          const netPayout = Math.max(0, intrinsicValue - totalAvailableCollateral);
          
          // Premium paid by buyer
          const qty = parseFloat(option.qty);
          const premiumPaid = parseFloat(option.premium) * qty;
          
          // Profit/Loss for buyer = payout - premium paid
          const profitLoss = netPayout - premiumPaid;
          
          // Create settlement record
          const [settlement] = await db
            .insert(settlements)
            .values({
              optionId: option.id,
              exercisedBy: "system",
              spotPrice: "0", // System settlement, no spot price
              strike: option.strike,
              qty: option.qty,
              payout: netPayout.toFixed(8),
              profitLoss: profitLoss.toFixed(8),
            })
            .returning();
          
          // Update option status to DEFAULTED
          await db
            .update(options)
            .set({ status: "DEFAULTED" })
            .where(eq(options.id, option.id));
          
          // Update margin call status to LIQUIDATED
          await storage.updateMarginCall(marginCall.id, {
            status: "LIQUIDATED",
          });
          
          // Create transaction record for audit
          const transaction = await storage.createTransaction({
            optionId: option.id,
            type: "FORCE_SETTLE",
            fromUserId: option.issuerId || option.seller || null,
            toUserId: option.buyerId || option.buyer,
            amount: netPayout.toFixed(8),
            description: `Overdue margin call liquidated. Deadline: ${marginCall.deadline?.toISOString() || 'unknown'}. Collateral: ${totalAvailableCollateral.toFixed(2)}, Intrinsic: ${intrinsicValue.toFixed(2)}`,
          });
          
          // Create notifications
          if (option.buyerId) {
            await storage.createNotification({
              userId: option.buyerId,
              type: "LIQUIDATION",
              message: `Option ${option.title} was liquidated due to overdue margin call. Net payout: ${netPayout.toFixed(2)}`,
              relatedId: option.id,
            });
          }
          
          const responsibleUserId = option.issuerId || option.seller;
          if (responsibleUserId && responsibleUserId !== option.buyerId) {
            await storage.createNotification({
              userId: responsibleUserId,
              type: "LIQUIDATION",
              message: `Option ${option.title} was liquidated due to overdue margin call. Collateral ${totalAvailableCollateral.toFixed(2)} applied.`,
              relatedId: option.id,
            });
          }
          
          processedOptions.push({
            optionId: marginCall.optionId,
            marginCallId: marginCall.id,
            status: "DEFAULTED",
            settlementId: settlement.id,
            transactionId: transaction.id,
            payout: netPayout.toFixed(8),
            collateralApplied: totalAvailableCollateral.toFixed(8),
            intrinsicValue: intrinsicValue.toFixed(8),
          });
          
          console.log(`✅ Processed overdue margin call ${marginCall.id} for option ${option.title}`);
        } catch (error: any) {
          console.error(`Error processing margin call ${marginCall.id}:`, error);
          errors.push({
            marginCallId: marginCall.id,
            optionId: marginCall.optionId,
            error: error.message,
          });
        }
      }
      
      res.json({
        processedCount: processedOptions.length,
        expiredMarginCalls: expiredMarginCalls.length,
        processedOptions,
        errors,
      });
    } catch (error: any) {
      console.error("Error processing overdue margin calls:", error);
      res.status(500).json({ error: error.message || "Failed to process overdue margin calls" });
    }
  });

  // Admin Reconciliation endpoints
  app.get("/api/admin/reconciliation/transactions", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }
      
      const transactions = await storage.listTransactions();
      res.json(transactions);
    } catch (error: any) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({ error: error.message || "Failed to fetch transactions" });
    }
  });

  app.get("/api/admin/reconciliation/settlements", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }
      
      const settlements = await storage.listSettlements();
      res.json(settlements);
    } catch (error: any) {
      console.error("Error fetching settlements:", error);
      res.status(500).json({ error: error.message || "Failed to fetch settlements" });
    }
  });

  app.get("/api/admin/reconciliation/margincalls", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }
      
      const marginCalls = await storage.listMarginCalls();
      res.json(marginCalls);
    } catch (error: any) {
      console.error("Error fetching margin calls:", error);
      res.status(500).json({ error: error.message || "Failed to fetch margin calls" });
    }
  });

  // GET /api/admin/fees - Get platform fees summary
  app.get("/api/admin/fees", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }
      
      const toRaw = typeof req.query.to === "string" ? req.query.to : undefined;
      const fromRaw = typeof req.query.from === "string" ? req.query.from : undefined;

      const now = new Date();
      const to = toRaw ? new Date(toRaw) : now;
      const from = fromRaw ? new Date(fromRaw) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

      const validTo = Number.isFinite(to.getTime()) ? to : now;
      const validFrom = Number.isFinite(from.getTime())
        ? from
        : new Date(validTo.getTime() - 30 * 24 * 60 * 60 * 1000);

      const allFees = await db
        .select()
        .from(platformFees)
        .where(and(gte(platformFees.createdAt, validFrom), lte(platformFees.createdAt, validTo)));
      const partners = await storage.getPartnerOrganizations();

      const totals = {
        totalFees: 0,
        byType: {} as Record<string, number>,
        byRole: {} as Record<string, number>,
        byInstrument: {} as Record<string, number>,
      };

      const seriesByDay = new Map<string, { total: number; OPTION: number; FORWARD: number }>();

      for (const fee of allFees) {
        const amount = parseFloat(fee.amount);
        if (!Number.isFinite(amount)) continue;
        totals.totalFees += amount;

        const type = fee.type || "unknown";
        totals.byType[type] = (totals.byType[type] || 0) + amount;

        const role = fee.role || "unknown";
        totals.byRole[role] = (totals.byRole[role] || 0) + amount;

        const instrumentTypeRaw = (fee as any).instrumentType || "OPTION";
        const instrumentType = String(instrumentTypeRaw).toUpperCase() === "FORWARD" ? "FORWARD" : "OPTION";
        totals.byInstrument[instrumentType] = (totals.byInstrument[instrumentType] || 0) + amount;

        const dayKey = new Date(fee.createdAt).toISOString().slice(0, 10);
        const existing = seriesByDay.get(dayKey) || { total: 0, OPTION: 0, FORWARD: 0 };
        existing.total += amount;
        existing[instrumentType] += amount;
        seriesByDay.set(dayKey, existing);
      }

      // Partner fee sharing (reporting only)
      const partnerShares = partners.map((p) => {
        const sharePct = parseFloat((p as any).feeSharePercent || "0");
        const clampedPct = Number.isFinite(sharePct) ? Math.min(100, Math.max(0, sharePct)) : 0;
        const partnerShare = (totals.totalFees * clampedPct) / 100;
        return {
          id: p.id,
          name: p.name,
          feeSharePercent: clampedPct,
          partnerShare,
        };
      });

      const totalPartnerShare = partnerShares.reduce((sum, p) => sum + p.partnerShare, 0);
      const platformShare = Math.max(0, totals.totalFees - totalPartnerShare);

      const round2 = (n: number) => Math.round(n * 100) / 100;
      const byInstrument = {
        OPTION: round2(totals.byInstrument["OPTION"] || 0),
        FORWARD: round2(totals.byInstrument["FORWARD"] || 0),
      };

      const byType = Object.fromEntries(
        Object.entries(totals.byType).map(([k, v]) => [k, round2(v)])
      ) as Record<string, number>;

      const byRole = Object.fromEntries(
        Object.entries(totals.byRole).map(([k, v]) => [k, round2(v)])
      ) as Record<string, number>;

      const series = Array.from(seriesByDay.entries())
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([date, v]) => ({
          date,
          totalFees: round2(v.total),
          byInstrument: {
            OPTION: round2(v.OPTION),
            FORWARD: round2(v.FORWARD),
          },
        }));

      res.json({
        totalFees: round2(totals.totalFees),
        byInstrument,
        byType,
        byRole,
        period: {
          from: validFrom.toISOString(),
          to: validTo.toISOString(),
        },
        // Optional time series for charts (daily)
        series,
        // Revenue share model (NOT an attribution model; attribution needs fee->partner mapping)
        // TODO: if platformFees gets partnerId/orgId, replace this with real attribution.
        platformShare: round2(platformShare),
        partnerShares: partnerShares.map((p) => ({
          ...p,
          partnerShare: round2(p.partnerShare),
        })),
      });
    } catch (error: any) {
      console.error("Error fetching platform fees:", error);
      res.status(500).json({ error: error.message || "Failed to fetch platform fees" });
    }
  });

  type AuditInstrumentFilter = "spot" | "options" | "forward" | "all";
  type AuditEntityFilter = "trades" | "settlements" | "marginCalls" | "fees" | "all";
  type AuditInstrumentType = "SPOT" | "OPTION" | "FORWARD";
  type AuditRecord = {
    timestamp: string;
    type: string;
    instrumentType: AuditInstrumentType;
    userIds: string[];
    price?: number;
    qty?: number;
    fee?: number;
    status?: string;
    entityId?: string;
    details?: Record<string, any>;
  };

  function parseDateOrNull(v: unknown) {
    if (typeof v !== "string") return null;
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  function csvEscape(value: unknown) {
    const s = value === null || value === undefined ? "" : String(value);
    const escaped = s.replace(/"/g, '""');
    return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
  }

  function toNum(v: unknown): number | undefined {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(n) ? n : undefined;
  }

  async function buildAuditRecords(params: {
    from: Date;
    to: Date;
    instrument: AuditInstrumentFilter;
    entity: AuditEntityFilter;
    limit: number;
  }): Promise<AuditRecord[]> {
    const { from, to, instrument, entity, limit } = params;
    const records: AuditRecord[] = [];

    const includeEntity = (e: Exclude<AuditEntityFilter, "all">) => entity === "all" || entity === e;
    const includeInstrument = (i: AuditInstrumentFilter) => instrument === "all" || instrument === i;

    // OPTIONS trades
    if (includeEntity("trades") && includeInstrument("options")) {
      const optionTrades = await db
        .select()
        .from(trades)
        .where(and(gte(trades.createdAt, from), lte(trades.createdAt, to)))
        .orderBy(desc(trades.createdAt))
        .limit(limit);

      for (const t of optionTrades) {
        records.push({
          timestamp: new Date(t.createdAt).toISOString(),
          type: "trade",
          instrumentType: "OPTION",
          userIds: [t.buyer, t.seller].filter(Boolean),
          price: toNum(t.strike),
          qty: toNum(t.qty),
          status: "FILLED",
          entityId: t.id,
          details: {
            optionId: t.optionId,
            premium: toNum(t.premium),
            totalValue: toNum(t.totalValue),
          },
        });
      }
    }

    // FORWARD contracts (treated as trades)
    if (includeEntity("trades") && includeInstrument("forward")) {
      const fwContracts = await db
        .select()
        .from(forwardContracts)
        .where(and(gte(forwardContracts.createdAt, from), lte(forwardContracts.createdAt, to)))
        .orderBy(desc(forwardContracts.createdAt))
        .limit(limit);

      for (const c of fwContracts) {
        records.push({
          timestamp: new Date(c.createdAt).toISOString(),
          type: "trade",
          instrumentType: "FORWARD",
          userIds: [c.longUserId || "", c.shortUserId || ""].filter(Boolean),
          price: toNum(c.contractPrice),
          qty: toNum(c.qtyTon),
          status: c.status,
          entityId: c.id,
          details: {
            commodity: c.commodity,
            window: c.window,
            settlementDate: c.settlementDate ? new Date(c.settlementDate).toISOString() : null,
          },
        });
      }
    }

    // OPTIONS settlements
    if (includeEntity("settlements") && includeInstrument("options")) {
      const optionSettlements = await db
        .select()
        .from(settlements)
        .where(and(gte(settlements.createdAt, from), lte(settlements.createdAt, to)))
        .orderBy(desc(settlements.createdAt))
        .limit(limit);

      for (const s of optionSettlements) {
        records.push({
          timestamp: new Date(s.createdAt).toISOString(),
          type: "settlement",
          instrumentType: "OPTION",
          userIds: [s.exercisedBy].filter(Boolean),
          price: toNum(s.spotPrice),
          qty: toNum(s.qty),
          status: "SETTLED",
          entityId: s.id,
          details: {
            optionId: s.optionId,
            strike: toNum(s.strike),
            payout: toNum(s.payout),
            profitLoss: toNum(s.profitLoss),
          },
        });
      }
    }

    // FORWARD settlements (join to contract to get user ids)
    if (includeEntity("settlements") && includeInstrument("forward")) {
      const fwSettles = await db
        .select({
          s: forwardSettlements,
          c: forwardContracts,
        })
        .from(forwardSettlements)
        .leftJoin(forwardContracts, eq(forwardSettlements.forwardContractId, forwardContracts.id))
        .where(and(gte(forwardSettlements.createdAt, from), lte(forwardSettlements.createdAt, to)))
        .orderBy(desc(forwardSettlements.createdAt))
        .limit(limit);

      for (const row of fwSettles) {
        records.push({
          timestamp: new Date(row.s.createdAt).toISOString(),
          type: "settlement",
          instrumentType: "FORWARD",
          userIds: [row.c?.longUserId || "", row.c?.shortUserId || ""].filter(Boolean),
          price: toNum(row.s.settlementPrice),
          qty: toNum(row.s.qtyTon),
          status: "SETTLED",
          entityId: row.s.id,
          fee: toNum(row.s.feesTotal),
          details: {
            forwardContractId: row.s.forwardContractId,
            contractPrice: toNum(row.s.contractPrice),
            pnlLong: toNum(row.s.pnlLong),
            pnlShort: toNum(row.s.pnlShort),
            commodity: row.c?.commodity || null,
            window: row.c?.window || null,
          },
        });
      }
    }

    // Margin calls (option + forward)
    if (includeEntity("marginCalls")) {
      const mcRows = await db
        .select()
        .from(marginCalls)
        .where(and(gte(marginCalls.createdAt, from), lte(marginCalls.createdAt, to)))
        .orderBy(desc(marginCalls.createdAt))
        .limit(limit);

      for (const mc of mcRows) {
        const inst = (mc.instrumentType || "OPTION") === "FORWARD" ? "FORWARD" : "OPTION";
        if (inst === "OPTION" && !includeInstrument("options")) continue;
        if (inst === "FORWARD" && !includeInstrument("forward")) continue;
        records.push({
          timestamp: new Date(mc.createdAt).toISOString(),
          type: "margin_call",
          instrumentType: inst,
          userIds: [mc.userId].filter(Boolean),
          fee: undefined,
          status: mc.status,
          entityId: mc.id,
          details: {
            optionId: mc.optionId,
            forwardContractId: mc.forwardContractId,
            amountRequired: toNum(mc.amountRequired),
            collateralAmount: toNum(mc.collateralAmount),
            reservedCollateral: toNum(mc.reservedCollateral),
            intrinsicValue: toNum(mc.intrinsicValue),
            deadline: mc.deadline ? new Date(mc.deadline).toISOString() : null,
          },
        });
      }
    }

    // Platform fees
    if (includeEntity("fees")) {
      const feeRows = await db
        .select()
        .from(platformFees)
        .where(and(gte(platformFees.createdAt, from), lte(platformFees.createdAt, to)))
        .orderBy(desc(platformFees.createdAt))
        .limit(limit);

      for (const f of feeRows) {
        const inst = (f.instrumentType || "OPTION") === "FORWARD" ? "FORWARD" : "OPTION";
        if (inst === "OPTION" && !includeInstrument("options")) continue;
        if (inst === "FORWARD" && !includeInstrument("forward")) continue;
        records.push({
          timestamp: new Date(f.createdAt).toISOString(),
          type: "fee",
          instrumentType: inst,
          userIds: [f.userId].filter(Boolean),
          fee: toNum(f.amount),
          status: f.type,
          entityId: f.id,
          details: {
            feeType: f.type,
            role: f.role || null,
            notionalAmount: toNum(f.notionalAmount),
            currency: f.currency,
            instrument: f.instrument || null,
            txId: f.txId || null,
          },
        });
      }
    }

    // TODO: SPOT audit (trades/settlements/fees) once spot trades are modeled (currently only spot_positions exist).

    records.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
    return records.slice(0, limit);
  }

  // GET /api/admin/audit - Unified audit feed
  app.get("/api/admin/audit", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }

      const from = parseDateOrNull(req.query.from) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const to = parseDateOrNull(req.query.to) || new Date();
      const instrument = (typeof req.query.instrument === "string" ? req.query.instrument : "all") as AuditInstrumentFilter;
      const entity = (typeof req.query.entity === "string" ? req.query.entity : "all") as AuditEntityFilter;
      const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 500;
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(5000, Math.floor(limitRaw))) : 500;

      const safeInstrument: AuditInstrumentFilter = ["spot", "options", "forward", "all"].includes(instrument)
        ? instrument
        : "all";
      const safeEntity: AuditEntityFilter = ["trades", "settlements", "marginCalls", "fees", "all"].includes(entity)
        ? entity
        : "all";

      const records = await buildAuditRecords({ from, to, instrument: safeInstrument, entity: safeEntity, limit });

      res.json(records);
    } catch (error: any) {
      console.error("Error fetching audit records:", error);
      res.status(500).json({ error: error.message || "Failed to fetch audit records" });
    }
  });

  // GET /api/admin/audit/export - CSV export
  app.get("/api/admin/audit/export", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }

      const from = parseDateOrNull(req.query.from) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const to = parseDateOrNull(req.query.to) || new Date();
      const instrument = (typeof req.query.instrument === "string" ? req.query.instrument : "all") as AuditInstrumentFilter;
      const entity = (typeof req.query.entity === "string" ? req.query.entity : "all") as AuditEntityFilter;
      const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 5000;
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(20000, Math.floor(limitRaw))) : 5000;

      const safeInstrument: AuditInstrumentFilter = ["spot", "options", "forward", "all"].includes(instrument)
        ? instrument
        : "all";
      const safeEntity: AuditEntityFilter = ["trades", "settlements", "marginCalls", "fees", "all"].includes(entity)
        ? entity
        : "all";

      const records = await buildAuditRecords({ from, to, instrument: safeInstrument, entity: safeEntity, limit });

      const headers = ["timestamp", "instrument", "action", "user", "details"].join(",") + "\n";
      const rows = records
        .map((r) => {
          const user = r.userIds.length ? r.userIds.join(";") : "";
          const details = JSON.stringify({
            price: r.price,
            qty: r.qty,
            fee: r.fee,
            status: r.status,
            ...(r.details || {}),
          });
          return [
            csvEscape(r.timestamp),
            csvEscape(r.instrumentType),
            csvEscape(r.type),
            csvEscape(user),
            csvEscape(details),
          ].join(",");
        })
        .join("\n");

      const filename = `audit_${safeEntity}_${safeInstrument}_${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(headers + rows + (rows.length ? "\n" : ""));
    } catch (error: any) {
      console.error("Error exporting audit CSV:", error);
      res.status(500).json({ error: error.message || "Failed to export audit CSV" });
    }
  });

  // GET /api/admin/waitlist/summary - Aggregated waitlist stats
  app.get("/api/admin/waitlist/summary", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }

      const coerceCount = (v: unknown) => {
        if (typeof v === "number") return v;
        if (typeof v === "string") {
          const n = Number(v);
          return Number.isFinite(n) ? n : 0;
        }
        return 0;
      };

      const total = await db.select({ count: sql<number>`count(*)` }).from(waitlistSignups);

      const verified = await db
        .select({ count: sql<number>`count(*)` })
        .from(waitlistSignups)
        .where(sql`${waitlistSignups.verifiedAt} IS NOT NULL`);

      const byRole = await db
        .select({
          role: waitlistSignups.role,
          count: sql<number>`count(*)`,
        })
        .from(waitlistSignups)
        .groupBy(waitlistSignups.role);

      const byCountry = await db
        .select({
          country: waitlistSignups.country,
          count: sql<number>`count(*)`,
        })
        .from(waitlistSignups)
        .groupBy(waitlistSignups.country);

      res.json({
        total: coerceCount(total[0]?.count ?? 0),
        verified: coerceCount(verified[0]?.count ?? 0),
        byRole: byRole.map((r) => ({ ...r, count: coerceCount(r.count) })),
        byCountry: byCountry.map((r) => ({ ...r, count: coerceCount(r.count) })),
      });
    } catch (error: any) {
      console.error("Error fetching waitlist summary:", error);
      res.status(500).json({ error: error.message || "Failed to fetch waitlist summary" });
    }
  });

  // GET /api/admin/waitlist - Waitlist list with pagination/filtering/sorting
  app.get("/api/admin/waitlist", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }

      const {
        page = "1",
        pageSize = "50",
        sortBy = "createdAt",
        sortDir = "desc",
        role,
        country,
        verified,
        q,
      } = req.query as Record<string, string>;

      const pageNum = Math.max(parseInt(page) || 1, 1);
      const sizeNum = Math.min(Math.max(parseInt(pageSize) || 50, 10), 200);

      const sortableColumns: Record<string, any> = {
        createdAt: waitlistSignups.createdAt,
        country: waitlistSignups.country,
        role: waitlistSignups.role,
        name: waitlistSignups.name,
      };

      const sortColumn = sortableColumns[sortBy] || waitlistSignups.createdAt;
      const direction = sortDir === "asc" ? "asc" : "desc";

      const conditions: any[] = [];

      if (role) {
        conditions.push(eq(waitlistSignups.role, role));
      }

      if (country) {
        const c = country.trim();
        if (c) {
          conditions.push(sql`${waitlistSignups.country} ILIKE ${"%" + c + "%"}`);
        }
      }

      if (verified === "true") {
        conditions.push(sql`${waitlistSignups.verifiedAt} IS NOT NULL`);
      } else if (verified === "false") {
        conditions.push(sql`${waitlistSignups.verifiedAt} IS NULL`);
      }

      if (q) {
        const query = q.trim();
        if (query) {
          const pattern = "%" + query + "%";
          conditions.push(
            sql`${waitlistSignups.name} ILIKE ${pattern}
              OR ${waitlistSignups.email} ILIKE ${pattern}
              OR ${waitlistSignups.company} ILIKE ${pattern}`
          );
        }
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      let baseQuery = db.select().from(waitlistSignups);
      if (whereClause) {
        baseQuery = baseQuery.where(whereClause) as any;
      }

      const rows = await baseQuery
        .orderBy(direction === "asc" ? asc(sortColumn) : desc(sortColumn))
        .limit(sizeNum)
        .offset((pageNum - 1) * sizeNum);

      let totalCountQuery = db.select({ count: sql<number>`count(*)` }).from(waitlistSignups);
      if (whereClause) {
        totalCountQuery = totalCountQuery.where(whereClause) as any;
      }
      const totalRows = await totalCountQuery;

      const totalCountRaw = totalRows[0]?.count ?? 0;
      const totalCount =
        typeof totalCountRaw === "number"
          ? totalCountRaw
          : typeof totalCountRaw === "string"
            ? Number(totalCountRaw) || 0
            : 0;

      res.json({
        items: rows,
        page: pageNum,
        pageSize: sizeNum,
        total: totalCount,
      });
    } catch (error: any) {
      console.error("Error fetching waitlist list:", error);
      res.status(500).json({ error: error.message || "Failed to fetch waitlist list" });
    }
  });

  // Feedback endpoints
  app.post("/api/feedback", async (req, res) => {
    try {
      const result = insertFeedbackSchema.safeParse(req.body);
      
      if (!result.success) {
        const validationError = fromZodError(result.error);
        return res.status(400).json({ 
          error: validationError.message 
        });
      }

      const feedbackEntry = await storage.createFeedback(result.data);
      res.status(201).json(feedbackEntry);
    } catch (error) {
      console.error("Error creating feedback:", error);
      res.status(500).json({ error: "Failed to create feedback" });
    }
  });

  app.get("/api/admin/feedback", authenticateToken, async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const user = await findUserById(authReq.user!.id);
      
      if (!hasBrokerPermissions(user?.role)) {
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }

      const allFeedback = await storage.listFeedback();
      res.json(allFeedback);
    } catch (error) {
      console.error("Error fetching feedback:", error);
      res.status(500).json({ error: "Failed to fetch feedback" });
    }
  });

  app.post("/api/admin/feedback/:id/resolve", authenticateToken, async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const user = await findUserById(authReq.user!.id);
      
      if (!hasBrokerPermissions(user?.role)) {
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }

      const { id } = req.params;
      const updatedFeedback = await storage.updateFeedback(id, { status: "resolved" });
      res.json(updatedFeedback);
    } catch (error) {
      console.error("Error resolving feedback:", error);
      res.status(500).json({ error: "Failed to resolve feedback" });
    }
  });

  app.get("/api/admin/feedback/export", authenticateToken, async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const user = await findUserById(authReq.user!.id);
      
      if (!hasBrokerPermissions(user?.role)) {
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }

      const allFeedback = await storage.listFeedback();
      
      // Generate CSV
      const csvHeaders = "ID,Name,Email,Role,Message,Screenshot URL,Status,Created At\n";
      const csvRows = allFeedback.map(f => {
        const escapeCsvField = (field: string | null | undefined) => {
          if (!field) return "";
          const escaped = field.replace(/"/g, '""');
          return escaped.includes(',') || escaped.includes('"') || escaped.includes('\n') 
            ? `"${escaped}"` 
            : escaped;
        };
        
        return [
          escapeCsvField(f.id),
          escapeCsvField(f.name),
          escapeCsvField(f.email),
          escapeCsvField(f.role),
          escapeCsvField(f.message),
          escapeCsvField(f.screenshotUrl),
          escapeCsvField(f.status),
          escapeCsvField(f.createdAt?.toISOString())
        ].join(',');
      }).join('\n');
      
      const csv = csvHeaders + csvRows;
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=feedback-export.csv');
      res.send(csv);
    } catch (error) {
      console.error("Error exporting feedback:", error);
      res.status(500).json({ error: "Failed to export feedback" });
    }
  });

  // Portfolio aggregation endpoint
  app.get("/api/portfolio/me", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // NOTE: locked_collateral column exists in DB (migration 003 applied)
      // However, for demo we compute lockedCollateral from active SHORT positions
      // This ensures consistency and avoids issues if column wasn't applied
      // lockedCollateral is computed from option.collateralAmount for active SHORT positions
      
      let userOptions: any[] = [];
      try {
        // Fetch all options where user is buyer or seller
        userOptions = await storage.getOptionsByUser(userId);
      } catch (error) {
        console.error("Portfolio options query failed", error);
        return res.status(500).json({ error: "Failed to fetch portfolio options" });
      }

      // Fetch settlements for exercised options
      const settlementsData = await storage.listSettlements();

      // Fetch margin calls for user's options
      const marginCalls = await storage.getMarginCallsByUser(userId);
      const activeMarginCalls = marginCalls.filter(mc => 
        mc.status === "PENDING"
      );

      // Get all indexes for price lookup
      const allIndexes = await db.select().from(indexes);
      const indexMap = new Map(allIndexes.map(idx => [idx.slug?.toLowerCase(), idx.id]));

      // Get latest prices for all commodities
      const allLatestPrices = await db
        .select()
        .from(commodityIndexPrices)
        .orderBy(desc(commodityIndexPrices.timestamp));
      
      // Build price map: indexId -> latest price per ton
      const priceMap = new Map<string, number>();
      const seenIndexIds = new Set<string>();
      for (const price of allLatestPrices) {
        if (!seenIndexIds.has(price.indexId)) {
          priceMap.set(price.indexId, parseFloat(price.price));
          seenIndexIds.add(price.indexId);
        }
      }

      let totalPnL = 0;
      let realizedPnL = 0;
      let unrealizedPnL = 0;
      let openPositionsCount = 0;
      const marginCallsCount = activeMarginCalls.length;

      const positions = await Promise.all(userOptions.map(async (option) => {
        // Check both new fields (buyerId/issuerId) and legacy fields (buyer/seller) for backward compatibility
        const isBuyer = option.buyerId === userId || option.buyer === userId;
        const isSeller = option.issuerId === userId || option.seller === userId;
        
        if (!isBuyer && !isSeller) {
          return null; // Skip if user is not involved
        }

        // Parse values from DB
        const strikeRaw = parseFloat(option.strike);
        const quantityRaw = parseFloat(option.qty);
        const premiumRaw = parseFloat(option.premium);
        const collateral = parseFloat(option.collateralAmount || '0');
        
        // Get commodity slug and find corresponding index for price lookup
        const commoditySlug = (option as any).commoditySlug || option.commodity;
        const indexId = commoditySlug ? indexMap.get(commoditySlug.toLowerCase()) : null;
        const currentPricePerTon = indexId ? (priceMap.get(indexId) || 0) : 0;
        
        // Strike is stored in $/ton, quantity in tons, premium per ton
        const strikePerTon = strikeRaw;
        const quantityTons = quantityRaw;
        const premiumPerTon = premiumRaw;

        let pnl = 0;
        let status = option.status;
        let unrealized = false;

        // Find settlement if exercised
        const settlement = settlementsData.find(s => s.optionId === option.id);

        if (settlement) {
          // Realized PnL from settlement
          const settlementPnL = parseFloat(settlement.profitLoss);
          pnl = isBuyer ? settlementPnL : -settlementPnL;
          realizedPnL += pnl;
        } else if (option.status === 'FILLED' || option.status === 'OPEN' || option.status === 'MARGIN_CALL') {
          // Unrealized PnL based on current spot price for this commodity
          unrealized = true;
          
          // Calculate intrinsic value and premium using corrected helpers (no * 1000 conversion)
          const intrinsicValue = computeIntrinsicValueUSDCorrected(
            option.type,
            strikePerTon,        // Already in $/ton
            currentPricePerTon,  // Already in $/ton
            quantityTons         // Already in tons
          );
          const totalPremium = computePremiumUSD(premiumPerTon, quantityTons);
          
          // Calculate P&L based on position side
          if (isBuyer) {
            // LONG: profit = intrinsic value - premium paid
            pnl = intrinsicValue - totalPremium;
          } else {
            // SHORT: profit = premium received - intrinsic value
            pnl = totalPremium - intrinsicValue;
          }
          
          unrealizedPnL += pnl;
        }

        // Track open positions and compute locked collateral for SHORT positions
        const isActiveStatus = option.status === 'FILLED' || option.status === 'OPEN' || option.status === 'MARGIN_CALL';
        if (isActiveStatus) {
          openPositionsCount++;
          
          // Locked collateral is only for SHORT positions (seller/writer)
          // Sum the collateralAmount from active SHORT options
          if (isSeller && collateral > 0) {
            // Collateral is already stored on the option record
            // No need to query DB column that may not exist
          }
        }

        totalPnL += pnl;

        return {
          optionId: option.id,
          title: option.title,
          type: option.type,
          strike: option.strike, // Original value from DB
          strikePerTon: strikePerTon.toFixed(2), // Strike in $/ton (already converted, no * 1000)
          qty: option.qty, // Already in tons
          premium: option.premium, // Premium per ton
          status: option.status,
          role: isBuyer ? 'buyer' : 'seller',
          pnl: pnl.toFixed(2),
          unrealized,
          createdAt: option.createdAt,
        };
      }));

      // Filter out null positions
      const validPositions = positions.filter((p): p is NonNullable<typeof p> => p !== null);
      
      // Compute locked collateral from active SHORT positions
      // Sum collateralAmount from all active options where user is seller
      let totalLockedCollateral = 0;
      for (const option of userOptions) {
        const isSeller = option.issuerId === userId || option.seller === userId;
        const isActiveStatus = option.status === 'FILLED' || option.status === 'OPEN' || option.status === 'MARGIN_CALL';
        if (isSeller && isActiveStatus) {
          const collateral = parseFloat(option.collateralAmount || '0');
          totalLockedCollateral += collateral;
        }
      }
      
      res.json({
        totalPnL: totalPnL.toFixed(2),
        realizedPnL: realizedPnL.toFixed(2),
        unrealizedPnL: unrealizedPnL.toFixed(2),
        lockedCollateral: totalLockedCollateral.toFixed(2),
        openPositions: openPositionsCount,
        marginCalls: marginCallsCount,
        positions: validPositions.sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
      });
    } catch (error: any) {
      console.error("Portfolio query failed", error);
      res.status(500).json({ error: error.message || "Failed to fetch portfolio" });
    }
  });

  // Forward portfolio for the current user
  app.get("/api/portfolio/forwards/me", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Get all forward contracts where user is long or short
      const userForwardContracts = await db
        .select({
          id: forwardContracts.id,
          commodity: forwardContracts.commodity,
          contractPrice: forwardContracts.contractPrice,
          qtyTon: forwardContracts.qtyTon,
          window: forwardContracts.window,
          windowStart: forwardContracts.windowStart,
          windowEnd: forwardContracts.windowEnd,
          settlementDate: forwardContracts.settlementDate,
          longUserId: forwardContracts.longUserId,
          shortUserId: forwardContracts.shortUserId,
          initialMargin: forwardContracts.initialMargin,
          status: forwardContracts.status,
          contractHash: forwardContracts.contractHash,
          createdAt: forwardContracts.createdAt,
          updatedAt: forwardContracts.updatedAt,
        })
        .from(forwardContracts)
        .where(
          or(
            eq(forwardContracts.longUserId, userId),
            eq(forwardContracts.shortUserId, userId)
          )
        )
        .orderBy(desc(forwardContracts.createdAt));

      // Get settlements for realized PnL
      const forwardSettlementRows = await db.select().from(forwardSettlements);

      const positions = await Promise.all(userForwardContracts.map(async (contract) => {
        const isLong = contract.longUserId === userId;
        const isShort = contract.shortUserId === userId;

        // Calculate notional
        const contractPrice = parseFloat(contract.contractPrice || "0");
        const qtyTon = parseFloat(contract.qtyTon || "0");
        const notional = contractPrice * qtyTon;

        // Calculate PnL from settlements
        let realizedPnL = 0;
        const contractSettlements = forwardSettlementRows.filter(
          (s: any) => s.forwardContractId === contract.id
        );

        for (const settlement of contractSettlements) {
          const settlementPrice = parseFloat(settlement.settlementPrice || "0");
          const contractPriceSettled = parseFloat(settlement.contractPrice || "0");
          const qtySettled = parseFloat(settlement.qtyTon || "0");

          const pnlPerTon = (settlementPrice - contractPriceSettled) * qtySettled;

          if (isLong) {
            // Long position: profit when price rises
            realizedPnL += pnlPerTon;
          } else {
            // Short position: profit when price falls
            realizedPnL -= pnlPerTon;
          }
        }

        // Calculate unrealized PnL if contract is still active
        let unrealizedPnL = 0;
        const isActive = ['ACTIVE', 'MARGIN_CALL'].includes(contract.status);

        if (isActive) {
          // For unrealized PnL, we would need current market prices
          // For now, set to 0 (could be enhanced later)
          unrealizedPnL = 0;
        }

        return {
          contractId: contract.id,
          commodity: contract.commodity,
          window: contract.window,
          windowStart: contract.windowStart,
          windowEnd: contract.windowEnd,
          settlementDate: contract.settlementDate,
          role: isLong ? 'long' : 'short',
          contractPrice: contract.contractPrice,
          qtyTon: contract.qtyTon,
          notional: notional.toFixed(2),
          initialMargin: contract.initialMargin,
          status: contract.status,
          realizedPnL: realizedPnL.toFixed(2),
          unrealizedPnL: unrealizedPnL.toFixed(2),
          totalPnL: (realizedPnL + unrealizedPnL).toFixed(2),
          createdAt: contract.createdAt,
          updatedAt: contract.updatedAt,
        };
      }));

      res.json(positions);
    } catch (error: any) {
      console.error("Forward portfolio query failed", error);
      res.status(500).json({ error: error.message || "Failed to fetch forward portfolio" });
    }
  });

  // Compact portfolio summary for the current user
  app.get("/api/portfolio/summary", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const userId = req.user.id;

      let optionNotional = 0;
      let optionMargin = 0;
      let forwardNotional = 0;
      let forwardMargin = 0;
      let realizedPnl = 0;
      let unrealizedPnl = 0; // TODO: reuse risk dashboard logic when available

      // Options: active positions where user is buyer/issuer/counterparty
      const userOptions = await storage.getOptionsByUser(userId);
      const activeOptionStatuses = new Set(["OPEN", "FILLED", "MARGIN_CALL", "ACTIVE"]);
      const activeOptions = userOptions.filter((o) => activeOptionStatuses.has(o.status));

      // Settlements for realized PnL on options
      const optionSettlements = await storage.listSettlements();

      for (const opt of activeOptions) {
        const strike = parseFloat(opt.strike || "0");
        const qty = parseFloat(opt.qty || "0");
        const initMargin = parseFloat((opt as any).initialMargin || "0");
        optionNotional += computeNotional(strike, qty);
        optionMargin += Number.isFinite(initMargin) ? initMargin : 0;
      }

      // Realized PnL from settled options
      for (const sett of optionSettlements) {
        const opt = userOptions.find((o) => o.id === sett.optionId);
        if (!opt) continue;
        const isBuyer = opt.buyerId === userId || (opt as any).buyer === userId;
        const isSeller = opt.issuerId === userId || (opt as any).seller === userId;
        if (!isBuyer && !isSeller) continue;
        const pnl = parseFloat((sett as any).profitLoss || "0");
        realizedPnl += isBuyer ? pnl : -pnl;
      }

      // Forward contracts (if available)
      try {
        const activeForwardStatuses = new Set(["ACTIVE", "MARGIN_CALL"]);
        const forwards = await db
          .select()
          .from(forwardContracts)
          .where(
            or(
              eq(forwardContracts.longUserId, userId),
              eq(forwardContracts.shortUserId, userId)
            )
          );

        const forwardSettles = await db.select().from(forwardSettlements);

        for (const fc of forwards) {
          if (activeForwardStatuses.has(fc.status)) {
            const price = parseFloat(fc.contractPrice || "0");
            const qty = parseFloat(fc.qtyTon || "0");
            const initMargin = parseFloat((fc as any).initialMargin || "0");
            forwardNotional += computeNotional(price, qty);
            forwardMargin += Number.isFinite(initMargin) ? initMargin : 0;
          }
          const settlesForContract = forwardSettles.filter(
            (s) => s.forwardContractId === fc.id
          );
          for (const s of settlesForContract) {
            const pnlLong = parseFloat(s.pnlLong || "0");
            const pnlShort = parseFloat(s.pnlShort || "0");
            if (fc.longUserId === userId) {
              realizedPnl += pnlLong;
            }
            if (fc.shortUserId === userId) {
              realizedPnl += pnlShort;
            }
          }
        }
      } catch (err) {
        console.warn("[PORTFOLIO_SUMMARY] Forward module unavailable, using stubs", {
          error: (err as Error)?.message,
        });
      }

      const requiredMargin = optionMargin + forwardMargin;
      const currentMargin = requiredMargin; // placeholder until live balances are wired

      const healthPct =
        requiredMargin === 0
          ? 100
          : Math.min(200, Math.max(0, (currentMargin / requiredMargin) * 100));

      res.json({
        totalNotionalUsd: Number((optionNotional + forwardNotional).toFixed(8)),
        requiredMargin: Number(requiredMargin.toFixed(8)),
        currentMargin: Number(currentMargin.toFixed(8)),
        realizedPnl: Number(realizedPnl.toFixed(8)),
        unrealizedPnl: Number(unrealizedPnl.toFixed(8)),
        healthPct: Number(healthPct.toFixed(2)),
      });
    } catch (error: any) {
      console.error("Error building portfolio summary:", error);
      res.status(500).json({ error: error.message || "Failed to build portfolio summary" });
    }
  });

  // Option & Forward chain for a single index/window
  app.get("/api/markets/chain", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { indexId, commodity, window, includeForwards } = req.query;
      if (!indexId && !commodity) {
        return res.status(400).json({ error: "indexId or commodity is required" });
      }
      if (!window || typeof window !== "string") {
        return res.status(400).json({ error: "window is required" });
      }
      const includeFw = includeForwards === undefined ? true : String(includeForwards) === "true";

      // Resolve index info
      const commoditySlug = typeof commodity === "string" ? commodity : undefined;
      const commodityInfo = commoditySlug ? COMMODITY_MAP[commoditySlug as CommoditySlug] : undefined;

      let indexRow: any = null;
      if (indexId && typeof indexId === "string") {
        const [idx] = await db.select().from(indexes).where(eq(indexes.id, indexId));
        indexRow = idx || null;
      } else if (commoditySlug) {
        const [idx] = await db.select().from(indexes).where(eq(indexes.slug, commoditySlug));
        indexRow = idx || null;
      }

      // If not found in DB but commodity is known, build a minimal stub so the API doesn't 404
      if (!indexRow && commoditySlug && commodityInfo) {
        indexRow = {
          id: null,
          name: commodityInfo.indexName || commodityInfo.name,
          slug: commoditySlug,
        };
      }

      if (!indexRow) {
        return res.status(404).json({ error: "Index not found" });
      }

      const indexIdFilter = indexRow.id ? eq(options.indexId, indexRow.id) : null;
      // Build filters with column-existence guards to avoid 42703
      const hasExpiryWindow = !!(options as any).expiryWindow;
      const optionWhereParts = [
        hasExpiryWindow && window ? eq((options as any).expiryWindow, window) : sql`true`,
        indexIdFilter
          ? or(indexIdFilter, commoditySlug ? eq(options.commodity as any, commoditySlug) : sql`false`)
          : commoditySlug
          ? eq(options.commodity as any, commoditySlug)
          : sql`true`,
      ].filter(Boolean) as any[];

      let optionRows: any[] = [];
      try {
        optionRows = await db.select().from(options).where(and(...optionWhereParts));
      } catch (err: any) {
        if (err?.code === "42703") {
          console.warn("[CHAIN] expiry_window column missing at runtime, returning empty options");
          optionRows = [];
        } else {
          throw err;
        }
      }

      const optionsMapped = optionRows.map((o) => {
        const strike = parseFloat(o.strike || "0");
        const premium = parseFloat(o.premium || "0");
        const qty = parseFloat(o.qty || "0");
        let side: "LONG" | "SHORT" | null = null;
        if (req.user) {
          if (o.buyerId === req.user.id || (o as any).buyer === req.user.id) side = "LONG";
          else if (o.issuerId === req.user.id || (o as any).seller === req.user.id) side = "SHORT";
        }
        return {
          id: o.id,
          type: o.type,
          strike,
          premium,
          qtyTon: qty,
          status: o.status,
          side,
          volume: null,
          iv: null,
        };
      });

      let forwardsMapped: any[] = [];
      if (includeFw) {
        const forwardWhere = [
          window ? eq(forwardContracts.window, window) : sql`true`,
          indexRow.id
            ? or(eq(forwardContracts.indexId, indexRow.id), commoditySlug ? eq(forwardContracts.commodity as any, commoditySlug) : sql`false`)
            : commoditySlug
            ? eq(forwardContracts.commodity as any, commoditySlug)
            : sql`true`,
        ];
        const fwRows = await db.select().from(forwardContracts).where(and(...forwardWhere));

        forwardsMapped = fwRows.map((f) => {
          const price = parseFloat(f.contractPrice || "0");
          const qty = parseFloat(f.qtyTon || "0");
          let side: "LONG" | "SHORT" | null = null;
          if (req.user) {
            if (f.longUserId === req.user.id) side = "LONG";
            else if (f.shortUserId === req.user.id) side = "SHORT";
          }
          return {
            id: f.id,
            contractPrice: price,
            qtyTon: qty,
            status: f.status,
            side,
          };
        });
      }

      res.json({
        index: {
          id: indexRow.id,
          name: indexRow.name || commodityInfo?.indexName || commodityInfo?.name || commoditySlug,
          slug: indexRow.slug || commoditySlug,
          basis: BASIS_CPT_ODESA,
        },
        window,
        options: optionsMapped,
        forwards: forwardsMapped,
      });
    } catch (error: any) {
      console.error("Error fetching market chain:", error);
      res.status(500).json({ error: error.message || "Failed to fetch market chain" });
    }
  });

  // Admin: run margin checks for active SHORT positions
  app.post("/api/admin/run-margin-check", authenticateToken, async (req: AuthRequest, res) => {
    try {
      // Only admins/brokers allowed
      if (!hasAdminPermissions(req.user) && !hasBrokerPermissions(req.user)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      // Load latest prices per index
      const latestPrices = await db
        .select()
        .from(commodityIndexPrices)
        .orderBy(desc(commodityIndexPrices.timestamp));
      const priceMap = new Map<string, number>();
      const seen = new Set<string>();
      for (const p of latestPrices) {
        if (!seen.has(p.indexId)) {
          priceMap.set(p.indexId, parseFloat(p.price));
          seen.add(p.indexId);
        }
      }

      const getSSIavgWindow = async (indexId: string | null, windowStart?: Date | null, windowEnd?: Date | null) => {
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
        if (rows.length === 0) return null;
        const avg = rows.reduce((sum, r) => sum + parseFloat(r.price), 0) / rows.length;
        return avg;
      };

      const activeOptions = await db
        .select()
        .from(options)
        .where(
          or(
            eq(options.status, "OPEN"),
            eq(options.status, "FILLED")
          )
        );

      let checked = 0;
      let triggered = 0;

      for (const opt of activeOptions) {
        let markPrice = opt.indexId ? priceMap.get(opt.indexId) || 0 : 0;
        if (opt.indexId && opt.windowStart && opt.windowEnd) {
          const ssi = await getSSIavgWindow(opt.indexId, opt.windowStart as any, opt.windowEnd as any);
          if (ssi && Number.isFinite(ssi)) {
            markPrice = ssi;
          } else {
            console.warn("[MARGIN_CHECK] No SSIavg in window; using latest price as fallback", {
              optionId: opt.id,
              indexId: opt.indexId,
              windowStart: (opt.windowStart as any)?.toISOString?.() ?? opt.windowStart,
              windowEnd: (opt.windowEnd as any)?.toISOString?.() ?? opt.windowEnd,
              latest: markPrice,
            });
          }
        }
        const { updated, marginCallTriggered } = checkMarginCall({
          ...opt,
          currentPrice: markPrice,
        });

        const needsUpdate =
          marginCallTriggered ||
          updated.floatingLoss !== opt.floatingLoss ||
          updated.isInMarginCall !== opt.isInMarginCall;

        if (needsUpdate) {
          await db
            .update(options)
            .set({
              floatingLoss: updated.floatingLoss?.toString(),
              isInMarginCall: updated.isInMarginCall ?? false,
              marginCallTimestamp: updated.marginCallTimestamp || null,
              marginCallDeadline: updated.marginCallDeadline || null,
              lastUpdated: new Date(),
            })
            .where(eq(options.id, opt.id));
        }

        if (marginCallTriggered) triggered += 1;
        checked += 1;
      }

      res.json({ checked, triggered });
    } catch (error: any) {
      console.error("[ADMIN] Margin check failed", error);
      res.status(500).json({ error: "Failed to run margin check" });
    }
  });

  // Admin: auto-liquidate overdue margin calls
  app.post("/api/admin/run-liquidations", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!hasAdminPermissions(req.user) && !hasBrokerPermissions(req.user)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const now = new Date();

      // Latest prices per index
      const latestPrices = await db
        .select()
        .from(commodityIndexPrices)
        .orderBy(desc(commodityIndexPrices.timestamp));
      const priceMap = new Map<string, number>();
      const seen = new Set<string>();
      for (const p of latestPrices) {
        if (!seen.has(p.indexId)) {
          priceMap.set(p.indexId, parseFloat(p.price));
          seen.add(p.indexId);
        }
      }

      const candidates = await db
        .select()
        .from(options)
        .where(
          and(
            eq(options.isInMarginCall, true),
            sql`"margin_call_deadline" IS NOT NULL`,
            or(eq(options.status, "OPEN"), eq(options.status, "FILLED"), eq(options.status, "MARGIN_CALL"))
          )
        );

      let checked = 0;
      let liquidated = 0;

      for (const opt of candidates) {
        const deadline = opt.marginCallDeadline ? new Date(opt.marginCallDeadline) : null;
        if (!deadline || now <= deadline) continue;

        const mark = opt.indexId ? priceMap.get(opt.indexId) || 0 : 0;
        const { shouldLiquidate, updated } = autoLiquidateIfNeeded({ ...opt, currentPrice: mark });

        if (shouldLiquidate) {
          await db
            .update(options)
            .set({
              status: updated.status || "LIQUIDATED",
              floatingLoss: updated.floatingLoss?.toString(),
              marginBalance: (updated as any).marginBalance?.toString() || "0",
              isInMarginCall: false,
              marginCallTimestamp: updated.marginCallTimestamp || null,
              marginCallDeadline: updated.marginCallDeadline || null,
              lastUpdated: new Date(),
            })
            .where(eq(options.id, opt.id));
          liquidated += 1;
        }
        checked += 1;
      }

      res.json({ checked, liquidated });
    } catch (error: any) {
      console.error("[ADMIN] Liquidation run failed", error);
      res.status(500).json({ error: "Failed to run liquidations" });
    }
  });

  // ===== FORWARD ORDERS =====

  // Get forward orders
  app.get("/api/forward/orders", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { commodity, status, side } = req.query;
      const commodityStr = typeof commodity === "string" ? commodity : null;
      const statusStr = typeof status === "string" ? status : null;
      const sideStr = typeof side === "string" ? side : null;
      const whereConditions: any[] = [];

      if (commodityStr) {
        whereConditions.push(eq(forwardOrders.commodity, commodityStr));
      }
      if (statusStr) {
        whereConditions.push(eq(forwardOrders.status, statusStr as any));
      }
      if (sideStr) {
        whereConditions.push(eq(forwardOrders.side, sideStr as any));
      }

      const orders = await db
        .select()
        .from(forwardOrders)
        .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
        .orderBy(desc(forwardOrders.createdAt));

      res.json(orders);
    } catch (error: any) {
      console.error("Error fetching forward orders:", error);
      res.status(500).json({ error: "Failed to fetch forward orders" });
    }
  });

  // Create forward order
  app.post("/api/forward/orders", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const parsed = insertForwardOrderSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const orderData = parsed.data;

      // Compute expiry window if expiryHalf, expiryMonth, expiryYear provided
      let windowComputed: {
        window?: string;
        windowStart?: Date;
        windowEnd?: Date;
        settlementDate?: Date;
      } = {};

      if (parsed.data.expiryHalf && parsed.data.expiryMonth && parsed.data.expiryYear) {
        try {
          const window = computeExpiryWindow({
            half: parsed.data.expiryHalf === "H1" ? "1H" : "2H",
            month: parsed.data.expiryMonth,
            year: parsed.data.expiryYear,
          });
          windowComputed = {
            window: window.label,
            windowStart: window.windowStart,
            windowEnd: window.windowEnd,
            settlementDate: window.settlementDate,
          };
        } catch (err) {
          console.error("[CREATE_FORWARD_ORDER] Invalid expiry window input", err);
          return res.status(400).json({ error: "Invalid expiry window parameters" });
        }
      }

      const [order] = await db
        .insert(forwardOrders)
        .values({
          ...orderData,
          userId: req.user.id,
          ...windowComputed,
        })
        .returning();

      res.json(order);
    } catch (error: any) {
      console.error("Error creating forward order:", error);
      res.status(500).json({ error: "Failed to create forward order" });
    }
  });

  // ===== FORWARD ORDERS MATCHING =====

  app.post("/api/forward/orders/:id/match", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const orderId = req.params.id;
      const [order] = await db.select().from(forwardOrders).where(eq(forwardOrders.id, orderId));
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      if (order.userId === req.user.id) {
        return res.status(403).json({ error: "Counterparty cannot be the same user" });
      }
      if (order.status !== "OPEN") {
        return res.status(400).json({ error: `Order status is ${order.status}, cannot match` });
      }

      const oppositeSide = order.side === "BUY" ? "SELL" : "BUY";
      const [counterOrder] = await db
        .select()
        .from(forwardOrders)
        .where(
          and(
            eq(forwardOrders.side, oppositeSide),
            eq(forwardOrders.indexId, order.indexId as any),
            eq(forwardOrders.window, order.window as any),
            eq(forwardOrders.price, order.price),
            eq(forwardOrders.status, "OPEN")
          )
        )
        .limit(1);

      if (!counterOrder) {
        return res.status(404).json({ error: "No matching counter-order found" });
      }

      const qtyA = parseFloat(order.qtyTon);
      const qtyB = parseFloat(counterOrder.qtyTon);
      if (!Number.isFinite(qtyA) || !Number.isFinite(qtyB) || qtyA <= 0 || qtyB <= 0) {
        return res.status(400).json({ error: "Invalid quantity on order" });
      }
      if (Math.abs(qtyA - qtyB) > 1e-9) {
        return res.status(400).json({ error: "Quantity mismatch; partial fills not supported yet" });
      }
      const qtyTon = qtyA;
      const contractPriceNum = parseFloat(order.price);
      const settlementDate =
        order.settlementDate ||
        order.windowEnd ||
        counterOrder.settlementDate ||
        counterOrder.windowEnd ||
        new Date();

      const initialMargin = calculateInitialMargin({
        strike: contractPriceNum,
        quantityTon: qtyTon,
        settlementDate: new Date(settlementDate),
        currentDate: new Date(),
      });

      const buyOrder = order.side === "BUY" ? order : counterOrder;
      const sellOrder = order.side === "SELL" ? order : counterOrder;

      // Soft proof: hash a JSON snapshot of key, non-PII contract fields
      const contractProofPayload = {
        buyOrderId: buyOrder.id,
        sellOrderId: sellOrder.id,
        indexId: order.indexId,
        commodity: order.commodity || counterOrder.commodity || null,
        contractPrice: contractPriceNum,
        qtyTon,
        window: order.window,
        windowStart: order.windowStart || counterOrder.windowStart || null,
        windowEnd: order.windowEnd || counterOrder.windowEnd || null,
        settlementDate,
        longUserId: buyOrder.userId,
        shortUserId: sellOrder.userId,
        initialMargin,
      };
      const contractHash = createHash("sha256")
        .update(JSON.stringify(contractProofPayload))
        .digest("hex");

      const [contract] = await db
        .insert(forwardContracts)
        .values({
          buyOrderId: buyOrder.id,
          sellOrderId: sellOrder.id,
          indexId: order.indexId,
          commodity: order.commodity || counterOrder.commodity || null,
          contractPrice: contractPriceNum.toString(),
          qtyTon: qtyTon.toString(),
          window: order.window,
          windowStart: order.windowStart || counterOrder.windowStart || null,
          windowEnd: order.windowEnd || counterOrder.windowEnd || null,
          settlementDate,
          longUserId: buyOrder.userId,
          shortUserId: sellOrder.userId,
          initialMargin: initialMargin.toFixed(8),
          status: "ACTIVE",
          contractHash,
        })
        .returning();

      await db
        .update(forwardOrders)
        .set({ status: "FILLED", updatedAt: new Date() })
        .where(or(eq(forwardOrders.id, buyOrder.id), eq(forwardOrders.id, sellOrder.id)));

      // Record matching fees (per side)
      const matchingFeeAmount = qtyTon * MATCHING_FEE_PER_TON;
      const feeNotional = (contractPriceNum * qtyTon).toFixed(8);
      const forwardSides = [
        { userId: buyOrder.userId, role: "buyer" },
        { userId: sellOrder.userId, role: "seller" },
      ];
      for (const side of forwardSides) {
        try {
          await db.insert(platformFees).values({
            userId: side.userId!,
            role: side.role,
            type: "matching_fee",
            amount: matchingFeeAmount.toFixed(8),
            notionalAmount: feeNotional,
            currency: "CROPT",
            instrument: contract.id,
            instrumentType: "FORWARD",
            txId: null,
          });
        } catch (err) {
          console.warn("[FORWARD_MATCH_FEE] Failed to record fee", {
            contractId: contract.id,
            userId: side.userId,
            role: side.role,
            error: (err as Error)?.message,
          });
        }
      }

      console.log("[FORWARD_MATCH] Created forward contract", {
        contractId: contract.id,
        buyOrderId: buyOrder.id,
        sellOrderId: sellOrder.id,
        price: contractPriceNum,
        qtyTon,
      });

      res.status(201).json(contract);
    } catch (error: any) {
      console.error("Error matching forward order:", error);
      res.status(500).json({ error: error.message || "Failed to match forward order" });
    }
  });

  // List forward contracts with soft-proof hash
  app.get("/api/forward/contracts", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { status } = req.query;
      const isAdmin = hasBrokerPermissions(req.user.role) || hasAdminPermissions(req.user);

      const rows = await db.select().from(forwardContracts).orderBy(desc(forwardContracts.createdAt));
      let contracts = rows;
      if (!isAdmin) {
        contracts = contracts.filter(
          (c) => c.longUserId === req.user!.id || c.shortUserId === req.user!.id
        );
      }
      if (status && typeof status === "string") {
        contracts = contracts.filter((c) => c.status === status);
      }

      res.json(contracts);
    } catch (error: any) {
      console.error("Error fetching forward contracts:", error);
      res.status(500).json({ error: error.message || "Failed to fetch forward contracts" });
    }
  });

  // Settle a forward contract using SSIavg over the window
  app.post("/api/forward/contracts/:id/settle", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!hasAdminPermissions(req.user) && !hasBrokerPermissions(req.user)) {
        return res.status(403).json({ error: "Forbidden: broker/admin required" });
      }

      const contractId = req.params.id;
      const [contract] = await db.select().from(forwardContracts).where(eq(forwardContracts.id, contractId));
      if (!contract) {
        return res.status(404).json({ error: "Forward contract not found" });
      }
      if (contract.status === "SETTLED") {
        return res.status(400).json({ error: "Contract already settled" });
      }

      const windowStart = contract.windowStart ? new Date(contract.windowStart) : null;
      const windowEnd = contract.windowEnd ? new Date(contract.windowEnd) : null;
      const indexId = contract.indexId;

      let ssiAvg: number | null = null;
      if (indexId && windowStart && windowEnd) {
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
        if (rows.length > 0) {
          ssiAvg = rows.reduce((sum, r) => sum + parseFloat(r.price), 0) / rows.length;
        }
      }

      if (!ssiAvg || !Number.isFinite(ssiAvg)) {
        const [latest] = indexId
          ? await db
              .select()
              .from(commodityIndexPrices)
              .where(eq(commodityIndexPrices.indexId, indexId))
              .orderBy(desc(commodityIndexPrices.timestamp))
              .limit(1)
          : [];
        if (latest) {
          ssiAvg = parseFloat(latest.price);
          console.warn("[FORWARD_SETTLE] No SSIavg in window; falling back to latest price", {
            contractId,
            indexId,
            windowStart: windowStart?.toISOString?.(),
            windowEnd: windowEnd?.toISOString?.(),
            latest: ssiAvg,
          });
        } else {
          console.warn("[FORWARD_SETTLE] No prices found; aborting settlement", {
            contractId,
            indexId,
          });
          return res.status(400).json({ error: "No prices available to settle" });
        }
      }

      const contractPrice = parseFloat(contract.contractPrice);
      const qtyTon = parseFloat(contract.qtyTon);
      const pnlLong = (ssiAvg - contractPrice) * qtyTon;
      const pnlShort = -pnlLong;

      const [settlement] = await db
        .insert(forwardSettlements)
        .values({
          forwardContractId: contract.id,
          settlementPrice: ssiAvg.toFixed(8),
          contractPrice: contractPrice.toFixed(8),
          qtyTon: qtyTon.toFixed(8),
          pnlLong: pnlLong.toFixed(8),
          pnlShort: pnlShort.toFixed(8),
          feesTotal: "0",
        })
        .returning();

      await db
        .update(forwardContracts)
        .set({ status: "SETTLED", updatedAt: new Date() })
        .where(eq(forwardContracts.id, contract.id));

      // Settlement fees per side
      const settlementFeeAmount = qtyTon * SETTLEMENT_FEE_PER_TON;
      const feeNotional = (contractPrice * qtyTon).toFixed(8);
      const sides = [
        { userId: contract.longUserId, role: "long" },
        { userId: contract.shortUserId, role: "short" },
      ];
      for (const side of sides) {
        if (!side.userId) continue;
        try {
          await db.insert(platformFees).values({
            userId: side.userId,
            role: side.role,
            type: "settlement_fee",
            amount: settlementFeeAmount.toFixed(8),
            notionalAmount: feeNotional,
            currency: "CROPT",
            instrument: contract.id,
            instrumentType: "FORWARD",
            txId: null,
          });
        } catch (err) {
          console.warn("[FORWARD_SETTLE_FEE] Failed to record fee", {
            contractId: contract.id,
            userId: side.userId,
            role: side.role,
            error: (err as Error)?.message,
          });
        }
      }

      console.log("[FORWARD_SETTLE] Settled forward contract", {
        contractId: contract.id,
        ssiAvg,
        pnlLong,
        pnlShort,
      });

      res.json(settlement);
    } catch (error: any) {
      console.error("Error settling forward contract:", error);
      res.status(500).json({ error: error.message || "Failed to settle forward contract" });
    }
  });

  // ===== FORWARD SPREADS (analytics/demo) =====
  const createForwardSpreadSchema = z.object({
    spreadType: z.enum(["CALENDAR", "CROSS_COMMODITY"]),
    leg1IndexId: z.string().optional(),
    leg2IndexId: z.string().optional(),
    leg1Window: z.string().optional(),
    leg2Window: z.string().optional(),
    spreadPrice: z.coerce.number(),
    baseContractId: z.string().optional(),
    hedgeContractId: z.string().optional(),
    status: z.enum(["OPEN", "CANCELLED"]).optional(),
  });

  app.get("/api/forward/spreads", async (req, res) => {
    try {
      const { type, commodity, window } = req.query;

      if (type === "calendar") {
        const spreads = await calculateCalendarSpreads(commodity as string);
        res.json({ type: "calendar", spreads });
      } else if (type === "cross") {
        const spreads = await calculateCrossCommoditySpreads(window as string);
        res.json({ type: "cross", spreads });
      } else {
        // Return both types if no specific type requested
        const allSpreads = await getAllSpreads(commodity as string, window as string);
        res.json(allSpreads);
      }
    } catch (error: any) {
      console.error("Error fetching forward spreads:", error);
      res.status(500).json({ error: error.message || "Failed to fetch forward spreads" });
    }
  });

  app.post("/api/forward/spreads", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const parsed = createForwardSpreadSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const data = parsed.data;
      const [created] = await db
        .insert(forwardSpreads)
        .values({
          spreadType: data.spreadType,
          leg1IndexId: data.leg1IndexId,
          leg2IndexId: data.leg2IndexId,
          leg1Window: data.leg1Window,
          leg2Window: data.leg2Window,
          spreadPrice: data.spreadPrice.toFixed(8),
          baseContractId: data.baseContractId,
          hedgeContractId: data.hedgeContractId,
          status: data.status || "OPEN",
        })
        .returning();
      res.status(201).json(created);
    } catch (error: any) {
      console.error("Error creating forward spread:", error);
      res.status(500).json({ error: error.message || "Failed to create forward spread" });
    }
  });

  // ===== PARTNERS & CONTRACTS API =====
  
  // GET /api/admin/partners
  app.get("/api/admin/partners", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Forbidden: admin access required" });
      }

      const partners = await storage.getPartnerOrganizations();
      const contracts = await storage.getServiceContracts();
      
      // Get platform fees for fee stats calculation
      const allFees = await db
        .select()
        .from(platformFees)
        .orderBy(desc(platformFees.createdAt));

      // Calculate contract counts, total values, and fee stats per partner
      const partnersWithStats = await Promise.all(partners.map(async (partner) => {
        const partnerContracts = contracts.filter(c => c.partnerId === partner.id);
        const activeContracts = partnerContracts.filter(c => c.status === 'active');
        const totalContractValue = partnerContracts.reduce((sum, c) => sum + parseFloat(c.valueUsd), 0);
        
        // Get fee stats (demo implementation)
        const feeStats = await getPartnerFeeStats(
          partner.id,
          allFees.map(f => ({ amount: f.amount, currency: f.currency, createdAt: f.createdAt }))
        );
        
        return {
          ...partner,
          contractsCount: partnerContracts.length,
          activeContractsCount: activeContracts.length,
          totalContractValueUsd: totalContractValue.toFixed(2),
          totalFeesUsd: feeStats.totalFeesUsd.toFixed(2),
          totalVolumeUsd: feeStats.totalVolumeUsd.toFixed(2),
        };
      }));

      res.json({ partners: partnersWithStats });
    } catch (error: any) {
      console.error("Error fetching partners:", error);
      res.status(500).json({ error: error.message || "Failed to fetch partners" });
    }
  });

  // GET /api/admin/partners/:id - Partner details
  app.get("/api/admin/partners/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Forbidden: admin access required" });
      }

      const partnerId = req.params.id;

      // Get partner details
      const partners = await storage.getPartnerOrganizations();
      const partner = partners.find(p => p.id === partnerId);

      if (!partner) {
        return res.status(404).json({ error: "Partner not found" });
      }

      // Get service contracts for this partner
      const contracts = await storage.getServiceContracts();
      const partnerContracts = contracts.filter(c => c.partnerId === partnerId);

      // Get platform fees for fee stats
      const allFees = await db
        .select()
        .from(platformFees)
        .orderBy(desc(platformFees.createdAt));

      const feeStats = await getPartnerFeeStats(
        partnerId,
        allFees.map(f => ({ amount: f.amount, currency: f.currency, createdAt: f.createdAt }))
      );

      // Calculate additional stats
      const activeContracts = partnerContracts.filter(c => c.status === 'active');
      const totalContractValue = partnerContracts.reduce((sum, c) => sum + parseFloat(c.valueUsd), 0);
      const completedContracts = partnerContracts.filter(c => c.status === 'completed');

      // Mock modules based on relationship type
      const modules = [];
      if (partner.relationship === 'prime_broker') {
        modules.push('Options Trading', 'Forward Trading', 'Portfolio Management');
      } else if (partner.relationship === 'custody') {
        modules.push('Asset Custody', 'Wallet Management');
      } else if (partner.relationship === 'liquidity_provider') {
        modules.push('Market Making', 'Liquidity Provision');
      } else if (partner.relationship === 'security_auditor') {
        modules.push('Security Auditing', 'Compliance Monitoring');
      } else {
        modules.push('General Services');
      }

      const response = {
        partner: {
          ...partner,
          modules,
          contractsCount: partnerContracts.length,
          activeContractsCount: activeContracts.length,
          completedContractsCount: completedContracts.length,
          totalContractValueUsd: totalContractValue.toFixed(2),
        },
        contracts: partnerContracts,
        stats: {
          totalFeesUsd: feeStats.totalFeesUsd.toFixed(2),
          totalVolumeUsd: feeStats.totalVolumeUsd.toFixed(2),
          contractCount: feeStats.contractCount,
          activeContractValue: activeContracts.reduce((sum, c) => sum + parseFloat(c.valueUsd), 0).toFixed(2),
          completedContractValue: completedContracts.reduce((sum, c) => sum + parseFloat(c.valueUsd), 0).toFixed(2),
        }
      };

      res.json(response);
    } catch (error: any) {
      console.error("Error fetching partner details:", error);
      res.status(500).json({ error: error.message || "Failed to fetch partner details" });
    }
  });

  // GET /api/admin/service-contracts
  app.get("/api/admin/service-contracts", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Forbidden: admin access required" });
      }

      const contracts = await storage.getServiceContracts();
      const partners = await storage.getPartnerOrganizations();

      // Enrich contracts with partner names
      const contractsWithPartnerNames = contracts.map(contract => {
        const partner = partners.find(p => p.id === contract.partnerId);
        return {
          ...contract,
          partnerName: partner?.name || 'Unknown',
        };
      });

      res.json({ contracts: contractsWithPartnerNames });
    } catch (error: any) {
      console.error("Error fetching service contracts:", error);
      res.status(500).json({ error: error.message || "Failed to fetch service contracts" });
    }
  });

  // POST /api/admin/partners
  app.post("/api/admin/partners", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Forbidden: admin access required" });
      }

      const result = insertPartnerOrganizationSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ 
          error: "Invalid partner data", 
          details: fromZodError(result.error).message 
        });
      }

      const { id, ...partnerData } = req.body;
      const partner = await storage.createOrUpdatePartner(result.data, id);

      res.status(id ? 200 : 201).json(partner);
    } catch (error: any) {
      console.error("Error creating/updating partner:", error);
      res.status(500).json({ error: error.message || "Failed to create/update partner" });
    }
  });

  // POST /api/admin/service-contracts
  app.post("/api/admin/service-contracts", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Forbidden: admin access required" });
      }

      const result = insertServiceContractSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ 
          error: "Invalid contract data", 
          details: fromZodError(result.error).message 
        });
      }

      const { id, ...contractData } = req.body;
      const contract = await storage.createOrUpdateServiceContract(result.data, id);

      res.status(id ? 200 : 201).json(contract);
    } catch (error: any) {
      console.error("Error creating/updating service contract:", error);
      res.status(500).json({ error: error.message || "Failed to create/update service contract" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
