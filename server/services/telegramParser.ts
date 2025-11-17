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

// Mapping of Ukrainian commodity names to English slugs
const COMMODITY_MAPPINGS: Record<string, string> = {
  'Кукурудза': 'corn',
  'Пшениця 11.5pro': 'wheat-115',
  'Пшениця фураж': 'feed-wheat',
  'Соя ГМО': 'gmo-soybeans', // Default to regular GMO soybeans
  'Ріпак': 'rapeseed',
  'Соняшник': 'sunflower-seed',
};

// Parse all commodities from a Spike Brokers message
export function parseAllSpikeMessage(text: string): MultiParserResult {
  const normalizedText = text.trim();
  const results: ParsedIndexPrice[] = [];
  const errors: string[] = [];

  // Regex patterns for all commodities (with global flag for matchAll)
  const commodityPatterns = [
    { name: 'Кукурудза', slug: 'corn', regex: /[•\-–—]?\s*Кукурудза\s*[–—-]\s*([0-9]+(?:[.,][0-9]+)?)\s*\$\s*\(([+-]?[0-9]+(?:[.,][0-9]+)?)\$\)/g },
    { name: 'Пшениця 11.5pro', slug: 'wheat-115', regex: /[•\-–—]?\s*Пшениц[яа]\s*11\.5(?:pro)?\s*[–—-]\s*([0-9]+(?:[.,][0-9]+)?)\s*\$\s*\(([+-]?[0-9]+(?:[.,][0-9]+)?)\$\)/g },
    { name: 'Пшениця фураж', slug: 'feed-wheat', regex: /[•\-–—]?\s*Пшениц[яа]\s*фураж\s*[–—-]\s*([0-9]+(?:[.,][0-9]+)?)\s*\$\s*\(([+-]?[0-9]+(?:[.,][0-9]+)?)\$\)/g },
    { name: 'Соя ГМО', slug: 'gmo-soybeans', regex: /[•\-–—]?\s*Со[яі]\s*ГМО\s*[–—-]\s*([0-9]+(?:[.,][0-9]+)?)\s*\$\s*\(([+-]?[0-9]+(?:[.,][0-9]+)?)\$\)/g },
    { name: 'Ріпак', slug: 'rapeseed', regex: /[•\-–—]?\s*Ріпак\s*[–—-]\s*([0-9]+(?:[.,][0-9]+)?)\s*\$\s*\(([+-]?[0-9]+(?:[.,][0-9]+)?)\$\)/g },
    { name: 'Соняшник', slug: 'sunflower-seed', regex: /[•\-–—]?\s*Соняшник\s*[–—-]\s*([0-9]+(?:[.,][0-9]+)?)\s*\$\s*\(([+-]?[0-9]+(?:[.,][0-9]+)?)\$\)/g },
  ];

  // Determine location from message (CPT ODESA or CPT PARITET ODESA)
  const locationMatch = normalizedText.match(/CPT\s+(?:PARITET\s+)?([^\n]+)/i);
  const location = locationMatch ? locationMatch[0].trim() : undefined;
  const isParitet = location?.includes('PARITET') || location?.includes('ПАРИТЕТ');

  // Parse each commodity using matchAll to capture all occurrences
  for (const pattern of commodityPatterns) {
    const matches = Array.from(normalizedText.matchAll(pattern.regex));
    
    if (matches.length === 0) {
      // Log warning for missing expected commodities
      errors.push(`Commodity not found: ${pattern.name}`);
      continue;
    }

    // Process each occurrence
    matches.forEach((match, index) => {
      const priceStr = match[1].replace(',', '.');
      const price = parseFloat(priceStr);

      if (isNaN(price) || price <= 0) {
        errors.push(`Invalid price for ${pattern.name}: ${priceStr}`);
        return;
      }

      // Parse delta (change)
      const changeStr = match[2] ? match[2].replace(',', '.') : '0';
      const change = parseFloat(changeStr);

      // Special handling for "Соя ГМО" - distinguish between regular and processing
      let slug = pattern.slug;
      if (pattern.slug === 'gmo-soybeans' && isParitet && index === 1) {
        // Second occurrence in PARITET messages is for processing variant
        slug = 'gmo-soybeans-processing';
      }

      results.push({
        commodity: pattern.name,
        slug,
        price,
        location,
        change: isNaN(change) ? undefined : change,
        raw: match[0],
      });
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
