import { Express } from "express";
import { db } from "./db";
import { authenticateToken, AuthRequest } from "./auth";
import { 
  spotPositions, 
  croptBalances, 
  indexes, 
  commodityIndexPrices,
  platformFees
} from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";

export function registerSpotRoutes(app: Express) {
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

  async function getPricePerKgOrThrow(commoditySlug: string) {
    const [index] = await db.select().from(indexes).where(eq(indexes.slug, commoditySlug)).limit(1);
    if (!index) {
      const err: any = new Error("Commodity not found");
      err.statusCode = 404;
      throw err;
    }

    const [latestPrice] = await db
      .select()
      .from(commodityIndexPrices)
      .where(eq(commodityIndexPrices.indexId, index.id))
      .orderBy(desc(commodityIndexPrices.timestamp))
      .limit(1);

    if (!latestPrice) {
      const err: any = new Error("No price available");
      err.statusCode = 404;
      throw err;
    }

    const { isStale } = computeIsStale(latestPrice.timestamp);
    if (isStale) {
      const err: any = new Error("Trading disabled for this commodity (index is stale)");
      err.statusCode = 400;
      throw err;
    }

    const pricePerTon = parseFloat(latestPrice.price);
    const pricePerKg = pricePerTon / 1000;
    return pricePerKg;
  }
  
  // Helper function to get or create user's CROPT balance
  async function getOrCreateCroptBalance(userId: string) {
    let [balance] = await db
      .select()
      .from(croptBalances)
      .where(eq(croptBalances.userId, userId))
      .limit(1);
    
    if (!balance) {
      [balance] = await db
        .insert(croptBalances)
        .values({ userId, balance: "0" })
        .returning();
    }
    
    return balance;
  }

  // GET /api/spot/orderbook - aggregated order book (positions as proxy)
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
          priceKg: spotPositions.avgEntryPrice,
          qtyKg: spotPositions.quantityKg,
        })
        .from(spotPositions)
        .where(eq(spotPositions.commoditySlug, commodity));

      const bidsMap = new Map<number, number>();
      const asksMap = new Map<number, number>();

      for (const row of rows) {
        const priceKg = Number(row.priceKg);
        const qtyKg = Number(row.qtyKg);
        if (!Number.isFinite(priceKg) || !Number.isFinite(qtyKg) || qtyKg === 0) continue;

        // Convert kg price to ton price
        const priceTon = priceKg * 1000;

        if (qtyKg > 0) {
          const current = bidsMap.get(priceTon) || 0;
          bidsMap.set(priceTon, current + qtyKg / 1000); // store in tons
        } else {
          const current = asksMap.get(priceTon) || 0;
          asksMap.set(priceTon, current + Math.abs(qtyKg) / 1000); // store in tons
        }
      }

      const bids = Array.from(bidsMap.entries())
        .map(([price, quantity]) => ({ price, quantity }))
        .sort((a, b) => b.price - a.price)
        .slice(0, depthNum);

      const asks = Array.from(asksMap.entries())
        .map(([price, quantity]) => ({ price, quantity }))
        .sort((a, b) => a.price - b.price)
        .slice(0, depthNum);

      const response = {
        commodity,
        bids,
        asks,
      };

      console.info("[Orderbook Spot] handled in spotRoutes", {
        commodity,
        depth: depthNum,
        bids: bids.length,
        asks: asks.length,
      });
      res.json(response);
    } catch (error: any) {
      console.error("[Orderbook Spot] Error in spotRoutes", { commodity, error: error?.message });
      res.status(500).json({ error: error?.message || "Failed to fetch spot orderbook" });
    }
  });
  
  // Helper function to get user's position
  async function getUserPosition(userId: string, commoditySlug: string) {
    const positions = await db
      .select()
      .from(spotPositions)
      .where(
        and(
          eq(spotPositions.userId, userId),
          eq(spotPositions.commoditySlug, commoditySlug)
        )
      );
    
    return positions;
  }
  
  // Helper function to calculate aggregated position
  function aggregatePositions(positions: any[]) {
    if (positions.length === 0) {
      return null;
    }
    
    let totalQuantity = 0;
    let totalCost = 0;
    
    for (const pos of positions) {
      const qty = parseFloat(pos.quantityKg);
      const price = parseFloat(pos.avgEntryPrice);
      totalQuantity += qty;
      totalCost += qty * price;
    }
    
    const avgPrice = totalQuantity !== 0 ? totalCost / totalQuantity : 0;
    
    return {
      quantityKg: totalQuantity,
      avgEntryPrice: avgPrice,
    };
  }
  
  // POST /api/spot/:commoditySlug/buy
  app.post("/api/spot/:commoditySlug/buy", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { commoditySlug } = req.params;
      const { quantityKg } = req.body;
      
      if (!quantityKg || isNaN(parseFloat(quantityKg)) || parseFloat(quantityKg) <= 0) {
        return res.status(400).json({ error: "Valid kg amount is required" });
      }
      
      const kgAmount = parseFloat(quantityKg);
      const userId = req.user.id;
      
      // Get current price per kg
      const pricePerKg = await getPricePerKgOrThrow(commoditySlug);
      
      // Calculate cost
      const cost = kgAmount * pricePerKg;
      
      // Wrap in transaction for atomicity and to prevent race conditions
      let newBalance: number;
      let newQuantity: number;
      let newAvgPrice: number;
      
      await db.transaction(async (tx) => {
        // Get user's CROPT balance with row-level lock (FOR UPDATE)
        const [balance] = await tx
          .select()
          .from(croptBalances)
          .where(eq(croptBalances.userId, userId))
          .for('update')
          .limit(1);
        
        if (!balance) {
          // Create balance if doesn't exist
          await tx
            .insert(croptBalances)
            .values({ userId, balance: "0" })
            .returning();
          
          // Throw structured error
          const error: any = new Error("Insufficient CROPT balance");
          error.statusCode = 400;
          error.details = {
            required: cost.toFixed(8),
            available: "0.00000000",
          };
          throw error;
        }
        
        const currentBalance = parseFloat(balance.balance);
        
        // Check if user has enough CROPT
        if (currentBalance < cost) {
          const error: any = new Error("Insufficient CROPT balance");
          error.statusCode = 400;
          error.details = {
            required: cost.toFixed(8),
            available: currentBalance.toFixed(8),
          };
          throw error;
        }
        
        // Get existing positions to calculate weighted average with row lock
        const existingPositions = await tx
          .select()
          .from(spotPositions)
          .where(
            and(
              eq(spotPositions.userId, userId),
              eq(spotPositions.commoditySlug, commoditySlug)
            )
          )
          .for('update');
        
        const aggregated = aggregatePositions(existingPositions);
        
        if (aggregated) {
          // Calculate weighted average
          const existingValue = aggregated.quantityKg * aggregated.avgEntryPrice;
          const newValue = kgAmount * pricePerKg;
          newQuantity = aggregated.quantityKg + kgAmount;
          newAvgPrice = (existingValue + newValue) / newQuantity;
        } else {
          // First position
          newQuantity = kgAmount;
          newAvgPrice = pricePerKg;
        }
        
        // Deduct cost from balance
        newBalance = currentBalance - cost;
        await tx
          .update(croptBalances)
          .set({ 
            balance: newBalance.toFixed(8),
            updatedAt: new Date(),
          })
          .where(eq(croptBalances.userId, userId));
        
        // Create new spot position record
        await tx
          .insert(spotPositions)
          .values({
            userId,
            commoditySlug,
            quantityKg: kgAmount.toFixed(8),
            avgEntryPrice: pricePerKg.toFixed(8),
          });
        
        // TODO: Re-enable platform fee logging for spot buy once fee logic is finalized
        if (false) {
          const feeAmount = 0; // placeholder
          if (cost == null || Number.isNaN(cost) || cost < 0) {
            console.error('[SPOT_BUY] Invalid cost for notionalAmount', { cost, commoditySlug, userId });
            throw new Error('Invalid cost for platform fee notional amount');
          }
          const notionalAmount = cost.toFixed(8);
          
          await tx
            .insert(platformFees)
            .values({
              userId,
              role: req.user.role || 'trader',
              type: 'spot_buy',
              amount: feeAmount.toFixed(8),
              notionalAmount: notionalAmount,
              currency: 'CROPT',
              instrument: commoditySlug,
              txId: null,
            });
        }
      });
      
      // Calculate current P&L based on aggregated position
      const currentValue = newQuantity * pricePerKg;
      const bookValue = newQuantity * newAvgPrice;
      const unrealizedPnL = currentValue - bookValue;
      
      res.json({
        success: true,
        transaction: {
          type: "BUY",
          kg: kgAmount,
          pricePerKg: pricePerKg.toFixed(8),
          cost: cost.toFixed(8),
        },
        balance: {
          cropt: newBalance.toFixed(8),
        },
        position: {
          quantityKg: newQuantity.toFixed(8),
          avgEntryPrice: newAvgPrice.toFixed(8),
          currentPrice: pricePerKg.toFixed(8),
          unrealizedPnL: unrealizedPnL.toFixed(8),
        },
      });
    } catch (error: any) {
      console.error("Error buying spot position:", error);
      
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          error: error.message,
          ...error.details,
        });
      }
      
      res.status(500).json({ error: error.message || "Failed to buy spot position" });
    }
  });
  
  // POST /api/spot/:commoditySlug/sell
  app.post("/api/spot/:commoditySlug/sell", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { commoditySlug } = req.params;
      const { quantityKg } = req.body;
      
      if (!quantityKg || isNaN(parseFloat(quantityKg)) || parseFloat(quantityKg) <= 0) {
        return res.status(400).json({ error: "Valid kg amount is required" });
      }
      
      const kgAmount = parseFloat(quantityKg);
      const userId = req.user.id;
      
      // Get current price per kg
      const pricePerKg = await getPricePerKgOrThrow(commoditySlug);
      
      // Wrap in transaction for atomicity and to prevent race conditions
      let newBalance: number;
      let payout: number;
      let realizedPnL: number;
      
      await db.transaction(async (tx) => {
        // Get user's CROPT balance with row-level lock (FOR UPDATE)
        const [balance] = await tx
          .select()
          .from(croptBalances)
          .where(eq(croptBalances.userId, userId))
          .for('update')
          .limit(1);

        if (!balance) {
          // Create balance if doesn't exist
          await tx
            .insert(croptBalances)
            .values({ userId, balance: "0" })
            .returning();
        }

        // Get user's positions with deterministic ordering (FIFO) and row lock
        const positions = await tx
          .select()
          .from(spotPositions)
          .where(
            and(
              eq(spotPositions.userId, userId),
              eq(spotPositions.commoditySlug, commoditySlug)
            )
          )
          .orderBy(desc(spotPositions.createdAt)) // Explicit ordering for consistency
          .for("update"); // Lock rows to prevent concurrent modifications

        const aggregated = aggregatePositions(positions);
        const netQuantity = aggregated ? aggregated.quantityKg : 0;
        const isShortOrFlat = netQuantity <= 0;

        // For long positions, enforce that you cannot sell more than you own.
        if (!isShortOrFlat && netQuantity < kgAmount) {
          const error: any = new Error("Insufficient position");
          error.statusCode = 400;
          error.details = {
            available: aggregated ? aggregated.quantityKg.toFixed(8) : "0",
            requested: kgAmount.toFixed(8),
          };
          throw error;
        }

        // Calculate payout
        payout = kgAmount * pricePerKg;

        // For opening/increasing shorts (or flat -> short), treat this as opening exposure:
        // realized P&L is 0; P&L will be tracked as unrealized.
        if (isShortOrFlat || !aggregated) {
          realizedPnL = 0;
        } else {
          const costBasis = kgAmount * aggregated.avgEntryPrice;
          realizedPnL = payout - costBasis;
        }

        // Add payout to balance
        const currentBalance = balance ? parseFloat(balance.balance) : 0;
        newBalance = currentBalance + payout;
        await tx
          .update(croptBalances)
          .set({
            balance: newBalance.toFixed(8),
            updatedAt: new Date(),
          })
          .where(eq(croptBalances.userId, userId));

        if (isShortOrFlat) {
          // Open or increase a short position: store negative quantity.
          await tx
            .insert(spotPositions)
            .values({
              userId,
              commoditySlug,
              quantityKg: (-kgAmount).toFixed(8),
              avgEntryPrice: pricePerKg.toFixed(8),
            });
        } else {
          // Reduce existing long positions (FIFO - First In First Out)
          // Explicitly order by createdAt to ensure deterministic FIFO
          let remainingToSell = kgAmount;
          const sortedPositions = [...positions].sort((a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );

          for (const position of sortedPositions) {
            if (remainingToSell <= 0) break;

            const posQty = parseFloat(position.quantityKg);

            if (posQty <= remainingToSell) {
              // Delete entire position
              await tx
                .delete(spotPositions)
                .where(eq(spotPositions.id, position.id));
              remainingToSell -= posQty;
            } else {
              // Reduce position
              const newQty = posQty - remainingToSell;
              await tx
                .update(spotPositions)
                .set({
                  quantityKg: newQty.toFixed(8),
                  updatedAt: new Date(),
                })
                .where(eq(spotPositions.id, position.id));
              remainingToSell = 0;
            }
          }
        }
        
        // TODO: Re-enable platform fee logging for spot sell once fee logic is finalized
        if (false) {
          const feeAmount = 0; // placeholder
          if (payout == null || Number.isNaN(payout) || payout < 0) {
            console.error('[SPOT_SELL] Invalid payout for notionalAmount', { payout, commoditySlug, userId });
            throw new Error('Invalid payout for platform fee notional amount');
          }
          const notionalAmount = payout.toFixed(8);
          
          await tx
            .insert(platformFees)
            .values({
              userId,
              role: req.user.role || 'trader',
              type: 'spot_sell',
              amount: feeAmount.toFixed(8),
              notionalAmount: notionalAmount,
              currency: 'CROPT',
              instrument: commoditySlug,
              txId: null,
            });
        }
      });
      
      // Get remaining positions
      const remainingPositions = await getUserPosition(userId, commoditySlug);
      const remainingAggregated = aggregatePositions(remainingPositions);
      
      let unrealizedPnL = 0;
      if (remainingAggregated) {
        const currentValue = remainingAggregated.quantityKg * pricePerKg;
        const bookValue = remainingAggregated.quantityKg * remainingAggregated.avgEntryPrice;
        unrealizedPnL = currentValue - bookValue;
      }
      
      res.json({
        success: true,
        transaction: {
          type: "SELL",
          kg: kgAmount,
          pricePerKg: pricePerKg.toFixed(8),
          payout: payout.toFixed(8),
          realizedPnL: realizedPnL.toFixed(8),
        },
        balance: {
          cropt: newBalance.toFixed(8),
        },
        position: remainingAggregated ? {
          quantityKg: remainingAggregated.quantityKg.toFixed(8),
          avgEntryPrice: remainingAggregated.avgEntryPrice.toFixed(8),
          currentPrice: pricePerKg.toFixed(8),
          unrealizedPnL: unrealizedPnL.toFixed(8),
        } : null,
      });
    } catch (error: any) {
      console.error("Error selling spot position:", error);
      
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          error: error.message,
          ...error.details,
        });
      }
      
      res.status(500).json({ error: error.message || "Failed to sell spot position" });
    }
  });
  
  // GET /api/spot/balance - Get user's internal CROPT balance
  // IMPORTANT: This must be registered BEFORE /api/spot/:commoditySlug
  app.get("/api/spot/balance", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const balance = await getOrCreateCroptBalance(req.user.id);
      
      res.json({
        userId: req.user.id,
        balance: balance.balance,
        updatedAt: balance.updatedAt,
      });
    } catch (error: any) {
      console.error("Error fetching CROPT balance:", error);
      res.status(500).json({ error: error.message || "Failed to fetch balance" });
    }
  });

  // GET /api/spot/positions - Get all user's spot positions with P&L
  // IMPORTANT: This must be registered BEFORE /api/spot/:commoditySlug
  app.get("/api/spot/positions", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Get all user's spot positions
      const positions = await db
        .select()
        .from(spotPositions)
        .where(eq(spotPositions.userId, userId));

      // Get all indexes for mapping
      const allIndexes = await db
        .select()
        .from(indexes);

      // Build response with P&L calculations
      const positionsWithPnL = await Promise.all(
        positions.map(async (position) => {
          const index = allIndexes.find(idx => idx.slug === position.commoditySlug);
          
          if (!index) {
            return null;
          }

          // Get current price
          const [latestPrice] = await db
            .select()
            .from(commodityIndexPrices)
            .where(eq(commodityIndexPrices.indexId, index.id))
            .orderBy(desc(commodityIndexPrices.timestamp))
            .limit(1);

          const currentPricePerKg = latestPrice 
            ? parseFloat(latestPrice.price) / 1000 
            : 0;

          const quantityKg = parseFloat(position.quantityKg);
          const avgEntryPrice = parseFloat(position.avgEntryPrice);
          const currentValue = quantityKg * currentPricePerKg;
          const entryValue = quantityKg * avgEntryPrice;
          const pnl = currentValue - entryValue;
          const pnlPercent = entryValue > 0 ? (pnl / entryValue) * 100 : 0;

          return {
            id: position.id,
            commoditySlug: position.commoditySlug,
            commodityName: index.name,
            quantityKg: position.quantityKg,
            avgEntryPrice: position.avgEntryPrice,
            currentPricePerKg: currentPricePerKg.toFixed(8),
            currentValue: currentValue.toFixed(2),
            entryValue: entryValue.toFixed(2),
            pnl: pnl.toFixed(2),
            pnlPercent: pnlPercent.toFixed(2),
            createdAt: position.createdAt,
            updatedAt: position.updatedAt,
          };
        })
      );

      // Filter out null values (positions without matching indexes)
      const validPositions = positionsWithPnL.filter(p => p !== null);

      res.json(validPositions);
    } catch (error: any) {
      console.error('[SpotRoutes] Error fetching positions:', error);
      res.status(500).json({ error: "Failed to fetch spot positions" });
    }
  });
  
  // GET /api/spot/:commoditySlug
  app.get("/api/spot/:commoditySlug", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { commoditySlug } = req.params;
      const userId = req.user.id;
      
      // Get current price per kg
      const pricePerKg = await getPricePerKgOrThrow(commoditySlug);
      
      // Get user's positions
      const positions = await getUserPosition(userId, commoditySlug);
      const aggregated = aggregatePositions(positions);
      
      // Get user's CROPT balance
      const balance = await getOrCreateCroptBalance(userId);
      
      if (!aggregated) {
        return res.json({
          position: null,
          currentPrice: pricePerKg.toFixed(8),
          balance: {
            cropt: balance.balance,
          },
        });
      }
      
      // Calculate P&L
      const currentValue = aggregated.quantityKg * pricePerKg;
      const bookValue = aggregated.quantityKg * aggregated.avgEntryPrice;
      const unrealizedPnL = currentValue - bookValue;
      const unrealizedPnLPercent = bookValue > 0 ? (unrealizedPnL / bookValue) * 100 : 0;
      
      res.json({
        position: {
          quantityKg: aggregated.quantityKg.toFixed(8),
          avgEntryPrice: aggregated.avgEntryPrice.toFixed(8),
          currentValue: currentValue.toFixed(8),
          bookValue: bookValue.toFixed(8),
          unrealizedPnL: unrealizedPnL.toFixed(8),
          unrealizedPnLPercent: unrealizedPnLPercent.toFixed(2),
        },
        currentPrice: pricePerKg.toFixed(8),
        balance: {
          cropt: balance.balance,
        },
      });
    } catch (error: any) {
      console.error("Error fetching spot position:", error);
      res.status(500).json({ error: error.message || "Failed to fetch spot position" });
    }
  });

  // POST /api/spot/deposit - Deposit CROPT from on-chain to internal balance
  app.post("/api/spot/deposit", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { amount } = req.body;
      const depositAmount = parseFloat(amount);

      if (!depositAmount || depositAmount <= 0) {
        return res.status(400).json({ error: "Invalid deposit amount" });
      }

      // Use transaction for safety
      await db.transaction(async (tx) => {
        // Get or create balance with row lock
        const [balance] = await tx
          .select()
          .from(croptBalances)
          .where(eq(croptBalances.userId, userId))
          .limit(1)
          .for('update');

        const currentBalance = balance ? parseFloat(balance.balance) : 0;
        const newBalance = currentBalance + depositAmount;

        if (balance) {
          // Update existing balance
          await tx
            .update(croptBalances)
            .set({
              balance: newBalance.toFixed(8),
              updatedAt: new Date(),
            })
            .where(eq(croptBalances.userId, userId));
        } else {
          // Create new balance
          await tx
            .insert(croptBalances)
            .values({
              userId,
              balance: newBalance.toFixed(8),
            });
        }
        
        // Record platform fee (TODO: implement actual fee calculation policy)
        // For now, storing 0 as placeholder
        const feeAmount = 0; // TODO: implement fee calculation
        // For deposit, notional amount equals the deposit amount (or 0 if no meaningful notional)
        // Defensive check: ensure depositAmount is valid
        if (depositAmount == null || Number.isNaN(depositAmount) || depositAmount < 0) {
          console.error('[DEPOSIT] Invalid depositAmount for notionalAmount', { depositAmount, userId });
          throw new Error('Invalid deposit amount for platform fee notional amount');
        }
        const notionalAmount = depositAmount.toFixed(8);
        
        await tx
          .insert(platformFees)
          .values({
            userId,
            role: req.user?.role || 'trader',
            type: 'deposit',
            amount: feeAmount.toFixed(8),
            notionalAmount: notionalAmount,
            currency: 'CROPT',
            instrument: null,
            txId: null,
          });
      });

      // Get updated balance
      const [updatedBalance] = await db
        .select()
        .from(croptBalances)
        .where(eq(croptBalances.userId, userId))
        .limit(1);

      res.json({
        success: true,
        balance: updatedBalance.balance,
        deposited: depositAmount.toFixed(8),
      });
    } catch (error: any) {
      console.error('[SpotRoutes] Error depositing:', error);
      res.status(500).json({ error: "Failed to deposit CROPT" });
    }
  });
}
