import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertOptionSchema } from "@shared/schema";
import { fromZodError } from "zod-validation-error";

export async function registerRoutes(app: Express): Promise<Server> {
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

  app.post("/api/options", async (req, res) => {
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

  const httpServer = createServer(app);

  return httpServer;
}
