import jwt from "jsonwebtoken";
import type { SeaBrokerageEntryRow } from "@shared/schema";
import { storage } from "../storage";

type SheetsSyncResult = {
  ok: boolean;
  dateKey: string;
  syncedEntries: number;
  syncedBids: number;
  syncedOffers: number;
  syncedTrades: number;
  dictionariesUpdated: number;
  errors: string[];
};

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

const DEFAULT_TIMEZONE = process.env.SEA_BROKERAGE_SHEETS_SYNC_TIMEZONE || "Europe/Paris";
const DEFAULT_BID_TAB = process.env.SEA_BROKERAGE_SHEETS_BID_TAB || "Bid";
const DEFAULT_OFFER_TAB = process.env.SEA_BROKERAGE_SHEETS_OFFER_TAB || "Offer";
const DEFAULT_TRADE_TAB = process.env.SEA_BROKERAGE_SHEETS_TRADE_TAB || "Trade";

const DEFAULT_BUYERS_TAB = process.env.SEA_BROKERAGE_SHEETS_BUYERS_TAB || "🔹Buyers";
const DEFAULT_SELLERS_TAB = process.env.SEA_BROKERAGE_SHEETS_SELLERS_TAB || "🔸Sellers";
const DEFAULT_ENTITIES_TAB = process.env.SEA_BROKERAGE_SHEETS_ENTITIES_TAB || "🔸Entities";
const DEFAULT_COMMODITIES_TAB = process.env.SEA_BROKERAGE_SHEETS_COMMODITIES_TAB || "";
const DEFAULT_LOCATIONS_TAB = process.env.SEA_BROKERAGE_SHEETS_LOCATIONS_TAB || "";
const DEFAULT_COUNTRIES_TAB = process.env.SEA_BROKERAGE_SHEETS_COUNTRIES_TAB || "";

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function isSeaBrokerageSheetsSyncEnabled() {
  return parseBoolean(process.env.SEA_BROKERAGE_SHEETS_SYNC_ENABLED, false);
}

function getRequiredConfig() {
  const spreadsheetId = String(process.env.SEA_BROKERAGE_SHEETS_SPREADSHEET_ID || "").trim();
  const serviceAccountEmail = String(
    process.env.SEA_BROKERAGE_SHEETS_SERVICE_ACCOUNT_EMAIL || "",
  ).trim();
  const privateKeyRaw = String(
    process.env.SEA_BROKERAGE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY || "",
  ).trim();
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");

  if (!spreadsheetId || !serviceAccountEmail || !privateKey) {
    return null;
  }
  return { spreadsheetId, serviceAccountEmail, privateKey };
}

function getLocalDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = Number(get("hour") || "0");
  const minute = Number(get("minute") || "0");
  return {
    dateKey: `${year}-${month}-${day}`,
    dateLabel: `${day}.${month}.${year}`,
    hour,
    minute,
  };
}

function normalizeText(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeCountry(value: unknown) {
  return normalizeText(value)?.toUpperCase() || null;
}

function parseUtcDate(value: unknown) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? null : date;
}

function matchesLocalDate(value: unknown, dateKey: string, timeZone: string) {
  const date = parseUtcDate(value);
  if (!date) return false;
  return getLocalDateParts(date, timeZone).dateKey === dateKey;
}

function shouldSyncEntryForDate(entry: SeaBrokerageEntryRow, dateKey: string, timeZone: string) {
  return (
    matchesLocalDate(entry.createdAt, dateKey, timeZone) ||
    matchesLocalDate(entry.updatedAt, dateKey, timeZone)
  );
}

function decimalAsText(value: unknown) {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  return normalized;
}

function entryPrice(entry: SeaBrokerageEntryRow) {
  return decimalAsText(entry.price) || decimalAsText(entry.priceFrom) || decimalAsText(entry.priceTo);
}

