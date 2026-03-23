import { generateMatchSuggestions } from "./matchingEngine.service";
import { buildCanonicalView } from "./entryFormatting.service";
import { formatTelegramRelayMessage } from "./telegramRelay.service";
import {
  seaBrokerageMonitorMockState,
  type SeaBrokerageMonitorSectionState,
} from "../mock/seaBrokerageMonitor.mock";
import { createSeaBrokerageMonitorDemoEntries } from "../mock/seedEntries";
import { brokers, commodityOptionMap } from "../mock/dictionaries";
import type {
  Basis,
  BrokerageEntry,
  CommodityCode,
  Currency,
  PeriodType,
  TelegramRelayStatus,
  TransportType,
  VolumeUnit,
  BrokerUser,
} from "../types";

export interface CreateBrokerageEntryInput {
  type: "bid" | "offer";
  sellerName?: string | null;
  buyerName?: string | null;
  commodity: CommodityCode;
  commodityLabel: string;
  gradeOrSpec: string;
  volumeFrom: number;
  volumeTo: number;
  volumeUnit: VolumeUnit;
  basis: Basis;
  destinationPort: string;
  destinationCountry: string;
  periodType: PeriodType;
  periodLabel: string;
  periodStart: string | null;
  periodEnd: string | null;
  priceFrom: number | null;
  priceTo: number | null;
  currency: Currency;
  transportType: TransportType;
  note: string | null;
  createdBy: BrokerUser;
}

function buildStateFromEntries(entries: BrokerageEntry[]): SeaBrokerageMonitorSectionState {
  return {
    standardizedFeed: entries,
    matchSuggestions: generateMatchSuggestions(entries),
  };
}

function cloneEntries(entries: BrokerageEntry[]) {
  return entries.map((entry) => ({
    ...entry,
    createdBy: { ...entry.createdBy },
  }));
}

const initialDemoEntries = cloneEntries(seaBrokerageMonitorMockState.standardizedFeed);

let state: SeaBrokerageMonitorSectionState = buildStateFromEntries(initialDemoEntries);

const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

export function getSeaBrokerageMonitorState(): SeaBrokerageMonitorSectionState {
  return state;
}

export function subscribeToSeaBrokerageMonitorState(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function createBrokerageEntry(input: CreateBrokerageEntryInput): BrokerageEntry {
  const createdAt = new Date().toISOString();
  const createdBy = input.createdBy;

  const baseEntry: Omit<BrokerageEntry, "canonicalView"> = {
    id: `sbm-${Date.now()}`,
    type: input.type,
    brokerId: createdBy.id,
    brokerCode: createdBy.brokerCode,
    brokerName: createdBy.brokerName,
    companyName: createdBy.companyName,
    sellerName: input.sellerName ?? null,
    buyerName: input.buyerName ?? null,
    commodity: input.commodity,
    commodityLabel: input.commodityLabel,
    gradeOrSpec: input.gradeOrSpec,
    volumeFrom: input.volumeFrom,
    volumeTo: input.volumeTo,
    volumeUnit: input.volumeUnit,
    basis: input.basis,
    destinationPort: input.destinationPort,
    destinationCountry: input.destinationCountry,
    periodType: input.periodType,
    periodLabel: input.periodLabel,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    priceFrom: input.priceFrom,
    priceTo: input.priceTo,
    currency: input.currency,
    transportType: input.transportType,
    note: input.note,
    createdAt,
    createdBy,
  };

  const entry: BrokerageEntry = {
    ...baseEntry,
    canonicalView: buildCanonicalView(baseEntry),
    telegramRelayMessage: null,
  };

  entry.telegramRelayMessage = formatTelegramRelayMessage(entry);

  const nextStandardizedFeed = [entry, ...state.standardizedFeed];

  state = {
    ...state,
    standardizedFeed: nextStandardizedFeed,
    matchSuggestions: generateMatchSuggestions(nextStandardizedFeed),
  };
  emitChange();

  return entry;
}

export function resetSeaBrokerageMonitorDemoData() {
  state = buildStateFromEntries(cloneEntries(initialDemoEntries));
  emitChange();
}

export function clearSeaBrokerageMonitorEntries() {
  state = buildStateFromEntries([]);
  emitChange();
}

export function reseedSeaBrokerageMonitorDemoData() {
  state = buildStateFromEntries(createSeaBrokerageMonitorDemoEntries());
  emitChange();
}

export function addSeaBrokerageMonitorSampleEntry(type: "bid" | "offer") {
  const broker = type === "bid" ? brokers[0] : brokers[1];

  return createBrokerageEntry({
    type,
    commodity: "corn",
    sellerName: type === "offer" ? "Sample Seller Group" : null,
    buyerName: type === "bid" ? "Sample Buyer Group" : null,
    commodityLabel: commodityOptionMap.corn.label,
    gradeOrSpec: type === "bid" ? "Feed corn, sample bid" : "Feed corn, sample offer",
    volumeFrom: type === "bid" ? 12000 : 12500,
    volumeTo: type === "bid" ? 15000 : 14500,
    volumeUnit: "mt",
    basis: "FOB",
    destinationPort: "Chornomorsk",
    destinationCountry: "Egypt",
    periodType: "prompt",
    periodLabel: "prompt",
    periodStart: null,
    periodEnd: null,
    priceFrom: type === "bid" ? 227 : 225,
    priceTo: type === "bid" ? 229 : 227,
    currency: "USD",
    transportType: "vessel",
    note:
      type === "bid"
        ? "Quick QA sample bid created from the demo toolbar."
        : "Quick QA sample offer created from the demo toolbar.",
    createdBy: broker,
  });
}

export function updateBrokerageEntryTelegramRelayStatus(
  entryId: string,
  telegramRelayStatus: TelegramRelayStatus,
) {
  let updatedEntry: BrokerageEntry | null = null;

  state = {
    ...state,
    // Keep relay status updates on the same entry objects the feed and detail sheet already consume.
    standardizedFeed: state.standardizedFeed.map((entry) => {
      if (entry.id !== entryId) return entry;

      updatedEntry = {
        ...entry,
        telegramRelayStatus,
      };

      return updatedEntry;
    }),
  };

  if (updatedEntry) {
    emitChange();
  }

  return updatedEntry;
}
