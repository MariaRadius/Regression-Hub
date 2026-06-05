import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PRIORITIES } from '@/lib/constants';
import DashboardInsightsPanels from '../DashboardInsightsPanels';

describe('DashboardInsightsPanels', () => {
  it('renders failed high-priority test ids as links with module and application context', () => {
    render(
      <DashboardInsightsPanels
        topFailingModules={[
          { id: 'm1', name: 'Billing', failed: 12, total: 20 },
          { id: 'm2', name: 'Assessment Engine', failed: 8, total: 18 },
        ]}
        criticalSummary={{ total: 15, passed: 4, failed: 8, pending: 3 }}
        criticalFailures={[
          {
            testKey: 'SAP-0454',
            priority: PRIORITIES.HIGH,
            failed: 1,
            moduleName: 'Banner Management',
            applicationName: 'Super Admin',
          },
          {
            testKey: 'PPO-0399',
            priority: PRIORITIES.HIGH,
            failed: 1,
            moduleName: 'Patients Management',
            applicationName: 'Practice Admin',
          },
        ]}
      />,
    );

    expect(screen.getByText('Top Failing Modules')).toBeInTheDocument();
    expect(screen.getByText('Critical Failures')).toBeInTheDocument();
    expect(screen.getByText('Billing')).toBeInTheDocument();
    expect(screen.getByText('12 failed')).toBeInTheDocument();
    expect(screen.getByText('Failed 8')).toBeInTheDocument();
    const caseLink = screen.getByRole('link', { name: 'SAP-0454' });
    expect(caseLink).toHaveAttribute(
      'href',
      '/test-cases?testKey=SAP-0454&status=Fail',
    );
    expect(screen.getByRole('link', { name: 'PPO-0399' })).toHaveAttribute(
      'href',
      '/test-cases?testKey=PPO-0399&status=Fail',
    );
    expect(screen.getAllByText('High priority')).toHaveLength(2);
    expect(
      screen.getByText('Super Admin / Banner Management'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Practice Admin / Patients Management'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/passed/i)).toBeNull();
    expect(screen.queryByText(/pending/i)).toBeNull();
    expect(screen.queryByText(/failed case/i)).toBeNull();
  });

  it('shows intentional empty states when no failure data exists', () => {
    render(
      <DashboardInsightsPanels
        topFailingModules={[]}
        criticalSummary={{ total: 0, passed: 0, failed: 0, pending: 0 }}
        criticalFailures={[]}
      />,
    );

    expect(
      screen.getByText('No modules have more than 5 failed test cases.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'No high-priority cases need attention for this selection.',
      ),
    ).toBeInTheDocument();
  });

  it('renders on the server without switching to client-only behavior', () => {
    const html = renderToString(
      <DashboardInsightsPanels
        topFailingModules={[]}
        criticalSummary={{ failed: 0 }}
        criticalFailures={[]}
      />,
    );

    expect(html).toContain('Critical Failures');
    expect(html).toContain('Top Failing Modules');
  });

  it('tolerates missing dashboard arrays without crashing', () => {
    render(<DashboardInsightsPanels criticalSummary={{ failed: 0 }} />);

    expect(screen.getByText('Critical Failures')).toBeInTheDocument();
    expect(
      screen.getByText('No modules have more than 5 failed test cases.'),
    ).toBeInTheDocument();
  });
});
