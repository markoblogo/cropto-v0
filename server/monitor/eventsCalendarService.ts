export type AgriEventScope = "global" | "national";

export type AgriEventItem = {
  id: string;
  title: string;
  scope: AgriEventScope;
  segment: string[];
  region: string;
  country: string;
  city: string;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  website: string;
};

type EventsCatalog = {
  events: AgriEventItem[];
};

type EventsFilters = {
  country?: string;
  scope?: string;
  region?: string;
  segment?: string;
};

type EventsMapFeature = {
  id: string;
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: {
    country: string;
    total_events_count: number;
    global_events_count: number;
    national_events_count: number;
    events: AgriEventItem[];
  };
};

type EventsMapLayerResponse = {
  layer_id: "agri_events";
  layer_type: "point";
  updated_at: string;
  legend: {
    metric: "events_count";
    unit: "count";
    scale: "sequential";
    min: number;
    max: number;
  };
  features: EventsMapFeature[];
  note?: string;
};

const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  US: [-98.58, 39.82],
  CA: [-106.35, 56.13],
  UA: [31.17, 48.38],
  AR: [-63.62, -38.42],
  BR: [-52.89, -14.24],
  FR: [2.21, 46.23],
  DE: [10.45, 51.17],
  RO: [24.97, 45.94],
  CH: [8.22, 46.82],
  GB: [-1.17, 52.36],
  AE: [54.38, 24.47],
  NL: [5.29, 52.13],
  BE: [4.47, 50.5],
  IT: [12.57, 41.87],
  ZA: [22.94, -30.56],
};

