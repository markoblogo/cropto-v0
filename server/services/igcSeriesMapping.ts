/**
 * IGC Series Mapping
 * 
 * Maps country + commodity combinations to the preferred IGC label/series
 * that should be displayed on the Market Dashboard.
 * 
 * Only series listed here will be shown - this prevents displaying
 * incorrect or unwanted series if IGC changes their HTML structure.
 */

export const IGC_SERIES_MAPPING = {
  BR: {
    soybeans: 'Brazil (Paranagua)',
    maize: 'Brazil Feed (Paranagua)',
  },
  AR: {
    wheat: 'Argentina Grade 2, Up River',
    maize: 'Argentina Feed (Up River)',
    barley: 'Argentina Feed, Up River',
    soybeans: 'Argentina (Up River)',
  },
  US: {
    wheat: 'US No 2 Hard Red Winter (HRW)',
    maize: 'US 3YC (Gulf)',
    soybeans: 'US 2Y (Gulf)',
  },
} as const;

/**
 * Expected minimum number of IGC records for validation
 * If we get fewer than this, something might be wrong with the parser
 */
export const EXPECTED_MIN_IGC_RECORDS = 8;

/**
 * Expected commodity counts per country
 */
export const EXPECTED_COMMODITY_COUNTS = {
  BR: 2, // soybeans, maize
  AR: 4, // wheat, maize, barley, soybeans
  US: 3, // wheat, maize, soybeans
} as const;

