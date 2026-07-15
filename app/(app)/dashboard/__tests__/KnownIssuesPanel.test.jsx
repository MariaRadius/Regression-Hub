import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import KnownIssuesPanel from '../KnownIssuesPanel';

const DATA = {
  releaseId: 'r1',
  releaseName: '2.12',
  environments: ['Prod', 'QA'],
  total: 3,
  cells: {
    QA: {
      count: 2,
      cases: [
        {
          tcId: 't1',
          testKey: 'SAP-1',
          testCaseName: 'Login',
          jiraKeys: ['RXR-1'],
        },
        { tcId: 't2', testKey: 'SAP-2', testCaseName: 'Logout', jiraKeys: [] },
      ],
    },
    Prod: {
      count: 1,
      cases: [
        {
          tcId: 't3',
          testKey: 'SAP-3',
          testCaseName: 'Reset',
          jiraKeys: ['RXR-3'],
        },
      ],
    },
  },
};

describe('KnownIssuesPanel', () => {
  it('shows a composed empty state when the release has no known issues', () => {
    render(
      <KnownIssuesPanel
        data={{
          releaseId: 'r1',
          releaseName: '2.12',
          environments: ['QA'],
          total: 0,
          cells: { QA: { count: 0, cases: [] } },
        }}
        jiraBaseUrl='https://jira.test'
      />,
    );
    expect(screen.getByText(/no known issues/i)).toBeInTheDocument();
  });

  it('defaults the environment filter to All and shows every environment of the release', () => {
    render(<KnownIssuesPanel data={DATA} jiraBaseUrl='https://jira.test' />);
    // Both env rows visible under the default "All environments" filter.
    expect(screen.getByRole('button', { name: /QA:/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Prod:/i })).toBeInTheDocument();
  });

  it('narrows to a single environment when the filter changes', () => {
    render(<KnownIssuesPanel data={DATA} jiraBaseUrl='https://jira.test' />);

    fireEvent.mouseDown(screen.getByLabelText('Environment'));
    const listbox = within(screen.getByRole('listbox'));
    fireEvent.click(listbox.getByText('QA'));

    expect(screen.getByRole('button', { name: /QA:/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Prod:/i }),
    ).not.toBeInTheDocument();
  });

  it('expands the case list when a non-zero cell is clicked', () => {
    render(<KnownIssuesPanel data={DATA} jiraBaseUrl='https://jira.test' />);
    expect(screen.queryByText('SAP-1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /QA:/i }));

    expect(screen.getByText('SAP-1')).toBeInTheDocument();
    expect(screen.getByText('Login')).toBeInTheDocument();
  });

  it('renders Jira keys as browse links when a base URL is configured', () => {
    render(<KnownIssuesPanel data={DATA} jiraBaseUrl='https://jira.test' />);
    fireEvent.click(screen.getByRole('button', { name: /QA:/i }));

    const link = screen.getByRole('link', { name: 'RXR-1' });
    expect(link).toHaveAttribute('href', 'https://jira.test/browse/RXR-1');
  });

  it('renders Jira keys as plain text when no base URL is configured', () => {
    render(<KnownIssuesPanel data={DATA} jiraBaseUrl={null} />);
    fireEvent.click(screen.getByRole('button', { name: /QA:/i }));

    expect(
      screen.queryByRole('link', { name: 'RXR-1' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('RXR-1')).toBeInTheDocument();
  });
});
