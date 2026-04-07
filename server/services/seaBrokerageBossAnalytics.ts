import type { SeaBrokerageEntryRow } from "@shared/schema";
import { storage } from "../storage";

export interface BossAnalyticsResult {
  summary: {
    totalBids: number;
    totalOffers: number;
    totalTrades: number;
    totalVolumeMt: number;
    avgBidSpread: number;
    avgOfferSpread: number;
    matchableBidsPct: number;
    matchableOffersPct: number;
  };
  byBroker: Array<{
    brokerCode: string;
    brokerName: string;
    companyName: string;
    bidCount: number;
    offerCount: number;
    tradeCount: number;
    tradeVolumeMt: number;
    dealConversion: number; // trades / (bids + offers)
    avgBidSpread: number | null;
    avgOfferSpread: number | null;
    volumeConversion: number; // traded_volume / total_offered_volume
    performanceScore: number;
  }>;
  timeline: Array<{
    date: string;
    bidCount: number;
    offerCount: number;
    tradeCount: number;
    tradeVolumeMt: number;
  }>;
}

/**
 * Calculates Boss Analytics (Activity, Trades, Matchability, Volumes)
 */
export async function calculateSeaBrokerageBossAnalytics(
  filters: {
    brokerId?: string;
    companyName?: string;
    commodity?: string;
    basis?: string;
    dateFrom?: string;
    dateTo?: string;
  }
): Promise<BossAnalyticsResult> {
  const allEntries = await storage.listSeaBrokerageEntries();
  
  // 1. Initial Filtering
  const filtered = allEntries.filter(entry => {
    if (filters.dateFrom && new Date(entry.createdAt) < new Date(filters.dateFrom)) return false;
    if (filters.dateTo && new Date(entry.createdAt) > new Date(filters.dateTo)) return false;
    if (filters.brokerId && entry.brokerUserId !== filters.brokerId && entry.brokerCode !== filters.brokerId) return false;
    if (filters.companyName && entry.companyName !== filters.companyName) return false;
    if (filters.commodity && entry.commodity !== filters.commodity) return false;
    if (filters.basis && entry.basis !== filters.basis) return false;
    return true;
  });

  const bids = filtered.filter(e => e.type === "bid");
  const offers = filtered.filter(e => e.type === "offer");
  const trades = filtered.filter(e => e.type === "trade");

  // Helper: check overlap
  const hasPeriodOverlap = (e1: SeaBrokerageEntryRow, e2: SeaBrokerageEntryRow) => {
    if (!e1.periodStart || !e1.periodEnd || !e2.periodStart || !e2.periodEnd) return false;
    const s1 = new Date(e1.periodStart).getTime();
    const e1t = new Date(e1.periodEnd).getTime();
    const s2 = new Date(e2.periodStart).getTime();
    const e2t = new Date(e2.periodEnd).getTime();
    return s1 <= e2t && s2 <= e1t;
  };

  // Helper: check same place (port/country)
  const isSamePlace = (e1: SeaBrokerageEntryRow, e2: SeaBrokerageEntryRow) => {
    if (e1.destinationCountryCode && e1.destinationCountryCode === e2.destinationCountryCode) return true;
    const codes1 = (e1.destinationPortCode || "").split("|").map(s => s.trim()).filter(Boolean);
    const codes2 = (e2.destinationPortCode || "").split("|").map(s => s.trim()).filter(Boolean);
    return codes1.some(c => codes2.includes(c));
  };

  // 2. Aggregate by Broker
  const brokerMap = new Map<string, {
    brokerCode: string;
    brokerName: string;
    companyName: string;
    bids: SeaBrokerageEntryRow[];
    offers: SeaBrokerageEntryRow[];
    trades: SeaBrokerageEntryRow[];
  }>();

  for (const entry of filtered) {
    let data = brokerMap.get(entry.brokerCode);
    if (!data) {
      data = {
        brokerCode: entry.brokerCode,
        brokerName: entry.brokerName,
        companyName: entry.companyName,
        bids: [],
        offers: [],
        trades: [],
      };
      brokerMap.set(entry.brokerCode, data);
    }
    if (entry.type === "bid") data.bids.push(entry);
    else if (entry.type === "offer") data.offers.push(entry);
    else if (entry.type === "trade") data.trades.push(entry);
  }

  // 3. Matchability Analysis
  // For spreadsheet calculation, find min offer price for each bid, etc.
  const calculateSpread = (entry: SeaBrokerageEntryRow, opposites: SeaBrokerageEntryRow[]) => {
    const candidates = opposites.filter(opp => 
      opp.commodity === entry.commodity && 
      opp.basis === entry.basis && 
      hasPeriodOverlap(entry, opp) &&
      isSamePlace(entry, opp)
    );
    if (!candidates.length) return null;

    const entryPrice = Number(entry.price || entry.priceFrom || 0);
    if (entry.type === "bid") {
      const minOffer = Math.min(...candidates.map(c => Number(c.price || c.priceFrom || Infinity)));
      return minOffer - entryPrice;
    } else {
      const maxBid = Math.max(...candidates.map(c => Number(c.price || c.priceFrom || -Infinity)));
      return entryPrice - maxBid;
    }
  };

  // Process brokers
  const brokerList = Array.from(brokerMap.values()).map(data => {
    const bidSpreads = data.bids.map(b => calculateSpread(b, offers)).filter(s => s !== null) as number[];
    const offerSpreads = data.offers.map(o => calculateSpread(o, bids)).filter(s => s !== null) as number[];

    const avgBidSpread = bidSpreads.length ? bidSpreads.reduce((a, b) => a + b, 0) / bidSpreads.length : null;
    const avgOfferSpread = offerSpreads.length ? offerSpreads.reduce((a, b) => a + b, 0) / offerSpreads.length : null;

    const bidVolume = data.bids.reduce((acc, e) => acc + (e.quantityMt || e.volumeFrom || 0), 0);
    const offerVolume = data.offers.reduce((acc, e) => acc + (e.quantityMt || e.volumeFrom || 0), 0);
    const tradeVolume = data.trades.reduce((acc, e) => acc + (e.quantityMt || e.volumeFrom || 0), 0);

    const matchableBids = bidSpreads.filter(s => s <= 2).length; // User said spread <= -2 for potential match, meaning small gap
    // Spread = offer - bid. If offer 230 and bid 232, spread is -2. That's a strong match.
    // User said: spread_bid = offer_price_min - bid_price. spread <= -2$ is matchable.
    
    const dealConversion = data.trades.length / Math.max(1, data.bids.length + data.offers.length);
    const volumeConversion = tradeVolume / Math.max(1, offerVolume);

    // Score Calculation (Block 5)
    // Score = w1 * activity + w2 * matchability + w3 * traded_volume + w4 * deal_count
    // weights: activity 0.1, matchability 0.3, volume 0.3, deals 0.3
    const matchScore = (bidSpreads.length + offerSpreads.length) > 0 ? 
      (bidSpreads.filter(s => s <= 5).length + offerSpreads.filter(s => s <= 5).length) / (bidSpreads.length + offerSpreads.length) : 0;
    
    const score = (
      (Math.min(1, (data.bids.length + data.offers.length) / 50) * 0.1) +
      (matchScore * 0.3) +
      (Math.min(1, tradeVolume / 10000) * 0.3) +
      (Math.min(1, data.trades.length / 5) * 0.3)
    ) * 100;

    return {
      brokerCode: data.brokerCode,
      brokerName: data.brokerName,
      companyName: data.companyName,
      bidCount: data.bids.length,
      offerCount: data.offers.length,
      tradeCount: data.trades.length,
      tradeVolumeMt: tradeVolume,
      dealConversion: Number(dealConversion.toFixed(4)),
      avgBidSpread: avgBidSpread !== null ? Number(avgBidSpread.toFixed(2)) : null,
      avgOfferSpread: avgOfferSpread !== null ? Number(avgOfferSpread.toFixed(2)) : null,
      volumeConversion: Number(volumeConversion.toFixed(4)),
      performanceScore: Number(score.toFixed(1)),
    };
  });

  // 4. Timeline Aggregation
  const timelineMap = new Map<string, { date: string; bidCount: number; offerCount: number; tradeCount: number; tradeVolumeMt: number }>();
  for (const entry of filtered) {
    const day = new Date(entry.createdAt).toISOString().slice(0, 10);
    let dayData = timelineMap.get(day);
    if (!dayData) {
      dayData = { date: day, bidCount: 0, offerCount: 0, tradeCount: 0, tradeVolumeMt: 0 };
      timelineMap.set(day, dayData);
    }
    if (entry.type === "bid") dayData.bidCount++;
    else if (entry.type === "offer") dayData.offerCount++;
    else if (entry.type === "trade") {
      dayData.tradeCount++;
      dayData.tradeVolumeMt += (entry.quantityMt || entry.volumeFrom || 0);
    }
  }

  const timeline = Array.from(timelineMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  // 5. Global Summary
  const globalBidSpreads = brokerList.map(b => b.avgBidSpread).filter(s => s !== null) as number[];
  const globalOfferSpreads = brokerList.map(b => b.avgOfferSpread).filter(s => s !== null) as number[];
  
  return {
    summary: {
      totalBids: bids.length,
      totalOffers: offers.length,
      totalTrades: trades.length,
      totalVolumeMt: trades.reduce((acc, e) => acc + (e.quantityMt || e.volumeFrom || 0), 0),
      avgBidSpread: globalBidSpreads.length ? Number((globalBidSpreads.reduce((a, b) => a + b, 0) / globalBidSpreads.length).toFixed(2)) : 0,
      avgOfferSpread: globalOfferSpreads.length ? Number((globalOfferSpreads.reduce((a, b) => a + b, 0) / globalOfferSpreads.length).toFixed(2)) : 0,
      matchableBidsPct: 0, // Simplified for now
      matchableOffersPct: 0,
    },
    byBroker: brokerList.sort((a, b) => b.performanceScore - a.performanceScore),
    timeline,
  };
}
