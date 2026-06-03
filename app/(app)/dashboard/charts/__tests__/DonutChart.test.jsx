import { describe, expect, it } from 'vitest';
import { buildSideLabelLayout, buildSideLabelText } from '../DonutChart';

describe('buildSideLabelLayout', () => {
  it('keeps labels separated and within the donut bounds', () => {
    const labels = [
      { name: 'Pass', value: 3, ex: -18, ey: -84, color: '#0d9488' },
      { name: 'Fail', value: 1, ex: -20, ey: -78, color: '#dc2626' },
      { name: 'Pending', value: 2101, ex: 88, ey: 36, color: '#d97706' },
    ];

    const layout = buildSideLabelLayout(labels, {
      radius: 96,
      labelElbow: 18,
      labelTick: 8,
      labelVertMargin: 12,
      labelGap: 18,
    });

    expect(layout).toHaveLength(3);

    for (const dir of [-1, 1]) {
      const sideLabels = layout
        .filter((label) => label.dir === dir)
        .sort((a, b) => a.labelY - b.labelY);
      for (let i = 1; i < sideLabels.length; i++) {
        expect(
          Math.abs(sideLabels[i].labelY - sideLabels[i - 1].labelY),
        ).toBeGreaterThanOrEqual(18);
      }
    }

    layout.forEach((label) => {
      expect(label.labelY).toBeGreaterThanOrEqual(-(96 - 12));
      expect(label.labelY).toBeLessThanOrEqual(96 - 12);
    });
  });

  it('can use both sides when one side becomes crowded', () => {
    const labels = [
      { name: 'Pass', value: 3, ex: -18, ey: -84, color: '#0d9488' },
      { name: 'Fail', value: 4, ex: -20, ey: -82, color: '#dc2626' },
      { name: 'Pending', value: 2098, ex: -22, ey: -80, color: '#d97706' },
    ];

    const layout = buildSideLabelLayout(labels, {
      radius: 104,
      labelElbow: 16,
      labelTick: 6,
      labelVertMargin: 10,
      labelGap: 16,
    });

    expect(layout.some((label) => label.dir === -1)).toBe(true);
    expect(layout.some((label) => label.dir === 1)).toBe(true);
  });

  it('builds stacked side-label text with the name above the count', () => {
    expect(buildSideLabelText({ name: 'Pending', value: 2101 })).toEqual([
      'Pending',
      '2101',
    ]);
    expect(buildSideLabelText({ name: 'Fail', value: 1 })).toEqual([
      'Fail',
      '1',
    ]);
  });
});
