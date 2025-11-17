export interface ParsedIndexPrice {
  commodity: string;
  slug: string;
  price: number;
  location?: string;
  change?: number;
  raw: string;
}

export interface ParserResult {
  success: boolean;
  data?: ParsedIndexPrice;
  error?: string;
}

export interface MultiParserResult {
  success: boolean;
  data: ParsedIndexPrice[];
  errors: string[];
}

// Context-aware commodity mapping: {name, context} → slug
// CPT ОДЕСА (export) vs CPT ПАРИТЕТ (processing)
type SectionContext = 'export' | 'processing' | null;

interface CommodityMapping {
  name: string;
  slug: string;
  context?: SectionContext; // If specified, only match in this context
}

const COMMODITY_MAPPINGS: CommodityMapping[] = [
  { name: 'Кукурудза', slug: 'corn', context: 'export' },
  { name: 'Пшениця 11.5pro', slug: 'wheat-115', context: 'export' },
  { name: 'Пшениця фураж', slug: 'feed-wheat', context: 'export' },
  { name: 'Соя ГМО', slug: 'gmo-soybeans', context: 'export' },
  { name: 'Соя ГМО', slug: 'gmo-soybeans-processing', context: 'processing' },
  { name: 'Ріпак', slug: 'rapeseed', context: 'processing' },
  { name: 'Соняшник', slug: 'sunflower-seed', context: 'processing' },
];

// Parse all commodities from a Spike Brokers message using line-by-line approach
export function parseAllSpikeMessage(text: string): MultiParserResult {
  const normalizedText = text.trim();
  const results: ParsedIndexPrice[] = [];
  const errors: string[] = [];

  // Split into lines for sequential parsing
  const lines = normalizedText.split(/\r?\n/);
  
  let currentContext: SectionContext = null;
  let currentLocation: string | undefined;

  // Flexible regex for bullet lines that allows text between price and delta
  // Matches: "• Commodity – 209$ (0$)" and "• Commodity – 450$ в т.ч. ПДВ (+1$)"
  // Capture groups: [1]=name, [2]=price, [3]=filler text, [4]=delta
  const bulletRegex = /^[•]\s*(.+?)\s*[–—-]\s*(\d+(?:[.,]\d+)?)\s*\$?\s*([^\(]*?)\s*\(([+−-]?\d+(?:[.,]\d+)?)\s*\$\)/;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Detect section headers
    if (trimmedLine.includes('CPT ОДЕСА') || trimmedLine.includes('CPT ODESA')) {
      currentContext = 'export';
      currentLocation = 'CPT ODESA, УКРАЇНА (експорт)';
      continue;
    }
    
    if (trimmedLine.includes('CPT ПАРИТЕТ') || trimmedLine.includes('CPT PARITET')) {
      currentContext = 'processing';
      currentLocation = 'CPT ПАРИТЕТ ОДЕСА, УКРАЇНА (переробка)';
      continue;
    }

    // Parse bullet lines (commodity entries)
    const match = trimmedLine.match(bulletRegex);
    if (!match) continue;

    const name = match[1];
    const priceStr = match[2];
    const deltaStr = match[4];
    
    // Normalize commodity name (trim whitespace)
    const normalizedName = name.trim();

    // Find matching commodity slug based on name and current context
    const mapping = COMMODITY_MAPPINGS.find(
      m => m.name === normalizedName && 
           (m.context === currentContext || m.context === undefined)
    );

    if (!mapping) {
      errors.push(`Unknown commodity in ${currentContext || 'unknown'} section: ${normalizedName}`);
      continue;
    }

    // Parse price
    const price = parseFloat(priceStr.replace(',', '.'));
    if (isNaN(price) || price <= 0) {
      errors.push(`Invalid price for ${normalizedName}: ${priceStr}`);
      continue;
    }

    // Parse delta (change)
    const delta = parseFloat(deltaStr.replace(',', '.').replace('−', '-'));
    const change = isNaN(delta) ? undefined : delta;

    results.push({
      commodity: normalizedName,
      slug: mapping.slug,
      price,
      location: currentLocation,
      change,
      raw: trimmedLine,
    });
  }

  return {
    success: results.length > 0,
    data: results,
    errors,
  };
}

// Legacy single-commodity parser (for backward compatibility with webhook)
export function parseSpikeMessage(text: string): ParserResult {
  const normalizedText = text.trim();

  const wheatRegex = /Пшениц[яа]\s*11\.5(?:pro)?\s*[–—-]\s*([0-9]+(?:[.,][0-9]+)?)\s*\$/;
  const match = normalizedText.match(wheatRegex);

  if (!match) {
    return {
      success: false,
      error: "No wheat price found in message",
    };
  }

  const priceStr = match[1].replace(',', '.');
  const price = parseFloat(priceStr);

  if (isNaN(price) || price <= 0) {
    return {
      success: false,
      error: `Invalid price value: ${priceStr}`,
    };
  }

  const locationMatch = normalizedText.match(/CPT\s+([\u0400-\u04FF]+)/);
  const location = locationMatch ? locationMatch[1] : undefined;

  const changeMatch = normalizedText.match(/\(([+-]?[0-9]+(?:[.,][0-9]+)?)\$\)/);
  const change = changeMatch ? parseFloat(changeMatch[1].replace(',', '.')) : undefined;

  return {
    success: true,
    data: {
      commodity: 'WHEAT',
      slug: 'wheat-115',
      price,
      location,
      change,
      raw: normalizedText,
    },
  };
}

export function parseSimpleMessage(text: string): ParserResult {
  const parts = text.trim().split(/\s+/);

  if (parts.length !== 2) {
    return {
      success: false,
      error: "Invalid format. Expected: COMMODITY PRICE",
    };
  }

  const [commodity, priceStr] = parts;
  const price = parseFloat(priceStr);

  if (isNaN(price) || price <= 0) {
    return {
      success: false,
      error: "Invalid price value",
    };
  }

  if (!/^[A-Z0-9]+$/i.test(commodity)) {
    return {
      success: false,
      error: "Invalid commodity name",
    };
  }

  return {
    success: true,
    data: {
      commodity: commodity.toUpperCase(),
      slug: commodity.toLowerCase(),
      price,
      raw: text.trim(),
    },
  };
}

export function parseIndexMessage(text: string): ParserResult {
  const spikeResult = parseSpikeMessage(text);
  if (spikeResult.success) {
    return spikeResult;
  }

  const simpleResult = parseSimpleMessage(text);
  if (simpleResult.success) {
    return simpleResult;
  }

  return {
    success: false,
    error: "Message does not match any supported format",
  };
}