const EVENTS_CATALOG: EventsCatalog = {
  events: [
    {
      id: "world_grain_pulses_forum_2026",
      title: "World Grain and Pulses Forum 2026",
      scope: "global",
      segment: ["grain_trading", "pulses", "logistics", "global_ag"],
      region: "MENA",
      country: "AE",
      city: "Dubai",
      start_date: "2026-01-26",
      end_date: "2026-01-28",
      website: "https://bsforum.ru/grain-forum-dubai-2026-conference-eng.php",
    },
    {
      id: "grains_world_expo_2026",
      title: "Grains World Conference & Expo 2026",
      scope: "global",
      segment: ["grain_trading", "wheat", "corn", "oilseeds", "logistics"],
      region: "MENA",
      country: "AE",
      city: "Dubai",
      start_date: "2026-02-20",
      end_date: "2026-02-21",
      website: "https://grainsworld.icfa.org.in/",
    },
    {
      id: "igc_grains_conference_2026",
      title: "IGC Grains Conference 2026",
      scope: "global",
      segment: ["wheat", "corn", "barley", "policy", "global_ag"],
      region: "Europe",
      country: "GB",
      city: "London",
      start_date: "2026-06-09",
      end_date: "2026-06-10",
      website: "https://www.igc.int/",
    },
    {
      id: "graincom_2026",
      title: "GrainCom 2026",
      scope: "global",
      segment: ["grain_trading", "logistics", "risk_management", "black_sea"],
      region: "Europe",
      country: "CH",
      city: "Geneva",
      start_date: "2026-05-11",
      end_date: "2026-05-13",
      website: "https://graincomevents.com",
    },
    {
      id: "geneva_dry_2026",
      title: "Geneva Dry 2026",
      scope: "global",
      segment: ["logistics", "dry_bulk", "shipping", "grain_flows"],
      region: "Europe",
      country: "CH",
      city: "Geneva",
      start_date: "2026-04-28",
      end_date: "2026-04-29",
      website: "https://genevadry.com",
    },
    {
      id: "argus_agri_feedstocks_2026",
      title: "Argus Agriculture & Feedstocks Conference 2026",
      scope: "global",
      segment: ["grains", "oilseeds", "biofuels", "logistics", "risk_management"],
      region: "Europe",
      country: "NL",
      city: "Amsterdam",
      start_date: "2026-03-03",
      end_date: "2026-03-04",
      website: "https://www.argusmedia.com/en/events/conferences/agriculture-and-feedstocks-conference",
    },
    {
      id: "salon_agriculture_2026",
      title: "Salon International de l'Agriculture 2026",
      scope: "global",
      segment: ["global_ag", "exhibition", "policy", "crops"],
      region: "Europe",
      country: "FR",
      city: "Paris",
      start_date: "2026-02-21",
      end_date: "2026-03-01",
      website: "https://www.salon-agriculture.com/en",
    },
    {
      id: "forum_future_ag_2026",
      title: "Forum for the Future of Agriculture 2026",
      scope: "global",
      segment: ["policy", "sustainability", "climate", "food_systems"],
      region: "Europe",
      country: "BE",
      city: "Brussels",
      start_date: "2026-04-14",
      end_date: "2026-04-14",
      website: "https://www.forumforagriculture.com",
    },
    {
      id: "eurograinexchange_2026",
      title: "EuroGrainExchange Bucharest 2026",
      scope: "global",
      segment: ["grain_trading", "wheat", "corn", "oilseeds", "black_sea", "logistics"],
      region: "Europe",
      country: "RO",
      city: "Bucharest",
      start_date: "2026-04-23",
      end_date: "2026-04-24",
      website: "https://eurograinevents.com",
    },
    {
      id: "international_commodity_summit_2026",
      title: "International Commodity Summit 2026",
      scope: "global",
      segment: ["wheat", "grain_trading", "risk", "policy", "africa"],
      region: "Global",
      country: "ZA",
      city: "Johannesburg",
      start_date: "2026-10-20",
      end_date: "2026-10-22",
      website: "https://internationalcommoditysummit.com/",
    },

    {
      id: "commodity_classic_2026",
      title: "Commodity Classic 2026",
      scope: "national",
      segment: ["grain_trading", "corn", "soybeans", "wheat", "farmers", "exhibition"],
      region: "North America",
      country: "US",
      city: "San Antonio",
      start_date: "2026-02-25",
      end_date: "2026-02-27",
      website: "https://commodityclassic.com",
    },
    {
      id: "usda_outlook_forum_2026",
      title: "USDA Agricultural Outlook Forum 2026",
      scope: "national",
      segment: ["macro_outlook", "policy", "prices", "trade", "us_ag"],
      region: "North America",
      country: "US",
      city: "Washington",
      start_date: "2026-02-19",
      end_date: "2026-02-20",
      website: "https://www.usda.gov/oce/ag-outlook-forum",
    },
    {
      id: "farm_progress_show_2026",
      title: "Farm Progress Show 2026",
      scope: "national",
      segment: ["exhibition", "technology", "machinery", "corn", "soybeans"],
      region: "North America",
      country: "US",
      city: "Boone",
      start_date: "2026-09-01",
      end_date: "2026-09-03",
      website: "https://www.farmprogressshow.com/",
    },
    {
      id: "mid_atlantic_grain_conference_2026",
      title: "Mid-Atlantic Grain Conference 2026",
      scope: "national",
      segment: ["regional_grains", "wheat", "barley", "milling", "markets"],
      region: "North America",
      country: "US",
      city: "Malvern",
      start_date: "2026-03-15",
      end_date: "2026-03-16",
      website: "https://www.commongrainalliance.org/2026-grain-conference",
    },

    {
      id: "canadian_crops_convention_2026",
      title: "Canadian Crops Convention 2026",
      scope: "national",
      segment: ["grain_trading", "oilseeds", "pulses", "special_crops", "markets"],
      region: "North America",
      country: "CA",
      city: "Toronto",
      start_date: "2026-03-10",
      end_date: "2026-03-12",
      website: "https://reg.eventmobi.com/2026-canadian-crops-convention",
    },
    {
      id: "march_classic_2026",
      title: "GFO March Classic 2026",
      scope: "national",
      segment: ["corn", "soybeans", "wheat", "markets", "technology"],
      region: "North America",
      country: "CA",
      city: "Niagara Falls",
      start_date: "2026-03-24",
      end_date: "2026-03-24",
      website: "https://gfo.ca/march-classic/",
    },
    {
      id: "crossroads_crop_conference_2026",
      title: "CrossRoads Crop Conference 2026",
      scope: "national",
      segment: ["wheat", "barley", "canola", "pulses", "western_canada"],
      region: "North America",
      country: "CA",
      city: "Edmonton",
      start_date: "2026-01-27",
      end_date: "2026-01-28",
      website: "https://www.albertagrains.com/events/2026-crossroads-crop-conference",
    },

    {
      id: "black_sea_grain_kyiv_2026",
      title: "BLACK SEA GRAIN. KYIV 2026",
      scope: "global",
      segment: ["grain_trading", "oilseeds", "black_sea", "danube", "logistics", "ukraine"],
      region: "Black Sea",
      country: "UA",
      city: "Kyiv",
      start_date: "2026-04-22",
      end_date: "2026-04-23",
      website: "https://ukragroconsult.com/en/conference/black-sea-grain-kyiv-2026/",
    },
    {
      id: "grain_storage_forum_2026",
      title: "Grain Storage Forum 2026",
      scope: "national",
      segment: ["storage", "logistics", "processing", "trading", "ukraine"],
      region: "Black Sea",
      country: "UA",
      city: "Kyiv",
      start_date: "2026-01-30",
      end_date: "2026-01-30",
      website: "https://grain-storage-forum.com/en",
    },
    {
      id: "agrospring_2026",
      title: "AgroSpring 2026",
      scope: "national",
      segment: ["exhibition", "grain_technologies", "logistics", "technology", "ukraine"],
      region: "Black Sea",
      country: "UA",
      city: "Kyiv",
      start_date: "2026-02-10",
      end_date: "2026-02-12",
      website: "https://agrospring.com.ua",
    },
    {
      id: "grain_ukraine_2026",
      title: "Grain Ukraine 2026",
      scope: "global",
      segment: ["grain_trading", "wheat", "corn", "oilseeds", "logistics", "ukraine"],
      region: "Black Sea",
      country: "UA",
      city: "Kyiv",
      start_date: "2026-05-29",
      end_date: "2026-05-30",
      website: "https://grain-ukraine.com",
    },

    {
      id: "aapresid_congress_2026",
      title: "Congreso Aapresid 2026",
      scope: "national",
      segment: ["innovation", "soybeans", "corn", "wheat", "technology", "argentina_ag"],
      region: "South America",
      country: "AR",
      city: "Rosario",
      start_date: "2026-08-04",
      end_date: "2026-08-06",
      website: "https://www.aapresid.org.ar",
    },
    {
      id: "a_todo_trigo_2026",
      title: "A Todo Trigo 2026",
      scope: "national",
      segment: ["wheat", "markets", "logistics", "risk", "argentina_wheat"],
      region: "South America",
      country: "AR",
      city: "Mar del Plata",
      start_date: "2026-05-14",
      end_date: "2026-05-15",
      website: "https://www.atodotrigo.com.ar",
    },
    {
      id: "expoagro_2026",
      title: "Expoagro 2026",
      scope: "national",
      segment: ["exhibition", "wheat", "corn", "soybeans", "technology"],
      region: "South America",
      country: "AR",
      city: "San Nicolas",
      start_date: "2026-03-05",
      end_date: "2026-03-08",
      website: "https://www.expoagro.com.ar",
    },

    {
      id: "world_agritech_south_america_2026",
      title: "World Agri-Tech South America Summit 2026",
      scope: "global",
      segment: ["innovation", "technology", "sustainability", "ag_finance", "latam_ag"],
      region: "South America",
      country: "BR",
      city: "Sao Paulo",
      start_date: "2026-06-23",
      end_date: "2026-06-24",
      website: "https://www.worldagritechsouthamerica.com/",
    },
    {
      id: "datagro_opening_crop_2026",
      title: "DATAGRO Opening Crop 2026",
      scope: "national",
      segment: ["soybeans", "corn", "cotton", "brazil_ag", "market_outlook", "logistics"],
      region: "South America",
      country: "BR",
      city: "Campo Grande",
      start_date: "2026-10-01",
      end_date: "2026-10-02",
      website: "https://www.datagroconferences.com/en/eventos/datagro-opening-crop-soybean-corn-cotton-2026/",
    },
    {
      id: "intermodal_south_america_2026",
      title: "Intermodal South America 2026",
      scope: "global",
      segment: ["logistics", "ports", "rail", "trucking", "container", "corridors"],
      region: "South America",
      country: "BR",
      city: "Sao Paulo",
      start_date: "2026-04-15",
      end_date: "2026-04-17",
      website: "https://www.intermodal.com.br",
    },
    {
      id: "forum_nacional_da_soja_2026",
      title: "Forum Nacional da Soja 2026",
      scope: "national",
      segment: ["soybeans", "corn", "logistics", "ports", "market_outlook"],
      region: "South America",
      country: "BR",
      city: "Nao-Me-Toque",
      start_date: "2026-03-10",
      end_date: "2026-03-10",
      website: "https://www.expodireto.cotrijal.com.br",
    },
  ],
};

