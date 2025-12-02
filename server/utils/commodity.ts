/**
 * Utilities for normalizing legacy commodity identifiers.
 *
 * Historically, the system used a generic `WHEAT` commodity without
 * proper slug/metadata. The new index system uses a structured slug
 * and name for Wheat 11.5%:
 *
 *   name: "Wheat 11.5%"
 *   slug: "wheat-115"
 *
 * This helper centralizes mapping of legacy identifiers to the new
 * canonical slug so that:
 * - old data continues to work
 * - UI consistently shows Wheat 11.5% instead of bare WHEAT
 */

const LEGACY_WHEAT_SYMBOLS = ["WHEAT"];
const LEGACY_WHEAT_SLUGS = ["wheat"];

export const WHEAT_115_SLUG = "wheat-115";
export const WHEAT_115_NAME = "Wheat 11.5%";

/**
 * Normalize legacy commodity identifier (symbol or slug) to canonical slug.
 *
 * Examples:
 * - "WHEAT"      -> "wheat-115"
 * - "wheat"      -> "wheat-115"
 * - "wheat-115"  -> "wheat-115"
 * - anything else -> returned as-is
 */
export function normalizeLegacyCommodity(commoditySlugOrId: string): string {
  if (!commoditySlugOrId) return commoditySlugOrId;

  const trimmed = commoditySlugOrId.trim();
  const upper = trimmed.toUpperCase();
  const lower = trimmed.toLowerCase();

  if (LEGACY_WHEAT_SYMBOLS.includes(upper) || LEGACY_WHEAT_SLUGS.includes(lower)) {
    return WHEAT_115_SLUG;
  }

  return trimmed;
}

/**
 * Helper to check if an incoming identifier refers to legacy WHEAT.
 */
export function isLegacyWheat(commoditySlugOrId: string | null | undefined): boolean {
  if (!commoditySlugOrId) return false;
  const trimmed = commoditySlugOrId.trim();
  const upper = trimmed.toUpperCase();
  const lower = trimmed.toLowerCase();
  return LEGACY_WHEAT_SYMBOLS.includes(upper) || LEGACY_WHEAT_SLUGS.includes(lower);
}


