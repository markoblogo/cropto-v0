import type {
  Basis,
  BrokerUser,
  Commodity,
  CommodityCode,
  CountryOption,
  Currency,
  PaymentTermCode,
  PaymentTermOption,
  PortOption,
  SelectOption,
} from "../types";

export const brokers: BrokerUser[] = [
  {
    id: "broker-01",
    authUserId: "broker-01",
    brokerCode: "VL",
    brokerName: "Vitaly Lavrov",
    companyName: "Lavrov Brokerage",
    displayName: "Vitaly Lavrov",
    email: "vitaly@lavrovbrokerage.example",
    role: "broker",
    identityProvider: "cropto_auth",
  },
  {
    id: "broker-02",
    authUserId: "broker-02",
    brokerCode: "SK",
    brokerName: "Sergiy Kozhushkin",
    companyName: "Southline Brokerage",
    displayName: "Sergiy Kozhushkin",
    email: "sergiy@southlinebrokerage.example",
    role: "broker",
    identityProvider: "cropto_auth",
  },
  {
    id: "broker-03",
    authUserId: "broker-03",
    brokerCode: "DELTA",
    brokerName: "Delta Freight",
    companyName: "Delta Grain Movements",
    displayName: "Mateo Rivas",
    email: "mateo@deltafreight.example",
    role: "broker",
    identityProvider: "cropto_auth",
  },
  {
    id: "broker-04",
    authUserId: "broker-04",
    brokerCode: "NORTH",
    brokerName: "North Corridor",
    companyName: "North Corridor Brokers",
    displayName: "Iryna Holub",
    email: "iryna@northcorridor.example",
    role: "broker",
    identityProvider: "cropto_auth",
  },
  {
    id: "broker-05",
    authUserId: "broker-05",
    brokerCode: "BSC",
    brokerName: "Black Sea Chartering",
    companyName: "Black Sea Chartering LLC",
    displayName: "Oleh Marchenko",
    email: "oleh@blackseachartering.example",
    role: "broker",
    identityProvider: "cropto_auth",
  },
];

export const commodityOptions: Commodity[] = [
  { code: "corn", displayLabel: "Corn", compactDisplay: "CORN", group: "grains", defaultVolumeUnit: "mt" },
  { code: "wheat_115", displayLabel: "Wheat 11.5%", compactDisplay: "WHEAT 11.5", group: "grains", defaultVolumeUnit: "mt" },
  { code: "wheat_125", displayLabel: "Wheat 12.5%", compactDisplay: "WHEAT 12.5", group: "grains", defaultVolumeUnit: "mt" },
  { code: "barley", displayLabel: "Barley", compactDisplay: "BARLEY", group: "grains", defaultVolumeUnit: "mt" },
  { code: "sunflower", displayLabel: "Sunflower", compactDisplay: "SUNFLOWER", group: "oilseeds", defaultVolumeUnit: "mt" },
  { code: "soybean", displayLabel: "Soybean", compactDisplay: "SOYBEAN", group: "oilseeds", defaultVolumeUnit: "mt" },
  { code: "rapeseed", displayLabel: "Rapeseed", compactDisplay: "RAPESEED", group: "oilseeds", defaultVolumeUnit: "mt" },
];

export const basisOptions: SelectOption<Basis>[] = [
  { value: "FOB", label: "FOB" },
  { value: "CIF", label: "CIF" },
  { value: "CPT", label: "CPT" },
  { value: "DAP", label: "DAP" },
  { value: "FCA", label: "FCA" },
];

export const paymentTermOptions: PaymentTermOption[] = [
  { code: "CAD", displayLabel: "Cash against documents", compactDisplay: "CAD" },
  { code: "CAFD", displayLabel: "Cash against fax copy documents", compactDisplay: "CAFD" },
];

export const currencyOptions: SelectOption<Currency>[] = [
  { value: "USD", label: "USD ($)" },
  { value: "EUR", label: "EUR (€)" },
  { value: "UAH", label: "UAH (₴)" },
];

export const countryOptions: CountryOption[] = [
  { code: "UA", displayLabel: "Ukraine", countryCodeAlpha3: "UKR", compactDisplay: "UKR" },
  { code: "MD", displayLabel: "Moldova", countryCodeAlpha3: "MDA", compactDisplay: "MDA" },
  { code: "BG", displayLabel: "Bulgaria", countryCodeAlpha3: "BGR", compactDisplay: "BGR" },
  { code: "EG", displayLabel: "Egypt", countryCodeAlpha3: "EGY", compactDisplay: "EGY" },
  { code: "IL", displayLabel: "Israel", countryCodeAlpha3: "ISR", compactDisplay: "ISR" },
  { code: "CY", displayLabel: "Cyprus", countryCodeAlpha3: "CYP", compactDisplay: "CYP" },
  { code: "LB", displayLabel: "Lebanon", countryCodeAlpha3: "LBN", compactDisplay: "LBN" },
  { code: "ES", displayLabel: "Spain", countryCodeAlpha3: "ESP", compactDisplay: "ESP" },
  { code: "IT", displayLabel: "Italy", countryCodeAlpha3: "ITA", compactDisplay: "ITA" },
  { code: "NL", displayLabel: "Netherlands", countryCodeAlpha3: "NLD", compactDisplay: "NLD" },
  { code: "RO", displayLabel: "Romania", countryCodeAlpha3: "ROU", compactDisplay: "ROU" },
  { code: "TR", displayLabel: "Turkey", countryCodeAlpha3: "TUR", compactDisplay: "TUR" },
];

