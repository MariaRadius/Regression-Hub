/**
 * Tests the mount-fetch guard in TestCasesClient: when initialData is supplied
 * the component must NOT call listTestCases on mount, and must call it after a
 * filter or pagination state change.
 *
 * @see app/(app)/test-cases/TestCasesClient.jsx
 */
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock next/navigation — hooks read searchParams and router on every render.
// ---------------------------------------------------------------------------
const mockRouterReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/test-cases',
  useRouter: () => ({ replace: mockRouterReplace }),
}));

// ---------------------------------------------------------------------------
// Mock the filter and pagination hooks so tests can control their state.
// ---------------------------------------------------------------------------
import * as filtersModule from '@/hooks/useTestCaseFilters';
import * as paginationModule from '@/hooks/useTestCasePagination';

const mockSetFilter = vi.fn();
const mockSetActive = vi.fn();
const mockRemoveFilter = vi.fn();
const mockClearAll = vi.fn();
const mockSetPage = vi.fn();
const mockSetSize = vi.fn();

let currentFiltersActive = {};
let currentPage = 1;
let currentSize = 50;

vi.mock('@/hooks/useTestCaseFilters', () => ({
  useTestCaseFilters: vi.fn(),
}));
vi.mock('@/hooks/useTestCasePagination', () => ({
  useTestCasePagination: vi.fn(),
  DEFAULT_PAGE: 1,
  DEFAULT_SIZE: 50,
}));

// ---------------------------------------------------------------------------
// Mock heavy child components so the test only cares about data-fetching.
// Capture the loading prop from TestCaseList to assert loading state.
// ---------------------------------------------------------------------------
let lastTestCaseListProps = {};

vi.mock('@/components/PageHeader', () => ({
  default: ({ title }) => <div data-testid='page-header'>{title}</div>,
}));
vi.mock('@/components/Toast', () => ({ default: () => null }));
vi.mock('../master-detail/FilterStrip', () => ({
  default: () => <div data-testid='filter-strip' />,
}));
vi.mock('../master-detail/TestCaseList', () => ({
  default: (props) => {
    lastTestCaseListProps = props;
    return <div data-testid='test-case-list' />;
  },
}));
vi.mock('../master-detail/TestCaseDetailPanel', () => ({
  default: () => null,
}));
vi.mock('../master-detail/TestCaseDialog', () => ({
  default: () => null,
}));
vi.mock('../master-detail/bulk/BulkModalRenderer', () => ({
  default: () => null,
}));

// ---------------------------------------------------------------------------
// Mock the API client — this is what we assert on.
// ---------------------------------------------------------------------------
import { listTestCases } from '@/lib/api/testCases';

vi.mock('@/lib/api/testCases', () => ({
  listTestCases: vi.fn(),
  getTestCase: vi.fn(),
}));

import TestCasesClient from '../TestCasesClient';

const makeInitialData = () => ({
  data: [{ _id: 'tc1', testCase: 'Login' }],
  total: 1,
  applications: ['App A'],
  modules: ['Auth'],
});

const setupHookMocks = () => {
  filtersModule.useTestCaseFilters.mockImplementation(() => ({
    active: currentFiltersActive,
    setActive: mockSetActive,
    setFilter: mockSetFilter,
    removeFilter: mockRemoveFilter,
    clearAll: mockClearAll,
    valuesOf: () => [],
    toggleValue: vi.fn(),
  }));
  paginationModule.useTestCasePagination.mockImplementation(() => ({
    page: currentPage,
    size: currentSize,
    setPage: mockSetPage,
    setSize: mockSetSize,
    PAGE_SIZE_OPTIONS: [10, 50, 100],
  }));
};

