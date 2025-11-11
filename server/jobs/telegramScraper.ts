import * as cheerio from 'cheerio';
import { db } from '../db.js';
import { indexPrices } from '../../shared/schema.js';
import { eq, and } from 'drizzle-orm';

const CHANNEL_URL = 'https://t.me/s/spike_brokers';
const WHEAT_REGEX = /Пшениця\s*11\.5(?:pro)?\s*[–—-]\s*([0-9]+(?:[.,][0-9]+)?)\s*\$/;
const SOURCE_SCRAPER = 'telegram/scraper';

interface ScrapedMessage {
  messageId: string;
  date: Date;
  text: string;
  price?: number;
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

      // Extract text content
      const text = $msg.find('.tgme_widget_message_text').text().trim();

      if (!text) return;

      // Try to extract wheat price
      const match = text.match(WHEAT_REGEX);
      let price: number | undefined;

      if (match && match[1]) {
        const priceStr = match[1].replace(',', '.');
        price = parseFloat(priceStr);
        
        if (!isNaN(price)) {
          price = Math.round(price * 100) / 100; // Round to 2 decimals
        } else {
          price = undefined;
        }
      }

      messages.push({
        messageId,
        date,
        text,
        price
      });
    });

    console.log(`[TelegramScraper] Parsed ${messages.length} messages, ${messages.filter(m => m.price).length} with wheat prices`);
    return messages;

  } catch (error) {
    console.error('[TelegramScraper] Error fetching channel:', error);
    throw error;
  }
}

export async function ingestScrapedData(messages: ScrapedMessage[]): Promise<number> {
  let newRecords = 0;

  for (const msg of messages) {
    if (!msg.price) continue; // Skip messages without wheat price

    try {
      // Check for duplicates
      const existing = await db
        .select()
        .from(indexPrices)
        .where(
          and(
            eq(indexPrices.source, SOURCE_SCRAPER),
            eq(indexPrices.messageId, msg.messageId)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        console.log(`[TelegramScraper] Skipping duplicate message ${msg.messageId}`);
        continue;
      }

      // Insert new record
      await db.insert(indexPrices).values({
        commodity: 'WHEAT',
        price: msg.price.toString(),
        date: msg.date,
        source: SOURCE_SCRAPER,
        raw: msg.text,
        messageId: msg.messageId,
        meta: JSON.stringify({
          url: `${CHANNEL_URL}/${msg.messageId}`,
          scraped_at: new Date().toISOString()
        }),
        isDemo: 'false'
      });

      newRecords++;
      console.log(`[TelegramScraper] ✓ Inserted WHEAT price $${msg.price} from message ${msg.messageId}`);

    } catch (error) {
      console.error(`[TelegramScraper] Error inserting message ${msg.messageId}:`, error);
    }
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
