'use client';

import { Button, Skeleton, Stack } from '@mui/material';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import PageHeader from '@/components/PageHeader';
import ToastProvider from '@/components/Toast';
import { useTestCaseFilters } from '@/hooks/useTestCaseFilters';
import { useTestCaseKeyNav } from '@/hooks/useTestCaseKeyNav';
import {
  DEFAULT_PAGE,
  DEFAULT_SIZE,
  useTestCasePagination,
} from '@/hooks/useTestCasePagination';
import { useTestCaseSelection } from '@/hooks/useTestCaseSelection';
import { getTestCase, listTestCases } from '@/lib/api/testCases';
import BulkModalRenderer from './master-detail/bulk/BulkModalRenderer';
import FilterStrip from './master-detail/FilterStrip';
import TestCaseDetailPanel from './master-detail/TestCaseDetailPanel';
import TestCaseDialog from './master-detail/TestCaseDialog';
import TestCaseList from './master-detail/TestCaseList';

function TestCasesPage({ user, initialData }) {
  const [cases, setCases] = useState(initialData?.data ?? []);
  const [totalCount, setTotalCount] = useState(initialData?.total ?? 0);
  const [applications, setApplications] = useState(
    initialData?.applications ?? [],
  );
  const [modules, setModules] = useState(initialData?.modules ?? []);
  const [loading, setLoading] = useState(!initialData);

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);

  // Edit modal
  const [editTc, setEditTc] = useState(null);

  // Master-detail state
  const filters = useTestCaseFilters();
  const pagination = useTestCasePagination();
  const pageIds = useMemo(() => cases.map((c) => c._id), [cases]);
  const selection = useTestCaseSelection(pageIds);
  const [activeId, setActiveId] = useState(null);
  // activeCase holds the currently displayed case independently of the filtered page.
  // The list (`cases`) is a filtered, paginated slice — after a status change the case
  // may fall out of the current filter.  activeCase keeps the drawer populated and
  // supplies the selection object to BulkModalRenderer for single-case actions without
  // needing to re-scan `cases`.  It is updated from `cases` whenever the server confirms
  // the case is still on the page, and optimistically merged in onSuccess.
  const [activeCase, setActiveCase] = useState(null);
  useEffect(() => {
    if (!activeId) {
      setActiveCase(null);
      return;
    }
    const found = cases.find((c) => c._id === activeId);
    if (found) setActiveCase(found);
    // no-op when not found — keeps the last-known state visible in the drawer
  }, [activeId, cases]);

  const [search, setSearch] = useState('');
  const [openModal, setOpenModal] = useState(null); // 'pass'|'fail'|'pending'|'reassign'|'edit'|null
  const [singleActionId, setSingleActionId] = useState(null);
  useTestCaseKeyNav({
    cases,
    activeId,
    setActiveId,
    openModal,
    onAction: (a, id) => {
      setSingleActionId(id);
      setOpenModal(a);
    },
    onEdit: (tc) => setEditTc(tc),
  });

  const handleClose = useCallback(() => setActiveId(null), []);

  useEffect(() => {
    function handleEsc(e) {
      if (e.key === 'Escape' && activeId && !openModal) {
        setActiveId(null);
      }
    }
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [activeId, openModal]);

  const appsModsLoaded = useRef(!!initialData);
  const prevFiltersRef = useRef(filters.active);
  // When initialData is provided by SSR, the first effect invocation would
  // re-fetch the identical default query and discard the hydrated data — but
  // SSR only ever fetches the DEFAULT view (no filters, page 1, default size),
  // while the filter/pagination hooks seed their state from the URL on mount.
  // So the skip is only safe when the client's initial state actually matches
  // what SSR fetched; for a deep link like ?status=pass we MUST fetch on mount.
  // The flag is cleared immediately so every subsequent state change fetches.
  const isDefaultView =
    Object.keys(filters.active).length === 0 &&
    pagination.page === DEFAULT_PAGE &&
    pagination.size === DEFAULT_SIZE;
  const skipInitialFetch = useRef(!!initialData && isDefaultView);

  const fetchPage = useCallback(async ({ active, page, size }) => {
    setLoading(true);
    try {
      const query = { ...active, page, limit: size };
      const data = await listTestCases(query);
      // CRITICAL: the API returns data.data (array), data.total, data.applications, data.modules
      setCases(data.data);
      setTotalCount(data.total);
      if (!appsModsLoaded.current) {
        setApplications(data.applications || []);
        setModules(data.modules || []);
        appsModsLoaded.current = true;
      }
    } catch (e) {
      console.error('fetchPage error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Skips the first fetch when initialData covers the default view, then fetches
   * normally on any subsequent filter/pagination change.
   * @see app/(app)/test-cases/__tests__/TestCasesClient.test.jsx
   */
  useEffect(() => {
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false;
      return;
    }
    fetchPage({
      active: filters.active,
      page: pagination.page,
      size: pagination.size,
    });
  }, [fetchPage, filters.active, pagination.page, pagination.size]);

  // Reset to page 1 when filters change
  useEffect(() => {
    if (prevFiltersRef.current !== filters.active) {
      pagination.setPage(1);
      prevFiltersRef.current = filters.active;
    }
  }, [filters.active, pagination]);

  return (
    <Stack sx={{ height: '100%', minHeight: 0 }}>
      <ToastProvider />

      {/* Header */}
      <PageHeader
        eyebrow='Data Grid'
        title='Test Cases'
        sub={
          loading ? (
            <Skeleton variant='text' width={80} />
          ) : (
            `${totalCount} rows`
          )
        }
        actions={
          <Button
            variant='contained'
            size='small'
            onClick={() => setShowAddModal(true)}
          >
            + Add Test Case
          </Button>
        }
      />

      <FilterStrip
        filters={filters}
        user={user}
        applications={applications}
        modules={modules}
        counts={{ all: totalCount }}
      />

      {/* List — full width on all breakpoints */}
      <Stack sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <TestCaseList
          cases={cases}
          loading={loading}
          totalCount={totalCount}
          activeId={activeId}
          onSelectActive={setActiveId}
          selection={selection}
          search={search}
          onSearchChange={setSearch}
          onAction={(a) => {
            setSingleActionId(null);
            setOpenModal(a);
          }}
          page={pagination.page}
          size={pagination.size}
          sizeOptions={pagination.PAGE_SIZE_OPTIONS}
          onPage={pagination.setPage}
          onSize={pagination.setSize}
        />
      </Stack>

      {/* Detail panel — mobile sheet + desktop overlay */}
      <TestCaseDetailPanel
        open={!!activeId}
        displayCase={activeCase}
        onEdit={(tc) => setEditTc(tc)}
        onAction={(a, id) => {
          setSingleActionId(id);
          setOpenModal(a);
        }}
        onClose={handleClose}
      />

      <BulkModalRenderer
        openModal={openModal}
        cases={cases}
        selectedIds={selection.selected}
        singleActionId={singleActionId}
        singleActionCase={singleActionId ? activeCase : null}
        user={user}
        applications={applications}
        modules={modules}
        onClose={() => {
          setOpenModal(null);
          setSingleActionId(null);
        }}
        onSuccess={() => {
          setOpenModal(null);
          setSingleActionId(null);
          selection.clear();
          if (activeId) {
            getTestCase(activeId)
              .then(setActiveCase)
              .catch(() => {});
          }
          fetchPage({
            active: filters.active,
            page: pagination.page,
            size: pagination.size,
          });
        }}
      />

      <TestCaseDialog
        key='add'
        open={showAddModal}
        applications={applications}
        modules={modules}
        onModuleCreated={(mod) => setModules((prev) => [...prev, mod])}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {
          setShowAddModal(false);
          setTotalCount((n) => n + 1);
          fetchPage({
            active: filters.active,
            page: pagination.page,
            size: pagination.size,
          });
        }}
      />

      <TestCaseDialog
        key={editTc?._id}
        tc={editTc}
        user={user}
        applications={applications}
        modules={modules}
        onModuleCreated={(mod) => setModules((prev) => [...prev, mod])}
        onClose={() => setEditTc(null)}
        onSuccess={(updatedTc) => {
          setEditTc(null);
          setCases((prev) =>
            prev.map((tc) => (tc._id === updatedTc._id ? updatedTc : tc)),
          );
        }}
      />
    </Stack>
  );
}

export default function TestCasesClient({ user, initialData }) {
  return (
    <Suspense>
      <TestCasesPage user={user} initialData={initialData} />
    </Suspense>
  );
}
