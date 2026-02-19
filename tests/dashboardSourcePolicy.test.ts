import { describe, expect, it } from '@jest/globals';
import { deriveMarketHealth, selectCountryRows } from '../server/services/dashboardSourcePolicy';
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
});