function todayIsoParis(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value || "1970";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
}

function normalizeScope(scope?: string): AgriEventScope | "all" {
  const value = String(scope || "all").toLowerCase();
  if (value === "global" || value === "national") return value;
  return "all";
}

function isEventActiveOrUpcoming(event: AgriEventItem, today: string): boolean {
  return event.end_date >= today;
}

function matchesFilters(event: AgriEventItem, filters: EventsFilters): boolean {
  if (filters.country && filters.country.toUpperCase() !== "ALL" && event.country !== filters.country.toUpperCase()) return false;
  if (filters.scope && filters.scope.toLowerCase() !== "all" && event.scope !== filters.scope.toLowerCase()) return false;
  if (filters.region && filters.region.toLowerCase() !== "all" && event.region.toLowerCase() !== filters.region.toLowerCase()) return false;
  if (filters.segment && filters.segment.toLowerCase() !== "all") {
    const needle = filters.segment.toLowerCase();
    if (!event.segment.some((tag) => tag.toLowerCase() === needle)) return false;
  }
  return true;
}

export function listAgriEvents(filters: EventsFilters = {}) {
  const today = todayIsoParis();
  const scope = normalizeScope(filters.scope);
  const normalizedFilters: EventsFilters = {
    country: filters.country ? String(filters.country).toUpperCase() : undefined,
    scope,
    region: filters.region ? String(filters.region) : undefined,
    segment: filters.segment ? String(filters.segment) : undefined,
  };

  const items = EVENTS_CATALOG.events
    .filter((event) => isEventActiveOrUpcoming(event, today))
    .filter((event) => matchesFilters(event, normalizedFilters))
    .sort((a, b) => {
      if (a.start_date === b.start_date) return a.title.localeCompare(b.title);
      return a.start_date.localeCompare(b.start_date);
    });

  const scopes = ["all", "global", "national"].map((value) => ({
    value,
    count: value === "all" ? items.length : items.filter((event) => event.scope === value).length,
  }));
  const countries = ["all", ...Array.from(new Set(items.map((event) => event.country))).sort()].map((value) => ({
    value,
    count: value === "all" ? items.length : items.filter((event) => event.country === value.toUpperCase()).length,
  }));

  return {
    generatedAt: new Date().toISOString(),
    today,
    items,
    facets: {
      scopes,
      countries,
    },
  };
}

