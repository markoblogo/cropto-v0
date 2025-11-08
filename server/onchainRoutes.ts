import type { Express } from "express";
import { db } from "./db";
import { onchainTransactions, options } from "@shared/schema";
import { authenticateToken, type AuthRequest } from "./auth";
import { mintTokens, getBalance } from "./onchain/contract";
import { mintOptionNFT } from "./services/onchain";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { normalizeAddress } from "./utils/address";

const mintSchema = z.object({
  optionId: z.string().optional(),
  toAddress: z.string().min(42).max(42),  // Basic length check, normalizeAddress will validate
  amount: z.string().regex(/^\d+(\.\d+)?$/, "Invalid amount"),
});

const mintNFTSchema = z.object({
  optionId: z.string().uuid("Invalid option ID"),
  toAddress: z.string().min(42).max(42),  // Basic length check, normalizeAddress will validate
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

  app.post("/api/onchain/mint-nft", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const validation = mintNFTSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Invalid request", 
          details: validation.error.issues 
        });
      }

      const { optionId } = validation.data;
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

      // Fetch the option and verify ownership
      const [option] = await db
        .select()
        .from(options)
        .where(eq(options.id, optionId));

      if (!option) {
        return res.status(404).json({ 
          error: "Option not found" 
        });
      }

      // Check if user owns this option (either as buyer or issuer)
      if (option.buyerId !== req.user!.id && option.issuerId !== req.user!.id) {
        return res.status(403).json({ 
          error: "Unauthorized",
          message: "You don't own this option" 
        });
      }

      // Check if NFT already minted
      if (option.nftStatus === "MINTED") {
        return res.status(400).json({ 
          error: "NFT already minted",
          message: "This option has already been minted as an NFT",
          tokenId: option.nftTokenId,
          txHash: option.nftMintTx
        });
      }

      // Check if NFT is currently being minted
      if (option.nftStatus === "MINTING") {
        return res.status(400).json({ 
          error: "NFT mint in progress",
          message: "This option NFT is currently being minted"
        });
      }

      // Update status to MINTING
      await db
        .update(options)
        .set({ nftStatus: "MINTING" })
        .where(eq(options.id, optionId));

      try {
        // Mint the NFT on-chain
        const { txHash, tokenId } = await mintOptionNFT(toAddress, optionId);

        // Update option with NFT details
        await db
          .update(options)
          .set({
            nftTokenId: tokenId,
            nftMintTx: txHash,
            nftStatus: "MINTED"
          })
          .where(eq(options.id, optionId));

        return res.json({ 
          success: true, 
          txHash,
          tokenId,
          explorerUrl: `https://amoy.polygonscan.com/tx/${txHash}`
        });
      } catch (mintError: any) {
        // Update status to FAILED on error
        await db
          .update(options)
          .set({ nftStatus: "FAILED" })
          .where(eq(options.id, optionId));

        throw mintError;
      }
    } catch (error: any) {
      console.error("Mint NFT error:", error);
      return res.status(500).json({ 
        error: "Failed to mint NFT", 
        message: error.message 
      });
    }
  });
}
