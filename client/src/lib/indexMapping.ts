/**
 * Client-side mapping for index types and pair codes
 * 
 * TODO: This mapping is based on assumptions from the seed data structure.
 * In production, these should come from the backend API or be stored in the index metadata.
 * 
 * Mapping rules:
 * - CPT ODESA category = Export index (no VAT)
 * - CPT PARITET ODESA category = Processing index (with VAT)
 * - Pair codes follow pattern: CROPT/{INDEX_CODE}
 * - Index codes are derived from slug (uppercase, replace hyphens)
 */

export type IndexType = "export" | "processing";

export interface IndexMetadata {
  pairCode: string;
  type: IndexType;
  indexCode: string;
}

/**
 * Generate pair code from slug
 * Example: "feed-wheat" -> "FWTEX" or "FWTEXPR" for processing
 */
function slugToIndexCode(slug: string, type: IndexType): string {
  // Convert slug to uppercase and replace hyphens
  const parts = slug.split('-');
  let code = parts
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  
  // Add suffix based on type
  // For export: add "EX" (e.g., "FeedWheat" -> "FWTEX")
  // For processing: add "PR" (e.g., "GmoSoybeans" -> "GSOYPR")
  // But keep it short, so we'll use abbreviations
  if (type === "export") {
    // Common abbreviations: Corn -> CRNEX, Wheat -> WHTEX, FeedWheat -> FWTEX
    if (slug.includes("corn")) code = "CRNEX";
    else if (slug.includes("wheat-115")) code = "WHTEX";
    else if (slug.includes("feed-wheat")) code = "FWTEX";
    else if (slug.includes("gmo-soybeans") && !slug.includes("processing")) code = "SOYEX";
    else if (slug.includes("rapeseed")) code = "RAPEX";
    else if (slug.includes("sunflower")) code = "SUNEX";
    else code = code.substring(0, 3).toUpperCase() + "EX";
  } else {
    // Processing: add PR suffix
    if (slug.includes("gmo-soybeans-processing")) code = "SOYPR";
    else if (slug.includes("rapeseed")) code = "RAPPR";
    else if (slug.includes("sunflower")) code = "SUNPR";
    else code = code.substring(0, 3).toUpperCase() + "PR";
  }
  
  return code;
}

/**
 * Get index metadata based on category and slug
 */
export function getIndexMetadata(
  slug: string,
  category: string
): IndexMetadata {
  // Determine type from category
  const type: IndexType = category.includes("PARITET") ? "processing" : "export";
  
  // Generate index code from slug
  const indexCode = slugToIndexCode(slug, type);
  
  // Generate pair code
  const pairCode = `CROPT/${indexCode}`;
  
  return {
    pairCode,
    type,
    indexCode,
  };
}

/**
 * Get all available trading pairs from indexes
 */
export function getTradingPairs(indexes: Array<{ slug: string; category: string; name: string }>): Array<{
  slug: string;
  name: string;
  pairCode: string;
  type: IndexType;
}> {
  return indexes.map(index => {
    const metadata = getIndexMetadata(index.slug, index.category);
    return {
      slug: index.slug,
      name: index.name,
      pairCode: metadata.pairCode,
      type: metadata.type,
    };
  });
}