function toRowPayload(entry: SeaBrokerageEntryRow, nowIso: string) {
  const updatedAt = parseUtcDate(entry.updatedAt) || parseUtcDate(entry.createdAt) || new Date(0);
  return {
    monitorEntryId: entry.id,
    type: entry.type,
    brokerCode: normalizeText(entry.brokerCode) || "",
    brokerName: normalizeText(entry.brokerName) || "",
    brokerTelegramUsername: normalizeText(entry.brokerTelegramUsername) || "",
    brokerTelegramUserId: normalizeText(entry.brokerTelegramUserId) || "",
    sellerName: normalizeText(entry.sellerName) || "",
    buyerName: normalizeText(entry.buyerName) || "",
    commodityCode: normalizeText(entry.commodity) || "",
    commodityLabel: normalizeText(entry.commodityLabel) || "",
    originCountry: normalizeText(entry.originCountry) || "",
    originCountryCode: normalizeCountry(entry.originCountryCode) || "",
    basis: normalizeText(entry.basis) || "",
    destinationPort: normalizeText(entry.destinationPort) || "",
    destinationCountry: normalizeText(entry.destinationCountry) || "",
    destinationCountryCode: normalizeCountry(entry.destinationCountryCode) || "",
    destinationPortCode: normalizeText(entry.destinationPortCode) || "",
    periodType: normalizeText(entry.periodType) || "",
    periodLabel: normalizeText(entry.periodLabel) || "",
    periodStart: normalizeText(entry.periodStart) || "",
    periodEnd: normalizeText(entry.periodEnd) || "",
    quantityMt: entry.quantityMt ?? "",
    volumeFrom: entry.volumeFrom ?? "",
    volumeTo: entry.volumeTo ?? "",
    tolerancePct: entry.tolerancePct ?? "",
    price: entryPrice(entry),
    currency: normalizeText(entry.currency) || "",
    paymentTerms: normalizeText(entry.paymentTerms) || "",
    transportType: normalizeText(entry.transportType) || "",
    isNewCrop: entry.isNewCrop ? "true" : "false",
    note: normalizeText(entry.note) || "",
    canonicalView: normalizeText(entry.canonicalView) || "",
    telegramRelayStatus: normalizeText(entry.telegramRelayStatus) || "",
    createdAt: parseUtcDate(entry.createdAt)?.toISOString() || "",
    updatedAt: parseUtcDate(entry.updatedAt)?.toISOString() || "",
    syncVersion: String(updatedAt.getTime()),
    lastSyncedAt: nowIso,
    syncStatus: "synced",
  } as Record<string, string | number>;
}

function toA1Column(columnNumber: number) {
  let n = columnNumber;
  let label = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

function makeRange(tab: string, a1: string) {
  return `'${tab.replace(/'/g, "''")}'!${a1}`;
}

async function requestGoogleAccessToken(config: {
  serviceAccountEmail: string;
  privateKey: string;
}) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      iss: config.serviceAccountEmail,
      sub: config.serviceAccountEmail,
      scope: GOOGLE_SHEETS_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    },
    config.privateKey,
    { algorithm: "RS256" },
  );

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google token request failed (${response.status}): ${text}`);
  }
  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) {
    throw new Error("Google token response does not include access_token");
  }
  return payload.access_token;
}

async function sheetsApiRequest(
  accessToken: string,
  spreadsheetId: string,
  path: string,
  init?: RequestInit,
) {
  const url = `${GOOGLE_SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Sheets API request failed (${response.status} ${path}): ${text}`);
  }
  return response;
}

async function readSheetValues(accessToken: string, spreadsheetId: string, tab: string) {
  const range = encodeURIComponent(makeRange(tab, "A:ZZ"));
  const response = await sheetsApiRequest(accessToken, spreadsheetId, `/values/${range}`);
  const payload = (await response.json()) as { values?: string[][] };
  return payload.values || [];
}

async function writeSheetRow(
  accessToken: string,
  spreadsheetId: string,
  tab: string,
  rowNumber: number,
  values: Array<string | number>,
) {
  const lastColumn = toA1Column(Math.max(1, values.length));
  const range = encodeURIComponent(makeRange(tab, `A${rowNumber}:${lastColumn}${rowNumber}`));
  await sheetsApiRequest(
    accessToken,
    spreadsheetId,
    `/values/${range}?valueInputOption=RAW`,
    {
      method: "PUT",
      body: JSON.stringify({ values: [values] }),
    },
  );
}

async function appendSheetRow(
  accessToken: string,
  spreadsheetId: string,
  tab: string,
  values: Array<string | number>,
) {
  const range = encodeURIComponent(makeRange(tab, "A:A"));
  await sheetsApiRequest(
    accessToken,
    spreadsheetId,
    `/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      body: JSON.stringify({ values: [values] }),
    },
  );
}

