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


  const httpServer = createServer(app);

  return httpServer;
}
