import type { Express } from "express";
import { db } from "./db";
import { onchainTransactions } from "@shared/schema";
import { authenticateToken, type AuthRequest } from "./auth";
import { mintTokens, getBalance } from "./onchain/contract";
import { z } from "zod";
import { desc } from "drizzle-orm";
import { normalizeAddress } from "./utils/address";

const mintSchema = z.object({
  optionId: z.string().optional(),
  toAddress: z.string().min(42).max(42),  // Basic length check, normalizeAddress will validate
  amount: z.string().regex(/^\d+(\.\d+)?$/, "Invalid amount"),
});

export function registerOnchainRoutes(app: Express) {
  app.post("/api/onchain/mint", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const validation = mintSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Invalid request", 
          details: validation.error.issues 
        });
      }

      const { optionId, amount } = validation.data;
      let { toAddress } = validation.data;

      // Normalize address to checksummed format
      const normalizedAddress = normalizeAddress(toAddress);
      if (!normalizedAddress) {
        return res.status(400).json({
          error: "Invalid Ethereum address",
          message: "Address must be a valid Ethereum address"
        });
      }
      toAddress = normalizedAddress;

      const txHash = await mintTokens(toAddress, amount);

      const [transaction] = await db
        .insert(onchainTransactions)
        .values({
          optionId: optionId || null,
          userId: req.user!.id,
          type: "MINT",
          toAddress,
          amount,
          txHash,
          status: "PENDING",
        })
        .returning();

      return res.json({ 
        success: true, 
        txHash,
        transaction 
      });
    } catch (error: any) {
      console.error("Mint error:", error);
      return res.status(500).json({ 
        error: "Failed to mint tokens", 
        message: error.message 
      });
    }
  });

  app.get("/api/onchain/balance/:address", async (req, res) => {
    try {
      let { address } = req.params;
      
      // Normalize address to checksummed format
      const normalizedAddress = normalizeAddress(address);
      if (!normalizedAddress) {
        return res.status(400).json({ 
          error: "Invalid Ethereum address",
          message: "Address must be a valid Ethereum address" 
        });
      }
      address = normalizedAddress;

      const balance = await getBalance(address);
      
      return res.json({ address, balance, symbol: 'CROPT' });
    } catch (error: any) {
      console.error("Balance check error:", error);
      return res.status(500).json({ 
        error: "Failed to get balance", 
        message: error.message 
      });
    }
  });

  app.get("/api/onchain/transactions", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const transactions = await db
        .select()
        .from(onchainTransactions)
        .orderBy(desc(onchainTransactions.createdAt));

      return res.json(transactions);
    } catch (error: any) {
      console.error("Get transactions error:", error);
      return res.status(500).json({ 
        error: "Failed to get transactions", 
        message: error.message 
      });
    }
  });
}
