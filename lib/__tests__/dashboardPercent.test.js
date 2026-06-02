import { describe, expect, it } from 'vitest';
import { dashboardPercent } from '@/lib/dashboardPercent';

describe('dashboardPercent', () => {
  it('keeps tiny non-zero percentages visible', () => {
    expect(dashboardPercent(1, 2105)).toBe(0.05);
  });

  it('does not round partial totals up to 100 percent', () => {
    expect(dashboardPercent(2104, 2105)).toBe(99.95);
  });

  it('returns exact boundaries for empty and complete totals', () => {
    expect(dashboardPercent(0, 2105)).toBe(0);
    expect(dashboardPercent(2105, 2105)).toBe(100);
  });
});
