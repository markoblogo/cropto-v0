export type SeaBrokerageTransportMode = "land" | "river" | "bulk_sea" | "container";

export type SeaBrokerageTransportDictionaryEntry = {
  code: string;
  displayLabel: string;
  displayLabelUa: string;
  icon: string;
  transportMode: SeaBrokerageTransportMode;
  aliases?: string[];
};

const normalizeTransportLookup = (value: string | null | undefined) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

export const SEA_BROKERAGE_TRANSPORT_DICTIONARY: SeaBrokerageTransportDictionaryEntry[] = [
  { code: "sea_containers", displayLabel: "sea containers", displayLabelUa: "морські контейнери", icon: "🛳", transportMode: "container", aliases: ["container", "sea container", "sea_containers"] },
  { code: "tank_containers", displayLabel: "tank containers", displayLabelUa: "контейнери-цистерни", icon: "🗃", transportMode: "container", aliases: ["tank container", "tank_containers"] },
  { code: "barges", displayLabel: "barges", displayLabelUa: "баржі", icon: "⛴️", transportMode: "river", aliases: ["barge"] },
  { code: "barges_vessels", displayLabel: "barges | vessels", displayLabelUa: "баржа | судно", icon: "⛴️ | 🚢", transportMode: "river", aliases: ["barge | vessel", "barge|vessel"] },
  { code: "coaster", displayLabel: "coaster", displayLabelUa: "костер", icon: "🚢", transportMode: "bulk_sea" },
  { code: "handy", displayLabel: "handy", displayLabelUa: "хенді", icon: "🚢", transportMode: "bulk_sea", aliases: ["handysize"] },
  { code: "panamax", displayLabel: "panamax", displayLabelUa: "панамакс", icon: "🚢", transportMode: "bulk_sea" },
  { code: "vessel", displayLabel: "vessel", displayLabelUa: "судно", icon: "🚢", transportMode: "bulk_sea", aliases: ["vessel (other)", "supramax", "capesize"] },
  { code: "dump_trucks_to_barges", displayLabel: "dump trucks → barges", displayLabelUa: "самоскиди → баржа", icon: "🚚 → ⛴️", transportMode: "river" },
  { code: "dump_trucks_to_eu_wagons", displayLabel: "dump trucks → EU wagons", displayLabelUa: "самоскиди → євровагони", icon: "🚚 → 🚈", transportMode: "land" },
  { code: "dump_trucks_to_vessel", displayLabel: "dump trucks → vessel", displayLabelUa: "самоскиди → судно", icon: "🚚 → 🚢", transportMode: "bulk_sea" },
  { code: "dump_trucks_on_board_trucks", displayLabel: "dump trucks | on-board trucks", displayLabelUa: "самоскиди | бортові", icon: "🚚 | 🚛", transportMode: "land" },
  { code: "on_board_trucks", displayLabel: "on-board trucks", displayLabelUa: "бортові", icon: "🚛", transportMode: "land" },
  { code: "ua_wagons_to_barges", displayLabel: "UA wagons → barges", displayLabelUa: "укр. вагони → баржа", icon: "🚃 → ⛴️", transportMode: "river" },
  { code: "ua_wagons_to_vessel", displayLabel: "UA wagons → vessel", displayLabelUa: "укр. вагони → судно", icon: "🚃 → 🚢", transportMode: "bulk_sea" },
  { code: "ua_wagons_dump_trucks_to_vessel", displayLabel: "UA wagons | dump trucks → vessel", displayLabelUa: "укр. вагони | самоскиди → судно", icon: "🚃 | 🚚 → 🚢", transportMode: "bulk_sea", aliases: ["ua wagons | dump trucks to vessel"] },
  { code: "ua_wagons_dump_trucks_on_board_trucks", displayLabel: "UA wagons | dump trucks | on-board trucks", displayLabelUa: "укр. вагони | самоскиди | бортові", icon: "🚃 | 🚚 | 🚛", transportMode: "land", aliases: ["ua wagons | dump trucks | onboard trucks"] },
  { code: "open_top_wagons", displayLabel: "open-top wagons", displayLabelUa: "напіввагони", icon: "🚇", transportMode: "land" },
  { code: "dump_trucks", displayLabel: "dump trucks", displayLabelUa: "самоскиди", icon: "🚚", transportMode: "land", aliases: ["truck"] },
  { code: "ua_wagons", displayLabel: "UA wagons", displayLabelUa: "укр. вагони", icon: "🚃", transportMode: "land", aliases: ["rail"] },
  { code: "ua_wagons_dump_trucks", displayLabel: "UA wagons | dump trucks", displayLabelUa: "укр. вагони | самоскиди", icon: "🚃 | 🚚", transportMode: "land" },
  { code: "ua_wagons_trucks", displayLabel: "UA wagons | trucks", displayLabelUa: "укр. вагони | авто", icon: "🚚 | 🚃", transportMode: "land", aliases: ["truck/rail", "ua wagons | truck"] },
  { code: "dump_trucks_tent_trucks", displayLabel: "dump trucks | tent trucks", displayLabelUa: "самоскиди | тенти", icon: "🚚 | 🛻", transportMode: "land" },
  { code: "rw_containers", displayLabel: "RW containers", displayLabelUa: "зал. контейнери", icon: "🗃", transportMode: "container", aliases: ["railway containers", "rail containers"] },
  { code: "tent_trucks", displayLabel: "tent trucks", displayLabelUa: "тенти", icon: "🛻", transportMode: "land" },
  { code: "ua_wagons_to_border_terminal", displayLabel: "UA wagons → border terminal", displayLabelUa: "укр. вагони → термінал на кордоні", icon: "🚃 → 🚏", transportMode: "land" },
  { code: "ua_wagons_to_eu_wagons", displayLabel: "UA wagons → EU wagons", displayLabelUa: "укр. вагони → євровагони", icon: "🚃 → 🚈", transportMode: "land" },
  { code: "ua_wagons_open_top_wagons", displayLabel: "UA wagons | open-top wagons", displayLabelUa: "укр. вагони | напіввагони", icon: "🚃 | 🚇", transportMode: "land" },
  { code: "ua_wagons_rw_containers", displayLabel: "UA wagons | RW containers", displayLabelUa: "укр. вагони | зал. контейнери", icon: "🚃 | 🗃", transportMode: "container" },
  { code: "eu_railway_tank_cars", displayLabel: "EU railway tank cars", displayLabelUa: "євровагони-цистерни", icon: "🚝", transportMode: "land" },
  { code: "eu_wagons", displayLabel: "EU wagons", displayLabelUa: "євровагони", icon: "🚈", transportMode: "land" },
  { code: "elevator", displayLabel: "elevator", displayLabelUa: "перепис по елеватору", icon: "🏠", transportMode: "land" },
  { code: "warehouse", displayLabel: "warehouse", displayLabelUa: "склад", icon: "🏠", transportMode: "land" },
  { code: "flexitanks", displayLabel: "flexitanks", displayLabelUa: "флексітанк", icon: "🛺", transportMode: "container", aliases: ["flexitank"] },
  { code: "ua_railway_tank_cars", displayLabel: "UA railway tank cars", displayLabelUa: "укр. вагони-цистерни", icon: "🚋", transportMode: "land" },
  { code: "ua_railway_tank_cars_tank_containers", displayLabel: "UA railway tank cars | tank containers", displayLabelUa: "укр. вагони-цистерни | контейнери-цистерни", icon: "🚋 | 🗃", transportMode: "container" },
  { code: "ua_railway_tank_cars_tank_trucks", displayLabel: "UA railway tank cars | tank trucks", displayLabelUa: "укр. вагони-цистерни | автоцистерни", icon: "🚋 | 🚍", transportMode: "land" },
  { code: "tank_trucks_flexitanks", displayLabel: "tank trucks | flexitanks", displayLabelUa: "автоцистерни | флексітанки", icon: "🚍 | 🛺", transportMode: "land" },
  { code: "tank_trucks", displayLabel: "tank trucks", displayLabelUa: "автоцистерни", icon: "🚍", transportMode: "land" },
];