async function upsertRowsByMonitorEntryId(
  accessToken: string,
  spreadsheetId: string,
  tab: string,
  rowPayloads: Array<Record<string, string | number>>,
) {
  if (!rowPayloads.length) return 0;

  const existing = await readSheetValues(accessToken, spreadsheetId, tab);
  const mandatoryHeaders = ["monitorEntryId", "syncVersion", "lastSyncedAt", "syncStatus"];
  const payloadHeaders = Array.from(
    new Set(rowPayloads.flatMap((payload) => Object.keys(payload))),
  );
  const existingHeaders = existing[0] || [];
  const headers = Array.from(
    new Set([...existingHeaders, ...mandatoryHeaders, ...payloadHeaders]),
  );

  if (!existingHeaders.length || existingHeaders.join("||") !== headers.join("||")) {
    await writeSheetRow(accessToken, spreadsheetId, tab, 1, headers);
  }

  const monitorIdIndex = headers.indexOf("monitorEntryId");
  const existingByMonitorId = new Map<string, number>();
  for (let i = 1; i < existing.length; i += 1) {
    const row = existing[i] || [];
    const monitorEntryId = String(row[monitorIdIndex] || "").trim();
    if (!monitorEntryId) continue;
    existingByMonitorId.set(monitorEntryId, i + 1);
  }

  let touched = 0;
  for (const payload of rowPayloads) {
    const monitorEntryId = String(payload.monitorEntryId || "").trim();
    if (!monitorEntryId) continue;
    const rowValues = headers.map((header) => {
      const value = payload[header];
      return value === undefined || value === null ? "" : value;
    });
    const existingRowNumber = existingByMonitorId.get(monitorEntryId);
    if (existingRowNumber) {
      await writeSheetRow(accessToken, spreadsheetId, tab, existingRowNumber, rowValues);
    } else {
      await appendSheetRow(accessToken, spreadsheetId, tab, rowValues);
    }
    touched += 1;
  }

  return touched;
}

async function upsertDictionaryValues(
  accessToken: string,
  spreadsheetId: string,
  tab: string,
  header: string,
  values: string[],
  nowIso: string,
) {
  if (!tab || !values.length) return 0;

  const normalizedValues = Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, "en"));
  if (!normalizedValues.length) return 0;

  const existing = await readSheetValues(accessToken, spreadsheetId, tab);
  const existingHeaders = existing[0] || [];
  const headers = existingHeaders.length
    ? existingHeaders
    : [header, "source", "lastSyncedAt"];
  if (!existingHeaders.length) {
    await writeSheetRow(accessToken, spreadsheetId, tab, 1, headers);
  }

  const keyIndex = 0;
  const existingKeys = new Set<string>();
  for (let i = 1; i < existing.length; i += 1) {
    const key = String(existing[i]?.[keyIndex] || "").trim().toLowerCase();
    if (key) existingKeys.add(key);
  }

  let inserted = 0;
  for (const value of normalizedValues) {
    const normalizedKey = value.toLowerCase();
    if (existingKeys.has(normalizedKey)) continue;
    await appendSheetRow(accessToken, spreadsheetId, tab, [value, "monitor", nowIso]);
    existingKeys.add(normalizedKey);
    inserted += 1;
  }
  return inserted;
}

function collectDailyDictionaryValues(entries: SeaBrokerageEntryRow[]) {
  const buyers = entries.map((entry) => String(entry.buyerName || "").trim()).filter(Boolean);
  const sellers = entries.map((entry) => String(entry.sellerName || "").trim()).filter(Boolean);
  const entities = entries
    .flatMap((entry) => [entry.companyName, entry.sellerName])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const commodities = entries
    .map((entry) => String(entry.commodityLabel || entry.commodity || "").trim())
    .filter(Boolean);
  const locations = entries
    .map((entry) => String(entry.destinationPort || "").trim())
    .filter(Boolean);
  const countries = entries
    .flatMap((entry) => [entry.originCountry, entry.destinationCountry])
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return { buyers, sellers, entities, commodities, locations, countries };
}

