/**
 * IGC Price Service
 * Fetches and parses daily grain prices from IGC (International Grains Council)
 * https://www.igc.int/en/markets/marketinfo-prices.aspx
 * 
 * Uses Playwright for headless browser automation to handle JavaScript-based tab switching
 */

import { chromium, type Browser, type Page } from "playwright";
import * as cheerio from "cheerio";

export interface IgcPrice {
  commodity: "wheat" | "maize" | "barley" | "soybeans" | "rice";
  country: "US" | "BR" | "AR";
  label: string;
  asOfDate: string; // ISO format: yyyy-mm-dd
  priceUsdPerTon: number;
  dailyChangePct?: number | null;
  annualChangePct?: number | null;
  low52w?: number | null;
  high52w?: number | null;
  rawRow: Record<string, string>;
  confidence?: "high" | "medium" | "low";
  meta?: Record<string, unknown>;
}

const IGC_BASE_URL = "https://www.igc.int/en/markets/marketinfo-prices.aspx";

// Commodity tab mapping
const COMMODITY_TABS: Record<string, string> = {
  wheat: "Wheat",
  maize: "Maize",
  barley: "Barley",
  soybeans: "Soyabeans", // Note: IGC uses "Soyabeans" spelling
  rice: "Rice",
};

// Country name mappings for parsing
const COUNTRY_MAPPINGS: Record<string, "US" | "BR" | "AR"> = {
  "argentina": "AR",
  "brazil": "BR",
  "us": "US",
  "u.s.": "US",
  "u.s.a.": "US",
  "united states": "US",
};

/**
 * Parse date string from IGC format (e.g., "1 Jan", "15 Dec") to ISO format
 * Assumes current year if year is not specified
 */
function parseDate(dateStr: string): string {
  const trimmed = dateStr.trim();
  if (!trimmed) return new Date().toISOString().split("T")[0];

  // Try to parse formats like "1 Jan", "15 Dec", "1 Jan 2024"
  const months: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };

  const parts = trimmed.toLowerCase().split(/\s+/);
  if (parts.length < 2) {
    return new Date().toISOString().split("T")[0];
  }

  const day = parseInt(parts[0], 10);
  const monthName = parts[1];
  const month = months[monthName];
  
  if (isNaN(day) || month === undefined) {
    return new Date().toISOString().split("T")[0];
  }

  const year = parts.length >= 3 ? parseInt(parts[2], 10) : new Date().getFullYear();
  const date = new Date(year, month, day);
  return date.toISOString().split("T")[0];
}

/**
 * Parse price string (may contain commas, $, etc.)
 */
