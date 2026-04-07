import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { registerSpotRoutes } from "./spotRoutes";
import { setupVite, serveStatic, log } from "./vite";
import { initializeAuth } from "./auth";
import { initSentry } from "./utils/sentry";
import blockServiceRole from "./middleware/blockServiceRole";
import auditLog from "./middleware/auditLog";
import { autoImportDemoData } from "../scripts/auto-import-demo-data";
import { seedCommodityIndexes } from "./seed/commodityIndexes";
import { db } from "./db";
import { startFxIngestionScheduler } from "./ingestion/scheduler/fxIngestionJob";
import { startMarketIngestionScheduler } from "./ingestion/scheduler/marketIngestionJob";
import { startSeaBrokerageDailyReportScheduler } from "./services/seaBrokerageDailyReportScheduler";
import { startSeaBrokerageSheetsSyncScheduler } from "./services/seaBrokerageSheetsSyncScheduler";
import { getRuntimeInfo } from "./runtimeInfo";
import { registerMonitorRoutes } from "./monitor/routes";
import path from "path";

const app = express();

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  limit: "10mb",
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

app.use(blockServiceRole);
app.use(auditLog);
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    const info = getRuntimeInfo();
    res.setHeader("X-Cropto-GitSha", info.gitSha);
    res.setHeader("X-Cropto-BuildTime", info.buildTime || "unknown");
  }
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Initialize Sentry error monitoring
  initSentry();

  // Initialize authentication (validates JWT_SECRET is present)
  try {
    initializeAuth();
    log("✓ JWT authentication initialized");
  } catch (error: any) {
    console.error("❌ Failed to initialize authentication:", error.message);
    console.error("Please add JWT_SECRET to your Replit Secrets.");
    process.exit(1);
  }

  const server = await registerRoutes(app);
  registerSpotRoutes(app);
  registerMonitorRoutes(app);
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API route not found" });
  });

  // Static files uploaded by users (e.g. feedback screenshots)
  app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    if (!res.headersSent) {
      res.status(status).json({ message });
    }

    console.error("[API] Unhandled error", err);
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  const host = process.env.HOST || "0.0.0.0";
  const listenOptions =
    process.env.NODE_ENV === "production"
      ? { port, host, reusePort: true }
      : { port, host };

  server.listen(listenOptions, () => {
    log(`serving on ${host}:${port}`);
  });

  let shutdownStarted = false;
  const gracefulShutdown = (signal: NodeJS.Signals) => {
    if (shutdownStarted) return;
    shutdownStarted = true;
    console.log(`[server] ${signal} received, shutting down gracefully...`);
    server.close((err) => {
      if (err) {
        console.error("[server] graceful shutdown failed:", err);
        // In managed runtimes (Railway), SIGTERM usually means instance replacement.
        // Exit 0 to avoid noisy "crash" semantics on controlled shutdown.
        process.exit(signal === "SIGTERM" ? 0 : 1);
      }
      console.log("[server] shutdown complete");
      process.exit(0);
    });
    // Force-exit fallback in case hanging handles keep event loop alive.
    setTimeout(() => {
      console.warn("[server] forced shutdown timeout reached");
      process.exit(signal === "SIGTERM" ? 0 : 1);
    }, 10_000).unref();
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));

  // Background startup tasks must not block the server from binding to $PORT,
  // otherwise Railway health checks / edge routing may mark the deployment as unhealthy.
  (async () => {
    if (!process.env.DATABASE_URL) return;
    const startIngestionScheduler = process.env.START_INGESTION_SCHEDULER !== "0";

    // Seed commodity indexes (required for Telegram scraper)
    try {
      await seedCommodityIndexes();
    } catch (error: any) {
      console.error("⚠️  Warning: Failed to seed commodity indexes:", error.message);
    }

    // Auto-import demo data if not present in database
    try {
      await autoImportDemoData(db);
      // Ensure Sea Brokerage schema is synced
      const { storage } = await import("./storage");
      const storageInstance = (await import("./storage")).storage;
      if (storageInstance && typeof storageInstance.syncSeaBrokerageSchema === "function") {
        await storageInstance.syncSeaBrokerageSchema();
      }
    } catch (error: any) {
      console.error("⚠️  Warning: Failed to auto-import demo data or sync schema:", error.message);
    }

    if (startIngestionScheduler) {
      try {
        startFxIngestionScheduler();
        startMarketIngestionScheduler();
        console.log("[MarketIngestion] scheduler bootstrap started in web process");
      } catch (error: any) {
        console.error("⚠️  Warning: Failed to start ingestion scheduler:", error?.message || error);
      }
    } else {
      console.log("[MarketIngestion] scheduler bootstrap disabled via START_INGESTION_SCHEDULER=0");
    }

    try {
      startSeaBrokerageDailyReportScheduler();
    } catch (error: any) {
      console.error("⚠️  Warning: Failed to start sea brokerage daily report scheduler:", error?.message || error);
    }

    try {
      startSeaBrokerageSheetsSyncScheduler();
    } catch (error: any) {
      console.error("⚠️  Warning: Failed to start sea brokerage sheets sync scheduler:", error?.message || error);
    }
  })().catch((err: any) => {
    console.error("⚠️  Warning: Background startup task failed:", err?.message || err);
  });
})();
