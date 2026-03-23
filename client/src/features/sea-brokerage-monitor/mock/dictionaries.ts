import type {
  Basis,
  BrokerUser,
  Commodity,
  CommodityCode,
  CountryOption,
  PaymentTermCode,
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
  { code: "corn", label: "Corn", group: "grains", defaultVolumeUnit: "mt" },
  { code: "wheat_115", label: "Wheat 11.5%", group: "grains", defaultVolumeUnit: "mt" },
  { code: "wheat_125", label: "Wheat 12.5%", group: "grains", defaultVolumeUnit: "mt" },
  { code: "barley", label: "Barley", group: "grains", defaultVolumeUnit: "mt" },
  { code: "sunflower", label: "Sunflower", group: "oilseeds", defaultVolumeUnit: "mt" },
  { code: "soybean", label: "Soybean", group: "oilseeds", defaultVolumeUnit: "mt" },
  { code: "rapeseed", label: "Rapeseed", group: "oilseeds", defaultVolumeUnit: "mt" },
];

export const basisOptions: SelectOption<Basis>[] = [
  { value: "FOB", label: "FOB" },
  { value: "CIF", label: "CIF" },
  { value: "CPT", label: "CPT" },
  { value: "DAP", label: "DAP" },
  { value: "FCA", label: "FCA" },
];

export const paymentTermOptions: SelectOption<PaymentTermCode>[] = [
  { value: "CAD", label: "CAD" },
  { value: "CAFD", label: "CAFD" },
];

export const countryOptions: CountryOption[] = [
  { code: "UA", alpha3: "UKR", label: "Ukraine" },
  { code: "MD", alpha3: "MDA", label: "Moldova" },
  { code: "BG", alpha3: "BGR", label: "Bulgaria" },
  { code: "EG", alpha3: "EGY", label: "Egypt" },
  { code: "IL", alpha3: "ISR", label: "Israel" },
  { code: "CY", alpha3: "CYP", label: "Cyprus" },
  { code: "LB", alpha3: "LBN", label: "Lebanon" },
  { code: "ES", alpha3: "ESP", label: "Spain" },
  { code: "IT", alpha3: "ITA", label: "Italy" },
  { code: "NL", alpha3: "NLD", label: "Netherlands" },
  { code: "RO", alpha3: "ROU", label: "Romania" },
  { code: "TR", alpha3: "TUR", label: "Turkey" },
];

export const portOptions: PortOption[] = [
  { code: "pivdenny", label: "Pivdenny", countryCode: "UA" },
  { code: "odesa", label: "Odesa", countryCode: "UA" },
  { code: "chornomorsk", label: "Chornomorsk", countryCode: "UA" },
  { code: "izmail", label: "Izmail", countryCode: "UA" },
  { code: "giurgiulesti", label: "Giurgiulesti", countryCode: "MD" },
  { code: "burgas", label: "Burgas", countryCode: "BG" },
  { code: "marmara", label: "Marmara", countryCode: "TR" },
  { code: "alexandria", label: "Alexandria", countryCode: "EG" },
  { code: "ashdod", label: "Ashdod", countryCode: "IL" },
  { code: "limassol", label: "Limassol", countryCode: "CY" },
  { code: "beirut", label: "Beirut", countryCode: "LB" },
  { code: "constanta", label: "Constanta", countryCode: "RO" },
  { code: "izmir", label: "Izmir", countryCode: "TR" },
  { code: "mersin", label: "Mersin", countryCode: "TR" },
  { code: "ravenna", label: "Ravenna", countryCode: "IT" },
  { code: "tarragona", label: "Tarragona", countryCode: "ES" },
];

export const commodityOptionMap: Record<CommodityCode, Commodity> = commodityOptions.reduce(
  (acc, commodity) => {
    acc[commodity.code] = commodity;
    return acc;
  },
  {} as Record<CommodityCode, Commodity>,
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

export function getCountryLabel(countryCode: string | null | undefined) {
  if (!countryCode) return "";
  const normalized = countryCode.toUpperCase();
  const byCode = countryOptionMap[normalized];
  if (byCode) return byCode.label;

  const byAlpha3 = countryOptions.find((country) => country.alpha3 === normalized);
  if (byAlpha3) return byAlpha3.label;

  const byLabel = countryOptions.find(
    (country) => country.label.toLowerCase() === countryCode.toLowerCase(),
  );
  return byLabel?.label ?? countryCode;
}

export function getCountryAlpha3(countryCode: string | null | undefined) {
  if (!countryCode) return "";
  const normalized = countryCode.toUpperCase();
  const byCode = countryOptionMap[normalized];
  if (byCode) return byCode.alpha3;

  const byAlpha3 = countryOptions.find((country) => country.alpha3 === normalized);
  if (byAlpha3) return byAlpha3.alpha3;

  const byLabel = countryOptions.find(
    (country) => country.label.toLowerCase() === countryCode.toLowerCase(),
  );
  return byLabel?.alpha3 ?? countryCode;
}

export function getPortPlaceLabel(portCode: string | null | undefined) {
  if (!portCode) return "";
  const port = portOptionMap[portCode];
  if (!port) return portCode;
  return `${port.label}, ${getCountryLabel(port.countryCode)}`;
}

export function getPortPlaceCompactLabel(portCode: string | null | undefined) {
  if (!portCode) return "";
  const port = portOptionMap[portCode];
  if (!port) return portCode;
  return `${port.label}, ${getCountryAlpha3(port.countryCode)}`;
}

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
