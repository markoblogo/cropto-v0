export interface ParsedIndexPrice {
  commodity: string;
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
