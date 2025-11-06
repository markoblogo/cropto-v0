import type { Express } from "express";
import { db } from "./db";
import { onchainTransactions } from "@shared/schema";
import { authenticateToken, type AuthRequest } from "./auth";
import { mintTokens, getBalance } from "./onchain/contract";
import { z } from "zod";
import { desc } from "drizzle-orm";

const mintSchema = z.object({
  optionId: z.string().optional(),
  toAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
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

      const { optionId, toAddress, amount } = validation.data;

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
      const { address } = req.params;
      
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return res.status(400).json({ error: "Invalid Ethereum address" });
      }

      const balance = await getBalance(address);
      
      return res.json({ address, balance });
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
