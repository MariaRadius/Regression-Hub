// components/__tests__/SummaryRow.test.jsx
import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import theme from '@/app/theme';
import SummaryRow from '../SummaryRow';

function renderRow(props) {
  return render(
    <ThemeProvider theme={theme}>
      <SummaryRow {...props} />
    </ThemeProvider>,
  );
}

describe('SummaryRow', () => {
  it('renders the name and pass/fail/pending counts', () => {
    renderRow({ name: 'Auth', passed: 5, failed: 2, pending: 3, total: 10 });
    expect(screen.getByText('Auth')).toBeInTheDocument();
    expect(screen.getByText(/5 Pass/)).toBeInTheDocument();
    expect(screen.getByText(/2 Fail/)).toBeInTheDocument();
    expect(screen.getByText(/3 Pending/)).toBeInTheDocument();
  });

  it('renders "Unassigned" when no name is provided', () => {
    renderRow({ passed: 0, failed: 0, pending: 0, total: 0 });
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });

  it('renders three coloured segments when total > 0', () => {
    renderRow({ name: 'x', passed: 6, failed: 2, pending: 2, total: 10 });
    expect(screen.getByTestId('progress-segment-pass')).toBeInTheDocument();
    expect(screen.getByTestId('progress-segment-fail')).toBeInTheDocument();
    expect(screen.getByTestId('progress-segment-pending')).toBeInTheDocument();
  });

  it('renders nothing when total is 0', () => {
    const { container } = renderRow({
      name: 'x',
      passed: 0,
      failed: 0,
      pending: 0,
      total: 0,
    });
    expect(
      container.querySelector('[data-testid="progress-bar"]'),
    ).not.toBeInTheDocument();
  });

  it('does not crash when total is 0', () => {
    expect(() =>
      renderRow({ name: 'x', passed: 0, failed: 0, pending: 0, total: 0 }),
    ).not.toThrow();
  });
});
