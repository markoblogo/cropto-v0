#!/usr/bin/env tsx
import { runMarketIngestionOnce } from "../server/ingestion/scheduler/marketIngestionJob";

function parseArg(name: string, fallback?: string): string | undefined {
  const pref = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(pref));
  if (found) return found.slice(pref.length);
  return fallback;
}

async function main() {
  const market = (parseArg("market", "US") || "US").toUpperCase();
  const days = Number.parseInt(parseArg("days", "365") || "365", 10);

  if (!["US", "AR", "BR", "UA"].includes(market)) {
    throw new Error(`Invalid market ${market}. Allowed: US, AR, BR, UA`);
  }

  if (market === "UA") {
    console.log("UA backfill uses existing local index history table; no external ingestion step.");
    return;
  }

  const historyDays = Math.min(Math.max(days, 1), 730);
  const result = await runMarketIngestionOnce({ markets: [market as "US" | "AR" | "BR"], historyDays });

  console.log(`ingest:backfill completed market=${market} days=${historyDays} upserted=${result.upserted} failedPrimaries=${result.failedPrimaries}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
