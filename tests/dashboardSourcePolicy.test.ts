import { describe, expect, it } from '@jest/globals';
import { deriveMarketHealth, selectCountryRows, selectTruthSeriesPerCommodity } from '../server/services/dashboardSourcePolicy';
import { normalizeCommodity } from '../shared/commodities';
import type { MarketIndexDto } from '../server/services/mockMarketData';

function row(overrides: Partial<MarketIndexDto>): MarketIndexDto {
  return {
    commodity: 'corn',
    grade: null,
    country: 'BR',
    basis: 'FOB Santos',
    price: 200,
    currency: 'USD',
    change24h: 0,
    change7d: 0,
    change30d: 0,
    asOf: '2026-02-10T00:00:00.000Z',
    source: 'CLAL',
    ...overrides,
  };
}

describe('dashboard source policy', () => {
  it('normalizes commodity aliases to canonical keys', () => {
    expect(normalizeCommodity('maize').commodity).toBe('corn');
    expect(normalizeCommodity('corn').commodity).toBe('corn');
    expect(normalizeCommodity('soy').commodity).toBe('soybeans');
    expect(normalizeCommodity('soya').commodity).toBe('soybeans');
    expect(normalizeCommodity('soia').commodity).toBe('soybeans');
    expect(normalizeCommodity('soybeans').commodity).toBe('soybeans');
  });

  it('real stale beats mock fresh', () => {
    const staleReal = row({ source: 'CLAL', priceStatus: 'stale', dataStatus: 'stale', isMockData: false });
    const freshMock = row({ source: 'mock', isMockData: true, priceStatus: 'fresh', dataStatus: 'fresh' });

    const selected = selectCountryRows([freshMock, staleReal], true);

    expect(selected.usedMock).toBe(false);
    expect(selected.selected).toHaveLength(1);
    expect(selected.selected[0].source).toBe('CLAL');
  });

  it('mock only when no real rows', () => {
    const mockOnly = [row({ source: 'mock', isMockData: true })];
    const selectedWhenAllowed = selectCountryRows(mockOnly, true);
    expect(selectedWhenAllowed.usedMock).toBe(true);
    expect(selectedWhenAllowed.selected).toHaveLength(1);

    const selectedWhenDenied = selectCountryRows(mockOnly, false);
    expect(selectedWhenDenied.usedMock).toBe(false);
    expect(selectedWhenDenied.selected).toHaveLength(0);
  });

  it('market health is WARN for stale real data (not FAIL)', () => {
    const staleReal = row({ source: 'CLAL', priceStatus: 'stale', dataStatus: 'stale', isMockData: false });
    const health = deriveMarketHealth([staleReal]);
    expect(health.status).toBe('WARN');
    expect(health.source).toContain('CLAL');
  });

  it('selects primary over fallback for same canonical commodity', () => {
    const primary = row({
      commodity: 'corn',
      source: 'CLAL',
      provider: 'CLAL',
      sourceTier: 'primary',
      priceStatus: 'fresh',
      dataStatus: 'fresh',
      asOf: '2026-02-19T00:00:00.000Z',
    });
    const fallback = row({
      commodity: 'maize',
      source: 'GRAINSPRICES',
      provider: 'GRAINSPRICES',
      sourceTier: 'secondary',
      priceStatus: 'fresh',
      dataStatus: 'fresh',
      asOf: '2026-02-19T00:00:00.000Z',
    });

    const selected = selectTruthSeriesPerCommodity([fallback, primary], {
      providerPriority: ['CLAL', 'GRAINSPRICES'],
      debug: true,
    });

    expect(selected).toHaveLength(1);
    expect(selected[0].commodity).toBe('corn');
    expect(selected[0].provider).toBe('CLAL');
    expect(selected[0].alternatives?.length).toBe(1);
  });

  it('deduplicates corn and maize into one card', () => {
    const rows = [
      row({ commodity: 'corn', source: 'CLAL', provider: 'CLAL', sourceTier: 'primary' }),
      row({ commodity: 'maize', source: 'IGC', provider: 'IGC', sourceTier: 'secondary' }),
    ];
    const selected = selectTruthSeriesPerCommodity(rows, { providerPriority: ['CLAL', 'IGC'] });
    expect(selected).toHaveLength(1);
    expect(selected[0].commodity).toBe('corn');
  });

  it('fresh fallback beats stale primary', () => {
    const stalePrimary = row({
      commodity: 'wheat',
      provider: 'CLAL',
      source: 'CLAL',
      sourceTier: 'primary',
      priceStatus: 'stale',
      dataStatus: 'stale',
      freshnessDays: 10,
      asOf: '2026-02-01T00:00:00.000Z',
    });
    const freshFallback = row({
      commodity: 'wheat',
      provider: 'BCR',
      source: 'BCR',
      sourceTier: 'secondary',
      priceStatus: 'fresh',
      dataStatus: 'fresh',
      freshnessDays: 1,
      asOf: '2026-02-19T00:00:00.000Z',
    });

    const selected = selectTruthSeriesPerCommodity([stalePrimary, freshFallback], {
      providerPriority: ['CLAL', 'BCR'],
    });
    expect(selected).toHaveLength(1);
    expect(selected[0].provider).toBe('BCR');
  });

  it('does not leak cross-commodity rows into selection', () => {
    const cornRow = row({
      commodity: 'corn',
      provider: 'CLAL',
      source: 'CLAL',
      sourceTier: 'primary',
      priceStatus: 'stale',
      dataStatus: 'stale',
      freshnessDays: 3,
    });
    const soyRow = row({
      commodity: 'soybeans',
      provider: 'CLAL',
      source: 'CLAL',
      sourceTier: 'primary',
      priceStatus: 'fresh',
      dataStatus: 'fresh',
      freshnessDays: 0,
    });
    const selected = selectTruthSeriesPerCommodity([cornRow, soyRow], { providerPriority: ['CLAL'] });
    const corn = selected.find((x) => x.commodity === 'corn');
    expect(corn).toBeDefined();
    expect(corn?.commodity).toBe('corn');
    expect(corn?.price).toBe(cornRow.price);
  });

  it('ignores rows marked needsReview or invalidReason', () => {
    const bad = row({
      commodity: 'soybeans',
      provider: 'CLAL',
      source: 'CLAL',
      sourceTier: 'primary',
      needsReview: true,
      invalidReason: 'OUT_OF_RANGE',
    });
    const good = row({
      commodity: 'soybeans',
      provider: 'GRAINSPRICES',
      source: 'GRAINSPRICES',
      sourceTier: 'secondary',
      priceStatus: 'stale',
      dataStatus: 'stale',
      needsReview: false,
    });
    const selected = selectTruthSeriesPerCommodity([bad, good], { providerPriority: ['CLAL', 'GRAINSPRICES'] });
    expect(selected).toHaveLength(1);
    expect(selected[0].provider).toBe('GRAINSPRICES');
  });
});
