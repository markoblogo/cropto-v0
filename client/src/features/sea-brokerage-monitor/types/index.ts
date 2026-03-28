export type EntryType = "bid" | "offer";

export type CommodityCode =
  | "corn"
  | "wheat_115"
  | "wheat_125"
  | "barley"
  | "sunflower"
  | "soybean"
  | "rapeseed";

export type Basis = "FOB" | "CIF" | "CPT" | "DAP" | "FCA";

export type TransportType =
  | "handysize"
  | "coaster"
  | "truck"
  | "rail"
  | "vessel"
  | "truck/rail";

export type Currency = "USD" | "EUR" | "UAH";
export type PaymentTermCode = "CAD" | "CAFD";

export type VolumeUnit = "mt";

export type PeriodType = "spot" | "prompt" | "range" | "month" | "window";

export type UserRole = "broker" | "trader" | "admin";
export type BrokerIdentityProvider = "cropto_auth" | "telegram_future";
export type TelegramRelayStatus = "queued" | "published" | "failed";

export interface Commodity {
  code: CommodityCode;
  displayLabel: string;
  compactDisplay: string;
  group?: "grains" | "oilseeds";
  defaultVolumeUnit?: VolumeUnit;
}

export interface CountryOption {
  code: string;
  displayLabel: string;
  countryCodeAlpha3: string;
  compactDisplay: string;
}

export interface PortOption {
  code: string;
  displayLabel: string;
  countryCode: string;
  countryCodeAlpha3: string;
  unlocode?: string;
  compactDisplay: string;
}

export interface PaymentTermOption {
  code: PaymentTermCode;
  displayLabel: string;
  compactDisplay: string;
}

export interface CompanyOption {
  id: string;
  displayLabel: string;
  compactDisplay: string;
}

export interface BrokerUser {
  // Stable broker profile identifier used by module entries and filters.
  id: string;
  // Auth provider user id that can later be resolved from Cropto or another identity source.
  authUserId: string;
  brokerCode: string;
  brokerName: string;
  companyName: string;
  displayName: string;
  email: string;
  role: UserRole;
  identityProvider: BrokerIdentityProvider;
}

export interface BrokerageEntry {
  id: string;
  type: EntryType;
  brokerId: string;
  brokerCode: string;
  brokerName: string;
  companyName: string;
  sellerName?: string | null;
  buyerName?: string | null;
  originCountry?: string | null;
  originCountryCode?: string | null;
  commodity: CommodityCode;
  commodityLabel: string;
  gradeOrSpec: string;
  quantityMt?: number | null;
  tolerancePct?: number | null;
  volumeFrom: number;
  volumeTo: number;
  volumeUnit: VolumeUnit;
  basis: Basis;
  paymentTerms?: string | null;
  destinationPortCode?: string | null;
  destinationPort: string;
  destinationCountryCode?: string | null;
  destinationCountry: string;
  periodType: PeriodType;
  periodLabel: string;
  periodStart: string | null;
  periodEnd: string | null;
  price?: number | null;
  priceFrom: number | null;
  priceTo: number | null;
  currency: Currency;
  transportType: TransportType;
  note: string | null;
  createdAt: string;
  createdBy: BrokerUser;
  canonicalView: string;
  telegramRelayStatus?: TelegramRelayStatus;
  telegramRelayMessage?: string | null;
}

export interface MatchSuggestion {
  id: string;
  bidEntryId: string;
  offerEntryId: string;
  bidEntry: BrokerageEntry;
  offerEntry: BrokerageEntry;
  score: number;
  scoreLabel: string;
  confidenceLabel: "high confidence" | "medium confidence" | "weak match";
  priceDelta: number | null;
  priceDeltaLabel: string;
  reasons: string[];
  matchedAt?: string | null;
}

export interface FeedFilterState {
  // This reflects the live filter UI exactly, so the view state stays strongly typed.
  entryType: EntryType | "all";
  commodity: CommodityCode | "all";
  basis: Basis | "all";
  brokerProfileId: string | "all";
  originCountry: string | "all";
  deliveryPlace: string | "all";
  search: string;
  dateFrom: string;
  dateTo: string;
}

export interface SelectOption<TValue extends string = string> {
  value: TValue;
  label: string;
}
