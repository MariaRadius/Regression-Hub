'use client';

import { Alert, Button, Skeleton, Stack } from '@mui/material';
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
import { useReleaseEnv } from '@/contexts/ReleaseEnvContext';
import { useTestCaseFilters } from '@/hooks/useTestCaseFilters';
import { useTestCaseKeyNav } from '@/hooks/useTestCaseKeyNav';
import {
  DEFAULT_PAGE,
  useTestCasePagination,
} from '@/hooks/useTestCasePagination';
import { useTestCaseSelection } from '@/hooks/useTestCaseSelection';
import {
  getTestCaseForRelease,
  listTestCasesForRelease,
} from '@/lib/api/releases';
import BulkModalRenderer from './master-detail/bulk/BulkModalRenderer';
import FilterStrip from './master-detail/FilterStrip';
import TestCaseDetailPanel from './master-detail/TestCaseDetailPanel';
import TestCaseDialog from './master-detail/TestCaseDialog';
import TestCaseList from './master-detail/TestCaseList';

function TestCasesPage({ user }) {
  const { releaseId, environment, environments, activeRelease } =
    useReleaseEnv();
  const isArchived = !!activeRelease?.archived;

  const [cases, setCases] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [applications, setApplications] = useState([]);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);

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
  // may fall out of the current filter. activeCase keeps the drawer populated and
  // supplies the selection object to BulkModalRenderer for single-case actions without
  // needing to re-scan `cases`. It is updated from `cases` whenever the server confirms
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

  const appsModsLoaded = useRef(false);

  /**
   * Fetches whenever release, environment, filters, or pagination changes.
   * Passes rid/env as arguments rather than capturing in closure to avoid
   * stale-closure issues when context changes trigger concurrent re-fetches.
   * @see app/(app)/test-cases/__tests__/TestCasesClient.test.jsx
   */
  const fetchPage = useCallback(async ({ active, page, size, rid, env }) => {
    if (!rid || !env) return;
    setLoading(true);
    try {
      const query = {
        ...active,
        environment: env,
        page,
        limit: size,
        includeMeta: !appsModsLoaded.current || undefined,
      };
      const data = await listTestCasesForRelease(rid, query);
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

  const prevFiltersRef = useRef(filters.active);
  const prevContextRef = useRef({ releaseId, environment });

  // Reset to page 1 and reload app/module lists when release/environment changes
  useEffect(() => {
    const ctx = prevContextRef.current;
    if (ctx.releaseId !== releaseId || ctx.environment !== environment) {
      prevContextRef.current = { releaseId, environment };
      appsModsLoaded.current = false;
      pagination.setPage(DEFAULT_PAGE);
    }
  }, [releaseId, environment, pagination]);

  // Reset to page 1 when filters change
  useEffect(() => {
    if (prevFiltersRef.current !== filters.active) {
      pagination.setPage(1);
      prevFiltersRef.current = filters.active;
    }
  }, [filters.active, pagination]);

  useEffect(() => {
    fetchPage({
      active: filters.active,
      page: pagination.page,
      size: pagination.size,
      rid: releaseId,
      env: environment,
    });
  }, [
    fetchPage,
    filters.active,
    pagination.page,
    pagination.size,
    releaseId,
    environment,
  ]);

  return (
    <Stack sx={{ height: '100%', minHeight: 0 }}>
      <ToastProvider />

      {/* Archived release — read-only banner */}
      {isArchived && (
        <Alert severity='warning' sx={{ borderRadius: 0, flexShrink: 0 }}>
          This release is archived. Results and definitions are read-only.
        </Alert>
      )}

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
          !isArchived && (
            <Button
              variant='contained'
              size='small'
              onClick={() => setShowAddModal(true)}
            >
              + Add Test Case
            </Button>
          )
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
        releaseId={releaseId}
        environments={environments}
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
        releaseId={releaseId}
        environment={environment}
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
          if (activeId && releaseId) {
            getTestCaseForRelease(releaseId, activeId)
              .then(setActiveCase)
              .catch(() => {});
          }
          fetchPage({
            active: filters.active,
            page: pagination.page,
            size: pagination.size,
            rid: releaseId,
            env: environment,
          });
        }}
      />

      {!isArchived && (
        <TestCaseDialog
          key='add'
          open={showAddModal}
          releaseId={releaseId}
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
              rid: releaseId,
              env: environment,
            });
          }}
        />
      )}

      {!isArchived && editTc && (
        <TestCaseDialog
          key={editTc._id}
          tc={editTc}
          user={user}
          releaseId={releaseId}
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
      )}
    </Stack>
  );
}

export default function TestCasesClient({ user }) {
  return (
    <Suspense>
      <TestCasesPage user={user} />
    </Suspense>
  );
}
