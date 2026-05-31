'use client';
import { Box, CircularProgress, Fade, Skeleton, Stack } from '@mui/material';
import EmptyState from '@/components/EmptyState';
import TestCaseListHeader from './TestCaseListHeader';
import TestCaseListItem from './TestCaseListItem';
import TestCasePagination from './TestCasePagination';

/**
 * Master list panel: header (search/bulk toolbar) + scrollable item list + pagination footer.
 *
 * @see hooks/useTestCaseSelection.js
 */
export default function TestCaseList({
  cases,
  loading,
  totalCount,
  activeId,
  onSelectActive,
  selection,
  search,
  onSearchChange,
  onAction,
  page,
  size,
  sizeOptions,
  onPage,
  onSize,
}) {
  return (
    <Stack sx={{ height: '100%', borderRight: 1, borderColor: 'divider' }}>
      <TestCaseListHeader
        selectedCount={selection.selected.size}
        allOnPage={selection.allOnPage}
        someOnPage={selection.someOnPage}
        search={search}
        onSearchChange={onSearchChange}
        onToggleAll={selection.toggleAll}
        onAction={onAction}
      />
      <Box sx={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
        {/* First-ever load with no rows yet → skeletons */}
        {loading && cases.length === 0 ? (
          <Stack spacing={1} sx={{ p: 1 }}>
            {['sk0', 'sk1', 'sk2', 'sk3', 'sk4', 'sk5', 'sk6', 'sk7'].map(
              (k) => (
                <Skeleton key={k} variant='rectangular' height={52} />
              ),
            )}
          </Stack>
        ) : cases.length === 0 ? (
          <EmptyState title='No test cases match these filters' />
        ) : (
          <Box
            sx={{
              opacity: loading ? 0.4 : 1,
              pointerEvents: loading ? 'none' : 'auto',
              transition: 'opacity 200ms',
            }}
          >
            {cases.map((tc) => (
              <TestCaseListItem
                key={tc._id}
                tc={tc}
                selected={selection.selected.has(tc._id)}
                active={activeId === tc._id}
                onToggle={() => selection.toggleOne(tc._id)}
                onClick={() => onSelectActive(tc._id)}
              />
            ))}
          </Box>
        )}

        {/* Re-fetch overlay: spinner centered over dimmed rows */}
        <Fade in={loading && cases.length > 0}>
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <CircularProgress size={36} thickness={3} />
          </Box>
        </Fade>
      </Box>
      <TestCasePagination
        page={page}
        size={size}
        totalCount={totalCount}
        onPage={onPage}
        onSize={onSize}
        sizeOptions={sizeOptions}
      />
    </Stack>
  );
}