function parsePrice(priceStr: string): number {
  if (!priceStr) return 0;
  // Remove currency symbols, commas, and whitespace
  const cleaned = priceStr.replace(/[$,\s]/g, "");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Parse percentage string (may contain % sign, +, -)
 */
function parsePercentage(percentStr: string): number | null {
  if (!percentStr) return null;
  const cleaned = percentStr.replace(/[%\s+]/g, "");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Check if a string contains a country name
 * Handles Brazil patterns: "Brazil Feed (Paranagua)", "Brazil (Paranagua)", etc.
 */
function extractCountry(text: string): "US" | "BR" | "AR" | null {
  const lower = text.toLowerCase();
  
  // Check standard mappings (including "brazil" which maps to "BR")
  for (const [key, country] of Object.entries(COUNTRY_MAPPINGS)) {
    if (lower.includes(key)) {
      return country;
    }
  }
  return null;
}

/**
 * Extract table data from HTML for a specific commodity tab
 * Now receives HTML from the active tab context (from Playwright)
 */
function extractTableData(html: string, commodity: string): IgcPrice[] {
  const $ = cheerio.load(html);
  const results: IgcPrice[] = [];

  // Find the table - look for price data table
  // Try multiple strategies to find the correct table
  const allTables = $("table");
  
  let $table = allTables.filter((i, el) => {
    const text = $(el).text().toLowerCase();
    // Look for tables that contain country names and price data
    return (
      text.includes("argentina") ||
      text.includes("brazil") ||
      text.includes("us") ||
      text.includes("u.s.")
    );
  }).first();

  // If no table found with countries, try finding by structure
  if ($table.length === 0) {
    // Look for tables with multiple columns (likely price tables)
    $table = $("table").filter((i, el) => {
      const $rows = $(el).find("tr");
      return $rows.length > 5; // Reasonable size for a price table
    }).first();
  }

  if ($table.length === 0) {
    console.warn(`[IGC] No table found for commodity ${commodity}`);
    return results;
  }

  // Parse table rows
  const $rows = $table.find("tr");
  
  // Assume first row is headers
  const headers: string[] = [];
  $rows.first().find("th, td").each((i, el) => {
    headers.push($(el).text().trim());
  });

  // Process data rows
  $rows.slice(1).each((i, row) => {
    const $cells = $(row).find("td");
    if ($cells.length === 0) return;

    // Extract all cell values
    const cells: string[] = [];
    $cells.each((j, cell) => {
      cells.push($(cell).text().trim());
    });

    if (cells.length === 0) return;

    // First column typically contains the label (country + description)
    const firstCell = cells[0];
    const country = extractCountry(firstCell);
    
    if (!country) {
      // Skip rows that don't match our target countries
      return;
    }

    // Build raw row object
    const rawRow: Record<string, string> = {};
    headers.forEach((header, idx) => {
      rawRow[header] = cells[idx] || "";
    });
    rawRow["_rowIndex"] = i.toString();

    // Try to find price column (usually contains numeric values with $ or USD)
    let priceValue = 0;
    let priceColumnIdx = -1;
    for (let j = 1; j < cells.length; j++) {
      const cellValue = cells[j];
      if (cellValue && /[\d,.]/.test(cellValue)) {
        const parsed = parsePrice(cellValue);
        if (parsed > 0 && parsed < 10000) {
          // Reasonable price range for grains per ton
          priceValue = parsed;
          priceColumnIdx = j;
          break;
        }
      }
    }

    // Try to find date column (usually contains date strings)
    let dateStr = "";
    for (let j = 1; j < cells.length; j++) {
      const cellValue = cells[j];
      if (cellValue && /jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(cellValue)) {
        dateStr = cellValue;
        break;
      }
    }

    // Find daily change column (typically "%" or "Daily % Change")
    let dailyChange: number | null = null;
    const dailyChangeHeaderIdx = headers.findIndex(h => 
      /daily.*change|daily.*%/i.test(h)
    );
    if (dailyChangeHeaderIdx >= 0 && cells[dailyChangeHeaderIdx]) {
      dailyChange = parsePercentage(cells[dailyChangeHeaderIdx]);
    }

    // Find annual change column
    let annualChange: number | null = null;
    const annualChangeHeaderIdx = headers.findIndex(h => 
      /annual.*change|annual.*%/i.test(h)
    );
    if (annualChangeHeaderIdx >= 0 && cells[annualChangeHeaderIdx]) {
      annualChange = parsePercentage(cells[annualChangeHeaderIdx]);
    }

    // Find 52-week low column
    let low52w: number | null = null;
    const low52wHeaderIdx = headers.findIndex(h => 
      /52.*week.*low|52w.*low/i.test(h)
    );
    if (low52wHeaderIdx >= 0 && cells[low52wHeaderIdx]) {
      low52w = parsePrice(cells[low52wHeaderIdx]);
    }

    // Find 52-week high column
    let high52w: number | null = null;
    const high52wHeaderIdx = headers.findIndex(h => 
      /52.*week.*high|52w.*high/i.test(h)
    );
    if (high52wHeaderIdx >= 0 && cells[high52wHeaderIdx]) {
      high52w = parsePrice(cells[high52wHeaderIdx]);
    }

    // Only add if we have a valid price
    if (priceValue > 0 && country) {
      const result = {
        commodity: commodity as "wheat" | "maize" | "barley" | "soybeans" | "rice",
        country,
        label: firstCell,
        asOfDate: dateStr ? parseDate(dateStr) : new Date().toISOString().split("T")[0],
        priceUsdPerTon: priceValue,
        dailyChangePct: dailyChange,
        annualChangePct: annualChange,
        low52w: low52w && low52w > 0 ? low52w : null,
        high52w: high52w && high52w > 0 ? high52w : null,
        rawRow,
      };
      results.push(result);
    }
  });

  return results;
}

/**
 * Fetch daily prices from IGC for all commodities and countries using Playwright
 * 
 * Validates that we get data for expected commodities and logs warnings if something is missing.
 */
export async function fetchDailyPrices(): Promise<IgcPrice[]> {
  const allPrices: IgcPrice[] = [];
  let browser: Browser | null = null;
  
  try {
    // Launch headless browser
    browser = await chromium.launch({
      headless: true,
    });
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    
    const page = await context.newPage();
    
    // Navigate to IGC page
    console.log(`[IGC] Navigating to ${IGC_BASE_URL}...`);
    await page.goto(IGC_BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    
    // Wait for page to load
    await page.waitForTimeout(2000);
    
    // Process each commodity
    for (const [commodityKey, commodityTabName] of Object.entries(COMMODITY_TABS)) {
      try {
        console.log(`[IGC] Processing commodity: ${commodityKey} (${commodityTabName})...`);
        
        // Try to find and click the tab for this commodity
        // IGC tabs might be buttons, links, or divs - try multiple selectors
        let tabClicked = false;
        
        // Try different approaches to find the tab
        try {
          // Approach 1: Try exact text match using getByText
          const exactTab = page.getByText(commodityTabName, { exact: false }).first();
          const count = await exactTab.count();
          if (count > 0) {
            await exactTab.click({ timeout: 5000 });
            tabClicked = true;
          }
        } catch (e: any) {
          // Try next approach
        }
        
        if (!tabClicked) {
          try {
            // Approach 2: Try button with text using filter
            const buttons = page.locator('button');
            const buttonCount = await buttons.count();
            for (let i = 0; i < buttonCount; i++) {
              const btn = buttons.nth(i);
              const text = await btn.textContent();
              if (text && text.includes(commodityTabName)) {
                await btn.click({ timeout: 5000 });
                tabClicked = true;
                break;
              }
            }
          } catch (e: any) {
            // Try next approach
          }
        }
        
        if (!tabClicked) {
          try {
            // Approach 3: Try link with text
            const links = page.locator('a');
            const linkCount = await links.count();
            for (let i = 0; i < linkCount; i++) {
              const link = links.nth(i);
              const text = await link.textContent();
              if (text && text.includes(commodityTabName)) {
                await link.click({ timeout: 5000 });
                tabClicked = true;
                break;
              }
            }
          } catch (e: any) {
            // Try next approach
          }
        }
        
        if (!tabClicked) {
          try {
            // Approach 4: Try role="tab"
            const tabs = page.locator('[role="tab"]');
            const tabCount = await tabs.count();
            for (let i = 0; i < tabCount; i++) {
              const tab = tabs.nth(i);
              const text = await tab.textContent();
              if (text && text.includes(commodityTabName)) {
                await tab.click({ timeout: 5000 });
                tabClicked = true;
                break;
              }
            }
          } catch (e: any) {
            // Continue without clicking
          }
        }
        
        if (tabClicked) {
          // Wait for tab content to load and table to appear
          await page.waitForTimeout(1500);
          // Wait for table to be visible (if possible)
          try {
            await page.waitForSelector('table', { timeout: 3000, state: 'visible' });
          } catch {
            // Table might already be there, continue
          }
        } else {
          console.warn(`[IGC] Could not find/click tab for ${commodityTabName}, trying to parse current content...`);
        }
        
        // Get HTML content after tab switch
        const html = await page.content();
        
        // Extract table data for this commodity
        const prices = extractTableData(html, commodityKey);
        
        // Filter to only include our target countries
        const filtered = prices.filter(p => 
          p.country === "US" || p.country === "BR" || p.country === "AR"
        );
        
        allPrices.push(...filtered);
        
        // Log per-commodity count (detailed logging happens after all commodities)
      } catch (error: any) {
        console.error(`[IGC] Error fetching ${commodityKey}:`, error.message);
        // Continue with next commodity
      }
    }
    
    await browser.close();
    
    console.log(`[IGC] Total prices fetched: ${allPrices.length}`);
    
    // Validation: check if we got data for expected commodities
    const pricesByCommodity = new Map<string, number>();
    for (const price of allPrices) {
      const count = pricesByCommodity.get(price.commodity) || 0;
      pricesByCommodity.set(price.commodity, count + 1);
    }
    
    // Warn if any commodity has no data
    for (const commodityKey of Object.keys(COMMODITY_TABS)) {
      const count = pricesByCommodity.get(commodityKey) || 0;
      if (count === 0) {
        console.warn(`[IGC] ⚠️  No prices fetched for commodity: ${commodityKey}`);
      } else {
        console.log(`[IGC] ✓ Fetched ${count} prices for ${commodityKey}`);
      }
    }
    
    // Warn if total count is below expected minimum
    if (allPrices.length < 8) {
      console.warn(`[IGC] ⚠️  Low record count: ${allPrices.length} (expected at least 8). IGC HTML structure may have changed.`);
    }
    
    return allPrices;
  } catch (error: any) {
    console.error("[IGC] Error fetching daily prices:", error.message);
    if (browser) {
      await browser.close();
    }
    throw error;
  }
}
