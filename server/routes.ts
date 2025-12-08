import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { insertOptionSchema, insertFeedbackSchema, options, settlements, indexPrices, marginCalls, transactions, indexes, commodityIndexPrices, insertCommodityIndexPriceSchema, platformFees, croptBalances, partnerOrganizations, serviceContracts, insertPartnerOrganizationSchema, insertServiceContractSchema, type HealthUpdateResponse } from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import { z } from "zod";
import { eq, desc, gt, and, or, sql } from "drizzle-orm";
import authRoutes from "./authRoutes";
import walletRoutes from "./walletRoutes";
import { registerOnchainRoutes } from "./onchainRoutes";
import { registerSpotRoutes } from "./spotRoutes";
import { startTransactionPoller } from "./onchain/poller";
import { startReconciler } from "./jobs/reconciler";
import { startPoller as startTelegramPoller } from "./jobs/telegramPoller";
import { runScraper } from "./jobs/telegramScraper";
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
import { calculateInitialMargin, checkMarginCall } from "./marginEngine";
import fs from "fs";
import path from "path";

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
        .select()
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
        .select()
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
        options: changedOptions,
        marginCalls: changedMarginCalls,
        transactions: changedTransactions,
      };

      res.json(response);
    } catch (error: any) {
      console.error("[Health Updates] Error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch health updates" });
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
      };

      res.json(response);
    } catch (error) {
      console.error("Error fetching index:", error);
      res.status(500).json({ error: "Failed to fetch index" });
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
      if (result.data.indexId) {
        const [index] = await db
          .select()
          .from(indexes)
          .where(eq(indexes.id, result.data.indexId))
          .limit(1);
        
        if (!index) {
          return res.status(400).json({ 
            error: "Invalid commodity index" 
          });
        }
        
        // Populate commodity field with index name for backward compatibility
        commodityName = index.name;
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
            type: 'option_create' as const, // Explicitly set fee_type via 'type' field
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
              console.log(`[CREATE_OPTION] Platform fee recorded for option ${createdOption.id}, userId=${req.user!.id}, fee_type=option_create, notionalAmount=${notionalAmount}, role=${req.user!.role || 'none'}`);
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
      if (!hasBrokerPermissions(req.user?.role)) {
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
      
      // Get all fees
      const allFees = await db
        .select()
        .from(platformFees);
      
      // Calculate totals
      let totalFees = 0;
      const byType: Record<string, number> = {};
      const byRole: Record<string, number> = {};
      
      for (const fee of allFees) {
        const amount = parseFloat(fee.amount);
        totalFees += amount;
        
        // Group by type
        const type = fee.type || 'unknown';
        byType[type] = (byType[type] || 0) + amount;
        
        // Group by role
        const role = fee.role || 'unknown';
        byRole[role] = (byRole[role] || 0) + amount;
      }
      
      res.json({
        totalFees: totalFees.toFixed(8),
        byType: Object.fromEntries(
          Object.entries(byType).map(([k, v]) => [k, v.toFixed(8)])
        ),
        byRole: Object.fromEntries(
          Object.entries(byRole).map(([k, v]) => [k, v.toFixed(8)])
        ),
      });
    } catch (error: any) {
      console.error("Error fetching platform fees:", error);
      res.status(500).json({ error: error.message || "Failed to fetch platform fees" });
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
        mc.status === "PENDING" || mc.status === "OPEN"
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
        const markPrice = opt.indexId ? priceMap.get(opt.indexId) || 0 : 0;
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
