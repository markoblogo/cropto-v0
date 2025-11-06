import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { insertOptionSchema, insertFeedbackSchema, options, settlements, indexPrices } from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import authRoutes from "./authRoutes";
import walletRoutes from "./walletRoutes";
import { registerOnchainRoutes } from "./onchainRoutes";
import { startTransactionPoller } from "./onchain/poller";
import { authenticateToken, type AuthRequest, findUserById } from "./auth";
import { intrinsic, shouldTriggerMargin, calculateMarginCallAmount } from "./utils/finance";
import { processDeadlines } from "./cron/scheduler";
import { emailService } from "./utils/emailMock";

export async function registerRoutes(app: Express): Promise<Server> {
  // Register auth routes
  app.use("/api/auth", authRoutes);
  app.use("/api/wallet", walletRoutes);
  
  // Register onchain routes
  registerOnchainRoutes(app);
  
  // Start transaction poller if blockchain is configured
  if (process.env.POLYGON_MUMBAI_RPC_URL && process.env.CROPT_CONTRACT_ADDRESS) {
    startTransactionPoller();
  }

  app.get("/api/health", (req, res) => {
    res.json({ ok: true });
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

      // Parse message: Expected format "COMMODITY PRICE" e.g. "WHEAT 240.50" or "BTC 45000.00"
      const text = message.text.trim();
      const parts = text.split(/\s+/);
      
      if (parts.length !== 2) {
        return res.status(400).json({ error: "Invalid format. Expected: COMMODITY PRICE" });
      }

      const [commodity, priceStr] = parts;
      const price = parseFloat(priceStr);

      if (isNaN(price) || price <= 0) {
        return res.status(400).json({ error: "Invalid price value" });
      }

      // Validate commodity name (alphanumeric only)
      if (!/^[A-Z0-9]+$/i.test(commodity)) {
        return res.status(400).json({ error: "Invalid commodity name" });
      }

      // Store index price
      const [indexPrice] = await db
        .insert(indexPrices)
        .values({
          commodity: commodity.toUpperCase(),
          price: price.toFixed(8),
          date: new Date(),
        })
        .returning();

      console.log(`[Telegram] Index price received: ${commodity} = ${price}`);

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
      const userRole = req.user?.role;
      if (userRole !== "broker") {
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

      const [indexPrice] = await db
        .insert(indexPrices)
        .values({
          commodity: commodity.toUpperCase(),
          price: priceNum.toFixed(8),
          date: indexDate,
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
      const userRole = req.user?.role;
      if (userRole !== "broker") {
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
      const commodity = req.query.commodity as string || 'WHEAT';
      
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
          history: [],
        });
      }

      // Latest price is the first one (most recent)
      const latest = prices[0];
      
      // Calculate change percentage (comparing to oldest in the set)
      const oldestPrice = prices[prices.length - 1];
      const latestValue = parseFloat(latest.price);
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
        history,
      });
    } catch (error) {
      console.error("Error fetching latest index:", error);
      res.status(500).json({ error: "Failed to fetch index data" });
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

  app.post("/api/options", authenticateToken, async (req, res) => {
    try {
      const result = insertOptionSchema.safeParse(req.body);
      
      if (!result.success) {
        const validationError = fromZodError(result.error);
        return res.status(400).json({ 
          error: validationError.message 
        });
      }

      const option = await storage.createOption(result.data);
      res.status(201).json(option);
    } catch (error) {
      console.error("Error creating option:", error);
      res.status(500).json({ error: "Failed to create option" });
    }
  });

  app.post("/api/options/:id/match", async (req, res) => {
    try {
      const matchSchema = z.object({
        seller: z.string().min(1, "Seller is required"),
      });

      const result = matchSchema.safeParse(req.body);
      
      if (!result.success) {
        const validationError = fromZodError(result.error);
        return res.status(400).json({ 
          error: validationError.message 
        });
      }

      const trade = await storage.matchOption(req.params.id, result.data.seller);
      res.status(201).json(trade);
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

  app.post("/api/options/:id/exercise", async (req, res) => {
    try {
      const exerciseSchema = z.object({
        exercisedBy: z.string().min(1, "Exercised by is required"),
        spotPrice: z.coerce.number()
          .positive("Spot price must be positive")
          .transform(val => val.toString()),
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
        result.data.exercisedBy,
        result.data.spotPrice
      );
      res.status(201).json(settlement);
    } catch (error: any) {
      console.error("Error exercising option:", error);
      const statusCode = error.message?.includes("not found") || 
                        error.message?.includes("Only") 
                        ? 400 : 500;
      res.status(statusCode).json({ error: error.message || "Failed to exercise option" });
    }
  });

  app.get("/api/settlements", async (req, res) => {
    try {
      const settlements = await storage.listSettlements();
      res.json(settlements);
    } catch (error) {
      console.error("Error fetching settlements:", error);
      res.status(500).json({ error: "Failed to fetch settlements" });
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
      const isAdmin = req.user.role === "broker"; // Broker role acts as admin
      
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
      if (!req.user || req.user.role !== "broker") {
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
      if (req.user.role !== "broker") {
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
      if (req.user.role !== "broker") {
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
      
      if (req.user.role !== "broker") {
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
      if (req.user.role !== "broker") {
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
      
      if (req.user.role !== "broker") {
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
      if (!req.user || req.user.role !== "broker") {
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
      if (!req.user || req.user.role !== "broker") {
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
      if (!req.user || req.user.role !== "broker") {
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }
      
      const marginCalls = await storage.listMarginCalls();
      res.json(marginCalls);
    } catch (error: any) {
      console.error("Error fetching margin calls:", error);
      res.status(500).json({ error: error.message || "Failed to fetch margin calls" });
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
      const user = await findUserById(authReq.user!.userId);
      
      if (!user || user.role !== "broker") {
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
      const user = await findUserById(authReq.user!.userId);
      
      if (!user || user.role !== "broker") {
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
      const user = await findUserById(authReq.user!.userId);
      
      if (!user || user.role !== "broker") {
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

      // Fetch all options where user is buyer or seller
      const userOptions = await storage.getOptionsByUser(userId);

      // Fetch settlements for exercised options
      const settlementsData = await storage.listSettlements();

      // Fetch margin calls
      const marginCalls = await storage.listMarginCalls();
      const userMarginCalls = marginCalls.filter(mc => 
        userOptions.some(opt => opt.id === mc.optionId)
      );

      // Get latest index price for unrealized PnL calculation
      const latestIndex = await db
        .select()
        .from(indexPrices)
        .orderBy(desc(indexPrices.date))
        .limit(1);
      
      const currentSpotPrice = latestIndex.length > 0 ? parseFloat(latestIndex[0].price) : 0;

      let totalPnL = 0;
      let totalLockedCollateral = 0;
      let openPositionsCount = 0;
      let marginCallsCount = 0;

      const positions = userOptions.map(option => {
        const isBuyer = option.buyer === userId;
        const strikePrice = parseFloat(option.strike);
        const quantity = parseFloat(option.qty);
        const premium = parseFloat(option.premium);
        const collateral = parseFloat(option.collateral);

        let pnl = 0;
        let status = option.status;
        let unrealized = false;

        // Find settlement if exercised
        const settlement = settlementsData.find(s => s.optionId === option.id);

        if (settlement) {
          // Realized PnL from settlement
          const settlementPnL = parseFloat(settlement.profitLoss);
          pnl = isBuyer ? settlementPnL : -settlementPnL;
        } else if (option.status === 'FILLED' || option.status === 'OPEN' || option.status === 'MARGIN_CALL') {
          // Unrealized PnL based on current spot price
          unrealized = true;
          const intrinsicValue = intrinsic(option.type, currentSpotPrice, strikePrice, quantity);
          const totalPremium = premium * quantity;
          
          if (isBuyer) {
            // Buyer: profit if intrinsic value > premium paid
            pnl = intrinsicValue - totalPremium;
          } else {
            // Seller: profit is premium received - intrinsic value
            pnl = totalPremium - intrinsicValue;
          }
        }

        // Track locked collateral
        if (option.status === 'FILLED' || option.status === 'OPEN' || option.status === 'MARGIN_CALL') {
          totalLockedCollateral += collateral;
          openPositionsCount++;
        }

        // Count margin calls
        if (option.status === 'MARGIN_CALL') {
          marginCallsCount++;
        }

        totalPnL += pnl;

        return {
          optionId: option.id,
          title: option.title,
          type: option.type,
          strike: option.strike,
          qty: option.qty,
          premium: option.premium,
          status: option.status,
          role: isBuyer ? 'buyer' : 'seller',
          pnl: pnl.toFixed(2),
          unrealized,
          createdAt: option.createdAt,
        };
      });

      res.json({
        totalPnL: totalPnL.toFixed(2),
        totalLockedCollateral: totalLockedCollateral.toFixed(2),
        openPositionsCount,
        marginCallsCount,
        positions: positions.sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
      });
    } catch (error: any) {
      console.error("Portfolio aggregation error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch portfolio" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
