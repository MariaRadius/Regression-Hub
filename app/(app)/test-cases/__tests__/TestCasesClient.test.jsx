/**
 * Tests the fetch behaviour in TestCasesClient: the component must call
 * listTestCasesForRelease on mount (context-driven, no SSR seed) and re-fetch
 * on filter or pagination state changes. Page resets to 1 when context changes.
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
// Mock ReleaseEnvContext — controls the active (release, environment) pair.
// ---------------------------------------------------------------------------
import * as releaseEnvModule from '@/contexts/ReleaseEnvContext';

let currentReleaseId = 'rel-1';
let currentEnvironment = 'QA';
let currentActiveRelease = {
  _id: 'rel-1',
  name: 'v1.0',
  environments: ['QA'],
  archived: false,
};

vi.mock('@/contexts/ReleaseEnvContext', () => ({
  useReleaseEnv: vi.fn(),
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
vi.mock('@/components/Toast', () => ({
  default: () => null,
  showToast: vi.fn(),
}));
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
import { listTestCasesForRelease } from '@/lib/api/releases';

vi.mock('@/lib/api/releases', () => ({
  listTestCasesForRelease: vi.fn(),
  getTestCaseForRelease: vi.fn(),
}));

import TestCasesClient from '../TestCasesClient';

const setupHookMocks = () => {
  releaseEnvModule.useReleaseEnv.mockImplementation(() => ({
    releaseId: currentReleaseId,
    environment: currentEnvironment,
    activeRelease: currentActiveRelease,
  }));
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

describe('TestCasesClient — fetch behaviour', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastTestCaseListProps = {};
    currentFiltersActive = {};
    currentPage = 1;
    currentSize = 50;
    currentReleaseId = 'rel-1';
    currentEnvironment = 'QA';
    currentActiveRelease = {
      _id: 'rel-1',
      name: 'v1.0',
      environments: ['QA'],
      archived: false,
    };
    setupHookMocks();
    listTestCasesForRelease.mockResolvedValue({
      data: [],
      total: 0,
      applications: [],
      modules: [],
    });
  });

  it('calls listTestCasesForRelease on mount with current context', async () => {
    await act(async () => {
      render(<TestCasesClient user={{ name: 'Tester', role: 'qa' }} />);
    });

    expect(listTestCasesForRelease).toHaveBeenCalledTimes(1);
    expect(listTestCasesForRelease).toHaveBeenCalledWith(
      'rel-1',
      expect.objectContaining({ environment: 'QA', page: 1, limit: 50 }),
    );
  });

  it('does NOT call listTestCasesForRelease when releaseId is absent', async () => {
    currentReleaseId = null;
    currentEnvironment = null;
    currentActiveRelease = null;
    setupHookMocks();

    await act(async () => {
      render(<TestCasesClient user={{ name: 'Tester', role: 'qa' }} />);
    });

    expect(listTestCasesForRelease).not.toHaveBeenCalled();
  });

  it('sets loading=false after fetch resolves', async () => {
    await act(async () => {
      render(<TestCasesClient user={{ name: 'Tester', role: 'qa' }} />);
    });

    expect(lastTestCaseListProps.loading).toBe(false);
  });

  it('re-fetches after a filter change', async () => {
    const { rerender } = await act(async () =>
      render(<TestCasesClient user={{ name: 'Tester', role: 'qa' }} />),
    );

    expect(listTestCasesForRelease).toHaveBeenCalledTimes(1);

    currentFiltersActive = { status: 'Pass' };
    setupHookMocks();

    await act(async () => {
      rerender(<TestCasesClient user={{ name: 'Tester', role: 'qa' }} />);
    });

    expect(listTestCasesForRelease).toHaveBeenCalledTimes(2);
    expect(listTestCasesForRelease).toHaveBeenLastCalledWith(
      'rel-1',
      expect.objectContaining({
        status: 'Pass',
        environment: 'QA',
        page: 1,
        limit: 50,
      }),
    );
  });

  it('re-fetches after a page change', async () => {
    const { rerender } = await act(async () =>
      render(<TestCasesClient user={{ name: 'Tester', role: 'qa' }} />),
    );

    expect(listTestCasesForRelease).toHaveBeenCalledTimes(1);

    currentPage = 2;
    setupHookMocks();

    await act(async () => {
      rerender(<TestCasesClient user={{ name: 'Tester', role: 'qa' }} />);
    });

    expect(listTestCasesForRelease).toHaveBeenCalledTimes(2);
    expect(listTestCasesForRelease).toHaveBeenLastCalledWith(
      'rel-1',
      expect.objectContaining({ page: 2, limit: 50 }),
    );
  });

  it('re-fetches after search changes with the query term', async () => {
    const { rerender } = await act(async () =>
      render(<TestCasesClient user={{ name: 'Tester', role: 'qa' }} />),
    );

    expect(listTestCasesForRelease).toHaveBeenCalledTimes(1);

    await act(async () => {
      lastTestCaseListProps.onSearchChange('maria');
    });

    await act(async () => {
      rerender(<TestCasesClient user={{ name: 'Tester', role: 'qa' }} />);
    });

    expect(listTestCasesForRelease).toHaveBeenCalledTimes(2);
    expect(listTestCasesForRelease).toHaveBeenLastCalledWith(
      'rel-1',
      expect.objectContaining({
        q: 'maria',
        environment: 'QA',
        page: 1,
        limit: 50,
      }),
    );
    expect(mockSetPage).toHaveBeenCalledWith(1);
  });

  it('re-fetches after sort changes with sort params', async () => {
    const { rerender } = await act(async () =>
      render(<TestCasesClient user={{ name: 'Tester', role: 'qa' }} />),
    );

    expect(listTestCasesForRelease).toHaveBeenCalledTimes(1);

    await act(async () => {
      lastTestCaseListProps.onSortChange({
        sortBy: 'testCase',
        sortDir: 'desc',
      });
    });

    await act(async () => {
      rerender(<TestCasesClient user={{ name: 'Tester', role: 'qa' }} />);
    });

    expect(listTestCasesForRelease).toHaveBeenCalledTimes(2);
    expect(listTestCasesForRelease).toHaveBeenLastCalledWith(
      'rel-1',
      expect.objectContaining({
        sortBy: 'testCase',
        sortDir: 'desc',
        environment: 'QA',
        page: 1,
        limit: 50,
      }),
    );
    expect(mockSetPage).toHaveBeenCalledWith(1);
  });

  it('resets to page 1 when release context changes', async () => {
    const { rerender } = await act(async () =>
      render(<TestCasesClient user={{ name: 'Tester', role: 'qa' }} />),
    );

    currentReleaseId = 'rel-2';
    currentEnvironment = 'Sandbox';
    currentActiveRelease = {
      _id: 'rel-2',
      name: 'v2.0',
      environments: ['QA', 'Sandbox'],
      archived: false,
    };
    setupHookMocks();

    await act(async () => {
      rerender(<TestCasesClient user={{ name: 'Tester', role: 'qa' }} />);
    });

    expect(mockSetPage).toHaveBeenCalledWith(1);
  });

  it('sets loading=false and stays mounted when listTestCasesForRelease rejects', async () => {
    listTestCasesForRelease.mockRejectedValue(new Error('500'));

    await act(async () => {
      render(<TestCasesClient user={{ name: 'Tester', role: 'qa' }} />);
    });

    expect(lastTestCaseListProps.loading).toBe(false);
    expect(screen.getByTestId('test-case-list')).toBeTruthy();
  });
});
