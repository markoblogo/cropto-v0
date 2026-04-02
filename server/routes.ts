import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { insertOptionSchema, insertFeedbackSchema, insertAnalyticsEventSchema, analyticsEvents, options, trades, settlements, indexPrices, marginCalls, transactions, indexes, commodityIndexPrices, insertCommodityIndexPriceSchema, platformFees, croptBalances, partnerOrganizations, serviceContracts, waitlistSignups, insertPartnerOrganizationSchema, insertServiceContractSchema, spotPositions, forwardOrders, forwardContracts, forwardSettlements, forwardSpreads, insertForwardOrderSchema, insertForwardSpreadSchema, marketPrices, marketPriceSourceStatus, marketPriceFetchLog, type HealthUpdateResponse, type SeaBrokerageEntryRow } from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import { z } from "zod";
import { eq, desc, gt, and, or, sql, asc, gte, lte, inArray } from "drizzle-orm";
import authRoutes from "./authRoutes";
import walletRoutes from "./walletRoutes";
import { registerOnchainRoutes } from "./onchainRoutes";
import { registerSpotRoutes } from "./spotRoutes";
import { startTransactionPoller } from "./onchain/poller";
import { startReconciler } from "./jobs/reconciler";
import { startPoller as startTelegramPoller } from "./jobs/telegramPoller";
import { runScraper } from "./jobs/telegramScraper";
import { MATCHING_FEE_PER_TON, SETTLEMENT_FEE_PER_TON } from "./fees";
import { authenticateToken, optionalAuth, type AuthRequest, findUserById, hasBrokerPermissions, hasAdminPermissions, listUsers } from "./auth";
import { 
  intrinsic, 
  shouldTriggerMargin, 
  calculateMarginCallAmount,
  computeIntrinsicValueUSD,
  computePremiumUSD,
  computeUnrealizedPnLUSD,
  collateralPct,
  computeNotional,
  getPartnerFeeStats
} from "./utils/finance";
import { processDeadlines } from "./cron/scheduler";
import { emailService } from "./utils/emailMock";
import { normalizeLegacyCommodity, WHEAT_115_NAME } from "./utils/commodity";
import { normalizeCommodity as normalizeCanonicalCommodity } from "@shared/commodities";
import { computeExpiryWindow } from "./expiryWindows";
import { serializeOptionToJson } from "./optionJson";
import { calculateInitialMargin, checkMarginCall, autoLiquidateIfNeeded } from "./marginEngine";
import { mapOptionToMarketRow } from "./utils/marketSnapshot";
import { calculateCalendarSpreads, calculateCrossCommoditySpreads, getAllSpreads } from "./utils/spreads";
import fs from "fs";
import path from "path";
import { AVAILABLE_COMMODITIES, COMMODITY_MAP, BASIS_CPT_ODESA, type CommoditySlug } from "@shared/commodities";
import { createHash, randomUUID } from "crypto";
import { getMockMarketDataBR, getMockMarketDataAR, getMockMarketDataUS, type MarketIndexDto } from "./services/mockMarketData";
import { deriveMarketHealth, selectCountryRows, selectTruthSeriesPerCommodity } from "./services/dashboardSourcePolicy";
import { IGC_SERIES_MAPPING } from "./services/igcSeriesMapping";
import { getSourceDescriptor } from "./services/sourceCatalog";
import { findSpreadSpec } from "./services/specRegistry";
import { MARKET_COMMODITY_CONFIG } from "./ingestion/config";
import { getMarketIngestionRuntimeState, runMarketIngestionOnce } from "./ingestion/scheduler/marketIngestionJob";
import { providerDefinitionsFor } from "./ingestion/config";
import { fetchAndParseProvider } from "./ingestion/sources/common";
import { getRuntimeInfo } from "./runtimeInfo";
import {
  publishSeaBrokerageEntryToTelegram,
  publishSeaBrokerageMatchToTelegram,
  sendSeaBrokerageTelegramDirectMessage,
} from "./services/seaBrokerageTelegramPublisher";
import { generateSeaBrokerageMatchSuggestions } from "./services/seaBrokerageMatching";
import {
  listSeaBrokerageBrokerAllowlist,
  resolveAuthorizedSeaBrokerageBrokerByTelegram,
} from "./services/seaBrokerageBrokerAccess";
import {
  readSeaBrokerageMonitorIdentityFromToken,
  signSeaBrokerageMonitorToken,
  verifyTelegramMiniAppInitData,
  verifyTelegramLoginPayload,
  type TelegramMiniAppLoginPayload,
  type TelegramLoginPayload,
} from "./services/seaBrokerageTelegramAuth";
import {
  consumeSeaBrokerageTelegramMagicLink,
  issueSeaBrokerageTelegramMagicLink,
  issueSeaBrokerageTelegramOtp,
  verifySeaBrokerageTelegramOtp,
} from "./services/seaBrokerageTelegramOtp";
import { formatSeaBrokerageBasisRoute } from "./services/seaBrokerageBasisFormat";

const STALE_MAX_AGE_DAYS = 7;
const DEFAULT_FEEDBACK_ALERT_EMAIL = "a.biletskiy@gmail.com";
const USER_NOTIFICATION_PREFS_PREFIX = "user_notification_prefs:";
const INDEX_UPDATE_MAILING_MODE_KEY = "index_update_mailing_mode";
const DEFAULT_INDEX_UPDATE_MAILING_MODE = "manual";
let hasWarnedMissingAnalyticsEventsTable = false;

type UserNotificationPreferences = {
  tradeStatus: boolean;
  marginCalls: boolean;
  indexUpdates: boolean;
  system: boolean;
};

type IndexUpdateMailingMode = "manual" | "auto";

const DEFAULT_USER_NOTIFICATION_PREFS: UserNotificationPreferences = {
  tradeStatus: true,
  marginCalls: true,
  indexUpdates: false,
  system: true,
};

const createSeaBrokerageEntryRequestSchema = z.object({
  type: z.enum(["bid", "offer", "trade"]),
  sellerName: z.string().trim().max(200).nullable().optional(),
  buyerName: z.string().trim().max(200).nullable().optional(),
  tradeSellerBrokerTelegramUserId: z.string().trim().nullable().optional(),
  tradeSellerBrokerTelegramUsername: z.string().trim().nullable().optional(),
  tradeBuyerBrokerTelegramUserId: z.string().trim().nullable().optional(),
  tradeBuyerBrokerTelegramUsername: z.string().trim().nullable().optional(),
  originCountry: z.string().trim().nullable().optional(),
  originCountryCode: z.string().trim().nullable().optional(),
  commodity: z.string().min(1),
  commodityLabel: z.string().min(1),
  gradeOrSpec: z.string().optional().default(""),
  quantityMt: z.coerce.number().int().nonnegative().nullable().optional(),
  tolerancePct: z.coerce.number().int().min(0).max(25).nullable().optional(),
  volumeFrom: z.coerce.number().int().nonnegative(),
  volumeTo: z.coerce.number().int().nonnegative(),
  volumeUnit: z.string().min(1),
  basis: z.string().min(1),
  paymentTerms: z.string().trim().nullable().optional(),
  isNewCrop: z.coerce.boolean().optional().default(false),
  sellerCommission: z.coerce.number().nonnegative().nullable().optional(),
  buyerCommission: z.coerce.number().nonnegative().nullable().optional(),
  destinationPortCode: z.string().trim().nullable().optional(),
  destinationPortCodes: z.array(z.string().trim().min(1)).optional(),
  destinationPort: z.string().min(1),
  destinationCountryCode: z.string().trim().nullable().optional(),
  destinationCountry: z.string().min(1),
  periodType: z.string().min(1),
  periodLabel: z.string().min(1),
  periodStart: z.string().trim().nullable().optional(),
  periodEnd: z.string().trim().nullable().optional(),
  price: z.coerce.number().nonnegative().nullable().optional(),
  priceFrom: z.coerce.number().nonnegative().nullable(),
  priceTo: z.coerce.number().nonnegative().nullable(),
  currency: z.string().min(1),
  transportType: z.string().min(1),
  note: z.string().trim().max(500).nullable().optional(),
  canonicalView: z.string().min(1),
});

const updateSeaBrokerageEntryRequestSchema = createSeaBrokerageEntryRequestSchema;

function parseDestinationPortCodesValue(raw: string | null | undefined) {
  const normalized = String(raw || "").trim();
  if (!normalized) return [] as string[];
  return normalized
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
}

function resolveDestinationPortCodesFromPayload(payload: {
  destinationPortCode?: string | null;
  destinationPortCodes?: string[] | null;
}) {
  const fromArray = Array.isArray(payload.destinationPortCodes)
    ? payload.destinationPortCodes.map((code) => String(code || "").trim()).filter(Boolean)
    : [];
  if (fromArray.length) return fromArray;
  return parseDestinationPortCodesValue(payload.destinationPortCode);
}

const upsertSeaBrokerageBrokerAuthSchema = z.object({
  authUserId: z.string().trim().nullable().optional(),
  authEmail: z.string().trim().email().nullable().optional(),
  telegramUserId: z.string().trim().nullable().optional(),
  telegramUsername: z.string().trim().nullable().optional(),
  brokerCode: z.string().trim().min(1),
  brokerName: z.string().trim().min(1),
  companyName: z.string().trim().min(1),
  isActive: z.boolean().optional().default(true),
});

const seaBrokerageTelegramLoginSchema = z.object({
  id: z.union([z.string(), z.number()]),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().optional(),
  auth_date: z.union([z.string(), z.number()]),
  hash: z.string().min(1),
});

const seaBrokerageTelegramMiniAppLoginSchema = z.object({
  initData: z.string().trim().min(1),
});

const seaBrokerageTelegramCodeRequestSchema = z.object({
  telegramUsername: z.string().trim().min(2),
});

const seaBrokerageTelegramCodeVerifySchema = z.object({
  telegramUsername: z.string().trim().min(2),
  code: z.string().trim().regex(/^\d{6}$/),
});

const seaBrokerageTelegramMagicLinkRequestSchema = z.object({
  telegramUsername: z.string().trim().min(2),
});

const seaBrokerageTelegramMagicLinkConsumeSchema = z.object({
  token: z.string().trim().min(16),
});

const seaBrokerageLocationCreateSchema = z.object({
  displayLabel: z.string().trim().min(2).max(60),
  countryCode: z.string().trim().length(2),
  countryCodeAlpha3: z.string().trim().length(3),
});

const seaBrokerageCompanyCreateSchema = z.object({
  displayLabel: z.string().trim().min(2).max(120),
});

const seaBrokerageCountryCreateSchema = z.object({
  displayLabel: z.string().trim().min(2).max(80),
  countryCode: z.string().trim().length(2),
  countryCodeAlpha3: z.string().trim().length(3),
});

const seaBrokerageCommodityCreateSchema = z.object({
  displayLabel: z.string().trim().min(2).max(80),
  code: z.string().trim().min(2).max(40).optional(),
  group: z.enum(["grains", "oilseeds", "processed"]).optional(),
});

const seaBrokerageReportRequestSchema = z
  .object({
    commodity: z.string().trim().optional().default(""),
    commodities: z.array(z.string().trim()).optional().default([]),
    basis: z.array(z.string().trim()).optional().default([]),
    deliveryPlaces: z.array(z.string().trim()).optional().default([]),
    periodStart: z.string().trim().optional().default(""),
    periodEnd: z.string().trim().optional().default(""),
    overlapDays: z.coerce.number().int().min(1).max(15).optional().default(1),
    postedFrom: z.string().trim().optional().default(""),
    postedTo: z.string().trim().optional().default(""),
    includeBids: z.coerce.boolean().optional().default(true),
    includeOffers: z.coerce.boolean().optional().default(true),
  })
  .superRefine((value, ctx) => {
    const selectedCommodities = [
      ...value.commodities,
      ...(value.commodity ? [value.commodity] : []),
    ].filter(Boolean);
    if (!selectedCommodities.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["commodities"],
        message: "Select at least one commodity",
      });
    }
    if (!value.postedFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["postedFrom"],
        message: "Posted from date is required",
      });
    }
    if (!value.postedTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["postedTo"],
        message: "Posted to date is required",
      });
    }
    if (!value.periodStart) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["periodStart"],
        message: "Period start is required",
      });
    }
    if (!value.periodEnd) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["periodEnd"],
        message: "Period end is required",
      });
    }
    if (!value.includeBids && !value.includeOffers) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["includeBids"],
        message: "Select at least one side (bids or offers)",
      });
    }
  });

type SeaBrokerageCustomLocation = {
  code: string;
  displayLabel: string;
  countryCode: string;
  countryCodeAlpha3: string;
  compactDisplay: string;
  unlocode?: string;
};

const SEA_BROKERAGE_CUSTOM_LOCATIONS_KEY = "sea_brokerage_custom_locations_v1";
const SEA_BROKERAGE_COMPANIES_KEY = "sea_brokerage_companies_v1";
const SEA_BROKERAGE_COUNTRIES_KEY = "sea_brokerage_countries_v1";
const SEA_BROKERAGE_COMMODITIES_KEY = "sea_brokerage_commodities_v1";
const SEA_BROKERAGE_BASIS_KEY = "sea_brokerage_basis_v1";
const SEA_BROKERAGE_ENTRY_LIKES_KEY = "sea_brokerage_entry_likes_v1";
const SEA_BROKERAGE_MATCH_LIKES_KEY = "sea_brokerage_match_likes_v1";
const SEA_BROKERAGE_FILTER_PRESETS_KEY = "sea_brokerage_filter_presets_v1";
const SEA_BROKERAGE_BOSS_CODES = new Set(["OS", "VZH", "ABV"]);
const SEA_BROKERAGE_DEFAULT_TIMEZONE = process.env.SEA_BROKERAGE_TIMEZONE || "Europe/Paris";

type SeaBrokerageEntryLike = {
  entryId: string;
  brokerUserId: string;
  brokerCode: string;
  brokerName: string;
  telegramUsername?: string | null;
  telegramUserId?: string | null;
  createdAt: string;
};

type SeaBrokerageMatchLike = {
  matchId: string;
  bidEntryId: string;
  offerEntryId: string;
  likerBrokerUserId: string;
  likerBrokerCode: string;
  likerBrokerName: string;
  kind: "normal" | "boss";
  createdAt: string;
};

type SeaBrokerageFilterPreset = {
  id: string;
  brokerUserId: string;
  brokerCode: string;
  name: string;
  isDefault: boolean;
  filters: {
    commodity: string;
    basis: string;
    brokerProfileId: string;
    businessUnits: string[];
    originCountries: string[];
    currencies: string[];
    transportModes: string[];
    originCountry: string;
    deliveryPlace: string;
    search: string;
  };
  offerPaneFilters: {
    brokerProfileId: string;
    search: string;
  };
  bidPaneFilters: {
    brokerProfileId: string;
    search: string;
  };
  tradePaneFilters: {
    brokerProfileId: string;
    search: string;
  };
  createdAt: string;
  updatedAt: string;
};

const seaBrokerageFilterPresetPayloadSchema = z.object({
  name: z.string().trim().min(1).max(60),
  isDefault: z.coerce.boolean().optional(),
  filters: z.object({
    commodity: z.string().trim().default("all"),
    basis: z.string().trim().default("all"),
    brokerProfileId: z.string().trim().default("all"),
    businessUnits: z.array(z.string().trim()).default([]),
    originCountries: z.array(z.string().trim()).default([]),
    currencies: z.array(z.string().trim()).default([]),
    transportModes: z.array(z.string().trim()).default([]),
    originCountry: z.string().trim().default("all"),
    deliveryPlace: z.string().trim().default("all"),
    search: z.string().default(""),
  }),
  offerPaneFilters: z.object({
    brokerProfileId: z.string().trim().default("all"),
    search: z.string().default(""),
  }),
  bidPaneFilters: z.object({
    brokerProfileId: z.string().trim().default("all"),
    search: z.string().default(""),
  }),
  tradePaneFilters: z.object({
    brokerProfileId: z.string().trim().default("all"),
    search: z.string().default(""),
  }),
});

const seaBrokerageFilterPresetUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  isDefault: z.coerce.boolean().optional(),
});

function decimalToNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function mapSeaBrokerageEntryToClientShape(
  entry: SeaBrokerageEntryRow,
  likeMeta?: { likeCount: number; likedByMe: boolean; hasBossMatchLike?: boolean },
) {
  const destinationPortCodes = parseDestinationPortCodesValue(entry.destinationPortCode);
  const primaryDestinationPortCode = destinationPortCodes[0] ?? null;
  return {
    id: entry.id,
    type: entry.type,
    brokerId: entry.brokerUserId,
    brokerCode: entry.brokerCode,
    brokerName: entry.brokerName,
    companyName: entry.companyName,
    brokerTelegramUserId: entry.brokerTelegramUserId,
    brokerTelegramUsername: entry.brokerTelegramUsername,
    sellerName: entry.sellerName,
    buyerName: entry.buyerName,
    tradeSellerBrokerTelegramUserId: entry.tradeSellerBrokerTelegramUserId,
    tradeSellerBrokerTelegramUsername: entry.tradeSellerBrokerTelegramUsername,
    tradeBuyerBrokerTelegramUserId: entry.tradeBuyerBrokerTelegramUserId,
    tradeBuyerBrokerTelegramUsername: entry.tradeBuyerBrokerTelegramUsername,
    originCountry: entry.originCountry,
    originCountryCode: entry.originCountryCode,
    commodity: entry.commodity,
    commodityLabel: entry.commodityLabel,
    gradeOrSpec: entry.gradeOrSpec,
    quantityMt: entry.quantityMt,
    tolerancePct: entry.tolerancePct,
    volumeFrom: entry.volumeFrom,
    volumeTo: entry.volumeTo,
    volumeUnit: entry.volumeUnit,
    basis: entry.basis,
    paymentTerms: entry.paymentTerms,
    isNewCrop: !!entry.isNewCrop,
    sellerCommission: decimalToNumber(entry.sellerCommission),
    buyerCommission: decimalToNumber(entry.buyerCommission),
    destinationPortCode: primaryDestinationPortCode,
    destinationPortCodes,
    destinationPort: entry.destinationPort,
    destinationCountryCode: entry.destinationCountryCode,
    destinationCountry: entry.destinationCountry,
    periodType: entry.periodType,
    periodLabel: entry.periodLabel,
    periodStart: entry.periodStart,
    periodEnd: entry.periodEnd,
    price: decimalToNumber(entry.price),
    priceFrom: decimalToNumber(entry.priceFrom),
    priceTo: decimalToNumber(entry.priceTo),
    currency: entry.currency,
    transportType: entry.transportType,
    note: entry.note,
    createdAt: entry.createdAt instanceof Date ? entry.createdAt.toISOString() : String(entry.createdAt),
    createdBy: {
      id: entry.brokerUserId,
      authUserId: entry.brokerUserId,
      brokerCode: entry.brokerCode,
      brokerName: entry.brokerName,
      companyName: entry.companyName,
      displayName: entry.brokerName,
      email: entry.brokerEmail ?? "",
      role: "broker",
      identityProvider: "telegram_future",
    },
    canonicalView: entry.canonicalView,
    telegramRelayStatus: entry.telegramRelayStatus,
    telegramRelayMessage: entry.telegramRelayMessage,
    likeCount: likeMeta?.likeCount ?? 0,
    likedByMe: likeMeta?.likedByMe ?? false,
    hasBossMatchLike: likeMeta?.hasBossMatchLike ?? false,
  };
}

function readSeaBrokerageTelegramIdentityHeaders(req: AuthRequest) {
  const telegramUserId = String(req.headers["x-sea-telegram-user-id"] || "").trim();
  const telegramUsernameRaw = String(req.headers["x-sea-telegram-username"] || "").trim();
  const telegramUsername = telegramUsernameRaw.replace(/^@+/, "");
  return {
    telegramUserId: telegramUserId || null,
    telegramUsername: telegramUsername || null,
  };
}

function readSeaBrokerageTelegramIdentity(req: AuthRequest) {
  const fromToken = readSeaBrokerageMonitorIdentityFromToken(req);
  if (fromToken) return fromToken;
  return readSeaBrokerageTelegramIdentityHeaders(req);
}

function parseBooleanEnv(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function normalizeCityLabel(value: string) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeCompanyLabel(value: string) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

const SEA_BROKERAGE_COMPANY_LABEL_REGEX = /^[A-Za-z0-9][A-Za-z0-9\s'"&().,\/-]{1,119}$/;

function isSeaBrokerageCompanyLabelAllowed(value: string) {
  return SEA_BROKERAGE_COMPANY_LABEL_REGEX.test(value);
}

function slugifyLocationLabel(value: string) {
  return normalizeCityLabel(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 42);
}

function buildCustomLocationCode(label: string, countryCode: string) {
  const baseSlug = slugifyLocationLabel(label) || "custom_place";
  return `custom_${baseSlug}_${countryCode.toLowerCase()}`;
}

async function readSeaBrokerageCustomLocations(): Promise<SeaBrokerageCustomLocation[]> {
  const raw = (await storage.getAppSetting(SEA_BROKERAGE_CUSTOM_LOCATIONS_KEY))?.value || "[]";
  try {
    const parsed = JSON.parse(raw) as SeaBrokerageCustomLocation[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item) =>
          item &&
          typeof item.code === "string" &&
          typeof item.displayLabel === "string" &&
          typeof item.countryCode === "string" &&
          typeof item.countryCodeAlpha3 === "string" &&
          typeof item.compactDisplay === "string",
      )
      .map((item) => ({
        code: String(item.code).trim(),
        displayLabel: normalizeCityLabel(item.displayLabel),
        countryCode: String(item.countryCode).trim().toUpperCase(),
        countryCodeAlpha3: String(item.countryCodeAlpha3).trim().toUpperCase(),
        compactDisplay: String(item.compactDisplay).trim().toUpperCase(),
        unlocode: item.unlocode ? String(item.unlocode).trim().toUpperCase() : undefined,
      }));
  } catch {
    return [];
  }
}

type SeaBrokerageCompanyDictionaryEntry = {
  id: string;
  displayLabel: string;
  compactDisplay: string;
};

type SeaBrokerageCountryDictionaryEntry = {
  code: string;
  displayLabel: string;
  countryCodeAlpha3: string;
  compactDisplay: string;
};

type SeaBrokerageCommodityDictionaryEntry = {
  code: string;
  displayLabel: string;
  compactDisplay: string;
  group?: "grains" | "oilseeds" | "processed";
};

const SEA_BROKERAGE_DEFAULT_BASIS = ["FOB", "CIF", "CPT", "DAP", "FCA", "EXW", "FAS", "CFR"];

function buildCompanyId(label: string) {
  const baseSlug = slugifyLocationLabel(label) || "company";
  return `company_${baseSlug}`;
}

async function readSeaBrokerageCompanies(): Promise<SeaBrokerageCompanyDictionaryEntry[]> {
  const raw = (await storage.getAppSetting(SEA_BROKERAGE_COMPANIES_KEY))?.value || "[]";
  try {
    const parsed = JSON.parse(raw) as SeaBrokerageCompanyDictionaryEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item) =>
          item &&
          typeof item.id === "string" &&
          typeof item.displayLabel === "string" &&
          typeof item.compactDisplay === "string",
      )
      .map((item) => ({
        id: String(item.id).trim(),
        displayLabel: normalizeCompanyLabel(item.displayLabel),
        compactDisplay: String(item.compactDisplay).trim().toUpperCase(),
      }));
  } catch {
    return [];
  }
}

async function readSeaBrokerageCountries(): Promise<SeaBrokerageCountryDictionaryEntry[]> {
  const raw = (await storage.getAppSetting(SEA_BROKERAGE_COUNTRIES_KEY))?.value || "[]";
  try {
    const parsed = JSON.parse(raw) as SeaBrokerageCountryDictionaryEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item) =>
          item &&
          typeof item.code === "string" &&
          typeof item.displayLabel === "string" &&
          typeof item.countryCodeAlpha3 === "string" &&
          typeof item.compactDisplay === "string",
      )
      .map((item) => ({
        code: String(item.code).trim().toUpperCase(),
        displayLabel: normalizeCityLabel(item.displayLabel),
        countryCodeAlpha3: String(item.countryCodeAlpha3).trim().toUpperCase(),
        compactDisplay: String(item.compactDisplay).trim().toUpperCase(),
      }));
  } catch {
    return [];
  }
}

async function readSeaBrokerageCommodities(): Promise<SeaBrokerageCommodityDictionaryEntry[]> {
  const raw = (await storage.getAppSetting(SEA_BROKERAGE_COMMODITIES_KEY))?.value || "[]";
  try {
    const parsed = JSON.parse(raw) as SeaBrokerageCommodityDictionaryEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item) =>
          item &&
          typeof item.code === "string" &&
          typeof item.displayLabel === "string" &&
          typeof item.compactDisplay === "string",
      )
      .map((item) => ({
        code: String(item.code).trim(),
        displayLabel: normalizeCityLabel(item.displayLabel),
        compactDisplay: String(item.compactDisplay).trim().toUpperCase(),
        group:
          item.group === "grains" || item.group === "oilseeds" || item.group === "processed"
            ? item.group
            : undefined,
      }));
  } catch {
    return [];
  }
}

async function readSeaBrokerageBasis(): Promise<string[]> {
  const raw = (await storage.getAppSetting(SEA_BROKERAGE_BASIS_KEY))?.value || "[]";
  try {
    const parsed = JSON.parse(raw) as string[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => String(item || "").trim().toUpperCase())
      .filter((item) => !!item && /^[A-Z0-9 .+\-\/]{2,24}$/.test(item));
  } catch {
    return [];
  }
}

function deriveSeaBrokerageBasisFromEntries(entries: SeaBrokerageEntryRow[]): string[] {
  const values = new Set<string>();
  for (const entry of entries) {
    const basis = String(entry.basis || "").trim().toUpperCase();
    if (!basis) continue;
    values.add(basis);
  }
  return Array.from(values);
}

function mergeSeaBrokerageBasis(...groups: string[][]): string[] {
  const values = new Set<string>();
  for (const group of groups) {
    for (const item of group) {
      const basis = String(item || "").trim().toUpperCase();
      if (!basis || !/^[A-Z0-9 .+\-\/]{2,24}$/.test(basis)) continue;
      values.add(basis);
    }
  }
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

function countryAlpha3FromCode(code: string) {
  const normalized = code.toUpperCase();
  if (normalized === "UA") return "UKR";
  if (normalized === "MD") return "MDA";
  if (normalized === "BG") return "BGR";
  if (normalized === "EG") return "EGY";
  if (normalized === "IL") return "ISR";
  if (normalized === "CY") return "CYP";
  if (normalized === "LB") return "LBN";
  if (normalized === "ES") return "ESP";
  if (normalized === "IT") return "ITA";
  if (normalized === "NL") return "NLD";
  if (normalized === "RO") return "ROU";
  if (normalized === "TR") return "TUR";
  return "";
}

function deriveSeaBrokerageCountriesFromEntries(
  entries: SeaBrokerageEntryRow[],
): SeaBrokerageCountryDictionaryEntry[] {
  const byCode = new Map<string, SeaBrokerageCountryDictionaryEntry>();
  for (const entry of entries) {
    const candidates = [
      { code: entry.originCountryCode, label: entry.originCountry },
      { code: entry.destinationCountryCode, label: entry.destinationCountry },
    ];
    for (const candidate of candidates) {
      const code = String(candidate.code || "").trim().toUpperCase();
      const label = normalizeCityLabel(String(candidate.label || ""));
      if (!/^[A-Z]{2}$/.test(code) || !label) continue;
      if (!byCode.has(code)) {
        const alpha3 = countryAlpha3FromCode(code) || `${code}X`;
        byCode.set(code, {
          code,
          displayLabel: label,
          countryCodeAlpha3: alpha3,
          compactDisplay: alpha3,
        });
      }
    }
  }
  return Array.from(byCode.values());
}

function mergeSeaBrokerageCountries(
  left: SeaBrokerageCountryDictionaryEntry[],
  right: SeaBrokerageCountryDictionaryEntry[],
): SeaBrokerageCountryDictionaryEntry[] {
  const byCode = new Map<string, SeaBrokerageCountryDictionaryEntry>();
  for (const item of [...left, ...right]) {
    const code = String(item.code || "").trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) continue;
    if (!byCode.has(code)) {
      byCode.set(code, {
        code,
        displayLabel: normalizeCityLabel(item.displayLabel),
        countryCodeAlpha3: String(item.countryCodeAlpha3 || "").trim().toUpperCase(),
        compactDisplay: String(item.compactDisplay || "").trim().toUpperCase(),
      });
    }
  }
  return Array.from(byCode.values()).sort((a, b) =>
    a.displayLabel.localeCompare(b.displayLabel),
  );
}

function buildCommodityCode(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return slug || `commodity_${createHash("md5").update(value).digest("hex").slice(0, 8)}`;
}

function deriveSeaBrokerageCommoditiesFromEntries(
  entries: SeaBrokerageEntryRow[],
): SeaBrokerageCommodityDictionaryEntry[] {
  const byCode = new Map<string, SeaBrokerageCommodityDictionaryEntry>();
  for (const entry of entries) {
    const code = String(entry.commodity || "").trim();
    const label = normalizeCityLabel(String(entry.commodityLabel || ""));
    if (!code || !label) continue;
    if (!byCode.has(code)) {
      byCode.set(code, {
        code,
        displayLabel: label,
        compactDisplay: label.toUpperCase(),
        group: "processed",
      });
    }
  }
  return Array.from(byCode.values());
}

function mergeSeaBrokerageCommodities(
  left: SeaBrokerageCommodityDictionaryEntry[],
  right: SeaBrokerageCommodityDictionaryEntry[],
): SeaBrokerageCommodityDictionaryEntry[] {
  const byCode = new Map<string, SeaBrokerageCommodityDictionaryEntry>();
  for (const item of [...left, ...right]) {
    const code = String(item.code || "").trim();
    if (!code) continue;
    if (!byCode.has(code)) {
      byCode.set(code, {
        code,
        displayLabel: normalizeCityLabel(item.displayLabel),
        compactDisplay: String(item.compactDisplay || "").trim().toUpperCase(),
        group:
          item.group === "grains" || item.group === "oilseeds" || item.group === "processed"
            ? item.group
            : "processed",
      });
    }
  }
  return Array.from(byCode.values()).sort((a, b) =>
    a.displayLabel.localeCompare(b.displayLabel),
  );
}

function buildSeaBrokerageCompanyEntry(label: string): SeaBrokerageCompanyDictionaryEntry {
  const normalized = normalizeCompanyLabel(label);
  return {
    id: buildCompanyId(normalized),
    displayLabel: normalized,
    compactDisplay: normalized.toUpperCase(),
  };
}

function deriveSeaBrokerageCompaniesFromEntries(
  entries: SeaBrokerageEntryRow[],
): SeaBrokerageCompanyDictionaryEntry[] {
  const labels = new Set<string>();
  for (const entry of entries) {
    const seller = normalizeCompanyLabel(entry.sellerName || "");
    const buyer = normalizeCompanyLabel(entry.buyerName || "");
    if (seller && isSeaBrokerageCompanyLabelAllowed(seller)) labels.add(seller);
    if (buyer && isSeaBrokerageCompanyLabelAllowed(buyer)) labels.add(buyer);
  }

  return Array.from(labels.values()).map((label) => buildSeaBrokerageCompanyEntry(label));
}

function mergeSeaBrokerageCompanies(
  left: SeaBrokerageCompanyDictionaryEntry[],
  right: SeaBrokerageCompanyDictionaryEntry[],
): SeaBrokerageCompanyDictionaryEntry[] {
  const byLabel = new Map<string, SeaBrokerageCompanyDictionaryEntry>();
  for (const item of [...left, ...right]) {
    const normalizedLabel = normalizeCompanyLabel(item.displayLabel);
    if (!normalizedLabel || !isSeaBrokerageCompanyLabelAllowed(normalizedLabel)) continue;
    const key = normalizedLabel.toLowerCase();
    if (!key) continue;
    if (!byLabel.has(key)) {
      byLabel.set(key, {
        id: String(item.id || "").trim() || buildCompanyId(normalizedLabel),
        displayLabel: normalizedLabel,
        compactDisplay: String(item.compactDisplay || normalizedLabel.toUpperCase()).trim(),
      });
    }
  }

  return Array.from(byLabel.values()).sort((a, b) =>
    a.displayLabel.localeCompare(b.displayLabel),
  );
}

async function readSeaBrokerageEntryLikes(): Promise<SeaBrokerageEntryLike[]> {
  const raw = (await storage.getAppSetting(SEA_BROKERAGE_ENTRY_LIKES_KEY))?.value || "[]";
  try {
    const parsed = JSON.parse(raw) as SeaBrokerageEntryLike[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item) =>
          item &&
          typeof item.entryId === "string" &&
          typeof item.brokerUserId === "string" &&
          typeof item.brokerCode === "string" &&
          typeof item.brokerName === "string" &&
          typeof item.createdAt === "string",
      )
      .map((item) => ({
        entryId: String(item.entryId).trim(),
        brokerUserId: String(item.brokerUserId).trim(),
        brokerCode: String(item.brokerCode).trim(),
        brokerName: String(item.brokerName).trim(),
        telegramUsername: item.telegramUsername ? String(item.telegramUsername).trim() : null,
        telegramUserId: item.telegramUserId ? String(item.telegramUserId).trim() : null,
        createdAt: String(item.createdAt),
      }));
  } catch {
    return [];
  }
}

async function writeSeaBrokerageEntryLikes(likes: SeaBrokerageEntryLike[]) {
  await storage.upsertAppSetting(SEA_BROKERAGE_ENTRY_LIKES_KEY, JSON.stringify(likes));
}

async function readSeaBrokerageMatchLikes(): Promise<SeaBrokerageMatchLike[]> {
  const raw = (await storage.getAppSetting(SEA_BROKERAGE_MATCH_LIKES_KEY))?.value || "[]";
  try {
    const parsed = JSON.parse(raw) as SeaBrokerageMatchLike[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item) =>
          item &&
          typeof item.matchId === "string" &&
          typeof item.bidEntryId === "string" &&
          typeof item.offerEntryId === "string" &&
          typeof item.likerBrokerUserId === "string" &&
          typeof item.likerBrokerCode === "string" &&
          typeof item.likerBrokerName === "string" &&
          (item.kind === "normal" || item.kind === "boss") &&
          typeof item.createdAt === "string",
      )
      .map((item) => ({
        matchId: String(item.matchId).trim(),
        bidEntryId: String(item.bidEntryId).trim(),
        offerEntryId: String(item.offerEntryId).trim(),
        likerBrokerUserId: String(item.likerBrokerUserId).trim(),
        likerBrokerCode: String(item.likerBrokerCode).trim(),
        likerBrokerName: String(item.likerBrokerName).trim(),
        kind: item.kind === "boss" ? "boss" : "normal",
        createdAt: String(item.createdAt),
      }));
  } catch {
    return [];
  }
}

async function writeSeaBrokerageMatchLikes(likes: SeaBrokerageMatchLike[]) {
  await storage.upsertAppSetting(SEA_BROKERAGE_MATCH_LIKES_KEY, JSON.stringify(likes));
}

function resolveSeaBrokerageBrokerUserId(authorizedBroker: {
  telegramUserId: string | null;
  telegramUsername: string | null;
  authUserId: string | null;
  brokerCode: string;
}) {
  return (
    authorizedBroker.telegramUserId ||
    authorizedBroker.telegramUsername ||
    authorizedBroker.authUserId ||
    `broker:${authorizedBroker.brokerCode.toLowerCase()}`
  );
}

function resolveSeaBrokerageActorContext(authorizedBroker: {
  telegramUserId: string | null;
  telegramUsername: string | null;
  authUserId: string | null;
  brokerCode: string;
}) {
  const actorUserId = resolveSeaBrokerageBrokerUserId(authorizedBroker);
  const actorCode = String(authorizedBroker.brokerCode || "").trim().toUpperCase();
  return {
    actorUserId,
    actorCode,
    isBoss: SEA_BROKERAGE_BOSS_CODES.has(actorCode),
  };
}

function isSeaBrokerageEntryAuthor(
  entry: SeaBrokerageEntryRow,
  actor: { actorUserId: string; actorCode: string },
) {
  const entryBrokerUserId = String(entry.brokerUserId || "").trim().toLowerCase();
  const actorUserId = String(actor.actorUserId || "").trim().toLowerCase();
  const sameUserId = !!entryBrokerUserId && !!actorUserId && entryBrokerUserId === actorUserId;
  const sameCode =
    String(entry.brokerCode || "").trim().toUpperCase() === String(actor.actorCode || "").trim().toUpperCase();
  return sameUserId || sameCode;
}

function formatSeaBrokerageDateKeyInTimezone(value: Date | string, timezone: string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

function isSameSeaBrokerageBusinessDay(createdAt: Date | string, now = new Date()) {
  const createdKey = formatSeaBrokerageDateKeyInTimezone(createdAt, SEA_BROKERAGE_DEFAULT_TIMEZONE);
  const nowKey = formatSeaBrokerageDateKeyInTimezone(now, SEA_BROKERAGE_DEFAULT_TIMEZONE);
  return !!createdKey && !!nowKey && createdKey === nowKey;
}

function startOfUtcDay(dateIso: string) {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfUtcDay(dateIso: string) {
  const start = startOfUtcDay(dateIso);
  if (!start) return null;
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

function buildMonthUtcRange(periodMonth: string) {
  const [yearRaw, monthRaw] = periodMonth.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { start, end };
}

function getDateOverlapDaysInclusive(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  const start = Math.max(aStart.getTime(), bStart.getTime());
  const end = Math.min(aEnd.getTime(), bEnd.getTime());
  if (end < start) return 0;
  return Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1;
}

async function readSeaBrokerageFilterPresets(): Promise<SeaBrokerageFilterPreset[]> {
  const raw = (await storage.getAppSetting(SEA_BROKERAGE_FILTER_PRESETS_KEY))?.value || "[]";
  try {
    const parsed = JSON.parse(raw) as SeaBrokerageFilterPreset[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item) =>
          item &&
          typeof item.id === "string" &&
          typeof item.brokerUserId === "string" &&
          typeof item.brokerCode === "string" &&
          typeof item.name === "string" &&
          typeof item.isDefault === "boolean" &&
          typeof item.createdAt === "string" &&
          typeof item.updatedAt === "string" &&
          item.filters &&
          item.offerPaneFilters &&
          item.bidPaneFilters &&
          item.tradePaneFilters,
      )
      .map((item) => ({
        id: String(item.id).trim(),
        brokerUserId: String(item.brokerUserId).trim(),
        brokerCode: String(item.brokerCode).trim(),
        name: String(item.name).trim(),
        isDefault: !!item.isDefault,
        filters: {
          commodity: String(item.filters.commodity || "all"),
          basis: String(item.filters.basis || "all"),
          brokerProfileId: String(item.filters.brokerProfileId || "all"),
          businessUnits: Array.isArray(item.filters.businessUnits)
            ? item.filters.businessUnits.map((value) => String(value).toLowerCase()).filter(Boolean)
            : [],
          originCountries: Array.isArray(item.filters.originCountries)
            ? item.filters.originCountries.map((value) => String(value).toLowerCase()).filter(Boolean)
            : [],
          currencies: Array.isArray(item.filters.currencies)
            ? item.filters.currencies.map((value) => String(value).toUpperCase()).filter(Boolean)
            : [],
          transportModes: Array.isArray(item.filters.transportModes)
            ? item.filters.transportModes.map((value) => String(value).toLowerCase()).filter(Boolean)
            : [],
          originCountry: String(item.filters.originCountry || "all"),
          deliveryPlace: String(item.filters.deliveryPlace || "all"),
          search: String(item.filters.search || ""),
        },
        offerPaneFilters: {
          brokerProfileId: String(item.offerPaneFilters.brokerProfileId || "all"),
          search: String(item.offerPaneFilters.search || ""),
        },
        bidPaneFilters: {
          brokerProfileId: String(item.bidPaneFilters.brokerProfileId || "all"),
          search: String(item.bidPaneFilters.search || ""),
        },
        tradePaneFilters: {
          brokerProfileId: String(item.tradePaneFilters.brokerProfileId || "all"),
          search: String(item.tradePaneFilters.search || ""),
        },
        createdAt: String(item.createdAt),
        updatedAt: String(item.updatedAt),
      }));
  } catch {
    return [];
  }
}

async function writeSeaBrokerageFilterPresets(presets: SeaBrokerageFilterPreset[]) {
  await storage.upsertAppSetting(SEA_BROKERAGE_FILTER_PRESETS_KEY, JSON.stringify(presets));
}

function matchNotifiedKey(bidEntryId: string, offerEntryId: string) {
  return `sea_brokerage_match_notified:${bidEntryId}:${offerEntryId}`;
}

async function relaySeaBrokerageMatchesForEntry(updated: SeaBrokerageEntryRow) {
  const matchRelayEnabled = parseBooleanEnv(
    process.env.SEA_BROKERAGE_TELEGRAM_MATCHES_ENABLED,
    true,
  );

  if (!matchRelayEnabled) {
    return;
  }

  const allEntries = await storage.listSeaBrokerageEntries();
  const relatedMatches = generateSeaBrokerageMatchSuggestions(allEntries)
    .filter((match) => match.bidEntry.id === updated.id || match.offerEntry.id === updated.id)
    .sort(
      (a, b) =>
        new Date(b.bidEntry.createdAt).getTime() - new Date(a.bidEntry.createdAt).getTime(),
    )
    .slice(0, 20);

  console.info(
    "[SeaBrokerage][MatchRelayCandidates]",
    JSON.stringify({
      entryId: updated.id,
      entryType: updated.type,
      candidates: relatedMatches.length,
    }),
  );

  for (const match of relatedMatches) {
    const key = matchNotifiedKey(match.bidEntry.id, match.offerEntry.id);
    const alreadyNotified = await storage.getAppSetting(key);
    if (alreadyNotified?.value === "published") {
      continue;
    }

    const matchRelayResult = await publishSeaBrokerageMatchToTelegram(match);
    console.info(
      "[SeaBrokerage][MatchRelay]",
      JSON.stringify({
        bidEntryId: match.bidEntry.id,
        offerEntryId: match.offerEntry.id,
        score: match.score,
        status: matchRelayResult.status,
        error: matchRelayResult.error || null,
      }),
    );

    if (matchRelayResult.status === "published") {
      await storage.upsertAppSetting(key, "published");
      const compactBid = match.bidEntry.canonicalView;
      const compactOffer = match.offerEntry.canonicalView;
      const dmMessage = `#match_idea 🤝\nBID: ${compactBid}\nOFFER: ${compactOffer}`;
      const buyerBrokerChat = match.bidEntry.brokerTelegramUsername
        ? `@${match.bidEntry.brokerTelegramUsername.replace(/^@+/, "")}`
        : match.bidEntry.brokerTelegramUserId
          ? String(match.bidEntry.brokerTelegramUserId)
          : null;
      const sellerBrokerChat = match.offerEntry.brokerTelegramUsername
        ? `@${match.offerEntry.brokerTelegramUsername.replace(/^@+/, "")}`
        : match.offerEntry.brokerTelegramUserId
          ? String(match.offerEntry.brokerTelegramUserId)
          : null;
      if (buyerBrokerChat) {
        await sendSeaBrokerageTelegramDirectMessage(buyerBrokerChat, dmMessage);
      }
      if (sellerBrokerChat && sellerBrokerChat !== buyerBrokerChat) {
        await sendSeaBrokerageTelegramDirectMessage(sellerBrokerChat, dmMessage);
      }
    } else {
      await storage.upsertAppSetting(
        `${key}:last_error`,
        matchRelayResult.error || "unknown_match_relay_error",
      );
    }
  }
}

async function processSeaBrokerageEntryRelay(
  entry: SeaBrokerageEntryRow,
  brokerTelegramUsername?: string | null,
) {
  try {
    const relayResult = await publishSeaBrokerageEntryToTelegram(entry, {
      brokerTelegramUsername: brokerTelegramUsername ?? null,
    });
    const updated = await storage.updateSeaBrokerageEntry(entry.id, {
      telegramRelayStatus: relayResult.status,
      telegramRelayMessage: relayResult.messageText,
      telegramMessageId: relayResult.messageId ?? null,
    });
    await relaySeaBrokerageMatchesForEntry(updated);
  } catch (error) {
    console.error("[SeaBrokerage] Async relay failed:", error);
    try {
      await storage.updateSeaBrokerageEntry(entry.id, {
        telegramRelayStatus: "failed",
        telegramRelayMessage:
          error instanceof Error ? error.message : "Unknown async relay error",
      });
    } catch (updateError) {
      console.error("[SeaBrokerage] Failed to update relay status after async error:", updateError);
    }
  }
}

async function getFeedbackAlertRecipients(): Promise<string[]> {
  const configured = process.env.FEEDBACK_ALERT_EMAILS || process.env.FEEDBACK_ALERT_EMAIL || "";
  const envRecipients = configured
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);

  const dbSetting = await storage.getAppSetting("feedback_alert_emails");
  const dbRecipients = (dbSetting?.value || "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);

  const merged = [...envRecipients, ...dbRecipients];
  if (merged.length === 0) return [DEFAULT_FEEDBACK_ALERT_EMAIL];
  return Array.from(new Set(merged));
}

function computeIsStale(latestTimestamp: Date | string | null | undefined) {
  if (!latestTimestamp) return { isStale: true, staleReason: "no_recent_quotes" };
  const ts = new Date(latestTimestamp).getTime();
  if (Number.isNaN(ts)) return { isStale: true, staleReason: "invalid_timestamp" };
  const ageMs = Date.now() - ts;
  const thresholdMs = STALE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const isStale = ageMs > thresholdMs;
  return { isStale, staleReason: isStale ? `no_updates_since:${new Date(ts).toISOString()}` : null };
}

function computeFreshnessDays(timestamp: Date | string | null | undefined): number {
  if (!timestamp) return Number.POSITIVE_INFINITY;
  const ts = new Date(timestamp).getTime();
  if (Number.isNaN(ts)) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
}

function normalizeSourceLabel(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceLabelMatches(preferredLabel: string, actualLabel: string): boolean {
  const preferred = normalizeSourceLabel(preferredLabel);
  const actual = normalizeSourceLabel(actualLabel);
  if (!preferred || !actual) return false;
  if (actual.startsWith(preferred) || actual.includes(preferred)) return true;

  // Token-based fallback for minor upstream label reformatting.
  const preferredTokens = preferred.split(" ").filter((t) => t.length > 2);
  if (preferredTokens.length === 0) return false;
  const matchedTokens = preferredTokens.filter((token) => actual.includes(token)).length;
  return matchedTokens >= Math.max(2, Math.ceil(preferredTokens.length * 0.6));
}

function detectCountryFromText(source: string): "UA" | "BR" | "AR" | "US" | "N/A" {
  const s = source.toUpperCase();
  if (s.includes("/UA") || s.includes(" UA")) return "UA";
  if (s.includes("/BR") || s.includes(" BR")) return "BR";
  if (s.includes("/AR") || s.includes(" AR")) return "AR";
  if (s.includes("/US") || s.includes(" US") || s.includes(" USA")) return "US";
  return "N/A";
}

function buildOptionCountry(optionLike: Record<string, unknown>): "UA" | "BR" | "AR" | "US" | "N/A" {
  const source = [
    String(optionLike.title || ""),
    String(optionLike.commodity || ""),
    String(optionLike.commoditySlug || ""),
    String(optionLike.indexSlug || ""),
    String(optionLike.indexName || ""),
  ].join(" ");
  return detectCountryFromText(source);
}

function userNotificationPrefsKey(userId: string): string {
  return `${USER_NOTIFICATION_PREFS_PREFIX}${userId}`;
}

async function getUserNotificationPreferences(userId: string): Promise<UserNotificationPreferences> {
  const setting = await storage.getAppSetting(userNotificationPrefsKey(userId));
  if (!setting?.value) return DEFAULT_USER_NOTIFICATION_PREFS;
  try {
    const parsed = JSON.parse(setting.value) as Partial<UserNotificationPreferences>;
    return {
      tradeStatus: parsed.tradeStatus ?? DEFAULT_USER_NOTIFICATION_PREFS.tradeStatus,
      marginCalls: parsed.marginCalls ?? DEFAULT_USER_NOTIFICATION_PREFS.marginCalls,
      indexUpdates: parsed.indexUpdates ?? DEFAULT_USER_NOTIFICATION_PREFS.indexUpdates,
      system: parsed.system ?? DEFAULT_USER_NOTIFICATION_PREFS.system,
    };
  } catch {
    return DEFAULT_USER_NOTIFICATION_PREFS;
  }
}

async function shouldSendUserEmail(
  userId: string,
  type: keyof UserNotificationPreferences
): Promise<boolean> {
  const prefs = await getUserNotificationPreferences(userId);
  return !!prefs[type];
}

async function sendEmailIfEnabled(
  userId: string | null | undefined,
  preference: keyof UserNotificationPreferences,
  subject: string,
  body: string
) {
  if (!userId) return;
  const enabled = await shouldSendUserEmail(userId, preference);
  if (!enabled) return;
  const user = await findUserById(userId);
  if (!user?.email) return;
  await emailService.sendEmail(user.email, subject, body);
}

async function getIndexUpdateMailingMode(): Promise<IndexUpdateMailingMode> {
  const setting = await storage.getAppSetting(INDEX_UPDATE_MAILING_MODE_KEY);
  const value = (setting?.value || "").toLowerCase();
  if (value === "auto") return "auto";
  return "manual";
}

function indexUpdateThrottleKey(userId: string, country: string, commodity: string) {
  return `index_update_last_sent:${userId}:${country.toUpperCase()}:${commodity.toLowerCase()}`;
}

async function canSendIndexUpdateEmail(
  userId: string,
  country: string,
  commodity: string
): Promise<boolean> {
  const key = indexUpdateThrottleKey(userId, country, commodity);
  const last = await storage.getAppSetting(key);
  if (!last?.value) return true;
  const ts = Number(last.value);
  if (!Number.isFinite(ts)) return true;
  const oneDayMs = 24 * 60 * 60 * 1000;
  return Date.now() - ts >= oneDayMs;
}

async function markIndexUpdateEmailSent(userId: string, country: string, commodity: string) {
  const key = indexUpdateThrottleKey(userId, country, commodity);
  await storage.upsertAppSetting(key, String(Date.now()));
}

async function sendIndexUpdateEmails(args: {
  country: string;
  commodity: string;
  basis?: string | null;
  priceUsdPerTon: number;
  source: string;
  trigger: "manual" | "auto";
}) {
  const { country, commodity, basis, priceUsdPerTon, source, trigger } = args;
  try {
    const mailingMode = await getIndexUpdateMailingMode();
    if (mailingMode === "manual" && trigger !== "manual") {
      return;
    }

    const users = await listUsers();
    for (const u of users) {
      const enabled = await shouldSendUserEmail(u.id, "indexUpdates");
      if (!enabled) continue;
      const underThrottle = await canSendIndexUpdateEmail(u.id, country, commodity);
      if (!underThrottle) continue;

      const subject = `Cropto: ${country.toUpperCase()} index update (${commodity})`;
      const body = [
        `A market index update is available.`,
        ``,
        `Country: ${country.toUpperCase()}`,
        `Commodity: ${commodity}`,
        `Basis: ${basis || "n/a"}`,
        `Price: $${priceUsdPerTon.toFixed(2)} / ton`,
        `Source: ${source}`,
      ].join("\n");

      try {
        await emailService.sendEmail(u.email, subject, body);
        await markIndexUpdateEmailSent(u.id, country, commodity);
      } catch (sendErr) {
        console.error(`[IndexUpdate] Failed to send to ${u.email}:`, sendErr);
      }
    }
  } catch (error) {
    console.error("[IndexUpdate] Broadcast failed:", error);
  }
}

async function getIndexWithLatestById(indexId: string) {
  const [index] = await db.select().from(indexes).where(eq(indexes.id, indexId)).limit(1);
  if (!index) return null;
  const [latestPrice] = await db
    .select()
    .from(commodityIndexPrices)
    .where(eq(commodityIndexPrices.indexId, index.id))
    .orderBy(desc(commodityIndexPrices.timestamp))
    .limit(1);
  return { index, latestPrice: latestPrice || null };
}

async function getIndexWithLatestBySlug(slug: string) {
  const [index] = await db.select().from(indexes).where(eq(indexes.slug, slug)).limit(1);
  if (!index) return null;
  const [latestPrice] = await db
    .select()
    .from(commodityIndexPrices)
    .where(eq(commodityIndexPrices.indexId, index.id))
    .orderBy(desc(commodityIndexPrices.timestamp))
    .limit(1);
  return { index, latestPrice: latestPrice || null };
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check must be available even if background jobs (pollers/scrapers) are failing.
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/api/version", (_req, res) => {
    res.json(getRuntimeInfo());
  });
  app.get("/api/healthz", async (_req, res) => {
    let dbConnected = true;
    let migrationsOk = false;
    try {
      await db.execute(sql`select 1 as ok`);
      const tableRows = await db.execute(sql`
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_name in ('market_prices', 'market_price_fetch_log', 'market_price_source_status')
      `);
      const tables = new Set<string>(((tableRows as any)?.rows || []).map((r: any) => String(r.table_name)));
      migrationsOk =
        tables.has("market_prices") &&
        tables.has("market_price_fetch_log") &&
        tables.has("market_price_source_status");
    } catch {
      dbConnected = false;
      migrationsOk = false;
    }
    const runtime = getMarketIngestionRuntimeState();
    const schedulerRunning = Boolean(runtime.schedulerRunning);
    res.json({
      ok: true,
      ...getRuntimeInfo(),
      dbConnected,
      migrationsOk,
      schedulerRunning,
    });
  });

  // Register auth routes
  app.use("/api/auth", authRoutes);
  app.use("/api/wallet", walletRoutes);
  
  // Register onchain routes
  registerOnchainRoutes(app);
  
  // Register spot trading routes
  registerSpotRoutes(app);
  
  // Start transaction poller if blockchain is configured
  if (process.env.POLYGON_AMOY_RPC_URL && process.env.CROPT_CONTRACT_ADDRESS) {
    startTransactionPoller();
    startReconciler();

    // NOTE:
    // Running periodic deadline processing inside the web process can cause
    // platform flapping/restarts under constrained resources.
    // Keep it opt-in for web; default is disabled.
    const runDeadlineInWeb = process.env.RUN_DEADLINE_PROCESSOR_IN_WEB === "true";
    if (runDeadlineInWeb) {
      const DEADLINE_CHECK_INTERVAL = 60000; // 1 minute
      setInterval(async () => {
        try {
          await processDeadlines();
        } catch (error) {
          console.error("[Cron] Error in deadline processing:", error);
        }
      }, DEADLINE_CHECK_INTERVAL);
      console.log(`[Cron] Started deadline processor with ${DEADLINE_CHECK_INTERVAL}ms interval`);
    } else {
      console.log("[Cron] RUN_DEADLINE_PROCESSOR_IN_WEB!=true; skipping deadline processor in web service.");
    }
  }

  // Telegram integration should run in the jobs service by default.
  // Running scrapers/pollers inside the web service increases the risk of flapping.
  const allowTelegramInWeb = process.env.RUN_TELEGRAM_JOBS_IN_WEB === "true";
  if (allowTelegramInWeb) {
    // Bot API (if token available) OR Public scraper (fallback)
    if (process.env.TELEGRAM_BOT_TOKEN) {
      startTelegramPoller();
    } else {
      console.log("[TelegramPoller] TELEGRAM_BOT_TOKEN not configured. Poller disabled.");
      const scraperEnabled = process.env.ENABLE_TELEGRAM_SCRAPER !== "false";
      if (scraperEnabled) {
        console.log("[TelegramScraper] Starting fallback scraper for public channel...");
        // Run scraper in background, handle errors gracefully
        runScraper(false).catch((error) => {
          console.error("[TelegramScraper] Fatal error:", error);
        });
      } else {
        console.log("[TelegramScraper] ENABLE_TELEGRAM_SCRAPER=false, scraper disabled.");
      }
    }
  } else {
    console.log("[TelegramJobs] RUN_TELEGRAM_JOBS_IN_WEB!=true; skipping in web service.");
  }

  // Start IGC poller if enabled (must not block route registration / server listen).
  //
  // IMPORTANT: Playwright-based polling can be heavy and may destabilize the web process
  // on some platforms. Require an explicit opt-in to run pollers inside the web service.
  const allowJobsInWeb = process.env.RUN_INDEX_POLLERS_IN_WEB === "true";
  if (process.env.ENABLE_IGC_POLLING === "true" && allowJobsInWeb) {
    setTimeout(() => {
      import("./jobs/igcPoller")
        .then(({ startPoller }) => startPoller())
        .catch((error) => {
          console.error("[IGC Poller] Failed to load/start poller:", error?.message || error);
        });
    }, 0);
  } else {
    if (process.env.ENABLE_IGC_POLLING !== "true") {
      console.log("[IGC Poller] ENABLE_IGC_POLLING not set to 'true', poller disabled.");
    } else if (!allowJobsInWeb) {
      console.log("[IGC Poller] Poller enabled but RUN_INDEX_POLLERS_IN_WEB!=true; skipping in web service.");
    }
  }

  // Waitlist endpoints (early-access)

  const waitlistSchema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    country: z.string().min(2),
    role: z.enum(["trader", "broker", "farmer", "other"]),
    company: z.string().min(2),
    linkedinUrl: z.string().url().optional().nullable(),
    websiteUrl: z.string().url().optional().nullable(),
    source: z.string().optional(),
  });

  // Create waitlist signup (no authenticateToken; but if req.user exists we associate it)
  app.post("/api/waitlist", async (req: AuthRequest, res) => {
    try {
      const parsed = waitlistSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation error",
          details: fromZodError(parsed.error).message,
        });
      }

      const body = parsed.data;
      const verificationToken = randomUUID();

      await db
        .insert(waitlistSignups)
        .values({
          userId: req.user?.id ?? null,
          name: body.name,
          email: body.email,
          country: body.country,
          role: body.role,
          company: body.company,
          linkedinUrl: body.linkedinUrl ?? null,
          websiteUrl: body.websiteUrl ?? null,
          source: body.source || "hero",
          verificationToken,
          verifiedAt: null,
        })
        .returning();

      const baseUrl = process.env.APP_BASE_URL || "http://localhost:5173";
      const verifyLink = `${baseUrl}/waitlist/verify?token=${verificationToken}`;

      try {
        await emailService.sendEmail(
          body.email,
          "Cropto: confirm your waitlist signup",
          `Please confirm your waitlist signup by clicking the link below:\n\n${verifyLink}\n\nIf you did not request this, you can ignore this email.`
        );
      } catch (emailError) {
        console.error("[Waitlist] Failed to send verification email:", emailError);
        // IMPORTANT: do not fail the request if email delivery/logging fails
      }

      return res.status(200).json({
        ok: true,
        message: "Waitlist signup created. Please check your email to confirm.",
      });
    } catch (error: any) {
      console.error("Error creating waitlist signup:", error);
      return res.status(500).json({ error: error.message || "Failed to create waitlist signup" });
    }
  });

  // Verify waitlist signup by token (email confirmation)
  app.get("/api/waitlist/verify", async (req, res) => {
    try {
      const token = typeof req.query.token === "string" ? req.query.token.trim() : "";
      if (!token) {
        return res.status(400).json({ error: "Missing token" });
      }

      const [signup] = await db
        .select()
        .from(waitlistSignups)
        .where(eq(waitlistSignups.verificationToken, token))
        .limit(1);

      if (!signup) {
        return res.status(404).send("Verification link is invalid or has already been used.");
      }

      await db
        .update(waitlistSignups)
        .set({ verifiedAt: new Date(), verificationToken: null })
        .where(eq(waitlistSignups.id, signup.id));

      const baseUrl = process.env.APP_BASE_URL || "http://localhost:5173";
      const backUrl = baseUrl;

      return res.send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Waitlist confirmed</title>
  </head>
  <body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; padding: 32px; line-height: 1.45;">
    <h2>Your email has been confirmed.</h2>
    <p>You are on the Cropto early-access waitlist.</p>
    <p><a href="${backUrl}">Back to app</a></p>
  </body>
</html>`);
    } catch (error) {
      console.error("Error verifying waitlist signup:", error);
      return res.status(500).send("Failed to verify token. Please try again later.");
    }
  });

  // Serve markdown documentation files
  app.get("/api/docs/:filename", async (req, res) => {
    try {
      const { filename } = req.params;
      
      // Validate filename to prevent directory traversal
      if (!filename.match(/^[a-z0-9.-]+\.md$/i)) {
        return res.status(400).json({ error: "Invalid filename" });
      }

      const docsPath = path.resolve(import.meta.dirname, "..", "public", "docs", filename);
      
      // Check if file exists
      if (!fs.existsSync(docsPath)) {
        return res.status(404).json({ error: "File not found" });
      }

      // Read and return file content
      const content = await fs.promises.readFile(docsPath, "utf-8");
      res.set("Content-Type", "text/markdown; charset=utf-8");
      res.send(content);
    } catch (error) {
      console.error("Error serving markdown file:", error);
      res.status(500).json({ error: "Failed to load documentation" });
    }
  });

  // Health updates endpoint for polling
  app.get("/api/health-updates", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const userId = req.user.id;
      const { since } = req.query;
      
      // Capture nextCursor BEFORE queries to prevent lost updates (race condition fix)
      const nextCursor = new Date().toISOString();
      
      // Validate since parameter
      let sinceDate: Date;
      if (!since || typeof since !== 'string') {
        // No since provided - return full sync (last 1 hour)
        sinceDate = new Date(Date.now() - 60 * 60 * 1000);
      } else {
        sinceDate = new Date(since);
        if (isNaN(sinceDate.getTime())) {
          return res.status(400).json({ error: "Invalid since timestamp" });
        }
        
        // Clamp lookback to max 24h
        const maxLookback = new Date(Date.now() - 24 * 60 * 60 * 1000);
        if (sinceDate < maxLookback) {
          sinceDate = maxLookback;
        }
      }

      // Query changed options (USER-SCOPED: only return options where user is participant)
      const changedOptions = await db
        .select({
          id: options.id,
          title: options.title,
          type: options.type,
          strike: options.strike,
          qty: options.qty,
          premium: options.premium,
          status: options.status,
          commodity: options.commodity,
          indexId: options.indexId,
          buyerId: options.buyerId,
          issuerId: options.issuerId,
          counterpartyId: options.counterpartyId,
          expirationDate: options.expirationDate,
          createdAt: options.createdAt,
          lastUpdated: options.lastUpdated,
          collateralAmount: options.collateralAmount,
          payoutAccumulated: options.payoutAccumulated,
        })
        .from(options)
        .where(
          and(
            gt(options.lastUpdated, sinceDate),
            or(
              eq(options.issuerId, userId),
              eq(options.buyerId, userId),
              eq(options.counterpartyId, userId)
            )
          )
        )
        .orderBy(options.lastUpdated)
        .limit(100);

      // Query changed margin calls (USER-SCOPED: only return user's margin calls)
      const changedMarginCalls = await db
        .select({
          id: marginCalls.id,
          optionId: marginCalls.optionId,
          forwardContractId: sql`NULL::varchar`,
          instrumentType: sql`'OPTION'::text`,
          userId: marginCalls.userId,
          amountRequired: marginCalls.amountRequired,
          intrinsicValue: marginCalls.intrinsicValue,
          collateralAmount: marginCalls.collateralAmount,
          reservedCollateral: marginCalls.reservedCollateral,
          status: marginCalls.status,
          deadline: marginCalls.deadline,
          createdAt: marginCalls.createdAt,
          lastUpdated: marginCalls.lastUpdated,
        })
        .from(marginCalls)
        .where(
          and(
            gt(marginCalls.lastUpdated, sinceDate),
            eq(marginCalls.userId, userId)
          )
        )
        .orderBy(marginCalls.lastUpdated)
        .limit(100);

      // Query changed transactions (USER-SCOPED: only return transactions where user is sender or recipient)
      const changedTransactions = await db
        .select()
        .from(transactions)
        .where(
          and(
            gt(transactions.lastUpdated, sinceDate),
            or(
              eq(transactions.fromUserId, userId),
              eq(transactions.toUserId, userId)
            )
          )
        )
        .orderBy(transactions.lastUpdated)
        .limit(100);

      const response: HealthUpdateResponse = {
        lastSync: nextCursor, // Use pre-captured cursor to prevent race condition
        options: changedOptions as any,
        marginCalls: changedMarginCalls as any,
        transactions: changedTransactions as any,
      };

      res.json(response);
    } catch (error: any) {
      console.error("[Health Updates] Error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch health updates" });
    }
  });

  // Risk overview (admin-level)
  app.get("/api/risk/overview", authenticateToken, async (req: AuthRequest, res) => {
    const requestContext = {
      userId: req.user?.id ?? "anonymous",
      role: req.user?.role ?? "unknown",
    };

    if (!req.user) {
      console.warn("[Risk Overview] Unauthorized request", requestContext);
      return res.status(401).json({ error: "Authentication required" });
    }

    try {
      if (!hasBrokerPermissions(req.user?.role)) {
        console.warn("[Risk Overview] Forbidden request", { ...requestContext, status: 403 });
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }

      console.info("[Risk Overview] Access granted", { ...requestContext, status: 200 });
      const now = new Date();
      const activeOptions = await db
        .select({
          id: options.id,
          status: options.status,
          collateralAmount: options.collateralAmount,
        })
        .from(options)
        .where(
          or(
            eq(options.status, "OPEN"),
            eq(options.status, "FILLED"),
            eq(options.status, "MARGIN_CALL")
          )
        );

      const marginCallRows = await db
        .select({
          id: marginCalls.id,
          status: marginCalls.status,
          deadline: marginCalls.deadline,
        })
        .from(marginCalls);
      const openMarginCalls = marginCallRows.filter((mc) => mc.status === "PENDING");
      const overdueMarginCalls = openMarginCalls.filter(
        (mc) => mc.deadline && new Date(mc.deadline) < now
      );

      const totalLockedCollateral = activeOptions.reduce((sum, opt) => {
        const collateral = parseFloat(opt.collateralAmount || "0");
        return sum + (Number.isFinite(collateral) ? collateral : 0);
      }, 0);

      // Calculate forward contracts metrics
      const activeForwardContracts = await db
        .select({
          id: forwardContracts.id,
          contractPrice: forwardContracts.contractPrice,
          qtyTon: forwardContracts.qtyTon,
          settlementDate: forwardContracts.settlementDate,
          initialMargin: forwardContracts.initialMargin,
          status: forwardContracts.status,
        })
        .from(forwardContracts)
        .where(eq(forwardContracts.status, "ACTIVE"));

      let forwardNotional = 0;
      let forwardRequiredMargin = 0;
      let forwardCurrentMargin = 0; // For now, assume current margin equals required

      for (const contract of activeForwardContracts) {
        const contractPrice = parseFloat(contract.contractPrice || "0");
        const qtyTon = parseFloat(contract.qtyTon || "0");
        const settlementDate = contract.settlementDate ? new Date(contract.settlementDate) : undefined;

        // Calculate notional value
        const notional = contractPrice * qtyTon;
        forwardNotional += Number.isFinite(notional) ? notional : 0;

        // Use stored initialMargin if available, otherwise calculate it
        let margin = parseFloat(contract.initialMargin || "0");
        if (!Number.isFinite(margin) || margin <= 0) {
          // Fallback: calculate margin using the same logic as in contract creation
          margin = calculateInitialMargin({
            strike: contractPrice,
            quantityTon: qtyTon,
            settlementDate: settlementDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days fallback
            currentDate: new Date(),
          });
        }

        forwardRequiredMargin += margin;
        forwardCurrentMargin += margin; // For now, current margin equals required
      }

      const response = {
        userRole: req.user?.role,
        metrics: {
          activeOptions: activeOptions.length,
          openMarginCalls: openMarginCalls.length,
          overdueMarginCalls: overdueMarginCalls.length,
          totalLockedCollateral: totalLockedCollateral.toFixed(2),
        },
        forwards: {
          notional: Math.round(forwardNotional * 100) / 100, // Round to 2 decimal places
          requiredMargin: Math.round(forwardRequiredMargin * 100) / 100,
          currentMargin: Math.round(forwardCurrentMargin * 100) / 100,
          positionsCount: activeForwardContracts.length,
        },
      };

      console.info("[Risk Overview] Response", { ...requestContext, status: 200 });
      res.json(response);
    } catch (error: any) {
      console.error("[Risk Overview] Error", { ...requestContext, error: error?.message });
      res.status(500).json({ error: error.message || "Failed to fetch risk overview" });
    }
  });

  // Telegram webhook for posting index prices
  app.post("/api/index", async (req, res) => {
    try {
      // Verify Telegram bot token
      const secretToken = req.headers['x-telegram-bot-api-secret-token'];
      const expectedToken = process.env.TELEGRAM_BOT_SECRET_TOKEN;

      if (!expectedToken) {
        console.warn("[Telegram] TELEGRAM_BOT_SECRET_TOKEN not configured. Webhook disabled.");
        return res.status(503).json({ error: "Telegram webhook not configured" });
      }

      if (secretToken !== expectedToken) {
        console.warn("[Telegram] Invalid secret token received");
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { message } = req.body;
      
      // Validate Telegram update structure
      if (!message || !message.text) {
        return res.status(400).json({ error: "Invalid Telegram update format" });
      }

      // Import parser
      const { parseIndexMessage } = await import("./services/telegramParser.js");
      
      const text = message.text.trim();
      const chatUsername = message.chat?.username ? `@${message.chat.username}` : undefined;
      const messageId = message.message_id?.toString();

      // Check for duplicate message_id to prevent reprocessing
      if (messageId) {
        const { eq } = await import("drizzle-orm");
        const existing = await db
          .select()
          .from(indexPrices)
          .where(eq(indexPrices.messageId, messageId))
          .limit(1);

        if (existing.length > 0) {
          console.log(`[Telegram] Skipping duplicate message_id: ${messageId}`);
          return res.json({ 
            ok: true, 
            message: "Duplicate message, already processed",
            skipped: true
          });
        }
      }

      // Parse the message with intelligent parser
      const parseResult = parseIndexMessage(text);

      if (!parseResult.success) {
        console.log(`[Telegram] Failed to parse: ${parseResult.error}`);
        return res.status(400).json({ 
          error: "Message format not recognized",
          details: parseResult.error 
        });
      }

      const { commodity, price, location, change } = parseResult.data!;

      // Build metadata
      const meta = JSON.stringify({
        location,
        change,
        chatUsername,
      });

      // Store index price
      const [indexPrice] = await db
        .insert(indexPrices)
        .values({
          commodity: commodity.toUpperCase(),
          price: price.toFixed(8),
          date: new Date(),
          source: chatUsername || 'telegram',
          raw: text,
          meta,
          messageId,
        })
        .returning();

      console.log(`[Telegram] Index price received: ${commodity} = ${price} from ${chatUsername || 'telegram'}`);

      res.json({ 
        ok: true, 
        message: `Index price stored: ${commodity} = $${price}`,
        data: indexPrice
      });
    } catch (error: any) {
      console.error("Telegram webhook error:", error);
      res.status(500).json({ error: error.message || "Failed to process index update" });
    }
  });

  // Admin endpoint to manually add/override index prices
  app.post("/api/admin/index", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Access denied. Broker role required." });
      }

      const { commodity, price, date } = req.body;

      if (!commodity || !price) {
        return res.status(400).json({ error: "Commodity and price are required" });
      }

      const priceNum = parseFloat(price);
      if (isNaN(priceNum) || priceNum <= 0) {
        return res.status(400).json({ error: "Invalid price value" });
      }

      const indexDate = date ? new Date(date) : new Date();
      const userName = req.user?.email || 'admin';

      const [indexPrice] = await db
        .insert(indexPrices)
        .values({
          commodity: commodity.toUpperCase(),
          price: priceNum.toFixed(8),
          date: indexDate,
          source: `admin-override:${userName}`,
          raw: `Manual entry by ${userName}`,
        })
        .returning();

      void sendIndexUpdateEmails({
        country: "GLOBAL",
        commodity: commodity.toUpperCase(),
        basis: null,
        priceUsdPerTon: priceNum,
        source: `admin-override:${userName}`,
        trigger: "manual",
      });

      res.json({ 
        success: true, 
        message: `Index price added: ${commodity} = $${priceNum}`,
        data: indexPrice
      });
    } catch (error: any) {
      console.error("Admin index add error:", error);
      res.status(500).json({ error: error.message || "Failed to add index price" });
    }
  });

  // Get all index prices (for admin view)
  app.get("/api/admin/index", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Access denied. Broker role required." });
      }

      const limit = parseInt(req.query.limit as string) || 100;
      const commodity = req.query.commodity as string;

      let query = db
        .select()
        .from(indexPrices)
        .orderBy(desc(indexPrices.date))
        .limit(limit);

      if (commodity) {
        query = query.where(eq(indexPrices.commodity, commodity.toUpperCase())) as any;
      }

      const prices = await query;

      res.json(prices);
    } catch (error: any) {
      console.error("Admin index fetch error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch index prices" });
    }
  });

  // Get latest index price with historical data for sparkline
  app.get("/api/index/latest", async (req, res) => {
    try {
      // Normalize legacy identifiers (e.g. WHEAT) to current canonical commodity name
      const rawCommodity = (req.query.commodity as string | undefined) || WHEAT_115_NAME;
      // For the legacy index_prices table we store a human-readable commodity name.
      // Use normalization primarily for backward compatibility with old clients.
      const commodity = normalizeLegacyCommodity(rawCommodity);
      
      // Get the last 7 prices for sparkline
      const prices = await db
        .select()
        .from(indexPrices)
        .where(eq(indexPrices.commodity, commodity))
        .orderBy(desc(indexPrices.date))
        .limit(7);

      if (prices.length === 0) {
        return res.json({
          commodity,
          price: "0",
          timestamp: new Date().toISOString(),
          change: 0,
          changePct: null,
          history: [],
        });
      }

      // Latest price is the first one (most recent)
      const latest = prices[0];
      const latestValue = parseFloat(latest.price);
      
      // Calculate change percentage (comparing to previous price only)
      let changePct: number | null = null;
      if (prices.length > 1) {
        const previousPrice = prices[1];
        const previousValue = parseFloat(previousPrice.price);
        changePct = previousValue !== 0 
          ? ((latestValue - previousValue) / previousValue) * 100
          : 0;
        changePct = parseFloat(changePct.toFixed(2));
      }

      // Fallback to change vs oldest for backward compatibility with sparkline
      const oldestPrice = prices[prices.length - 1];
      const oldestValue = parseFloat(oldestPrice.price);
      const change = oldestValue !== 0 
        ? ((latestValue - oldestValue) / oldestValue) * 100
        : 0;

      // Reverse to get chronological order for sparkline
      const history = prices.reverse().map(p => ({
        price: parseFloat(p.price),
        timestamp: p.date.toISOString(),
      }));

      res.json({
        commodity: latest.commodity,
        price: latest.price,
        timestamp: latest.date.toISOString(),
        change: parseFloat(change.toFixed(2)),
        changePct,
        source: latest.source,
        history,
      });
    } catch (error) {
      console.error("Error fetching latest index:", error);
      res.status(500).json({ error: "Failed to fetch index data" });
    }
  });

  // Internal endpoint for scraper ingestion
  app.post("/api/index/ingest/scrape", async (req, res) => {
    try {
      const { commodity, price, message_id, raw, date } = req.body;

      if (!commodity || !price || !message_id) {
        return res.status(400).json({ error: "Missing required fields: commodity, price, message_id" });
      }

      // Check for duplicates
      const existing = await db
        .select()
        .from(indexPrices)
        .where(and(
          eq(indexPrices.source, 'telegram/scraper'),
          eq(indexPrices.messageId, message_id)
        ))
        .limit(1);

      if (existing.length > 0) {
        return res.json({ skipped: true, message: "Duplicate message_id" });
      }

      // Insert new record
      const inserted = await db.insert(indexPrices).values({
        commodity: commodity.toUpperCase(),
        price: price.toString(),
        date: date ? new Date(date) : new Date(),
        source: 'telegram/scraper',
        raw: raw || null,
        messageId: message_id,
        meta: JSON.stringify({
          ingested_at: new Date().toISOString()
        }),
        isDemo: 'false'
      }).returning();

      res.json({ success: true, record: inserted[0] });
    } catch (error) {
      console.error("Error ingesting scraped data:", error);
      res.status(500).json({ error: "Failed to ingest data" });
    }
  });

  // Commodity Indexes API - New structured index system
  
  // GET /api/indexes - List all commodity indexes with latest prices
  app.get("/api/indexes", async (req, res) => {
    try {
      // Fetch all indexes
      const allIndexes = await db
        .select()
        .from(indexes)
        .orderBy(indexes.category, indexes.name);

      // For each index, fetch the latest price
      const indexesWithPrices = await Promise.all(
        allIndexes.map(async (index) => {
          const latestPrice = await db
            .select()
            .from(commodityIndexPrices)
            .where(eq(commodityIndexPrices.indexId, index.id))
            .orderBy(desc(commodityIndexPrices.timestamp))
            .limit(1);

          return {
            id: index.id,
            name: index.name,
            slug: index.slug,
            category: index.category,
            hasVat: index.hasVat === 'true',
            latestPrice: latestPrice.length > 0 ? {
              price: parseFloat(latestPrice[0].price),
              delta: latestPrice[0].delta ? parseFloat(latestPrice[0].delta) : null,
              timestamp: latestPrice[0].timestamp,
            } : null,
            ...(() => {
              const { isStale, staleReason } = computeIsStale(latestPrice[0]?.timestamp || null);
              return { isStale, staleReason };
            })(),
            createdAt: index.createdAt,
            updatedAt: index.updatedAt,
          };
        })
      );

      res.json(indexesWithPrices);
    } catch (error) {
      console.error("Error fetching indexes:", error);
      res.status(500).json({ error: "Failed to fetch indexes" });
    }
  });

  // GET /api/indexes/:slug - Get one index by slug with full price history
  app.get("/api/indexes/:slug", async (req, res) => {
    try {
      const { slug } = req.params;

      // Find the index by slug
      const [index] = await db
        .select()
        .from(indexes)
        .where(eq(indexes.slug, slug))
        .limit(1);

      if (!index) {
        return res.status(404).json({ error: "Index not found" });
      }

      // Fetch all price history for this index
      const priceHistory = await db
        .select()
        .from(commodityIndexPrices)
        .where(eq(commodityIndexPrices.indexId, index.id))
        .orderBy(desc(commodityIndexPrices.timestamp));

      // Format response
      const response = {
        id: index.id,
        name: index.name,
        slug: index.slug,
        category: index.category,
        hasVat: index.hasVat === 'true',
        createdAt: index.createdAt,
        updatedAt: index.updatedAt,
        priceHistory: priceHistory.map(p => ({
          id: p.id,
          price: parseFloat(p.price),
          delta: p.delta ? parseFloat(p.delta) : null,
          timestamp: p.timestamp,
        })),
        ...(() => {
          const latestTs = priceHistory[0]?.timestamp || null;
          const { isStale, staleReason } = computeIsStale(latestTs);
          return { isStale, staleReason };
        })(),
      };

      res.json(response);
    } catch (error) {
      console.error("Error fetching index:", error);
      res.status(500).json({ error: "Failed to fetch index" });
    }
  });

  // GET /api/admin/indexes - Get latest index values per (country, commodity, basis)
  app.get("/api/admin/indexes", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Access denied. Broker role required." });
      }

      // Get UA indexes from commodityIndexPrices
      const uaIndexes = await db
        .select()
        .from(indexes)
        .where(sql`${indexes.category} LIKE 'CPT%'`);

      const uaLatest: Array<{
        country: string;
        commodity: string;
        grade: string | null;
        basis: string;
        price: number;
        asOf: string;
        source: string;
      }> = [];

      for (const index of uaIndexes) {
        const [latestPrice] = await db
          .select()
          .from(commodityIndexPrices)
          .where(eq(commodityIndexPrices.indexId, index.id))
          .orderBy(desc(commodityIndexPrices.timestamp))
          .limit(1);

        if (latestPrice) {
          // Extract commodity and grade from index name (simplified)
          const lowerName = index.name.toLowerCase();
          let commodity = "";
          let grade: string | null = null;
          if (lowerName.includes("corn")) commodity = "corn";
          else if (lowerName.includes("wheat")) {
            commodity = "wheat";
            if (index.name.match(/11\.?5/)) grade = "11.5pro";
            if (lowerName.includes("feed")) grade = "feed";
          } else if (lowerName.includes("soy")) {
            commodity = "soybeans";
            if (lowerName.includes("gmo")) grade = "GMO";
          } else if (lowerName.includes("sunflower")) commodity = "sunflower";
          else if (lowerName.includes("rapeseed")) commodity = "rapeseed";

          const basis = index.category === "CPT ODESA" 
            ? "CPT Odesa (export)"
            : index.category === "CPT PARITET ODESA"
            ? "CPT Paritet Odesa (processing)"
            : index.category;

          uaLatest.push({
            country: "UA",
            commodity,
            grade,
            basis,
            price: parseFloat(latestPrice.price),
            asOf: new Date(latestPrice.timestamp).toISOString(),
            source: "spike_telegram",
          });
        }
      }

      // Get BR/AR indexes from indexPrices with meta
      const allIndexPricesRaw = await db
        .select()
        .from(indexPrices)
        .orderBy(desc(indexPrices.date));

      const allIndexPrices = [...allIndexPricesRaw].sort((a, b) => {
        const timeDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (timeDiff !== 0) return timeDiff;
        const aPriority = getSourceDescriptor(String(a.source || "manual")).priority;
        const bPriority = getSourceDescriptor(String(b.source || "manual")).priority;
        return bPriority - aPriority;
      });

      const brArLatest: Array<{
        country: string;
        commodity: string;
        grade: string | null;
        basis: string;
        price: number;
        asOf: string;
        source: string;
      }> = [];

      // Group by (country, commodity, basis) and get latest
      const brArMap = new Map<string, typeof allIndexPrices[0] & { meta: any }>();
      for (const price of allIndexPrices) {
        try {
          const meta = price.meta ? JSON.parse(price.meta) : {};
          if (meta.country && (meta.country === "BR" || meta.country === "AR")) {
            const key = `${meta.country}:${meta.commodity || price.commodity.toLowerCase()}:${meta.basis || ""}`;
            if (!brArMap.has(key)) {
              brArMap.set(key, { ...price, meta });
            }
          }
        } catch {
          // Skip invalid meta
        }
      }

      for (const price of brArMap.values()) {
        const meta = price.meta || {};
        brArLatest.push({
          country: meta.country,
          commodity: meta.commodity || price.commodity.toLowerCase(),
          grade: meta.grade || null,
          basis: meta.basis || "",
          price: parseFloat(price.price),
          asOf: new Date(price.date).toISOString(),
          source: "manual",
        });
      }

      res.json([...uaLatest, ...brArLatest]);
    } catch (error: any) {
      console.error("Error fetching admin indexes:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/admin/indexes - Create/update index value
  app.post("/api/admin/indexes", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Access denied. Broker role required." });
      }

      const schema = z.object({
        country: z.enum(["UA", "BR", "AR", "US"]),
        commodity: z.string().min(1),
        basis: z.string().min(1),
        price: z.coerce.number().positive(),
        currency: z.string().default("USD"),
        asOf: z.string().optional(),
        grade: z.string().nullable().optional(),
      });

      const result = schema.safeParse(req.body);
      if (!result.success) {
        const validationError = fromZodError(result.error);
        return res.status(400).json({
          error: validationError.message,
          details: result.error.issues,
        });
      }

      const { country, commodity, basis, price, currency, asOf, grade } = result.data;
      const date = asOf ? new Date(asOf) : new Date();
      const userName = req.user?.email || "admin";

      if (country === "UA") {
        // For UA, find matching index by commodity/basis and use commodityIndexPrices
        // This is more complex, so for now we'll store it in indexPrices with meta
        // (In a full implementation, we'd match to indexes table)
      }

      // Store in indexPrices with metadata
      const meta = JSON.stringify({
        country,
        commodity: commodity.toLowerCase(),
        basis,
        grade: grade || null,
        currency,
        createdBy: userName,
      });

      const [newPrice] = await db
        .insert(indexPrices)
        .values({
          commodity: commodity.toUpperCase(),
          price: price.toFixed(8),
          date,
          source: `admin:${userName}`,
          raw: `Manual entry: ${country} ${commodity} @ ${basis}`,
          meta,
        })
        .returning();

      void sendIndexUpdateEmails({
        country,
        commodity,
        basis,
        priceUsdPerTon: price,
        source: `admin:${userName}`,
        trigger: "manual",
      });

      res.json({
        success: true,
        message: `Index price added: ${country} ${commodity} @ ${basis} = $${price}`,
        data: newPrice,
      });
    } catch (error: any) {
      console.error("Error creating admin index:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  // GET /api/index/history - Price history for legacy charts OR country/commodity/basis history
  app.get("/api/index/history", async (req, res) => {
    try {
      const toDateKey = (value: unknown): string | null => {
        if (value === null || value === undefined) return null;
        const parsed = new Date(String(value));
        if (Number.isNaN(parsed.getTime())) return null;
        return parsed.toISOString().split("T")[0];
      };

      const { country, commodity, basis, seriesKey } = req.query;
      let countryStr = typeof country === "string" ? country : "";
      let commodityStr = typeof commodity === "string" ? commodity : "";
      let basisStr = typeof basis === "string" ? basis : "";

      if (typeof seriesKey === "string" && seriesKey.trim().length > 0) {
        const [keyCountry, keyCommodity, ...basisParts] = seriesKey.split(":");
        if (keyCountry && keyCommodity && basisParts.length > 0) {
          countryStr = keyCountry;
          commodityStr = keyCommodity;
          basisStr = basisParts.join(":");
        }
      }

      const hasCountryParams = !!(countryStr && commodityStr && basisStr);

      if (hasCountryParams) {
        const history: Array<{ date: string; price: number }> = [];

        if (countryStr === "UA") {
          // Query from commodityIndexPrices via indexes table
          const uaIndexes = await db
            .select()
            .from(indexes)
            .where(sql`${indexes.category} LIKE 'CPT%'`);

          // Find matching index (simplified matching)
          let matchingIndex = null;
          for (const index of uaIndexes) {
            const indexBasis = index.category === "CPT ODESA"
              ? "CPT Odesa (export)"
              : index.category === "CPT PARITET ODESA"
              ? "CPT Paritet Odesa (processing)"
              : index.category;
            if (indexBasis === basisStr && index.name.toLowerCase().includes(commodityStr.toLowerCase())) {
              matchingIndex = index;
              break;
            }
          }

          if (matchingIndex) {
            const prices = await db
              .select()
              .from(commodityIndexPrices)
              .where(eq(commodityIndexPrices.indexId, matchingIndex.id))
              .orderBy(asc(commodityIndexPrices.timestamp));

            for (const price of prices) {
              const dateKey = toDateKey(price.timestamp);
              if (!dateKey) continue;
              const numericPrice = Number.parseFloat(String(price.price));
              if (!Number.isFinite(numericPrice)) continue;
              history.push({
                date: dateKey,
                price: numericPrice,
              });
            }
          }
        } else {
          const canonicalCommodity = normalizeCanonicalCommodity(commodityStr).commodity;
          // Query from indexPrices external rows first (country/commodity/label columns)
          const externalPrices = await db
            .select()
            .from(indexPrices)
            .where(
              and(
                eq(indexPrices.country, countryStr),
                eq(indexPrices.label, basisStr)
              )
            )
            .orderBy(asc(indexPrices.date));

          for (const price of externalPrices) {
            const rowCommodity = normalizeCanonicalCommodity(String(price.commodity || "")).commodity;
            if (rowCommodity !== canonicalCommodity) continue;
            const dateKey = toDateKey(price.asOfDate || price.date);
            if (!dateKey) continue;
            const numericPrice = Number.parseFloat(String(price.price));
            if (!Number.isFinite(numericPrice)) continue;
            history.push({
              date: dateKey,
              price: numericPrice,
            });
          }

          // Backward-compatible fallback for legacy manual records stored only in meta
          if (history.length === 0) {
            const allPrices = await db
              .select()
              .from(indexPrices)
              .orderBy(asc(indexPrices.date));

            for (const price of allPrices) {
              try {
                const meta = price.meta ? JSON.parse(price.meta) : {};
                const metaCommodity = normalizeCanonicalCommodity(String(meta.commodity || price.commodity || "")).commodity;
                const metaBasis = String(meta.basis || meta.label || price.label || "");
                if (
                  meta.country === countryStr &&
                  metaCommodity === canonicalCommodity &&
                  metaBasis === basisStr
                ) {
                  const dateKey = toDateKey(price.asOfDate || price.date);
                  if (!dateKey) continue;
                  const numericPrice = Number.parseFloat(String(price.price));
                  if (!Number.isFinite(numericPrice)) continue;
                  history.push({
                    date: dateKey,
                    price: numericPrice,
                  });
                }
              } catch {
                // Skip invalid meta
              }
            }
          }
        }

        return res.json(history);
      }

      // Legacy chart mode: commodity + period/interval/comparison
      const rawCommodity = (req.query.commodity as string | undefined) || WHEAT_115_NAME;
      const legacyCommodity = normalizeLegacyCommodity(rawCommodity);
      const period = (req.query.period as string) || "30d";
      const interval = (req.query.interval as string) || "day";
      const includeComparison = req.query.comparison === "true";

      let cutoffDate: Date | null = null;
      if (period !== "all") {
        const days = parseInt(period.replace("d", ""));
        if (!isNaN(days)) {
          cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - days);
        }
      }

      const whereConditions = cutoffDate
        ? and(eq(indexPrices.commodity, legacyCommodity), sql`${indexPrices.date} >= ${cutoffDate}`)
        : eq(indexPrices.commodity, legacyCommodity);

      const prices = await db
        .select({
          price: indexPrices.price,
          date: indexPrices.date,
        })
        .from(indexPrices)
        .where(whereConditions)
        .orderBy(indexPrices.date);

      const grouped = new Map<string, number>();
      for (const p of prices) {
        const key = interval === "month"
          ? p.date.toISOString().substring(0, 7)
          : p.date.toISOString().split("T")[0];
        grouped.set(key, parseFloat(p.price));
      }

      const dataPoints = Array.from(grouped.entries())
        .map(([date, price]) => ({ date, price }))
        .sort((a, b) => a.date.localeCompare(b.date));

      let previousYearData: Array<{ date: string; price: number }> = [];
      if (includeComparison && cutoffDate) {
        const prevYearCutoff = new Date(cutoffDate);
        prevYearCutoff.setFullYear(prevYearCutoff.getFullYear() - 1);

        const prevYearEnd = new Date();
        prevYearEnd.setFullYear(prevYearEnd.getFullYear() - 1);

        const prevYearConditions = and(
          eq(indexPrices.commodity, legacyCommodity),
          sql`${indexPrices.date} >= ${prevYearCutoff}`,
          sql`${indexPrices.date} <= ${prevYearEnd}`
        );

        const prevYearPrices = await db
          .select({
            price: indexPrices.price,
            date: indexPrices.date,
          })
          .from(indexPrices)
          .where(prevYearConditions)
          .orderBy(indexPrices.date);

        const prevGrouped = new Map<string, number>();
        for (const p of prevYearPrices) {
          const key = interval === "month"
            ? p.date.toISOString().substring(0, 7)
            : p.date.toISOString().split("T")[0];
          prevGrouped.set(key, parseFloat(p.price));
        }

        previousYearData = Array.from(prevGrouped.entries())
          .map(([date, price]) => ({ date, price }))
          .sort((a, b) => a.date.localeCompare(b.date));
      }

      return res.json({
        current: dataPoints,
        previous: previousYearData,
        hasPreviousYear: previousYearData.length > 0,
      });
    } catch (error: any) {
      console.error("Error fetching index history:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Helper function to get latest index for a country/commodity
  async function getLatestIndexForCountryCommodity(
    country: "UA" | "BR" | "AR" | "US",
    commodity: string
  ): Promise<{ price: number; basis: string; asOf: string } | null> {
    if (country === "UA") {
      // Query UA indexes from commodityIndexPrices via indexes table
      const uaIndexes = await db
        .select()
        .from(indexes)
        .where(sql`${indexes.category} LIKE 'CPT%'`)
        .orderBy(indexes.category, indexes.name);

      // Find matching index by commodity
      const commodityLower = commodity.toLowerCase();
      for (const index of uaIndexes) {
        const indexNameLower = index.name.toLowerCase();
        let matches = false;

        if (commodityLower === "corn" && indexNameLower.includes("corn")) matches = true;
        else if (commodityLower === "wheat" && indexNameLower.includes("wheat")) matches = true;
        else if (commodityLower === "soybeans" && indexNameLower.includes("soy")) matches = true;
        else if (commodityLower === "sunflower" && indexNameLower.includes("sunflower")) matches = true;
        else if (commodityLower === "rapeseed" && indexNameLower.includes("rapeseed")) matches = true;

        if (matches) {
          const [latestPrice] = await db
            .select()
            .from(commodityIndexPrices)
            .where(eq(commodityIndexPrices.indexId, index.id))
            .orderBy(desc(commodityIndexPrices.timestamp))
            .limit(1);

          if (latestPrice && parseFloat(latestPrice.price) > 0) {
            const basis =
              index.category === "CPT ODESA"
                ? "CPT Odesa (export)"
                : index.category === "CPT PARITET ODESA"
                ? "CPT Paritet Odesa (processing)"
                : index.category;
            return {
              price: parseFloat(latestPrice.price),
              basis,
              asOf: new Date(latestPrice.timestamp).toISOString(),
            };
          }
        }
      }
    } else {
      // Query BR/AR from indexPrices with meta
      const allIndexPrices = await db
        .select()
        .from(indexPrices)
        .orderBy(desc(indexPrices.date));

      const commodityLower = commodity.toLowerCase();
      for (const price of allIndexPrices) {
        try {
          const meta = price.meta ? JSON.parse(price.meta) : {};
          if (
            meta.country === country &&
            (meta.commodity || price.commodity.toLowerCase()) === commodityLower
          ) {
            const priceValue = parseFloat(price.price);
            if (priceValue > 0) {
              return {
                price: priceValue,
                basis: meta.basis || "",
                asOf: new Date(price.date).toISOString(),
              };
            }
          }
        } catch {
          // Skip invalid meta
        }
      }

      // Fallback to mock data if no DB entry found
      if (country === "BR") {
        const mockData = getMockMarketDataBR();
        const mock = mockData.find((m) => m.commodity === commodityLower);
        if (mock) {
          return {
            price: mock.price,
            basis: mock.basis,
            asOf: mock.asOf,
          };
        }
      } else if (country === "AR") {
        const mockData = getMockMarketDataAR();
        const mock = mockData.find((m) => m.commodity === commodityLower);
        if (mock) {
          return {
            price: mock.price,
            basis: mock.basis,
            asOf: mock.asOf,
          };
        }
      } else if (country === "US") {
        const mockData = getMockMarketDataUS();
        const mock = mockData.find((m) => m.commodity === commodityLower);
        if (mock) {
          return {
            price: mock.price,
            basis: mock.basis,
            asOf: mock.asOf,
          };
        }
      }
    }

    return null;
  }

  // GET /api/arbitrage/index - Compare indexes between two countries
  app.get("/api/arbitrage/index", async (req, res) => {
    try {
      const { baseCountry, targetCountry, commodity, includeHistory } = req.query;

      if (!baseCountry || !targetCountry || !commodity) {
        return res.status(400).json({
          error: "Missing required parameters: baseCountry, targetCountry, commodity",
        });
      }

      const baseCountryTyped = baseCountry as "UA" | "BR" | "AR" | "US";
      const targetCountryTyped = targetCountry as "UA" | "BR" | "AR" | "US";

      if (!["UA", "BR", "AR", "US"].includes(baseCountryTyped) || !["UA", "BR", "AR", "US"].includes(targetCountryTyped)) {
        return res.status(400).json({
          error: "Invalid country. Must be UA, BR, AR, or US",
        });
      }

      if (baseCountryTyped === targetCountryTyped) {
        return res.status(400).json({
          error: "Base and target countries must be different",
        });
      }

      // Fetch latest indexes for both countries
      const baseIndex = await getLatestIndexForCountryCommodity(baseCountryTyped, commodity as string);
      const targetIndex = await getLatestIndexForCountryCommodity(targetCountryTyped, commodity as string);

      if (!baseIndex) {
        return res.status(404).json({
          error: `No index data found for ${baseCountryTyped} ${commodity}`,
        });
      }

      if (!targetIndex) {
        return res.status(404).json({
          error: `No index data found for ${targetCountryTyped} ${commodity}`,
        });
      }

      // Calculate spread
      const spreadAbs = targetIndex.price - baseIndex.price;
      const spreadPct = baseIndex.price > 0 ? (spreadAbs / baseIndex.price) * 100 : 0;

      const response: any = {
        commodity: commodity as string,
        base: {
          country: baseCountryTyped,
          price: baseIndex.price,
          basis: baseIndex.basis,
          asOf: baseIndex.asOf,
        },
        target: {
          country: targetCountryTyped,
          price: targetIndex.price,
          basis: targetIndex.basis,
          asOf: targetIndex.asOf,
        },
        spreadAbs: Number(spreadAbs.toFixed(2)),
        spreadPct: Number(spreadPct.toFixed(2)),
      };

      // Optional: include history
      if (includeHistory === "true") {
        try {
          // Get history for both countries
          const baseHistory = await db
            .select()
            .from(indexPrices)
            .orderBy(asc(indexPrices.date));

          const targetHistory = await db
            .select()
            .from(indexPrices)
            .orderBy(asc(indexPrices.date));

          const commodityLower = (typeof commodity === "string" ? commodity : "").toLowerCase();
          const historyMap = new Map<string, { basePrice?: number; targetPrice?: number }>();

          // Collect base history
          if (baseCountryTyped === "UA") {
            // For UA, would need to query commodityIndexPrices - simplified for now
            // Just use latest price for all dates (can be enhanced later)
          } else {
            for (const price of baseHistory) {
              try {
                const meta = price.meta ? JSON.parse(price.meta) : {};
                if (
                  meta.country === baseCountryTyped &&
                  (meta.commodity || price.commodity.toLowerCase()) === commodityLower
                ) {
                  const dateKey = new Date(price.date).toISOString().split("T")[0];
                  if (!historyMap.has(dateKey)) {
                    historyMap.set(dateKey, {});
                  }
                  historyMap.get(dateKey)!.basePrice = parseFloat(price.price);
                }
              } catch {
                // Skip invalid meta
              }
            }
          }

          // Collect target history
          if (targetCountryTyped === "UA") {
            // For UA, simplified
          } else {
            for (const price of targetHistory) {
              try {
                const meta = price.meta ? JSON.parse(price.meta) : {};
                if (
                  meta.country === targetCountryTyped &&
                  (meta.commodity || price.commodity.toLowerCase()) === commodityLower
                ) {
                  const dateKey = new Date(price.date).toISOString().split("T")[0];
                  if (!historyMap.has(dateKey)) {
                    historyMap.set(dateKey, {});
                  }
                  historyMap.get(dateKey)!.targetPrice = parseFloat(price.price);
                }
              } catch {
                // Skip invalid meta
              }
            }
          }

          // Build history array (only dates where both prices exist)
          const history: Array<{
            date: string;
            basePrice: number;
            targetPrice: number;
            spreadAbs: number;
            spreadPct: number;
          }> = [];

          for (const [date, prices] of historyMap.entries()) {
            if (prices.basePrice && prices.targetPrice) {
              const spread = prices.targetPrice - prices.basePrice;
              const spreadPercent = prices.basePrice > 0 ? (spread / prices.basePrice) * 100 : 0;
              history.push({
                date,
                basePrice: prices.basePrice,
                targetPrice: prices.targetPrice,
                spreadAbs: Number(spread.toFixed(2)),
                spreadPct: Number(spreadPercent.toFixed(2)),
              });
            }
          }

          // Sort by date
          history.sort((a, b) => a.date.localeCompare(b.date));
          response.history = history;
        } catch (error) {
          console.error("Error fetching history for arbitrage:", error);
          // Continue without history
        }
      }

      res.json(response);
    } catch (error: any) {
      console.error("Error fetching arbitrage index:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/market-dashboard - Market dashboard view by country (UA, BR, AR, US)
  app.get("/api/market-dashboard", async (req, res) => {
    try {
      const debugSources = req.query.debugSources === "1" || req.query.debugSources === "true";
      const marketIngestionEnabled = process.env.ENABLE_MARKET_INGESTION !== "false";
      const asIsoString = (value: Date | string | null | undefined): string | null => {
        if (!value) return null;
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
      };
      const computePriceStatus = (
        asOf: Date | string | null | undefined
      ): "fresh" | "stale" | "missing" => {
        const days = computeFreshnessDays(asOf);
        if (!Number.isFinite(days)) return "missing";
        if (days <= 1) return "fresh";
        if (days <= STALE_MAX_AGE_DAYS) return "stale";
        return "missing";
      };
      const computeLastFetchStatus = (row?: {
        freshnessStatus: string;
        lastFetchedAt: Date | null;
        lastSuccessAt: Date | null;
        lastError: string | null;
      } | null): "ok" | "failed" | "unknown" => {
        if (!row) return "unknown";
        if (row.freshnessStatus === "failed") return "failed";
        if (!row.lastFetchedAt && !row.lastSuccessAt) return "unknown";
        if (row.lastFetchedAt && row.lastSuccessAt) {
          if (row.lastFetchedAt.getTime() > row.lastSuccessAt.getTime() && row.lastError) {
            return "failed";
          }
          return "ok";
        }
        return row.lastSuccessAt ? "ok" : "failed";
      };
      // Helper function to extract commodity name and grade from index name
      function extractCommodityAndGrade(indexName: string): { commodity: string; grade: string | null } {
        const lower = indexName.toLowerCase();
        let commodity = "";
        let grade: string | null = null;

        if (lower.includes("corn")) {
          commodity = "corn";
        } else if (lower.includes("wheat")) {
          commodity = "wheat";
          // Extract grade like "11.5%" or "11.5pro"
          const gradeMatch = indexName.match(/11\.?5/);
          if (gradeMatch) {
            grade = "11.5pro";
          }
          if (lower.includes("feed")) {
            grade = "feed";
          }
        } else if (lower.includes("soy")) {
          commodity = "soybeans";
          if (lower.includes("gmo")) {
            grade = "GMO";
          }
        } else if (lower.includes("sunflower")) {
          commodity = "sunflower";
        } else if (lower.includes("rapeseed")) {
          commodity = "rapeseed";
        } else {
          // Fallback: use lowercase slug
          commodity = indexName.toLowerCase().replace(/\s+/g, "-");
        }

        return { commodity, grade };
      }

      // Helper function to map category to basis string
      function categoryToBasis(category: string): string {
        if (category === "CPT ODESA") {
          return "CPT Odesa (export)";
        } else if (category === "CPT PARITET ODESA") {
          return "CPT Paritet Odesa (processing)";
        }
        return category;
      }

      // Fetch UA indexes (those with category starting with "CPT")
      const uaIndexes = await db
        .select()
        .from(indexes)
        .where(sql`${indexes.category} LIKE 'CPT%'`)
        .orderBy(indexes.category, indexes.name);

      // For each UA index, get latest price and convert to MarketIndexDto
      const uaData: MarketIndexDto[] = await Promise.all(
        uaIndexes.map(async (index) => {
          const [latestPrice] = await db
            .select()
            .from(commodityIndexPrices)
            .where(eq(commodityIndexPrices.indexId, index.id))
            .orderBy(desc(commodityIndexPrices.timestamp))
            .limit(1);

          const { commodity, grade } = extractCommodityAndGrade(index.name);
          const basis = categoryToBasis(index.category);
          const price = latestPrice ? parseFloat(latestPrice.price) : 0;
          const asOf = latestPrice?.timestamp ? new Date(latestPrice.timestamp).toISOString() : new Date().toISOString();
          const uaPriceStatus = computePriceStatus(asOf);

          // For now, set change values to 0 (we can calculate them later from price history)
          return {
            commodity,
            grade,
            country: "UA" as const,
            basis,
            price,
            currency: "USD" as const,
            change24h: latestPrice?.delta ? parseFloat(latestPrice.delta) : 0,
            change7d: 0,
            change30d: 0,
            asOf,
            source: "spike_telegram" as const,
            provider: "spike_telegram",
            channel: "HTML_PAGE",
            fetchedAt: asIsoString(latestPrice?.timestamp) || asOf,
            dataStatus: uaPriceStatus === "missing" ? "no_recent" : uaPriceStatus,
            priceStatus: uaPriceStatus,
            lastFetchStatus: "unknown" as const,
          };
        })
      );

      // Filter out entries with zero price (no data available)
      const uaDataFiltered = uaData.filter((item) => item.price > 0);

      // Get BR/AR data from database (indexPrices with meta)
      const allIndexPrices = await db
        .select()
        .from(indexPrices)
        .orderBy(desc(indexPrices.date));
      const ingestionRows = await db
        .select()
        .from(marketPrices)
        .where(inArray(marketPrices.market, ["US", "AR", "BR"]))
        .orderBy(desc(marketPrices.asOf), desc(marketPrices.fetchedAt), desc(marketPrices.updatedAt));
      const sourceStatusRows = await db
        .select()
        .from(marketPriceSourceStatus)
        .where(inArray(marketPriceSourceStatus.market, ["US", "AR", "BR"]))
        .orderBy(desc(marketPriceSourceStatus.updatedAt));
      const sourceStatusByMarketProvider = new Map<
        string,
        {
          freshnessStatus: string;
          lastFetchedAt: Date | null;
          lastSuccessAt: Date | null;
          lastError: string | null;
        }
      >();
      for (const row of sourceStatusRows) {
        const key = `${row.market}:${String(row.provider || "").toUpperCase()}`;
        if (sourceStatusByMarketProvider.has(key)) continue;
        sourceStatusByMarketProvider.set(key, {
          freshnessStatus: row.freshnessStatus,
          lastFetchedAt: row.lastFetchedAt,
          lastSuccessAt: row.lastSuccessAt,
          lastError: row.lastError,
        });
      }

      console.log(`[Market Dashboard] Loaded ${allIndexPrices.length} indexPrices from DB`);
      console.log(`[Market Dashboard] IGC records: ${allIndexPrices.filter(p => p.source === "IGC").length}`);
      console.log(`[Market Dashboard] AR IGC: ${allIndexPrices.filter(p => p.country === "AR" && p.source === "IGC").length}`);
      console.log(`[Market Dashboard] US IGC: ${allIndexPrices.filter(p => p.country === "US" && p.source === "IGC").length}`);
      console.log(`[Market Dashboard] BR IGC: ${allIndexPrices.filter(p => p.country === "BR" && p.source === "IGC").length}`);

      // IGC series mapping is imported at the top - only these series will be shown on Market Dashboard

      const brCandidates = new Map<string, MarketIndexDto[]>();
      const arCandidates = new Map<string, MarketIndexDto[]>();
      const usCandidates = new Map<string, MarketIndexDto[]>();

      const pushCandidate = (
        country: "BR" | "AR" | "US",
        key: string,
        value: MarketIndexDto
      ) => {
        const targetMap = country === "BR" ? brCandidates : country === "AR" ? arCandidates : usCandidates;
        if (!targetMap.has(key)) targetMap.set(key, []);
        targetMap.get(key)!.push(value);
      };

      const seenIngestionSeries = new Set<string>();
      for (const row of ingestionRows) {
        try {
          const market = row.market as "BR" | "AR" | "US";
          if (market !== "BR" && market !== "AR" && market !== "US") continue;
          const rawMeta = (() => {
            try {
              return row.rawMeta ? JSON.parse(row.rawMeta) : {};
            } catch {
              return {};
            }
          })();
          const invalidReason = typeof rawMeta.invalidReason === "string" ? rawMeta.invalidReason : null;
          const rowNeedsReview = row.needsReview === "true" || Boolean(invalidReason);
          if (rowNeedsReview) continue;
          const key = `${market}:${row.commodity}:${row.basis || ""}`;
          if (seenIngestionSeries.has(key)) continue;
          seenIngestionSeries.add(key);
          const asOf = asIsoString(row.asOf);
          if (!asOf) continue;
          const fetchedAt = asIsoString(row.fetchedAt) || asOf;
          const price = Number.parseFloat(String(row.priceUsdPerTon || row.price));
          if (!Number.isFinite(price) || price <= 0) continue;
          const provider = String(row.provider || "").toUpperCase() || "manual";
          const providerStatus = sourceStatusByMarketProvider.get(`${market}:${provider}`);
          const priceStatus = computePriceStatus(asOf);
          pushCandidate(market, `${row.commodity}:${row.basis || ""}`, {
            commodity: row.commodity,
            grade: row.variant || null,
            country: market,
            basis: row.basis || "",
            price,
            currency: "USD",
            change24h: 0,
            change7d: 0,
            change30d: 0,
            asOf,
            source: provider as any,
            confidence: row.confidence ? "high" : "medium",
            freshnessDays: computeFreshnessDays(asOf),
            isStale: priceStatus === "stale",
            dataStatus: priceStatus === "missing" ? "no_recent" : priceStatus,
            priceStatus,
            sourceType: "public_html",
            usagePolicy: "open",
            visibility: "public",
            fetchedAt,
            provider: provider,
            channel: row.channel || "HTML_PAGE",
            rawCommodity: row.rawCommodity || row.commodity,
            category: (row.category as "grain" | "oilseed" | "other") || "other",
            rawPrice: row.priceRaw ? Number.parseFloat(String(row.priceRaw)) : undefined,
            rawUnit: row.rawUnit || undefined,
            rawCurrency: row.rawCurrency || undefined,
            rawToUsdFxRate: row.rawToUsdFxRate ? Number.parseFloat(String(row.rawToUsdFxRate)) : undefined,
            conversionNotes: row.conversionNotes || undefined,
            invalidReason,
            needsReview: row.needsReview === "true",
            sourceTier: row.sourceLayer === "primary" ? "primary" : "secondary",
            lastFetchStatus: computeLastFetchStatus(providerStatus),
            lastFetchError: providerStatus?.lastError || null,
            alternatives: debugSources
              ? [
                  {
                    provider: provider,
                    source: provider,
                    channel: row.channel || "HTML_PAGE",
                    asOf,
                    fetchedAt,
                    priceStatus,
                    lastFetchStatus: computeLastFetchStatus(providerStatus),
                    sourceTier: row.sourceLayer || undefined,
                  },
                ]
              : undefined,
          });
        } catch {
          // ignore malformed ingestion rows
        }
      }

      for (const price of allIndexPrices) {
        try {
          // Check if this is external data (country-tagged source from IGC or USDA AMS).
          const hasCountry = !!price.country;
          const countryMatches = price.country === "BR" || price.country === "AR" || price.country === "US";
          const sourceMatches =
            price.source === "IGC" ||
            price.source === "USDA_AMS" ||
            price.source === "BARCHART_USDA" ||
            price.source === "FUTURES_PROXY" ||
            price.source === "CLAL" ||
            price.source === "CLAL" ||
            price.source === "GRAINSPRICES" ||
            price.source === "FSGRAIN" ||
            price.source === "BCR" ||
            price.source === "COMMODITY3";
          const isExternalRecord = hasCountry && countryMatches && sourceMatches;
          
          // Debug log for IGC records
          if (hasCountry && countryMatches && price.source) {
            console.log(`[Market Dashboard DEBUG] Record: country=${price.country}, source="${price.source}", sourceMatches=${sourceMatches}, isExternalRecord=${isExternalRecord}, commodity=${price.commodity}`);
          }
          
          if (isExternalRecord) {
            try {
              const commodity = price.commodity.toLowerCase();
              const country = price.country as "BR" | "AR" | "US"; // Already validated by isIgcRecord check
              const label = price.label || "";

              // IGC mapping stays strict for known commodity mappings.
              // New commodities (not mapped yet) are allowed through to expand catalog coverage.
              if (price.source === "IGC") {
                const byCountry = IGC_SERIES_MAPPING[country] as Record<string, string> | undefined;
                const preferredLabel = byCountry?.[commodity];
                if (preferredLabel && !sourceLabelMatches(preferredLabel, label)) {
                  continue;
                }
              }
              
              // For IGC data, use label as basis identifier
              const basis = label;
              const key = `${commodity}:${basis}`;

              const priceValue = parseFloat(price.price);
              const change24h = price.dailyChangePct ? parseFloat(price.dailyChangePct.toString()) : 0;

              let asOfDate: Date;
              if (price.asOfDate) {
                const dateObj = typeof price.asOfDate === 'string' ? new Date(price.asOfDate) : price.asOfDate;
                if (!isNaN(dateObj.getTime())) {
                  asOfDate = dateObj;
                } else {
                  asOfDate = new Date(price.date);
                }
              } else {
                asOfDate = new Date(price.date);
              }
              if (isNaN(asOfDate.getTime())) {
                asOfDate = new Date();
              }

              const asOfDateRaw = price.asOfDate || price.date;
              const freshnessDays = computeFreshnessDays(asOfDateRaw);
              const sourceDescriptor = getSourceDescriptor(String(price.source || "manual"));
              const metaObj = price.meta ? JSON.parse(price.meta) : {};
              const provider = (typeof metaObj.provider === "string" ? metaObj.provider : String(price.source || "manual")).toUpperCase();
              const providerStatus = sourceStatusByMarketProvider.get(`${country}:${provider}`);
              const priceStatus = computePriceStatus(asOfDateRaw);
              const result: MarketIndexDto = {
                commodity,
                grade: null,
                country: country as "BR" | "AR" | "US",
                basis: price.label || basis,
                price: priceValue,
                currency: "USD" as const,
                change24h,
                change7d: 0,
                change30d: 0,
                asOf: asOfDate.toISOString(),
                source: String(price.source || "manual") as any,
                confidence: (metaObj.confidence || "high") as "high" | "medium" | "low",
                freshnessDays,
                isStale: freshnessDays > STALE_MAX_AGE_DAYS,
                sourceType: sourceDescriptor.sourceType,
                usagePolicy: sourceDescriptor.usagePolicy,
                visibility: sourceDescriptor.visibility,
                fetchedAt: typeof metaObj.fetchedAt === "string" ? metaObj.fetchedAt : new Date(price.date).toISOString(),
                provider: provider,
                channel: typeof metaObj.channel === "string" ? metaObj.channel : "HTML_PAGE",
                rawCommodity: typeof metaObj.rawCommodity === "string" ? metaObj.rawCommodity : commodity,
                category: (metaObj.category || "other") as "grain" | "oilseed" | "other",
                rawPrice: typeof metaObj.priceRaw === "number" ? metaObj.priceRaw : undefined,
                rawUnit: typeof metaObj.rawUnit === "string" ? metaObj.rawUnit : undefined,
                rawCurrency: typeof metaObj.rawCurrency === "string" ? metaObj.rawCurrency : undefined,
                rawToUsdFxRate:
                  typeof metaObj.rawToUsdFxRate === "number" ? metaObj.rawToUsdFxRate : undefined,
                conversionNotes: typeof metaObj.conversionNotes === "string" ? metaObj.conversionNotes : undefined,
                priceStatus,
                lastFetchStatus: computeLastFetchStatus(providerStatus),
                lastFetchError: providerStatus?.lastError || null,
              };
              if (price.annualChangePct !== null && price.annualChangePct !== undefined) {
                result.annualChange = parseFloat(price.annualChangePct.toString());
              }
              if (price.low52w !== null && price.low52w !== undefined) {
                result.low52w = parseFloat(price.low52w.toString());
              }
              if (price.high52w !== null && price.high52w !== undefined) {
                result.high52w = parseFloat(price.high52w.toString());
              }

              pushCandidate(country, key, result);
              console.log(`[Market Dashboard] Added external candidate: source=${price.source}, country=${country}, key=${key}, commodity=${commodity}, price=${priceValue}`);
            } catch (error) {
              console.error(`[Market Dashboard] Error processing external record:`, error);
            }
          } else {
            // Legacy meta-based data (for backward compatibility)
            const meta = price.meta ? JSON.parse(price.meta) : {};
            if (meta.country && (meta.country === "BR" || meta.country === "AR" || meta.country === "US")) {
              const commodity = meta.commodity || price.commodity.toLowerCase();
              const basis = meta.basis || "";
              const key = `${commodity}:${basis}`;

              const country = meta.country;
              const priceValue = parseFloat(price.price);
              let change24h = 0;
              for (const prevPrice of allIndexPrices) {
                if (prevPrice.id === price.id) continue;
                try {
                  const prevMeta = prevPrice.meta ? JSON.parse(prevPrice.meta) : {};
                  if (
                    prevMeta.country === country &&
                    (prevMeta.commodity || prevPrice.commodity.toLowerCase()) === commodity &&
                    prevMeta.basis === basis
                  ) {
                    const prevPriceValue = parseFloat(prevPrice.price);
                    const prevDate = new Date(prevPrice.date);
                    const currentDate = new Date(price.date);
                    const daysDiff = (currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
                    if (daysDiff <= 1.5 && daysDiff > 0) {
                      change24h = ((priceValue - prevPriceValue) / prevPriceValue) * 100;
                    }
                    break;
                  }
                } catch {
                  // Skip invalid meta
                }
              }

              const detectedSource = (meta.source || price.source || "manual") as string;
              const descriptor = getSourceDescriptor(detectedSource);
              const freshnessDays = computeFreshnessDays(price.asOfDate || price.date);
              const priceStatus = computePriceStatus(price.asOfDate || price.date);
              const provider = (typeof meta.provider === "string" ? meta.provider : detectedSource).toUpperCase();
              const providerStatus = sourceStatusByMarketProvider.get(`${country}:${provider}`);

              pushCandidate(country, key, {
                commodity,
                grade: meta.grade || null,
                country: country as "BR" | "AR" | "US",
                basis,
                price: priceValue,
                currency: "USD" as const,
                change24h,
                change7d: 0,
                change30d: 0,
                asOf: new Date(price.date).toISOString(),
                source: detectedSource as any,
                confidence: (meta.confidence || "medium") as "high" | "medium" | "low",
                freshnessDays,
                isStale: freshnessDays > STALE_MAX_AGE_DAYS,
                sourceType: descriptor.sourceType,
                usagePolicy: descriptor.usagePolicy,
                visibility: descriptor.visibility,
                fetchedAt: typeof meta.fetchedAt === "string" ? meta.fetchedAt : new Date(price.date).toISOString(),
                provider,
                channel: typeof meta.channel === "string" ? meta.channel : "HTML_PAGE",
                rawCommodity: typeof meta.rawCommodity === "string" ? meta.rawCommodity : commodity,
                category: (meta.category || "other") as "grain" | "oilseed" | "other",
                rawPrice: typeof meta.priceRaw === "number" ? meta.priceRaw : undefined,
                rawUnit: typeof meta.rawUnit === "string" ? meta.rawUnit : undefined,
                rawCurrency: typeof meta.rawCurrency === "string" ? meta.rawCurrency : undefined,
                rawToUsdFxRate: typeof meta.rawToUsdFxRate === "number" ? meta.rawToUsdFxRate : undefined,
                conversionNotes: typeof meta.conversionNotes === "string" ? meta.conversionNotes : undefined,
                priceStatus,
                lastFetchStatus: computeLastFetchStatus(providerStatus),
                lastFetchError: providerStatus?.lastError || null,
              });
            }
          }
        } catch {
          // Skip invalid data
        }
      }

      const resolveCandidates = (
        country: "BR" | "AR" | "US",
        candidatesMap: Map<string, MarketIndexDto[]>,
        usSelectedByCommodity: Map<string, MarketIndexDto>
      ): { selected: MarketIndexDto[]; failoverEvents: Array<Record<string, unknown>> } => {
        const selected: MarketIndexDto[] = [];
        const failoverEvents: Array<Record<string, unknown>> = [];

        const sourceOrderByCountry: Record<"BR" | "AR" | "US", string[]> = {
          BR: ["CLAL", "COMMODITY3", "FUTURES_PROXY", "GRAINSPRICES", "manual", "spike_telegram", "mock"],
          AR: ["CLAL", "BCR", "FUTURES_PROXY", "GRAINSPRICES", "manual", "spike_telegram", "mock"],
          US: ["CLAL", "USDA_AMS", "FSGRAIN", "BARCHART_USDA", "GRAINSPRICES", "IGC", "manual", "spike_telegram", "mock"],
        };
        const maxAgeDaysBySource: Record<string, number> = {
          CLAL: 2,
          GRAINSPRICES: 2,
          FSGRAIN: 2,
          BCR: 2,
          COMMODITY3: 2,
          USDA_AMS: 2,
          BARCHART_USDA: 2,
          IGC: 2,
          FUTURES_PROXY: 2,
          manual: 7,
          spike_telegram: 3,
          mock: 1,
          synthetic_model: 1,
        };

        for (const [key, candidates] of candidatesMap.entries()) {
          const first = candidates[0];
          const spreadSpec =
            country === "US" || !first ? null : findSpreadSpec(country, first.commodity, first.basis);
          const order = spreadSpec?.fallbackOrder?.length
            ? spreadSpec.fallbackOrder
            : sourceOrderByCountry[country];
          const failoverOrder = spreadSpec?.failoverOrder?.length
            ? spreadSpec.failoverOrder
            : ["primary", "secondary", "last_known", "synthetic"];
          const primaryMaxAge = spreadSpec?.maxAgeDays ?? (maxAgeDaysBySource[order[0]] ?? 2);
          const secondaryMaxAge = spreadSpec?.secondaryMaxAgeDays ?? 3;
          const graceDays = spreadSpec?.graceDays ?? 1;

          const candidatesWithoutMock = candidates.some((c) => c.source !== "mock")
            ? candidates.filter((c) => c.source !== "mock")
            : candidates;
          const sorted = [...candidatesWithoutMock].sort((a, b) => {
            const aIdx = Math.max(0, order.indexOf(a.source));
            const bIdx = Math.max(0, order.indexOf(b.source));
            if (aIdx !== bIdx) return aIdx - bIdx;
            return new Date(b.asOf).getTime() - new Date(a.asOf).getTime();
          });

          const freshCandidates = sorted
            .filter((c) => (c.freshnessDays ?? 999) <= Math.max(primaryMaxAge, secondaryMaxAge))
            .sort((a, b) => {
              const aDays = a.freshnessDays ?? 999;
              const bDays = b.freshnessDays ?? 999;
              if (aDays !== bDays) return aDays - bDays;
              const aIdx = Math.max(0, order.indexOf(a.source));
              const bIdx = Math.max(0, order.indexOf(b.source));
              return aIdx - bIdx;
            });

          const bestFresh = freshCandidates[0];
          if (bestFresh) {
            const isPrimary = bestFresh.source === order[0];
            selected.push({
              ...bestFresh,
              sourceTier: isPrimary ? "primary" : "secondary",
              isStale: false,
              dataStatus: "fresh",
              priceStatus: "fresh",
            });
            if (!isPrimary) {
              failoverEvents.push({
                event: "source_failover_primary_to_secondary",
                country,
                key,
                from: order[0],
                to: bestFresh.source,
              });
            }
            continue;
          }

          const lastKnown = sorted[0];
          const lastKnownFreshness = lastKnown?.freshnessDays ?? 999;

          if (lastKnown && failoverOrder.includes("last_known") && lastKnownFreshness <= primaryMaxAge + graceDays) {
            selected.push({
              ...lastKnown,
              sourceTier: "last_known",
              isStale: true,
              dataStatus: "stale",
              priceStatus: "stale",
              confidence: lastKnown.confidence === "high" ? "medium" : (lastKnown.confidence || "medium"),
            });
            failoverEvents.push({
              event: "source_failover_to_last_known",
              country,
              key,
              from: order[0],
              lastKnownSource: lastKnown.source,
              freshnessDays: lastKnownFreshness,
              graceDays,
            });
            continue;
          }

          if (lastKnown && failoverOrder.includes("last_known")) {
            // Keep the latest real row visible even when very stale.
            // This prevents silent fallback to mock data and surfaces true provider lineage.
            selected.push({
              ...lastKnown,
              sourceTier: "last_known",
              isStale: true,
              dataStatus: "stale",
              priceStatus: "stale",
              confidence: "low",
            });
            failoverEvents.push({
              event: "source_using_very_stale_last_known",
              country,
              key,
              from: order[0],
              lastKnownSource: lastKnown.source,
              freshnessDays: lastKnownFreshness,
              graceDays,
            });
            continue;
          }

          if (
            lastKnown &&
            failoverOrder.includes("synthetic") &&
            spreadSpec?.syntheticAllowed &&
            (spreadSpec.syntheticMaxAgeDays ?? 0) > 0 &&
            lastKnownFreshness <= spreadSpec.syntheticMaxAgeDays
          ) {
            const anchor = usSelectedByCommodity.get(spreadSpec.anchorCommodity);
            let syntheticPrice = lastKnown.price;
            if (anchor) {
              if (spreadSpec.modelType === "additive") {
                const spread = spreadSpec.spreadUsdPerTon || 0;
                syntheticPrice = Number((anchor.price + spread).toFixed(2));
              } else {
                const alpha = spreadSpec.alpha ?? 0;
                const beta = spreadSpec.beta ?? 1;
                syntheticPrice = Number((beta * anchor.price + alpha).toFixed(2));
              }
            }
            selected.push({
              ...lastKnown,
              source: "synthetic_model",
              sourceTier: "synthetic",
              confidence: "low",
              isStale: false,
              dataStatus: "fresh",
              priceStatus: "fresh",
              sourceType: "internal",
              usagePolicy: "open",
              visibility: "public",
              price: syntheticPrice,
              change24h: anchor?.change24h ?? 0,
              freshnessDays: 0,
            });
            failoverEvents.push({
              event: "source_failover_to_synthetic",
              country,
              key,
              spreadSpecId: spreadSpec.spreadSpecId,
              modelType: spreadSpec.modelType,
              anchorCommodity: spreadSpec.anchorCommodity,
              anchorSource: anchor?.source || null,
            });
          } else {
            failoverEvents.push({
              event: "source_no_recent_price",
              country,
              key,
              from: order[0],
              maxAgeDays: primaryMaxAge,
              graceDays,
              freshnessDays: lastKnownFreshness,
            });
            continue;
          }
        }

        return { selected, failoverEvents };
      };

      const usResolved = resolveCandidates("US", usCandidates, new Map());
      const usSelectedByCommodity = new Map<string, MarketIndexDto>();
      for (const row of usResolved.selected) {
        if (!usSelectedByCommodity.has(row.commodity)) {
          usSelectedByCommodity.set(row.commodity, row);
        }
      }
      const brResolved = resolveCandidates("BR", brCandidates, usSelectedByCommodity);
      const arResolved = resolveCandidates("AR", arCandidates, usSelectedByCommodity);

      const brData = brResolved.selected;
      const arData = arResolved.selected;
      const usData = usResolved.selected;
      const brDataNoMock = selectCountryRows(brData, false).selected;
      const arDataNoMock = selectCountryRows(arData, false).selected;
      const usDataNoMock = selectCountryRows(usData, false).selected;

      const failoverEvents = [...usResolved.failoverEvents, ...brResolved.failoverEvents, ...arResolved.failoverEvents];
      if (failoverEvents.length > 0) {
        try {
          await db.insert(analyticsEvents).values(
            failoverEvents.map((evt) => ({
              eventName: String(evt.event),
              payload: JSON.stringify(evt),
            }))
          );
        } catch (analyticsError: any) {
          // Analytics must never break market dashboard payload.
          const isMissingTable =
            analyticsError?.code === "42P01" ||
            String(analyticsError?.message || "").toLowerCase().includes("analytics_events");
          if (isMissingTable) {
            if (!hasWarnedMissingAnalyticsEventsTable) {
              console.warn(
                "[Market Dashboard] analytics_events table is missing; failover analytics writes are skipped.",
              );
              hasWarnedMissingAnalyticsEventsTable = true;
            }
          } else {
            console.error("[Market Dashboard] Failed to write failover analytics:", analyticsError);
          }
        }
      }

      // Debug logging
      console.log(`[Market Dashboard] Before fallback - BR: ${brData.length}, AR: ${arData.length}, US: ${usData.length} records from DB`);
      console.log(`[Market Dashboard] BR sources:`, brData.map(d => d.source));
      console.log(`[Market Dashboard] AR sources:`, arData.map(d => d.source));
      console.log(`[Market Dashboard] US sources:`, usData.map(d => d.source));

      // Use IGC data from database if available, otherwise fallback to mock data
      // Mock data is only used when NO IGC records exist for a specific country
      // If there are some IGC records (even if fewer than expected), we use them without mock fallback
      const withSeriesKey = (rows: MarketIndexDto[]): MarketIndexDto[] =>
        rows.map((row) => ({
          ...row,
          seriesKey: `${row.country}:${String(row.commodity || "").toLowerCase()}:${row.basis}`,
        }));

      const allowDemoData = process.env.ALLOW_DEMO_DATA === "1";
      const isProdEnv = (process.env.NODE_ENV || "development") === "production";
      const allowMockFallback = !isProdEnv || allowDemoData || !marketIngestionEnabled;
      const finalBrData = withSeriesKey(
        brDataNoMock.length > 0
          ? brDataNoMock
          : allowMockFallback
            ? getMockMarketDataBR().map((m) => ({ ...m, sourceTier: "secondary" as const }))
            : []
      );
      const finalArData = withSeriesKey(
        arDataNoMock.length > 0
          ? arDataNoMock
          : allowMockFallback
            ? getMockMarketDataAR().map((m) => ({ ...m, sourceTier: "secondary" as const }))
            : []
      );
      const finalUsData = withSeriesKey(
        usDataNoMock.length > 0
          ? usDataNoMock
          : allowMockFallback
            ? getMockMarketDataUS().map((m) => ({ ...m, sourceTier: "secondary" as const }))
            : []
      );
      const uaDataWithSeriesKey = withSeriesKey(uaDataFiltered);
      const truthUaData = selectTruthSeriesPerCommodity(uaDataWithSeriesKey, {
        providerPriority: ["SPIKE_TELEGRAM", "MANUAL", "MOCK"],
        debug: debugSources,
      });
      const truthBrData = selectTruthSeriesPerCommodity(finalBrData, {
        providerPriority: ["CLAL", "COMMODITY3", "BCR", "FSGRAIN", "GRAINSPRICES", "IGC", "USDA_AMS", "BARCHART_USDA", "FUTURES_PROXY", "MANUAL", "MOCK"],
        debug: debugSources,
      });
      const truthArData = selectTruthSeriesPerCommodity(finalArData, {
        providerPriority: ["CLAL", "BCR", "COMMODITY3", "FSGRAIN", "GRAINSPRICES", "IGC", "USDA_AMS", "BARCHART_USDA", "FUTURES_PROXY", "MANUAL", "MOCK"],
        debug: debugSources,
      });
      const truthUsData = selectTruthSeriesPerCommodity(finalUsData, {
        providerPriority: ["CLAL", "USDA_AMS", "FSGRAIN", "BARCHART_USDA", "GRAINSPRICES", "IGC", "FUTURES_PROXY", "MANUAL", "MOCK"],
        debug: debugSources,
      });

      const buildSeriesStatus = (
        country: "UA" | "BR" | "AR" | "US",
        rows: MarketIndexDto[],
        events: Array<Record<string, unknown>>
      ) => {
        const MAX_AGE_DAYS = 3;
        const GRACE_DAYS = 4;
        const maxStaleDays = MAX_AGE_DAYS + GRACE_DAYS;

        const statuses: Array<{
          country: "UA" | "BR" | "AR" | "US";
          key: string;
          commodity: string;
          grade?: string | null;
          basis: string;
          status: "fresh" | "stale" | "no_recent";
          sourceTier?: "primary" | "secondary" | "synthetic" | "last_known";
          source?: string;
          asOf?: string;
          freshnessDays?: number;
        }> = [];

        const pushUnique = (item: (typeof statuses)[number]) => {
          // Keep the first occurrence; callers should pass rows in priority order.
          if (!seen.has(item.key)) {
            seen.add(item.key);
            statuses.push(item);
          }
        };

        const seen = new Set<string>();

        for (const row of rows) {
          const asOfCandidate = row.asOf ? new Date(row.asOf) : null;
          const computedFreshnessDays =
            typeof row.freshnessDays === "number"
              ? row.freshnessDays
              : asOfCandidate && !Number.isNaN(asOfCandidate.getTime())
                ? Math.floor((Date.now() - asOfCandidate.getTime()) / (1000 * 60 * 60 * 24))
                : undefined;
          const computedStatus: "fresh" | "stale" | "no_recent" = (() => {
            if (row.dataStatus === "fresh" || row.dataStatus === "stale" || row.dataStatus === "no_recent") {
              return row.dataStatus;
            }
            if (typeof computedFreshnessDays !== "number") return "no_recent";
            if (computedFreshnessDays <= MAX_AGE_DAYS) return "fresh";
            if (computedFreshnessDays <= maxStaleDays) return "stale";
            return "no_recent";
          })();

          const key = `${row.commodity}${row.grade ? `(${row.grade})` : ""}:${row.basis}`;
          pushUnique({
            country,
            key,
            commodity: row.commodity,
            grade: row.grade ?? null,
            basis: row.basis,
            status: row.isStale ? "stale" : computedStatus,
            sourceTier: row.sourceTier,
            source: row.source,
            asOf: row.asOf,
            freshnessDays: computedFreshnessDays,
          });
        }

        for (const evt of events) {
          if (evt.event !== "source_no_recent_price" || evt.country !== country) continue;
          const key = String(evt.key || "");
          const [commodity, ...basisParts] = key.split(":");
          pushUnique({
            country,
            key,
            commodity: commodity || "unknown",
            basis: basisParts.join(":") || "",
            status: "no_recent",
            sourceTier: "last_known",
            freshnessDays: Number(evt.freshnessDays ?? 999),
          });
        }

        return statuses;
      };

      const seriesStatus = {
        ua: buildSeriesStatus("UA", truthUaData, []),
        br: buildSeriesStatus("BR", truthBrData, failoverEvents),
        ar: buildSeriesStatus("AR", truthArData, failoverEvents),
        us: buildSeriesStatus("US", truthUsData, failoverEvents),
      };

      // Persist mock data to index_prices for history charts if no real records exist.
      const mockCooldownMs = 1000 * 60 * 60 * 12;
      const latestByKey = new Map<string, Date>();

      for (const price of allIndexPrices) {
        try {
          const meta = price.meta ? JSON.parse(price.meta) : {};
          const country = price.country || meta.country;
          const commodity = meta.commodity || price.commodity;
          const basis = meta.basis || price.label || "";
          if (!country || !commodity || !basis) continue;
          const key = `${country}:${commodity.toLowerCase()}:${basis}`;
          const dateValue = price.asOfDate ? new Date(price.asOfDate as any) : new Date(price.date);
          if (!latestByKey.has(key) || dateValue > latestByKey.get(key)!) {
            latestByKey.set(key, dateValue);
          }
        } catch {
          // ignore malformed meta
        }
      }

      const persistMockData = async (country: "BR" | "AR" | "US", data: MarketIndexDto[]) => {
        const now = new Date();
        const inserts = [];
        for (const item of data) {
          if (item.source !== "mock") continue;
          const commodity = item.commodity;
          const basis = item.basis || "";
          const key = `${country}:${commodity.toLowerCase()}:${basis}`;
          const lastSeen = latestByKey.get(key);
          if (lastSeen && now.getTime() - lastSeen.getTime() < mockCooldownMs) {
            continue;
          }
          inserts.push({
            commodity: commodity.toUpperCase(),
            price: item.price.toString(),
            date: now,
            source: "mock",
            country,
            label: basis,
            meta: JSON.stringify({
              country,
              commodity,
              basis,
              source: "mock",
            }),
          });
          latestByKey.set(key, now);
        }
        if (inserts.length > 0) {
          await db.insert(indexPrices).values(inserts);
          console.log(`[Market Dashboard] Persisted ${inserts.length} mock records for ${country}`);
        }
      };

      if (allowMockFallback && usDataNoMock.length === 0) await persistMockData("US", truthUsData);
      if (allowMockFallback && brDataNoMock.length === 0) await persistMockData("BR", truthBrData);
      if (allowMockFallback && arDataNoMock.length === 0) await persistMockData("AR", truthArData);

      console.log(`[Market Dashboard] Final - BR: ${truthBrData.length}, AR: ${truthArData.length}, US: ${truthUsData.length} records`);
      console.log(`[Market Dashboard] Final BR sources:`, truthBrData.map(d => d.source));
      console.log(`[Market Dashboard] Final AR sources:`, truthArData.map(d => d.source));
      console.log(`[Market Dashboard] Final US sources:`, truthUsData.map(d => d.source));

      let debugSourceStatus: any[] | undefined = undefined;
      if (debugSources) {
        try {
          debugSourceStatus = await db
            .select()
            .from(marketPriceSourceStatus)
            .where(or(eq(marketPriceSourceStatus.market, "US"), eq(marketPriceSourceStatus.market, "AR"), eq(marketPriceSourceStatus.market, "BR")))
            .orderBy(desc(marketPriceSourceStatus.updatedAt));
        } catch (error: any) {
          debugSourceStatus = [{ error: error?.message || "failed_to_load_debug_source_status" }];
        }
      }

      const marketHealth = {
        ua: deriveMarketHealth(truthUaData),
        br: deriveMarketHealth(truthBrData),
        ar: deriveMarketHealth(truthArData),
        us: deriveMarketHealth(truthUsData),
      };
      const marketStatusRows = new Map<"BR" | "AR" | "US", number>();
      for (const row of sourceStatusRows) {
        const market = row.market as "BR" | "AR" | "US";
        marketStatusRows.set(market, (marketStatusRows.get(market) || 0) + 1);
      }
      const dataAlerts = {
        br:
          truthBrData.length === 0
            ? marketIngestionEnabled
              ? (marketStatusRows.get("BR") || 0) > 0
                ? "No validated quotes yet (waiting for unit/currency parsing)."
                : "Ingestion enabled, but scheduler has not produced BR source status yet."
              : "Market ingestion is disabled."
            : null,
        ar:
          truthArData.length === 0
            ? marketIngestionEnabled
              ? (marketStatusRows.get("AR") || 0) > 0
                ? "No validated quotes yet (waiting for unit/currency parsing)."
                : "Ingestion enabled, but scheduler has not produced AR source status yet."
              : "Market ingestion is disabled."
            : null,
        us:
          truthUsData.length === 0
            ? marketIngestionEnabled
              ? (marketStatusRows.get("US") || 0) > 0
                ? "No validated quotes yet (waiting for unit/currency parsing)."
                : "Ingestion enabled, but scheduler has not produced US source status yet."
              : "Market ingestion is disabled."
            : null,
      };

      res.json({
        ua: truthUaData.length > 0 ? truthUaData : withSeriesKey([
          // Fallback sample data if no real data available
          {
            commodity: "corn",
            grade: null,
            country: "UA" as const,
            basis: "CPT Odesa (export)",
            price: 240.0,
            currency: "USD" as const,
            change24h: 0,
            change7d: 0,
            change30d: 0,
            asOf: new Date().toISOString(),
            source: "manual" as const,
          },
        ]),
        br: truthBrData,
        ar: truthArData,
        us: truthUsData,
        seriesStatus,
        marketHealth,
        dataAlerts,
        ...(debugSources ? { debugSources: debugSourceStatus || [] } : {}),
      });
    } catch (error: any) {
      console.error("Error fetching market dashboard:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/market-ingestion/sources", async (_req, res) => {
    try {
      const activeProviders = new Set(
        MARKET_COMMODITY_CONFIG.flatMap((cfg) => [cfg.primaryProvider, ...cfg.fallbackProviders]),
      );

      const statusRows = await db.select().from(marketPriceSourceStatus);
      const successMap = new Map<string, { provider: string; channel: string; layer: "primary" | "fallback"; successCount: number }>();

      for (const row of statusRows) {
        const provider = row.provider;
        if (!provider || !activeProviders.has(provider)) continue;
        const layer = (row.sourceLayer || "primary") as "primary" | "fallback";
        const key = `${provider}:${row.channel || "HTML_PAGE"}:${layer}`;
        const prev = successMap.get(key);
        const nextCount = (prev?.successCount || 0) + (row.lastSuccessAt ? 1 : 0);
        successMap.set(key, {
          provider,
          channel: row.channel || "HTML_PAGE",
          layer,
          successCount: nextCount,
        });
      }

      const allConfigured = Array.from(activeProviders).map((provider) => {
        const primaryChannel = provider === "CLAL" ? "TESEO" : "HTML_PAGE";
        const hasPrimary = Array.from(successMap.values()).some((v) => v.provider === provider && v.layer === "primary");
        const hasFallback = Array.from(successMap.values()).some((v) => v.provider === provider && v.layer === "fallback");
        return {
          provider,
          channel: primaryChannel,
          enabled: true,
          hasSuccess: hasPrimary || hasFallback,
          hasPrimary,
          hasFallback,
        };
      });

      const primary = allConfigured.filter((s) => s.hasPrimary || s.provider === "CLAL");
      const fallback = allConfigured.filter((s) => s.provider !== "CLAL" && s.enabled);

      res.json({
        primary,
        fallback,
        statement:
          "Prices are refreshed daily. If primary feed is unavailable, the system falls back to secondary sources. All prices are normalized to USD/t.",
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || "failed_to_load_sources" });
    }
  });

  app.get("/api/market-ingestion/public-sample", async (req, res) => {
    try {
      const market = String(req.query.market || "").toUpperCase();
      const commodityRaw = String(req.query.commodity || "").toLowerCase();
      const commodity = normalizeCanonicalCommodity(commodityRaw).commodity;
      const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit || "20"), 10) || 20, 1), 50);
      if (!["BR", "AR", "US", "UA"].includes(market)) {
        return res.status(400).json({ error: "market must be BR/AR/US/UA" });
      }
      if (!commodity || commodity === "unknown") {
        return res.status(400).json({ error: "commodity is required" });
      }

      const rows = await db
        .select()
        .from(marketPrices)
        .where(and(eq(marketPrices.market, market), eq(marketPrices.commodity, commodity)))
        .orderBy(desc(marketPrices.fetchedAt))
        .limit(limit);

      const sample = rows.map((row) => {
        let meta: Record<string, unknown> = {};
        try {
          meta = row.rawMeta ? JSON.parse(row.rawMeta) : {};
        } catch {
          meta = {};
        }
        return {
          asOf: row.asOf ? new Date(row.asOf).toISOString() : null,
          fetchedAt: row.fetchedAt ? new Date(row.fetchedAt).toISOString() : null,
          provider: row.provider,
          channel: row.channel,
          rawPrice: row.priceRaw ? Number.parseFloat(String(row.priceRaw)) : null,
          rawCurrency: row.rawCurrency || null,
          rawUnit: row.rawUnit || null,
          rawTextSnippet: typeof meta.rawTextSnippet === "string" ? String(meta.rawTextSnippet).slice(0, 220) : null,
          priceUsdPerTon: row.priceUsdPerTon ? Number.parseFloat(String(row.priceUsdPerTon)) : null,
          conversionNotes: row.conversionNotes || null,
          needsReview: row.needsReview === "true",
          invalidReason: typeof meta.invalidReason === "string" ? meta.invalidReason : null,
          sourceUrl: row.sourceUrl || null,
        };
      });

      res.json({
        generatedAt: new Date().toISOString(),
        market,
        commodity,
        count: sample.length,
        sample,
      });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch public sample" });
    }
  });

  // GET /debug/index-prices/raw - diagnostic raw rows for ETL verification
  app.get("/debug/index-prices/raw", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Access denied. Broker role required." });
      }

      const includeMeta = req.query.includeMeta === "true";
      const includeRawRow = req.query.includeRawRow === "true";
      const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit || "200"), 10) || 200, 1), 2000);

      const rows = await db
        .select()
        .from(indexPrices)
        .orderBy(desc(indexPrices.date))
        .limit(limit);

      const payload = rows.map((row) => {
        const item: Record<string, unknown> = {
          id: row.id,
          source: row.source,
          commodity: row.commodity,
          country: row.country,
          label: row.label,
          price: row.price,
          asOfDate: row.asOfDate,
          date: row.date,
        };
        if (includeMeta) {
          item.meta = row.meta ? JSON.parse(row.meta) : null;
        }
        if (includeRawRow) {
          item.rawRow = row.rawRow ? JSON.parse(row.rawRow) : null;
        }
        return item;
      });

      res.json({ count: payload.length, items: payload });
    } catch (error: any) {
      console.error("Error fetching debug index prices:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/indexes/:slug/price - Add new price for an index
  app.post("/api/indexes/:slug/price", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Access denied. Broker role required." });
      }

      const { slug } = req.params;

      // Find the index by slug
      const [index] = await db
        .select()
        .from(indexes)
        .where(eq(indexes.slug, slug))
        .limit(1);

      if (!index) {
        return res.status(404).json({ error: "Index not found" });
      }

      // Validate request body
      const priceSchema = z.object({
        price: z.coerce.number().positive("Price must be positive"),
        delta: z.coerce.number().optional().nullable(),
      });

      const result = priceSchema.safeParse(req.body);
      
      if (!result.success) {
        const validationError = fromZodError(result.error);
        return res.status(400).json({ 
          error: validationError.message,
          details: result.error.issues 
        });
      }

      const { price, delta } = result.data;

      // Insert new price record
      const [newPrice] = await db
        .insert(commodityIndexPrices)
        .values({
          indexId: index.id,
          price: price.toString(),
          delta: delta !== null && delta !== undefined ? delta.toString() : null,
        })
        .returning();

      console.log(`[Index] New price added for ${index.name} (${slug}): $${price} by ${req.user?.email}`);

      void sendIndexUpdateEmails({
        country: "UA",
        commodity: index.slug || slug,
        basis: index.category || null,
        priceUsdPerTon: price,
        source: `admin:${req.user?.email || "unknown"}`,
        trigger: "manual",
      });

      res.status(201).json({
        id: newPrice.id,
        indexId: newPrice.indexId,
        price: parseFloat(newPrice.price),
        delta: newPrice.delta ? parseFloat(newPrice.delta) : null,
        timestamp: newPrice.timestamp,
        index: {
          name: index.name,
          slug: index.slug,
          category: index.category,
        },
      });
    } catch (error: any) {
      console.error("Error adding index price:", error);
      res.status(500).json({ error: error.message || "Failed to add index price" });
    }
  });

  app.get("/api/options", async (req, res) => {
    try {
      const optionRows = await storage.listOptions();
      const withCountry = optionRows.map((row: any) => ({
        ...row,
        country: buildOptionCountry(row),
      }));
      res.json(withCountry);
    } catch (error) {
      console.error("Error fetching options:", error);
      res.status(500).json({ error: "Failed to fetch options" });
    }
  });

  app.get("/api/dashboard/metrics", async (_req, res) => {
    try {
      const [allOptions, allForwardContracts, allSpotPositions] = await Promise.all([
        storage.listOptions(),
        db.select().from(forwardContracts),
        db.select().from(spotPositions),
      ]);

      const activeOptionStatuses = new Set(["OPEN", "FILLED", "MARGIN_CALL", "ACTIVE"]);
      const activeForwardStatuses = new Set(["ACTIVE", "OPEN", "FILLED"]);

      const optionsCount = allOptions.length;
      const activeOptions = allOptions.filter((opt: any) => activeOptionStatuses.has(String(opt.status || "").toUpperCase())).length;
      const activeForwards = allForwardContracts.filter((fc: any) =>
        activeForwardStatuses.has(String(fc.status || "").toUpperCase())
      ).length;
      const activeSpotPositions = allSpotPositions.filter((sp: any) => Number(sp.quantityKg || 0) !== 0).length;

      const optionsVolume = allOptions.reduce((sum: number, opt: any) => {
        const premium = Number(opt.premium || 0);
        const qty = Number(opt.qty || 0);
        return sum + (Number.isFinite(premium) && Number.isFinite(qty) ? premium * qty : 0);
      }, 0);

      const forwardsVolume = allForwardContracts.reduce((sum: number, fc: any) => {
        const px = Number(fc.contractPrice || 0);
        const qty = Number(fc.qtyTon || 0);
        return sum + (Number.isFinite(px) && Number.isFinite(qty) ? px * qty : 0);
      }, 0);

      const spotVolume = allSpotPositions.reduce((sum: number, sp: any) => {
        const qtyKg = Number(sp.quantityKg || 0);
        const avgPxPerKg = Number(sp.avgEntryPrice || 0);
        return sum + (Number.isFinite(qtyKg) && Number.isFinite(avgPxPerKg) ? Math.abs(qtyKg) * avgPxPerKg : 0);
      }, 0);

      res.json({
        totalOptionsLike: optionsCount + allForwardContracts.length + allSpotPositions.length,
        openPositions: activeOptions + activeForwards + activeSpotPositions,
        totalVolumeUsd: optionsVolume + forwardsVolume + spotVolume,
      });
    } catch (error) {
      console.error("Error fetching dashboard metrics:", error);
      res.status(500).json({ error: "Failed to fetch dashboard metrics" });
    }
  });

  // Spot orderbook (aggregated)
  app.get("/api/spot/orderbook", authenticateToken, async (req: AuthRequest, res) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { commodity, depth } = req.query as { commodity?: string; depth?: string };
    if (!commodity) {
      return res.status(400).json({ error: "commodity is required" });
    }

    const depthNum = Math.min(Math.max(Number(depth) || 5, 1), 50);

    try {
      const rows = await db
        .select({
          price: sql`COALESCE(${spotPositions.avgEntryPrice}, '0')`,
          qty: spotPositions.quantityKg,
        })
        .from(spotPositions)
        .where(eq(spotPositions.commoditySlug, commodity));

      // Spot storage uses $/kg and kg internally; convert to $/t and tons for API/UI.
      const bidsMap = new Map<string, number>();
      const asksMap = new Map<string, number>();
      for (const row of rows) {
        const pricePerKg = Number(row.price);
        const qtyKg = Number(row.qty);
        if (!Number.isFinite(pricePerKg) || !Number.isFinite(qtyKg) || qtyKg === 0) continue;

        const pricePerTon = pricePerKg * 1000;
        const qtyTon = Math.abs(qtyKg) / 1000;
        const key = pricePerTon.toString();

        if (qtyKg > 0) {
          const current = bidsMap.get(key) || 0;
          bidsMap.set(key, current + qtyTon);
        } else {
          const current = asksMap.get(key) || 0;
          asksMap.set(key, current + qtyTon);
        }
      }

      const bids = Array.from(bidsMap.entries())
        .map(([p, q]) => ({ price: Number(p), quantity: q }))
        .sort((a, b) => b.price - a.price)
        .slice(0, depthNum);

      const asks = Array.from(asksMap.entries())
        .map(([p, q]) => ({ price: Number(p), quantity: q }))
        .sort((a, b) => a.price - b.price)
        .slice(0, depthNum);

      const response = {
        commodity,
        bids,
        asks,
      };

      console.info("[Orderbook Spot]", { commodity, depth: depthNum, bids: response.bids.length, asks: response.asks.length });
      res.json(response);
    } catch (error: any) {
      console.error("[Orderbook Spot] Error", { commodity, error: error?.message });
      res.status(500).json({ error: error?.message || "Failed to fetch spot orderbook" });
    }
  });

  // Options orderbook (aggregated)
  app.get("/api/options/orderbook", authenticateToken, async (req: AuthRequest, res) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { commodity, window, depth } = req.query as { commodity?: string; window?: string; depth?: string };
    if (!commodity) {
      return res.status(400).json({ error: "commodity is required" });
    }
    const depthNum = Math.min(Math.max(Number(depth) || 5, 1), 50);

    try {
      const rows = await db
        .select({
          id: options.id,
          strike: options.strike,
          qty: options.qty,
          type: options.type,
          status: options.status,
          commodity: options.commodity,
          expirationDate: options.expirationDate,
        })
        .from(options)
        .where(eq(options.status, "OPEN"));

      const filtered = rows.filter((opt) => {
        const matchesCommodity = opt.commodity?.toLowerCase() === commodity.toLowerCase();
        const matchesWindow = window
          ? opt.expirationDate && new Date(opt.expirationDate).toISOString().startsWith(window)
          : true;
        return matchesCommodity && matchesWindow;
      });

      const asksMap = new Map<string, number>();
      for (const opt of filtered) {
        const price = Number(opt.strike);
        const qty = Number(opt.qty);
        if (!Number.isFinite(price) || !Number.isFinite(qty)) continue;
        const key = `${price}-${opt.type}`;
        const current = asksMap.get(key) || 0;
        asksMap.set(key, current + qty);
      }

      const asks = Array.from(asksMap.entries())
        .map(([key, quantity]) => {
          const [priceStr, type] = key.split("-");
          return { price: Number(priceStr), quantity, type };
        })
        .sort((a, b) => {
          if (a.price === b.price) return 0;
          return a.price - b.price;
        })
        .slice(0, depthNum);

      const windowLabel = filtered[0]?.expirationDate
        ? new Date(filtered[0].expirationDate!).toISOString()
        : undefined;

      const response = {
        commodity,
        windowLabel,
        bids: [] as { price: number; quantity: number }[],
        asks,
      };

      console.info("[Orderbook Options]", { commodity, window: windowLabel || window, depth: depthNum, bids: response.bids.length, asks: response.asks.length });
      res.json(response);
    } catch (error: any) {
      console.error("[Orderbook Options] Error", { commodity, error: error?.message });
      res.status(500).json({ error: error?.message || "Failed to fetch options orderbook" });
    }
  });

  // Market snapshot for open options (public read-only)
  app.get("/api/options/market", async (req, res) => {
    try {
      const { commodity, window, limit } = req.query as {
        commodity?: string;
        window?: string;
        limit?: string;
      };

      const parsedLimit = Math.min(Math.max(Number(limit) || 0, 1), 50) || 10;

      const baseWhere: any[] = [eq(options.status, "OPEN")];

      if (commodity) {
        baseWhere.push(sql`${options.commodity} = ${commodity}`);
      }

      // Add window filter only if column exists
      // Use raw SQL to avoid referencing optional columns that might be missing
      const conditions = [
        sql`o.status = 'OPEN'`
      ];

      if (commodity) {
        conditions.push(sql`o.commodity = ${commodity}`);
      }

      const whereSql = sql.join(conditions, sql` AND `);

      const rowsResult = await db.execute(
        sql`
          SELECT
            o.id,
            o.type,
            o.strike,
            o.qty,
            o.premium,
            o.status,
            o.commodity,
          COALESCE(i.name, o.commodity, i.slug, o.title, 'Unknown') AS "commodityLabel",
          COALESCE(o.commodity, i.slug) AS "commoditySlug",
            o.expiration_date AS "expirationDate",
            NULL::text AS "expiryWindow",
            NULL::timestamptz AS "windowStart",
            NULL::timestamptz AS "windowEnd",
            NULL::timestamptz AS "settlementDate",
            o.created_at AS "createdAt",
            o.issuer_id AS "issuerId",
            i.name AS "indexName",
            i.slug AS "indexSlug"
          FROM options o
          LEFT JOIN indexes i ON o.index_id = i.id
          WHERE ${whereSql}
          ORDER BY COALESCE(o.expiration_date, o.created_at) ASC, o.strike ASC, o.premium ASC
          LIMIT ${parsedLimit}
        `
      );

      const rows = (rowsResult as any).rows ?? [];

      const marketRows = rows.map((opt: any) => {
        const row = mapOptionToMarketRow(opt as any) as any;
        return {
          ...row,
          country: buildOptionCountry(opt),
        };
      });

      res.json({ options: marketRows });
    } catch (error: any) {
      console.error("[Options Market] Error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch market options" });
    }
  });

  app.get("/api/options/:id/json", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const option = await storage.getOptionById(id);
      if (!option) {
        return res.status(404).json({ error: "Option not found" });
      }
      const payload =
        option.contractJson ||
        JSON.stringify(serializeOptionToJson(option));
      res.json({
        schemaVersion: option.schemaVersion || "v1",
        contractJson: JSON.parse(payload),
      });
    } catch (error: any) {
      console.error("[GET_OPTION_JSON] Error:", error);
      res.status(500).json({ error: "Failed to load option JSON" });
    }
  });

  app.post("/api/options", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const result = insertOptionSchema.safeParse(req.body);
      
      if (!result.success) {
        const validationError = fromZodError(result.error);
        
        // Log detailed validation error for debugging
        console.error("[CREATE_OPTION_ERROR] Validation failed");
        console.error("Request body:", JSON.stringify(req.body, null, 2));
        console.error("Validation errors:", JSON.stringify(result.error.issues, null, 2));
        
        return res.status(400).json({ 
          error: validationError.message,
          details: result.error.issues 
        });
      }

      // Lookup commodity name from index if indexId is provided
      let commodityName = result.data.commodity;
      let selectedIndex: any = null;
      let selectedLatest: any = null;
      if (result.data.indexId) {
        const found = await getIndexWithLatestById(result.data.indexId);
        if (!found) {
          return res.status(400).json({ 
            error: "Invalid commodity index" 
          });
        }
        selectedIndex = found.index;
        selectedLatest = found.latestPrice;
        const { isStale } = computeIsStale(selectedLatest?.timestamp || null);
        if (isStale) {
          return res.status(400).json({ error: "Trading disabled for this commodity (index is stale)" });
        }
        // Populate commodity field with index name for backward compatibility
        commodityName = selectedIndex.name;
      } else if (commodityName) {
        const foundBySlug = await getIndexWithLatestBySlug(commodityName.toLowerCase());
        if (foundBySlug) {
          const { isStale } = computeIsStale(foundBySlug.latestPrice?.timestamp || null);
          if (isStale) {
            return res.status(400).json({ error: "Trading disabled for this commodity (index is stale)" });
          }
        }
      }

      // Compute expiry window if provided (prefer half/month/year over raw dates)
      const { expiryHalf, expiryMonth, expiryYear } = req.body as any;
      let windowComputed: {
        expiryWindow?: string;
        windowStart?: Date;
        windowEnd?: Date;
        settlementDate?: Date;
        expirationDate?: Date;
      } = {};

      if (expiryHalf && expiryMonth && expiryYear) {
        try {
          const window = computeExpiryWindow({
            half: expiryHalf,
            month: Number(expiryMonth),
            year: Number(expiryYear),
          });
          windowComputed = {
            expiryWindow: window.label,
            windowStart: window.windowStart,
            windowEnd: window.windowEnd,
            settlementDate: window.settlementDate,
            expirationDate: window.settlementDate,
          };
        } catch (err) {
          console.error("[CREATE_OPTION] Invalid expiry window input", err);
          return res.status(400).json({ error: "Invalid expiry window" });
        }
      }

      // Set the issuer ID and commodity name
      // Ensure all required fields are present and properly formatted
      const optionData: any = {
        ...result.data,
        ...windowComputed,
        commodity: commodityName,
        issuerId: req.user!.id,
        // Ensure status is set (default is OPEN, but explicit is better)
        status: result.data.status || 'OPEN',
        usePremiumAsMargin: result.data.usePremiumAsMargin ?? false,
      };

      // Ensure expirationDate is a Date object (Zod should handle this, but double-check)
      let expirationDate: Date | undefined;
      if (result.data.expirationDate) {
        expirationDate = result.data.expirationDate instanceof Date 
          ? result.data.expirationDate 
          : new Date(result.data.expirationDate);
        optionData.expirationDate = expirationDate;
      }

      // Calculate notional value once - will be reused for both collateral calculation and platform fee
      // notional = strike * quantity in tons (result is in USD)
      // This is always calculated regardless of whether collateral is needed, as it's also used for platform fee
      const strikePerTon = parseFloat(result.data.strike); // Already in $/ton
      const quantityTons = parseFloat(result.data.qty); // Already in tons
      
      // Validate inputs before computing notional (computeNotional throws if negative)
      if (isNaN(strikePerTon) || isNaN(quantityTons) || strikePerTon < 0 || quantityTons < 0) {
        return res.status(400).json({
          error: "Invalid strike or quantity",
          details: `Strike: ${strikePerTon}, Quantity: ${quantityTons}`
        });
      }
      
      const notional = computeNotional(strikePerTon, quantityTons);
      
      // Initial margin calculation using margin engine (SHORT side)
      const premiumPerTon = parseFloat(result.data.premium);
      const totalPremium = premiumPerTon * quantityTons;
      if (expirationDate) {
        const baseInitialMargin = calculateInitialMargin({
          strike: strikePerTon,
          quantityTon: quantityTons,
          settlementDate: expirationDate,
          currentDate: new Date(),
        });
        const effectiveInitialMargin = optionData.usePremiumAsMargin
          ? Math.max(0, baseInitialMargin - totalPremium)
          : baseInitialMargin;
        optionData.initialMargin = effectiveInitialMargin.toFixed(8);
        optionData.collateralAmount = optionData.initialMargin;
      }

      // Remove any undefined values that might cause issues with Drizzle
      Object.keys(optionData).forEach(key => {
        if (optionData[key] === undefined) {
          delete optionData[key];
        }
      });

      // Log option data before insertion for debugging
      console.log("[CREATE_OPTION] Attempting to create option with data:", {
        type: optionData.type,
        strike: optionData.strike,
        qty: optionData.qty,
        premium: optionData.premium,
        indexId: optionData.indexId,
        commodity: optionData.commodity,
        issuerId: optionData.issuerId,
        expirationDate: optionData.expirationDate,
        expirationDateType: typeof optionData.expirationDate,
        status: optionData.status,
        hasCollateralAmount: !!optionData.collateralAmount,
      });

      // Freeze collateral for the seller (issuer) before creating the option
      const requiredCollateral = parseFloat(optionData.initialMargin || optionData.collateralAmount || "0");
      
      if (requiredCollateral > 0) {
        // Get or create seller's CROPT balance with row lock
        const [sellerBalance] = await db
          .select()
          .from(croptBalances)
          .where(eq(croptBalances.userId, req.user!.id))
          .for('update')
          .limit(1);

        // NOTE: For demo, we don't actually freeze collateral in DB (locked_collateral column doesn't exist)
        // Instead, we just check that the user has enough balance
        // The collateralAmount is stored on the option record and used for portfolio calculations
        const currentBalance = sellerBalance ? parseFloat(sellerBalance.balance) : 0;

        if (currentBalance < requiredCollateral) {
          return res.status(400).json({
            error: "Insufficient collateral",
            details: `Required: ${requiredCollateral.toFixed(2)} CROPT, Available: ${currentBalance.toFixed(2)} CROPT`
          });
        }

        // For demo: we don't actually lock the balance in DB
        // The collateralAmount on the option is used for portfolio display
        console.log(`[CREATE_OPTION] Option requires ${requiredCollateral.toFixed(2)} CROPT collateral (stored on option, not frozen in DB for demo)`);
      }

      // Create the option - this is the critical operation that must succeed
      // If this fails, we want to return 500
      let createdOption;
      try {
        createdOption = await storage.createOption(optionData);
      } catch (createError: any) {
        console.error("[CREATE_OPTION_ERROR] Failed to create option row", createError);
        console.error("[CREATE_OPTION_ERROR] Request body:", JSON.stringify(req.body, null, 2));
        console.error("[CREATE_OPTION_ERROR] Error type:", createError?.constructor?.name || typeof createError);
        console.error("[CREATE_OPTION_ERROR] Error message:", createError?.message || String(createError));
        console.error("[CREATE_OPTION_ERROR] Error stack:", createError?.stack);
        if (createError?.code) {
          console.error("[CREATE_OPTION_ERROR] Error code:", createError.code);
        }
        return res.status(500).json({ 
          error: "Failed to create option",
          details: createError?.message || String(createError)
        });
      }
      
      // IMPORTANT: Platform fee insertion is NON-FATAL
      // Option creation has already succeeded, so fee logging failures should not cause 500
      // This block is completely isolated from the main flow and NEVER throws
      try {
        // Record platform fee (TODO: implement actual fee calculation policy)
        // For now, storing 0 as placeholder
        const feeAmount = 0; // TODO: implement fee calculation (e.g., premium * 0.001 for 0.1%)
        
        // Compute and validate notionalAmount before attempting insert
        // notional was already calculated above (strikePerTon * quantityTons)
        let notionalAmount: string | null = null;
        
        if (typeof notional === 'number' && Number.isFinite(notional) && !Number.isNaN(notional) && notional > 0) {
          notionalAmount = notional.toFixed(8);
        } else {
          console.error('[CREATE_OPTION] Invalid notional for platform fee (skipping insert)', { 
            strikePerTon, 
            quantityTons, 
            notional,
            optionId: createdOption.id 
          });
        }
        
        // Only attempt insert if we have a valid notionalAmount
        if (!notionalAmount) {
          console.warn("[CREATE_OPTION] Skipping platform_fees insert due to missing/invalid notionalAmount");
        } else {
          // Insert platform fee - ensure fee_type (mapped from 'type' field) is always set
          // The schema maps 'type' field to 'fee_type' column in DB
          // notionalAmount maps to 'notional_amount' column via Drizzle schema
          const feeData = {
            userId: req.user!.id,
            type: 'matching_fee' as const,
            amount: feeAmount.toFixed(8),
            notionalAmount: notionalAmount, // Required: quantity * strike in USD (as string for decimal)
            currency: 'CROPT' as const,
            instrument: createdOption.id,
            txId: null,
            // role is optional - only include if user has one
            ...(req.user!.role && { role: req.user!.role }),
          };
          
          // Final validation before insert - double check notionalAmount is present
          if (!feeData.notionalAmount || feeData.notionalAmount === 'NaN' || feeData.notionalAmount === 'null' || feeData.notionalAmount === '') {
            console.error('[CREATE_OPTION] Invalid notionalAmount in feeData (skipping fee insert)', { 
              feeData, 
              optionId: createdOption.id,
              notionalAmountValue: feeData.notionalAmount
            });
          } else {
            try {
              await db.insert(platformFees).values(feeData);
              console.log(`[CREATE_OPTION] Platform fee recorded for option ${createdOption.id}, userId=${req.user!.id}, fee_type=matching_fee, notionalAmount=${notionalAmount}, role=${req.user!.role || 'none'}`);
            } catch (feeError: any) {
              // Log error but don't fail the request - option was already created successfully
              console.error("[CREATE_OPTION] Failed to insert platform fee (non-fatal):", feeError?.message || feeError);
              console.error("[CREATE_OPTION] Fee data attempted:", JSON.stringify(feeData, null, 2));
              if (feeError?.code) {
                console.error("[CREATE_OPTION] Fee error code:", feeError.code);
              }
              
              // Try once more without role if it's a role-related error
              if (feeError?.code === '42703' || feeError?.message?.includes('role') || feeError?.message?.includes('does not exist')) {
                try {
                  console.warn("[CREATE_OPTION] Retrying platform fee insert without role column");
                  const { role, ...feeDataWithoutRole } = feeData;
                  // Ensure notionalAmount is still present after removing role
                  if (feeDataWithoutRole.notionalAmount) {
                    await db.insert(platformFees).values(feeDataWithoutRole);
                    console.log(`[CREATE_OPTION] Platform fee recorded (retry without role) for option ${createdOption.id}`);
                  } else {
                    console.error('[CREATE_OPTION] notionalAmount missing after removing role', { feeDataWithoutRole });
                  }
                } catch (retryError: any) {
                  // Even retry failed - log but continue
                  console.error("[CREATE_OPTION] Retry also failed (non-fatal):", retryError?.message || retryError);
                  if (retryError?.code) {
                    console.error("[CREATE_OPTION] Retry error code:", retryError.code);
                  }
                }
              }
              // DO NOT re-throw - option creation succeeded, fee logging is secondary
            }
          }
        }
      } catch (feeBlockError: any) {
        // Catch any unexpected errors in the entire fee insertion block
        // This should never happen, but if it does, we log and continue
        console.error("[CREATE_OPTION] Unexpected error in fee insertion block (non-fatal):", feeBlockError?.message || feeBlockError);
        console.error("[CREATE_OPTION] Fee block error stack:", feeBlockError?.stack);
        if (feeBlockError?.code) {
          console.error("[CREATE_OPTION] Fee block error code:", feeBlockError.code);
        }
        // DO NOT re-throw - option was created successfully
      }
      
      // Always return success if option was created
      // This line must be reached regardless of fee insertion success/failure
      res.status(201).json(createdOption);
    } catch (error: any) {
      // This catch block should only catch errors from validation, collateral checks, or option creation
      // Fee insertion errors are already handled above and should never reach here
      console.error("[CREATE_OPTION_ERROR] Unexpected error in option creation handler");
      console.error("Request body:", JSON.stringify(req.body, null, 2));
      console.error("Error type:", error?.constructor?.name || typeof error);
      console.error("Error message:", error?.message || String(error));
      console.error("Error stack:", error?.stack);
      if (error?.code) {
        console.error("Error code:", error.code);
      }
      res.status(500).json({ 
        error: "Failed to create option",
        details: error?.message || String(error)
      });
    }
  });

  app.post("/api/options/:id/match", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Only brokers/admin can manually match options
      const hasAccess = hasBrokerPermissions(req.user?.role);
      if (!hasAccess) {
        return res.status(403).json({ error: "Only brokers can match options" });
      }

      const matchSchema = z.object({
        counterpartyId: z.string().min(1, "Counterparty ID is required"),
      });

      const result = matchSchema.safeParse(req.body);
      
      if (!result.success) {
        const validationError = fromZodError(result.error);
        return res.status(400).json({ 
          error: validationError.message 
        });
      }

      const option = await storage.matchOption(
        req.params.id, 
        result.data.counterpartyId,
        req.user.id
      );

      // Trade status email alerts (best effort)
      try {
        const subject = `Cropto: Option matched (${option.title})`;
        const body = [
          `Your option has been matched.`,
          ``,
          `Option ID: ${option.id}`,
          `Title: ${option.title}`,
          `Type: ${option.type}`,
          `Status: ${option.status}`,
          `Quantity: ${option.qty}`,
          `Strike: ${option.strike}`,
          ``,
          `You can now review the position in Portfolio.`,
        ].join("\n");
        await sendEmailIfEnabled(option.issuerId, "tradeStatus", subject, body);
        await sendEmailIfEnabled(option.buyerId, "tradeStatus", subject, body);
      } catch (emailError) {
        console.error("[TradeStatus] Failed to send option matched emails:", emailError);
      }

      res.status(200).json(option);
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

  app.post("/api/options/:id/exercise", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const exerciseSchema = z.object({
        spotPrice: z.coerce.number().positive("Spot price must be positive"),
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
        req.user.id,
        result.data.spotPrice.toString()
      );

      try {
        const optionAfterExercise = await storage.getOptionById(req.params.id);
        const subject = `Cropto: Option exercised (${optionAfterExercise?.title || req.params.id})`;
        const body = [
          `An option position has been exercised and settled.`,
          ``,
          `Option ID: ${req.params.id}`,
          `Status: EXERCISED`,
          `Spot price: ${result.data.spotPrice}`,
          `Payout: ${settlement.payout}`,
          ``,
          `See details in Portfolio.`,
        ].join("\n");
        await sendEmailIfEnabled(optionAfterExercise?.issuerId, "tradeStatus", subject, body);
        await sendEmailIfEnabled(optionAfterExercise?.buyerId, "tradeStatus", subject, body);
      } catch (emailError) {
        console.error("[TradeStatus] Failed to send option exercised emails:", emailError);
      }
      
      res.status(200).json(settlement);
    } catch (error: any) {
      console.error("Error exercising option:", error);
      const message: string = error.message || "Failed to exercise option";

      const isClientError =
        error.statusCode === 400 ||
        message.includes("not found") ||
        message.includes("Only") ||
        message.includes("Insufficient CROPT balance") ||
        message.includes("Counterparty has insufficient CROPT balance");

      const statusCode = isClientError ? 400 : 500;
      res.status(statusCode).json({ error: message });
    }
  });

  app.get("/api/settlements", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const settlements = await storage.listSettlements();
      res.json(settlements);
    } catch (error) {
      console.error("Error fetching settlements:", error);
      res.status(500).json({ error: "Failed to fetch settlements" });
    }
  });

  app.get("/api/transactions", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const transactions = await storage.listTransactions();
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  // POST /api/jobs/run-margin-check - Run margin check on open options
  app.post("/api/jobs/run-margin-check", async (req, res) => {
    try {
      const marginCheckSchema = z.object({
        date: z.string().optional(),
        commodity: z.string().optional(),
        indexPrice: z.coerce.number().optional(),
      });

      const result = marginCheckSchema.safeParse(req.body);
      
      if (!result.success) {
        const validationError = fromZodError(result.error);
        return res.status(400).json({ 
          error: validationError.message 
        });
      }

      const { commodity, indexPrice } = result.data;
      
      // Default index price if not provided (using a default value for demo)
      const currentIndexPrice = indexPrice ?? 100;

      // Get all OPEN options, filtered by commodity if provided
      const allOptions = await storage.listOptions();
      const openOptions = allOptions.filter(option => {
        const isOpen = option.status === "OPEN";
        const matchesCommodity = !commodity || option.commodity === commodity;
        return isOpen && matchesCommodity;
      });

      const marginCalls: any[] = [];
      const createdNotifications: any[] = [];

      // Process each open option
      for (const option of openOptions) {
        const strikePrice = parseFloat(option.strike || "0");
        const qty = parseFloat(option.qty || "0");
        const collateral = parseFloat(option.collateralAmount || "0");
        const lastIntrinsic = parseFloat(option.lastIntrinsic || "0");

        // Calculate intrinsic value using utility function
        const intrinsicValue = intrinsic(option.type, currentIndexPrice, strikePrice, qty);

        // Calculate P&L
        const pnl = lastIntrinsic > 0 ? intrinsicValue - lastIntrinsic : intrinsicValue;
        
        // Update option with new intrinsic and accumulated payout
        const currentPayout = parseFloat(option.payoutAccumulated || "0");
        const newPayoutAccumulated = currentPayout + pnl;

        await storage.updateOption(option.id, {
          lastIntrinsic: intrinsicValue.toFixed(8),
          payoutAccumulated: newPayoutAccumulated.toFixed(8),
        });

        // Check margin rule using utility function
        if (collateral > 0 && shouldTriggerMargin(intrinsicValue, collateral)) {
          const amountRequired = calculateMarginCallAmount(intrinsicValue, collateral);
          
          // Determine responsible party (issuer/seller, not buyer)
          const responsibleUserId = option.issuerId || option.seller;
          
          if (!responsibleUserId) {
            console.warn(`Option ${option.id} has no issuer or seller, skipping margin call`);
            continue;
          }
          
          // Check for existing open margin call for this option/user pair
          const allMarginCalls = await storage.listMarginCalls();
          const existingMarginCall = allMarginCalls.find(
            mc => mc.optionId === option.id && 
                  mc.userId === responsibleUserId && 
                  mc.status === "PENDING"
          );
          
          let marginCall;
          if (existingMarginCall) {
            // Update existing margin call with latest calculations
            marginCall = await storage.updateMarginCall(existingMarginCall.id, {
              amountRequired: amountRequired.toFixed(8),
              intrinsicValue: intrinsicValue.toFixed(8),
              collateralAmount: collateral.toFixed(8),
            });
          } else {
            // Create new margin call
            marginCall = await storage.createMarginCall({
              optionId: option.id,
              userId: responsibleUserId,
              amountRequired: amountRequired.toFixed(8),
              intrinsicValue: intrinsicValue.toFixed(8),
              collateralAmount: collateral.toFixed(8),
            });
            
            // Send email notification for new margin call
            const responsibleUser = await findUserById(responsibleUserId);
            const canSendMarginCallEmail = await shouldSendUserEmail(responsibleUserId, "marginCalls");
            if (responsibleUser && marginCall.deadline && canSendMarginCallEmail) {
              await emailService.sendMarginCallEmail(
                responsibleUser.email,
                responsibleUser.email.split('@')[0], // Use email prefix as name
                option.id,
                amountRequired.toFixed(2),
                marginCall.deadline
              );
            }
          }
          
          // Add to response array (whether new or updated)
          marginCalls.push(marginCall);

          // Create notification for buyer (check for duplicates)
          if (option.buyerId) {
            const existingBuyerNotifications = await storage.listNotifications(option.buyerId);
            const hasBuyerNotification = existingBuyerNotifications.some(
              n => n.type === "MARGIN_CALL" && n.relatedId === marginCall.id && n.read === "false"
            );
            
            if (!hasBuyerNotification) {
              const buyerNotification = await storage.createNotification({
                userId: option.buyerId,
                type: "MARGIN_CALL",
                message: `Margin call triggered for option ${option.title}. Amount required: ${amountRequired.toFixed(8)}`,
                relatedId: marginCall.id,
              });
              createdNotifications.push(buyerNotification);
            }
          }

          // Create notification for issuer/seller (check for duplicates and prevent duplicate if same as buyer)
          if (responsibleUserId !== option.buyerId) {
            const existingIssuerNotifications = await storage.listNotifications(responsibleUserId);
            const hasIssuerNotification = existingIssuerNotifications.some(
              n => n.type === "MARGIN_CALL" && n.relatedId === marginCall.id && n.read === "false"
            );
            
            if (!hasIssuerNotification) {
              const issuerNotification = await storage.createNotification({
                userId: responsibleUserId,
                type: "MARGIN_CALL",
                message: `Margin call triggered for option ${option.title}. Amount required: ${amountRequired.toFixed(8)}`,
                relatedId: marginCall.id,
              });
              createdNotifications.push(issuerNotification);
            }
          }
        }
      }

      res.json({
        marginCalls,
        optionsProcessed: openOptions.length,
        indexPrice: currentIndexPrice,
        commodity: commodity || "all",
      });
    } catch (error: any) {
      console.error("Error running margin check:", error);
      res.status(500).json({ error: error.message || "Failed to run margin check" });
    }
  });

  // POST /api/jobs/daily-settle - Daily settlement with margin call generation
  app.post("/api/jobs/daily-settle", async (req, res) => {
    try {
      const dailySettleSchema = z.object({
        date: z.string().optional(),
        commodity: z.string().optional(),
        indexPrice: z.coerce.number(),
      });

      const result = dailySettleSchema.safeParse(req.body);
      
      if (!result.success) {
        const validationError = fromZodError(result.error);
        return res.status(400).json({ 
          error: validationError.message 
        });
      }

      const { commodity, indexPrice } = result.data;

      // Get all OPEN options, filtered by commodity if provided
      const allOptions = await storage.listOptions();
      const openOptions = allOptions.filter(option => {
        const isOpen = option.status === "OPEN";
        const matchesCommodity = !commodity || option.commodity === commodity;
        return isOpen && matchesCommodity;
      });

      const marginCalls: any[] = [];
      const processedOptions: any[] = [];
      const errors: any[] = [];

      // Process each open option
      for (const option of openOptions) {
        try {
          const strikePrice = parseFloat(option.strike || "0");
          const qty = parseFloat(option.qty || "0");
          const collateral = parseFloat(option.collateralAmount || "0");

          // Calculate intrinsic value
          const intrinsicValue = intrinsic(option.type, indexPrice, strikePrice, qty);

          // Calculate P&L (simplified: just intrinsic value for now)
          const pnl = intrinsicValue;

          // Check if pnl exceeds 0.8 * collateral
          const threshold = 0.8 * collateral;
          
          if (collateral > 0 && pnl > threshold) {
            // Determine responsible party (issuer/seller)
            const responsibleUserId = option.issuerId || option.seller;
            
            if (!responsibleUserId) {
              errors.push({
                optionId: option.id,
                error: "No issuer or seller found for option"
              });
              continue;
            }

            // Check for existing open margin call for this option
            const allMarginCalls = await storage.listMarginCalls();
            const existingMarginCall = allMarginCalls.find(
              mc => mc.optionId === option.id && 
                    mc.userId === responsibleUserId && 
                    mc.status === "PENDING"
            );

            let marginCall;
            if (!existingMarginCall) {
              // Calculate amount required to restore margin
              const amountRequired = calculateMarginCallAmount(intrinsicValue, collateral);
              
              // Create new margin call with 24h deadline
              marginCall = await storage.createMarginCall({
                optionId: option.id,
                userId: responsibleUserId,
                amountRequired: amountRequired.toFixed(8),
                intrinsicValue: intrinsicValue.toFixed(8),
                collateralAmount: collateral.toFixed(8),
              });

              marginCalls.push(marginCall);

              // Update option status to MARGIN_CALL
              await storage.updateOption(option.id, {
                status: "MARGIN_CALL",
              });

              processedOptions.push({
                optionId: option.id,
                intrinsicValue,
                collateral,
                pnl,
                threshold,
                marginCallId: marginCall.id,
                status: "MARGIN_CALL",
              });
            } else {
              // Existing margin call - don't create duplicate
              processedOptions.push({
                optionId: option.id,
                intrinsicValue,
                collateral,
                pnl,
                threshold,
                status: "EXISTING_MARGIN_CALL",
                marginCallId: existingMarginCall.id,
              });
            }
          } else {
            processedOptions.push({
              optionId: option.id,
              intrinsicValue,
              collateral,
              pnl,
              threshold,
              status: "OK",
            });
          }
        } catch (error: any) {
          errors.push({
            optionId: option.id,
            error: error.message || "Failed to process option"
          });
        }
      }

      res.json({
        processedCount: openOptions.length,
        marginCalls,
        processedOptions,
        errors,
        indexPrice,
        commodity: commodity || "all",
      });
    } catch (error: any) {
      console.error("Error running daily settle:", error);
      res.status(500).json({ error: error.message || "Failed to run daily settle" });
    }
  });

  // GET /api/margin-calls - List margin calls (admin sees all, non-admin sees their own)
  app.get("/api/margin-calls", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { status } = req.query;
      const isAdmin = hasBrokerPermissions(req.user?.role); // Broker/super_admin roles act as admin
      
      let marginCalls;
      if (isAdmin) {
        // Admin sees all margin calls
        marginCalls = await storage.listMarginCalls();
      } else {
        // Non-admin sees only their own margin calls
        marginCalls = await storage.getMarginCallsByUser(req.user.id);
      }
      
      // Filter by status if provided
      if (status && typeof status === "string") {
        marginCalls = marginCalls.filter(mc => mc.status === status);
      }
      
      res.json(marginCalls);
    } catch (error: any) {
      console.error("Error fetching margin calls:", error);
      res.status(500).json({ error: error.message || "Failed to fetch margin calls" });
    }
  });

  const notificationPrefsSchema = z.object({
    tradeStatus: z.boolean().optional(),
    marginCalls: z.boolean().optional(),
    indexUpdates: z.boolean().optional(),
    system: z.boolean().optional(),
  });

  app.get("/api/user/notification-preferences", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const prefs = await getUserNotificationPreferences(req.user.id);
      res.json(prefs);
    } catch (error: any) {
      console.error("Error fetching notification preferences:", error);
      res.status(500).json({ error: error.message || "Failed to fetch notification preferences" });
    }
  });

  app.put("/api/user/notification-preferences", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const parsed = notificationPrefsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid notification preferences payload" });
      }

      const current = await getUserNotificationPreferences(req.user.id);
      const next: UserNotificationPreferences = {
        tradeStatus: parsed.data.tradeStatus ?? current.tradeStatus,
        marginCalls: parsed.data.marginCalls ?? current.marginCalls,
        indexUpdates: parsed.data.indexUpdates ?? current.indexUpdates,
        system: parsed.data.system ?? current.system,
      };

      await storage.upsertAppSetting(
        userNotificationPrefsKey(req.user.id),
        JSON.stringify(next)
      );
      res.json(next);
    } catch (error: any) {
      console.error("Error updating notification preferences:", error);
      res.status(500).json({ error: error.message || "Failed to update notification preferences" });
    }
  });

  // GET /api/notifications - Get notifications for current user
  app.get("/api/notifications", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { unread } = req.query;
      let notifications = await storage.listNotifications(req.user.id);
      
      // Filter to unread only if requested
      if (unread === "true") {
        notifications = notifications.filter(n => n.read === "false");
      }
      
      res.json(notifications);
    } catch (error: any) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ error: error.message || "Failed to fetch notifications" });
    }
  });

  // POST /api/notifications/:id/mark-read - Mark a notification as read
  app.post("/api/notifications/:id/mark-read", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      
      // Get the notification to verify ownership
      const notifications = await storage.listNotifications(req.user.id);
      const notification = notifications.find(n => n.id === id);
      
      if (!notification) {
        return res.status(404).json({ error: "Notification not found" });
      }
      
      // Update the notification
      const updated = await storage.updateNotification(id, { read: "true" });
      res.json(updated);
    } catch (error: any) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ error: error.message || "Failed to mark notification as read" });
    }
  });

  // POST /api/notifications/send-mock - Admin-only endpoint to create test notifications
  app.post("/api/notifications/send-mock", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { userId, type, message, relatedId } = req.body;
      
      if (!userId || !type || !message) {
        return res.status(400).json({ error: "userId, type, and message are required" });
      }
      
      const validTypes = ["MARGIN_CALL", "OPTION_MATCHED", "OPTION_EXERCISED", "LIQUIDATION", "FORCE_SETTLE"];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(", ")}` });
      }
      
      const notification = await storage.createNotification({
        userId,
        type,
        message,
        relatedId: relatedId || null,
      });
      
      console.log(`[Mock] Test notification sent to user ${userId}: ${message}`);
      res.json(notification);
    } catch (error: any) {
      console.error("Error sending mock notification:", error);
      res.status(500).json({ error: error.message || "Failed to send mock notification" });
    }
  });

  // POST /api/margin-call/:id/topup - Top up reserved collateral for a margin call
  app.post("/api/margin-call/:id/topup", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { amount, currency } = req.body;
      
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: "Valid amount is required" });
      }
      
      // Validate currency if provided (CROPT or FIAT)
      if (currency && !["CROPT", "FIAT"].includes(currency)) {
        return res.status(400).json({ error: "Currency must be CROPT or FIAT" });
      }
      
      // Get the margin call
      const marginCall = await storage.getMarginCallById(id);
      if (!marginCall) {
        return res.status(404).json({ error: "Margin call not found" });
      }
      
      // Verify the user is the responsible party
      if (marginCall.userId !== req.user.id) {
        return res.status(403).json({ error: "Not authorized to top up this margin call" });
      }
      
      // Verify the margin call is pending
      if (marginCall.status !== "PENDING") {
        return res.status(400).json({ error: "Margin call is not in PENDING status" });
      }
      
      // Calculate new reserved collateral
      const currentReserved = parseFloat(marginCall.reservedCollateral || "0");
      const topupAmount = parseFloat(amount);
      const newReserved = currentReserved + topupAmount;
      
      // Calculate total available collateral
      const currentCollateral = parseFloat(marginCall.collateralAmount);
      const totalAvailable = currentCollateral + newReserved;
      const amountRequired = parseFloat(marginCall.amountRequired);
      
      // Determine if margin call should be resolved
      const shouldResolve = totalAvailable >= amountRequired;
      
      // Update margin call
      const updatedMarginCall = await storage.updateMarginCall(id, {
        reservedCollateral: newReserved.toFixed(8),
        status: shouldResolve ? "RESOLVED" : "PENDING",
      });
      
      // If resolved, update option status back to OPEN
      if (shouldResolve) {
        if (!marginCall.optionId) {
          throw new Error("Margin call is missing optionId");
        }
        await storage.updateOption(marginCall.optionId, {
          status: "OPEN",
        });
      }
      
      res.json({
        marginCall: updatedMarginCall,
        resolved: shouldResolve,
        totalAvailable: totalAvailable.toFixed(8),
        amountRequired: amountRequired.toFixed(8),
      });
    } catch (error: any) {
      console.error("Error topping up margin call:", error);
      res.status(500).json({ error: error.message || "Failed to top up margin call" });
    }
  });

  // POST /api/options/:id/force-settle - Force settle an option (admin only)
  app.post("/api/options/:id/force-settle", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // Only brokers (admin) can force-settle
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Only brokers can force-settle options" });
      }
      
      if (!reason || typeof reason !== "string") {
        return res.status(400).json({ error: "Reason is required" });
      }
      
      const result = await storage.forceSettleOption(id, req.user.id, reason);

      try {
        const subject = `Cropto: Option force-settled (${result.option.title})`;
        const body = [
          `An option was force-settled by an administrator.`,
          ``,
          `Option ID: ${result.option.id}`,
          `Title: ${result.option.title}`,
          `Status: ${result.option.status}`,
          `Reason: ${reason}`,
          ``,
          `Please review this in your Portfolio / activity logs.`,
        ].join("\n");
        await sendEmailIfEnabled(result.option.issuerId, "tradeStatus", subject, body);
        await sendEmailIfEnabled(result.option.buyerId, "tradeStatus", subject, body);
        await sendEmailIfEnabled(result.option.issuerId, "system", subject, body);
        await sendEmailIfEnabled(result.option.buyerId, "system", subject, body);
      } catch (emailError) {
        console.error("[TradeStatus] Failed to send force-settle emails:", emailError);
      }
      
      res.json({
        option: result.option,
        transaction: result.transaction,
        notificationsCreated: result.notifications.length,
      });
    } catch (error: any) {
      console.error("Error force-settling option:", error);
      const statusCode = error.message?.includes("not found") ? 404 : 500;
      res.status(statusCode).json({ error: error.message || "Failed to force-settle option" });
    }
  });

  // POST /api/admin/run-demo - Run demo scenario seeding (broker only)
  app.post("/api/admin/run-demo", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // Only brokers (admin) can run demo scenario
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Only brokers can run demo scenarios" });
      }
      
      // Import and run seed script
      const { seedDemoData } = await import("./scripts/seedDemo");
      const results = await seedDemoData();
      
      res.json({
        message: "Demo scenario seeded successfully",
        results,
      });
    } catch (error: any) {
      console.error("Error running demo scenario:", error);
      res.status(500).json({ error: error.message || "Failed to run demo scenario" });
    }
  });

  // POST /api/admin/schedule/process-deadlines - Manually trigger deadline processor (broker only)
  app.post("/api/admin/schedule/process-deadlines", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Only brokers can trigger deadline processing" });
      }
      
      const results = await processDeadlines();
      
      res.json(results);
    } catch (error: any) {
      console.error("Error processing deadlines:", error);
      res.status(500).json({ error: error.message || "Failed to process deadlines" });
    }
  });

  // POST /api/jobs/process-deadlines - Process expired margin calls (manual trigger, admin/broker only)
  app.post("/api/jobs/process-deadlines", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // Only brokers (admin) can manually trigger deadline processing
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Only brokers can process deadlines" });
      }
      
      // Get expired margin calls
      const expiredMarginCalls = await storage.getExpiredMarginCalls();
      
      const processedOptions: any[] = [];
      const errors: any[] = [];
      
      // Force-settle each option with expired margin call
      for (const marginCall of expiredMarginCalls) {
        try {
          const reason = `Margin call deadline expired (${marginCall.deadline}). Collateral insufficient.`;
          
          if (!marginCall.optionId) {
            throw new Error(`Margin call ${marginCall.id} is missing optionId`);
          }
          const result = await storage.forceSettleOption(
            marginCall.optionId,
            "system",
            reason
          );

          try {
            const subject = `Cropto: Option force-settled (${result.option.title})`;
            const body = [
              `Option was force-settled due to expired margin call deadline.`,
              ``,
              `Option ID: ${result.option.id}`,
              `Status: ${result.option.status}`,
              `Reason: ${reason}`,
            ].join("\n");
            await sendEmailIfEnabled(result.option.issuerId, "tradeStatus", subject, body);
            await sendEmailIfEnabled(result.option.buyerId, "tradeStatus", subject, body);
            await sendEmailIfEnabled(result.option.issuerId, "system", subject, body);
            await sendEmailIfEnabled(result.option.buyerId, "system", subject, body);
          } catch (emailError) {
            console.error("[TradeStatus] Failed to send deadline force-settle emails:", emailError);
          }
          
          // Update margin call status to LIQUIDATED
          await storage.updateMarginCall(marginCall.id, {
            status: "LIQUIDATED",
          });
          
          processedOptions.push({
            optionId: marginCall.optionId,
            marginCallId: marginCall.id,
            status: result.option.status,
            transactionId: result.transaction.id,
          });
        } catch (error: any) {
          console.error(`Error processing margin call ${marginCall.id}:`, error);
          errors.push({
            marginCallId: marginCall.id,
            optionId: marginCall.optionId,
            error: error.message,
          });
        }
      }
      
      res.json({
        processedCount: processedOptions.length,
        expiredMarginCalls: expiredMarginCalls.length,
        processedOptions,
        errors,
      });
    } catch (error: any) {
      console.error("Error processing deadlines:", error);
      res.status(500).json({ error: error.message || "Failed to process deadlines" });
    }
  });

  // POST /api/jobs/process-overdue-margincalls - Process expired margin calls with settlements (broker only)
  app.post("/api/jobs/process-overdue-margincalls", authenticateToken, async (req: AuthRequest, res) => {
    try {
      // Only brokers can process overdue margin calls
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Only brokers can process overdue margin calls" });
      }
      
      // Get expired margin calls (deadline < now, status PENDING)
      const expiredMarginCalls = await storage.getExpiredMarginCalls();
      
      const processedOptions: any[] = [];
      const errors: any[] = [];
      
      console.log(`Processing ${expiredMarginCalls.length} overdue margin calls...`);
      
      // Process each expired margin call
      for (const marginCall of expiredMarginCalls) {
        try {
          if (!marginCall.optionId) {
            throw new Error(`Margin call ${marginCall.id} is missing optionId`);
          }
          // Get the option
          const option = await storage.getOptionById(marginCall.optionId);
          if (!option) {
            throw new Error("Option not found");
          }
          
          // Calculate intrinsic value payout, accounting for collateral
          const intrinsicValue = parseFloat(option.lastIntrinsic || "0");
          const collateral = parseFloat(option.collateralAmount || "0");
          const reservedCollateral = parseFloat(marginCall.reservedCollateral || "0");
          const totalAvailableCollateral = collateral + reservedCollateral;
          
          // Payout is intrinsic value minus what's covered by available collateral
          // If collateral is insufficient, the seller defaults and buyer gets max(intrinsic - collateral, 0)
          const netPayout = Math.max(0, intrinsicValue - totalAvailableCollateral);
          
          // Premium paid by buyer
          const qty = parseFloat(option.qty);
          const premiumPaid = parseFloat(option.premium) * qty;
          
          // Profit/Loss for buyer = payout - premium paid
          const profitLoss = netPayout - premiumPaid;
          
          // Create settlement record
          const [settlement] = await db
            .insert(settlements)
            .values({
              optionId: option.id,
              exercisedBy: "system",
              spotPrice: "0", // System settlement, no spot price
              strike: option.strike,
              qty: option.qty,
              payout: netPayout.toFixed(8),
              profitLoss: profitLoss.toFixed(8),
            })
            .returning();
          
          // Update option status to DEFAULTED
          await db
            .update(options)
            .set({ status: "DEFAULTED" })
            .where(eq(options.id, option.id));
          
          // Update margin call status to LIQUIDATED
          await storage.updateMarginCall(marginCall.id, {
            status: "LIQUIDATED",
          });
          
          // Create transaction record for audit
          const transaction = await storage.createTransaction({
            optionId: option.id,
            type: "FORCE_SETTLE",
            fromUserId: option.issuerId || option.seller || null,
            toUserId: option.buyerId || option.buyer,
            amount: netPayout.toFixed(8),
            description: `Overdue margin call liquidated. Deadline: ${marginCall.deadline?.toISOString() || 'unknown'}. Collateral: ${totalAvailableCollateral.toFixed(2)}, Intrinsic: ${intrinsicValue.toFixed(2)}`,
          });
          
          // Create notifications
          if (option.buyerId) {
            await storage.createNotification({
              userId: option.buyerId,
              type: "LIQUIDATION",
              message: `Option ${option.title} was liquidated due to overdue margin call. Net payout: ${netPayout.toFixed(2)}`,
              relatedId: option.id,
            });
          }
          
          const responsibleUserId = option.issuerId || option.seller;
          if (responsibleUserId && responsibleUserId !== option.buyerId) {
            await storage.createNotification({
              userId: responsibleUserId,
              type: "LIQUIDATION",
              message: `Option ${option.title} was liquidated due to overdue margin call. Collateral ${totalAvailableCollateral.toFixed(2)} applied.`,
              relatedId: option.id,
            });
          }

          try {
            const subject = `Cropto: Liquidation (${option.title})`;
            const body = [
              `Option was liquidated due to overdue margin call.`,
              ``,
              `Option ID: ${option.id}`,
              `Status: DEFAULTED`,
              `Net payout: ${netPayout.toFixed(2)}`,
              `Collateral applied: ${totalAvailableCollateral.toFixed(2)}`,
            ].join("\n");
            await sendEmailIfEnabled(option.buyerId, "tradeStatus", subject, body);
            await sendEmailIfEnabled(responsibleUserId, "tradeStatus", subject, body);
            await sendEmailIfEnabled(option.buyerId, "system", subject, body);
            await sendEmailIfEnabled(responsibleUserId, "system", subject, body);
          } catch (emailError) {
            console.error("[TradeStatus] Failed to send liquidation emails:", emailError);
          }
          
          processedOptions.push({
            optionId: marginCall.optionId,
            marginCallId: marginCall.id,
            status: "DEFAULTED",
            settlementId: settlement.id,
            transactionId: transaction.id,
            payout: netPayout.toFixed(8),
            collateralApplied: totalAvailableCollateral.toFixed(8),
            intrinsicValue: intrinsicValue.toFixed(8),
          });
          
          console.log(`✅ Processed overdue margin call ${marginCall.id} for option ${option.title}`);
        } catch (error: any) {
          console.error(`Error processing margin call ${marginCall.id}:`, error);
          errors.push({
            marginCallId: marginCall.id,
            optionId: marginCall.optionId,
            error: error.message,
          });
        }
      }
      
      res.json({
        processedCount: processedOptions.length,
        expiredMarginCalls: expiredMarginCalls.length,
        processedOptions,
        errors,
      });
    } catch (error: any) {
      console.error("Error processing overdue margin calls:", error);
      res.status(500).json({ error: error.message || "Failed to process overdue margin calls" });
    }
  });

  // Admin Reconciliation endpoints
  app.get("/api/admin/reconciliation/transactions", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }
      
      const transactions = await storage.listTransactions();
      res.json(transactions);
    } catch (error: any) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({ error: error.message || "Failed to fetch transactions" });
    }
  });

  app.get("/api/admin/reconciliation/settlements", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }
      
      const settlements = await storage.listSettlements();
      res.json(settlements);
    } catch (error: any) {
      console.error("Error fetching settlements:", error);
      res.status(500).json({ error: error.message || "Failed to fetch settlements" });
    }
  });

  app.get("/api/admin/reconciliation/margincalls", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }
      
      const marginCalls = await storage.listMarginCalls();
      res.json(marginCalls);
    } catch (error: any) {
      console.error("Error fetching margin calls:", error);
      res.status(500).json({ error: error.message || "Failed to fetch margin calls" });
    }
  });

  // GET /api/admin/fees - Get platform fees summary
  app.get("/api/admin/fees", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }
      
      const toRaw = typeof req.query.to === "string" ? req.query.to : undefined;
      const fromRaw = typeof req.query.from === "string" ? req.query.from : undefined;

      const now = new Date();
      const to = toRaw ? new Date(toRaw) : now;
      const from = fromRaw ? new Date(fromRaw) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

      const validTo = Number.isFinite(to.getTime()) ? to : now;
      const validFrom = Number.isFinite(from.getTime())
        ? from
        : new Date(validTo.getTime() - 30 * 24 * 60 * 60 * 1000);

      const allFees = await db
        .select()
        .from(platformFees)
        .where(and(gte(platformFees.createdAt, validFrom), lte(platformFees.createdAt, validTo)));
      const partners = await storage.getPartnerOrganizations();

      const totals = {
        totalFees: 0,
        byType: {} as Record<string, number>,
        byRole: {} as Record<string, number>,
        byInstrument: {} as Record<string, number>,
      };

      const seriesByDay = new Map<string, { total: number; OPTION: number; FORWARD: number }>();

      for (const fee of allFees) {
        const amount = parseFloat(fee.amount);
        if (!Number.isFinite(amount)) continue;
        totals.totalFees += amount;

        const type = fee.type || "unknown";
        totals.byType[type] = (totals.byType[type] || 0) + amount;

        const role = fee.role || "unknown";
        totals.byRole[role] = (totals.byRole[role] || 0) + amount;

        const instrumentTypeRaw = (fee as any).instrumentType || "OPTION";
        const instrumentType = String(instrumentTypeRaw).toUpperCase() === "FORWARD" ? "FORWARD" : "OPTION";
        totals.byInstrument[instrumentType] = (totals.byInstrument[instrumentType] || 0) + amount;

        const dayKey = new Date(fee.createdAt).toISOString().slice(0, 10);
        const existing = seriesByDay.get(dayKey) || { total: 0, OPTION: 0, FORWARD: 0 };
        existing.total += amount;
        existing[instrumentType] += amount;
        seriesByDay.set(dayKey, existing);
      }

      // Partner fee sharing (reporting only)
      const partnerShares = partners.map((p) => {
        const sharePct = parseFloat((p as any).feeSharePercent || "0");
        const clampedPct = Number.isFinite(sharePct) ? Math.min(100, Math.max(0, sharePct)) : 0;
        const partnerShare = (totals.totalFees * clampedPct) / 100;
        return {
          id: p.id,
          name: p.name,
          feeSharePercent: clampedPct,
          partnerShare,
        };
      });

      const totalPartnerShare = partnerShares.reduce((sum, p) => sum + p.partnerShare, 0);
      const platformShare = Math.max(0, totals.totalFees - totalPartnerShare);

      const round2 = (n: number) => Math.round(n * 100) / 100;
      const byInstrument = {
        OPTION: round2(totals.byInstrument["OPTION"] || 0),
        FORWARD: round2(totals.byInstrument["FORWARD"] || 0),
      };

      const byType = Object.fromEntries(
        Object.entries(totals.byType).map(([k, v]) => [k, round2(v)])
      ) as Record<string, number>;

      const byRole = Object.fromEntries(
        Object.entries(totals.byRole).map(([k, v]) => [k, round2(v)])
      ) as Record<string, number>;

      const series = Array.from(seriesByDay.entries())
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([date, v]) => ({
          date,
          totalFees: round2(v.total),
          byInstrument: {
            OPTION: round2(v.OPTION),
            FORWARD: round2(v.FORWARD),
          },
        }));

      res.json({
        totalFees: round2(totals.totalFees),
        byInstrument,
        byType,
        byRole,
        period: {
          from: validFrom.toISOString(),
          to: validTo.toISOString(),
        },
        // Optional time series for charts (daily)
        series,
        // Revenue share model (NOT an attribution model; attribution needs fee->partner mapping)
        // TODO: if platformFees gets partnerId/orgId, replace this with real attribution.
        platformShare: round2(platformShare),
        partnerShares: partnerShares.map((p) => ({
          ...p,
          partnerShare: round2(p.partnerShare),
        })),
      });
    } catch (error: any) {
      console.error("Error fetching platform fees:", error);
      res.status(500).json({ error: error.message || "Failed to fetch platform fees" });
    }
  });

  type AuditInstrumentFilter = "spot" | "options" | "forward" | "all";
  type AuditEntityFilter = "trades" | "settlements" | "marginCalls" | "fees" | "all";
  type AuditInstrumentType = "SPOT" | "OPTION" | "FORWARD";
  type AuditRecord = {
    timestamp: string;
    type: string;
    instrumentType: AuditInstrumentType;
    userIds: string[];
    price?: number;
    qty?: number;
    fee?: number;
    status?: string;
    entityId?: string;
    details?: Record<string, any>;
  };

  function parseDateOrNull(v: unknown) {
    if (typeof v !== "string") return null;
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  function csvEscape(value: unknown) {
    const s = value === null || value === undefined ? "" : String(value);
    const escaped = s.replace(/"/g, '""');
    return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
  }

  function toNum(v: unknown): number | undefined {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(n) ? n : undefined;
  }

  async function buildAuditRecords(params: {
    from: Date;
    to: Date;
    instrument: AuditInstrumentFilter;
    entity: AuditEntityFilter;
    limit: number;
  }): Promise<AuditRecord[]> {
    const { from, to, instrument, entity, limit } = params;
    const records: AuditRecord[] = [];

    const includeEntity = (e: Exclude<AuditEntityFilter, "all">) => entity === "all" || entity === e;
    const includeInstrument = (i: AuditInstrumentFilter) => instrument === "all" || instrument === i;

    // OPTIONS trades
    if (includeEntity("trades") && includeInstrument("options")) {
      const optionTrades = await db
        .select()
        .from(trades)
        .where(and(gte(trades.createdAt, from), lte(trades.createdAt, to)))
        .orderBy(desc(trades.createdAt))
        .limit(limit);

      for (const t of optionTrades) {
        records.push({
          timestamp: new Date(t.createdAt).toISOString(),
          type: "trade",
          instrumentType: "OPTION",
          userIds: [t.buyer, t.seller].filter(Boolean),
          price: toNum(t.strike),
          qty: toNum(t.qty),
          status: "FILLED",
          entityId: t.id,
          details: {
            optionId: t.optionId,
            premium: toNum(t.premium),
            totalValue: toNum(t.totalValue),
          },
        });
      }
    }

    // FORWARD contracts (treated as trades)
    if (includeEntity("trades") && includeInstrument("forward")) {
      const fwContracts = await db
        .select()
        .from(forwardContracts)
        .where(and(gte(forwardContracts.createdAt, from), lte(forwardContracts.createdAt, to)))
        .orderBy(desc(forwardContracts.createdAt))
        .limit(limit);

      for (const c of fwContracts) {
        records.push({
          timestamp: new Date(c.createdAt).toISOString(),
          type: "trade",
          instrumentType: "FORWARD",
          userIds: [c.longUserId || "", c.shortUserId || ""].filter(Boolean),
          price: toNum(c.contractPrice),
          qty: toNum(c.qtyTon),
          status: c.status,
          entityId: c.id,
          details: {
            commodity: c.commodity,
            window: c.window,
            settlementDate: c.settlementDate ? new Date(c.settlementDate).toISOString() : null,
          },
        });
      }
    }

    // OPTIONS settlements
    if (includeEntity("settlements") && includeInstrument("options")) {
      const optionSettlements = await db
        .select()
        .from(settlements)
        .where(and(gte(settlements.createdAt, from), lte(settlements.createdAt, to)))
        .orderBy(desc(settlements.createdAt))
        .limit(limit);

      for (const s of optionSettlements) {
        records.push({
          timestamp: new Date(s.createdAt).toISOString(),
          type: "settlement",
          instrumentType: "OPTION",
          userIds: [s.exercisedBy].filter(Boolean),
          price: toNum(s.spotPrice),
          qty: toNum(s.qty),
          status: "SETTLED",
          entityId: s.id,
          details: {
            optionId: s.optionId,
            strike: toNum(s.strike),
            payout: toNum(s.payout),
            profitLoss: toNum(s.profitLoss),
          },
        });
      }
    }

    // FORWARD settlements (join to contract to get user ids)
    if (includeEntity("settlements") && includeInstrument("forward")) {
      const fwSettles = await db
        .select({
          s: forwardSettlements,
          c: forwardContracts,
        })
        .from(forwardSettlements)
        .leftJoin(forwardContracts, eq(forwardSettlements.forwardContractId, forwardContracts.id))
        .where(and(gte(forwardSettlements.createdAt, from), lte(forwardSettlements.createdAt, to)))
        .orderBy(desc(forwardSettlements.createdAt))
        .limit(limit);

      for (const row of fwSettles) {
        records.push({
          timestamp: new Date(row.s.createdAt).toISOString(),
          type: "settlement",
          instrumentType: "FORWARD",
          userIds: [row.c?.longUserId || "", row.c?.shortUserId || ""].filter(Boolean),
          price: toNum(row.s.settlementPrice),
          qty: toNum(row.s.qtyTon),
          status: "SETTLED",
          entityId: row.s.id,
          fee: toNum(row.s.feesTotal),
          details: {
            forwardContractId: row.s.forwardContractId,
            contractPrice: toNum(row.s.contractPrice),
            pnlLong: toNum(row.s.pnlLong),
            pnlShort: toNum(row.s.pnlShort),
            commodity: row.c?.commodity || null,
            window: row.c?.window || null,
          },
        });
      }
    }

    // Margin calls (option + forward)
    if (includeEntity("marginCalls")) {
      const mcRows = await db
        .select()
        .from(marginCalls)
        .where(and(gte(marginCalls.createdAt, from), lte(marginCalls.createdAt, to)))
        .orderBy(desc(marginCalls.createdAt))
        .limit(limit);

      for (const mc of mcRows) {
        const inst = (mc.instrumentType || "OPTION") === "FORWARD" ? "FORWARD" : "OPTION";
        if (inst === "OPTION" && !includeInstrument("options")) continue;
        if (inst === "FORWARD" && !includeInstrument("forward")) continue;
        records.push({
          timestamp: new Date(mc.createdAt).toISOString(),
          type: "margin_call",
          instrumentType: inst,
          userIds: [mc.userId].filter(Boolean),
          fee: undefined,
          status: mc.status,
          entityId: mc.id,
          details: {
            optionId: mc.optionId,
            forwardContractId: mc.forwardContractId,
            amountRequired: toNum(mc.amountRequired),
            collateralAmount: toNum(mc.collateralAmount),
            reservedCollateral: toNum(mc.reservedCollateral),
            intrinsicValue: toNum(mc.intrinsicValue),
            deadline: mc.deadline ? new Date(mc.deadline).toISOString() : null,
          },
        });
      }
    }

    // Platform fees
    if (includeEntity("fees")) {
      const feeRows = await db
        .select()
        .from(platformFees)
        .where(and(gte(platformFees.createdAt, from), lte(platformFees.createdAt, to)))
        .orderBy(desc(platformFees.createdAt))
        .limit(limit);

      for (const f of feeRows) {
        const inst = (f.instrumentType || "OPTION") === "FORWARD" ? "FORWARD" : "OPTION";
        if (inst === "OPTION" && !includeInstrument("options")) continue;
        if (inst === "FORWARD" && !includeInstrument("forward")) continue;
        records.push({
          timestamp: new Date(f.createdAt).toISOString(),
          type: "fee",
          instrumentType: inst,
          userIds: [f.userId].filter(Boolean),
          fee: toNum(f.amount),
          status: f.type,
          entityId: f.id,
          details: {
            feeType: f.type,
            role: f.role || null,
            notionalAmount: toNum(f.notionalAmount),
            currency: f.currency,
            instrument: f.instrument || null,
            txId: f.txId || null,
          },
        });
      }
    }

    // TODO: SPOT audit (trades/settlements/fees) once spot trades are modeled (currently only spot_positions exist).

    records.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
    return records.slice(0, limit);
  }

  // GET /api/admin/audit - Unified audit feed
  app.get("/api/admin/audit", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }

      const from = parseDateOrNull(req.query.from) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const to = parseDateOrNull(req.query.to) || new Date();
      const instrument = (typeof req.query.instrument === "string" ? req.query.instrument : "all") as AuditInstrumentFilter;
      const entity = (typeof req.query.entity === "string" ? req.query.entity : "all") as AuditEntityFilter;
      const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 500;
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(5000, Math.floor(limitRaw))) : 500;

      const safeInstrument: AuditInstrumentFilter = ["spot", "options", "forward", "all"].includes(instrument)
        ? instrument
        : "all";
      const safeEntity: AuditEntityFilter = ["trades", "settlements", "marginCalls", "fees", "all"].includes(entity)
        ? entity
        : "all";

      const records = await buildAuditRecords({ from, to, instrument: safeInstrument, entity: safeEntity, limit });

      res.json(records);
    } catch (error: any) {
      console.error("Error fetching audit records:", error);
      res.status(500).json({ error: error.message || "Failed to fetch audit records" });
    }
  });

  // GET /api/admin/audit/export - CSV export
  app.get("/api/admin/audit/export", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }

      const from = parseDateOrNull(req.query.from) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const to = parseDateOrNull(req.query.to) || new Date();
      const instrument = (typeof req.query.instrument === "string" ? req.query.instrument : "all") as AuditInstrumentFilter;
      const entity = (typeof req.query.entity === "string" ? req.query.entity : "all") as AuditEntityFilter;
      const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 5000;
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(20000, Math.floor(limitRaw))) : 5000;

      const safeInstrument: AuditInstrumentFilter = ["spot", "options", "forward", "all"].includes(instrument)
        ? instrument
        : "all";
      const safeEntity: AuditEntityFilter = ["trades", "settlements", "marginCalls", "fees", "all"].includes(entity)
        ? entity
        : "all";

      const records = await buildAuditRecords({ from, to, instrument: safeInstrument, entity: safeEntity, limit });

      const headers = ["timestamp", "instrument", "action", "user", "details"].join(",") + "\n";
      const rows = records
        .map((r) => {
          const user = r.userIds.length ? r.userIds.join(";") : "";
          const details = JSON.stringify({
            price: r.price,
            qty: r.qty,
            fee: r.fee,
            status: r.status,
            ...(r.details || {}),
          });
          return [
            csvEscape(r.timestamp),
            csvEscape(r.instrumentType),
            csvEscape(r.type),
            csvEscape(user),
            csvEscape(details),
          ].join(",");
        })
        .join("\n");

      const filename = `audit_${safeEntity}_${safeInstrument}_${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(headers + rows + (rows.length ? "\n" : ""));
    } catch (error: any) {
      console.error("Error exporting audit CSV:", error);
      res.status(500).json({ error: error.message || "Failed to export audit CSV" });
    }
  });

  // GET /api/admin/waitlist/summary - Aggregated waitlist stats
  app.get("/api/admin/waitlist/summary", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }

      const coerceCount = (v: unknown) => {
        if (typeof v === "number") return v;
        if (typeof v === "string") {
          const n = Number(v);
          return Number.isFinite(n) ? n : 0;
        }
        return 0;
      };

      const total = await db.select({ count: sql<number>`count(*)` }).from(waitlistSignups);

      const verified = await db
        .select({ count: sql<number>`count(*)` })
        .from(waitlistSignups)
        .where(sql`${waitlistSignups.verifiedAt} IS NOT NULL`);

      const byRole = await db
        .select({
          role: waitlistSignups.role,
          count: sql<number>`count(*)`,
        })
        .from(waitlistSignups)
        .groupBy(waitlistSignups.role);

      const byCountry = await db
        .select({
          country: waitlistSignups.country,
          count: sql<number>`count(*)`,
        })
        .from(waitlistSignups)
        .groupBy(waitlistSignups.country);

      res.json({
        total: coerceCount(total[0]?.count ?? 0),
        verified: coerceCount(verified[0]?.count ?? 0),
        byRole: byRole.map((r) => ({ ...r, count: coerceCount(r.count) })),
        byCountry: byCountry.map((r) => ({ ...r, count: coerceCount(r.count) })),
      });
    } catch (error: any) {
      console.error("Error fetching waitlist summary:", error);
      res.status(500).json({ error: error.message || "Failed to fetch waitlist summary" });
    }
  });

  // GET /api/admin/waitlist - Waitlist list with pagination/filtering/sorting
  app.get("/api/admin/waitlist", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }

      const {
        page = "1",
        pageSize = "50",
        sortBy = "createdAt",
        sortDir = "desc",
        role,
        country,
        verified,
        q,
      } = req.query as Record<string, string>;

      const pageNum = Math.max(parseInt(page) || 1, 1);
      const sizeNum = Math.min(Math.max(parseInt(pageSize) || 50, 10), 200);

      const sortableColumns: Record<string, any> = {
        createdAt: waitlistSignups.createdAt,
        country: waitlistSignups.country,
        role: waitlistSignups.role,
        name: waitlistSignups.name,
      };

      const sortColumn = sortableColumns[sortBy] || waitlistSignups.createdAt;
      const direction = sortDir === "asc" ? "asc" : "desc";

      const conditions: any[] = [];

      if (role) {
        conditions.push(eq(waitlistSignups.role, role));
      }

      if (country) {
        const c = country.trim();
        if (c) {
          conditions.push(sql`${waitlistSignups.country} ILIKE ${"%" + c + "%"}`);
        }
      }

      if (verified === "true") {
        conditions.push(sql`${waitlistSignups.verifiedAt} IS NOT NULL`);
      } else if (verified === "false") {
        conditions.push(sql`${waitlistSignups.verifiedAt} IS NULL`);
      }

      if (q) {
        const query = q.trim();
        if (query) {
          const pattern = "%" + query + "%";
          conditions.push(
            sql`${waitlistSignups.name} ILIKE ${pattern}
              OR ${waitlistSignups.email} ILIKE ${pattern}
              OR ${waitlistSignups.company} ILIKE ${pattern}`
          );
        }
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      let baseQuery = db.select().from(waitlistSignups);
      if (whereClause) {
        baseQuery = baseQuery.where(whereClause) as any;
      }

      const rows = await baseQuery
        .orderBy(direction === "asc" ? asc(sortColumn) : desc(sortColumn))
        .limit(sizeNum)
        .offset((pageNum - 1) * sizeNum);

      let totalCountQuery = db.select({ count: sql<number>`count(*)` }).from(waitlistSignups);
      if (whereClause) {
        totalCountQuery = totalCountQuery.where(whereClause) as any;
      }
      const totalRows = await totalCountQuery;

      const totalCountRaw = totalRows[0]?.count ?? 0;
      const totalCount =
        typeof totalCountRaw === "number"
          ? totalCountRaw
          : typeof totalCountRaw === "string"
            ? Number(totalCountRaw) || 0
            : 0;

      res.json({
        items: rows,
        page: pageNum,
        pageSize: sizeNum,
        total: totalCount,
      });
    } catch (error: any) {
      console.error("Error fetching waitlist list:", error);
      res.status(500).json({ error: error.message || "Failed to fetch waitlist list" });
    }
  });

  // Feedback endpoints
  app.post("/api/analytics/events", async (req, res) => {
    try {
      const parsed = insertAnalyticsEventSchema.safeParse({
        eventName: req.body?.eventName,
        userId: req.body?.userId,
        sessionId: req.body?.sessionId,
        payload: req.body?.payload ? JSON.stringify(req.body.payload) : undefined,
      });
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid analytics payload" });
      }

      const userAgent = req.headers["user-agent"] || "";
      const referer = req.headers["referer"] || req.headers["referrer"] || "";
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "";
      const enrichedPayload = {
        ...(req.body?.payload || {}),
        userAgent,
        referer,
        ip,
      };

      const eventPayload = {
        ...parsed.data,
        payload: JSON.stringify(enrichedPayload),
      };

      await storage.createAnalyticsEvent(eventPayload);
      res.status(201).json({ ok: true });
    } catch (error: any) {
      console.error("Error creating analytics event:", error);
      res.status(500).json({ error: "Failed to record analytics event" });
    }
  });

  app.get("/api/admin/settings/feedback-emails", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await findUserById(req.user!.id);
      if (!hasBrokerPermissions(user?.role)) {
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }

      const setting = await storage.getAppSetting("feedback_alert_emails");
      res.json({ emails: setting?.value || "" });
    } catch (error: any) {
      console.error("Error fetching feedback email settings:", error);
      res.status(500).json({ error: error.message || "Failed to fetch feedback email settings" });
    }
  });

  app.post("/api/admin/settings/feedback-emails", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await findUserById(req.user!.id);
      if (!hasBrokerPermissions(user?.role)) {
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }

      const parsed = z.object({ emails: z.string().max(2000) }).safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid email settings payload" });
      }

      await storage.upsertAppSetting("feedback_alert_emails", parsed.data.emails);
      res.json({ ok: true });
    } catch (error: any) {
      console.error("Error saving feedback email settings:", error);
      res.status(500).json({ error: error.message || "Failed to save feedback email settings" });
    }
  });

  app.get("/api/admin/settings/index-update-mailing-mode", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await findUserById(req.user!.id);
      if (!hasBrokerPermissions(user?.role)) {
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }

      const mode = await getIndexUpdateMailingMode();
      res.json({ mode });
    } catch (error: any) {
      console.error("Error fetching index update mailing mode:", error);
      res.status(500).json({ error: error.message || "Failed to fetch index update mailing mode" });
    }
  });

  app.post("/api/admin/settings/index-update-mailing-mode", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await findUserById(req.user!.id);
      if (!hasBrokerPermissions(user?.role)) {
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }

      const parsed = z.object({ mode: z.enum(["manual", "auto"]) }).safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid mailing mode payload" });
      }

      await storage.upsertAppSetting(INDEX_UPDATE_MAILING_MODE_KEY, parsed.data.mode);
      res.json({ ok: true, mode: parsed.data.mode });
    } catch (error: any) {
      console.error("Error saving index update mailing mode:", error);
      res.status(500).json({ error: error.message || "Failed to save index update mailing mode" });
    }
  });

  app.get("/api/admin/parsers/health", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await findUserById(req.user!.id);
      if (!hasBrokerPermissions(user?.role)) {
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }

      const getSettingValue = async (key: string) => (await storage.getAppSetting(key))?.value || null;
      const toIsoOrNull = (value: string | null) => {
        if (!value) return null;
        const dt = new Date(value);
        return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
      };
      const toIntOrNull = (value: string | null) => {
        if (!value) return null;
        const n = Number.parseInt(value, 10);
        return Number.isFinite(n) ? n : null;
      };
      const statusByAge = (asOf: Date | null): "fresh" | "stale" | "no_recent" => {
        if (!asOf || Number.isNaN(asOf.getTime())) return "no_recent";
        const ageDays = Math.floor((Date.now() - asOf.getTime()) / (1000 * 60 * 60 * 24));
        if (ageDays <= 2) return "fresh";
        if (ageDays <= 7) return "stale";
        return "no_recent";
      };

      const rows = await db
        .select()
        .from(indexPrices)
        .where(
          or(
            eq(indexPrices.source, "IGC"),
            eq(indexPrices.source, "USDA_AMS"),
            eq(indexPrices.source, "BARCHART_USDA"),
            eq(indexPrices.source, "FUTURES_PROXY"),
            eq(indexPrices.source, "CLAL"),
            eq(indexPrices.source, "CLAL"),
            eq(indexPrices.source, "GRAINSPRICES"),
            eq(indexPrices.source, "FSGRAIN"),
            eq(indexPrices.source, "BCR"),
            eq(indexPrices.source, "COMMODITY3")
          )
        )
        .orderBy(desc(indexPrices.date))
        .limit(5000);

      const bySourceCountry = new Map<
        string,
        { source: string; country: string; latestAsOf: Date | null; rows24h: number; totalRows: number }
      >();
      const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;

      for (const row of rows) {
        const source = String(row.source || "");
        const country = String(row.country || "N/A");
        const key = `${source}:${country}`;
        const asOfRaw = row.asOfDate ? new Date(row.asOfDate as any) : new Date(row.date);
        const asOf = Number.isNaN(asOfRaw.getTime()) ? null : asOfRaw;
        const existing = bySourceCountry.get(key) || {
          source,
          country,
          latestAsOf: null as Date | null,
          rows24h: 0,
          totalRows: 0,
        };
        existing.totalRows += 1;
        if (asOf && asOf.getTime() >= twentyFourHoursAgo) existing.rows24h += 1;
        if (!existing.latestAsOf || (asOf && asOf > existing.latestAsOf)) {
          existing.latestAsOf = asOf;
        }
        bySourceCountry.set(key, existing);
      }

      const igcLastFetchAt = toIsoOrNull(await getSettingValue("parser_health_igc_last_fetch_at"));
      const igcLastSuccessAt = toIsoOrNull(await getSettingValue("parser_health_igc_last_success_at"));
      const igcLastRows = toIntOrNull(await getSettingValue("parser_health_igc_last_rows"));
      const igcLastError = await getSettingValue("parser_health_igc_last_error");
      const igcLastErrorAt = toIsoOrNull(await getSettingValue("parser_health_igc_last_error_at"));

      const usdaLastFetchAt = toIsoOrNull(await getSettingValue("parser_health_usda_ams_last_fetch_at"));
      const usdaLastSuccessAt = toIsoOrNull(await getSettingValue("parser_health_usda_ams_last_success_at"));
      const usdaLastRows = toIntOrNull(await getSettingValue("parser_health_usda_ams_last_rows"));
      const usdaLastError = await getSettingValue("parser_health_usda_ams_last_error");
      const usdaLastErrorAt = toIsoOrNull(await getSettingValue("parser_health_usda_ams_last_error_at"));

      let usdaLastPublishedDate: string | null = null;
      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 4000);
        const marsUrl =
          process.env.USDA_AMS_MARS_LIST_URL ||
          "https://marsapi.ams.usda.gov/services/v1.1/public/listPublishedReports/all";
        const response = await fetch(marsUrl, {
          headers: { accept: "application/json,*/*;q=0.8", "user-agent": "CroptoBot/1.0" },
          signal: ctrl.signal,
        });
        clearTimeout(timeout);
        if (response.ok) {
          const body = await response.text();
          const dates = body.match(/\b\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?)?/g) || [];
          const parsed = dates
            .map((d) => new Date(d))
            .filter((d) => !Number.isNaN(d.getTime()))
            .sort((a, b) => b.getTime() - a.getTime());
          if (parsed.length > 0) usdaLastPublishedDate = parsed[0].toISOString();
        }
      } catch {
        // ignore network errors for health endpoint
      }

      const countries = Array.from(bySourceCountry.values()).map((item) => ({
        source: item.source,
        country: item.country,
        latestAsOf: item.latestAsOf ? item.latestAsOf.toISOString() : null,
        rows24h: item.rows24h,
        totalRows: item.totalRows,
        status: statusByAge(item.latestAsOf),
      }));

      const sourceLatest = (source: "IGC" | "USDA_AMS" | "BARCHART_USDA" | "FUTURES_PROXY") => {
        const sourceRows = countries.filter((c) => c.source === source);
        const latest = sourceRows
          .map((c) => (c.latestAsOf ? new Date(c.latestAsOf) : null))
          .filter((d): d is Date => !!d && !Number.isNaN(d.getTime()))
          .sort((a, b) => b.getTime() - a.getTime());
        return latest[0] || null;
      };

      const igcLatestAsOf = sourceLatest("IGC");
      const usdaLatestAsOf = sourceLatest("USDA_AMS");
      const barchartLatestAsOf = sourceLatest("BARCHART_USDA");
      const futuresProxyLatestAsOf = sourceLatest("FUTURES_PROXY");

      res.json({
        generatedAt: new Date().toISOString(),
        sources: {
          IGC: {
            enabled: process.env.ENABLE_IGC_POLLING === "true",
            disabledBySetting: ((await getSettingValue("parser_disabled_igc")) || "").toLowerCase() === "true",
            effectiveEnabled:
              process.env.ENABLE_IGC_POLLING === "true" &&
              ((await getSettingValue("parser_disabled_igc")) || "").toLowerCase() !== "true",
            lastFetchAt: igcLastFetchAt,
            lastSuccessAt: igcLastSuccessAt,
            lastRows: igcLastRows,
            lastError: igcLastError || null,
            lastErrorAt: igcLastErrorAt,
            latestAsOf: igcLatestAsOf ? igcLatestAsOf.toISOString() : null,
            status: statusByAge(igcLatestAsOf),
            consecutiveZeroRuns: toIntOrNull(await getSettingValue("parser_health_igc_consecutive_zero")),
          },
          USDA_AMS: {
            enabled: process.env.ENABLE_USDA_AMS_POLLING !== "false",
            disabledBySetting: ((await getSettingValue("parser_disabled_usda_ams")) || "").toLowerCase() === "true",
            effectiveEnabled:
              process.env.ENABLE_USDA_AMS_POLLING !== "false" &&
              ((await getSettingValue("parser_disabled_usda_ams")) || "").toLowerCase() !== "true",
            lastFetchAt: usdaLastFetchAt,
            lastSuccessAt: usdaLastSuccessAt,
            lastRows: usdaLastRows,
            lastError: usdaLastError || null,
            lastErrorAt: usdaLastErrorAt,
            lastPublishedDate: usdaLastPublishedDate,
            latestAsOf: usdaLatestAsOf ? usdaLatestAsOf.toISOString() : null,
            status: statusByAge(usdaLatestAsOf),
            consecutiveZeroRuns: toIntOrNull(await getSettingValue("parser_health_usda_ams_consecutive_zero")),
          },
          BARCHART_USDA: {
            enabled: process.env.ENABLE_BARCHART_USDA_POLLING !== "false",
            disabledBySetting:
              ((await getSettingValue("parser_disabled_barchart_usda")) || "").toLowerCase() === "true",
            effectiveEnabled:
              process.env.ENABLE_BARCHART_USDA_POLLING !== "false" &&
              ((await getSettingValue("parser_disabled_barchart_usda")) || "").toLowerCase() !== "true",
            lastFetchAt: toIsoOrNull(await getSettingValue("parser_health_barchart_usda_last_fetch_at")),
            lastSuccessAt: toIsoOrNull(await getSettingValue("parser_health_barchart_usda_last_success_at")),
            lastRows: toIntOrNull(await getSettingValue("parser_health_barchart_usda_last_rows")),
            lastError: await getSettingValue("parser_health_barchart_usda_last_error"),
            lastErrorAt: toIsoOrNull(await getSettingValue("parser_health_barchart_usda_last_error_at")),
            latestAsOf: barchartLatestAsOf ? barchartLatestAsOf.toISOString() : null,
            status: statusByAge(barchartLatestAsOf),
            consecutiveZeroRuns: toIntOrNull(await getSettingValue("parser_health_barchart_usda_consecutive_zero")),
          },
          FUTURES_PROXY: {
            enabled: process.env.ENABLE_FUTURES_PROXY_POLLING !== "false",
            disabledBySetting:
              ((await getSettingValue("parser_disabled_futures_proxy")) || "").toLowerCase() === "true",
            effectiveEnabled:
              process.env.ENABLE_FUTURES_PROXY_POLLING !== "false" &&
              ((await getSettingValue("parser_disabled_futures_proxy")) || "").toLowerCase() !== "true",
            lastFetchAt: toIsoOrNull(await getSettingValue("parser_health_futures_proxy_last_fetch_at")),
            lastSuccessAt: toIsoOrNull(await getSettingValue("parser_health_futures_proxy_last_success_at")),
            lastRows: toIntOrNull(await getSettingValue("parser_health_futures_proxy_last_rows")),
            lastError: await getSettingValue("parser_health_futures_proxy_last_error"),
            lastErrorAt: toIsoOrNull(await getSettingValue("parser_health_futures_proxy_last_error_at")),
            latestAsOf: futuresProxyLatestAsOf ? futuresProxyLatestAsOf.toISOString() : null,
            status: statusByAge(futuresProxyLatestAsOf),
            consecutiveZeroRuns: toIntOrNull(await getSettingValue("parser_health_futures_proxy_consecutive_zero")),
          },
        },
        countries,
      });
    } catch (error: any) {
      console.error("Error fetching parser health:", error);
      res.status(500).json({ error: error.message || "Failed to fetch parser health" });
    }
  });

  app.post("/api/admin/parsers/source", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await findUserById(req.user!.id);
      if (!hasBrokerPermissions(user?.role)) {
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }

      const parsed = z
        .object({
          source: z.enum(["IGC", "USDA_AMS", "BARCHART_USDA", "FUTURES_PROXY"]),
          disabled: z.boolean(),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid payload" });
      }

      const key = `parser_disabled_${parsed.data.source.toLowerCase()}`;
      await storage.upsertAppSetting(key, parsed.data.disabled ? "true" : "false");
      await storage.writeAuditEvent({
        event: "parser_manual_toggle",
        userId: req.user!.id,
        metadata: { source: parsed.data.source, disabled: parsed.data.disabled },
      });
      res.json({ ok: true, source: parsed.data.source, disabled: parsed.data.disabled });
    } catch (error: any) {
      console.error("Error toggling parser source:", error);
      res.status(500).json({ error: error.message || "Failed to toggle parser source" });
    }
  });

  app.get("/api/admin/market-ingestion/status", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await findUserById(req.user!.id);
      if (!hasBrokerPermissions(user?.role)) {
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }

      const limitRaw = Number.parseInt(String(req.query?.limit || "50"), 10);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

      const statusRows = await db
        .select()
        .from(marketPriceSourceStatus)
        .orderBy(desc(marketPriceSourceStatus.updatedAt))
        .limit(limit);

      const fetchRows = await db
        .select()
        .from(marketPriceFetchLog)
        .orderBy(desc(marketPriceFetchLog.createdAt))
        .limit(limit);

      res.json({ statusRows, fetchRows });
    } catch (error: any) {
      console.error("Error fetching market ingestion status:", error);
      res.status(500).json({ error: error.message || "Failed to fetch market ingestion status" });
    }
  });

  app.get("/api/admin/market-ingestion/health", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await findUserById(req.user!.id);
      if (!hasBrokerPermissions(user?.role)) {
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }

      const statusRows = await db.select().from(marketPriceSourceStatus);
      const grouped = new Map<string, typeof statusRows>();
      for (const row of statusRows) {
        const key = row.market;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(row);
      }

      const latestUa = await db
        .select()
        .from(indexPrices)
        .where(eq(indexPrices.country, "UA"))
        .orderBy(desc(indexPrices.asOfDate), desc(indexPrices.date))
        .limit(1);

      const calcMarket = (rows: typeof statusRows) => {
        if (!rows || rows.length === 0) return { status: "FAIL", lastSuccessAt: null, reason: "no_source_rows", lastErrors: [] as string[] };
        const successRows = rows.filter((r) => r.lastSuccessAt);
        if (successRows.length === 0) {
          return {
            status: "FAIL",
            lastSuccessAt: null,
            reason: "no_success",
            lastErrors: rows.map((r) => r.lastError).filter(Boolean) as string[],
          };
        }
        const latest = successRows.sort((a, b) => new Date(b.lastSuccessAt!).getTime() - new Date(a.lastSuccessAt!).getTime())[0];
        const ageDays = Math.floor((Date.now() - new Date(latest.lastSuccessAt!).getTime()) / (1000 * 60 * 60 * 24));
        return {
          status: ageDays <= 1 ? "OK" : ageDays <= 3 ? "WARN" : "FAIL",
          lastSuccessAt: latest.lastSuccessAt,
          reason: ageDays <= 1 ? "recent_success" : ageDays <= 3 ? "stale_success" : "old_success",
          source: `${latest.provider}(${latest.channel || "HTML_PAGE"})`,
          lastErrors: rows.map((r) => r.lastError).filter(Boolean).slice(0, 10) as string[],
        };
      };

      const uaAsOf = latestUa[0]?.asOfDate || latestUa[0]?.date || null;
      const uaAge = uaAsOf ? Math.floor((Date.now() - new Date(uaAsOf).getTime()) / (1000 * 60 * 60 * 24)) : 999;
      const uaHealth = {
        status: uaAge <= 1 ? "OK" : uaAge <= 3 ? "WARN" : "FAIL",
        lastSuccessAt: uaAsOf ? new Date(uaAsOf).toISOString() : null,
        source: latestUa[0]?.source || "manual",
        reason: uaAsOf ? "latest_ua_index_price" : "no_ua_data",
        lastErrors: [] as string[],
      };

      res.json({
        generatedAt: new Date().toISOString(),
        markets: {
          UA: uaHealth,
          US: calcMarket(grouped.get("US") || []),
          AR: calcMarket(grouped.get("AR") || []),
          BR: calcMarket(grouped.get("BR") || []),
        },
      });
    } catch (error: any) {
      console.error("Error fetching market ingestion health:", error);
      res.status(500).json({ error: error.message || "Failed to fetch market ingestion health" });
    }
  });

  app.get("/api/admin/market-ingestion/runtime", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await findUserById(req.user!.id);
      if (!hasBrokerPermissions(user?.role)) {
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }
      const inProcessRuntime = getMarketIngestionRuntimeState();
      let persistedRuntime: Record<string, unknown> | null = null;
      try {
        const runtimeSetting = await db.execute(sql`
          select value
          from app_settings
          where key = 'market_ingestion_runtime'
          limit 1
        `);
        const raw = (runtimeSetting as any)?.rows?.[0]?.value;
        if (typeof raw === "string") {
          persistedRuntime = JSON.parse(raw);
        }
      } catch {
        persistedRuntime = null;
      }

      let dbConnected = true;
      try {
        await db.execute(sql`select 1 as ok`);
      } catch {
        dbConnected = false;
      }
      const tableRows = await db.execute(sql`
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_name in ('market_prices', 'market_price_fetch_log', 'market_price_source_status')
      `);
      const tableSet = new Set<string>(((tableRows as any)?.rows || []).map((r: any) => String(r.table_name)));
      const dbSchemaOk =
        tableSet.has("market_prices") &&
        tableSet.has("market_price_fetch_log") &&
        tableSet.has("market_price_source_status");

      const latestByMarket = dbSchemaOk
        ? await db.execute(sql`
            select
              market,
              count(*)::int as total_rows,
              count(*) filter (where fetched_at >= now() - interval '7 days')::int as rows_7d,
              max(as_of) as max_as_of,
              max(fetched_at) as max_fetched_at
            from market_prices
            where market in ('US', 'AR', 'BR')
            group by market
          `)
        : ({ rows: [] } as any);
      const derivedSchedulerRunning = (() => {
        const lastTick = String(
          (persistedRuntime?.lastRunAt as string) ||
            (persistedRuntime?.updatedAt as string) ||
            inProcessRuntime.lastRunAt ||
            ""
        );
        const ts = Date.parse(lastTick);
        if (!Number.isFinite(ts)) return false;
        const intervalMs = Math.max(1, inProcessRuntime.intervalHours) * 60 * 60 * 1000;
        return Date.now() - ts <= intervalMs * 2;
      })();
      const ingestionEnabled = process.env.ENABLE_MARKET_INGESTION !== "false";
      const disabledReason = !ingestionEnabled
        ? "ENABLE_MARKET_INGESTION=false"
        : !dbConnected
          ? "DATABASE_UNREACHABLE"
          : !dbSchemaOk
            ? "DB_SCHEMA_MISSING"
            : null;
      const latestFetch = await db
        .select()
        .from(marketPriceFetchLog)
        .orderBy(desc(marketPriceFetchLog.createdAt))
        .limit(20);

      res.json({
        generatedAt: new Date().toISOString(),
        ingestion: {
          ...inProcessRuntime,
          ...(persistedRuntime || {}),
          ingestionEnabled,
          schedulerRunning: derivedSchedulerRunning,
          disabledReason,
        },
        dbConnected,
        dbSchemaOk,
        latestByMarket: (latestByMarket as any)?.rows || [],
        env: {
          nodeEnv: process.env.NODE_ENV || "development",
          marketIngestionEnabled: ingestionEnabled,
          allowDemoData: process.env.ALLOW_DEMO_DATA === "1",
          disablePrimary: process.env.INGESTION_DISABLE_PRIMARY === "1",
          disabledVendors: (process.env.INGESTION_DISABLE_VENDOR || "")
            .split(",")
            .map((v) => v.trim().toUpperCase())
            .filter(Boolean),
        },
        lastFetchAttempts: latestFetch.map((row) => ({
          provider: row.provider,
          channel: row.channel,
          market: row.market,
          commodity: row.commodity,
          sourceLayer: row.sourceLayer,
          status: row.status,
          statusCode: row.statusCode,
          latencyMs: row.latencyMs,
          pointCount: row.pointCount,
          asOf: row.asOf ? new Date(row.asOf).toISOString() : null,
          createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
          error: row.error,
        })),
      });
    } catch (error: any) {
      console.error("Error fetching market ingestion runtime:", error);
      res.status(500).json({ error: error.message || "Failed to fetch market ingestion runtime" });
    }
  });

  app.get("/api/admin/market-ingestion/db-check", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await findUserById(req.user!.id);
      if (!hasBrokerPermissions(user?.role)) {
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }

      const tableNames = ["market_prices", "market_price_fetch_log", "market_price_source_status", "fx_rates"];
      const tableExists = new Map<string, boolean>();
      for (const table of tableNames) {
        const rows = await db.execute(sql`
          select exists (
            select 1
            from information_schema.tables
            where table_schema = 'public' and table_name = ${table}
          ) as exists
        `);
        const exists = Boolean((rows as any)?.rows?.[0]?.exists);
        tableExists.set(table, exists);
      }

      const counts = {
        marketPrices: tableExists.get("market_prices")
          ? Number((await db.execute(sql`select count(*)::int as c from market_prices`) as any)?.rows?.[0]?.c || 0)
          : 0,
        marketPriceFetchLog: tableExists.get("market_price_fetch_log")
          ? Number((await db.execute(sql`select count(*)::int as c from market_price_fetch_log`) as any)?.rows?.[0]?.c || 0)
          : 0,
        marketPriceSourceStatus: tableExists.get("market_price_source_status")
          ? Number((await db.execute(sql`select count(*)::int as c from market_price_source_status`) as any)?.rows?.[0]?.c || 0)
          : 0,
        fxRates: tableExists.get("fx_rates")
          ? Number((await db.execute(sql`select count(*)::int as c from fx_rates`) as any)?.rows?.[0]?.c || 0)
          : 0,
      };
      const marketSummary = tableExists.get("market_prices")
        ? (await db.execute(sql`
            select
              market,
              count(*)::int as count_rows,
              max(as_of) as max_as_of,
              max(fetched_at) as max_fetched_at,
              count(*) filter (where fetched_at >= now() - interval '7 days')::int as count_rows_7d
            from market_prices
            where market in ('US','AR','BR','UA')
            group by market
          `) as any)?.rows || []
        : [];

      const latestByMarket = tableExists.get("market_prices")
        ? (await db.execute(sql`
            select
              market,
              commodity,
              basis,
              max(as_of) as max_as_of,
              max(fetched_at) as max_fetched_at
            from market_prices
            group by market, commodity, basis
            order by max_fetched_at desc
            limit 100
          `) as any)?.rows || []
        : [];

      const recentFetch = tableExists.get("market_price_fetch_log")
        ? (await db.execute(sql`
            select
              provider,
              channel,
              market,
              commodity,
              source_layer,
              status,
              status_code,
              latency_ms,
              point_count,
              as_of,
              created_at,
              error
            from market_price_fetch_log
            order by created_at desc
            limit 20
          `) as any)?.rows || []
        : [];

      res.json({
        generatedAt: new Date().toISOString(),
        tables: Object.fromEntries(tableNames.map((name) => [name, tableExists.get(name) || false])),
        counts,
        marketSummary,
        latestByMarket,
        recentFetch,
        status:
          !tableExists.get("market_prices") || !tableExists.get("market_price_source_status")
            ? "migrations_missing"
            : counts.marketPrices === 0
              ? "db_empty"
              : "db_ok",
      });
    } catch (error: any) {
      console.error("Error fetching market ingestion db-check:", error);
      res.status(500).json({ error: error.message || "Failed to fetch market ingestion db-check" });
    }
  });

  app.get("/api/admin/market-ingestion/sample", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = req.user;
      if (!hasBrokerPermissions(user?.role)) {
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }

      const market = String(req.query.market || "").toUpperCase();
      const commodityRaw = String(req.query.commodity || "").toLowerCase();
      const canonicalCommodity = commodityRaw ? normalizeCanonicalCommodity(commodityRaw).commodity : "";
      const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit || "20"), 10) || 20, 1), 100);

      if (!["BR", "AR", "US", "UA"].includes(market)) {
        return res.status(400).json({ error: "market must be one of BR/AR/US/UA" });
      }
      if (!canonicalCommodity) {
        return res.status(400).json({ error: "commodity is required" });
      }

      const rows = await db
        .select()
        .from(marketPrices)
        .where(and(eq(marketPrices.market, market), eq(marketPrices.commodity, canonicalCommodity)))
        .orderBy(desc(marketPrices.fetchedAt))
        .limit(limit);

      const sample = rows.map((row) => {
        let rawMeta: Record<string, unknown> = {};
        try {
          rawMeta = row.rawMeta ? JSON.parse(row.rawMeta) : {};
        } catch {
          rawMeta = {};
        }
        const rawTextSnippet = String(rawMeta.rawTextSnippet || "").slice(0, 280);
        const invalidReason = typeof rawMeta.invalidReason === "string" ? rawMeta.invalidReason : null;
        return {
          asOf: row.asOf?.toISOString?.() || row.asOf || null,
          fetchedAt: row.fetchedAt?.toISOString?.() || row.fetchedAt || null,
          vendor: row.provider,
          channel: row.channel,
          rawPrice: row.priceRaw ? Number.parseFloat(String(row.priceRaw)) : null,
          rawCurrency: row.rawCurrency || null,
          rawUnit: row.rawUnit || null,
          rawTextSnippet: rawTextSnippet || null,
          priceUsdPerTon: row.priceUsdPerTon ? Number.parseFloat(String(row.priceUsdPerTon)) : null,
          conversionNotes: row.conversionNotes || null,
          needsReview: row.needsReview === "true",
          invalidReason,
        };
      });

      res.json({
        generatedAt: new Date().toISOString(),
        market,
        commodity: canonicalCommodity,
        count: sample.length,
        sample,
      });
    } catch (error: any) {
      console.error("Error fetching market ingestion sample:", error);
      res.status(500).json({ error: "Failed to fetch market ingestion sample" });
    }
  });

  app.post("/api/admin/market-ingestion/run-now", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await findUserById(req.user!.id);
      if (!hasBrokerPermissions(user?.role)) {
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }
      const marketRaw = String(req.query.market || "").toUpperCase();
      const markets = marketRaw && ["US", "AR", "BR"].includes(marketRaw) ? [marketRaw as "US" | "AR" | "BR"] : undefined;
      const result = await runMarketIngestionOnce({ markets });
      const activeConfigs = MARKET_COMMODITY_CONFIG.filter((cfg) => !markets || markets.includes(cfg.market));
      const vendorsTried = activeConfigs.map((cfg) => ({
        market: cfg.market,
        commodity: cfg.commodity,
        primary: cfg.primaryProvider,
        fallback: cfg.fallbackProviders,
      }));
      res.json({
        ok: true,
        triggeredAt: new Date().toISOString(),
        markets: markets || ["US", "AR", "BR"],
        result,
        vendorsTried,
        notes:
          result.upserted > 0
            ? "Rows upserted to market_prices/index_prices."
            : "No rows upserted. Check /api/admin/market-ingestion/probe and runtime/db-check endpoints.",
      });
    } catch (error: any) {
      console.error("Error running market ingestion now:", error);
      res.status(500).json({ error: error.message || "Failed to run market ingestion" });
    }
  });

  app.get("/api/admin/market-ingestion/probe", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await findUserById(req.user!.id);
      if (!hasBrokerPermissions(user?.role)) {
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }

      const vendor = String(req.query.vendor || "").toUpperCase();
      const market = String(req.query.market || "").toUpperCase() as "US" | "AR" | "BR";
      if (!vendor || !["US", "AR", "BR"].includes(market)) {
        return res.status(400).json({ error: "vendor and market query params are required" });
      }

      const defs = providerDefinitionsFor(vendor, market);
      if (defs.length === 0) {
        return res.status(404).json({ error: "No provider definitions found", vendor, market });
      }

      const target = defs[0];
      const parsed = await fetchAndParseProvider(target, "primary");
      res.json({
        vendor,
        market,
        url: target.url,
        statusCode: parsed.statusCode,
        latencyMs: parsed.latencyMs,
        confidence: parsed.confidence,
        hasDate: parsed.hasDate,
        hasHistory: parsed.hasHistory,
        updateSignal: parsed.updateSignal,
        pointCount: parsed.points.length,
        sample: parsed.points.slice(0, 3).map((point) => ({
          market: point.market,
          commodity: point.commodity,
          basis: point.basis,
          asOf: point.asOf,
          fetchedAt: point.fetchedAt,
          price: point.price,
          source: point.source.vendor,
          channel: point.source.channel,
        })),
        notes: parsed.notes,
      });
    } catch (error: any) {
      console.error("Error probing market ingestion source:", error);
      res.status(500).json({ error: error.message || "Failed to probe source" });
    }
  });

  app.get("/api/admin/debug/failover-events", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await findUserById(req.user!.id);
      if (!hasBrokerPermissions(user?.role)) {
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }

      const limitRaw = Number.parseInt(String(req.query?.limit || "50"), 10);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
      const includeNoRecent = String(req.query?.includeNoRecent || "false").toLowerCase() === "true";

      const failoverNames = [
        "source_failover_primary_to_secondary",
        "source_failover_to_last_known",
        "source_failover_to_synthetic",
      ];
      if (includeNoRecent) failoverNames.push("source_no_recent_price");

      const rows = await db
        .select({
          id: analyticsEvents.id,
          eventName: analyticsEvents.eventName,
          userId: analyticsEvents.userId,
          sessionId: analyticsEvents.sessionId,
          payload: analyticsEvents.payload,
          createdAt: analyticsEvents.createdAt,
        })
        .from(analyticsEvents)
        .where(inArray(analyticsEvents.eventName, failoverNames))
        .orderBy(desc(analyticsEvents.createdAt))
        .limit(limit);

      const events = rows.map((row) => {
        let parsedPayload: Record<string, unknown> | null = null;
        if (row.payload) {
          try {
            parsedPayload = JSON.parse(row.payload) as Record<string, unknown>;
          } catch {
            parsedPayload = { raw: row.payload };
          }
        }
        return {
          id: row.id,
          eventName: row.eventName,
          createdAt: row.createdAt ? new Date(row.createdAt as any).toISOString() : null,
          userId: row.userId || null,
          sessionId: row.sessionId || null,
          payload: parsedPayload,
        };
      });

      return res.json({
        generatedAt: new Date().toISOString(),
        count: events.length,
        limit,
        includeNoRecent,
        events,
      });
    } catch (error: any) {
      console.error("Error fetching failover debug events:", error);
      return res.status(500).json({ error: error.message || "Failed to fetch failover events" });
    }
  });

  app.get("/api/admin/debug/new-commodity-events", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await findUserById(req.user!.id);
      if (!hasBrokerPermissions(user?.role)) {
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }

      const limitRaw = Number.parseInt(String(req.query?.limit || "200"), 10);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 1000) : 200;

      const daysRaw = Number.parseInt(String(req.query?.days || "30"), 10);
      const days = Number.isFinite(daysRaw) ? Math.min(Math.max(daysRaw, 1), 365) : 30;

      const to = req.query?.to ? new Date(String(req.query.to)) : new Date();
      if (Number.isNaN(to.getTime())) return res.status(400).json({ error: "Invalid 'to' date" });

      const from = req.query?.from
        ? new Date(String(req.query.from))
        : new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
      if (Number.isNaN(from.getTime())) return res.status(400).json({ error: "Invalid 'from' date" });
      if (from > to) return res.status(400).json({ error: "'from' must be <= 'to'" });

      const rows = await db
        .select({
          id: analyticsEvents.id,
          eventName: analyticsEvents.eventName,
          payload: analyticsEvents.payload,
          createdAt: analyticsEvents.createdAt,
        })
        .from(analyticsEvents)
        .where(
          and(
            eq(analyticsEvents.eventName, "data_catalog_new_commodity"),
            gte(analyticsEvents.createdAt, from),
            lte(analyticsEvents.createdAt, to)
          )
        )
        .orderBy(desc(analyticsEvents.createdAt))
        .limit(limit);

      const events = rows.map((row) => {
        let payload: Record<string, unknown> | null = null;
        if (row.payload) {
          try {
            payload = JSON.parse(row.payload) as Record<string, unknown>;
          } catch {
            payload = { raw: row.payload };
          }
        }
        return {
          id: row.id,
          eventName: row.eventName,
          createdAt: row.createdAt ? new Date(row.createdAt as any).toISOString() : null,
          payload,
        };
      });

      const grouped = new Map<string, { country: string; source: string; commodity: string; count: number; firstSeenAt: string | null; lastSeenAt: string | null }>();
      for (const evt of events) {
        const payload = evt.payload || {};
        const country = String(payload.country || "N/A").toUpperCase();
        const source = String(payload.source || "unknown");
        const commodity = String(payload.commodity || "unknown").toLowerCase();
        const key = `${country}:${source}:${commodity}`;
        const cur = grouped.get(key) || {
          country,
          source,
          commodity,
          count: 0,
          firstSeenAt: evt.createdAt,
          lastSeenAt: evt.createdAt,
        };
        cur.count += 1;
        if (evt.createdAt && (!cur.firstSeenAt || evt.createdAt < cur.firstSeenAt)) cur.firstSeenAt = evt.createdAt;
        if (evt.createdAt && (!cur.lastSeenAt || evt.createdAt > cur.lastSeenAt)) cur.lastSeenAt = evt.createdAt;
        grouped.set(key, cur);
      }

      const summary = Array.from(grouped.values()).sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return (b.lastSeenAt || "").localeCompare(a.lastSeenAt || "");
      });

      return res.json({
        generatedAt: new Date().toISOString(),
        window: {
          from: from.toISOString(),
          to: to.toISOString(),
        },
        count: events.length,
        limit,
        summaryCount: summary.length,
        summary,
        events,
      });
    } catch (error: any) {
      console.error("Error fetching new commodity debug events:", error);
      return res.status(500).json({ error: error.message || "Failed to fetch new commodity events" });
    }
  });

  app.post("/api/feedback/upload", async (req, res) => {
    try {
      const schema = z.object({
        fileName: z.string().optional(),
        contentType: z.string().min(1),
        dataBase64: z.string().min(1),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid upload payload" });
      }

      const { fileName, contentType, dataBase64 } = parsed.data;
      const allowedTypes = new Map([
        ["image/png", ".png"],
        ["image/jpeg", ".jpg"],
        ["image/webp", ".webp"],
        ["image/gif", ".gif"],
      ]);

      const extension = allowedTypes.get(contentType);
      if (!extension) {
        return res.status(400).json({ error: "Only PNG/JPEG/WEBP/GIF images are allowed" });
      }

      const fileBuffer = Buffer.from(dataBase64, "base64");
      const maxBytes = 5 * 1024 * 1024;
      if (!fileBuffer.length || fileBuffer.length > maxBytes) {
        return res.status(413).json({ error: "Image must be between 1 byte and 5MB" });
      }

      const uploadsDir = path.join(process.cwd(), "uploads", "feedback");
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const safeBaseName = (fileName || "feedback-screenshot")
        .replace(/[^a-zA-Z0-9-_\\.]/g, "_")
        .replace(/\.[^.]+$/, "")
        .slice(0, 60);
      const storedFileName = `${Date.now()}-${safeBaseName || "feedback"}-${randomUUID()}${extension}`;
      const storedPath = path.join(uploadsDir, storedFileName);
      fs.writeFileSync(storedPath, fileBuffer);

      return res.status(201).json({
        url: `/uploads/feedback/${storedFileName}`,
      });
    } catch (error) {
      console.error("Error uploading feedback screenshot:", error);
      return res.status(500).json({ error: "Failed to upload screenshot" });
    }
  });

  app.post("/api/feedback", async (req, res) => {
    try {
      const result = insertFeedbackSchema.safeParse(req.body);
      
      if (!result.success) {
        const validationError = fromZodError(result.error);
        return res.status(400).json({ 
          error: validationError.message 
        });
      }

      const feedbackEntry = await storage.createFeedback(result.data);

      // Best-effort alert email: do not block form submission on email issues.
      const recipients = await getFeedbackAlertRecipients();
      const emailBody = [
        `New feedback received on Cropto.`,
        ``,
        `ID: ${feedbackEntry.id}`,
        `Name: ${feedbackEntry.name}`,
        `Email: ${feedbackEntry.email}`,
        `Role: ${feedbackEntry.role}`,
        `Status: ${feedbackEntry.status}`,
        `Created At: ${feedbackEntry.createdAt?.toISOString?.() || ""}`,
        `Screenshot URL: ${feedbackEntry.screenshotUrl || "n/a"}`,
        ``,
        `Message:`,
        `${feedbackEntry.message}`,
      ].join("\n");

      // Return immediately to keep form UX responsive; email delivery runs in background.
      res.status(201).json(feedbackEntry);
      void Promise.all(
        recipients.map(async (to) => {
          try {
            await emailService.sendEmail(to, "cropto deck", emailBody);
          } catch (emailError) {
            console.error(`[Feedback] Failed to send alert email to ${to}:`, emailError);
          }
        })
      );
    } catch (error) {
      console.error("Error creating feedback:", error);
      res.status(500).json({ error: "Failed to create feedback" });
    }
  });

  app.get("/api/admin/feedback", authenticateToken, async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const user = await findUserById(authReq.user!.id);
      
      if (!hasBrokerPermissions(user?.role)) {
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }

      const allFeedback = await storage.listFeedback();
      res.json(allFeedback);
    } catch (error) {
      console.error("Error fetching feedback:", error);
      res.status(500).json({ error: "Failed to fetch feedback" });
    }
  });

  app.post("/api/admin/feedback/:id/resolve", authenticateToken, async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const user = await findUserById(authReq.user!.id);
      
      if (!hasBrokerPermissions(user?.role)) {
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }

      const { id } = req.params;
      const updatedFeedback = await storage.updateFeedback(id, { status: "resolved" });
      res.json(updatedFeedback);
    } catch (error) {
      console.error("Error resolving feedback:", error);
      res.status(500).json({ error: "Failed to resolve feedback" });
    }
  });

  app.get("/api/admin/feedback/export", authenticateToken, async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const user = await findUserById(authReq.user!.id);
      
      if (!hasBrokerPermissions(user?.role)) {
        return res.status(403).json({ error: "Forbidden: broker role required" });
      }

      const allFeedback = await storage.listFeedback();
      
      // Generate CSV
      const csvHeaders = "ID,Name,Email,Role,Message,Screenshot URL,Status,Created At\n";
      const csvRows = allFeedback.map(f => {
        const escapeCsvField = (field: string | null | undefined) => {
          if (!field) return "";
          const escaped = field.replace(/"/g, '""');
          return escaped.includes(',') || escaped.includes('"') || escaped.includes('\n') 
            ? `"${escaped}"` 
            : escaped;
        };
        
        return [
          escapeCsvField(f.id),
          escapeCsvField(f.name),
          escapeCsvField(f.email),
          escapeCsvField(f.role),
          escapeCsvField(f.message),
          escapeCsvField(f.screenshotUrl),
          escapeCsvField(f.status),
          escapeCsvField(f.createdAt?.toISOString())
        ].join(',');
      }).join('\n');
      
      const csv = csvHeaders + csvRows;
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=feedback-export.csv');
      res.send(csv);
    } catch (error) {
      console.error("Error exporting feedback:", error);
      res.status(500).json({ error: "Failed to export feedback" });
    }
  });

  // Portfolio aggregation endpoint
  app.get("/api/portfolio/me", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // NOTE: locked_collateral column exists in DB (migration 003 applied)
      // However, for demo we compute lockedCollateral from active SHORT positions
      // This ensures consistency and avoids issues if column wasn't applied
      // lockedCollateral is computed from option.collateralAmount for active SHORT positions
      
      let userOptions: any[] = [];
      try {
        // Fetch all options where user is buyer or seller
        userOptions = await storage.getOptionsByUser(userId);
      } catch (error) {
        console.error("Portfolio options query failed", error);
        return res.status(500).json({ error: "Failed to fetch portfolio options" });
      }

      // Fetch settlements for exercised options
      const settlementsData = await storage.listSettlements();

      // Fetch margin calls for user's options
      const marginCalls = await storage.getMarginCallsByUser(userId);
      const activeMarginCalls = marginCalls.filter(mc => 
        mc.status === "PENDING"
      );

      // Get all indexes for price lookup
      const allIndexes = await db.select().from(indexes);
      const indexMap = new Map(allIndexes.map(idx => [idx.slug?.toLowerCase(), idx.id]));

      // Get latest prices for all commodities
      const allLatestPrices = await db
        .select()
        .from(commodityIndexPrices)
        .orderBy(desc(commodityIndexPrices.timestamp));
      
      // Build price map: indexId -> latest price per ton
      const priceMap = new Map<string, number>();
      const seenIndexIds = new Set<string>();
      for (const price of allLatestPrices) {
        if (!seenIndexIds.has(price.indexId)) {
          priceMap.set(price.indexId, parseFloat(price.price));
          seenIndexIds.add(price.indexId);
        }
      }

      let totalPnL = 0;
      let realizedPnL = 0;
      let unrealizedPnL = 0;
      let openPositionsCount = 0;
      const marginCallsCount = activeMarginCalls.length;

      const positions = await Promise.all(userOptions.map(async (option) => {
        // Check both new fields (buyerId/issuerId) and legacy fields (buyer/seller) for backward compatibility
        const isBuyer = option.buyerId === userId || option.buyer === userId;
        const isSeller = option.issuerId === userId || option.seller === userId;
        
        if (!isBuyer && !isSeller) {
          return null; // Skip if user is not involved
        }

        // Parse values from DB
        const strikeRaw = parseFloat(option.strike);
        const quantityRaw = parseFloat(option.qty);
        const premiumRaw = parseFloat(option.premium);
        const collateral = parseFloat(option.collateralAmount || '0');
        
        // Get commodity slug and find corresponding index for price lookup
        const commoditySlug = (option as any).commoditySlug || option.commodity;
        const indexId = commoditySlug ? indexMap.get(commoditySlug.toLowerCase()) : null;
        const currentPricePerTon = indexId ? (priceMap.get(indexId) || 0) : 0;
        
        // Strike is stored in $/ton, quantity in tons, premium per ton
        const strikePerTon = strikeRaw;
        const quantityTons = quantityRaw;
        const premiumPerTon = premiumRaw;

        let pnl = 0;
        let status = option.status;
        let unrealized = false;

        // Find settlement if exercised
        const settlement = settlementsData.find(s => s.optionId === option.id);

        if (settlement) {
          // Realized PnL from settlement
          const settlementPnL = parseFloat(settlement.profitLoss);
          pnl = isBuyer ? settlementPnL : -settlementPnL;
          realizedPnL += pnl;
        } else if (option.status === 'FILLED' || option.status === 'OPEN' || option.status === 'MARGIN_CALL') {
          // Unrealized PnL based on current spot price for this commodity
          unrealized = true;
          
          // Calculate intrinsic value and premium using corrected helpers (no * 1000 conversion)
          const intrinsicValue = computeIntrinsicValueUSD(
            option.type,
            strikePerTon,        // Already in $/ton
            currentPricePerTon,  // Already in $/ton
            quantityTons         // Already in tons
          );
          const totalPremium = computePremiumUSD(premiumPerTon, quantityTons);
          
          // Calculate P&L based on position side
          if (isBuyer) {
            // LONG: profit = intrinsic value - premium paid
            pnl = intrinsicValue - totalPremium;
          } else {
            // SHORT: profit = premium received - intrinsic value
            pnl = totalPremium - intrinsicValue;
          }
          
          unrealizedPnL += pnl;
        }

        // Track open positions and compute locked collateral for SHORT positions
        const isActiveStatus = option.status === 'FILLED' || option.status === 'OPEN' || option.status === 'MARGIN_CALL';
        if (isActiveStatus) {
          openPositionsCount++;
          
          // Locked collateral is only for SHORT positions (seller/writer)
          // Sum the collateralAmount from active SHORT options
          if (isSeller && collateral > 0) {
            // Collateral is already stored on the option record
            // No need to query DB column that may not exist
          }
        }

        totalPnL += pnl;

        return {
          optionId: option.id,
          title: option.title,
          type: option.type,
          strike: option.strike, // Original value from DB
          strikePerTon: strikePerTon.toFixed(2), // Strike in $/ton (already converted, no * 1000)
          qty: option.qty, // Already in tons
          premium: option.premium, // Premium per ton
          status: option.status,
          role: isBuyer ? 'buyer' : 'seller',
          pnl: pnl.toFixed(2),
          unrealized,
          createdAt: option.createdAt,
        };
      }));

      // Filter out null positions
      const validPositions = positions.filter((p): p is NonNullable<typeof p> => p !== null);
      
      // Compute locked collateral from active SHORT positions
      // Sum collateralAmount from all active options where user is seller
      let totalLockedCollateral = 0;
      for (const option of userOptions) {
        const isSeller = option.issuerId === userId || option.seller === userId;
        const isActiveStatus = option.status === 'FILLED' || option.status === 'OPEN' || option.status === 'MARGIN_CALL';
        if (isSeller && isActiveStatus) {
          const collateral = parseFloat(option.collateralAmount || '0');
          totalLockedCollateral += collateral;
        }
      }
      
      res.json({
        totalPnL: totalPnL.toFixed(2),
        realizedPnL: realizedPnL.toFixed(2),
        unrealizedPnL: unrealizedPnL.toFixed(2),
        lockedCollateral: totalLockedCollateral.toFixed(2),
        openPositions: openPositionsCount,
        marginCalls: marginCallsCount,
        positions: validPositions.sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
      });
    } catch (error: any) {
      console.error("Portfolio query failed", error);
      res.status(500).json({ error: error.message || "Failed to fetch portfolio" });
    }
  });

  // Forward portfolio for the current user
  app.get("/api/portfolio/forwards/me", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Get all forward contracts where user is long or short
      const userForwardContracts = await db
        .select({
          id: forwardContracts.id,
          commodity: forwardContracts.commodity,
          contractPrice: forwardContracts.contractPrice,
          qtyTon: forwardContracts.qtyTon,
          window: forwardContracts.window,
          windowStart: forwardContracts.windowStart,
          windowEnd: forwardContracts.windowEnd,
          settlementDate: forwardContracts.settlementDate,
          longUserId: forwardContracts.longUserId,
          shortUserId: forwardContracts.shortUserId,
          initialMargin: forwardContracts.initialMargin,
          status: forwardContracts.status,
          contractHash: forwardContracts.contractHash,
          createdAt: forwardContracts.createdAt,
          updatedAt: forwardContracts.updatedAt,
        })
        .from(forwardContracts)
        .where(
          or(
            eq(forwardContracts.longUserId, userId),
            eq(forwardContracts.shortUserId, userId)
          )
        )
        .orderBy(desc(forwardContracts.createdAt));

      // Get settlements for realized PnL
      const forwardSettlementRows = await db.select().from(forwardSettlements);

      const positions = await Promise.all(userForwardContracts.map(async (contract) => {
        const isLong = contract.longUserId === userId;
        const isShort = contract.shortUserId === userId;

        // Calculate notional
        const contractPrice = parseFloat(contract.contractPrice || "0");
        const qtyTon = parseFloat(contract.qtyTon || "0");
        const notional = contractPrice * qtyTon;

        // Calculate PnL from settlements
        let realizedPnL = 0;
        const contractSettlements = forwardSettlementRows.filter(
          (s: any) => s.forwardContractId === contract.id
        );

        for (const settlement of contractSettlements) {
          const settlementPrice = parseFloat(settlement.settlementPrice || "0");
          const contractPriceSettled = parseFloat(settlement.contractPrice || "0");
          const qtySettled = parseFloat(settlement.qtyTon || "0");

          const pnlPerTon = (settlementPrice - contractPriceSettled) * qtySettled;

          if (isLong) {
            // Long position: profit when price rises
            realizedPnL += pnlPerTon;
          } else {
            // Short position: profit when price falls
            realizedPnL -= pnlPerTon;
          }
        }

        // Calculate unrealized PnL if contract is still active
        let unrealizedPnL = 0;
        const isActive = ['ACTIVE', 'MARGIN_CALL'].includes(contract.status);

        if (isActive) {
          // For unrealized PnL, we would need current market prices
          // For now, set to 0 (could be enhanced later)
          unrealizedPnL = 0;
        }

        return {
          contractId: contract.id,
          commodity: contract.commodity,
          window: contract.window,
          windowStart: contract.windowStart,
          windowEnd: contract.windowEnd,
          settlementDate: contract.settlementDate,
          role: isLong ? 'long' : 'short',
          contractPrice: contract.contractPrice,
          qtyTon: contract.qtyTon,
          notional: notional.toFixed(2),
          initialMargin: contract.initialMargin,
          status: contract.status,
          realizedPnL: realizedPnL.toFixed(2),
          unrealizedPnL: unrealizedPnL.toFixed(2),
          totalPnL: (realizedPnL + unrealizedPnL).toFixed(2),
          createdAt: contract.createdAt,
          updatedAt: contract.updatedAt,
        };
      }));

      res.json(positions);
    } catch (error: any) {
      console.error("Forward portfolio query failed", error);
      res.status(500).json({ error: error.message || "Failed to fetch forward portfolio" });
    }
  });

  // Compact portfolio summary for the current user
  app.get("/api/portfolio/summary", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const userId = req.user.id;

      let optionNotional = 0;
      let optionMargin = 0;
      let forwardNotional = 0;
      let forwardMargin = 0;
      let realizedPnl = 0;
      let unrealizedPnl = 0; // TODO: reuse risk dashboard logic when available

      // Options: active positions where user is buyer/issuer/counterparty
      const userOptions = await storage.getOptionsByUser(userId);
      const activeOptionStatuses = new Set(["OPEN", "FILLED", "MARGIN_CALL", "ACTIVE"]);
      const activeOptions = userOptions.filter((o) => activeOptionStatuses.has(o.status));

      // Settlements for realized PnL on options
      const optionSettlements = await storage.listSettlements();

      for (const opt of activeOptions) {
        const strike = parseFloat(opt.strike || "0");
        const qty = parseFloat(opt.qty || "0");
        const initMargin = parseFloat((opt as any).initialMargin || "0");
        optionNotional += computeNotional(strike, qty);
        optionMargin += Number.isFinite(initMargin) ? initMargin : 0;
      }

      // Realized PnL from settled options
      for (const sett of optionSettlements) {
        const opt = userOptions.find((o) => o.id === sett.optionId);
        if (!opt) continue;
        const isBuyer = opt.buyerId === userId || (opt as any).buyer === userId;
        const isSeller = opt.issuerId === userId || (opt as any).seller === userId;
        if (!isBuyer && !isSeller) continue;
        const pnl = parseFloat((sett as any).profitLoss || "0");
        realizedPnl += isBuyer ? pnl : -pnl;
      }

      // Forward contracts (if available)
      try {
        const activeForwardStatuses = new Set(["ACTIVE", "MARGIN_CALL"]);
        const forwards = await db
          .select()
          .from(forwardContracts)
          .where(
            or(
              eq(forwardContracts.longUserId, userId),
              eq(forwardContracts.shortUserId, userId)
            )
          );

        const forwardSettles = await db.select().from(forwardSettlements);

        for (const fc of forwards) {
          if (activeForwardStatuses.has(fc.status)) {
            const price = parseFloat(fc.contractPrice || "0");
            const qty = parseFloat(fc.qtyTon || "0");
            const initMargin = parseFloat((fc as any).initialMargin || "0");
            forwardNotional += computeNotional(price, qty);
            forwardMargin += Number.isFinite(initMargin) ? initMargin : 0;
          }
          const settlesForContract = forwardSettles.filter(
            (s) => s.forwardContractId === fc.id
          );
          for (const s of settlesForContract) {
            const pnlLong = parseFloat(s.pnlLong || "0");
            const pnlShort = parseFloat(s.pnlShort || "0");
            if (fc.longUserId === userId) {
              realizedPnl += pnlLong;
            }
            if (fc.shortUserId === userId) {
              realizedPnl += pnlShort;
            }
          }
        }
      } catch (err) {
        console.warn("[PORTFOLIO_SUMMARY] Forward module unavailable, using stubs", {
          error: (err as Error)?.message,
        });
      }

      const requiredMargin = optionMargin + forwardMargin;
      const currentMargin = requiredMargin; // placeholder until live balances are wired

      const healthPct =
        requiredMargin === 0
          ? 100
          : Math.min(200, Math.max(0, (currentMargin / requiredMargin) * 100));

      res.json({
        totalNotionalUsd: Number((optionNotional + forwardNotional).toFixed(8)),
        requiredMargin: Number(requiredMargin.toFixed(8)),
        currentMargin: Number(currentMargin.toFixed(8)),
        realizedPnl: Number(realizedPnl.toFixed(8)),
        unrealizedPnl: Number(unrealizedPnl.toFixed(8)),
        healthPct: Number(healthPct.toFixed(2)),
      });
    } catch (error: any) {
      console.error("Error building portfolio summary:", error);
      res.status(500).json({ error: error.message || "Failed to build portfolio summary" });
    }
  });

  // Option & Forward chain for a single index/window
  app.get("/api/markets/chain", optionalAuth, async (req: AuthRequest, res) => {
    try {
      const { indexId, commodity, window, includeForwards } = req.query;
      if (!indexId && !commodity) {
        return res.status(400).json({ error: "indexId or commodity is required" });
      }
      if (!window || typeof window !== "string") {
        return res.status(400).json({ error: "window is required" });
      }
      const includeFw = includeForwards === undefined ? true : String(includeForwards) === "true";

      // Resolve index info
      const commoditySlug = typeof commodity === "string" ? commodity : undefined;
      const commodityInfo = commoditySlug ? COMMODITY_MAP[commoditySlug as CommoditySlug] : undefined;

      let indexRow: any = null;
      if (indexId && typeof indexId === "string") {
        const [idx] = await db.select().from(indexes).where(eq(indexes.id, indexId));
        indexRow = idx || null;
      } else if (commoditySlug) {
        const [idx] = await db.select().from(indexes).where(eq(indexes.slug, commoditySlug));
        indexRow = idx || null;
      }

      // If not found in DB but commodity is known, build a minimal stub so the API doesn't 404
      if (!indexRow && commoditySlug && commodityInfo) {
        indexRow = {
          id: null,
          name: commodityInfo.indexName || commodityInfo.name,
          slug: commoditySlug,
        };
      }

      if (!indexRow) {
        return res.status(404).json({ error: "Index not found" });
      }

      const indexIdFilter = indexRow.id ? eq(options.indexId, indexRow.id) : null;
      // Build filters with column-existence guards to avoid 42703
      const hasExpiryWindow = !!(options as any).expiryWindow;
      const optionWhereParts = [
        hasExpiryWindow && window ? eq((options as any).expiryWindow, window) : sql`true`,
        indexIdFilter
          ? or(indexIdFilter, commoditySlug ? eq(options.commodity as any, commoditySlug) : sql`false`)
          : commoditySlug
          ? eq(options.commodity as any, commoditySlug)
          : sql`true`,
      ].filter(Boolean) as any[];

      let optionRows: any[] = [];
      try {
        optionRows = await db.select().from(options).where(and(...optionWhereParts));
      } catch (err: any) {
        if (err?.code === "42703") {
          console.warn("[CHAIN] expiry_window column missing at runtime, returning empty options");
          optionRows = [];
        } else {
          throw err;
        }
      }

      const optionsMapped = optionRows.map((o) => {
        const strike = parseFloat(o.strike || "0");
        const premium = parseFloat(o.premium || "0");
        const qty = parseFloat(o.qty || "0");
        let side: "LONG" | "SHORT" | null = null;
        if (req.user) {
          if (o.buyerId === req.user.id || (o as any).buyer === req.user.id) side = "LONG";
          else if (o.issuerId === req.user.id || (o as any).seller === req.user.id) side = "SHORT";
        }
        return {
          id: o.id,
          type: o.type,
          strike,
          premium,
          qtyTon: qty,
          status: o.status,
          side,
          volume: null,
          iv: null,
        };
      });

      let forwardsMapped: any[] = [];
      if (includeFw) {
        const forwardWhere = [
          window ? eq(forwardContracts.window, window) : sql`true`,
          indexRow.id
            ? or(eq(forwardContracts.indexId, indexRow.id), commoditySlug ? eq(forwardContracts.commodity as any, commoditySlug) : sql`false`)
            : commoditySlug
            ? eq(forwardContracts.commodity as any, commoditySlug)
            : sql`true`,
        ];
        const fwRows = await db.select().from(forwardContracts).where(and(...forwardWhere));

        forwardsMapped = fwRows.map((f) => {
          const price = parseFloat(f.contractPrice || "0");
          const qty = parseFloat(f.qtyTon || "0");
          let side: "LONG" | "SHORT" | null = null;
          if (req.user) {
            if (f.longUserId === req.user.id) side = "LONG";
            else if (f.shortUserId === req.user.id) side = "SHORT";
          }
          return {
            id: f.id,
            contractPrice: price,
            qtyTon: qty,
            status: f.status,
            side,
          };
        });
      }

      res.json({
        index: {
          id: indexRow.id,
          name: indexRow.name || commodityInfo?.indexName || commodityInfo?.name || commoditySlug,
          slug: indexRow.slug || commoditySlug,
          basis: BASIS_CPT_ODESA,
        },
        window,
        options: optionsMapped,
        forwards: forwardsMapped,
      });
    } catch (error: any) {
      console.error("Error fetching market chain:", error);
      res.status(500).json({ error: error.message || "Failed to fetch market chain" });
    }
  });

  // Admin: run margin checks for active SHORT positions
  app.post("/api/admin/run-margin-check", authenticateToken, async (req: AuthRequest, res) => {
    try {
      // Only admins/brokers allowed
      if (!hasAdminPermissions(req.user) && !hasBrokerPermissions(req.user)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      // Load latest prices per index
      const latestPrices = await db
        .select()
        .from(commodityIndexPrices)
        .orderBy(desc(commodityIndexPrices.timestamp));
      const priceMap = new Map<string, number>();
      const seen = new Set<string>();
      for (const p of latestPrices) {
        if (!seen.has(p.indexId)) {
          priceMap.set(p.indexId, parseFloat(p.price));
          seen.add(p.indexId);
        }
      }

      const getSSIavgWindow = async (indexId: string | null, windowStart?: Date | null, windowEnd?: Date | null) => {
        if (!indexId || !windowStart || !windowEnd) return null;
        const rows = await db
          .select()
          .from(commodityIndexPrices)
          .where(
            and(
              eq(commodityIndexPrices.indexId, indexId),
              gte(commodityIndexPrices.timestamp, windowStart),
              lte(commodityIndexPrices.timestamp, windowEnd)
            )
          );
        if (rows.length === 0) return null;
        const avg = rows.reduce((sum, r) => sum + parseFloat(r.price), 0) / rows.length;
        return avg;
      };

      const activeOptions = await db
        .select()
        .from(options)
        .where(
          or(
            eq(options.status, "OPEN"),
            eq(options.status, "FILLED")
          )
        );

      let checked = 0;
      let triggered = 0;

      for (const opt of activeOptions) {
        let markPrice = opt.indexId ? priceMap.get(opt.indexId) || 0 : 0;
        if (opt.indexId && opt.windowStart && opt.windowEnd) {
          const ssi = await getSSIavgWindow(opt.indexId, opt.windowStart as any, opt.windowEnd as any);
          if (ssi && Number.isFinite(ssi)) {
            markPrice = ssi;
          } else {
            console.warn("[MARGIN_CHECK] No SSIavg in window; using latest price as fallback", {
              optionId: opt.id,
              indexId: opt.indexId,
              windowStart: (opt.windowStart as any)?.toISOString?.() ?? opt.windowStart,
              windowEnd: (opt.windowEnd as any)?.toISOString?.() ?? opt.windowEnd,
              latest: markPrice,
            });
          }
        }
        const { updated, marginCallTriggered } = checkMarginCall({
          ...opt,
          currentPrice: markPrice,
        });

        const needsUpdate =
          marginCallTriggered ||
          updated.floatingLoss !== opt.floatingLoss ||
          updated.isInMarginCall !== opt.isInMarginCall;

        if (needsUpdate) {
          await db
            .update(options)
            .set({
              floatingLoss: updated.floatingLoss?.toString(),
              isInMarginCall: updated.isInMarginCall ?? false,
              marginCallTimestamp: updated.marginCallTimestamp || null,
              marginCallDeadline: updated.marginCallDeadline || null,
              lastUpdated: new Date(),
            })
            .where(eq(options.id, opt.id));
        }

        if (marginCallTriggered) triggered += 1;
        checked += 1;
      }

      res.json({ checked, triggered });
    } catch (error: any) {
      console.error("[ADMIN] Margin check failed", error);
      res.status(500).json({ error: "Failed to run margin check" });
    }
  });

  // Admin: auto-liquidate overdue margin calls
  app.post("/api/admin/run-liquidations", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!hasAdminPermissions(req.user) && !hasBrokerPermissions(req.user)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const now = new Date();

      // Latest prices per index
      const latestPrices = await db
        .select()
        .from(commodityIndexPrices)
        .orderBy(desc(commodityIndexPrices.timestamp));
      const priceMap = new Map<string, number>();
      const seen = new Set<string>();
      for (const p of latestPrices) {
        if (!seen.has(p.indexId)) {
          priceMap.set(p.indexId, parseFloat(p.price));
          seen.add(p.indexId);
        }
      }

      const candidates = await db
        .select()
        .from(options)
        .where(
          and(
            eq(options.isInMarginCall, true),
            sql`"margin_call_deadline" IS NOT NULL`,
            or(eq(options.status, "OPEN"), eq(options.status, "FILLED"), eq(options.status, "MARGIN_CALL"))
          )
        );

      let checked = 0;
      let liquidated = 0;

      for (const opt of candidates) {
        const deadline = opt.marginCallDeadline ? new Date(opt.marginCallDeadline) : null;
        if (!deadline || now <= deadline) continue;

        const mark = opt.indexId ? priceMap.get(opt.indexId) || 0 : 0;
        const { shouldLiquidate, updated } = autoLiquidateIfNeeded({ ...opt, currentPrice: mark });

        if (shouldLiquidate) {
          await db
            .update(options)
            .set({
              status: updated.status || "LIQUIDATED",
              floatingLoss: updated.floatingLoss?.toString(),
              marginBalance: (updated as any).marginBalance?.toString() || "0",
              isInMarginCall: false,
              marginCallTimestamp: updated.marginCallTimestamp || null,
              marginCallDeadline: updated.marginCallDeadline || null,
              lastUpdated: new Date(),
            })
            .where(eq(options.id, opt.id));
          liquidated += 1;
        }
        checked += 1;
      }

      res.json({ checked, liquidated });
    } catch (error: any) {
      console.error("[ADMIN] Liquidation run failed", error);
      res.status(500).json({ error: "Failed to run liquidations" });
    }
  });

  // ===== SEA BROKERAGE MONITOR =====

  app.get("/api/sea-brokerage-monitor/broker-directory", async (req: AuthRequest, res) => {
    try {
      const telegramIdentity = readSeaBrokerageTelegramIdentity(req);
      const authorizedBroker = await resolveAuthorizedSeaBrokerageBrokerByTelegram(telegramIdentity);
      if (!authorizedBroker) {
        return res.status(403).json({
          error:
            "Broker is not authorized for monitor publishing yet. Provide Telegram id/username from allowlist.",
        });
      }

      const allowlist = await listSeaBrokerageBrokerAllowlist();
      const directory = allowlist
        .filter((item) => item.isActive)
        .map((item) => ({
          brokerCode: item.brokerCode,
          brokerName: item.brokerName,
          companyName: item.companyName,
          telegramUserId: item.telegramUserId,
          telegramUsername: item.telegramUsername,
        }))
        .sort((left, right) => left.brokerCode.localeCompare(right.brokerCode));

      return res.json({ brokers: directory });
    } catch (error: any) {
      console.error("Error fetching sea brokerage broker directory:", error);
      return res.status(500).json({ error: "Failed to fetch broker directory" });
    }
  });

  app.get("/api/sea-brokerage-monitor/entries", async (req: AuthRequest, res) => {
    try {
      const [entries, likes, matchLikes] = await Promise.all([
        storage.listSeaBrokerageEntries(),
        readSeaBrokerageEntryLikes(),
        readSeaBrokerageMatchLikes(),
      ]);

      const telegramIdentity = readSeaBrokerageTelegramIdentity(req);
      const authorizedBroker = await resolveAuthorizedSeaBrokerageBrokerByTelegram(telegramIdentity);
      const viewerBrokerUserId =
        authorizedBroker?.telegramUserId ||
        authorizedBroker?.telegramUsername ||
        authorizedBroker?.authUserId ||
        null;

      const likesByEntry = new Map<
        string,
        { count: number; likedByMe: boolean }
      >();

      for (const like of likes) {
        const current = likesByEntry.get(like.entryId) ?? { count: 0, likedByMe: false };
        const likedByMe =
          !!viewerBrokerUserId && like.brokerUserId.toLowerCase() === viewerBrokerUserId.toLowerCase();
        likesByEntry.set(like.entryId, {
          count: current.count + 1,
          likedByMe: current.likedByMe || likedByMe,
        });
      }

      const matchEntryIdsById = new Map<string, { bidEntryId: string; offerEntryId: string }>();
      for (const match of generateSeaBrokerageMatchSuggestions(entries)) {
        matchEntryIdsById.set(match.id, {
          bidEntryId: match.bidEntry.id,
          offerEntryId: match.offerEntry.id,
        });
      }

      const entryIdsWithBossMatchLike = new Set<string>();
      for (const like of matchLikes) {
        if (like.kind !== "boss") continue;
        const byMatchId = matchEntryIdsById.get(like.matchId);
        if (byMatchId) {
          entryIdsWithBossMatchLike.add(byMatchId.bidEntryId);
          entryIdsWithBossMatchLike.add(byMatchId.offerEntryId);
          continue;
        }
        if (like.bidEntryId) entryIdsWithBossMatchLike.add(like.bidEntryId);
        if (like.offerEntryId) entryIdsWithBossMatchLike.add(like.offerEntryId);
      }

      res.json(
        entries.map((entry) =>
          mapSeaBrokerageEntryToClientShape(entry, {
            likeCount: likesByEntry.get(entry.id)?.count ?? 0,
            likedByMe: likesByEntry.get(entry.id)?.likedByMe ?? false,
            hasBossMatchLike: entryIdsWithBossMatchLike.has(entry.id),
          }),
        ),
      );
    } catch (error: any) {
      console.error("Error fetching sea brokerage monitor entries:", error);
      res.status(500).json({ error: "Failed to fetch sea brokerage monitor entries" });
    }
  });

  app.post("/api/sea-brokerage-monitor/report/send", async (req: AuthRequest, res) => {
    try {
      const telegramIdentity = readSeaBrokerageTelegramIdentity(req);
      const authorizedBroker = await resolveAuthorizedSeaBrokerageBrokerByTelegram(telegramIdentity);
      if (!authorizedBroker) {
        return res.status(403).json({
          error:
            "Broker is not authorized for monitor publishing yet. Provide Telegram id/username from allowlist.",
        });
      }

      const parsed = seaBrokerageReportRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const payload = parsed.data;
      const postedFrom = payload.postedFrom <= payload.postedTo ? payload.postedFrom : payload.postedTo;
      const postedTo = payload.postedFrom <= payload.postedTo ? payload.postedTo : payload.postedFrom;
      const periodStart = payload.periodStart <= payload.periodEnd ? payload.periodStart : payload.periodEnd;
      const periodEnd = payload.periodStart <= payload.periodEnd ? payload.periodEnd : payload.periodStart;
      const allEntries = await storage.listSeaBrokerageEntries();

      const includeTypes = new Set<string>();
      if (payload.includeBids) includeTypes.add("bid");
      if (payload.includeOffers) includeTypes.add("offer");

      const postedWindow = (() => {
        const from = startOfUtcDay(postedFrom);
        const to = endOfUtcDay(postedTo);
        return from && to ? { from, to } : null;
      })();

      if (!postedWindow) {
        return res.status(400).json({ error: "Invalid posted date range" });
      }

      const reportPeriodRange = (() => {
        const start = startOfUtcDay(periodStart);
        const end = endOfUtcDay(periodEnd);
        return start && end ? { start, end } : null;
      })();

      if (!reportPeriodRange) {
        return res.status(400).json({ error: "Invalid report period range" });
      }

      const commoditySet = new Set(
        [...payload.commodities, ...(payload.commodity ? [payload.commodity] : [])].map((item) =>
          item.toLowerCase(),
        ),
      );
      const basisSet = new Set(payload.basis.map((item) => item.toUpperCase()));
      const placeSet = new Set(payload.deliveryPlaces.map((item) => item.toLowerCase()));
      const overlapThreshold = Math.max(1, Number(payload.overlapDays || 1));

      const matched = allEntries
        .filter((entry) => includeTypes.has(entry.type))
        .filter((entry) => commoditySet.has(String(entry.commodity || "").toLowerCase()))
        .filter((entry) => {
          const created = new Date(entry.createdAt);
          if (Number.isNaN(created.getTime())) return false;
          return created >= postedWindow.from && created <= postedWindow.to;
        })
        .filter((entry) => (basisSet.size ? basisSet.has(String(entry.basis || "").toUpperCase()) : true))
        .filter((entry) =>
          placeSet.size
            ? parseDestinationPortCodesValue(entry.destinationPortCode).some((code) =>
                placeSet.has(String(code).toLowerCase()),
              ) ||
              placeSet.has(String(entry.destinationPort || "").toLowerCase())
            : true,
        )
        .filter((entry) => {
          if (!entry.periodStart || !entry.periodEnd) return false;
          const entryStart = startOfUtcDay(entry.periodStart);
          const entryEnd = endOfUtcDay(entry.periodEnd);
          if (!entryStart || !entryEnd) return false;
          const overlapDays = getDateOverlapDaysInclusive(
            entryStart,
            entryEnd,
            reportPeriodRange!.start,
            reportPeriodRange!.end,
          );
          return overlapDays >= overlapThreshold;
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const offers = matched.filter((entry) => entry.type === "offer");
      const bids = matched.filter((entry) => entry.type === "bid");

      const commodityEmoji: Record<string, string> = {
        corn: "🌽",
        wheat: "🌾",
        barley: "🌾",
        soybean: "🌱",
        soybeans: "🌱",
        sunflower: "🌻",
        rapeseed: "🌱",
      };
      const transportShort: Record<string, string> = {
        vessel: "VSL",
        truck: "TRUCK",
        rail: "RAIL",
        handysize: "VSL",
        coaster: "VSL",
      };
      const toUpper = (value: string | null | undefined) => String(value || "").trim().toUpperCase();
      const parsePrice = (value: unknown) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
      };
      const formatPriceRange = (values: Array<number | null>) => {
        const numeric = values.filter((value): value is number => typeof value === "number");
        if (!numeric.length) return "N/A";
        const min = Math.min(...numeric);
        const max = Math.max(...numeric);
        return min === max ? `${min}$` : `${min}$-${max}$`;
      };
      const formatQtyRange = (entries: SeaBrokerageEntryRow[]) => {
        const qtyValues = entries
          .flatMap((entry) => {
            const from = Number(entry.volumeFrom);
            const to = Number(entry.volumeTo);
            const qty = Number(entry.quantityMt);
            return [from, to, qty].filter((n) => Number.isFinite(n) && n > 0);
          })
          .filter((n): n is number => typeof n === "number");
        if (!qtyValues.length) return "";
        const min = Math.min(...qtyValues);
        const max = Math.max(...qtyValues);
        if (min === max) return `${min.toLocaleString("en-US")} MT`;
        return `${min.toLocaleString("en-US")}-${max.toLocaleString("en-US")} MT`;
      };
      const formatPeriodSummary = (entries: SeaBrokerageEntryRow[]) => {
        const values = Array.from(
          new Set(
            entries
              .map((entry) => String(entry.periodLabel || "").trim().toUpperCase())
              .filter(Boolean),
          ),
        );
        return values.slice(0, 2).join(" / ");
      };

      const byCommodity = new Map<string, SeaBrokerageEntryRow[]>();
      for (const entry of matched) {
        const commodityLabel = toUpper(entry.commodityLabel || entry.commodity);
        const cropKey = entry.isNewCrop ? "NEW" : "STD";
        const key = `${commodityLabel}|${cropKey}`;
        const bucket = byCommodity.get(key) || [];
        bucket.push(entry);
        byCommodity.set(key, bucket);
      }

      const reportLines: string[] = [];
      const reportDate = new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
      });
      reportLines.push(`SPIKE BROKERS DAILY UPDATE ${reportDate}`);
      reportLines.push("-----------------------------");

      for (const [commodityKey, commodityEntries] of Array.from(byCommodity.entries()).sort((a, b) =>
        a[0].localeCompare(b[0]),
      )) {
        const [commodityLabel, cropKey] = commodityKey.split("|");
        const commodityTitle = cropKey === "NEW" ? `${commodityLabel} (NEW CROP)` : commodityLabel;
        const commodityCode = commodityEntries[0]?.commodity?.toLowerCase?.() || "";
        reportLines.push(`${commodityEmoji[commodityCode] || "•"}${commodityTitle}`);

        const byRoute = new Map<string, SeaBrokerageEntryRow[]>();
        for (const entry of commodityEntries) {
          const route = formatSeaBrokerageBasisRoute(entry, { uppercase: true, countryMode: "alpha2" });
          const transport = toUpper(transportShort[String(entry.transportType || "").toLowerCase()] || entry.transportType);
          const key = `${route}|${transport}`;
          const bucket = byRoute.get(key) || [];
          bucket.push(entry);
          byRoute.set(key, bucket);
        }

        for (const [routeKey, routeEntries] of Array.from(byRoute.entries()).sort((a, b) =>
          a[0].localeCompare(b[0]),
        )) {
          const [route, transport] = routeKey.split("|");
          const qtyLabel = formatQtyRange(routeEntries);
          const headingParts = [route];
          if (qtyLabel) headingParts.push(qtyLabel);
          if (transport) headingParts.push(transport);
          reportLines.push(`${headingParts.join(" ")}:`);

          const routeOffers = routeEntries.filter((entry) => entry.type === "offer");
          const routeBids = routeEntries.filter((entry) => entry.type === "bid");
          if (routeOffers.length) {
            reportLines.push(
              `> Sellers ${formatPriceRange(routeOffers.map((entry) => parsePrice(entry.price)))} ${formatPeriodSummary(routeOffers)}`.trim(),
            );
          }
          if (routeBids.length) {
            reportLines.push(
              `> Buyers ${formatPriceRange(routeBids.map((entry) => parsePrice(entry.price)))} ${formatPeriodSummary(routeBids)}`.trim(),
            );
          }
          reportLines.push("");
        }
        reportLines.push("-----------------------------");
      }

      if (!matched.length) {
        reportLines.push("No entries matched selected filters.");
        reportLines.push("-----------------------------");
      }

      const targetChat =
        authorizedBroker.telegramUserId ||
        (authorizedBroker.telegramUsername
          ? `@${authorizedBroker.telegramUsername.replace(/^@+/, "")}`
          : null);

      if (!targetChat) {
        return res.status(400).json({
          error: "No Telegram target found for broker. Ask admin to add Telegram id/username.",
        });
      }

      const maxMessageLength = 3400;
      const chunks: string[] = [];
      let current = "";
      for (const line of reportLines) {
        const next = current ? `${current}\n${line}` : line;
        if (next.length > maxMessageLength) {
          if (current) chunks.push(current);
          current = line;
        } else {
          current = next;
        }
      }
      if (current) chunks.push(current);

      let sentChunks = 0;
      for (const chunk of chunks) {
        const dm = await sendSeaBrokerageTelegramDirectMessage(targetChat, chunk);
        if (!dm.ok) {
          return res.status(502).json({
            error:
              dm.error ||
              "Failed to deliver report in Telegram. Ensure broker started bot chat first.",
            sentChunks,
          });
        }
        sentChunks += 1;
      }

      return res.status(201).json({
        ok: true,
        sentChunks,
        matchedEntries: matched.length,
        offers: offers.length,
        bids: bids.length,
      });
    } catch (error: any) {
      console.error("Error sending sea brokerage report:", error);
      return res.status(500).json({ error: "Failed to build/send report" });
    }
  });

  app.get("/api/sea-brokerage-monitor/filter-presets", async (req: AuthRequest, res) => {
    try {
      const telegramIdentity = readSeaBrokerageTelegramIdentity(req);
      const authorizedBroker = await resolveAuthorizedSeaBrokerageBrokerByTelegram(telegramIdentity);
      if (!authorizedBroker) {
        return res.json([]);
      }
      const brokerUserId = resolveSeaBrokerageBrokerUserId(authorizedBroker).toLowerCase();
      const presets = await readSeaBrokerageFilterPresets();
      const visible = presets
        .filter((preset) => preset.brokerUserId.toLowerCase() === brokerUserId)
        .sort((a, b) => {
          if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });
      return res.json(visible);
    } catch (error: any) {
      console.error("Error fetching sea brokerage filter presets:", error);
      return res.status(500).json({ error: "Failed to fetch filter presets" });
    }
  });

  app.post("/api/sea-brokerage-monitor/filter-presets", async (req: AuthRequest, res) => {
    try {
      const telegramIdentity = readSeaBrokerageTelegramIdentity(req);
      const authorizedBroker = await resolveAuthorizedSeaBrokerageBrokerByTelegram(telegramIdentity);
      if (!authorizedBroker) {
        return res.status(403).json({
          error:
            "Broker is not authorized for monitor actions yet. Provide Telegram id/username from allowlist.",
        });
      }

      const parsed = seaBrokerageFilterPresetPayloadSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const brokerUserId = resolveSeaBrokerageBrokerUserId(authorizedBroker);
      const nowIso = new Date().toISOString();
      const presetId = randomUUID();
      const nextPreset: SeaBrokerageFilterPreset = {
        id: presetId,
        brokerUserId,
        brokerCode: authorizedBroker.brokerCode,
        name: parsed.data.name,
        isDefault: !!parsed.data.isDefault,
        filters: parsed.data.filters,
        offerPaneFilters: parsed.data.offerPaneFilters,
        bidPaneFilters: parsed.data.bidPaneFilters,
        tradePaneFilters: parsed.data.tradePaneFilters,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const all = await readSeaBrokerageFilterPresets();
      const normalizedBrokerUserId = brokerUserId.toLowerCase();
      const updated = all.map((preset) =>
        preset.brokerUserId.toLowerCase() === normalizedBrokerUserId && nextPreset.isDefault
          ? { ...preset, isDefault: false, updatedAt: nowIso }
          : preset,
      );
      updated.push(nextPreset);
      await writeSeaBrokerageFilterPresets(updated);
      return res.status(201).json(nextPreset);
    } catch (error: any) {
      console.error("Error creating sea brokerage filter preset:", error);
      return res.status(500).json({ error: "Failed to create filter preset" });
    }
  });

  app.patch("/api/sea-brokerage-monitor/filter-presets/:presetId", async (req: AuthRequest, res) => {
    try {
      const telegramIdentity = readSeaBrokerageTelegramIdentity(req);
      const authorizedBroker = await resolveAuthorizedSeaBrokerageBrokerByTelegram(telegramIdentity);
      if (!authorizedBroker) {
        return res.status(403).json({
          error:
            "Broker is not authorized for monitor actions yet. Provide Telegram id/username from allowlist.",
        });
      }
      const parsed = seaBrokerageFilterPresetUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const presetId = String(req.params.presetId || "").trim();
      if (!presetId) return res.status(400).json({ error: "Preset id is required" });
      const brokerUserId = resolveSeaBrokerageBrokerUserId(authorizedBroker).toLowerCase();
      const nowIso = new Date().toISOString();
      const all = await readSeaBrokerageFilterPresets();
      const target = all.find(
        (preset) => preset.id === presetId && preset.brokerUserId.toLowerCase() === brokerUserId,
      );
      if (!target) {
        return res.status(404).json({ error: "Preset not found" });
      }

      const nextName = parsed.data.name ?? target.name;
      const markDefault = parsed.data.isDefault === true;
      const updated = all.map((preset) => {
        if (preset.brokerUserId.toLowerCase() !== brokerUserId) return preset;
        if (preset.id === presetId) {
          return {
            ...preset,
            name: nextName,
            isDefault: parsed.data.isDefault !== undefined ? !!parsed.data.isDefault : preset.isDefault,
            updatedAt: nowIso,
          };
        }
        if (markDefault) {
          return { ...preset, isDefault: false, updatedAt: nowIso };
        }
        return preset;
      });

      await writeSeaBrokerageFilterPresets(updated);
      const refreshed = updated.find((preset) => preset.id === presetId)!;
      return res.json(refreshed);
    } catch (error: any) {
      console.error("Error updating sea brokerage filter preset:", error);
      return res.status(500).json({ error: "Failed to update filter preset" });
    }
  });

  app.delete("/api/sea-brokerage-monitor/filter-presets/:presetId", async (req: AuthRequest, res) => {
    try {
      const telegramIdentity = readSeaBrokerageTelegramIdentity(req);
      const authorizedBroker = await resolveAuthorizedSeaBrokerageBrokerByTelegram(telegramIdentity);
      if (!authorizedBroker) {
        return res.status(403).json({
          error:
            "Broker is not authorized for monitor actions yet. Provide Telegram id/username from allowlist.",
        });
      }

      const presetId = String(req.params.presetId || "").trim();
      if (!presetId) return res.status(400).json({ error: "Preset id is required" });
      const brokerUserId = resolveSeaBrokerageBrokerUserId(authorizedBroker).toLowerCase();
      const all = await readSeaBrokerageFilterPresets();
      const before = all.length;
      const next = all.filter(
        (preset) => !(preset.id === presetId && preset.brokerUserId.toLowerCase() === brokerUserId),
      );
      if (before === next.length) {
        return res.status(404).json({ error: "Preset not found" });
      }
      await writeSeaBrokerageFilterPresets(next);
      return res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting sea brokerage filter preset:", error);
      return res.status(500).json({ error: "Failed to delete filter preset" });
    }
  });

  app.post("/api/sea-brokerage-monitor/entries/:entryId/likes/toggle", async (req: AuthRequest, res) => {
    try {
      const telegramIdentity = readSeaBrokerageTelegramIdentity(req);
      const authorizedBroker = await resolveAuthorizedSeaBrokerageBrokerByTelegram(telegramIdentity);
      if (!authorizedBroker) {
        return res.status(403).json({
          error:
            "Broker is not authorized for monitor actions yet. Provide Telegram id/username from allowlist.",
        });
      }

      const entryId = String(req.params.entryId || "").trim();
      if (!entryId) {
        return res.status(400).json({ error: "Entry id is required" });
      }

      const entries = await storage.listSeaBrokerageEntries();
      const targetEntry = entries.find((entry) => entry.id === entryId);
      if (!targetEntry) {
        return res.status(404).json({ error: "Entry not found" });
      }

      if (targetEntry.type !== "bid" && targetEntry.type !== "offer") {
        return res.status(400).json({ error: "Likes are allowed only for BID/OFFER entries" });
      }

      const likerBrokerUserId =
        authorizedBroker.telegramUserId ||
        authorizedBroker.telegramUsername ||
        authorizedBroker.authUserId ||
        `broker:${authorizedBroker.brokerCode.toLowerCase()}`;

      const isSelfLike =
        (!!authorizedBroker.telegramUserId &&
          !!targetEntry.brokerTelegramUserId &&
          authorizedBroker.telegramUserId === targetEntry.brokerTelegramUserId) ||
        (!!authorizedBroker.telegramUsername &&
          !!targetEntry.brokerTelegramUsername &&
          authorizedBroker.telegramUsername.toLowerCase() ===
            targetEntry.brokerTelegramUsername.toLowerCase()) ||
        authorizedBroker.brokerCode.toLowerCase() === targetEntry.brokerCode.toLowerCase();
      if (isSelfLike) {
        return res.status(400).json({ error: "Self-like is not allowed" });
      }

      const likes = await readSeaBrokerageEntryLikes();
      const existingIndex = likes.findIndex(
        (like) =>
          like.entryId === entryId &&
          like.brokerUserId.toLowerCase() === likerBrokerUserId.toLowerCase(),
      );

      let liked = false;
      let alreadyLiked = false;
      if (existingIndex >= 0) {
        liked = true;
        alreadyLiked = true;
      } else {
        likes.push({
          entryId,
          brokerUserId: likerBrokerUserId,
          brokerCode: authorizedBroker.brokerCode,
          brokerName: authorizedBroker.brokerName,
          telegramUsername: authorizedBroker.telegramUsername,
          telegramUserId: authorizedBroker.telegramUserId,
          createdAt: new Date().toISOString(),
        });
        liked = true;
      }

      if (!alreadyLiked) {
        await writeSeaBrokerageEntryLikes(likes);
      }

      let ownerDmDelivered = false;
      let likerDmDelivered = false;
      if (liked && !alreadyLiked) {
        const ownerChat = targetEntry.brokerTelegramUserId
          ? String(targetEntry.brokerTelegramUserId)
          : targetEntry.brokerTelegramUsername
            ? `@${targetEntry.brokerTelegramUsername.replace(/^@+/, "")}`
            : null;
        const likerChat = authorizedBroker.telegramUserId
          ? String(authorizedBroker.telegramUserId)
          : authorizedBroker.telegramUsername
            ? `@${authorizedBroker.telegramUsername.replace(/^@+/, "")}`
            : null;
        const canonical = targetEntry.canonicalView;
        const ownerMessage = `#like_idea 👍\n${authorizedBroker.brokerCode} liked your ${targetEntry.type.toUpperCase()}:\n${canonical}`;
        const likerMessage = `#like_idea 👍\nYou liked ${targetEntry.type.toUpperCase()} by ${targetEntry.brokerCode}:\n${canonical}`;

        if (ownerChat) {
          const dm = await sendSeaBrokerageTelegramDirectMessage(ownerChat, ownerMessage);
          ownerDmDelivered = dm.ok;
          if (!dm.ok) {
            console.warn(
              "[SeaBrokerage][LikeDM][Owner]",
              JSON.stringify({ entryId, ownerChat, error: dm.error }),
            );
          }
        }
        if (likerChat) {
          const dm = await sendSeaBrokerageTelegramDirectMessage(likerChat, likerMessage);
          likerDmDelivered = dm.ok;
          if (!dm.ok) {
            console.warn(
              "[SeaBrokerage][LikeDM][Liker]",
              JSON.stringify({ entryId, likerChat, error: dm.error }),
            );
          }
        }
      }

      const likeCount = likes.filter((like) => like.entryId === entryId).length;
      return res.status(201).json({
        liked,
        alreadyLiked,
        likeCount,
        ownerDmDelivered,
        likerDmDelivered,
      });
    } catch (error: any) {
      console.error("Error toggling sea brokerage entry like:", error);
      return res.status(500).json({ error: "Failed to toggle like" });
    }
  });

  app.get("/api/sea-brokerage-monitor/matches/likes", async (req: AuthRequest, res) => {
    try {
      const likes = await readSeaBrokerageMatchLikes();
      return res.json(likes);
    } catch (error: any) {
      console.error("Error fetching sea brokerage match likes:", error);
      return res.status(500).json({ error: "Failed to fetch match likes" });
    }
  });

  app.post("/api/sea-brokerage-monitor/matches/:matchId/likes", async (req: AuthRequest, res) => {
    try {
      const telegramIdentity = readSeaBrokerageTelegramIdentity(req);
      const authorizedBroker = await resolveAuthorizedSeaBrokerageBrokerByTelegram(telegramIdentity);
      if (!authorizedBroker) {
        return res.status(403).json({
          error:
            "Broker is not authorized for monitor actions yet. Provide Telegram id/username from allowlist.",
        });
      }

      const matchId = String(req.params.matchId || "").trim();
      if (!matchId) {
        return res.status(400).json({ error: "Match id is required" });
      }

      const allEntries = await storage.listSeaBrokerageEntries();
      const match = generateSeaBrokerageMatchSuggestions(allEntries).find((item) => item.id === matchId);
      if (!match) {
        return res.status(404).json({ error: "Match not found" });
      }

      const brokerCode = authorizedBroker.brokerCode.toUpperCase();
      const isParticipant =
        match.bidEntry.brokerCode.toUpperCase() === brokerCode ||
        match.offerEntry.brokerCode.toUpperCase() === brokerCode;
      const isBoss = SEA_BROKERAGE_BOSS_CODES.has(brokerCode) && !isParticipant;
      if (!isParticipant && !isBoss) {
        return res.status(403).json({ error: "Only match participants or boss brokers can like this match" });
      }

      const likerBrokerUserId =
        authorizedBroker.telegramUserId ||
        authorizedBroker.telegramUsername ||
        authorizedBroker.authUserId ||
        `broker:${authorizedBroker.brokerCode.toLowerCase()}`;

      const likes = await readSeaBrokerageMatchLikes();
      const existing = likes.find(
        (item) =>
          item.matchId === matchId &&
          item.likerBrokerUserId.toLowerCase() === likerBrokerUserId.toLowerCase(),
      );
      if (existing) {
        return res.status(200).json({
          liked: true,
          alreadyLiked: true,
          kind: existing.kind,
        });
      }

      const kind: "normal" | "boss" = isBoss ? "boss" : "normal";
      likes.push({
        matchId,
        bidEntryId: match.bidEntry.id,
        offerEntryId: match.offerEntry.id,
        likerBrokerUserId,
        likerBrokerCode: authorizedBroker.brokerCode,
        likerBrokerName: authorizedBroker.brokerName,
        kind,
        createdAt: new Date().toISOString(),
      });
      await writeSeaBrokerageMatchLikes(likes);

      let buyerDmDelivered = false;
      let sellerDmDelivered = false;
      if (kind === "boss") {
        const compactBid = match.bidEntry.canonicalView;
        const compactOffer = match.offerEntry.canonicalView;
        const dmMessage = [
          "#match_priority 💠",
          `${authorizedBroker.brokerCode} marked this match for follow-up`,
          `BID: ${compactBid}`,
          `OFFER: ${compactOffer}`,
        ].join("\n");
        const buyerBrokerChat = match.bidEntry.brokerTelegramUserId
          ? String(match.bidEntry.brokerTelegramUserId)
          : match.bidEntry.brokerTelegramUsername
            ? `@${match.bidEntry.brokerTelegramUsername.replace(/^@+/, "")}`
            : null;
        const sellerBrokerChat = match.offerEntry.brokerTelegramUserId
          ? String(match.offerEntry.brokerTelegramUserId)
          : match.offerEntry.brokerTelegramUsername
            ? `@${match.offerEntry.brokerTelegramUsername.replace(/^@+/, "")}`
            : null;

        if (buyerBrokerChat) {
          const dm = await sendSeaBrokerageTelegramDirectMessage(buyerBrokerChat, dmMessage);
          buyerDmDelivered = dm.ok;
        }
        if (sellerBrokerChat && sellerBrokerChat !== buyerBrokerChat) {
          const dm = await sendSeaBrokerageTelegramDirectMessage(sellerBrokerChat, dmMessage);
          sellerDmDelivered = dm.ok;
        } else {
          sellerDmDelivered = buyerDmDelivered;
        }
      }

      return res.status(201).json({
        liked: true,
        alreadyLiked: false,
        kind,
        buyerDmDelivered,
        sellerDmDelivered,
      });
    } catch (error: any) {
      console.error("Error liking sea brokerage match:", error);
      return res.status(500).json({ error: "Failed to like match" });
    }
  });

  app.post("/api/sea-brokerage-monitor/auth/telegram/login", async (req, res) => {
    try {
      const parsed = seaBrokerageTelegramLoginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const identity = verifyTelegramLoginPayload(parsed.data as TelegramLoginPayload);
      const profile = await resolveAuthorizedSeaBrokerageBrokerByTelegram(identity);
      if (!profile) {
        return res.status(403).json({
          error: "Telegram account is not allowlisted for monitor publishing.",
        });
      }

      const token = signSeaBrokerageMonitorToken(identity);
      return res.status(201).json({
        token,
        authorized: true,
        profile,
      });
    } catch (error: any) {
      console.error("Error during sea brokerage Telegram login:", error);
      return res.status(401).json({ error: error?.message || "Failed to verify Telegram login" });
    }
  });

  app.post("/api/sea-brokerage-monitor/auth/telegram/miniapp", async (req, res) => {
    try {
      const parsed = seaBrokerageTelegramMiniAppLoginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const identity = verifyTelegramMiniAppInitData(
        (parsed.data as TelegramMiniAppLoginPayload).initData,
      );
      const profile = await resolveAuthorizedSeaBrokerageBrokerByTelegram(identity);
      if (!profile) {
        return res.status(403).json({
          error: "Telegram account is not allowlisted for monitor publishing.",
        });
      }

      const token = signSeaBrokerageMonitorToken(identity);
      return res.status(201).json({
        token,
        authorized: true,
        profile,
      });
    } catch (error: any) {
      console.error("Error during sea brokerage Telegram Mini App login:", error);
      return res
        .status(401)
        .json({ error: error?.message || "Failed to verify Telegram Mini App login" });
    }
  });

  app.post("/api/sea-brokerage-monitor/auth/telegram/code/request", async (req, res) => {
    try {
      const parsed = seaBrokerageTelegramCodeRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const telegramUsername = parsed.data.telegramUsername.trim().replace(/^@+/, "").toLowerCase();
      const profile = await resolveAuthorizedSeaBrokerageBrokerByTelegram({ telegramUsername });
      if (!profile?.isActive) {
        return res.status(404).json({ error: "Broker is not allowlisted for monitor publishing." });
      }
      if (!profile.telegramUserId) {
        return res.status(400).json({ error: "Allowlist entry has no Telegram user id." });
      }

      const { code } = issueSeaBrokerageTelegramOtp(telegramUsername);
      const dmResult = await sendSeaBrokerageTelegramDirectMessage(
        profile.telegramUserId,
        [
          "Spike Monitor login code",
          `Code: ${code}`,
          "Valid for 10 minutes.",
          "If this was not requested by you, ignore this message.",
        ].join("\n"),
      );

      if (!dmResult.ok) {
        return res.status(502).json({
          error:
            dmResult.error ||
            "Failed to send login code in Telegram. Ensure broker started the bot chat first.",
        });
      }

      return res.status(201).json({ ok: true });
    } catch (error: any) {
      console.error("Error requesting sea brokerage Telegram login code:", error);
      return res.status(500).json({ error: "Failed to request Telegram login code" });
    }
  });

  app.post("/api/sea-brokerage-monitor/auth/telegram/link/request", async (req, res) => {
    try {
      const parsed = seaBrokerageTelegramMagicLinkRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const telegramUsername = parsed.data.telegramUsername.trim().replace(/^@+/, "").toLowerCase();
      const profile = await resolveAuthorizedSeaBrokerageBrokerByTelegram({ telegramUsername });
      if (!profile?.isActive) {
        return res.status(404).json({ error: "Broker is not allowlisted for monitor publishing." });
      }
      if (!profile.telegramUserId) {
        return res.status(400).json({ error: "Allowlist entry has no Telegram user id." });
      }

      const { token } = issueSeaBrokerageTelegramMagicLink(telegramUsername);
      const baseUrl =
        (process.env.APP_BASE_URL || "").trim().replace(/\/+$/, "") ||
        `${req.protocol}://${req.get("host") || "localhost:5173"}`;
      const authLink = `${baseUrl}/spike-monitor?tg_monitor_login_token=${encodeURIComponent(token)}`;

      const dmResult = await sendSeaBrokerageTelegramDirectMessage(
        profile.telegramUserId,
        [
          "Spike Monitor sign-in",
          "",
          "Tap the link below to sign in:",
          authLink,
          "",
          "Link is valid for 10 minutes and can be used once.",
        ].join("\n"),
      );

      if (!dmResult.ok) {
        return res.status(502).json({
          error:
            dmResult.error ||
            "Failed to send Telegram sign-in link. Ensure broker started the bot chat first.",
        });
      }

      return res.status(201).json({ ok: true });
    } catch (error: any) {
      console.error("Error requesting sea brokerage Telegram magic link:", error);
      return res.status(500).json({ error: "Failed to request Telegram sign-in link" });
    }
  });

  app.post("/api/sea-brokerage-monitor/auth/telegram/link/consume", async (req, res) => {
    try {
      const parsed = seaBrokerageTelegramMagicLinkConsumeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const consumed = consumeSeaBrokerageTelegramMagicLink(parsed.data.token);
      if (!consumed?.username) {
        return res.status(401).json({ error: "Invalid or expired sign-in link." });
      }

      const profile = await resolveAuthorizedSeaBrokerageBrokerByTelegram({
        telegramUsername: consumed.username,
      });
      if (!profile?.isActive) {
        return res.status(404).json({ error: "Broker is not allowlisted for monitor publishing." });
      }

      const token = signSeaBrokerageMonitorToken({
        telegramUserId: profile.telegramUserId || `broker:${profile.brokerCode}`,
        telegramUsername: profile.telegramUsername || consumed.username,
      });
      return res.status(201).json({
        token,
        authorized: true,
        profile,
      });
    } catch (error: any) {
      console.error("Error consuming sea brokerage Telegram magic link:", error);
      return res.status(500).json({ error: "Failed to complete Telegram sign-in" });
    }
  });

  app.post("/api/sea-brokerage-monitor/auth/telegram/code/verify", async (req, res) => {
    try {
      const parsed = seaBrokerageTelegramCodeVerifySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const telegramUsername = parsed.data.telegramUsername.trim().replace(/^@+/, "").toLowerCase();
      const profile = await resolveAuthorizedSeaBrokerageBrokerByTelegram({ telegramUsername });
      if (!profile?.isActive) {
        return res.status(404).json({ error: "Broker is not allowlisted for monitor publishing." });
      }

      const ok = verifySeaBrokerageTelegramOtp(telegramUsername, parsed.data.code);
      if (!ok) {
        return res.status(401).json({ error: "Invalid or expired Telegram login code." });
      }

      const token = signSeaBrokerageMonitorToken({
        telegramUserId: profile.telegramUserId || `broker:${profile.brokerCode}`,
        telegramUsername: profile.telegramUsername || telegramUsername,
      });
      return res.status(201).json({
        token,
        authorized: true,
        profile,
      });
    } catch (error: any) {
      console.error("Error verifying sea brokerage Telegram login code:", error);
      return res.status(500).json({ error: "Failed to verify Telegram login code" });
    }
  });

  app.get("/api/sea-brokerage-monitor/auth/telegram/me", async (req: AuthRequest, res) => {
    try {
      const identity = readSeaBrokerageMonitorIdentityFromToken(req);
      if (!identity) {
        return res.status(401).json({ error: "Monitor auth token required" });
      }

      const profile = await resolveAuthorizedSeaBrokerageBrokerByTelegram(identity);
      if (!profile) {
        return res.status(403).json({ error: "Telegram account is not allowlisted." });
      }

      return res.json({
        authenticated: true,
        identity,
        profile,
      });
    } catch (error: any) {
      console.error("Error resolving sea brokerage Telegram monitor session:", error);
      return res.status(500).json({ error: "Failed to resolve monitor session" });
    }
  });

  app.get("/api/sea-brokerage-monitor/locations", async (_req, res) => {
    try {
      const locations = await readSeaBrokerageCustomLocations();
      return res.json({ locations });
    } catch (error: any) {
      console.error("Error listing sea brokerage custom locations:", error);
      return res.status(500).json({ error: "Failed to list custom locations" });
    }
  });

  app.get("/api/sea-brokerage-monitor/countries", async (_req, res) => {
    try {
      const [savedCountries, entries] = await Promise.all([
        readSeaBrokerageCountries(),
        storage.listSeaBrokerageEntries(),
      ]);
      const derivedCountries = deriveSeaBrokerageCountriesFromEntries(entries);
      const countries = mergeSeaBrokerageCountries(savedCountries, derivedCountries);
      return res.json({ countries });
    } catch (error: any) {
      console.error("Error listing sea brokerage countries:", error);
      return res.status(500).json({ error: "Failed to list countries" });
    }
  });

  app.post("/api/sea-brokerage-monitor/countries", async (req: AuthRequest, res) => {
    try {
      const telegramIdentity = readSeaBrokerageTelegramIdentity(req);
      const authorizedBroker = await resolveAuthorizedSeaBrokerageBrokerByTelegram(telegramIdentity);
      if (!authorizedBroker) {
        return res.status(403).json({
          error: "Broker is not authorized to add countries.",
        });
      }

      const parsed = seaBrokerageCountryCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const label = normalizeCityLabel(parsed.data.displayLabel);
      if (!/^[A-Za-z][A-Za-z\s'-]{1,79}$/.test(label)) {
        return res.status(400).json({
          error: "Country name must use English letters and can include spaces, apostrophe, or hyphen.",
        });
      }

      const code = parsed.data.countryCode.toUpperCase();
      const countryCodeAlpha3 = parsed.data.countryCodeAlpha3.toUpperCase();
      if (!/^[A-Z]{2}$/.test(code) || !/^[A-Z]{3}$/.test(countryCodeAlpha3)) {
        return res.status(400).json({ error: "Invalid country code format." });
      }

      const [savedCountries, entries] = await Promise.all([
        readSeaBrokerageCountries(),
        storage.listSeaBrokerageEntries(),
      ]);
      const current = mergeSeaBrokerageCountries(
        savedCountries,
        deriveSeaBrokerageCountriesFromEntries(entries),
      );

      const duplicate = current.find(
        (item) =>
          item.code === code ||
          item.displayLabel.trim().toLowerCase() === label.toLowerCase(),
      );
      if (duplicate) {
        return res.status(200).json({ country: duplicate, duplicate: true });
      }

      const created: SeaBrokerageCountryDictionaryEntry = {
        code,
        displayLabel: label,
        countryCodeAlpha3,
        compactDisplay: countryCodeAlpha3,
      };

      const next = mergeSeaBrokerageCountries(savedCountries, [created]);
      await storage.upsertAppSetting(SEA_BROKERAGE_COUNTRIES_KEY, JSON.stringify(next));
      return res.status(201).json({ country: created, duplicate: false });
    } catch (error: any) {
      console.error("Error creating sea brokerage country:", error);
      return res.status(500).json({ error: "Failed to create country" });
    }
  });

  app.get("/api/sea-brokerage-monitor/commodities", async (_req, res) => {
    try {
      const [savedCommodities, entries] = await Promise.all([
        readSeaBrokerageCommodities(),
        storage.listSeaBrokerageEntries(),
      ]);
      const derivedCommodities = deriveSeaBrokerageCommoditiesFromEntries(entries);
      const commodities = mergeSeaBrokerageCommodities(savedCommodities, derivedCommodities);
      return res.json({ commodities });
    } catch (error: any) {
      console.error("Error listing sea brokerage commodities:", error);
      return res.status(500).json({ error: "Failed to list commodities" });
    }
  });

  app.get("/api/sea-brokerage-monitor/basis", async (_req, res) => {
    try {
      const [savedBasis, entries] = await Promise.all([
        readSeaBrokerageBasis(),
        storage.listSeaBrokerageEntries(),
      ]);
      const derivedBasis = deriveSeaBrokerageBasisFromEntries(entries);
      const basis = mergeSeaBrokerageBasis(SEA_BROKERAGE_DEFAULT_BASIS, savedBasis, derivedBasis);
      return res.json({ basis });
    } catch (error: any) {
      console.error("Error listing sea brokerage basis:", error);
      return res.status(500).json({ error: "Failed to list basis" });
    }
  });

  app.post("/api/sea-brokerage-monitor/commodities", async (req: AuthRequest, res) => {
    try {
      const telegramIdentity = readSeaBrokerageTelegramIdentity(req);
      const authorizedBroker = await resolveAuthorizedSeaBrokerageBrokerByTelegram(telegramIdentity);
      if (!authorizedBroker) {
        return res.status(403).json({
          error: "Broker is not authorized to add commodities.",
        });
      }

      const parsed = seaBrokerageCommodityCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const label = normalizeCityLabel(parsed.data.displayLabel);
      if (!/^[A-Za-z0-9][A-Za-z0-9\s%.,()'\/-]{1,79}$/.test(label)) {
        return res.status(400).json({
          error: "Commodity name must use English letters/numbers and basic punctuation.",
        });
      }

      const requestedCode = String(parsed.data.code || "").trim().toLowerCase();
      const code = buildCommodityCode(requestedCode || label);
      const group = parsed.data.group || "processed";

      const [savedCommodities, entries] = await Promise.all([
        readSeaBrokerageCommodities(),
        storage.listSeaBrokerageEntries(),
      ]);
      const current = mergeSeaBrokerageCommodities(
        savedCommodities,
        deriveSeaBrokerageCommoditiesFromEntries(entries),
      );

      const duplicate = current.find(
        (item) =>
          item.code === code ||
          item.displayLabel.trim().toLowerCase() === label.toLowerCase(),
      );
      if (duplicate) {
        return res.status(200).json({ commodity: duplicate, duplicate: true });
      }

      const created: SeaBrokerageCommodityDictionaryEntry = {
        code,
        displayLabel: label,
        compactDisplay: label.toUpperCase(),
        group,
      };

      const next = mergeSeaBrokerageCommodities(savedCommodities, [created]);
      await storage.upsertAppSetting(SEA_BROKERAGE_COMMODITIES_KEY, JSON.stringify(next));
      return res.status(201).json({ commodity: created, duplicate: false });
    } catch (error: any) {
      console.error("Error creating sea brokerage commodity:", error);
      return res.status(500).json({ error: "Failed to create commodity" });
    }
  });

  app.post("/api/sea-brokerage-monitor/locations", async (req: AuthRequest, res) => {
    try {
      const telegramIdentity = readSeaBrokerageTelegramIdentity(req);
      const authorizedBroker = await resolveAuthorizedSeaBrokerageBrokerByTelegram(telegramIdentity);
      if (!authorizedBroker) {
        return res.status(403).json({
          error: "Broker is not authorized to add custom locations.",
        });
      }

      const parsed = seaBrokerageLocationCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const label = normalizeCityLabel(parsed.data.displayLabel);
      if (!/^[A-Za-z][A-Za-z\s'-]{1,59}$/.test(label)) {
        return res.status(400).json({
          error: "City must be in English letters and can include spaces, apostrophe, or hyphen.",
        });
      }

      const countryCode = parsed.data.countryCode.toUpperCase();
      const countryCodeAlpha3 = parsed.data.countryCodeAlpha3.toUpperCase();
      if (!/^[A-Z]{2}$/.test(countryCode) || !/^[A-Z]{3}$/.test(countryCodeAlpha3)) {
        return res.status(400).json({ error: "Invalid country code format." });
      }

      const current = await readSeaBrokerageCustomLocations();
      const duplicate = current.find(
        (item) =>
          item.countryCode === countryCode &&
          item.displayLabel.trim().toLowerCase() === label.toLowerCase(),
      );

      if (duplicate) {
        return res.status(200).json({ location: duplicate, duplicate: true });
      }

      const code = buildCustomLocationCode(label, countryCode);
      const collision = current.find((item) => item.code === code);
      const resolvedCode = collision ? `${code}_${createHash("md5").update(label + countryCode).digest("hex").slice(0, 4)}` : code;

      const created: SeaBrokerageCustomLocation = {
        code: resolvedCode,
        displayLabel: label,
        countryCode,
        countryCodeAlpha3,
        compactDisplay: label.toUpperCase(),
      };

      const next = [...current, created];
      await storage.upsertAppSetting(
        SEA_BROKERAGE_CUSTOM_LOCATIONS_KEY,
        JSON.stringify(next),
      );

      return res.status(201).json({ location: created, duplicate: false });
    } catch (error: any) {
      console.error("Error creating sea brokerage custom location:", error);
      return res.status(500).json({ error: "Failed to create custom location" });
    }
  });

  app.get("/api/sea-brokerage-monitor/companies", async (_req, res) => {
    try {
      const [savedCompanies, entries] = await Promise.all([
        readSeaBrokerageCompanies(),
        storage.listSeaBrokerageEntries(),
      ]);
      const derivedCompanies = deriveSeaBrokerageCompaniesFromEntries(entries);
      const companies = mergeSeaBrokerageCompanies(savedCompanies, derivedCompanies);
      return res.json({ companies });
    } catch (error: any) {
      console.error("Error listing sea brokerage companies:", error);
      return res.status(500).json({ error: "Failed to list companies" });
    }
  });

  app.post("/api/sea-brokerage-monitor/companies", async (req: AuthRequest, res) => {
    try {
      const telegramIdentity = readSeaBrokerageTelegramIdentity(req);
      const authorizedBroker = await resolveAuthorizedSeaBrokerageBrokerByTelegram(telegramIdentity);
      if (!authorizedBroker) {
        return res.status(403).json({
          error: "Broker is not authorized to add companies.",
        });
      }

      const parsed = seaBrokerageCompanyCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const label = normalizeCompanyLabel(parsed.data.displayLabel);
      if (!isSeaBrokerageCompanyLabelAllowed(label)) {
        return res.status(400).json({
          error: "Company name must use Latin letters/numbers and basic punctuation.",
        });
      }

      const [savedCompanies, entries] = await Promise.all([
        readSeaBrokerageCompanies(),
        storage.listSeaBrokerageEntries(),
      ]);
      const current = mergeSeaBrokerageCompanies(
        savedCompanies,
        deriveSeaBrokerageCompaniesFromEntries(entries),
      );
      const duplicate = current.find(
        (item) => item.displayLabel.trim().toLowerCase() === label.toLowerCase(),
      );
      if (duplicate) {
        return res.status(200).json({ company: duplicate, duplicate: true });
      }

      const id = buildCompanyId(label);
      const collision = current.find((item) => item.id === id);
      const resolvedId = collision
        ? `${id}_${createHash("md5").update(label).digest("hex").slice(0, 4)}`
        : id;

      const created: SeaBrokerageCompanyDictionaryEntry = {
        id: resolvedId,
        displayLabel: label,
        compactDisplay: label.toUpperCase(),
      };

      const next = mergeSeaBrokerageCompanies(savedCompanies, [created]);
      await storage.upsertAppSetting(SEA_BROKERAGE_COMPANIES_KEY, JSON.stringify(next));

      return res.status(201).json({ company: created, duplicate: false });
    } catch (error: any) {
      console.error("Error creating sea brokerage company:", error);
      return res.status(500).json({ error: "Failed to create company" });
    }
  });

  app.get("/api/sea-brokerage-monitor/broker-auth/me", async (req: AuthRequest, res) => {
      try {
        const profile = await resolveAuthorizedSeaBrokerageBrokerByTelegram(readSeaBrokerageTelegramIdentity(req));
        return res.json({
          authorized: !!profile,
          profile,
        });
      } catch (error: any) {
        console.error("Error resolving sea brokerage broker auth profile:", error);
        return res.status(500).json({ error: "Failed to resolve sea brokerage broker profile" });
      }
    });

  app.get(
    "/api/sea-brokerage-monitor/broker-auth/list",
    authenticateToken,
    async (req: AuthRequest, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: "Unauthorized" });
        }
        if (!hasAdminPermissions(req.user)) {
          return res.status(403).json({ error: "Only admin users can view broker allowlist" });
        }

        const allowlist = await listSeaBrokerageBrokerAllowlist();
        return res.json({ allowlist });
      } catch (error: any) {
        console.error("Error listing sea brokerage broker allowlist:", error);
        return res.status(500).json({ error: "Failed to list broker allowlist" });
      }
    },
  );

  app.post(
    "/api/sea-brokerage-monitor/broker-auth/upsert",
    authenticateToken,
    async (req: AuthRequest, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: "Unauthorized" });
        }
        if (!hasAdminPermissions(req.user)) {
          return res.status(403).json({ error: "Only admin users can update broker allowlist" });
        }

        const parsed = upsertSeaBrokerageBrokerAuthSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: fromZodError(parsed.error).message });
        }

        if (
          !parsed.data.authUserId &&
          !parsed.data.authEmail &&
          !parsed.data.telegramUserId &&
          !parsed.data.telegramUsername
        ) {
          return res.status(400).json({
            error:
              "Provide at least one identity binding (authUserId, authEmail, telegramUserId, or telegramUsername)",
          });
        }

        const updated = await storage.upsertSeaBrokerageBrokerAuth({
          ...parsed.data,
          authUserId: parsed.data.authUserId ?? null,
          authEmail: parsed.data.authEmail ?? null,
          telegramUserId: parsed.data.telegramUserId ?? null,
          telegramUsername: parsed.data.telegramUsername ?? null,
        });

        return res.status(201).json({ brokerAuth: updated });
      } catch (error: any) {
        console.error("Error upserting sea brokerage broker allowlist entry:", error);
        return res.status(500).json({ error: "Failed to update broker allowlist" });
      }
    },
  );

  app.post("/api/sea-brokerage-monitor/entries", async (req: AuthRequest, res) => {
    try {
      const telegramIdentity = readSeaBrokerageTelegramIdentity(req);
      const authorizedBroker = await resolveAuthorizedSeaBrokerageBrokerByTelegram(telegramIdentity);
      if (!authorizedBroker) {
        return res.status(403).json({
          error:
            "Broker is not authorized for monitor publishing yet. Provide Telegram id/username from allowlist.",
        });
      }

      const parsed = createSeaBrokerageEntryRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const destinationPortCodes = resolveDestinationPortCodesFromPayload(parsed.data);
      const destinationPortCodeValue = destinationPortCodes.length
        ? destinationPortCodes.join("|")
        : parsed.data.destinationPortCode ?? null;

      if (parsed.data.type === "trade") {
        const hasSellerBrokerIdentity =
          !!parsed.data.tradeSellerBrokerTelegramUserId || !!parsed.data.tradeSellerBrokerTelegramUsername;
        const hasBuyerBrokerIdentity =
          !!parsed.data.tradeBuyerBrokerTelegramUserId || !!parsed.data.tradeBuyerBrokerTelegramUsername;
        if (!hasSellerBrokerIdentity || !hasBuyerBrokerIdentity) {
          return res.status(400).json({
            error: "TRADE requires both seller broker and buyer broker Telegram identities.",
          });
        }
      }

      const created = await storage.createSeaBrokerageEntry({
        ...parsed.data,
        brokerUserId:
          authorizedBroker.telegramUserId ||
          authorizedBroker.telegramUsername ||
          authorizedBroker.authUserId ||
          `broker:${authorizedBroker.brokerCode.toLowerCase()}`,
        brokerEmail: authorizedBroker.authEmail ?? null,
        brokerTelegramUserId: authorizedBroker.telegramUserId,
        brokerTelegramUsername: authorizedBroker.telegramUsername,
        brokerCode: authorizedBroker.brokerCode,
        brokerName: authorizedBroker.brokerName,
        companyName: authorizedBroker.companyName,
        tradeSellerBrokerTelegramUserId: parsed.data.tradeSellerBrokerTelegramUserId ?? null,
        tradeSellerBrokerTelegramUsername: parsed.data.tradeSellerBrokerTelegramUsername ?? null,
        tradeBuyerBrokerTelegramUserId: parsed.data.tradeBuyerBrokerTelegramUserId ?? null,
        tradeBuyerBrokerTelegramUsername: parsed.data.tradeBuyerBrokerTelegramUsername ?? null,
        gradeOrSpec: parsed.data.gradeOrSpec ?? "",
        price:
          parsed.data.price === null || parsed.data.price === undefined
            ? null
            : String(parsed.data.price),
        priceFrom:
          parsed.data.priceFrom === null || parsed.data.priceFrom === undefined
            ? null
            : String(parsed.data.priceFrom),
        priceTo:
          parsed.data.priceTo === null || parsed.data.priceTo === undefined
            ? null
            : String(parsed.data.priceTo),
        isNewCrop: !!parsed.data.isNewCrop,
        sellerCommission:
          parsed.data.sellerCommission === null || parsed.data.sellerCommission === undefined
            ? null
            : String(parsed.data.sellerCommission),
        buyerCommission:
          parsed.data.buyerCommission === null || parsed.data.buyerCommission === undefined
            ? null
            : String(parsed.data.buyerCommission),
        destinationPortCode: destinationPortCodeValue,
        telegramRelayStatus: "queued",
      });

      void processSeaBrokerageEntryRelay(created, authorizedBroker.telegramUsername);
      res.status(201).json(mapSeaBrokerageEntryToClientShape(created));
    } catch (error: any) {
      console.error("Error creating sea brokerage monitor entry:", error);
      res.status(500).json({ error: "Failed to create sea brokerage monitor entry" });
    }
  });

  app.patch("/api/sea-brokerage-monitor/entries/:entryId", async (req: AuthRequest, res) => {
    try {
      const telegramIdentity = readSeaBrokerageTelegramIdentity(req);
      const authorizedBroker = await resolveAuthorizedSeaBrokerageBrokerByTelegram(telegramIdentity);
      if (!authorizedBroker) {
        return res.status(403).json({
          error:
            "Broker is not authorized for monitor publishing yet. Provide Telegram id/username from allowlist.",
        });
      }

      const entryId = String(req.params.entryId || "").trim();
      if (!entryId) return res.status(400).json({ error: "Entry id is required" });

      const parsed = updateSeaBrokerageEntryRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const entries = await storage.listSeaBrokerageEntries();
      const existing = entries.find((entry) => entry.id === entryId);
      if (!existing) {
        return res.status(404).json({ error: "Entry not found" });
      }

      const actor = resolveSeaBrokerageActorContext(authorizedBroker);
      const isAuthor = isSeaBrokerageEntryAuthor(existing, actor);
      if (!isAuthor && !actor.isBoss) {
        return res.status(403).json({ error: "Only author or boss can edit this entry" });
      }

      const payload = parsed.data;
      const destinationPortCodes = resolveDestinationPortCodesFromPayload(payload);
      const destinationPortCodeValue = destinationPortCodes.length
        ? destinationPortCodes.join("|")
        : payload.destinationPortCode ?? null;
      const typeChanged = payload.type !== existing.type;
      if (typeChanged) {
        const canSwitchBidOffer =
          (existing.type === "bid" || existing.type === "offer") &&
          (payload.type === "bid" || payload.type === "offer");
        if (!canSwitchBidOffer) {
          return res.status(400).json({ error: "Only BID/OFFER switch is allowed" });
        }
      }
      if (payload.type === "trade") {
        const hasSellerBrokerIdentity =
          !!payload.tradeSellerBrokerTelegramUserId || !!payload.tradeSellerBrokerTelegramUsername;
        const hasBuyerBrokerIdentity =
          !!payload.tradeBuyerBrokerTelegramUserId || !!payload.tradeBuyerBrokerTelegramUsername;
        if (!hasSellerBrokerIdentity || !hasBuyerBrokerIdentity) {
          return res.status(400).json({
            error: "TRADE requires both seller broker and buyer broker Telegram identities.",
          });
        }
      }

      const updated = await storage.updateSeaBrokerageEntry(entryId, {
        type: payload.type,
        sellerName: payload.sellerName ?? null,
        buyerName: payload.buyerName ?? null,
        tradeSellerBrokerTelegramUserId: payload.tradeSellerBrokerTelegramUserId ?? null,
        tradeSellerBrokerTelegramUsername: payload.tradeSellerBrokerTelegramUsername ?? null,
        tradeBuyerBrokerTelegramUserId: payload.tradeBuyerBrokerTelegramUserId ?? null,
        tradeBuyerBrokerTelegramUsername: payload.tradeBuyerBrokerTelegramUsername ?? null,
        originCountry: payload.originCountry ?? null,
        originCountryCode: payload.originCountryCode ?? null,
        commodity: payload.commodity,
        commodityLabel: payload.commodityLabel,
        gradeOrSpec: payload.gradeOrSpec ?? "",
        quantityMt: payload.quantityMt ?? null,
        tolerancePct: payload.tolerancePct ?? null,
        volumeFrom: payload.volumeFrom,
        volumeTo: payload.volumeTo,
        volumeUnit: payload.volumeUnit,
        basis: payload.basis,
        paymentTerms: payload.paymentTerms ?? null,
        isNewCrop: !!payload.isNewCrop,
        sellerCommission:
          payload.sellerCommission === null || payload.sellerCommission === undefined
            ? null
            : String(payload.sellerCommission),
        buyerCommission:
          payload.buyerCommission === null || payload.buyerCommission === undefined
            ? null
            : String(payload.buyerCommission),
        destinationPortCode: destinationPortCodeValue,
        destinationPort: payload.destinationPort,
        destinationCountryCode: payload.destinationCountryCode ?? null,
        destinationCountry: payload.destinationCountry,
        periodType: payload.periodType,
        periodLabel: payload.periodLabel,
        periodStart: payload.periodStart ?? null,
        periodEnd: payload.periodEnd ?? null,
        price:
          payload.price === null || payload.price === undefined ? null : String(payload.price),
        priceFrom:
          payload.priceFrom === null || payload.priceFrom === undefined
            ? null
            : String(payload.priceFrom),
        priceTo:
          payload.priceTo === null || payload.priceTo === undefined
            ? null
            : String(payload.priceTo),
        currency: payload.currency,
        transportType: payload.transportType,
        note: payload.note ?? null,
        canonicalView: payload.canonicalView,
      });

      if (!isAuthor && actor.isBoss) {
        const authorChat = existing.brokerTelegramUserId
          ? String(existing.brokerTelegramUserId)
          : existing.brokerTelegramUsername
            ? `@${existing.brokerTelegramUsername.replace(/^@+/, "")}`
            : null;
        if (authorChat) {
          await sendSeaBrokerageTelegramDirectMessage(
            authorChat,
            [
              "#entry_update ✍️",
              `${actor.actorCode} edited your ${existing.type.toUpperCase()} entry`,
              updated.canonicalView,
            ].join("\n"),
          );
        }
      }

      return res.json(mapSeaBrokerageEntryToClientShape(updated));
    } catch (error: any) {
      console.error("Error updating sea brokerage monitor entry:", error);
      return res.status(500).json({ error: "Failed to update sea brokerage monitor entry" });
    }
  });

  app.delete("/api/sea-brokerage-monitor/entries/:entryId", async (req: AuthRequest, res) => {
    try {
      const telegramIdentity = readSeaBrokerageTelegramIdentity(req);
      const authorizedBroker = await resolveAuthorizedSeaBrokerageBrokerByTelegram(telegramIdentity);
      if (!authorizedBroker) {
        return res.status(403).json({
          error:
            "Broker is not authorized for monitor publishing yet. Provide Telegram id/username from allowlist.",
        });
      }

      const entryId = String(req.params.entryId || "").trim();
      if (!entryId) return res.status(400).json({ error: "Entry id is required" });

      const entries = await storage.listSeaBrokerageEntries();
      const existing = entries.find((entry) => entry.id === entryId);
      if (!existing) {
        return res.status(404).json({ error: "Entry not found" });
      }

      const actor = resolveSeaBrokerageActorContext(authorizedBroker);
      const isAuthor = isSeaBrokerageEntryAuthor(existing, actor);
      if (!isAuthor && !actor.isBoss) {
        return res.status(403).json({ error: "Only author or boss can delete this entry" });
      }

      if (!isSameSeaBrokerageBusinessDay(existing.createdAt, new Date())) {
        return res.status(400).json({
          error: "Entry can be deleted only on publication day. Next day use EDIT + REPOST.",
        });
      }

      const deleted = await storage.deleteSeaBrokerageEntry(entryId);
      if (!deleted) {
        return res.status(404).json({ error: "Entry not found" });
      }

      const [entryLikes, matchLikes] = await Promise.all([
        readSeaBrokerageEntryLikes(),
        readSeaBrokerageMatchLikes(),
      ]);
      const nextEntryLikes = entryLikes.filter((item) => item.entryId !== entryId);
      const nextMatchLikes = matchLikes.filter(
        (item) => item.bidEntryId !== entryId && item.offerEntryId !== entryId,
      );
      if (nextEntryLikes.length !== entryLikes.length) {
        await writeSeaBrokerageEntryLikes(nextEntryLikes);
      }
      if (nextMatchLikes.length !== matchLikes.length) {
        await writeSeaBrokerageMatchLikes(nextMatchLikes);
      }

      if (!isAuthor && actor.isBoss) {
        const authorChat = existing.brokerTelegramUserId
          ? String(existing.brokerTelegramUserId)
          : existing.brokerTelegramUsername
            ? `@${existing.brokerTelegramUsername.replace(/^@+/, "")}`
            : null;
        if (authorChat) {
          await sendSeaBrokerageTelegramDirectMessage(
            authorChat,
            [
              "#entry_deleted 🗑️",
              `${actor.actorCode} deleted your ${existing.type.toUpperCase()} entry`,
              existing.canonicalView,
            ].join("\n"),
          );
        }
      }

      return res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting sea brokerage monitor entry:", error);
      return res.status(500).json({ error: "Failed to delete sea brokerage monitor entry" });
    }
  });

  app.post("/api/sea-brokerage-monitor/entries/:entryId/repost", async (req: AuthRequest, res) => {
    try {
      const telegramIdentity = readSeaBrokerageTelegramIdentity(req);
      const authorizedBroker = await resolveAuthorizedSeaBrokerageBrokerByTelegram(telegramIdentity);
      if (!authorizedBroker) {
        return res.status(403).json({
          error:
            "Broker is not authorized for monitor publishing yet. Provide Telegram id/username from allowlist.",
        });
      }

      const entryId = String(req.params.entryId || "").trim();
      if (!entryId) return res.status(400).json({ error: "Entry id is required" });

      const entries = await storage.listSeaBrokerageEntries();
      const source = entries.find((entry) => entry.id === entryId);
      if (!source) {
        return res.status(404).json({ error: "Entry not found" });
      }

      const actor = resolveSeaBrokerageActorContext(authorizedBroker);
      const isAuthor = isSeaBrokerageEntryAuthor(source, actor);
      if (!isAuthor && !actor.isBoss) {
        return res.status(403).json({ error: "Only author or boss can repost this entry" });
      }

      if (isSameSeaBrokerageBusinessDay(source.createdAt, new Date())) {
        return res.status(400).json({
          error: "Use DELETE on publication day. REPOST is available starting next day.",
        });
      }

      const created = await storage.createSeaBrokerageEntry({
        type: source.type,
        brokerUserId: source.brokerUserId,
        brokerEmail: source.brokerEmail,
        brokerTelegramUserId: source.brokerTelegramUserId,
        brokerTelegramUsername: source.brokerTelegramUsername,
        brokerCode: source.brokerCode,
        brokerName: source.brokerName,
        companyName: source.companyName,
        sellerName: source.sellerName,
        buyerName: source.buyerName,
        tradeSellerBrokerTelegramUserId: source.tradeSellerBrokerTelegramUserId,
        tradeSellerBrokerTelegramUsername: source.tradeSellerBrokerTelegramUsername,
        tradeBuyerBrokerTelegramUserId: source.tradeBuyerBrokerTelegramUserId,
        tradeBuyerBrokerTelegramUsername: source.tradeBuyerBrokerTelegramUsername,
        originCountry: source.originCountry,
        originCountryCode: source.originCountryCode,
        commodity: source.commodity,
        commodityLabel: source.commodityLabel,
        gradeOrSpec: source.gradeOrSpec,
        quantityMt: source.quantityMt,
        tolerancePct: source.tolerancePct,
        volumeFrom: source.volumeFrom,
        volumeTo: source.volumeTo,
        volumeUnit: source.volumeUnit,
        basis: source.basis,
        paymentTerms: source.paymentTerms,
        isNewCrop: !!source.isNewCrop,
        sellerCommission: source.sellerCommission,
        buyerCommission: source.buyerCommission,
        destinationPortCode: source.destinationPortCode,
        destinationPort: source.destinationPort,
        destinationCountryCode: source.destinationCountryCode,
        destinationCountry: source.destinationCountry,
        periodType: source.periodType,
        periodLabel: source.periodLabel,
        periodStart: source.periodStart,
        periodEnd: source.periodEnd,
        price: source.price,
        priceFrom: source.priceFrom,
        priceTo: source.priceTo,
        currency: source.currency,
        transportType: source.transportType,
        note: source.note,
        canonicalView: source.canonicalView,
        telegramRelayStatus: "queued",
        telegramRelayMessage: null,
        telegramMessageId: null,
      });

      void processSeaBrokerageEntryRelay(created, source.brokerTelegramUsername);

      if (!isAuthor && actor.isBoss) {
        const authorChat = source.brokerTelegramUserId
          ? String(source.brokerTelegramUserId)
          : source.brokerTelegramUsername
            ? `@${source.brokerTelegramUsername.replace(/^@+/, "")}`
            : null;
        if (authorChat) {
          await sendSeaBrokerageTelegramDirectMessage(
            authorChat,
            [
              "#entry_repost 🔁",
              `${actor.actorCode} reposted your ${source.type.toUpperCase()} entry`,
              created.canonicalView,
            ].join("\n"),
          );
        }
      }

      return res.status(201).json(mapSeaBrokerageEntryToClientShape(created));
    } catch (error: any) {
      console.error("Error reposting sea brokerage monitor entry:", error);
      return res.status(500).json({ error: "Failed to repost sea brokerage monitor entry" });
    }
  });

  // ===== FORWARD ORDERS =====

  // Get forward orders
  app.get("/api/forward/orders", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { commodity, status, side } = req.query;
      const commodityStr = typeof commodity === "string" ? commodity : null;
      const statusStr = typeof status === "string" ? status : null;
      const sideStr = typeof side === "string" ? side : null;
      const whereConditions: any[] = [];

      if (commodityStr) {
        whereConditions.push(eq(forwardOrders.commodity, commodityStr));
      }
      if (statusStr) {
        whereConditions.push(eq(forwardOrders.status, statusStr as any));
      }
      if (sideStr) {
        whereConditions.push(eq(forwardOrders.side, sideStr as any));
      }

      const orders = await db
        .select()
        .from(forwardOrders)
        .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
        .orderBy(desc(forwardOrders.createdAt));

      res.json(orders);
    } catch (error: any) {
      console.error("Error fetching forward orders:", error);
      res.status(500).json({ error: "Failed to fetch forward orders" });
    }
  });

  // Create forward order
  app.post("/api/forward/orders", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const parsed = insertForwardOrderSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const orderData = parsed.data;

      // Compute expiry window if expiryHalf, expiryMonth, expiryYear provided
      let windowComputed: {
        window?: string;
        windowStart?: Date;
        windowEnd?: Date;
        settlementDate?: Date;
      } = {};

      if (parsed.data.expiryHalf && parsed.data.expiryMonth && parsed.data.expiryYear) {
        try {
          const window = computeExpiryWindow({
            half: parsed.data.expiryHalf === "H1" ? "1H" : "2H",
            month: parsed.data.expiryMonth,
            year: parsed.data.expiryYear,
          });
          windowComputed = {
            window: window.label,
            windowStart: window.windowStart,
            windowEnd: window.windowEnd,
            settlementDate: window.settlementDate,
          };
        } catch (err) {
          console.error("[CREATE_FORWARD_ORDER] Invalid expiry window input", err);
          return res.status(400).json({ error: "Invalid expiry window parameters" });
        }
      }

      const [order] = await db
        .insert(forwardOrders)
        .values({
          ...orderData,
          userId: req.user.id,
          ...windowComputed,
        })
        .returning();

      res.json(order);
    } catch (error: any) {
      console.error("Error creating forward order:", error);
      res.status(500).json({ error: "Failed to create forward order" });
    }
  });

  // ===== FORWARD ORDERS MATCHING =====

  app.post("/api/forward/orders/:id/match", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const orderId = req.params.id;
      const [order] = await db.select().from(forwardOrders).where(eq(forwardOrders.id, orderId));
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      if (order.userId === req.user.id) {
        return res.status(403).json({ error: "Counterparty cannot be the same user" });
      }
      if (order.status !== "OPEN") {
        return res.status(400).json({ error: `Order status is ${order.status}, cannot match` });
      }

      const oppositeSide = order.side === "BUY" ? "SELL" : "BUY";
      const [counterOrder] = await db
        .select()
        .from(forwardOrders)
        .where(
          and(
            eq(forwardOrders.side, oppositeSide),
            eq(forwardOrders.indexId, order.indexId as any),
            eq(forwardOrders.window, order.window as any),
            eq(forwardOrders.price, order.price),
            eq(forwardOrders.status, "OPEN")
          )
        )
        .limit(1);

      if (!counterOrder) {
        return res.status(404).json({ error: "No matching counter-order found" });
      }

      const qtyA = parseFloat(order.qtyTon);
      const qtyB = parseFloat(counterOrder.qtyTon);
      if (!Number.isFinite(qtyA) || !Number.isFinite(qtyB) || qtyA <= 0 || qtyB <= 0) {
        return res.status(400).json({ error: "Invalid quantity on order" });
      }
      if (Math.abs(qtyA - qtyB) > 1e-9) {
        return res.status(400).json({ error: "Quantity mismatch; partial fills not supported yet" });
      }
      const qtyTon = qtyA;
      const contractPriceNum = parseFloat(order.price);
      const settlementDate =
        order.settlementDate ||
        order.windowEnd ||
        counterOrder.settlementDate ||
        counterOrder.windowEnd ||
        new Date();

      const initialMargin = calculateInitialMargin({
        strike: contractPriceNum,
        quantityTon: qtyTon,
        settlementDate: new Date(settlementDate),
        currentDate: new Date(),
      });

      const buyOrder = order.side === "BUY" ? order : counterOrder;
      const sellOrder = order.side === "SELL" ? order : counterOrder;

      // Soft proof: hash a JSON snapshot of key, non-PII contract fields
      const contractProofPayload = {
        buyOrderId: buyOrder.id,
        sellOrderId: sellOrder.id,
        indexId: order.indexId,
        commodity: order.commodity || counterOrder.commodity || null,
        contractPrice: contractPriceNum,
        qtyTon,
        window: order.window,
        windowStart: order.windowStart || counterOrder.windowStart || null,
        windowEnd: order.windowEnd || counterOrder.windowEnd || null,
        settlementDate,
        longUserId: buyOrder.userId,
        shortUserId: sellOrder.userId,
        initialMargin,
      };
      const contractHash = createHash("sha256")
        .update(JSON.stringify(contractProofPayload))
        .digest("hex");

      const [contract] = await db
        .insert(forwardContracts)
        .values({
          buyOrderId: buyOrder.id,
          sellOrderId: sellOrder.id,
          indexId: order.indexId,
          commodity: order.commodity || counterOrder.commodity || null,
          contractPrice: contractPriceNum.toString(),
          qtyTon: qtyTon.toString(),
          window: order.window,
          windowStart: order.windowStart || counterOrder.windowStart || null,
          windowEnd: order.windowEnd || counterOrder.windowEnd || null,
          settlementDate,
          longUserId: buyOrder.userId,
          shortUserId: sellOrder.userId,
          initialMargin: initialMargin.toFixed(8),
          status: "ACTIVE",
          contractHash,
        })
        .returning();

      await db
        .update(forwardOrders)
        .set({ status: "FILLED", updatedAt: new Date() })
        .where(or(eq(forwardOrders.id, buyOrder.id), eq(forwardOrders.id, sellOrder.id)));

      // Record matching fees (per side)
      const matchingFeeAmount = qtyTon * MATCHING_FEE_PER_TON;
      const feeNotional = (contractPriceNum * qtyTon).toFixed(8);
      const forwardSides = [
        { userId: buyOrder.userId, role: "buyer" },
        { userId: sellOrder.userId, role: "seller" },
      ];
      for (const side of forwardSides) {
        try {
          await db.insert(platformFees).values({
            userId: side.userId!,
            role: side.role,
            type: "matching_fee",
            amount: matchingFeeAmount.toFixed(8),
            notionalAmount: feeNotional,
            currency: "CROPT",
            instrument: contract.id,
            instrumentType: "FORWARD",
            txId: null,
          });
        } catch (err) {
          console.warn("[FORWARD_MATCH_FEE] Failed to record fee", {
            contractId: contract.id,
            userId: side.userId,
            role: side.role,
            error: (err as Error)?.message,
          });
        }
      }

      console.log("[FORWARD_MATCH] Created forward contract", {
        contractId: contract.id,
        buyOrderId: buyOrder.id,
        sellOrderId: sellOrder.id,
        price: contractPriceNum,
        qtyTon,
      });

      res.status(201).json(contract);
    } catch (error: any) {
      console.error("Error matching forward order:", error);
      res.status(500).json({ error: error.message || "Failed to match forward order" });
    }
  });

  // List forward contracts with soft-proof hash
  app.get("/api/forward/contracts", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { status } = req.query;
      const isAdmin = hasBrokerPermissions(req.user.role) || hasAdminPermissions(req.user);

      const rows = await db.select().from(forwardContracts).orderBy(desc(forwardContracts.createdAt));
      let contracts = rows;
      if (!isAdmin) {
        contracts = contracts.filter(
          (c) => c.longUserId === req.user!.id || c.shortUserId === req.user!.id
        );
      }
      if (status && typeof status === "string") {
        contracts = contracts.filter((c) => c.status === status);
      }

      res.json(contracts);
    } catch (error: any) {
      console.error("Error fetching forward contracts:", error);
      res.status(500).json({ error: error.message || "Failed to fetch forward contracts" });
    }
  });

  // Settle a forward contract using SSIavg over the window
  app.post("/api/forward/contracts/:id/settle", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!hasAdminPermissions(req.user) && !hasBrokerPermissions(req.user)) {
        return res.status(403).json({ error: "Forbidden: broker/admin required" });
      }

      const contractId = req.params.id;
      const [contract] = await db.select().from(forwardContracts).where(eq(forwardContracts.id, contractId));
      if (!contract) {
        return res.status(404).json({ error: "Forward contract not found" });
      }
      if (contract.status === "SETTLED") {
        return res.status(400).json({ error: "Contract already settled" });
      }

      const windowStart = contract.windowStart ? new Date(contract.windowStart) : null;
      const windowEnd = contract.windowEnd ? new Date(contract.windowEnd) : null;
      const indexId = contract.indexId;

      let ssiAvg: number | null = null;
      if (indexId && windowStart && windowEnd) {
        const rows = await db
          .select()
          .from(commodityIndexPrices)
          .where(
            and(
              eq(commodityIndexPrices.indexId, indexId),
              gte(commodityIndexPrices.timestamp, windowStart),
              lte(commodityIndexPrices.timestamp, windowEnd)
            )
          );
        if (rows.length > 0) {
          ssiAvg = rows.reduce((sum, r) => sum + parseFloat(r.price), 0) / rows.length;
        }
      }

      if (!ssiAvg || !Number.isFinite(ssiAvg)) {
        const [latest] = indexId
          ? await db
              .select()
              .from(commodityIndexPrices)
              .where(eq(commodityIndexPrices.indexId, indexId))
              .orderBy(desc(commodityIndexPrices.timestamp))
              .limit(1)
          : [];
        if (latest) {
          ssiAvg = parseFloat(latest.price);
          console.warn("[FORWARD_SETTLE] No SSIavg in window; falling back to latest price", {
            contractId,
            indexId,
            windowStart: windowStart?.toISOString?.(),
            windowEnd: windowEnd?.toISOString?.(),
            latest: ssiAvg,
          });
        } else {
          console.warn("[FORWARD_SETTLE] No prices found; aborting settlement", {
            contractId,
            indexId,
          });
          return res.status(400).json({ error: "No prices available to settle" });
        }
      }

      const contractPrice = parseFloat(contract.contractPrice);
      const qtyTon = parseFloat(contract.qtyTon);
      const pnlLong = (ssiAvg - contractPrice) * qtyTon;
      const pnlShort = -pnlLong;

      const [settlement] = await db
        .insert(forwardSettlements)
        .values({
          forwardContractId: contract.id,
          settlementPrice: ssiAvg.toFixed(8),
          contractPrice: contractPrice.toFixed(8),
          qtyTon: qtyTon.toFixed(8),
          pnlLong: pnlLong.toFixed(8),
          pnlShort: pnlShort.toFixed(8),
          feesTotal: "0",
        })
        .returning();

      await db
        .update(forwardContracts)
        .set({ status: "SETTLED", updatedAt: new Date() })
        .where(eq(forwardContracts.id, contract.id));

      // Settlement fees per side
      const settlementFeeAmount = qtyTon * SETTLEMENT_FEE_PER_TON;
      const feeNotional = (contractPrice * qtyTon).toFixed(8);
      const sides = [
        { userId: contract.longUserId, role: "long" },
        { userId: contract.shortUserId, role: "short" },
      ];
      for (const side of sides) {
        if (!side.userId) continue;
        try {
          await db.insert(platformFees).values({
            userId: side.userId,
            role: side.role,
            type: "settlement_fee",
            amount: settlementFeeAmount.toFixed(8),
            notionalAmount: feeNotional,
            currency: "CROPT",
            instrument: contract.id,
            instrumentType: "FORWARD",
            txId: null,
          });
        } catch (err) {
          console.warn("[FORWARD_SETTLE_FEE] Failed to record fee", {
            contractId: contract.id,
            userId: side.userId,
            role: side.role,
            error: (err as Error)?.message,
          });
        }
      }

      console.log("[FORWARD_SETTLE] Settled forward contract", {
        contractId: contract.id,
        ssiAvg,
        pnlLong,
        pnlShort,
      });

      res.json(settlement);
    } catch (error: any) {
      console.error("Error settling forward contract:", error);
      res.status(500).json({ error: error.message || "Failed to settle forward contract" });
    }
  });

  // ===== FORWARD SPREADS (analytics/demo) =====
  const createForwardSpreadSchema = z.object({
    spreadType: z.enum(["CALENDAR", "CROSS_COMMODITY"]),
    leg1IndexId: z.string().optional(),
    leg2IndexId: z.string().optional(),
    leg1Window: z.string().optional(),
    leg2Window: z.string().optional(),
    spreadPrice: z.coerce.number(),
    baseContractId: z.string().optional(),
    hedgeContractId: z.string().optional(),
    status: z.enum(["OPEN", "CANCELLED"]).optional(),
  });

  app.get("/api/forward/spreads", async (req, res) => {
    try {
      const { type, commodity, window } = req.query;

      if (type === "calendar") {
        const spreads = await calculateCalendarSpreads(commodity as string);
        res.json({ type: "calendar", spreads });
      } else if (type === "cross") {
        const spreads = await calculateCrossCommoditySpreads(window as string);
        res.json({ type: "cross", spreads });
      } else {
        // Return both types if no specific type requested
        const allSpreads = await getAllSpreads(commodity as string, window as string);
        res.json(allSpreads);
      }
    } catch (error: any) {
      console.error("Error fetching forward spreads:", error);
      res.status(500).json({ error: error.message || "Failed to fetch forward spreads" });
    }
  });

  app.post("/api/forward/spreads", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const parsed = createForwardSpreadSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const data = parsed.data;
      const [created] = await db
        .insert(forwardSpreads)
        .values({
          spreadType: data.spreadType,
          leg1IndexId: data.leg1IndexId,
          leg2IndexId: data.leg2IndexId,
          leg1Window: data.leg1Window,
          leg2Window: data.leg2Window,
          spreadPrice: data.spreadPrice.toFixed(8),
          baseContractId: data.baseContractId,
          hedgeContractId: data.hedgeContractId,
          status: data.status || "OPEN",
        })
        .returning();
      res.status(201).json(created);
    } catch (error: any) {
      console.error("Error creating forward spread:", error);
      res.status(500).json({ error: error.message || "Failed to create forward spread" });
    }
  });

  // ===== PARTNERS & CONTRACTS API =====
  
  // GET /api/admin/partners
  app.get("/api/admin/partners", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Forbidden: admin access required" });
      }

      const partners = await storage.getPartnerOrganizations();
      const contracts = await storage.getServiceContracts();
      
      // Get platform fees for fee stats calculation
      const allFees = await db
        .select()
        .from(platformFees)
        .orderBy(desc(platformFees.createdAt));

      // Calculate contract counts, total values, and fee stats per partner
      const partnersWithStats = await Promise.all(partners.map(async (partner) => {
        const partnerContracts = contracts.filter(c => c.partnerId === partner.id);
        const activeContracts = partnerContracts.filter(c => c.status === 'active');
        const totalContractValue = partnerContracts.reduce((sum, c) => sum + parseFloat(c.valueUsd), 0);
        
        // Get fee stats (demo implementation)
        const feeStats = await getPartnerFeeStats(
          partner.id,
          allFees.map(f => ({ amount: f.amount, currency: f.currency, createdAt: f.createdAt }))
        );
        
        return {
          ...partner,
          contractsCount: partnerContracts.length,
          activeContractsCount: activeContracts.length,
          totalContractValueUsd: totalContractValue.toFixed(2),
          totalFeesUsd: feeStats.totalFeesUsd.toFixed(2),
          totalVolumeUsd: feeStats.totalVolumeUsd.toFixed(2),
        };
      }));

      res.json({ partners: partnersWithStats });
    } catch (error: any) {
      console.error("Error fetching partners:", error);
      res.status(500).json({ error: error.message || "Failed to fetch partners" });
    }
  });

  // GET /api/admin/partners/:id - Partner details
  app.get("/api/admin/partners/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Forbidden: admin access required" });
      }

      const partnerId = req.params.id;

      // Get partner details
      const partners = await storage.getPartnerOrganizations();
      const partner = partners.find(p => p.id === partnerId);

      if (!partner) {
        return res.status(404).json({ error: "Partner not found" });
      }

      // Get service contracts for this partner
      const contracts = await storage.getServiceContracts();
      const partnerContracts = contracts.filter(c => c.partnerId === partnerId);

      // Get platform fees for fee stats
      const allFees = await db
        .select()
        .from(platformFees)
        .orderBy(desc(platformFees.createdAt));

      const feeStats = await getPartnerFeeStats(
        partnerId,
        allFees.map(f => ({ amount: f.amount, currency: f.currency, createdAt: f.createdAt }))
      );

      // Calculate additional stats
      const activeContracts = partnerContracts.filter(c => c.status === 'active');
      const totalContractValue = partnerContracts.reduce((sum, c) => sum + parseFloat(c.valueUsd), 0);
      const completedContracts = partnerContracts.filter(c => c.status === 'completed');

      // Mock modules based on relationship type
      const modules = [];
      if (partner.relationship === 'prime_broker') {
        modules.push('Options Trading', 'Forward Trading', 'Portfolio Management');
      } else if (partner.relationship === 'custody') {
        modules.push('Asset Custody', 'Wallet Management');
      } else if (partner.relationship === 'liquidity_provider') {
        modules.push('Market Making', 'Liquidity Provision');
      } else if (partner.relationship === 'security_auditor') {
        modules.push('Security Auditing', 'Compliance Monitoring');
      } else {
        modules.push('General Services');
      }

      const response = {
        partner: {
          ...partner,
          modules,
          contractsCount: partnerContracts.length,
          activeContractsCount: activeContracts.length,
          completedContractsCount: completedContracts.length,
          totalContractValueUsd: totalContractValue.toFixed(2),
        },
        contracts: partnerContracts,
        stats: {
          totalFeesUsd: feeStats.totalFeesUsd.toFixed(2),
          totalVolumeUsd: feeStats.totalVolumeUsd.toFixed(2),
          contractCount: feeStats.contractCount,
          activeContractValue: activeContracts.reduce((sum, c) => sum + parseFloat(c.valueUsd), 0).toFixed(2),
          completedContractValue: completedContracts.reduce((sum, c) => sum + parseFloat(c.valueUsd), 0).toFixed(2),
        }
      };

      res.json(response);
    } catch (error: any) {
      console.error("Error fetching partner details:", error);
      res.status(500).json({ error: error.message || "Failed to fetch partner details" });
    }
  });

  // GET /api/admin/service-contracts
  app.get("/api/admin/service-contracts", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Forbidden: admin access required" });
      }

      const contracts = await storage.getServiceContracts();
      const partners = await storage.getPartnerOrganizations();

      // Enrich contracts with partner names
      const contractsWithPartnerNames = contracts.map(contract => {
        const partner = partners.find(p => p.id === contract.partnerId);
        return {
          ...contract,
          partnerName: partner?.name || 'Unknown',
        };
      });

      res.json({ contracts: contractsWithPartnerNames });
    } catch (error: any) {
      console.error("Error fetching service contracts:", error);
      res.status(500).json({ error: error.message || "Failed to fetch service contracts" });
    }
  });

  // POST /api/admin/partners
  app.post("/api/admin/partners", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Forbidden: admin access required" });
      }

      const result = insertPartnerOrganizationSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ 
          error: "Invalid partner data", 
          details: fromZodError(result.error).message 
        });
      }

      const { id, ...partnerData } = req.body;
      const partner = await storage.createOrUpdatePartner(result.data, id);

      res.status(id ? 200 : 201).json(partner);
    } catch (error: any) {
      console.error("Error creating/updating partner:", error);
      res.status(500).json({ error: error.message || "Failed to create/update partner" });
    }
  });

  // POST /api/admin/service-contracts
  app.post("/api/admin/service-contracts", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!hasBrokerPermissions(req.user?.role)) {
        return res.status(403).json({ error: "Forbidden: admin access required" });
      }

      const result = insertServiceContractSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ 
          error: "Invalid contract data", 
          details: fromZodError(result.error).message 
        });
      }

      const { id, ...contractData } = req.body;
      const contract = await storage.createOrUpdateServiceContract(result.data, id);

      res.status(id ? 200 : 201).json(contract);
    } catch (error: any) {
      console.error("Error creating/updating service contract:", error);
      res.status(500).json({ error: error.message || "Failed to create/update service contract" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
