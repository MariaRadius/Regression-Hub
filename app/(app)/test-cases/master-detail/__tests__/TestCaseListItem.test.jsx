import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PRIORITIES, STATUS } from '@/lib/constants';
import TestCaseListItem from '../TestCaseListItem';

const baseCase = {
  _id: 'tc-1',
  testKey: 'PPO-0251',
  testCase:
    'Access the practice users section as a practice admin and check if a filtering functionality is available.',
  applicationName: 'Practice Admin',
  moduleName: 'User Management',
  priority: PRIORITIES.MEDIUM,
  status: STATUS.PASS,
  assignedTo: 'Maria',
  testedBy: 'Areeba',
};

describe('TestCaseListItem', () => {
  it('renders metadata as distinct labeled tags', () => {
    render(
      <TestCaseListItem
        tc={baseCase}
        selected={false}
        active={false}
        onToggle={vi.fn()}
        onClick={vi.fn()}
      />,
    );

    expect(
      screen.getByText('Practice Admin / User Management'),
    ).toBeInTheDocument();
    expect(screen.getByText('Assigned: Maria')).toBeInTheDocument();
    expect(screen.getByText('Tested by: Areeba')).toBeInTheDocument();
  });

  it('highlights an unassigned row with a clear label', () => {
    render(
      <TestCaseListItem
        tc={{ ...baseCase, assignedTo: '', testedBy: '' }}
        selected={false}
        active={false}
        onToggle={vi.fn()}
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByText('Unassigned')).toBeInTheDocument();
    expect(screen.queryByText(/Assigned:/)).not.toBeInTheDocument();
  });

  it('uses sentence case labels instead of all caps', () => {
    render(
      <TestCaseListItem
        tc={{
          ...baseCase,
          applicationName: 'PRACTICE ADMIN',
          moduleName: 'USER MANAGEMENT',
          assignedTo: 'MARIA',
          testedBy: 'AREEBA',
        }}
        selected={false}
        active={false}
        onToggle={vi.fn()}
        onClick={vi.fn()}
      />,
    );

    expect(
      screen.getByText('Practice Admin / User Management'),
    ).toBeInTheDocument();
    expect(screen.getByText('Assigned: Maria')).toBeInTheDocument();
    expect(screen.getByText('Tested by: Areeba')).toBeInTheDocument();
    expect(
      screen.queryByText('PRACTICE ADMIN / USER MANAGEMENT'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('ASSIGNED: MARIA')).not.toBeInTheDocument();
  });
});
