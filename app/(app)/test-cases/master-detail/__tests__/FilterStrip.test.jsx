import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UNASSIGNED_SENTINEL } from '@/lib/constants';
import FilterStrip from '../FilterStrip';

vi.mock('@/hooks/useSharedData', () => ({
  useQaUserList: () => ({
    data: ['Maria', 'Ammad'],
  }),
}));

vi.mock('../AddFilterPopover', () => ({
  default: ({ getOptions }) => {
    const assigneeOptions = getOptions({
      key: 'assignedTo',
      optionsSource: 'qaUsers',
    });
    const testedByOptions = getOptions({
      key: 'testedBy',
      optionsSource: 'qaUsers',
    });

    return (
      <div>
        <div data-testid='assignee-options'>
          {JSON.stringify(assigneeOptions)}
        </div>
        <div data-testid='tested-by-options'>
          {JSON.stringify(testedByOptions)}
        </div>
      </div>
    );
  },
}));

const filters = {
  active: {},
  setFilter: vi.fn(),
  removeFilter: vi.fn(),
  clearAll: vi.fn(),
  valuesOf: () => [],
  toggleValue: vi.fn(),
};

describe('FilterStrip', () => {
  it('includes Unassigned in assignee options only', () => {
    render(
      <FilterStrip
        filters={filters}
        user={{ name: 'Maria' }}
        applications={[]}
        modules={[]}
        counts={{ all: 2 }}
      />,
    );

    expect(screen.getByTestId('assignee-options').textContent).toContain(
      `"value":"${UNASSIGNED_SENTINEL}","label":"Unassigned"`,
    );
    expect(screen.getByTestId('assignee-options').textContent).toContain(
      `"value":"Maria","label":"Maria"`,
    );
    expect(screen.getByTestId('tested-by-options').textContent).not.toContain(
      UNASSIGNED_SENTINEL,
    );
  });
});