export function getAgriEventsMapLayer(): EventsMapLayerResponse {
  const today = todayIsoParis();
  const currentYear = Number(today.slice(0, 4));
  const activeCurrentYear = EVENTS_CATALOG.events
    .filter((event) => isEventActiveOrUpcoming(event, today))
    .filter((event) => Number(event.start_date.slice(0, 4)) === currentYear);

  const byCountry = new Map<string, AgriEventItem[]>();
  activeCurrentYear.forEach((event) => {
    const bucket = byCountry.get(event.country) || [];
    bucket.push(event);
    byCountry.set(event.country, bucket);
  });

  const features: EventsMapFeature[] = Array.from(byCountry.entries())
    .filter(([country]) => Boolean(COUNTRY_CENTROIDS[country]))
    .map(([country, events]) => {
      const globalCount = events.filter((event) => event.scope === "global").length;
      const nationalCount = events.length - globalCount;
      return {
        id: country,
        geometry: {
          type: "Point" as const,
          coordinates: COUNTRY_CENTROIDS[country],
        },
        properties: {
          country,
          total_events_count: events.length,
          global_events_count: globalCount,
          national_events_count: nationalCount,
          events: events.sort((a, b) => a.start_date.localeCompare(b.start_date)),
        },
      };
    })
    .sort((a, b) => b.properties.total_events_count - a.properties.total_events_count);

  const maxCount = features.reduce((max, feature) => Math.max(max, feature.properties.total_events_count), 0);

  return {
    layer_id: "agri_events",
    layer_type: "point",
    updated_at: new Date().toISOString(),
    legend: {
      metric: "events_count",
      unit: "count",
      scale: "sequential",
      min: 0,
      max: maxCount,
    },
    features,
    note: "Manual events catalog. Past events are auto-hidden by end_date; same-day events stay visible.",
  };
}
