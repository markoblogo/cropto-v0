import { latestFxSnapshot, upsertFxRate } from "../storage/fxRepository";

const ENABLED = process.env.ENABLE_FX_INGESTION !== "false";
const INTERVAL_HOURS = Number.parseInt(process.env.FX_INGESTION_INTERVAL_HOURS || "24", 10);
let timer: NodeJS.Timeout | null = null;

async function fetchFxFromOpenExchangeRates() {
  const appId = process.env.OPENEXCHANGERATES_APP_ID;
  if (!appId) return null;
  const url = `https://openexchangerates.org/api/latest.json?app_id=${encodeURIComponent(appId)}&symbols=ARS,BRL,EUR`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`openexchangerates status=${res.status}`);
  const data: any = await res.json();
  const rates = data?.rates || {};
  return {
    source: "OPENEXCHANGERATES",
    asOf: data?.timestamp ? new Date(Number(data.timestamp) * 1000).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    usdPerUnit: {
      USD: 1,
      ARS: rates.ARS ? 1 / Number(rates.ARS) : undefined,
      BRL: rates.BRL ? 1 / Number(rates.BRL) : undefined,
      EUR: rates.EUR ? 1 / Number(rates.EUR) : undefined,
    } as Record<string, number | undefined>,
  };
}

async function fetchFxFromErApi() {
  const res = await fetch("https://open.er-api.com/v6/latest/USD");
  if (!res.ok) throw new Error(`er-api status=${res.status}`);
  const data: any = await res.json();
  const rates = data?.rates || {};
  return {
    source: "ER_API",
    asOf: new Date().toISOString().slice(0, 10),
    usdPerUnit: {
      USD: 1,
      ARS: rates.ARS ? 1 / Number(rates.ARS) : undefined,
      BRL: rates.BRL ? 1 / Number(rates.BRL) : undefined,
      EUR: rates.EUR ? 1 / Number(rates.EUR) : undefined,
    } as Record<string, number | undefined>,
  };
}

export async function runFxIngestionOnce(): Promise<void> {
  let payload: Awaited<ReturnType<typeof fetchFxFromErApi>> | null = null;
  try {
    payload = await fetchFxFromOpenExchangeRates();
  } catch (error: any) {
    console.warn("[FX] OpenExchangeRates fetch failed:", error?.message || error);
  }

  if (!payload) {
    payload = await fetchFxFromErApi();
  }

  const currencies: Array<"USD" | "ARS" | "BRL" | "EUR"> = ["USD", "ARS", "BRL", "EUR"];
  for (const currency of currencies) {
    const value = payload.usdPerUnit[currency];
    if (!Number.isFinite(value) || (value as number) <= 0) continue;
    await upsertFxRate({
      asOf: payload.asOf,
      currency,
      usdPerUnit: Number(value),
      source: payload.source,
    });
  }

  console.log(`[FX] updated asOf=${payload.asOf} source=${payload.source}`);
}

export async function getFxSnapshotOrFetch() {
  const snapshot = await latestFxSnapshot();
  if (snapshot.asOf) return snapshot;
  await runFxIngestionOnce();
  return latestFxSnapshot();
}

export function startFxIngestionScheduler(): void {
  if (!ENABLED) {
    console.log("[FX] ingestion disabled");
    return;
  }
  if (timer) return;

  const intervalMs = Math.max(1, INTERVAL_HOURS) * 60 * 60 * 1000;
  runFxIngestionOnce().catch((error) => {
    console.error("[FX] initial run failed:", error?.message || error);
  });

  timer = setInterval(() => {
    runFxIngestionOnce().catch((error) => {
      console.error("[FX] scheduled run failed:", error?.message || error);
    });
  }, intervalMs);
}
