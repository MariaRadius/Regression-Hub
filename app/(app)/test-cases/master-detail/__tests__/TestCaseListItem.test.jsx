import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TestCaseListItem from '../TestCaseListItem';

const baseCase = {
  _id: 'tc1',
  testCaseId: '6a1d3e4992a197b2bf979010',
  testCase: 'Activate a new subscription.',
  applicationName: 'RadiusExam',
  moduleName: 'RadiusConnect',
  assignedTo: '',
  testedBy: 'Maria',
  priority: 'High',
  status: 'Pass',
};

describe('TestCaseListItem', () => {
  it('renders metadata as readable labeled fields', () => {
    render(
      <TestCaseListItem
        tc={baseCase}
        selected={false}
        active={false}
        onToggle={vi.fn()}
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Application and module')).toHaveTextContent(
      'RadiusExam / RadiusConnect',
    );
    expect(screen.getByLabelText('Assignee')).toHaveTextContent('Unassigned');
    expect(screen.getByLabelText('Tester')).toHaveTextContent('Maria');
    expect(
      screen.getByLabelText('Application and module'),
    ).not.toHaveTextContent('Application and module:');
    expect(screen.getByLabelText('Assignee')).not.toHaveTextContent(
      'Assignee:',
    );
    expect(screen.getByLabelText('Tester')).not.toHaveTextContent('Tester:');
  });
});