export async function syncSeaBrokerageMonitorDayToSheets(
  inputDate: Date = new Date(),
): Promise<SheetsSyncResult> {
  const errors: string[] = [];
  const local = getLocalDateParts(inputDate, DEFAULT_TIMEZONE);

  const config = getRequiredConfig();
  if (!config) {
    return {
      ok: false,
      dateKey: local.dateKey,
      syncedEntries: 0,
      syncedBids: 0,
      syncedOffers: 0,
      syncedTrades: 0,
      dictionariesUpdated: 0,
      errors: [
        "Missing required Sheets sync env: SEA_BROKERAGE_SHEETS_SPREADSHEET_ID / SERVICE_ACCOUNT_EMAIL / SERVICE_ACCOUNT_PRIVATE_KEY",
      ],
    };
  }

  const allEntries = await storage.listSeaBrokerageEntries();
  const dailyEntries = allEntries.filter((entry) =>
    shouldSyncEntryForDate(entry, local.dateKey, DEFAULT_TIMEZONE),
  );
  const bids = dailyEntries.filter((entry) => entry.type === "bid");
  const offers = dailyEntries.filter((entry) => entry.type === "offer");
  const trades = dailyEntries.filter((entry) => entry.type === "trade");

  let accessToken = "";
  try {
    accessToken = await requestGoogleAccessToken(config);
  } catch (error: any) {
    return {
      ok: false,
      dateKey: local.dateKey,
      syncedEntries: 0,
      syncedBids: 0,
      syncedOffers: 0,
      syncedTrades: 0,
      dictionariesUpdated: 0,
      errors: [error?.message || "Failed to authorize Google Sheets access"],
    };
  }

  const nowIso = new Date().toISOString();

  let syncedBids = 0;
  let syncedOffers = 0;
  let syncedTrades = 0;
  let dictionariesUpdated = 0;

  try {
    if (bids.length) {
      syncedBids = await upsertRowsByMonitorEntryId(
        accessToken,
        config.spreadsheetId,
        DEFAULT_BID_TAB,
        bids.map((entry) => toRowPayload(entry, nowIso)),
      );
    }
  } catch (error: any) {
    errors.push(`BID tab sync failed: ${error?.message || "unknown error"}`);
  }

  try {
    if (offers.length) {
      syncedOffers = await upsertRowsByMonitorEntryId(
        accessToken,
        config.spreadsheetId,
        DEFAULT_OFFER_TAB,
        offers.map((entry) => toRowPayload(entry, nowIso)),
      );
    }
  } catch (error: any) {
    errors.push(`OFFER tab sync failed: ${error?.message || "unknown error"}`);
  }

  const syncTrades = parseBoolean(process.env.SEA_BROKERAGE_SHEETS_SYNC_TRADES, true);
  if (syncTrades) {
    try {
      if (trades.length) {
        syncedTrades = await upsertRowsByMonitorEntryId(
          accessToken,
          config.spreadsheetId,
          DEFAULT_TRADE_TAB,
          trades.map((entry) => toRowPayload(entry, nowIso)),
        );
      }
    } catch (error: any) {
      errors.push(`TRADE tab sync failed: ${error?.message || "unknown error"}`);
    }
  }

  const dictionaries = collectDailyDictionaryValues(dailyEntries);
  try {
    dictionariesUpdated += await upsertDictionaryValues(
      accessToken,
      config.spreadsheetId,
      DEFAULT_BUYERS_TAB,
      "Buyer",
      dictionaries.buyers,
      nowIso,
    );
  } catch (error: any) {
    errors.push(`Buyers dictionary sync failed: ${error?.message || "unknown error"}`);
  }
  try {
    dictionariesUpdated += await upsertDictionaryValues(
      accessToken,
      config.spreadsheetId,
      DEFAULT_SELLERS_TAB,
      "Seller",
      dictionaries.sellers,
      nowIso,
    );
  } catch (error: any) {
    errors.push(`Sellers dictionary sync failed: ${error?.message || "unknown error"}`);
  }
  try {
    dictionariesUpdated += await upsertDictionaryValues(
      accessToken,
      config.spreadsheetId,
      DEFAULT_ENTITIES_TAB,
      "Entity",
      dictionaries.entities,
      nowIso,
    );
  } catch (error: any) {
    errors.push(`Entities dictionary sync failed: ${error?.message || "unknown error"}`);
  }

  if (DEFAULT_COMMODITIES_TAB) {
    try {
      dictionariesUpdated += await upsertDictionaryValues(
        accessToken,
        config.spreadsheetId,
        DEFAULT_COMMODITIES_TAB,
        "Commodity",
        dictionaries.commodities,
        nowIso,
      );
    } catch (error: any) {
      errors.push(`Commodities dictionary sync failed: ${error?.message || "unknown error"}`);
    }
  }
  if (DEFAULT_LOCATIONS_TAB) {
    try {
      dictionariesUpdated += await upsertDictionaryValues(
        accessToken,
        config.spreadsheetId,
        DEFAULT_LOCATIONS_TAB,
        "Location",
        dictionaries.locations,
        nowIso,
      );
    } catch (error: any) {
      errors.push(`Locations dictionary sync failed: ${error?.message || "unknown error"}`);
    }
  }
  if (DEFAULT_COUNTRIES_TAB) {
    try {
      dictionariesUpdated += await upsertDictionaryValues(
        accessToken,
        config.spreadsheetId,
        DEFAULT_COUNTRIES_TAB,
        "Country",
        dictionaries.countries,
        nowIso,
      );
    } catch (error: any) {
      errors.push(`Countries dictionary sync failed: ${error?.message || "unknown error"}`);
    }
  }

  return {
    ok: errors.length === 0,
    dateKey: local.dateKey,
    syncedEntries: syncedBids + syncedOffers + syncedTrades,
    syncedBids,
    syncedOffers,
    syncedTrades,
    dictionariesUpdated,
    errors,
  };
}
