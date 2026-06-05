import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import MetricCards, {
  resolveMetricAccent,
  resolveMetricSurface,
} from '../MetricCards';

const CARDS = [
  { label: 'Total', value: 42 },
  { label: 'Passed', value: 30, cls: 'pass' },
  { label: 'Failed', value: 12, cls: 'fail' },
];

describe('MetricCards', () => {
  it('renders one metric-card per item with correct label and value', () => {
    render(<MetricCards cards={CARDS} />);
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Passed')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
  });

  it('renders a Skeleton for every value when loading is true', () => {
    render(<MetricCards cards={CARDS} loading />);
    const skeletons = screen.getAllByTestId('metric-skeleton');
    expect(skeletons).toHaveLength(CARDS.length);
  });

  it('renders a metric-sub element when sub is provided', () => {
    const cards = [{ label: 'Total', value: 10, sub: 'All imported' }];
    render(<MetricCards cards={cards} />);
    expect(screen.getByText('All imported')).toBeInTheDocument();
  });

  it('renders correct number of cards', () => {
    render(<MetricCards cards={CARDS} />);
    const cardEls = screen.getAllByTestId('metric-card');
    expect(cardEls).toHaveLength(CARDS.length);
  });

  it('resolves an accent color for every card, including cards without cls', () => {
    expect(resolveMetricAccent({ cls: 'pass' })).toBe('pass.main');
    expect(resolveMetricAccent({ cls: 'fail' })).toBe('fail.main');
    expect(resolveMetricAccent({ cls: 'pending' })).toBe('pending.main');
    expect(resolveMetricAccent({ label: 'Total Test Cases' })).toBe('grey.300');
    expect(resolveMetricAccent({ label: 'Pass Rate' })).toBe('pass.border');
    expect(resolveMetricAccent({ label: 'Fail Rate' })).toBe('fail.border');
  });

  it('resolves a surface tone for status and rate cards', () => {
    expect(resolveMetricSurface({ cls: 'pass' })).toBe('pass.light');
    expect(resolveMetricSurface({ cls: 'fail' })).toBe('fail.light');
    expect(resolveMetricSurface({ cls: 'pending' })).toBe('pending.light');
    expect(resolveMetricSurface({ label: 'Pass Rate' })).toBe('pass.light');
    expect(resolveMetricSurface({ label: 'Fail Rate' })).toBe('fail.light');
    expect(resolveMetricSurface({ label: 'Total Test Cases' })).toBe(
      'background.paper',
    );
  });
});
