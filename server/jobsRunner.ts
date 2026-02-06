import express from "express";
import { initSentry } from "./utils/sentry";

// Jobs
import { startPoller as startExternalIndexPoller } from "./jobs/igcPoller";
import { startPoller as startTelegramBotPoller } from "./jobs/telegramPoller";
import { runScraper as runTelegramScraper } from "./jobs/telegramScraper";

function startHealthServer() {
  const app = express();
  app.get("/health", (_req, res) => res.json({ ok: true, service: "jobs" }));

  const port = Number.parseInt(process.env.PORT || "5000", 10);
  app.listen(port, "0.0.0.0", () => {
    console.log(`[jobs] health server listening on ${port}`);
  });
}

async function startJobs() {
  // Initialize Sentry (if configured)
  initSentry();

  // Telegram: Bot API (preferred) OR Public scraper (fallback)
  if (process.env.TELEGRAM_BOT_TOKEN) {
    startTelegramBotPoller();
  } else {
    console.log("[jobs] TELEGRAM_BOT_TOKEN not configured. Bot poller disabled.");
    const scraperEnabled = process.env.ENABLE_TELEGRAM_SCRAPER !== "false";
    if (scraperEnabled) {
      // Interval mode (runs immediately then every N seconds)
      runTelegramScraper(false).catch((error) => {
        console.error("[jobs] Telegram scraper fatal error:", error?.message || error);
      });
    } else {
      console.log("[jobs] ENABLE_TELEGRAM_SCRAPER=false, scraper disabled.");
    }
  }

  // External index poller (IGC/USDA/Barchart/FuturesProxy)
  //
  // This may use headless browsing depending on the enabled sources. It should run
  // in the jobs service (not in web) to avoid destabilizing the HTTP server.
  startExternalIndexPoller();
}

startHealthServer();
startJobs().catch((error) => {
  console.error("[jobs] Failed to start jobs:", error?.message || error);
  process.exit(1);
});

