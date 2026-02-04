/**
 * Tests for IGC Series Mapping
 * 
 * Validates that the IGC_SERIES_MAPPING constant is properly structured
 * and that filtering logic works correctly.
 */

import { describe, it, expect } from '@jest/globals';
import { IGC_SERIES_MAPPING, EXPECTED_COMMODITY_COUNTS } from '../server/services/igcSeriesMapping';

describe('IGC Series Mapping', () => {
  it('should have correct structure', () => {
    expect(IGC_SERIES_MAPPING).toBeDefined();
    expect(IGC_SERIES_MAPPING.BR).toBeDefined();
    expect(IGC_SERIES_MAPPING.AR).toBeDefined();
    expect(IGC_SERIES_MAPPING.US).toBeDefined();
  });

  it('should have expected commodities for BR', () => {
    expect(IGC_SERIES_MAPPING.BR.soybeans).toBe('Brazil (Paranagua)');
    expect(IGC_SERIES_MAPPING.BR.maize).toBe('Brazil Feed (Paranagua)');
    expect(Object.keys(IGC_SERIES_MAPPING.BR).length).toBe(EXPECTED_COMMODITY_COUNTS.BR);
  });

  it('should have expected commodities for AR', () => {
    expect(IGC_SERIES_MAPPING.AR.wheat).toBe('Argentina Grade 2, Up River');
    expect(IGC_SERIES_MAPPING.AR.maize).toBe('Argentina Feed (Up River)');
    expect(IGC_SERIES_MAPPING.AR.barley).toBe('Argentina Feed, Up River');
    expect(IGC_SERIES_MAPPING.AR.soybeans).toBe('Argentina (Up River)');
    expect(Object.keys(IGC_SERIES_MAPPING.AR).length).toBe(EXPECTED_COMMODITY_COUNTS.AR);
    // AR should NOT have rice
    expect((IGC_SERIES_MAPPING.AR as any).rice).toBeUndefined();
  });

  it('should have expected commodities for US', () => {
    expect(IGC_SERIES_MAPPING.US.wheat).toBe('US No 2 Hard Red Winter (HRW)');
    expect(IGC_SERIES_MAPPING.US.maize).toBe('US 3YC (Gulf)');
    expect(IGC_SERIES_MAPPING.US.soybeans).toBe('US 2Y (Gulf)');
    expect(Object.keys(IGC_SERIES_MAPPING.US).length).toBe(EXPECTED_COMMODITY_COUNTS.US);
    // US should NOT have barley or rice
    expect((IGC_SERIES_MAPPING.US as any).barley).toBeUndefined();
    expect((IGC_SERIES_MAPPING.US as any).rice).toBeUndefined();
  });

  it('should filter labels correctly using startsWith', () => {
    const testCases: Array<{
      country: keyof typeof IGC_SERIES_MAPPING;
      commodity: string;
      label: string;
      expected: boolean;
    }> = [
      { country: 'BR', commodity: 'soybeans', label: 'Brazil (Paranagua)', expected: true },
      { country: 'BR', commodity: 'soybeans', label: 'Brazil (Paranagua) - extra text', expected: true },
      { country: 'BR', commodity: 'soybeans', label: 'Brazil Feed (Paranagua)', expected: false },
      { country: 'AR', commodity: 'wheat', label: 'Argentina Grade 2, Up River', expected: true },
      { country: 'AR', commodity: 'wheat', label: 'Argentina Grade 2, Up River (extra)', expected: true },
      { country: 'AR', commodity: 'wheat', label: 'Argentina Feed, Up River', expected: false },
      { country: 'US', commodity: 'wheat', label: 'US No 2 Hard Red Winter (HRW)', expected: true },
      { country: 'US', commodity: 'wheat', label: 'US No 2 Soft Red Winter (SRW)', expected: false },
    ];

    for (const testCase of testCases) {
      const countryMapping = IGC_SERIES_MAPPING[testCase.country];
      const preferredLabel = countryMapping?.[testCase.commodity as keyof typeof countryMapping];
      if (!preferredLabel) {
        expect(testCase.expected).toBe(false);
        continue;
      }
      const matches = testCase.label.startsWith(preferredLabel);
      expect(matches).toBe(testCase.expected);
    }
  });
});

