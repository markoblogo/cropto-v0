/**
 * Unit conversion utilities for spot trading
 * Frontend works in tonnes (t), backend works in kilograms (kg)
 */

/**
 * Convert kilograms to tonnes
 * @param kg - Quantity in kilograms
 * @returns Quantity in tonnes
 */
export function kgToTons(kg: number): number {
  return kg / 1000;
}

/**
 * Convert tonnes to kilograms
 * @param tons - Quantity in tonnes
 * @returns Quantity in kilograms
 */
export function tonsToKg(tons: number): number {
  return tons * 1000;
}

/**
 * Format tonnes for display
 * @param tons - Quantity in tonnes
 * @returns Formatted string with 2 decimal places
 */
export function formatTons(tons: number): string {
  return tons.toFixed(2);
}