describe('TestCasesClient — mount-fetch guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastTestCaseListProps = {};
    currentFiltersActive = {};
    currentPage = 1;
    currentSize = 50;
    setupHookMocks();
    listTestCases.mockResolvedValue({
      data: [],
      total: 0,
      applications: [],
      modules: [],
    });
  });

  it('does NOT call listTestCases on mount when initialData is provided', async () => {
    await act(async () => {
      render(
        <TestCasesClient
          user={{ name: 'Tester', role: 'tester' }}
          initialData={makeInitialData()}
        />,
      );
    });

    expect(listTestCases).not.toHaveBeenCalled();
  });

  it('keeps loading=false (no skeleton flash) when initialData is provided and first fetch is skipped', async () => {
    await act(async () => {
      render(
        <TestCasesClient
          user={{ name: 'Tester', role: 'tester' }}
          initialData={makeInitialData()}
        />,
      );
    });

    // loading=false is evidenced by TestCaseList receiving loading=false.
    expect(lastTestCaseListProps.loading).toBe(false);
  });

  it('DOES call listTestCases on mount when initialData is absent', async () => {
    await act(async () => {
      render(<TestCasesClient user={{ name: 'Tester', role: 'tester' }} />);
    });

    expect(listTestCases).toHaveBeenCalledTimes(1);
  });

  it('DOES call listTestCases on mount when initialData is present but filters are non-default (deep link, e.g. ?status=pass)', async () => {
    // SSR only fetches the default unfiltered view, so a deep link with active
    // filters must trigger a corrective fetch on mount — not be skipped.
    currentFiltersActive = { status: 'pass' };
    setupHookMocks();

    await act(async () => {
      render(
        <TestCasesClient
          user={{ name: 'Tester', role: 'tester' }}
          initialData={makeInitialData()}
        />,
      );
    });

    expect(listTestCases).toHaveBeenCalledTimes(1);
    expect(listTestCases).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pass', page: 1, limit: 50 }),
    );
  });

  it('DOES call listTestCases on mount when initialData is present but pagination is non-default (deep link, e.g. ?page=2)', async () => {
    currentPage = 2;
    setupHookMocks();

    await act(async () => {
      render(
        <TestCasesClient
          user={{ name: 'Tester', role: 'tester' }}
          initialData={makeInitialData()}
        />,
      );
    });

    expect(listTestCases).toHaveBeenCalledTimes(1);
    expect(listTestCases).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, limit: 50 }),
    );
  });

  it('DOES call listTestCases after a filter change following the skipped initial fetch', async () => {
    const { rerender } = await act(async () =>
      render(
        <TestCasesClient
          user={{ name: 'Tester', role: 'tester' }}
          initialData={makeInitialData()}
        />,
      ),
    );

    // Confirm mount did not trigger a fetch.
    expect(listTestCases).not.toHaveBeenCalled();

    // Simulate a filter change — update the mock hook return value and rerender.
    currentFiltersActive = { status: 'pass' };
    setupHookMocks();

    await act(async () => {
      rerender(
        <TestCasesClient
          user={{ name: 'Tester', role: 'tester' }}
          initialData={makeInitialData()}
        />,
      );
    });

    expect(listTestCases).toHaveBeenCalledTimes(1);
    expect(listTestCases).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pass', page: 1, limit: 50 }),
    );
  });

  it('DOES call listTestCases after a page change following the skipped initial fetch', async () => {
    const { rerender } = await act(async () =>
      render(
        <TestCasesClient
          user={{ name: 'Tester', role: 'tester' }}
          initialData={makeInitialData()}
        />,
      ),
    );

    // Confirm mount did not trigger a fetch.
    expect(listTestCases).not.toHaveBeenCalled();

    // Simulate a pagination change.
    currentPage = 2;
    setupHookMocks();

    await act(async () => {
      rerender(
        <TestCasesClient
          user={{ name: 'Tester', role: 'tester' }}
          initialData={makeInitialData()}
        />,
      );
    });

    expect(listTestCases).toHaveBeenCalledTimes(1);
    expect(listTestCases).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, limit: 50 }),
    );
  });

  it('DOES call listTestCases after a page-size change following the skipped initial fetch', async () => {
    const { rerender } = await act(async () =>
      render(
        <TestCasesClient
          user={{ name: 'Tester', role: 'tester' }}
          initialData={makeInitialData()}
        />,
      ),
    );

    // Confirm mount did not trigger a fetch.
    expect(listTestCases).not.toHaveBeenCalled();

    // Simulate a page-size change.
    currentSize = 100;
    setupHookMocks();

    await act(async () => {
      rerender(
        <TestCasesClient
          user={{ name: 'Tester', role: 'tester' }}
          initialData={makeInitialData()}
        />,
      );
    });

    expect(listTestCases).toHaveBeenCalledTimes(1);
    expect(listTestCases).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 100 }),
    );
  });

  it('sets loading=false and stays mounted when listTestCases rejects after a state change', async () => {
    listTestCases.mockRejectedValue(new Error('500'));

    const { rerender } = await act(async () =>
      render(
        <TestCasesClient
          user={{ name: 'Tester', role: 'tester' }}
          initialData={makeInitialData()}
        />,
      ),
    );

    // Trigger a real fetch by changing the page.
    currentPage = 2;
    setupHookMocks();

    await act(async () => {
      rerender(
        <TestCasesClient
          user={{ name: 'Tester', role: 'tester' }}
          initialData={makeInitialData()}
        />,
      );
    });

    // (a) loading must be false after the rejection (finally block runs).
    expect(lastTestCaseListProps.loading).toBe(false);
    // (b) component is still mounted — list is still rendered.
    expect(screen.getByTestId('test-case-list')).toBeTruthy();
  });
});
