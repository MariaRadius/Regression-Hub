'use client';

import { Alert, Button, Skeleton, Stack } from '@mui/material';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import JiraDraftReviewDialog from '@/components/JiraDraftReviewDialog';
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
import { createJiraIssues, improveJiraDraft } from '@/lib/api/jira';
import {
  getTestCaseForRelease,
  listTestCasesForRelease,
} from '@/lib/api/releases';
import { ROLES } from '@/lib/constants';
import { toastJiraOutcome } from '@/utils/toastJiraOutcome';
import BulkAssignModal from './master-detail/bulk/BulkAssignModal';
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

  const isAdmin = user?.role === ROLES.ADMIN;
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [scopeCounts, setScopeCounts] = useState({
    byApplication: {},
    byModule: {},
  });

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);

  // Edit modal
  const [editTc, setEditTc] = useState(null);

  // Master-detail state
  const filters = useTestCaseFilters();
  const pagination = useTestCasePagination();
  const pageIds = useMemo(() => cases.map((c) => c._id), [cases]);
  const selection = useTestCaseSelection(pageIds);
  const searchParams = useSearchParams();
  const router = useRouter();
  const [activeId, setActiveId] = useState(
    () => searchParams.get('open') || null,
  );
  // activeCase holds the currently displayed case independently of the filtered page.
  // The list (`cases`) is a filtered, paginated slice — after a status change the case
  // may fall out of the current filter. activeCase keeps the drawer populated and
  // supplies the selection object to BulkModalRenderer for single-case actions without
  // needing to re-scan `cases`. It is updated from `cases` whenever the server confirms
  // the case is still on the page, and optimistically merged in onSuccess.
  const [activeCase, setActiveCase] = useState(null);
  const [resultsVersion, setResultsVersion] = useState(0);
  useEffect(() => {
    if (!activeId) {
      setActiveCase(null);
      return;
    }
    const found = cases.find((c) => c._id === activeId);
    if (found) setActiveCase(found);
    // no-op when not found — keeps the last-known state visible in the drawer
  }, [activeId, cases]);

  // Strip the `open` param from the URL once it has been applied, so that
  // refreshing the page doesn't re-open a stale case. Reads window.location.search
  // at call-time (not searchParams) so this effect runs only on mount.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only; router is stable
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.get('open')) return;
    params.delete('open');
    const qs = params.toString();
    router.replace(qs ? `/test-cases?${qs}` : '/test-cases', { scroll: false });
  }, []);

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ sortBy: 'createdAt', sortDir: 'asc' });
  // Jira drafts awaiting QA review after a Fail (ask mode); null = dialog closed.
  const [jiraDrafts, setJiraDrafts] = useState(null);
  const [openModal, setOpenModal] = useState(null); // 'pass'|'fail'|'pending'|'known-issue'|'reassign'|'edit'|null
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
  const fetchPage = useCallback(
    async ({ active, page, size, rid, env }) => {
      if (!rid || !env) return;
      setLoading(true);
      try {
        const query = {
          ...active,
          environment: env,
          q: search,
          sortBy: sort.sortBy,
          sortDir: sort.sortDir,
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
    },
    [search, sort.sortBy, sort.sortDir],
  );

  const prevFiltersRef = useRef(filters.active);
  const prevContextRef = useRef({ releaseId, environment });
  const prevSearchRef = useRef(search);
  const prevSortRef = useRef(sort);

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
    if (prevSearchRef.current !== search) {
      pagination.setPage(DEFAULT_PAGE);
      prevSearchRef.current = search;
    }
  }, [pagination, search]);

  useEffect(() => {
    if (
      prevSortRef.current.sortBy !== sort.sortBy ||
      prevSortRef.current.sortDir !== sort.sortDir
    ) {
      pagination.setPage(DEFAULT_PAGE);
      prevSortRef.current = sort;
    }
  }, [pagination, sort]);

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

  useEffect(() => {
    if (!bulkAssignOpen || !releaseId) return;
    setScopeCounts({ byApplication: {}, byModule: {} });
    let active = true;
    fetch(`/api/releases/${releaseId}/scope-counts`)
      .then((r) => (r.ok ? r.json() : { byApplication: {}, byModule: {} }))
      .then((data) => {
        if (active) setScopeCounts(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [bulkAssignOpen, releaseId]);

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
        title='Test Cases'
        sub={
          loading ? (
            <Skeleton variant='text' width={80} />
          ) : (
            `${totalCount.toLocaleString()} test cases`
          )
        }
        actions={
          <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
            {!isArchived && (
              <Button
                variant='contained'
                size='small'
                onClick={() => setShowAddModal(true)}
              >
                + Add Test Case
              </Button>
            )}
          </Stack>
        }
      />

      <FilterStrip
        filters={filters}
        user={user}
        applications={applications}
        modules={modules}
        counts={{ all: totalCount }}
        isAdmin={isAdmin}
        onBulkAssign={() => setBulkAssignOpen(true)}
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
          sortBy={sort.sortBy}
          sortDir={sort.sortDir}
          onSortChange={setSort}
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
        resultsVersion={resultsVersion}
        onEdit={(tc) => setEditTc(tc)}
        onAction={(a, id) => {
          setSingleActionId(id);
          setOpenModal(a);
        }}
        onClose={handleClose}
      />

      {bulkAssignOpen && (
        <BulkAssignModal
          open
          onClose={() => setBulkAssignOpen(false)}
          releaseId={releaseId}
          environment={environment}
          environments={environments}
          applications={applications}
          modules={modules}
          counts={scopeCounts}
          onSuccess={() => {
            setBulkAssignOpen(false);
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
        onSuccess={(_fields, extra) => {
          setOpenModal(null);
          setSingleActionId(null);
          selection.clear();
          if (extra?.jiraDrafts?.length) setJiraDrafts(extra.jiraDrafts);
          if (activeId && releaseId) {
            getTestCaseForRelease(
              releaseId,
              activeId,
              environment ? { environment } : {},
            )
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

      {jiraDrafts && (
        <JiraDraftReviewDialog
          open
          drafts={jiraDrafts}
          onCreate={async (issue) => {
            const outcome = await createJiraIssues(releaseId, {
              environment,
              issues: [issue],
            });
            // The route returns 200 with per-case outcomes; surface a failure
            // for THIS issue as a thrown error so the dialog stays put.
            if (outcome.errors.length) {
              throw new Error(outcome.errors[0].error);
            }
            toastJiraOutcome(outcome);
            setResultsVersion((v) => v + 1);
          }}
          onImprove={({ summary, description }) =>
            improveJiraDraft(releaseId, { summary, description })
          }
          onClose={() => setJiraDrafts(null)}
        />
      )}

      {!isArchived && (
        <TestCaseDialog
          key='add'
          open={showAddModal}
          releaseId={releaseId}
          applications={applications}
          modules={modules}
          onApplicationCreated={(app) =>
            setApplications((prev) => [...prev, app])
          }
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
          onApplicationCreated={(app) =>
            setApplications((prev) => [...prev, app])
          }
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