const TRANSPORT_BY_CODE = new Map(
  SEA_BROKERAGE_TRANSPORT_DICTIONARY.map((item) => [item.code, item]),
);

const TRANSPORT_BY_LOOKUP = new Map<string, SeaBrokerageTransportDictionaryEntry>();
for (const item of SEA_BROKERAGE_TRANSPORT_DICTIONARY) {
  TRANSPORT_BY_LOOKUP.set(normalizeTransportLookup(item.code), item);
  TRANSPORT_BY_LOOKUP.set(normalizeTransportLookup(item.displayLabel), item);
  for (const alias of item.aliases || []) {
    TRANSPORT_BY_LOOKUP.set(normalizeTransportLookup(alias), item);
  }
}

export function resolveSeaBrokerageTransport(
  value: string | null | undefined,
): SeaBrokerageTransportDictionaryEntry | null {
  const lookup = normalizeTransportLookup(value);
  if (!lookup) return null;
  return TRANSPORT_BY_LOOKUP.get(lookup) || null;
}

export function normalizeSeaBrokerageTransportCode(
  value: string | null | undefined,
  fallback = "vessel",
) {
  const resolved = resolveSeaBrokerageTransport(value);
  if (resolved) return resolved.code;
  const raw = String(value || "").trim();
  if (raw) return raw;
  return TRANSPORT_BY_CODE.has(fallback) ? fallback : SEA_BROKERAGE_TRANSPORT_DICTIONARY[0]?.code || fallback;
}

export function getSeaBrokerageTransportDisplayLabel(
  value: string | null | undefined,
  fallback = "",
) {
  const resolved = resolveSeaBrokerageTransport(value);
  if (resolved) return resolved.displayLabel;
  return String(value || fallback).trim();
}

export function getSeaBrokerageTransportIcon(value: string | null | undefined) {
  const resolved = resolveSeaBrokerageTransport(value);
  return resolved?.icon || "";
}

export function getSeaBrokerageTransportMode(
  value: string | null | undefined,
  fallback: SeaBrokerageTransportMode = "land",
): SeaBrokerageTransportMode {
  const resolved = resolveSeaBrokerageTransport(value);
  return resolved?.transportMode || fallback;
}