export const portOptions: PortOption[] = [
  { code: "pivdenny", displayLabel: "Pivdenny", countryCode: "UA", countryCodeAlpha3: "UKR", unlocode: "UAYUZ", compactDisplay: "UAYUZ" },
  { code: "odesa", displayLabel: "Odesa", countryCode: "UA", countryCodeAlpha3: "UKR", unlocode: "UAODS", compactDisplay: "UAODS" },
  { code: "chornomorsk", displayLabel: "Chornomorsk", countryCode: "UA", countryCodeAlpha3: "UKR", compactDisplay: "CHORNOMORSK" },
  { code: "izmail", displayLabel: "Izmail", countryCode: "UA", countryCodeAlpha3: "UKR", compactDisplay: "IZMAIL" },
  { code: "giurgiulesti", displayLabel: "Giurgiulesti", countryCode: "MD", countryCodeAlpha3: "MDA", compactDisplay: "GIURGIULESTI" },
  { code: "burgas", displayLabel: "Burgas", countryCode: "BG", countryCodeAlpha3: "BGR", compactDisplay: "BURGAS" },
  { code: "marmara", displayLabel: "Marmara", countryCode: "TR", countryCodeAlpha3: "TUR", compactDisplay: "MARMARA" },
  { code: "alexandria", displayLabel: "Alexandria", countryCode: "EG", countryCodeAlpha3: "EGY", compactDisplay: "ALEXANDRIA" },
  { code: "ashdod", displayLabel: "Ashdod", countryCode: "IL", countryCodeAlpha3: "ISR", compactDisplay: "ASHDOD" },
  { code: "limassol", displayLabel: "Limassol", countryCode: "CY", countryCodeAlpha3: "CYP", compactDisplay: "LIMASSOL" },
  { code: "beirut", displayLabel: "Beirut", countryCode: "LB", countryCodeAlpha3: "LBN", compactDisplay: "BEIRUT" },
  { code: "constanta", displayLabel: "Constanta", countryCode: "RO", countryCodeAlpha3: "ROU", compactDisplay: "CONSTANTA" },
  { code: "izmir", displayLabel: "Izmir", countryCode: "TR", countryCodeAlpha3: "TUR", compactDisplay: "IZMIR" },
  { code: "mersin", displayLabel: "Mersin", countryCode: "TR", countryCodeAlpha3: "TUR", compactDisplay: "MERSIN" },
  { code: "ravenna", displayLabel: "Ravenna", countryCode: "IT", countryCodeAlpha3: "ITA", compactDisplay: "RAVENNA" },
  { code: "tarragona", displayLabel: "Tarragona", countryCode: "ES", countryCodeAlpha3: "ESP", compactDisplay: "TARRAGONA" },
];

export const commodityOptionMap: Record<string, Commodity> = commodityOptions.reduce(
  (acc, commodity) => {
    acc[commodity.code] = commodity;
    return acc;
  },
  {} as Record<string, Commodity>,
);

export const countryOptionMap: Record<string, CountryOption> = countryOptions.reduce(
  (acc, country) => {
    acc[country.code] = country;
    return acc;
  },
  {} as Record<string, CountryOption>,
);

export const portOptionMap: Record<string, PortOption> = portOptions.reduce(
  (acc, port) => {
    acc[port.code] = port;
    return acc;
  },
  {} as Record<string, PortOption>,
);

export const brokerProfilesByAuthUserId: Record<string, BrokerUser> = {
  [brokers[0].authUserId]: brokers[0],
  [brokers[1].authUserId]: brokers[1],
  [brokers[2].authUserId]: brokers[2],
  [brokers[3].authUserId]: brokers[3],
  [brokers[4].authUserId]: brokers[4],
};

export const brokerProfilesByEmail: Record<string, BrokerUser> = {
  [brokers[0].email.toLowerCase()]: brokers[0],
  [brokers[1].email.toLowerCase()]: brokers[1],
  [brokers[2].email.toLowerCase()]: brokers[2],
  [brokers[3].email.toLowerCase()]: brokers[3],
  [brokers[4].email.toLowerCase()]: brokers[4],
};
