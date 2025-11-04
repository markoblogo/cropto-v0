import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertOptionSchema } from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import { z } from "zod";
import authRoutes from "./authRoutes";
import walletRoutes from "./walletRoutes";
import { authenticateToken } from "./auth";

export async function registerRoutes(app: Express): Promise<Server> {
  // Register auth routes
  app.use("/api/auth", authRoutes);
  app.use("/api/wallet", walletRoutes);

  app.get("/api/health", (req, res) => {
    res.json({ ok: true });
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

        // Calculate intrinsic value based on option type
        let intrinsicValue = 0;
        if (option.type === "CALL") {
          intrinsicValue = Math.max(0, currentIndexPrice - strikePrice) * qty;
        } else if (option.type === "PUT") {
          intrinsicValue = Math.max(0, strikePrice - currentIndexPrice) * qty;
        }

        // Calculate P&L
        const pnl = lastIntrinsic > 0 ? intrinsicValue - lastIntrinsic : intrinsicValue;
        
        // Update option with new intrinsic and accumulated payout
        const currentPayout = parseFloat(option.payoutAccumulated || "0");
        const newPayoutAccumulated = currentPayout + pnl;

        await storage.updateOption(option.id, {
          lastIntrinsic: intrinsicValue.toFixed(8),
          payoutAccumulated: newPayoutAccumulated.toFixed(8),
        });

        // Check margin rule: if abs(intrinsic) >= 0.8 * collateral_amount
        if (collateral > 0 && Math.abs(intrinsicValue) >= 0.8 * collateral) {
          const amountRequired = Math.max(0, Math.abs(intrinsicValue) - collateral);
          
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
      
      const notifications = await storage.listNotifications(req.user.id);
      res.json(notifications);
    } catch (error: any) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ error: error.message || "Failed to fetch notifications" });
    }
  });

  // POST /api/margin-call/:id/topup - Top up reserved collateral for a margin call
  app.post("/api/margin-call/:id/topup", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { amount } = req.body;
      
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: "Valid amount is required" });
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

  // POST /api/jobs/process-deadlines - Process expired margin calls (manual trigger)
  app.post("/api/jobs/process-deadlines", async (req, res) => {
    try {
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

  const httpServer = createServer(app);

  return httpServer;
}
