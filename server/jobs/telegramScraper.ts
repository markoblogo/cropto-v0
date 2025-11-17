import * as cheerio from 'cheerio';
import { db } from '../db.js';
import { commodityIndexPrices, indexes } from '../../shared/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { parseAllSpikeMessage } from '../services/telegramParser.js';

const CHANNEL_URL = 'https://t.me/s/spike_brokers';
const SOURCE_SCRAPER = 'telegram/scraper';

interface ScrapedMessage {
  messageId: string;
  date: Date;
  text: string;
  commodities: Array<{
    slug: string;
    name: string;
    price: number;
    delta?: number;
  }>;
}

// Cache for index slugs to IDs
let indexCache: Map<string, string> | null = null;

async function getIndexCache(): Promise<Map<string, string>> {
  if (indexCache) return indexCache;
  
  const allIndexes = await db.select().from(indexes);
  indexCache = new Map(allIndexes.map(idx => [idx.slug, idx.id]));
  return indexCache;
}

export async function scrapeChannel(limit = 50): Promise<ScrapedMessage[]> {
  console.log(`[TelegramScraper] Fetching ${CHANNEL_URL}...`);
  
  try {
    const response = await fetch(CHANNEL_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const messages: ScrapedMessage[] = [];

    // Find message containers
    $('.tgme_widget_message').each((index, element) => {
      if (messages.length >= limit) return false;

      const $msg = $(element);
      
      // Extract message ID from data attribute or link
      const messageLink = $msg.find('.tgme_widget_message_date').attr('href');
      const messageId = messageLink ? messageLink.split('/').pop() || '' : '';
      
      if (!messageId) return;

      // Extract date from time element
      const dateStr = $msg.find('.tgme_widget_message_date time').attr('datetime');
      const date = dateStr ? new Date(dateStr) : new Date();

      // Extract text content with proper line breaks
      // Replace <br> tags with newlines before extracting text
      const $textElement = $msg.find('.tgme_widget_message_text');
      $textElement.find('br').replaceWith('\n');
      const text = $textElement.text().trim();

      if (!text) return;

      // Parse all commodities from the message
      const parseResult = parseAllSpikeMessage(text);
      
      // Log parser errors for monitoring
      if (parseResult.errors.length > 0) {
        console.log(`[TelegramScraper] Parser warnings for message ${messageId}:`, parseResult.errors);
      }

      const commodities = parseResult.data.map(item => ({
        slug: item.slug,
        name: item.commodity,
        price: item.price,
        delta: item.change,
      }));

      if (commodities.length > 0) {
        messages.push({
          messageId,
          date,
          text,
          commodities,
        });
      }
    });

    const totalCommodities = messages.reduce((sum, m) => sum + m.commodities.length, 0);
    console.log(`[TelegramScraper] Parsed ${messages.length} messages, ${totalCommodities} commodity prices found`);
    return messages;

  } catch (error) {
    console.error('[TelegramScraper] Error fetching channel:', error);
    throw error;
  }
}

export async function ingestScrapedData(messages: ScrapedMessage[]): Promise<number> {
  let newRecords = 0;
  let skippedRecords = 0;
  const cache = await getIndexCache();

  for (const msg of messages) {
    if (msg.commodities.length === 0) continue;

    try {
      // Process each commodity in the message
      for (const commodity of msg.commodities) {
        const indexId = cache.get(commodity.slug);
        
        if (!indexId) {
          console.warn(`[TelegramScraper] Unknown commodity slug: ${commodity.slug}, skipping`);
          continue;
        }

        try {
          // Check for duplicate entry (same index + exact timestamp)
          // This prevents re-ingesting the same message data on every scraper run
          const existingEntry = await db
            .select()
            .from(commodityIndexPrices)
            .where(
              and(
                eq(commodityIndexPrices.indexId, indexId),
                sql`${commodityIndexPrices.timestamp} = ${msg.date.toISOString()}`
              )
            )
            .limit(1);

          if (existingEntry.length > 0) {
            skippedRecords++;
            continue;
          }

          // Insert new price record
          await db.insert(commodityIndexPrices).values({
            indexId,
            price: commodity.price.toString(),
            delta: commodity.delta !== undefined ? commodity.delta.toString() : null,
            timestamp: msg.date,
          });

          // Update the index's updatedAt timestamp
          await db
            .update(indexes)
            .set({ updatedAt: new Date() })
            .where(eq(indexes.id, indexId));

          newRecords++;
          console.log(`[TelegramScraper] ✓ Inserted ${commodity.name} price $${commodity.price} (${commodity.delta !== undefined ? `${commodity.delta > 0 ? '+' : ''}${commodity.delta}` : 'no delta'}) from message ${msg.messageId}`);

        } catch (error) {
          console.error(`[TelegramScraper] Error inserting ${commodity.name} from message ${msg.messageId}:`, error);
        }
      }

    } catch (error) {
      console.error(`[TelegramScraper] Error processing message ${msg.messageId}:`, error);
    }
  }

  if (skippedRecords > 0) {
    console.log(`[TelegramScraper] Skipped ${skippedRecords} duplicate records`);
  }

  return newRecords;
}

export async function runScraper(once = false) {
  console.log(`[TelegramScraper] Starting scraper ${once ? '(--once mode)' : '(interval mode)'}`);
  
  const scrapeAndIngest = async () => {
    try {
      const messages = await scrapeChannel(50);
      const newRecords = await ingestScrapedData(messages);
      console.log(`[TelegramScraper] ✅ Scraping complete: ${newRecords} new records inserted`);
    } catch (error) {
      console.error('[TelegramScraper] ❌ Scraping failed:', error);
    }
  };

  if (once) {
    await scrapeAndIngest();
    return;
  }

  // Interval mode
  const intervalSec = parseInt(process.env.TELEGRAM_SCRAPE_INTERVAL_SEC || '600', 10);
  console.log(`[TelegramScraper] Interval set to ${intervalSec}s`);

  // Run immediately on start
  await scrapeAndIngest();

  // Then run on interval
  setInterval(scrapeAndIngest, intervalSec * 1000);
}

// CLI support
if (import.meta.url === `file://${process.argv[1]}`) {
  const onceFlag = process.argv.includes('--once');
  runScraper(onceFlag).catch(console.error);
}
